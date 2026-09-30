import { LEANBOT_PROFILE } from '../profile/leanbotDeviceProfile'

export interface FlashPage { address: number; data: Uint8Array }

function recordBytes(line: string) {
  if (!line.startsWith(':') || line.length < 11 || line.length % 2 === 0) throw new Error('Intel HEX không hợp lệ.')
  const record = Array.from({ length: (line.length - 1) / 2 }, (_, index) => Number.parseInt(line.slice(1 + index * 2, 3 + index * 2), 16))
  if (record.some(Number.isNaN)) throw new Error('Intel HEX chứa ký tự không hợp lệ.')
  const length = record[0]
  if (line.length !== 11 + length * 2) throw new Error('Độ dài Intel HEX không đúng.')
  if (record.reduce((sum, value) => (sum + value) & 0xff, 0) !== 0) throw new Error('Checksum Intel HEX không đúng.')
  return record
}

export function decodeIntelHex(text: string): Map<number, number> {
  const bytes = new Map<number, number>()
  let upper = 0
  let eof = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (eof) throw new Error('Intel HEX có dữ liệu sau EOF.')
    const record = recordBytes(line)
    const length = record[0]
    const address = (record[1] << 8) | record[2]
    const type = record[3]
    const data = record.slice(4, 4 + length)

    if (type === 0x00) {
      for (let offset = 0; offset < data.length; offset += 1) {
        const absolute = upper + address + offset
        const previous = bytes.get(absolute)
        if (previous !== undefined && previous !== data[offset]) throw new Error(`Intel HEX có dữ liệu chồng lấp tại 0x${absolute.toString(16)}.`)
        bytes.set(absolute, data[offset])
      }
    } else if (type === 0x01) {
      if (length !== 0 || address !== 0) throw new Error('Bản ghi EOF Intel HEX không hợp lệ.')
      eof = true
    } else if (type === 0x02) {
      if (length !== 2) throw new Error('Bản ghi địa chỉ segment Intel HEX không hợp lệ.')
      upper = (((data[0] << 8) | data[1]) << 4) >>> 0
    } else if (type === 0x04) {
      if (length !== 2) throw new Error('Bản ghi địa chỉ tuyến tính Intel HEX không hợp lệ.')
      upper = (((data[0] << 8) | data[1]) << 16) >>> 0
    } else if (type !== 0x03 && type !== 0x05) {
      throw new Error(`Loại bản ghi Intel HEX 0x${type.toString(16)} không được hỗ trợ.`)
    }
  }
  if (!eof) throw new Error('Intel HEX thiếu bản ghi kết thúc.')
  return bytes
}

export function toFlashPages(hex: string, pageSize = LEANBOT_PROFILE.uploader.pageSize): FlashPage[] {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('Kích thước flash page không hợp lệ.')
  const memory = decodeIntelHex(hex)
  if (!memory.size) return []
  const addresses = [...memory.keys()]
  const first = Math.floor(Math.min(...addresses) / pageSize) * pageSize
  const last = Math.floor(Math.max(...addresses) / pageSize) * pageSize
  const pages: FlashPage[] = []
  for (let address = first; address <= last; address += pageSize) {
    const data = new Uint8Array(pageSize).fill(0xff)
    let used = false
    for (let offset = 0; offset < pageSize; offset += 1) {
      const value = memory.get(address + offset)
      if (value !== undefined) { data[offset] = value; used = true }
    }
    if (used) pages.push({ address, data })
  }
  return pages
}
