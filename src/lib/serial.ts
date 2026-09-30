import { LEANBOT_PROFILE } from '../leanbot/profile/leanbotDeviceProfile'
import type { UploadTransport } from '../leanbot/upload/transport'

type SerialPortInfo = { usbVendorId?: number; usbProductId?: number }
type SerialPortLike = {
  open(options: { baudRate: number; bufferSize?: number }): Promise<void>
  close(): Promise<void>
  getInfo?: () => SerialPortInfo
  readable?: ReadableStream<Uint8Array> | null
  writable?: WritableStream<Uint8Array> | null
  setSignals?: (signals: { dataTerminalReady?: boolean }) => Promise<void>
}

type SerialApi = {
  requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPortLike>
  getPorts?(): Promise<SerialPortLike[]>
}

type NavigatorWithSerial = Navigator & { serial?: SerialApi }

function timeoutError() { return new Error('Hết thời gian chờ phản hồi từ Leanbot.') }
function abortError() { return new DOMException('Đã hủy thao tác serial.', 'AbortError') }

export class LeanbotSerialClient {
  port: SerialPortLike | null = null
  reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  onText: (value: string) => void = () => undefined
  onDisconnect: () => void = () => undefined
  private reading = false
  private monitorPromise: Promise<void> | null = null
  private lastDevice: SerialPortInfo | null = null

  get supported() { return Boolean((navigator as NavigatorWithSerial).serial) }
  get connected() { return Boolean(this.port?.readable && this.port?.writable) }

  async connect() {
    if (globalThis.isSecureContext !== true) throw new Error('Web Serial yêu cầu HTTPS hoặc localhost an toàn.')
    const api = (navigator as NavigatorWithSerial).serial
    if (!api) throw new Error('Web Serial không được hỗ trợ trên trình duyệt này.')
    this.port = await api.requestPort({ filters: [...LEANBOT_PROFILE.serial.filters] })
    await this.openSelectedPort()
    return this.lastDevice ?? {}
  }

  async reconnect() {
    if (this.connected) return this.lastDevice ?? {}
    const api = (navigator as NavigatorWithSerial).serial
    if (!api?.getPorts || !this.lastDevice) return this.connect()
    const ports = await api.getPorts()
    this.port = ports.find((candidate) => {
      const info = candidate.getInfo?.() ?? {}
      return info.usbVendorId === this.lastDevice?.usbVendorId && info.usbProductId === this.lastDevice?.usbProductId
    }) ?? null
    if (!this.port) return this.connect()
    await this.openSelectedPort()
    return this.lastDevice
  }

  private async openSelectedPort() {
    if (!this.port) throw new Error('Không có cổng Leanbot được chọn.')
    await this.port.open({ baudRate: LEANBOT_PROFILE.serial.baudRate, bufferSize: LEANBOT_PROFILE.serial.bufferSize })
    await this.port.setSignals?.({ dataTerminalReady: true })
    this.lastDevice = this.port.getInfo?.() ?? null
    this.startReadLoop()
  }

  async disconnect() {
    const port = this.port
    await this.stopReadLoop()
    try { await port?.close() } catch {}
    this.port = null
    this.onDisconnect()
  }

  async send(text: string) {
    if (!this.port?.writable) throw new Error('Leanbot chưa kết nối.')
    const writer = this.port.writable.getWriter()
    try { await writer.write(new TextEncoder().encode(text)) }
    finally { writer.releaseLock() }
  }

  async reset() {
    if (!this.port?.setSignals) throw new Error('Cổng USB không hỗ trợ reset DTR.')
    await this.port.setSignals({ dataTerminalReady: false })
    await new Promise((resolve) => setTimeout(resolve, LEANBOT_PROFILE.serial.dtrPulseMs))
    await this.port.setSignals({ dataTerminalReady: true })
  }

  async createUploadTransport(): Promise<UploadTransport> {
    if (!this.port?.readable || !this.port.writable) throw new Error('Leanbot chưa kết nối.')
    await this.stopReadLoop()
    const port = this.port
    const readable = port.readable
    const writable = port.writable
    if (!readable || !writable) throw new Error('Cổng Leanbot không sẵn sàng.')
    const reader = readable.getReader()
    const writer = writable.getWriter()
    let queue = new Uint8Array()
    let pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null = null

    const nextChunk = async (timeoutMs: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw abortError()
      pendingRead ??= reader.read()
      let timer: ReturnType<typeof setTimeout> | undefined
      let abortHandler: (() => void) | undefined
      try {
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timeoutError()), timeoutMs) })
        const aborted = new Promise<never>((_, reject) => {
          abortHandler = () => reject(abortError())
          signal?.addEventListener('abort', abortHandler, { once: true })
        })
        const result = await Promise.race([pendingRead, timeout, aborted])
        pendingRead = null
        if (result.done) throw new Error('Cổng USB đã đóng.')
        return result.value ?? new Uint8Array()
      } finally {
        if (timer) clearTimeout(timer)
        if (abortHandler) signal?.removeEventListener('abort', abortHandler)
      }
    }

    const append = (chunk: Uint8Array) => {
      const next = new Uint8Array(queue.length + chunk.length)
      next.set(queue)
      next.set(chunk, queue.length)
      queue = next
    }

    return {
      write: (data) => writer.write(data),
      read: async (length, timeoutMs, signal) => {
        const deadline = Date.now() + timeoutMs
        while (queue.length < length) {
          const remaining = deadline - Date.now()
          if (remaining <= 0) throw timeoutError()
          append(await nextChunk(remaining, signal))
        }
        const value = queue.slice(0, length)
        queue = queue.slice(length)
        return value
      },
      setDtr: async (value) => { await port.setSignals?.({ dataTerminalReady: value }) },
      flush: async (durationMs, signal) => {
        queue = new Uint8Array()
        const deadline = Date.now() + durationMs
        while (Date.now() < deadline) {
          try { await nextChunk(deadline - Date.now(), signal) }
          catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; break }
        }
        queue = new Uint8Array()
      },
      close: async () => {
        try { reader.releaseLock() } catch {}
        try { writer.releaseLock() } catch {}
        this.startReadLoop()
      },
    }
  }

  private startReadLoop() {
    if (!this.port?.readable || this.reading) return
    this.reading = true
    const reader = this.port.readable.getReader()
    this.reader = reader
    const decoder = new TextDecoder()
    this.monitorPromise = (async () => {
      try {
        while (this.reading) {
          const { value, done } = await reader.read()
          if (done) break
          if (value) this.onText(decoder.decode(value, { stream: true }))
        }
      } catch (error) {
        if (this.reading) console.warn('Serial read ended:', error)
      } finally {
        try { reader.releaseLock() } catch {}
        if (this.reader === reader) this.reader = null
        this.reading = false
      }
    })()
  }

  private async stopReadLoop() {
    this.reading = false
    try { await this.reader?.cancel() } catch {}
    await this.monitorPromise?.catch(() => undefined)
    this.monitorPromise = null
  }
}
