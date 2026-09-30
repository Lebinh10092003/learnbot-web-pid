import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CompileError, CompileResult } from '../src/types.js'

export interface CompileRequest { target?: string; source?: string }

export interface ValidCompileRequest {
  target: 'leanbot-standard'
  fqbn: 'arduino:avr:uno'
  source: string
}

const MAX_SOURCE_BYTES = 256_000
const TARGETS = { 'leanbot-standard': 'arduino:avr:uno' } as const
const compileCache = new Map<string, CompileResult>()

export function validateCompileRequest(request: CompileRequest): ValidCompileRequest {
  if (typeof request.source !== 'string' || !request.source.trim()) throw new Error('Source code trống.')
  if (Buffer.byteLength(request.source, 'utf8') > MAX_SOURCE_BYTES) throw new Error('Source code vượt quá giới hạn 256 KB.')
  if (request.target !== 'leanbot-standard') throw new Error('Target không được hỗ trợ.')
  return { target: request.target, fqbn: TARGETS[request.target], source: request.source }
}

export function parseCompilerOutput(stdout: string) {
  const errors: CompileError[] = []
  const diagnosticPattern = /([^\\/:\r\n]+\.(?:ino|h|hpp|c|cpp)):(\d+):(\d+):\s+(?:fatal\s+)?error:\s*([^\r\n]+)/g
  for (const match of stdout.matchAll(diagnosticPattern)) {
    errors.push({ file: match[1], line: Number(match[2]), column: Number(match[3]), message: match[4].trim() })
  }
  const flash = stdout.match(/Sketch uses\s+([\d,]+)\s+bytes/i)
  const ram = stdout.match(/Global variables use\s+([\d,]+)\s+bytes/i)
  return {
    errors,
    flashUsed: flash ? Number(flash[1].replaceAll(',', '')) : undefined,
    ramUsed: ram ? Number(ram[1].replaceAll(',', '')) : undefined,
  }
}

async function findHex(directory: string): Promise<string | null> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findHex(path)
      if (nested) return nested
    } else if (entry.name.endsWith('.hex') && !entry.name.includes('with_bootloader')) return path
  }
  return null
}

function cacheKey(request: ValidCompileRequest) {
  return createHash('sha256').update([
    request.source,
    request.target,
    process.env.LEANBOT_LIBRARY_VERSION || 'unversioned',
    process.env.ARDUINO_CORE_VERSION || 'unversioned',
  ].join('\0')).digest('hex')
}

function remember(key: string, result: CompileResult) {
  if (compileCache.size >= 50) compileCache.delete(compileCache.keys().next().value!)
  compileCache.set(key, result)
}

export async function compileArduino(input: CompileRequest, signal?: AbortSignal): Promise<CompileResult> {
  const request = validateCompileRequest(input)
  const key = cacheKey(request)
  const cached = compileCache.get(key)
  if (cached) return { ...cached }

  const jobId = randomUUID()
  const directory = join(tmpdir(), `leanbot-build-${jobId}`)
  const sketchDirectory = join(directory, 'LeanbotSketch')
  const outputDirectory = join(directory, 'output')
  await mkdir(sketchDirectory, { recursive: true })
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(join(sketchDirectory, 'LeanbotSketch.ino'), request.source, 'utf8')

  const executable = process.env.ARDUINO_CLI || 'arduino-cli'
  const args = ['compile', '--fqbn', request.fqbn, '--output-dir', outputDirectory]
  const libraryPath = process.env.LEANBOT_LIBRARY_PATH
  if (libraryPath) args.push('--libraries', libraryPath)
  args.push(sketchDirectory)
  const timeoutMs = Number(process.env.COMPILE_TIMEOUT_MS || 120_000)

  try {
    const execution = await new Promise<{ code: number; stdout: string }>((resolve, reject) => {
      const child = spawn(executable, args, { windowsHide: true, signal, shell: false })
      let combined = ''
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error(`Compiler quá thời gian ${Math.round(timeoutMs / 1000)} giây.`))
      }, timeoutMs)
      const collect = (chunk: Buffer) => {
        combined += chunk.toString()
        if (combined.length > 1_000_000) combined = combined.slice(-1_000_000)
      }
      child.stdout.on('data', collect)
      child.stderr.on('data', collect)
      child.once('error', (error) => { clearTimeout(timeout); reject(error) })
      child.once('close', (code) => {
        clearTimeout(timeout)
        const sanitized = combined
          .replaceAll(directory, '[build]')
          .replaceAll(directory.replaceAll('\\', '/'), '[build]')
          .replaceAll(libraryPath || '\0', '[libraries]')
        resolve({ code: code ?? 1, stdout: sanitized })
      })
    })
    const parsed = parseCompilerOutput(execution.stdout)
    if (execution.code !== 0) return { success: false, stdout: execution.stdout || 'Arduino CLI biên dịch thất bại.', errors: parsed.errors }
    const hexPath = await findHex(outputDirectory)
    if (!hexPath) return { success: false, stdout: 'Compiler không tạo tệp Intel HEX.', errors: [] }
    const result: CompileResult = {
      success: true,
      hex: await readFile(hexPath, 'utf8'),
      stdout: execution.stdout || 'Biên dịch thành công.',
      flashUsed: parsed.flashUsed,
      ramUsed: parsed.ramUsed,
      errors: [],
    }
    remember(key, result)
    return result
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
