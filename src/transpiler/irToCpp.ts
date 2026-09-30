import type { Expression, LeanbotProgram, Statement } from './ir/types'

function expr(value: Expression): string {
  switch (value.kind) {
    case 'numberLiteral': return String(value.value)
    case 'stringLiteral': return JSON.stringify(value.value)
    case 'booleanLiteral': return value.value ? 'true' : 'false'
    case 'variable': return value.name
    case 'arithmetic': case 'binary': case 'comparison': case 'booleanOperation': return `${expr(value.left)} ${value.operator} ${expr(value.right)}`
    case 'unary': return `${value.operator}${expr(value.operand)}`
    case 'sensorRead': return value.sensor === 'ultrasonic' ? `Leanbot.ping${value.unit === 'mm' ? 'Mm' : 'Cm'}()` : value.sensor === 'irLine' ? 'LbIRLine.isBlackDetected()' : `LbIRArray.read(${value.index ? expr(value.index) : 'ir0L'})`
    case 'touchRead': return `LbTouch.read(${value.button ? expr(value.button) : 'TB1A'}) == HIGH`
    case 'call': return `${value.callee}(${value.arguments.map(expr).join(', ')})`
    case 'rawExpression': return value.code
  }
}

function lines(statement: Statement, level: number): string[] {
  const pad = '  '.repeat(level)
  const body = (items: Statement[]) => items.flatMap((item) => lines(item, level + 1))
  switch (statement.kind) {
    case 'missionBegin': return [`${pad}LbMission.begin(${expr(statement.button)});`]
    case 'missionEnd': return [`${pad}LbMission.end();`]
    case 'motion': {
      const speed = statement.speed ? expr(statement.speed) : '1000'
      const negative = `-${speed}`
      const [left, right] = statement.direction === 'forward' ? [speed, speed] : statement.direction === 'backward' ? [negative, negative] : statement.direction === 'left' ? [negative, speed] : [speed, negative]
      const amount = statement.unit === 'cm' ? `${expr(statement.value)} * 10` : expr(statement.value)
      return [`${pad}LbMotion.runLR(${left}, ${right});`, `${pad}LbMotion.${statement.motion === 'distance' ? 'waitDistanceMm' : 'waitRotationDeg'}(${amount});`, `${pad}LbMotion.stopAndWait();`]
    }
    case 'wheels': return [`${pad}LbMotion.${statement.mode === 'rpm' ? 'runLRrpm' : 'runLR'}(${expr(statement.left)}, ${expr(statement.right)});`]
    case 'stop': return [`${pad}LbMotion.stopAndWait();`]
    case 'delay': return [`${pad}LbDelay(${expr(statement.duration)});`]
    case 'led': return [`${pad}LbRGB[${expr(statement.led)}] = ${expr(statement.color)};`, `${pad}LbRGB.show();`]
    case 'gripper': return [`${pad}LbGripper.${statement.action}(${statement.arguments.map(expr).join(', ')});`]
    case 'sound': return [`${pad}Leanbot.tone(${expr(statement.frequency)}, ${expr(statement.duration)});`, `${pad}LbDelay(${expr(statement.duration)});`]
    case 'variableDeclaration': return [`${pad}${statement.valueType === 'boolean' ? 'bool' : statement.valueType === 'string' ? 'String' : 'int'} ${statement.name}${statement.initializer ? ` = ${expr(statement.initializer)}` : ''};`]
    case 'assignment': return [`${pad}${statement.name} = ${expr(statement.value)};`]
    case 'change': return [`${pad}${statement.name} ${statement.operator} ${expr(statement.value)};`]
    case 'if': return [`${pad}if (${expr(statement.condition)}) {`, ...body(statement.then), `${pad}}${statement.else?.length ? ' else {' : ''}`, ...(statement.else?.length ? [...body(statement.else), `${pad}}`] : [])]
    case 'repeat': return [`${pad}for (int i = 0; i < ${expr(statement.count)}; i++) {`, ...body(statement.body), `${pad}}`]
    case 'while': return [`${pad}while (${expr(statement.condition)}) {`, ...body(statement.body), `${pad}}`]
    case 'until': return [`${pad}do {`, ...body(statement.body), `${pad}} while (!(${expr(statement.condition)}));`]
    case 'forever': return [`${pad}while (true) {`, ...body(statement.body), `${pad}}`]
    case 'functionCall': return [`${pad}${statement.name}(${statement.arguments.map(expr).join(', ')});`]
    case 'return': return [`${pad}return${statement.value ? ` ${expr(statement.value)}` : ''};`]
    case 'comment': return [`${pad}${statement.style === 'line' ? `// ${statement.text}` : `/* ${statement.text} */`}`]
    case 'raw': return statement.code.split('\n').map((line) => `${pad}${line}`)
    case 'functionDefinition': return []
  }
}

function block(items: Statement[], level = 1) { return items.flatMap((item, index) => [...(index && ['motion', 'if', 'repeat', 'while', 'until', 'forever'].includes(item.kind) ? [''] : []), ...lines(item, level)]).join('\n') }

export function irToCpp(program: LeanbotProgram): string {
  const includes = program.includes.length ? program.includes.map((item) => item.raw ?? `#include ${item.system ? `<${item.path}>` : `"${item.path}"`}`) : ['#include <Leanbot.h>']
  const globals = block(program.globals, 0)
  const setup = block([{ kind: 'functionCall', name: 'Leanbot.begin', arguments: [] }, ...program.setup])
  const loop = block(program.loop)
  const functions = program.functions.map((fn) => `${fn.returnType === 'void' ? 'void' : fn.returnType === 'boolean' ? 'bool' : fn.returnType === 'string' ? 'String' : 'int'} ${fn.name}(${fn.parameters.map((p) => `${p.valueType === 'boolean' ? 'bool' : p.valueType === 'string' ? 'String' : 'int'} ${p.name}`).join(', ')}) {\n${block(fn.body)}\n}`).join('\n\n')
  return `${includes.join('\n')}\n${globals ? `\n${globals}\n` : ''}\nvoid setup() {\n${setup}\n}\n\nvoid loop() {\n${loop}\n}\n${functions ? `\n${functions}\n` : ''}`
}

export const generateLeanbotCode = irToCpp
