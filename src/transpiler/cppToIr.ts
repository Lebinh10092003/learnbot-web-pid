import type { ConversionResult, Diagnostic, Expression, FunctionDefinition, FunctionParameter, LeanbotProgram, RawScope, Statement, ValueType } from './ir/types'
import { parseCpp, sourceOf, type CppNode } from './cppParser/parser'
import type { Token } from './cppParser/tokenizer'

const EMPTY_PROGRAM = (): LeanbotProgram => ({ includes: [], globals: [], setup: [], loop: [], functions: [], source: { language: 'cpp', fileName: 'main.ino' } })

function span(tokens: Token[]) {
  if (!tokens.length) return undefined
  return { start: tokens[0].start, end: tokens[tokens.length - 1].end, lineStart: tokens[0].line, lineEnd: tokens[tokens.length - 1].lineEnd }
}

function split(tokens: Token[], separator = ',') {
  const result: Token[][] = []
  let current: Token[] = []
  let depth = 0
  for (const token of tokens) {
    if (['(', '[', '{'].includes(token.value)) depth += 1
    if ([')', ']', '}'].includes(token.value)) depth -= 1
    if (token.value === separator && depth === 0) { result.push(current); current = [] } else current.push(token)
  }
  if (current.length) result.push(current)
  return result
}

function calleeAndArgs(tokens: Token[]): { callee: string; args: Token[][] } | null {
  const open = tokens.findIndex((token) => token.value === '(')
  if (open < 1) return null
  let depth = 0
  let close = -1
  for (let i = open; i < tokens.length; i += 1) {
    if (tokens[i].value === '(') depth += 1
    if (tokens[i].value === ')' && --depth === 0) { close = i; break }
  }
  if (close < 0) return null
  const callee = tokens.slice(0, open).map((token) => token.value).join('').replaceAll('::', '::')
  return { callee, args: split(tokens.slice(open + 1, close)) }
}

const precedence: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 }

function trimParens(tokens: Token[]) {
  let result = tokens
  while (result[0]?.value === '(' && result[result.length - 1]?.value === ')') result = result.slice(1, -1)
  return result
}

function expression(tokensInput: Token[]): Expression {
  const tokens = trimParens(tokensInput.filter((token) => token.value !== ';'))
  if (!tokens.length) return { kind: 'rawExpression', code: '' }
  let depth = 0
  for (let level = 1; level <= 6; level += 1) {
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      if ([')', ']'].includes(tokens[i].value)) depth += 1
      if (['(', '['].includes(tokens[i].value)) depth -= 1
      if (depth === 0 && precedence[tokens[i].value] === level) {
        const left = expression(tokens.slice(0, i)); const right = expression(tokens.slice(i + 1))
        if (level <= 2) return { kind: 'booleanOperation', operator: tokens[i].value as '&&' | '||', left, right, span: span(tokens) }
        if (level <= 4) return { kind: 'comparison', operator: tokens[i].value as '<' | '<=' | '==' | '!=' | '>=' | '>', left, right, span: span(tokens) }
        return { kind: 'arithmetic', operator: tokens[i].value as '+' | '-' | '*' | '/' | '%', left, right, span: span(tokens) }
      }
    }
  }
  if (['!', '-', '+'].includes(tokens[0].value) && tokens.length > 1) return { kind: 'unary', operator: tokens[0].value as '!' | '-' | '+', operand: expression(tokens.slice(1)), span: span(tokens) }
  if (tokens.length === 1) {
    if (tokens[0].kind === 'number') return { kind: 'numberLiteral', value: Number(tokens[0].value), span: span(tokens) }
    if (tokens[0].kind === 'string') return { kind: 'stringLiteral', value: tokens[0].value.slice(1, -1), span: span(tokens) }
    if (tokens[0].value === 'true' || tokens[0].value === 'false' || tokens[0].value === 'HIGH' || tokens[0].value === 'LOW') return { kind: 'booleanLiteral', value: ['true', 'HIGH'].includes(tokens[0].value), span: span(tokens) }
    return { kind: 'variable', name: tokens[0].value, span: span(tokens) }
  }
  const call = calleeAndArgs(tokens)
  if (call) {
    const args = call.args.map(expression)
    if (call.callee === 'Leanbot.pingCm' || call.callee === 'Leanbot.pingMm') return { kind: 'sensorRead', sensor: 'ultrasonic', unit: call.callee.endsWith('Cm') ? 'cm' : 'mm', span: span(tokens) }
    if (call.callee === 'LbIRArray.read') return { kind: 'sensorRead', sensor: 'irArray', index: args[0], span: span(tokens) }
    if (call.callee === 'LbIRLine.isBlackDetected') return { kind: 'sensorRead', sensor: 'irLine', span: span(tokens) }
    if (call.callee === 'LbTouch.read') return { kind: 'touchRead', button: args[0], span: span(tokens) }
    return { kind: 'call', callee: call.callee, arguments: args, span: span(tokens) }
  }
  return { kind: 'rawExpression', code: tokens.map((token) => token.value).join(' ').replaceAll(' :: ', '::').replaceAll(' . ', '.'), span: span(tokens) }
}

