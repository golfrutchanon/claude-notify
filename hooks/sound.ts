// copvang-notify — งานเสียงล้วนๆ ไม่แตะ $ (ทดสอบได้โดยไม่ต้องมีเครื่องยนต์)
//
// ทำไมต้องมีไฟล์นี้: Mod ห้ามแจกไฟล์เสียงของ Apple/Microsoft ไปกับตัว (ลิขสิทธิ์)
// เลยอ่านเสียงที่มีอยู่แล้วในเครื่องลูกค้า แล้วส่งให้ $.audio.play เป็น base64
// และเพื่อให้ "Glass ×4 แล้ว Hero" ดังต่อกันเป๊ะเหมือน afplay เดิม ไม่ว่าเครื่องเล่นจะรอจบหรือไม่
// จึงแปลง AIFF/WAV เป็น PCM แล้วต่อกันเป็นไฟล์ WAV ก้อนเดียว

/** เสียง PCM ที่ถอดแล้ว: ไบต์เป็น little-endian เรียงแบบ WAV */
export type Pcm = { channels: number; rate: number; bits: number; data: Uint8Array }

/** สิ่งที่ส่งให้ $.audio.play */
export type Clip = { base64: string; mime: string }

const ascii = (b: Uint8Array, at: number, n: number): string =>
  String.fromCharCode(...b.subarray(at, at + n))

const be16 = (b: Uint8Array, at: number): number => (b[at]! << 8) | b[at + 1]!
const be32 = (b: Uint8Array, at: number): number =>
  ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!
const le16 = (b: Uint8Array, at: number): number => b[at]! | (b[at + 1]! << 8)
const le32 = (b: Uint8Array, at: number): number =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16)) + ((b[at + 3]! << 24) >>> 0)

/** เลขทศนิยม 80 บิตของ AIFF (อัตราสุ่ม) */
function extended80(b: Uint8Array, at: number): number {
  const exp = (((b[at]! & 0x7f) << 8) | b[at + 1]!) - 16383
  const hi = be32(b, at + 2)
  const lo = be32(b, at + 6)
  const mant = hi * 2 ** 32 + lo
  const v = mant * 2 ** (exp - 63)
  return b[at]! & 0x80 ? -v : v
}

/** ถอด AIFF / AIFC (ไม่บีบอัด หรือ sowt) เป็น PCM · ไม่รองรับคืน undefined */
export function parseAiff(b: Uint8Array): Pcm | undefined {
  if (b.length < 12 || ascii(b, 0, 4) !== 'FORM') return undefined
  const form = ascii(b, 8, 4)
  if (form !== 'AIFF' && form !== 'AIFC') return undefined
  let channels = 0, bits = 0, rate = 0, littleEndian = false
  let sound: Uint8Array | undefined
  let at = 12
  while (at + 8 <= b.length) {
    const id = ascii(b, at, 4)
    const size = be32(b, at + 4)
    const body = at + 8
    if (id === 'COMM') {
      channels = be16(b, body)
      bits = be16(b, body + 6)
      rate = Math.round(extended80(b, body + 8))
      if (form === 'AIFC' && size >= 22) {
        const comp = ascii(b, body + 18, 4)
        if (comp === 'sowt') littleEndian = true
        else if (comp !== 'NONE') return undefined
      }
    } else if (id === 'SSND') {
      const offset = be32(b, body)
      sound = b.subarray(body + 8 + offset, Math.min(b.length, body + size))
    }
    at = body + size + (size & 1)
  }
  if (!sound || !channels || !bits || !rate) return undefined
  const width = Math.ceil(bits / 8)
  const frames = Math.floor(sound.length / (width * channels))
  const n = frames * width * channels
  const data = new Uint8Array(n)
  if (littleEndian || width === 1) {
    data.set(sound.subarray(0, n))
    // AIFF 8 บิตเป็น signed ส่วน WAV 8 บิตเป็น unsigned
    if (width === 1 && !littleEndian) for (let i = 0; i < n; i++) data[i] = (sound[i]! + 128) & 0xff
  } else {
    for (let i = 0; i < n; i += width) for (let k = 0; k < width; k++) data[i + k] = sound[i + width - 1 - k]!
  }
  return { channels, rate, bits: width * 8, data }
}

