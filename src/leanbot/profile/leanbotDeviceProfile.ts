export const LEANBOT_PROFILE = Object.freeze({
  target: 'leanbot-standard',
  fqbn: 'arduino:avr:uno',
  serial: Object.freeze({
    baudRate: 115200,
    bufferSize: 2048,
    filters: Object.freeze([
      Object.freeze({ usbVendorId: 0x1a86, usbProductId: 0x7523 }),
      Object.freeze({ usbVendorId: 0x0403, usbProductId: 0x6001 }),
    ]),
    dtrPulseMs: 10,
    flushBeforeSyncMs: 100,
    bootloaderSettleMs: 300,
  }),
  uploader: Object.freeze({
    pageSize: 128,
    syncKeepAliveIntervalMs: 250,
    getSyncRepeatMs: 100,
    getSyncTimeoutMs: 1500,
    loadAddressTimeoutMs: 1500,
    writeFlashTimeoutMs: 750,
    readFlashTimeoutMs: 750,
  }),
})

export type LeanbotProfile = typeof LEANBOT_PROFILE
