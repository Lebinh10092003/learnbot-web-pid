import { describe, expect, it } from 'vitest'
import { Stk500Uploader, UploadProtocolError } from './stk500'
import type { UploadTransport } from './transport'

const HEX = ':0400000001020304F2\n:00000001FF'

class FakeTransport implements UploadTransport {
  writes: Uint8Array[] = []
  dtr: boolean[] = []
  flushes: number[] = []
  closed = false
  currentAddress = 0
  memory = new Uint8Array(128).fill(0xff)
  corruptVerify = false

  async write(data: Uint8Array) {
    this.writes.push(data)
    if (data[0] === 0x55) this.currentAddress = ((data[2] << 8) | data[1]) << 1
    if (data[0] === 0x64) this.memory.set(data.slice(4, -1), this.currentAddress)
  }

  async read(length: number) {
    const command = this.writes.at(-1)?.[0]
    if (command === 0x74) {
      const payload = this.memory.slice(this.currentAddress, this.currentAddress + length - 2)
      if (this.corruptVerify) payload[0] ^= 0xff
      return Uint8Array.from([0x14, ...payload, 0x10])
    }
    return Uint8Array.from([0x14, 0x10])
  }

  async setDtr(value: boolean) { this.dtr.push(value) }
  async flush(durationMs: number) { this.flushes.push(durationMs) }
  async close() { this.closed = true }
}

describe('STK500v1 Leanbot uploader', () => {
  it('resets, syncs, writes 128-byte pages, verifies, and leaves programming mode', async () => {
    const transport = new FakeTransport()
    const states: string[] = []

    await new Stk500Uploader(transport, { onProgress: (state) => states.push(state) }).upload(HEX)

    expect(transport.dtr.slice(0, 2)).toEqual([false, true])
    expect(transport.flushes).toEqual([100])
    expect(transport.writes.map((packet) => packet[0])).toEqual(expect.arrayContaining([0x30, 0x50, 0x55, 0x64, 0x74, 0x51]))
    expect(transport.writes.find((packet) => packet[0] === 0x64)?.length).toBe(133)
    expect(states).toEqual(expect.arrayContaining(['resetting', 'syncing', 'uploading', 'verifying', 'done']))
    expect(transport.closed).toBe(true)
  })

  it('reports VERIFY_ERROR without claiming success and releases the port', async () => {
    const transport = new FakeTransport()
    transport.corruptVerify = true

    await expect(new Stk500Uploader(transport).upload(HEX)).rejects.toMatchObject({ code: 'VERIFY_ERROR' } satisfies Partial<UploadProtocolError>)
    expect(transport.closed).toBe(true)
  })
})
