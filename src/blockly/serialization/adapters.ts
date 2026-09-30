import * as Blockly from 'blockly/core'
import type { Expression, LeanbotProgram, Statement } from '../../transpiler'
import { registerLeanbotBlocks } from '../blocks/leanbotBlocks'

export type BlocklyWorkspaceState = ReturnType<typeof Blockly.serialization.workspaces.save>

const number = (value: number): Expression => ({ kind: 'numberLiteral', value })
const fieldNumber = (block: Blockly.Block, name: string) => number(Number(block.getFieldValue(name) ?? 0))

function statementFromBlock(block: Blockly.Block): Statement | null {
  switch (block.type) {
    case 'leanbot_mission_begin': return { kind: 'missionBegin', button: { kind: 'rawExpression', code: block.getFieldValue('BUTTON') } }
    case 'leanbot_mission_end': return { kind: 'missionEnd' }
    case 'leanbot_move': return { kind: 'motion', motion: 'distance', direction: block.getFieldValue('DIRECTION'), value: fieldNumber(block, 'DISTANCE'), speed: fieldNumber(block, 'SPEED'), unit: 'cm' }
    case 'leanbot_turn': return { kind: 'motion', motion: 'rotation', direction: block.getFieldValue('DIRECTION'), value: fieldNumber(block, 'ANGLE'), speed: fieldNumber(block, 'SPEED'), unit: 'deg' }
    case 'leanbot_wheels': return { kind: 'wheels', left: fieldNumber(block, 'LEFT'), right: fieldNumber(block, 'RIGHT'), mode: 'pwm' }
    case 'leanbot_stop': return { kind: 'stop' }
    case 'leanbot_led': return { kind: 'led', led: { kind: 'rawExpression', code: block.getFieldValue('LED') }, color: { kind: 'rawExpression', code: `CRGB::${block.getFieldValue('COLOR')}` } }
    case 'leanbot_gripper': return { kind: 'gripper', action: block.getFieldValue('ACTION'), arguments: [] }
    case 'leanbot_sound': return { kind: 'sound', frequency: fieldNumber(block, 'FREQ'), duration: fieldNumber(block, 'DURATION') }
    case 'leanbot_variable': return { kind: 'variableDeclaration', name: block.getFieldValue('NAME'), valueType: 'number', initializer: fieldNumber(block, 'VALUE') }
    case 'leanbot_raw_cpp': return { kind: 'raw', code: block.getFieldValue('CODE'), scope: 'loop', locked: !block.isEditable() }
    case 'leanbot_comment': return { kind: 'comment', text: block.getFieldValue('TEXT'), style: 'line' }
    case 'controls_if': {
      const then = chainFrom(block.getInputTargetBlock('DO0'))
      const otherwise = chainFrom(block.getInputTargetBlock('ELSE'))
      return { kind: 'if', condition: expressionFromBlock(block.getInputTargetBlock('IF0')), then, else: otherwise.length ? otherwise : undefined }
    }
    case 'controls_repeat_ext': return { kind: 'repeat', count: expressionFromBlock(block.getInputTargetBlock('TIMES')), body: chainFrom(block.getInputTargetBlock('DO')) }
    case 'controls_whileUntil': return block.getFieldValue('MODE') === 'UNTIL' ? { kind: 'until', condition: expressionFromBlock(block.getInputTargetBlock('BOOL')), body: chainFrom(block.getInputTargetBlock('DO')) } : { kind: 'while', condition: expressionFromBlock(block.getInputTargetBlock('BOOL')), body: chainFrom(block.getInputTargetBlock('DO')) }
    case 'variables_set': return { kind: 'assignment', name: block.getField('VAR')?.getText() ?? 'value', value: expressionFromBlock(block.getInputTargetBlock('VALUE')) }
    case 'math_change': return { kind: 'change', name: block.getField('VAR')?.getText() ?? 'value', operator: '+=', value: expressionFromBlock(block.getInputTargetBlock('DELTA')) }
    default: return { kind: 'raw', code: `// Khối ${block.type}`, scope: 'loop' }
  }
}

