import { describe, expect, it } from 'vitest'
import { cppToIr } from './cppToIr'
import { irToCpp } from './irToCpp'
import { normalizeProgram } from './ir/normalize'
import { programToWorkspaceState, stateToProgram } from '../blockly/serialization/adapters'

const shell = (body: string) => `#include <Leanbot.h>\nvoid setup() { Leanbot.begin(); }\nvoid loop() {\n${body}\n}`

describe('Leanbot semantic conversion', () => {
  it('folds move and turn patterns and survives C++ round trip', () => {
    const source = shell(`LbMotion.runLR(1000, 1000);\nLbMotion.waitDistanceMm(300);\nLbMotion.stopAndWait();\nLbMotion.runLR(500, -500);\nLbMotion.waitRotationDeg(90);\nLbMotion.stopAndWait();`)
    const first = cppToIr(source)
    expect(first.program.loop).toMatchObject([
      { kind: 'motion', direction: 'forward', motion: 'distance', value: { value: 300 }, speed: { value: 1000 } },
      { kind: 'motion', direction: 'right', motion: 'rotation', value: { value: 90 }, speed: { value: 500 } },
    ])
    const second = cppToIr(irToCpp(first.program))
    expect(normalizeProgram(second.program).loop).toEqual(normalizeProgram(first.program).loop)
  })

  it('recognizes variable edits and sensor if statements', () => {
    const result = cppToIr(`int speed = 1500;\n${shell('if (Leanbot.pingCm() < 20) { LbMotion.stopAndWait(); }')}`)
    expect(result.program.globals[0]).toMatchObject({ kind: 'variableDeclaration', name: 'speed', initializer: { value: 1500 } })
    expect(result.program.loop[0]).toMatchObject({ kind: 'if', condition: { kind: 'comparison', left: { kind: 'sensorRead', sensor: 'ultrasonic' } }, then: [{ kind: 'stop' }] })
  })

  it('preserves unknown valid calls as Raw C++', () => {
    const result = cppToIr(shell('Serial.println("Test");'))
    expect(result.status).toBe('partial')
    expect(result.program.loop[0]).toMatchObject({ kind: 'raw', code: 'Serial.println("Test");' })
    expect(irToCpp(result.program)).toContain('Serial.println("Test");')
  })

  it('keeps malformed input as one locked whole-file raw block', () => {
    const source = 'void loop() { if (true) {'
    const result = cppToIr(source)
    expect(result.status).toBe('unsupported')
    expect(result.program.loop).toEqual([{ kind: 'raw', code: source, scope: 'loop', locked: true }])
  })

  it('serializes native IR through a real Blockly workspace', () => {
    const parsed = cppToIr(shell('if (Leanbot.pingCm() < 20) { LbMotion.stopAndWait(); }'))
    const state = programToWorkspaceState(parsed.program)
    const restored = stateToProgram(state)
    expect(restored.loop[0]).toMatchObject({ kind: 'if', condition: { kind: 'comparison' }, then: [{ kind: 'stop' }] })
  })
})
