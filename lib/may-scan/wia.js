import { chayLenh, PS_ARGS, timScript } from './chay-lenh'
import { ganTienTrinh } from './phien'
import { goiTroGiup, timTroGiup } from './tro-giup'

/**
 * Gọi WIA qua scanfile-tro-giup.exe; chưa biên dịch .exe (chỉ ở project) thì
 * lùi về wia.ps1. Hai đường nhận cùng lệnh, trả cùng dạng JSON.
 *   lenh: 'list' | 'giay' | 'scan'
 */
async function goi(lenh, { dir, dpi, mau, nguon, id } = {}) {
  // lượt quét WIA cũng phải dừng được (đọc cảm biến thì ngoài phiên, dừng cũng chẳng sao)
  const opts = { onSpawn: ganTienTrinh }
  if (timTroGiup()) {
    const args = lenh === 'scan' ? ['wia-scan', dir, String(dpi), mau, nguon, ...(id ? [id] : [])] : [`wia-${lenh}`]
    return goiTroGiup(args, opts)
  }
  const ps = lenh === 'scan'
    ? ['-Action', 'scan', '-OutDir', dir, '-Dpi', String(dpi), '-Mau', mau, '-Nguon', nguon, ...(id ? ['-DeviceId', id] : [])]
    : ['-Action', lenh]
  const { out, err } = await chayLenh('powershell.exe', [...PS_ARGS, timScript('wia.ps1'), ...ps], opts)
  const dong = out.trim().split(/\r?\n/).pop() ?? ''
  try {
    return JSON.parse(dong)
  } catch {
    throw new Error('WIA trả về kết quả lạ: ' + (err || out).trim().slice(0, 500))
  }
}

export async function dsThietBiWia() {
  const r = await goi('list')
  if (r.loi) throw new Error(r.loi)
  // ConvertTo-Json của PS 5.1 biến mảng 1 phần tử thành object
  return [].concat(r.thietBi ?? [])
}

/**
 * Đọc cảm biến khay giấy mà không quét. Dùng cho cả TWAIN: tên máy TWAIN và
 * WIA khác nhau nên không truyền id, lấy máy scan WIA đầu tiên.
 * Trả về true/false, hoặc null nếu máy không hỗ trợ.
 */
export async function coGiayWia() {
  const r = await goi('giay')
  return r.loi ? null : !!r.coGiay
}

export async function scanWia(dir, ch) {
  const r = await goi('scan', { dir, dpi: ch.dpi, mau: ch.mau, nguon: ch.nguon, id: ch.thietBi })
  if (r.loi) throw new Error(r.loi)
  return { hetGiay: !!r.hetGiay }
}