function numeric(expr: Expression) { return expr.kind === 'numberLiteral' ? expr.value : null }
function raw(source: string, node: CppNode, scope: RawScope): Statement {
  const tokens = node.kind === 'comment' ? [node.token] : node.tokens
  return { kind: 'raw', code: sourceOf(source, tokens), scope, span: span(tokens) }
}

function nodesToStatements(source: string, nodes: CppNode[], scope: RawScope, diagnostics: Diagnostic[]): Statement[] {
  const statements: Statement[] = []
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    if (node.kind === 'comment') {
      const code = node.token.value
      statements.push({ kind: 'comment', text: code.startsWith('//') ? code.slice(2).trim() : code.slice(2, -2).trim(), style: code.startsWith('//') ? 'line' : 'block', span: span([node.token]) })
      continue
    }
    if (node.kind === 'if') {
      statements.push({ kind: 'if', condition: expression(node.condition), then: nodesToStatements(source, node.then, scope, diagnostics), else: node.otherwise.length ? nodesToStatements(source, node.otherwise, scope, diagnostics) : undefined, span: span(node.tokens) })
      continue
    }
    if (node.kind === 'loop') {
      const body = nodesToStatements(source, node.body, scope, diagnostics)
      if (node.loop === 'while' && node.condition.length === 1 && node.condition[0].value === 'true') statements.push({ kind: 'forever', body, span: span(node.tokens) })
      else if (node.loop === 'do') statements.push({ kind: 'until', condition: expression(node.condition[0]?.value === '!' ? node.condition.slice(1) : node.condition), body, span: span(node.tokens) })
      else if (node.loop === 'for') {
        const parts = split(node.condition, ';')
        const countTokens = parts[1] ?? []
        const comparator = countTokens.findIndex((token) => ['<', '<='].includes(token.value))
        statements.push({ kind: 'repeat', count: expression(comparator >= 0 ? countTokens.slice(comparator + 1) : countTokens), body, span: span(node.tokens) })
      } else statements.push({ kind: 'while', condition: expression(node.condition), body, span: span(node.tokens) })
      continue
    }
    const tokens = node.tokens.filter((token) => token.value !== ';')
    const call = calleeAndArgs(tokens)
    if (call?.callee === 'LbMotion.runLR' || call?.callee === 'LbMotion.runLRrpm') {
      const args = call.args.map(expression)
      const next = nodes[i + 1]
      const wait = next?.kind === 'simple' ? calleeAndArgs(next.tokens.filter((token) => token.value !== ';')) : null
      if (wait && ['LbMotion.waitDistanceMm', 'LbMotion.waitRotationDeg'].includes(wait.callee)) {
        const left = numeric(args[0]); const right = numeric(args[1]); const isDistance = wait.callee.endsWith('DistanceMm')
        const direction = isDistance ? ((left ?? 0) >= 0 && (right ?? 0) >= 0 ? 'forward' : 'backward') : ((left ?? 0) < (right ?? 0) ? 'left' : 'right')
        const speedValue = left === null || right === null ? args[0] : { kind: 'numberLiteral', value: Math.max(Math.abs(left), Math.abs(right)) } as Expression
        const waitTokens = next?.kind === 'simple' ? next.tokens : []
        statements.push({ kind: 'motion', motion: isDistance ? 'distance' : 'rotation', direction, value: expression(wait.args[0]), speed: speedValue, unit: isDistance ? 'mm' : 'deg', span: span([...node.tokens, ...waitTokens]) })
        i += 1
        const stop = nodes[i + 1]
        if (stop?.kind === 'simple' && calleeAndArgs(stop.tokens.filter((token) => token.value !== ';'))?.callee === 'LbMotion.stopAndWait') i += 1
        continue
      }
      statements.push({ kind: 'wheels', left: args[0], right: args[1], mode: call.callee.endsWith('rpm') ? 'rpm' : 'pwm', span: span(node.tokens) })
      continue
    }
    if (call) {
      const args = call.args.map(expression)
      const simple: Record<string, Statement> = {
        'Leanbot.begin': { kind: 'functionCall', name: 'Leanbot.begin', arguments: [] },
        'LbMission.begin': { kind: 'missionBegin', button: args[0] ?? { kind: 'rawExpression', code: 'TB1A + TB1B' } },
        'LbMission.end': { kind: 'missionEnd' }, 'LbMotion.stopAndWait': { kind: 'stop' },
        LbDelay: { kind: 'delay', duration: args[0] },
        'LbGripper.open': { kind: 'gripper', action: 'open', arguments: [] },
        'LbGripper.close': { kind: 'gripper', action: 'close', arguments: [] },
        'LbGripper.moveTo': { kind: 'gripper', action: 'moveTo', arguments: args },
        'LbGripper.moveToLR': { kind: 'gripper', action: 'moveToLR', arguments: args },
      }
      if (simple[call.callee]) { statements.push({ ...simple[call.callee], span: span(node.tokens) } as Statement); continue }
      if (call.callee === 'Leanbot.tone') {
        statements.push({ kind: 'sound', frequency: args[0], duration: args[1] ?? { kind: 'numberLiteral', value: 0 }, span: span(node.tokens) });
        const delayNode = nodes[i + 1]
        if (delayNode?.kind === 'simple' && calleeAndArgs(delayNode.tokens)?.callee === 'LbDelay') i += 1
        continue
      }
      const unsafe = ['malloc', 'free', 'asm'].some((name) => call.callee.includes(name))
      if (!unsafe && !call.callee.includes('.') && !call.callee.includes('::')) { statements.push({ kind: 'functionCall', name: call.callee, arguments: args, span: span(node.tokens) }); continue }
    }
    const assign = tokens.findIndex((token) => ['=', '+=', '-='].includes(token.value))
    if (assign > 0) {
      const left = tokens.slice(0, assign).map((token) => token.value).join('')
      if (left.startsWith('LbRGB[')) {
        const ledTokens = tokens.slice(tokens.findIndex((t) => t.value === '[') + 1, tokens.findIndex((t) => t.value === ']'))
        statements.push({ kind: 'led', led: expression(ledTokens), color: expression(tokens.slice(assign + 1)), span: span(node.tokens) })
        const show = nodes[i + 1]
        if (show?.kind === 'simple' && calleeAndArgs(show.tokens)?.callee === 'LbRGB.show') i += 1
        continue
      }
      const typeNames = ['int', 'long', 'float', 'double', 'bool', 'String']
      if (typeNames.includes(tokens[0].value) && tokens[1]?.kind === 'identifier') {
        statements.push({ kind: 'variableDeclaration', name: tokens[1].value, valueType: tokens[0].value === 'bool' ? 'boolean' : tokens[0].value === 'String' ? 'string' : 'number', initializer: expression(tokens.slice(assign + 1)), span: span(node.tokens) }); continue
      }
      if (tokens[assign].value === '=') statements.push({ kind: 'assignment', name: tokens.slice(0, assign).map((t) => t.value).join(''), value: expression(tokens.slice(assign + 1)), span: span(node.tokens) })
      else statements.push({ kind: 'change', name: tokens.slice(0, assign).map((t) => t.value).join(''), operator: tokens[assign].value as '+=' | '-=', value: expression(tokens.slice(assign + 1)), span: span(node.tokens) })
      continue
    }
    if (tokens[0]?.value === 'return') { statements.push({ kind: 'return', value: tokens.length > 1 ? expression(tokens.slice(1)) : undefined, span: span(node.tokens) }); continue }
    const code = sourceOf(source, node.tokens)
    const unsafe = /\b(template|malloc|free|asm)\b/.test(code) || /\w+\s*\*/.test(code)
    diagnostics.push({ severity: unsafe ? 'error' : 'warning', message: unsafe ? 'Cú pháp này chưa được Blocks hỗ trợ.' : 'Đoạn C++ được giữ nguyên trong khối tùy chỉnh.', lineStart: node.tokens[0].line, lineEnd: node.tokens.at(-1)!.lineEnd, code: unsafe ? 'unsupported' : 'raw-cpp' })
    statements.push(raw(source, node, scope))
  }
  return statements
}

