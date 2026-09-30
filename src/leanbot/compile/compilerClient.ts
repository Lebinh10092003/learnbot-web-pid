import type { CompileResult } from '../../types'
import { LEANBOT_PROFILE } from '../profile/leanbotDeviceProfile'

export interface CompileOptions { signal?: AbortSignal }

export interface CompilerAdapter {
  compile(source: string, options?: CompileOptions): Promise<CompileResult>
}

function compilerEndpoint(base: string) {
  const normalized = base.replace(/\/$/, '')
  return normalized.endsWith('/api/compile') ? normalized : `${normalized}/api/compile`
}

function failure(message: string): CompileResult {
  return { success: false, stdout: message, errors: [] }
}

export class OwnCompilerAdapter implements CompilerAdapter {
  constructor(private readonly baseUrl = import.meta.env.VITE_COMPILER_API || '') {}

  async compile(source: string, options: CompileOptions = {}): Promise<CompileResult> {
    const endpoint = this.baseUrl ? compilerEndpoint(this.baseUrl) : '/api/compile'
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source, target: LEANBOT_PROFILE.target }),
        signal: options.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      return failure(error instanceof Error ? error.message : 'Không thể kết nối compiler server.')
    }

    const payload = await response.json().catch(() => null) as CompileResult | null
    if (!payload || typeof payload.success !== 'boolean') return failure(`Compiler trả về HTTP ${response.status} với dữ liệu không hợp lệ.`)
    return {
      success: payload.success && response.ok,
      hex: payload.hex,
      stdout: payload.stdout || (response.ok ? '' : `Compiler trả về HTTP ${response.status}.`),
      flashUsed: payload.flashUsed,
      ramUsed: payload.ramUsed,
      errors: Array.isArray(payload.errors) ? payload.errors : [],
    }
  }
}

type PythaverseResponse = { hex?: string; log?: string }

export class PythaverseCompilerAdapter implements CompilerAdapter {
  constructor(private readonly server = 'cs.leanbot.space') {}

  async compile(source: string, options: CompileOptions = {}): Promise<CompileResult> {
    const payload = {
      fqbn: LEANBOT_PROFILE.fqbn,
      files: [{ content: source, name: 'LeanbotSketch/LeanbotSketch.ino' }],
      flags: { verbose: false, preferLocal: false },
      libs: [],
    }
    const response = await fetch(`https://${this.server}/v3/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: options.signal,
    })
    const result = await response.json().catch(() => ({})) as PythaverseResponse
    if (!response.ok || !result.hex?.trim()) return failure(result.log || `Compiler tham chiếu trả về HTTP ${response.status}.`)
    const bytes = Uint8Array.from(atob(result.hex), (character) => character.charCodeAt(0))
    return { success: true, hex: new TextDecoder().decode(bytes), stdout: result.log ?? '', errors: [] }
  }
}

const defaultCompiler = new OwnCompilerAdapter()

export function compileLeanbot(source: string, options: CompileOptions = {}) {
  return defaultCompiler.compile(source, options)
}