function expressionFromBlock(block: Blockly.Block | null): Expression {
  if (!block) return number(0)
  switch (block.type) {
    case 'math_number': return number(Number(block.getFieldValue('NUM')))
    case 'variables_get': return { kind: 'variable', name: block.getField('VAR')?.getText() ?? 'value' }
    case 'leanbot_distance': return { kind: 'sensorRead', sensor: 'ultrasonic', unit: 'cm' }
    case 'leanbot_ir': return { kind: 'sensorRead', sensor: 'irArray', index: { kind: 'rawExpression', code: block.getFieldValue('IR') } }
    case 'leanbot_line_black': return { kind: 'sensorRead', sensor: 'irLine' }
    case 'leanbot_touch': return { kind: 'touchRead', button: { kind: 'variable', name: block.getFieldValue('BUTTON') } }
    case 'logic_compare': return { kind: 'comparison', operator: ({ EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' } as const)[block.getFieldValue('OP') as 'EQ'] ?? '==', left: expressionFromBlock(block.getInputTargetBlock('A')), right: expressionFromBlock(block.getInputTargetBlock('B')) }
    case 'logic_operation': return { kind: 'booleanOperation', operator: block.getFieldValue('OP') === 'AND' ? '&&' : '||', left: expressionFromBlock(block.getInputTargetBlock('A')), right: expressionFromBlock(block.getInputTargetBlock('B')) }
    case 'logic_negate': return { kind: 'unary', operator: '!', operand: expressionFromBlock(block.getInputTargetBlock('BOOL')) }
    case 'math_arithmetic': return { kind: 'arithmetic', operator: ({ ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/', POWER: '*' } as const)[block.getFieldValue('OP') as 'ADD'] ?? '+', left: expressionFromBlock(block.getInputTargetBlock('A')), right: expressionFromBlock(block.getInputTargetBlock('B')) }
    case 'math_random_int': return { kind: 'call', callee: 'random', arguments: [expressionFromBlock(block.getInputTargetBlock('FROM')), expressionFromBlock(block.getInputTargetBlock('TO'))] }
    case 'math_constrain': return { kind: 'call', callee: 'constrain', arguments: [expressionFromBlock(block.getInputTargetBlock('VALUE')), expressionFromBlock(block.getInputTargetBlock('LOW')), expressionFromBlock(block.getInputTargetBlock('HIGH'))] }
    default: return { kind: 'rawExpression', code: block.toString() }
  }
}

function chainFrom(first: Blockly.Block | null): Statement[] {
  const result: Statement[] = []
  for (let block = first; block; block = block.getNextBlock()) {
    const statement = statementFromBlock(block)
    if (statement) result.push(statement)
  }
  return result
}

export function workspaceToIr(workspace: Blockly.Workspace): LeanbotProgram {
  const top = workspace.getTopBlocks(true)
  return { includes: [{ kind: 'include', path: 'Leanbot.h', system: true }], globals: [], setup: [], loop: top.flatMap(chainFrom), functions: [], source: { language: 'blockly' } }
}

function addExpression(workspace: Blockly.Workspace, value: Expression): Blockly.Block {
  if (value.kind === 'numberLiteral') { const block = workspace.newBlock('math_number'); block.setFieldValue(String(value.value), 'NUM'); return block }
  if (value.kind === 'sensorRead' && value.sensor === 'ultrasonic') return workspace.newBlock('leanbot_distance')
  if (value.kind === 'sensorRead' && value.sensor === 'irLine') return workspace.newBlock('leanbot_line_black')
  if (value.kind === 'touchRead') { const block = workspace.newBlock('leanbot_touch'); if (value.button?.kind === 'variable') block.setFieldValue(value.button.name, 'BUTTON'); return block }
  if (value.kind === 'comparison') {
    const block = workspace.newBlock('logic_compare')
    block.setFieldValue(({ '==': 'EQ', '!=': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE' } as const)[value.operator], 'OP')
    block.getInput('A')?.connection?.connect(addExpression(workspace, value.left).outputConnection!)
    block.getInput('B')?.connection?.connect(addExpression(workspace, value.right).outputConnection!)
    return block
  }
  const fallback = workspace.newBlock('math_number'); fallback.setFieldValue('0', 'NUM'); fallback.setCommentText(value.kind === 'rawExpression' ? value.code : 'Biểu thức C++'); return fallback
}

function addChain(workspace: Blockly.Workspace, statements: Statement[]) {
  let first: Blockly.Block | null = null
  let previous: Blockly.Block | null = null
  for (const statement of statements) {
    const block = addBlock(workspace, statement)
    if (!first) first = block
    if (previous?.nextConnection && block.previousConnection) previous.nextConnection.connect(block.previousConnection)
    previous = block
  }
  return first
}

function addBlock(workspace: Blockly.Workspace, statement: Statement): Blockly.Block {
  if (statement.kind === 'if') {
    const block = workspace.newBlock('controls_if')
    block.getInput('IF0')?.connection?.connect(addExpression(workspace, statement.condition).outputConnection!)
    const then = addChain(workspace, statement.then); if (then?.previousConnection) block.getInput('DO0')?.connection?.connect(then.previousConnection)
    if (statement.else?.length) {
      ;(block as Blockly.Block & { loadExtraState?(state: object): void }).loadExtraState?.({ elseIfCount: 0, hasElse: true })
      const otherwise = addChain(workspace, statement.else); if (otherwise?.previousConnection) block.getInput('ELSE')?.connection?.connect(otherwise.previousConnection)
    }
    return block
  }
  if (statement.kind === 'repeat' || statement.kind === 'while' || statement.kind === 'until' || statement.kind === 'forever') {
    const repeat = statement.kind === 'repeat'
    const block = workspace.newBlock(repeat ? 'controls_repeat_ext' : 'controls_whileUntil')
    if (repeat) block.getInput('TIMES')?.connection?.connect(addExpression(workspace, statement.count).outputConnection!)
    else { block.setFieldValue(statement.kind === 'until' ? 'UNTIL' : 'WHILE', 'MODE'); if (statement.kind !== 'forever') block.getInput('BOOL')?.connection?.connect(addExpression(workspace, statement.condition).outputConnection!) }
    const nested = addChain(workspace, statement.body); if (nested?.previousConnection) block.getInput('DO')?.connection?.connect(nested.previousConnection)
    return block
  }
  const type = statement.kind === 'missionBegin' ? 'leanbot_mission_begin' : statement.kind === 'missionEnd' ? 'leanbot_mission_end' : statement.kind === 'motion' ? (statement.motion === 'distance' ? 'leanbot_move' : 'leanbot_turn') : statement.kind === 'wheels' ? 'leanbot_wheels' : statement.kind === 'stop' ? 'leanbot_stop' : statement.kind === 'led' ? 'leanbot_led' : statement.kind === 'gripper' ? 'leanbot_gripper' : statement.kind === 'sound' ? 'leanbot_sound' : statement.kind === 'variableDeclaration' ? 'leanbot_variable' : statement.kind === 'comment' ? 'leanbot_comment' : 'leanbot_raw_cpp'
  const block = workspace.newBlock(type)
  if (statement.kind === 'missionBegin') block.setFieldValue(statement.button.kind === 'rawExpression' ? statement.button.code : 'TB1A + TB1B', 'BUTTON')
  if (statement.kind === 'motion') { const rawValue = statement.value.kind === 'numberLiteral' ? statement.value.value : 0; const displayValue = statement.motion === 'distance' && statement.unit === 'mm' ? rawValue / 10 : rawValue; block.setFieldValue(statement.direction, 'DIRECTION'); block.setFieldValue(String(displayValue), statement.motion === 'distance' ? 'DISTANCE' : 'ANGLE'); block.setFieldValue(String(statement.speed?.kind === 'numberLiteral' ? statement.speed.value : 1000), 'SPEED') }
  if (statement.kind === 'wheels') { block.setFieldValue(String(statement.left.kind === 'numberLiteral' ? statement.left.value : 0), 'LEFT'); block.setFieldValue(String(statement.right.kind === 'numberLiteral' ? statement.right.value : 0), 'RIGHT') }
  if (statement.kind === 'gripper') block.setFieldValue(statement.action === 'close' ? 'close' : 'open', 'ACTION')
  if (statement.kind === 'sound') { block.setFieldValue(String(statement.frequency.kind === 'numberLiteral' ? statement.frequency.value : 1000), 'FREQ'); block.setFieldValue(String(statement.duration.kind === 'numberLiteral' ? statement.duration.value : 500), 'DURATION') }
  if (statement.kind === 'variableDeclaration') { block.setFieldValue(statement.name, 'NAME'); block.setFieldValue(String(statement.initializer?.kind === 'numberLiteral' ? statement.initializer.value : 0), 'VALUE') }
  if (statement.kind === 'comment') block.setFieldValue(statement.text, 'TEXT')
  if (statement.kind === 'raw') { block.setFieldValue(statement.code, 'CODE'); if (statement.locked) block.setEditable(false) }
  return block
}

export function programToWorkspaceState(program: LeanbotProgram): BlocklyWorkspaceState {
  registerLeanbotBlocks()
  const workspace = new Blockly.Workspace()
  addChain(workspace, [...program.globals, ...program.loop])
  const state = Blockly.serialization.workspaces.save(workspace)
  workspace.dispose()
  return state
}

export function stateToProgram(state: BlocklyWorkspaceState): LeanbotProgram {
  registerLeanbotBlocks()
  const workspace = new Blockly.Workspace()
  Blockly.serialization.workspaces.load(state, workspace)
  const program = workspaceToIr(workspace)
  workspace.dispose()
  return program
}
