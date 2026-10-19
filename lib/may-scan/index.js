import { ghiNhatKy } from '../nhat-ky'
import { chayLenh } from './chay-lenh'
import { DPI_GIA_LAP, scanGiaLap } from './gia-lap'
import { batDauPhien, donWiaTreo, ketThucPhien, kiemDaDung, LoiDaDung, LoiKhoaMay, phien } from './phien'
import { dsThietBiNaps2, scanNaps2 } from './naps2'
import { timNaps2 } from './tim-naps2'
import { goiTroGiup, timTroGiup } from './tro-giup'
import { coGiayWia, dsThietBiWia, scanWia } from './wia'

/**
 * Khay có giấy chưa — để scan liên tục chỉ bắt đầu quét khi đã đặt giấy,
 * thay vì quét thử rồi vướng hộp thoại "No page" của driver.
 * null = không biết (máy không báo qua WIA) → client cứ quét như cũ.
 */
export async function coGiay(ch) {
  if (ch.driver === 'gia-lap') return true
  if (process.platform !== 'win32') return null
  let g
  try {
    g = await coGiayWia()
  } catch (e) {
    g = null
    ghiNhatKy('cảm biến giấy lỗi:', e instanceof Error ? e.message : String(e))
  }
  // hỏi mỗi giây nên chỉ ghi khi đổi, không thì nhật ký đầy rác
  if (globalThis.__giayCu !== g) ghiNhatKy('cảm biến giấy:', g === null ? 'không đọc được' : g ? 'CÓ giấy' : 'khay trống')
  globalThis.__giayCu = g
  return g
}

export const DRIVER = ['twain', 'wia', 'gia-lap']

export function trangThai() {
  return { naps2: timNaps2(), laWindows: process.platform === 'win32' }
}

/**
 * Danh sách máy trống thì xem Windows có thấy máy Canon (VID 1083) trên USB
 * không: thấy mà Status khác OK = cắm rồi nhưng chưa cài driver — lỗi hay gặp
 * nhất khi mang gói sang máy mới.
 */
export async function goiYKhiTrong() {
  if (process.platform !== 'win32') return ''
  try {
    let ds
    if (timTroGiup()) {
      ds = (await goiTroGiup(['usb-canon'], { timeout: 30000 })).thietBi ?? []
    } else {
      const { out } = await chayLenh(
        'powershell.exe',
        [
          '-NoProfile', '-NonInteractive', '-Command',
          "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'USB\\VID_1083*' } | Select-Object Status,FriendlyName | ConvertTo-Json -Compress",
        ],
        { timeout: 30000 },
      )
      ds = out.trim() ? [].concat(JSON.parse(out)).map((d) => ({ status: d.Status, ten: d.FriendlyName })) : []
    }
    if (!ds.length) return 'Windows không thấy máy scan Canon nào trên USB — kiểm cáp và bật nguồn máy.'
    const loi = ds.find((d) => d.status !== 'OK')
    if (loi) {
      return `Windows thấy "${loi.ten?.trim() || 'máy Canon'}" trên USB nhưng CHƯA CÓ DRIVER. ` +
        'Cài "ISIS/TWAIN Driver" của Canon cho DR-F120, rút ra cắm lại cáp, rồi bấm ↻.'
    }
    return ''
  } catch {
    return ''
  }
}

/**
 * Máy Canon (VID 1083) còn cắm trên USB không: true / false, null = không kiểm
 * được (không có trợ giúp, không phải Windows) → nơi gọi coi như không biết.
 */
async function mayConCam() {
  if (process.platform !== 'win32' || !timTroGiup()) return null
  try {
    const ds = (await goiTroGiup(['usb-canon'], { timeout: 30000 })).thietBi ?? []
    return ds.length > 0
  } catch {
    return null
  }
}

export async function dsThietBi(driver) {
  if (driver === 'gia-lap') return [{ id: 'gia-lap', ten: 'Máy scan giả lập (để thử)' }]
  // WIA thử đường PowerShell trước (không cần NAPS2), NAPS2 làm dự phòng
  if (driver === 'wia' && !timNaps2()) return dsThietBiWia()
  return dsThietBiNaps2(driver)
}

/**
 * Quét MỘT lần vào `dir`. Trả về { dpi, hetGiay, log } — dpi thật của ảnh
 * (giả lập dùng dpi riêng) để PDF ra đúng khổ giấy.
 */
export async function scan(dir, ch) {
  batDauPhien()
  try {
    if (ch.driver === 'gia-lap') {
      await scanGiaLap(dir)
      kiemDaDung()
      return { dpi: DPI_GIA_LAP, hetGiay: false, log: '' }
    }
    if (ch.driver === 'wia' && !timNaps2()) {
      const r = await scanWia(dir, ch)
      kiemDaDung()
      return { dpi: ch.dpi, hetGiay: r.hetGiay, log: '' }
    }
    let r
    try {
      r = await scanNaps2(dir, ch)
    } catch (e) {
      if (!(e instanceof LoiKhoaMay)) throw e
      // máy bị wiawow64 của lượt cũ giữ: dọn hết rồi thử lại đúng 1 lần
      await donWiaTreo(null)
      phien.biKhoa = false
      phien.hopThoai = ''
      r = await scanNaps2(dir, ch)
    }
    // Máy tắt / rút cáp: NAPS2 trả "0 page(s) scanned" y như khay trống, có khi
    // không kèm hộp thoại lỗi nào (đã gặp). Ra 0 trang thì xem máy còn trên USB không.
    if (r.hetGiay && (await mayConCam()) === false) {
      throw new Error('Máy scan không còn kết nối với máy tính — kiểm cáp USB và bật nguồn máy (máy có đang tự tắt / ngủ không?).')
    }
    return { dpi: ch.dpi, hetGiay: r.hetGiay, log: r.log }
  } catch (e) {
    // bị giết giữa chừng thì lỗi gốc (WIA trả về lạ, NAPS2 mã lạ…) vô nghĩa — báo là đã dừng
    if (phien.daDung) {
      ghiNhatKy('người dùng bấm Dừng scan')
      throw new LoiDaDung()
    }
    ghiNhatKy('lỗi quét:', e instanceof Error ? e.message : String(e))
    throw e
  } finally {
    // lượt nào cũng dọn wiawow64 nó sinh ra — lượt bình thường thì không còn gì để dọn
    if (ch.driver !== 'gia-lap') {
      const n = await donWiaTreo(phien.batDau)
      if (n) ghiNhatKy(`đã dọn ${n} tiến trình wiawow64 sót lại`)
    }
    ketThucPhien()
  }
}