/** ถอด WAV แบบ PCM (รวม WAVE_FORMAT_EXTENSIBLE ที่เป็น PCM) · ไม่รองรับคืน undefined */
export function parseWav(b: Uint8Array): Pcm | undefined {
  if (b.length < 12 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WAVE') return undefined
  let fmt = 0, channels = 0, rate = 0, bits = 0
  let data: Uint8Array | undefined
  let at = 12
  while (at + 8 <= b.length) {
    const id = ascii(b, at, 4)
    const size = le32(b, at + 4)
    const body = at + 8
    if (id === 'fmt ') {
      fmt = le16(b, body)
      channels = le16(b, body + 2)
      rate = le32(b, body + 4)
      bits = le16(b, body + 14)
      if (fmt === 0xfffe && size >= 26) fmt = le16(b, body + 24)
    } else if (id === 'data') {
      data = b.subarray(body, Math.min(b.length, body + size))
    }
    at = body + size + (size & 1)
  }
  if (fmt !== 1 || !data || !channels || !rate || !bits) return undefined
  const width = Math.ceil(bits / 8)
  const n = Math.floor(data.length / (width * channels)) * width * channels
  return { channels, rate, bits: width * 8, data: data.subarray(0, n) }
}

export const sameFormat = (a: Pcm, b: Pcm): boolean =>
  a.channels === b.channels && a.rate === b.rate && a.bits === b.bits

/** ต่อเสียงหลายชิ้น (รูปแบบเดียวกัน) เป็นไฟล์ WAV ก้อนเดียว */
export function joinToWav(parts: readonly Pcm[]): Uint8Array {
  const first = parts[0]!
  const total = parts.reduce((s, p) => s + p.data.length, 0)
  const out = new Uint8Array(44 + total)
  const v = new DataView(out.buffer)
  const tag = (at: number, s: string) => { for (let i = 0; i < 4; i++) out[at + i] = s.charCodeAt(i) }
  const block = first.channels * (first.bits / 8)
  tag(0, 'RIFF'); v.setUint32(4, 36 + total, true); tag(8, 'WAVE')
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, first.channels, true); v.setUint32(24, first.rate, true)
  v.setUint32(28, first.rate * block, true); v.setUint16(32, block, true); v.setUint16(34, first.bits, true)
  tag(36, 'data'); v.setUint32(40, total, true)
  let at = 44
  for (const p of parts) { out.set(p.data, at); at += p.data.length }
  return out
}

/** ความยาวเสียงเป็นมิลลิวินาที */
export const durationMs = (p: Pcm): number =>
  Math.round((p.data.length / (p.channels * (p.bits / 8) * p.rate)) * 1000)

// base64 เขียนเอง: สภาพแวดล้อมของ Mod ไม่มี Node และไม่การันตี btoa/atob
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const REV = new Int16Array(128).fill(-1)
for (let i = 0; i < ABC.length; i++) REV[ABC.charCodeAt(i)] = i

export function toBase64(b: Uint8Array): string {
  const chunks: string[] = []
  let line = ''
  let i = 0
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i]! << 16) | (b[i + 1]! << 8) | b[i + 2]!
    line += ABC[n >> 18]! + ABC[(n >> 12) & 63]! + ABC[(n >> 6) & 63]! + ABC[n & 63]!
    if (line.length >= 8192) { chunks.push(line); line = '' }
  }
  const rest = b.length - i
  if (rest === 1) {
    const n = b[i]! << 16
    line += ABC[n >> 18]! + ABC[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (b[i]! << 16) | (b[i + 1]! << 8)
    line += ABC[n >> 18]! + ABC[(n >> 12) & 63]! + ABC[(n >> 6) & 63]! + '='
  }
  chunks.push(line)
  return chunks.join('')
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0, acc = 0, bitsHeld = 0
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | REV[clean.charCodeAt(i)]!
    bitsHeld += 6
    if (bitsHeld >= 8) { bitsHeld -= 8; out[o++] = (acc >> bitsHeld) & 0xff }
  }
  return out.subarray(0, o)
}

/** ถอดไฟล์เสียงตามนามสกุล */
export function decode(name: string, bytes: Uint8Array): Pcm | undefined {
  return /\.aif[fc]?$/i.test(name) ? parseAiff(bytes) : /\.wav$/i.test(name) ? parseWav(bytes) : undefined
}

export function mimeOf(name: string): string {
  return /\.aif[fc]?$/i.test(name) ? 'audio/aiff' : /\.mp3$/i.test(name) ? 'audio/mpeg' : 'audio/wav'
}

/**
 * จากไฟล์ที่อ่านได้ ทำเป็นคลิปที่เล่นทีละชิ้น
 * ทุกชิ้นถอดได้และรูปแบบตรงกัน → ต่อเป็น WAV ก้อนเดียว (เล่นติดกันแน่นอน)
 * ไม่งั้น → คืนทีละไฟล์ตามเดิม ให้ผู้เรียกเล่นทีละชิ้น
 */
export function buildClips(files: readonly { name: string; bytes: Uint8Array }[]): { clips: Clip[]; ms: number[] } {
  if (files.length === 0) return { clips: [], ms: [] }
  const pcm = files.map(f => decode(f.name, f.bytes))
  const all = pcm.every((p): p is Pcm => p !== undefined)
  if (all && pcm.every(p => sameFormat(p, pcm[0]!))) {
    return { clips: [{ base64: toBase64(joinToWav(pcm)), mime: 'audio/wav' }], ms: [pcm.reduce((s, p) => s + durationMs(p), 0)] }
  }
  return {
    clips: files.map(f => ({ base64: toBase64(f.bytes), mime: mimeOf(f.name) })),
    ms: pcm.map(p => (p ? durationMs(p) : 1000)),
  }
}
