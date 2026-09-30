import { describe, expect, it } from 'vitest'
import { parseCompilerOutput, validateCompileRequest } from './compile'

describe('compiler request validation', () => {
  it('maps the only public target to the verified FQBN', () => {
    expect(validateCompileRequest({ target: 'leanbot-standard', source: 'void setup() {}' })).toEqual({
      target: 'leanbot-standard',
      fqbn: 'arduino:avr:uno',
      source: 'void setup() {}',
    })
  })

  it('rejects client-selected boards, paths, and unsupported targets', () => {
    expect(() => validateCompileRequest({ target: 'arduino:avr:nano', source: 'void setup() {}' })).toThrow('Target không được hỗ trợ')
    expect(() => validateCompileRequest({ target: 'leanbot-standard', source: '', board: 'arduino:avr:nano' } as never)).toThrow('Source code trống')
  })
})

describe('Arduino CLI output parser', () => {
  it('returns student-facing diagnostics and memory usage', () => {
    const output = [
      '<build>/LeanbotSketch.ino:12:5: error: expected ; before } token',
      'Sketch uses 1234 bytes (3%) of program storage space.',
      'Global variables use 56 bytes (2%) of dynamic memory.',
    ].join('\n')

    expect(parseCompilerOutput(output)).toEqual({
      errors: [{ file: 'LeanbotSketch.ino', line: 12, column: 5, message: 'expected ; before } token' }],
      flashUsed: 1234,
      ramUsed: 56,
    })
  })

  it('parses diagnostics from the nested sketch path emitted by arduino-cli', () => {
    const output = '[build]\\LeanbotSketch\\LeanbotSketch.ino:1:10: fatal error: Leanbot.h: No such file or directory'

    expect(parseCompilerOutput(output).errors).toEqual([
      { file: 'LeanbotSketch.ino', line: 1, column: 10, message: 'Leanbot.h: No such file or directory' },
    ])
  })
})
