import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

describe('global SVG styles', () => {
  it('sizes Lucide icons without shrinking the Blockly canvas', () => {
    expect(stylesheet).toMatch(/\.lucide\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/s)
    expect(stylesheet).not.toMatch(/(^|})\s*svg\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/s)
  })
})
