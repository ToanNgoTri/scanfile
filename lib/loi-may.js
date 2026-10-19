/**
 * Mã lỗi của driver Canon DR-F120 (số trong ngoặc cuối hộp thoại "Scanner Error").
 * Chữ tiếng Việt trong hộp thoại bị vỡ (driver dùng bảng mã cũ: "Thiê´t bi? …")
 * nên hiện câu của mình theo mã. Các mã ở đây đều đã gặp thật.
 * Dùng chung server (thông báo lỗi) và giao diện (khung vàng).
 */
export const LOI_MAY = {
  '-4630': 'Máy đang bị chương trình khác giữ',
  '-4536': 'Không tìm thấy máy scan — kiểm cáp USB và nguồn điện (máy có đang tắt / tự ngủ không?)',
}

export function maLoiMay(s) {
  return String(s ?? '').match(/\((-?\d+)\)/)?.[1] ?? null
}

/** Câu đọc được cho nội dung hộp thoại lỗi; mã lạ thì trả nguyên văn. */
export function moTaLoiMay(s) {
  const ma = maLoiMay(s)
  return LOI_MAY[ma] ? `${LOI_MAY[ma]} (mã ${ma})` : s
}
