import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { chayLenh } from './chay-lenh'

/**
 * scanfile-tro-giup.exe (tro-giup/scanfile-tro-giup.cs) làm các việc trước đây
 * giao cho PowerShell: WIA, canh hộp thoại driver, dọn wiawow64, kiểm USB.
 * Node gọi `powershell -ExecutionPolicy Bypass` chạy ẩn bị phần mềm bảo mật ở
 * máy khách chặn, nên bản đóng gói luôn mang .exe này và không gọi PowerShell.
 *
 * Không có .exe (chạy từ project mà chưa `node scripts/bien-dich-tro-giup.mjs`)
 * thì null — nơi gọi lùi về script .ps1 cũ.
 */
export function timTroGiup() {
  const f = join(/*turbopackIgnore: true*/ process.cwd(), 'tools', 'tro-giup', 'scanfile-tro-giup.exe')
  return existsSync(f) ? f : null
}

/** Chạy một lệnh của trợ giúp, đọc dòng JSON cuối cùng. */
export async function goiTroGiup(args, opts) {
  const exe = timTroGiup()
  const { out, err } = await chayLenh(exe, args, opts)
  const dong = out.trim().split(/\r?\n/).pop() ?? ''
  try {
    return JSON.parse(dong)
  } catch {
    throw new Error('scanfile-tro-giup trả về kết quả lạ: ' + (err || out).trim().slice(0, 500))
  }
}
