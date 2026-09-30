export interface UploadTransport {
  write(data: Uint8Array): Promise<void>
  read(length: number, timeoutMs: number, signal?: AbortSignal): Promise<Uint8Array>
  setDtr(value: boolean): Promise<void>
  flush(durationMs: number, signal?: AbortSignal): Promise<void>
  close(): Promise<void>
}
