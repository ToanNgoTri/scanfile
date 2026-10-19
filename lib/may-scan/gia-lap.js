import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { phien } from './phien'

/**
 * Máy scan giả để thử app khi chưa cắm DR-F120: mỗi lần "quét" ra 1, 2 hoặc 4
 * trang PNG (nghiêng về 4 để thấy quy tắc gộp), trên trang in số thứ tự lớn.
 * Ảnh 75 dpi khổ A4 cho nhẹ.
 */
export const DPI_GIA_LAP = 75
const W = 620
const H = 877

const CHU = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function khoi(loai, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(loai), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function veTrang(so) {
  const px = Buffer.alloc(W * H, 250)
  const o = (x, y, w, h, v) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * W + i] = v
  }
  o(40, 40, W - 80, 3, 60)
  for (let k = 0; k < 6; k++) o(60, 80 + k * 28, 300 + ((k * 97) % 180), 10, 150)
  for (let k = 0; k < 10; k++) o(60, 600 + k * 22, 420 + ((k * 53) % 80), 8, 180)
  const chu = String(so)
  const s = 36
  const rong = chu.length * 6 * s
  let x0 = Math.round((W - rong) / 2)
  for (const c of chu) {
    CHU[c].forEach((dong, r) =>
      [...dong].forEach((b, cot) => b === '1' && o(x0 + cot * s, 300 + r * s - 80, s, s, 30)),
    )
    x0 += 6 * s
  }
  const raw = Buffer.alloc((W + 1) * H)
  for (let y = 0; y < H; y++) px.copy(raw, y * (W + 1) + 1, y * W, (y + 1) * W)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    khoi('IHDR', ihdr),
    khoi('IDAT', deflateSync(raw)),
    khoi('IEND', Buffer.alloc(0)),
  ])
}

const g = globalThis
g.__giaLapDem ??= 0

/**
 * Giống máy thật: kéo từng tờ mất chút thời gian, bấm Dừng giữa chừng thì
 * thôi — ảnh đã ra bị bỏ (route xoá cả lô khi đã dừng), như NAPS2. Bấm Xong thì
 * dừng kéo giấy nhưng GIỮ các trang đã ra.
 * GIA_LAP_SO_TRANG cố định số trang mỗi lượt (để test), mặc định ngẫu nhiên.
 */
export async function scanGiaLap(dir) {
  const n = Number(process.env.GIA_LAP_SO_TRANG) || [4, 4, 1, 2, 4, 1][Math.floor(Math.random() * 6)]
  for (let k = 1; k <= n; k++) {
    await new Promise((r) => setTimeout(r, 700))
    if (phien.daDung || phien.xong) return
    g.__giaLapDem += 1
    await writeFile(join(dir, `${String(k).padStart(4, '0')}.png`), veTrang(g.__giaLapDem))
  }
}
