import { LEANBOT_PROFILE } from '../profile/leanbotDeviceProfile'
import { toFlashPages, type FlashPage } from './intelHex'
import type { UploadTransport } from './transport'

const INSYNC = 0x14
const OK = 0x10
const EOP = 0x20

export type UploadPhase = 'idle' | 'resetting' | 'syncing' | 'uploading' | 'verifying' | 'done'
export type UploadErrorCode = 'CONNECT_ERROR' | 'SYNC_ERROR' | 'WRITE_ERROR' | 'VERIFY_ERROR' | 'DISCONNECTED'

export class UploadProtocolError extends Error {
  constructor(public readonly code: UploadErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UploadProtocolError'
  }
}

export interface UploaderOptions {
  signal?: AbortSignal
  onProgress?(phase: UploadPhase, progress: number): void
}

function abortError() {
  return new DOMException('Đã hủy nạp chương trình.', 'AbortError')
}

async function delay(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(abortError()) }, { once: true })
  })
}

export class Stk500Uploader {
  private readonly signal?: AbortSignal
  private readonly onProgress: NonNullable<UploaderOptions['onProgress']>

  constructor(private readonly transport: UploadTransport, options: UploaderOptions = {}) {
    this.signal = options.signal
    this.onProgress = options.onProgress ?? (() => undefined)
  }

  async upload(hex: string) {
    const pages = toFlashPages(hex, LEANBOT_PROFILE.uploader.pageSize)
    if (!pages.length) throw new UploadProtocolError('WRITE_ERROR', 'Intel HEX không chứa dữ liệu firmware.')
    try {
      await this.enterBootloader()
      await this.program(pages)
      await this.verify(pages)
      await this.finish()
      this.onProgress('done', 1)
    } finally {
      await this.transport.close()
    }
  }

  private checkAbort() {
    if (this.signal?.aborted) throw abortError()
  }

  private async transact(request: number[], payloadLength: number, timeoutMs: number, code: UploadErrorCode) {
    this.checkAbort()
    try {
      await this.transport.write(Uint8Array.from([...request, EOP]))
      const response = await this.transport.read(payloadLength + 2, timeoutMs, this.signal)
      if (response.length !== payloadLength + 2 || response[0] !== INSYNC || response.at(-1) !== OK) {
        throw new Error('ACK không hợp lệ.')
      }
      return response.slice(1, -1)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (error instanceof UploadProtocolError) throw error
      throw new UploadProtocolError(code, `Leanbot bootloader không phản hồi đúng giao thức STK500 (${error instanceof Error ? error.message : String(error)})`, { cause: error })
    }
  }

  private async enterBootloader() {
    const { serial, uploader } = LEANBOT_PROFILE
    this.onProgress('resetting', 0)
    await this.transport.setDtr(false)
    await delay(serial.dtrPulseMs, this.signal)
    await this.transport.setDtr(true)
    await this.transport.flush(serial.flushBeforeSyncMs, this.signal)
    await delay(serial.bootloaderSettleMs, this.signal)

    this.onProgress('syncing', 0)
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.transact([0x30], 0, uploader.getSyncTimeoutMs, 'SYNC_ERROR')
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        if (attempt < 2) await delay(uploader.getSyncRepeatMs, this.signal)
      }
    }
    if (lastError) throw lastError
    await this.transact([0x50], 0, uploader.getSyncTimeoutMs, 'SYNC_ERROR')
  }

  private async loadAddress(page: FlashPage, code: UploadErrorCode) {
    const wordAddress = page.address >> 1
    await this.transact([0x55, wordAddress & 0xff, (wordAddress >> 8) & 0xff], 0, LEANBOT_PROFILE.uploader.loadAddressTimeoutMs, code)
  }

  private async program(pages: FlashPage[]) {
    this.onProgress('uploading', 0)
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]
      await this.loadAddress(page, 'WRITE_ERROR')
      await this.transact([0x64, page.data.length >> 8, page.data.length & 0xff, 0x46, ...page.data], 0, LEANBOT_PROFILE.uploader.writeFlashTimeoutMs, 'WRITE_ERROR')
      this.onProgress('uploading', (index + 1) / pages.length)
    }
  }

  private async verify(pages: FlashPage[]) {
    this.onProgress('verifying', 0)
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]
      await this.loadAddress(page, 'VERIFY_ERROR')
      const actual = await this.transact([0x74, page.data.length >> 8, page.data.length & 0xff, 0x46], page.data.length, LEANBOT_PROFILE.uploader.readFlashTimeoutMs, 'VERIFY_ERROR')
      const mismatch = actual.findIndex((value, offset) => value !== page.data[offset])
      if (mismatch >= 0) throw new UploadProtocolError('VERIFY_ERROR', `Xác minh firmware thất bại tại địa chỉ 0x${(page.address + mismatch).toString(16)}.`)
      this.onProgress('verifying', (index + 1) / pages.length)
    }
  }

  private async finish() {
    await this.transact([0x51], 0, LEANBOT_PROFILE.uploader.getSyncTimeoutMs, 'DISCONNECTED')
    await this.transport.setDtr(false)
    await delay(LEANBOT_PROFILE.serial.dtrPulseMs, this.signal)
    await this.transport.setDtr(true)
  }
}

export function uploadHex(transport: UploadTransport, hex: string, options: UploaderOptions = {}) {
  return new Stk500Uploader(transport, options).upload(hex)
}
