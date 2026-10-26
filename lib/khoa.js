/**
 * Hai hàng đợi tuần tự dùng chung cả server:
 *  - tuanTu   — MÁY SCAN: lượt quét, đọc cảm biến (không mở máy hai lần cùng lúc).
 *               Một lượt quét có thể kéo dài nhiều phút.
 *  - tuanTuDs — danh-sach.json: mọi thao tác đọc-sửa-ghi danh sách nháp, để hai
 *               request không ghi đè nhau. Tách riêng khỏi máy scan để sửa nháp
 *               (tên, thư mục con của con, chuyển trang…) ăn NGAY cả khi máy đang
 *               quét lượt kế tiếp.
 * Lượt quét chỉ giữ tuanTuDs trong lúc đọc/ghi danh sách, không giữ suốt lúc máy chạy.
 * Gắn vào globalThis vì dev server nạp lại module khi sửa code.
 */
const g = globalThis
g.__scanKhoa ??= Promise.resolve()
g.__dsKhoa ??= Promise.resolve()
// lô đang quét dở: Lưu (dọn ảnh thừa) không được xoá thư mục của lô này
g.__loDangQuet ??= new Set()
export const loDangQuet = g.__loDangQuet

function xepHang(ten, viec) {
  const ra = g[ten].then(viec, viec)
  g[ten] = ra.catch(() => {})
  return ra
}

export const tuanTu = (viec) => xepHang('__scanKhoa', viec)
export const tuanTuDs = (viec) => xepHang('__dsKhoa', viec)
