import { describe, expect, it } from 'vitest'
import { LEANBOT_PROFILE } from './leanbotDeviceProfile'

describe('Leanbot Standard hardware profile', () => {
  it('uses the verified compiler and Web Serial configuration from REF-02', () => {
    expect(LEANBOT_PROFILE.target).toBe('leanbot-standard')
    expect(LEANBOT_PROFILE.fqbn).toBe('arduino:avr:uno')
    expect(LEANBOT_PROFILE.serial).toMatchObject({
      baudRate: 115200,
      bufferSize: 2048,
      filters: [
        { usbVendorId: 0x1a86, usbProductId: 0x7523 },
        { usbVendorId: 0x0403, usbProductId: 0x6001 },
      ],
      dtrPulseMs: 10,
      flushBeforeSyncMs: 100,
      bootloaderSettleMs: 300,
    })
    expect(LEANBOT_PROFILE.uploader).toEqual({
      pageSize: 128,
      syncKeepAliveIntervalMs: 250,
      getSyncRepeatMs: 100,
      getSyncTimeoutMs: 1500,
      loadAddressTimeoutMs: 1500,
      writeFlashTimeoutMs: 750,
      readFlashTimeoutMs: 750,
    })
  })
})
