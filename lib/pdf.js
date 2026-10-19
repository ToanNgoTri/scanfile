import { readFile, writeFile, rename } from 'node:fs/promises'
import { degrees, PDFDocument } from 'pdf-lib'

/**
 * Ghép các trang ({ duong, dpi } — ảnh JPG/PNG) thành PDF, mỗi ảnh một trang
 * đúng khổ thật: kích thước trang = số pixel × 72 / dpi, nên A4 quét 300dpi
 * ra đúng A4.
 */
export async function pdfBytes(trang) {
  const pdf = await PDFDocument.create()
  for (const { duong, dpi = 300, xoay = 0 } of trang) {
    const buf = await readFile(/*turbopackIgnore: true*/ duong)
    const laPng = buf[0] === 0x89 && buf[1] === 0x50
    const anh = laPng ? await pdf.embedPng(buf) : await pdf.embedJpg(buf)
    const w = (anh.width * 72) / dpi
    const h = (anh.height * 72) / dpi
    const p = pdf.addPage([w, h])
    p.drawImage(anh, { x: 0, y: 0, width: w, height: h })
    // /Rotate: trình xem PDF nào cũng hiểu, ảnh gốc không phải nén lại → không mờ thêm
    if (xoay) p.setRotation(degrees(xoay))
  }
  return pdf.save()
}

/** Ghi ra file tạm rồi rename để không bao giờ để lại PDF ghi dở. */
export async function taoPdf(trang, fileRa) {
  const tam = fileRa + '.dang-ghi'
  await writeFile(tam, await pdfBytes(trang))
  await rename(tam, fileRa)
}
