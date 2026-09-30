import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverSource = readFileSync(resolve(process.cwd(), 'server/index.ts'), 'utf8')

describe('compiler request lifecycle', () => {
  it('only aborts compilation when the response connection closes early', () => {
    expect(serverSource).not.toContain("request.on('close'")
    expect(serverSource).toContain("response.on('close'")
    expect(serverSource).toContain('if (!response.writableEnded) controller.abort()')
  })
})
