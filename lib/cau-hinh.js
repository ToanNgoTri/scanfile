import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Cấu hình lưu ở cau-hinh.json cạnh app (thư mục gói khi chạy bản đóng gói),
 * để mang gói sang máy khác vẫn nhớ thư mục ra và máy scan đã chọn.
 */
const FILE = join(process.cwd(), 'cau-hinh.json')

function homNay() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function macDinh() {
  return {
    thuMucGoc: join(homedir(), 'Documents', 'Scan'),
    thuMucCon: `Scan-${homNay()}`,
    // "thư mục con của con" chung ở trên: file mới quét lấy theo, nháp đang theo nó thì đổi theo ('' = ngay trong thư mục con)
    thuMucCap3: '',
    // twain | wia | gia-lap
    driver: 'twain',
    thietBi: '',
    // tu-dong (khay nạp 2 mặt; khay trống → mặt kính) | duplex (khay nạp 2 mặt)
    // | feeder (khay nạp 1 mặt) | glass (mặt kính)
    nguon: 'tu-dong',
    dpi: 300,
    // color | gray | bw
    mau: 'color',
    // quy-tac: đúng `soTrangGop` trang thì gộp 1 PDF, khác thì mỗi ảnh 1 PDF
    // gop-ca-lo: cả lần scan thành 1 PDF · tach: luôn mỗi ảnh 1 PDF
    cachGop: 'quy-tac',
    soTrangGop: 4,
    tienToTen: 'scan',
  }
}

export function docCauHinh() {
  const md = macDinh()
  if (!existsSync(FILE)) return md
  try {
    return { ...md, ...JSON.parse(readFileSync(FILE, 'utf8')) }
  } catch {
    return md
  }
}

export function luuCauHinh(moi) {
  const ch = { ...docCauHinh(), ...locCauHinh(moi) }
  writeFileSync(FILE, JSON.stringify(ch, null, 2) + '\n', 'utf8')
  return ch
}

/** Chỉ nhận các khoá đã biết, ép kiểu số — body đến từ trình duyệt. */
function locCauHinh(o) {
  const md = macDinh()
  const ra = {}
  for (const k of Object.keys(md)) {
    if (o?.[k] === undefined) continue
    ra[k] = typeof md[k] === 'number' ? Number(o[k]) || md[k] : String(o[k])
  }
  return ra
}
