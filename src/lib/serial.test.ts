import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEANBOT_PROFILE } from '../leanbot/profile/leanbotDeviceProfile'
import { LeanbotSerialClient } from './serial'

afterEach(() => vi.unstubAllGlobals())

describe('LeanbotSerialClient', () => {
  it('opens only verified Leanbot USB adapters with the reference serial settings', async () => {
    const open = vi.fn(async () => undefined)
    const setSignals = vi.fn(async () => undefined)
    const close = vi.fn(async () => undefined)
    const port = {
      open,
      close,
      setSignals,
      getInfo: () => ({ usbVendorId: 0x1a86, usbProductId: 0x7523 }),
      readable: new ReadableStream<Uint8Array>({ start(controller) { controller.close() } }),
      writable: new WritableStream<Uint8Array>(),
    }
    const requestPort = vi.fn(async () => port)
    vi.stubGlobal('navigator', { serial: { requestPort, getPorts: vi.fn(async () => [port]) } })
    vi.stubGlobal('isSecureContext', true)

    const client = new LeanbotSerialClient()
    await client.connect()

    expect(requestPort).toHaveBeenCalledWith({ filters: LEANBOT_PROFILE.serial.filters })
    expect(open).toHaveBeenCalledWith({ baudRate: 115200, bufferSize: 2048 })
    expect(setSignals).toHaveBeenCalledWith({ dataTerminalReady: true })
    await client.disconnect()
    expect(close).toHaveBeenCalled()
  })

  it('does not open Web Serial outside a secure context', async () => {
    vi.stubGlobal('navigator', { serial: { requestPort: vi.fn() } })
    vi.stubGlobal('isSecureContext', false)
    await expect(new LeanbotSerialClient().connect()).rejects.toThrow(/HTTPS/)
  })
})
