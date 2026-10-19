/**
 * Hàng đợi tuần tự dùng chung cả server: mọi thao tác ghi danh-sach.json và
 * gọi máy scan đi qua đây, để hai request không ghi đè nhau.
 * Gắn vào globalThis vì dev server nạp lại module khi sửa code.
 */
const g = globalThis
g.__scanKhoa ??= Promise.resolve()

export function tuanTu(viec) {
  const ra = g.__scanKhoa.then(viec, viec)
  g.__scanKhoa = ra.catch(() => {})
  return ra
}
