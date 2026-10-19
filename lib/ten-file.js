/**
 * Kiểm tên file/thư mục hợp lệ trên Windows (khắt khe nhất trong các hệ):
 * cấm ký tự đặc biệt, tên thiết bị dành riêng, dấu chấm/khoảng trắng cuối.
 * Trả về chuỗi lỗi, hoặc '' nếu hợp lệ.
 */
const DANH_RIENG = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

export function loiTen(ten) {
  if (!ten || !ten.trim()) return 'Tên không được để trống.'
  // chặn cả \ và / — không thì tên kiểu "..\abc" ghi được PDF ra ngoài thư mục
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(ten)) return 'Tên không được chứa các ký tự < > : " / \\ | ? *'
  if (/[. ]$/.test(ten)) return 'Tên không được kết thúc bằng dấu chấm hoặc khoảng trắng.'
  if (DANH_RIENG.test(ten)) return `"${ten}" là tên dành riêng của Windows.`
  if (ten.length > 150) return 'Tên quá dài (tối đa 150 ký tự).'
  return ''
}

/** Bỏ đuôi .pdf người dùng lỡ gõ, cắt khoảng trắng hai đầu. */
export function chuanTenPdf(ten) {
  return String(ten ?? '')
    .trim()
    .replace(/\.pdf$/i, '')
    .trim()
}
