import { spawn } from 'node:child_process'
import { chayLenh } from './chay-lenh'
import { timTroGiup } from './tro-giup'

/**
 * Trạng thái lượt quét đang chạy — dùng chung giữa route /api/scan (POST đang
 * chờ máy kéo giấy) và các request khác (GET hỏi trạng thái, DELETE dừng).
 * Hai request đó KHÔNG đi qua hàng đợi tuanTu, vì phải chạy được trong lúc đang quét.
 * Gắn vào globalThis vì dev server nạp lại module khi sửa code.
 */
const g = globalThis
g.__phienScan ??= { dang: false, daDung: false, hopThoai: '', con: [] }
export const phien = g.__phienScan

export function batDauPhien() {
  Object.assign(phien, {
    dang: true, daDung: false, xong: false, biKhoa: false, hopThoai: '', loiDriver: '', con: [], batDau: Date.now(),
  })
}

/** Thời gian chờ NAPS2 tự kết thúc sau khi bấm Xong, trước khi ngắt và nhặt trang từ recovery. */
const CHO_XONG = 15_000

/**
 * Nút "Xong": kết thúc lượt quét NHƯNG GIỮ các trang đã quét (khác Dừng = huỷ).
 *  1. bấm Cancel mọi hộp thoại driver đang chờ (thường là "thêm giấy?") → NAPS2
 *     thường tự kết thúc và xuất trang như bình thường
 *  2. quá CHO_XONG vẫn chưa xong → ngắt; naps2.js nhặt trang trong thư mục recovery
 */
export async function xongPhien() {
  if (!phien.dang) return false
  phien.xong = true
  if (process.platform === 'win32' && timTroGiup()) {
    try {
      const { out } = await chayLenh(timTroGiup(), ['dong-het-hop-thoai'], { timeout: 20000 })
      phien.xongDongHopThoai = Number(out.trim()) || 0
    } catch {
      /* không đóng được thì bước 2 lo */
    }
  }
  const batDau = phien.batDau
  setTimeout(() => {
    if (phien.dang && phien.batDau === batDau) {
      phien.xongPhaiNgat = true
      for (const p of phien.con) giet(p)
    }
  }, CHO_XONG)
  return true
}

export function ketThucPhien() {
  Object.assign(phien, { dang: false, hopThoai: '', con: [] })
}

/** Gắn tiến trình con (NAPS2, PowerShell WIA) vào phiên để còn dừng được. */
export function ganTienTrinh(p) {
  phien.con.push(p)
}

/**
 * Dọn tiến trình wiawow64.exe bị bỏ lại.
 *
 * Driver TWAIN của DR-F120 là 32-bit; nó mở máy qua WIA nên Windows tạo một
 * wiawow64.exe (COM server) cho mỗi lượt quét. Lượt quét kết thúc bất thường
 * (bị Dừng, lỗi giữa chừng) thì wiawow64 KHÔNG tự tắt mà vẫn giữ khoá máy —
 * mọi lượt sau báo "Thiết bị này có thể không thể khóa… (-4630)". Đã gặp thật.
 *
 * tuLuc: chỉ tắt những cái tạo từ thời điểm đó (của lượt quét này); null = tắt hết
 * của người dùng hiện tại (khi đã biết máy đang bị khoá).
 */
export async function donWiaTreo(tuLuc) {
  if (process.platform !== 'win32') return 0
  if (timTroGiup()) {
    try {
      const { out } = await chayLenh(timTroGiup(), ['don-wia', String(tuLuc ?? 0)], { timeout: 30000 })
      return Number(out.trim()) || 0
    } catch {
      return 0
    }
  }
  const loc = tuLuc ? ` | Where-Object { $_.CreationDate -ge [datetime]::Parse('${new Date(tuLuc - 2000).toISOString()}').ToLocalTime() }` : ''
  try {
    const { out } = await chayLenh(
      'powershell.exe',
      [
        '-NoProfile', '-NonInteractive', '-Command',
        `$n = 0; Get-CimInstance Win32_Process -Filter "Name='wiawow64.exe'"${loc} | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; $n++ } catch {} }; $n`,
      ],
      { timeout: 30000 },
    )
    return Number(out.trim()) || 0
  } catch {
    return 0
  }
}

/** Driver báo máy đang bị giữ (-4630). */
export class LoiKhoaMay extends Error {
  constructor() {
    super(
      'Máy scan đang bị chương trình khác giữ (lỗi -4630). App đã thử giải phóng nhưng không được.\n' +
        'Tắt các phần mềm quét khác (CaptureOnTouch, Captiva…), rồi TẮT/BẬT lại nguồn máy scan và thử lại.',
    )
  }
}

export class LoiDaDung extends Error {
  constructor() {
    super('Đã dừng scan.')
  }
}

export function kiemDaDung() {
  if (phien.daDung) throw new LoiDaDung()
}

/**
 * Dừng ngay: giết cả cây tiến trình (NAPS2.Console → NAPS2.Worker giữ driver
 * TWAIN). Trang đang kéo dở có thể vẫn ra khỏi máy; NAPS2 chỉ xuất ảnh khi
 * quét xong cả khay nên lượt bị dừng không giữ được ảnh nào.
 */
export function dungPhien() {
  if (!phien.dang) return false
  phien.daDung = true
  for (const p of phien.con) giet(p)
  return true
}

/** Giết cả cây tiến trình (NAPS2.Console → NAPS2.Worker giữ driver TWAIN). */
export function giet(p) {
  if (!p?.pid || p.exitCode !== null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {})
  } else {
    p.kill('SIGKILL')
  }
}
