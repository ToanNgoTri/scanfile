import { appendFile, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Nhật ký quét: nhat-ky-scan.txt cạnh app (thư mục gói khi chạy bản đóng gói).
 * Lỗi xảy ra ở máy khác thì người dùng gửi file này về là đọc được chuyện gì
 * đã xảy ra: cảm biến giấy báo gì, NAPS2 in gì, driver bật hộp thoại nào.
 * Quá 2 MB thì đổi tên thành .cu và ghi file mới.
 */
const FILE = join(process.cwd(), 'nhat-ky-scan.txt')

export async function ghiNhatKy(...phan) {
  try {
    const s = await stat(FILE).catch(() => null)
    if (s && s.size > 2_000_000) await rename(FILE, FILE + '.cu')
    const luc = new Date().toLocaleString('vi-VN', { hour12: false })
    const noi = phan.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
    await appendFile(FILE, `[${luc}] ${noi.replace(/\r?\n/g, '\n    ')}\n`, 'utf8')
  } catch {
    // ghi nhật ký hỏng thì thôi, không được làm hỏng lượt quét
  }
}
