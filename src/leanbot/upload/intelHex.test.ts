import { describe, expect, it } from 'vitest'
import { decodeIntelHex, toFlashPages } from './intelHex'

describe('Intel HEX decoder', () => {
  it('decodes and pads AVR flash pages', () => {
    const hex = ':0400000001020304F2\n:00000001FF'
    expect([...decodeIntelHex(hex).values()]).toEqual([1, 2, 3, 4])
    const pages = toFlashPages(hex)
    expect(pages[0].address).toBe(0)
    expect([...pages[0].data.slice(0, 6)]).toEqual([1, 2, 3, 4, 255, 255])
  })

  it('rejects checksum errors', () => {
    expect(() => decodeIntelHex(':0400000001020304F3\n:00000001FF')).toThrow(/Checksum/)
  })

  it('rejects conflicting overlaps and records after EOF', () => {
    expect(() => decodeIntelHex(':0100000001FE\n:0100000002FD\n:00000001FF')).toThrow(/chồng lấp/)
    expect(() => decodeIntelHex(':00000001FF\n:0100000001FE')).toThrow(/sau EOF/)
  })

  it('uses the verified 128-byte Leanbot flash page size by default', () => {
    const pages = toFlashPages(':01008000AA D5'.replace(' ', '') + '\n:00000001FF')
    expect(pages).toHaveLength(1)
    expect(pages[0].address).toBe(128)
    expect(pages[0].data).toHaveLength(128)
  })
})