function parameters(tokens: Token[]): FunctionParameter[] {
  return split(tokens).flatMap((part) => part.length >= 2 ? [{ name: part.at(-1)!.value, valueType: part[0].value === 'bool' ? 'boolean' as const : part[0].value === 'String' ? 'string' as const : 'number' as const }] : [])
}

export function cppToIr(source: string): ConversionResult {
  const ast = parseCpp(source)
  const program = EMPTY_PROGRAM()
  const diagnostics: Diagnostic[] = []
  if (!ast.balanced) {
    program.loop = [{ kind: 'raw', code: source, scope: 'loop', locked: true }]
    diagnostics.push({ severity: 'error', message: 'Cấu trúc ngoặc không cân bằng; chỉ có thể giữ nguyên toàn bộ tệp.', lineStart: 1, lineEnd: source.split('\n').length, code: 'syntax' })
    return { program, diagnostics, status: 'unsupported' }
  }
  program.includes = ast.preprocessor.filter((token) => token.value.startsWith('#include')).map((token) => {
    const value = token.value.slice('#include'.length).trim(); const system = value.startsWith('<')
    return { kind: 'include', path: value.slice(1, -1), system, raw: token.value, span: span([token]) }
  })
  for (const fn of ast.functions) {
    const body = nodesToStatements(source, fn.body, fn.name === 'setup' ? 'setup' : fn.name === 'loop' ? 'loop' : 'function', diagnostics)
    if (fn.name === 'setup') program.setup = body.filter((statement) => !(statement.kind === 'functionCall' && statement.name === 'Leanbot.begin'))
    else if (fn.name === 'loop') program.loop = body
    else program.functions.push({ kind: 'functionDefinition', name: fn.name, returnType: (fn.returnType === 'void' ? 'void' : fn.returnType === 'bool' ? 'boolean' : fn.returnType === 'String' ? 'string' : 'number') as ValueType, parameters: parameters(fn.parameters), body, span: span(fn.tokens) } as FunctionDefinition)
  }
  program.globals = nodesToStatements(source, ast.globals, 'global', diagnostics).filter((statement) => ['variableDeclaration', 'comment', 'raw'].includes(statement.kind)) as LeanbotProgram['globals']
  const unsupported = diagnostics.some((item) => item.code === 'unsupported' || item.code === 'syntax')
  return { program, diagnostics, status: unsupported ? 'unsupported' : diagnostics.length ? 'partial' : 'full' }
}
