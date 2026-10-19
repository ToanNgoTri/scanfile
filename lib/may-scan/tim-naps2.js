import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * NAPS2 là phần mềm quét miễn phí, có bản portable và dòng lệnh. Nó nói chuyện
 * với driver TWAIN của Canon — kể cả driver TWAIN 32-bit, nhờ tiến trình worker
 * riêng — nên là đường chắc nhất cho DR-F120. Gói đóng sẵn mang NAPS2 portable
 * ở tools/naps2/, máy đích chỉ cần cài driver máy scan.
 */
const TEN = 'NAPS2.Console.exe'

/** Tìm NAPS2.Console.exe trong thư mục, sâu tối đa `sau` cấp (cấu trúc zip portable đổi theo phiên bản). */
function timTrong(dir, sau) {
  if (!existsSync(dir)) return null
  if (existsSync(join(dir, TEN))) return join(dir, TEN)
  if (sau <= 0) return null
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const f = timTrong(join(dir, e.name), sau - 1)
    if (f) return f
  }
  return null
}

let daTim
export function timNaps2() {
  if (process.env.NAPS2_PATH && existsSync(process.env.NAPS2_PATH)) return process.env.NAPS2_PATH
  if (daTim && existsSync(/*turbopackIgnore: true*/ daTim)) return daTim
  daTim =
    timTrong(join(process.cwd(), 'tools', 'naps2'), 3) ??
    ['C:\\Program Files\\NAPS2', 'C:\\Program Files (x86)\\NAPS2'].map((d) => join(d, TEN)).find((p) => existsSync(p)) ??
    null
  return daTim
}
