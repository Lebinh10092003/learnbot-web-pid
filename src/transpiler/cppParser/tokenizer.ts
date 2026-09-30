export type TokenKind = 'identifier' | 'number' | 'string' | 'symbol' | 'comment' | 'preprocessor'

export interface Token {
  kind: TokenKind
  value: string
  start: number
  end: number
  line: number
  lineEnd: number
}

const twoChar = new Set(['<=', '>=', '==', '!=', '&&', '||', '+=', '-=', '++', '--', '::', '->'])

export function tokenizeCpp(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  let line = 1
  const push = (kind: TokenKind, start: number, end: number, startLine: number) =>
    tokens.push({ kind, value: source.slice(start, end), start, end, line: startLine, lineEnd: line })

  while (index < source.length) {
    const char = source[index]
    if (/\s/.test(char)) {
      if (char === '\n') line += 1
      index += 1
      continue
    }
    const start = index
    const startLine = line
    if (char === '#' && (index === 0 || source[index - 1] === '\n')) {
      while (index < source.length && source[index] !== '\n') index += 1
      push('preprocessor', start, index, startLine)
      continue
    }
    if (char === '/' && source[index + 1] === '/') {
      index += 2
      while (index < source.length && source[index] !== '\n') index += 1
      push('comment', start, index, startLine)
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') line += 1
        index += 1
      }
      if (index < source.length) index += 2
      push('comment', start, index, startLine)
      continue
    }
    if (char === '"' || char === "'") {
      const quote = char
      index += 1
      while (index < source.length) {
        if (source[index] === '\\') { index += 2; continue }
        if (source[index] === quote) { index += 1; break }
        if (source[index] === '\n') line += 1
        index += 1
      }
      push('string', start, index, startLine)
      continue
    }
    if (/[A-Za-z_]/.test(char)) {
      index += 1
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1
      push('identifier', start, index, startLine)
      continue
    }
    if (/[0-9]/.test(char)) {
      index += 1
      while (index < source.length && /[0-9A-Fa-fxX.]/.test(source[index])) index += 1
      push('number', start, index, startLine)
      continue
    }
    const pair = source.slice(index, index + 2)
    index += twoChar.has(pair) ? 2 : 1
    push('symbol', start, index, startLine)
  }
  return tokens
}

export function isBalanced(tokens: Token[]) {
  const stack: string[] = []
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  for (const token of tokens) {
    if (['(', '[', '{'].includes(token.value)) stack.push(token.value)
    else if (pairs[token.value] && stack.pop() !== pairs[token.value]) return false
  }
  return stack.length === 0
}
