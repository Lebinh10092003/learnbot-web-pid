import { isBalanced, tokenizeCpp, type Token } from './tokenizer'

export type CppNode =
  | { kind: 'comment'; token: Token }
  | { kind: 'simple'; tokens: Token[] }
  | { kind: 'if'; condition: Token[]; then: CppNode[]; otherwise: CppNode[]; tokens: Token[] }
  | { kind: 'loop'; loop: 'for' | 'while' | 'do'; condition: Token[]; body: CppNode[]; tokens: Token[] }

export interface CppFunction { name: string; returnType: string; parameters: Token[]; body: CppNode[]; tokens: Token[] }
export interface CppTranslationUnit { tokens: Token[]; functions: CppFunction[]; preprocessor: Token[]; globals: CppNode[]; balanced: boolean }

function matching(tokens: Token[], start: number, open: string, close: string) {
  let depth = 0
  for (let i = start; i < tokens.length; i += 1) {
    if (tokens[i].value === open) depth += 1
    if (tokens[i].value === close && --depth === 0) return i
  }
  return -1
}

function parseBlock(tokens: Token[], from = 0, to = tokens.length): CppNode[] {
  const nodes: CppNode[] = []
  let i = from
  while (i < to) {
    if (tokens[i].kind === 'comment') { nodes.push({ kind: 'comment', token: tokens[i++] }); continue }
    if (tokens[i].value === 'if') {
      const open = i + 1
      const condEnd = matching(tokens, open, '(', ')')
      if (condEnd < 0 || tokens[condEnd + 1]?.value !== '{') break
      const bodyEnd = matching(tokens, condEnd + 1, '{', '}')
      if (bodyEnd < 0) break
      let end = bodyEnd
      let otherwise: CppNode[] = []
      if (tokens[bodyEnd + 1]?.value === 'else' && tokens[bodyEnd + 2]?.value === '{') {
        const elseEnd = matching(tokens, bodyEnd + 2, '{', '}')
        otherwise = parseBlock(tokens, bodyEnd + 3, elseEnd)
        end = elseEnd
      }
      nodes.push({ kind: 'if', condition: tokens.slice(open + 1, condEnd), then: parseBlock(tokens, condEnd + 2, bodyEnd), otherwise, tokens: tokens.slice(i, end + 1) })
      i = end + 1
      continue
    }
    if (tokens[i].value === 'for' || tokens[i].value === 'while') {
      const loop = tokens[i].value as 'for' | 'while'
      const condEnd = matching(tokens, i + 1, '(', ')')
      if (condEnd < 0 || tokens[condEnd + 1]?.value !== '{') break
      const bodyEnd = matching(tokens, condEnd + 1, '{', '}')
      nodes.push({ kind: 'loop', loop, condition: tokens.slice(i + 2, condEnd), body: parseBlock(tokens, condEnd + 2, bodyEnd), tokens: tokens.slice(i, bodyEnd + 1) })
      i = bodyEnd + 1
      continue
    }
    if (tokens[i].value === 'do' && tokens[i + 1]?.value === '{') {
      const bodyEnd = matching(tokens, i + 1, '{', '}')
      const whileIndex = bodyEnd + 1
      const condEnd = tokens[whileIndex]?.value === 'while' ? matching(tokens, whileIndex + 1, '(', ')') : -1
      if (condEnd < 0) break
      nodes.push({ kind: 'loop', loop: 'do', condition: tokens.slice(whileIndex + 2, condEnd), body: parseBlock(tokens, i + 2, bodyEnd), tokens: tokens.slice(i, condEnd + 2) })
      i = condEnd + 2
      continue
    }
    let end = i
    let depth = 0
    while (end < to) {
      if (['(', '['].includes(tokens[end].value)) depth += 1
      if ([')', ']'].includes(tokens[end].value)) depth -= 1
      if (tokens[end].value === ';' && depth === 0) break
      end += 1
    }
    if (end >= to) break
    nodes.push({ kind: 'simple', tokens: tokens.slice(i, end + 1) })
    i = end + 1
  }
  return nodes
}

export function parseCpp(source: string): CppTranslationUnit {
  const tokens = tokenizeCpp(source)
  const functions: CppFunction[] = []
  const preprocessor = tokens.filter((token) => token.kind === 'preprocessor')
  const occupied = new Set<number>()
  for (let i = 0; i < tokens.length - 4; i += 1) {
    if (tokens[i].kind !== 'identifier' || tokens[i + 1]?.kind !== 'identifier' || tokens[i + 2]?.value !== '(') continue
    const paramsEnd = matching(tokens, i + 2, '(', ')')
    if (paramsEnd < 0 || tokens[paramsEnd + 1]?.value !== '{') continue
    const bodyEnd = matching(tokens, paramsEnd + 1, '{', '}')
    if (bodyEnd < 0) continue
    for (let n = i; n <= bodyEnd; n += 1) occupied.add(n)
    functions.push({ name: tokens[i + 1].value, returnType: tokens[i].value, parameters: tokens.slice(i + 3, paramsEnd), body: parseBlock(tokens, paramsEnd + 2, bodyEnd), tokens: tokens.slice(i, bodyEnd + 1) })
    i = bodyEnd
  }
  const globalTokens = tokens.filter((token, index) => token.kind !== 'preprocessor' && !occupied.has(index))
  return { tokens, functions, preprocessor, globals: parseBlock(globalTokens), balanced: isBalanced(tokens) }
}

export function sourceOf(source: string, tokens: Token[]) {
  if (!tokens.length) return ''
  return source.slice(tokens[0].start, tokens[tokens.length - 1].end)
}
