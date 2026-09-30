import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnCompilerAdapter, PythaverseCompilerAdapter } from './compilerClient'

afterEach(() => vi.unstubAllGlobals())

describe('OwnCompilerAdapter', () => {
  it('posts only source and the fixed Leanbot target', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      hex: ':00000001FF\n',
      stdout: 'ok',
      flashUsed: 42,
      ramUsed: 7,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new OwnCompilerAdapter('https://compiler.example.com').compile('void setup() {}')

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('https://compiler.example.com/api/compile', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ source: 'void setup() {}', target: 'leanbot-standard' }),
    }))
  })

  it('returns structured diagnostics from compiler failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: false,
      stdout: 'compile failed',
      errors: [{ line: 12, column: 5, message: "expected ';'" }],
    }), { status: 422, headers: { 'content-type': 'application/json' } })))

    const result = await new OwnCompilerAdapter('/compiler').compile('bad code')

    expect(result).toMatchObject({ success: false, errors: [{ line: 12, column: 5, message: "expected ';'" }] })
  })
})

describe('PythaverseCompilerAdapter', () => {
  it('uses the verified v3 payload and decodes Base64 Intel HEX', async () => {
    const encodedHex = btoa(':00000001FF\n')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ hex: encodedHex, log: 'compiled' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new PythaverseCompilerAdapter('cs.leanbot.space').compile('#include <Leanbot.h>')

    expect(result).toMatchObject({ success: true, hex: ':00000001FF\n', stdout: 'compiled' })
    expect(fetchMock).toHaveBeenCalledWith('https://cs.leanbot.space/v3/compile', expect.objectContaining({
      body: JSON.stringify({
        fqbn: 'arduino:avr:uno',
        files: [{ content: '#include <Leanbot.h>', name: 'LeanbotSketch/LeanbotSketch.ino' }],
        flags: { verbose: false, preferLocal: false },
        libs: [],
      }),
    }))
  })
})
