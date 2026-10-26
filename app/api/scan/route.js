import { mkdir, rm } from 'node:fs/promises'
import { boc } from '@/lib/api'
import { docCauHinh } from '@/lib/cau-hinh'
import { loDangQuet, tuanTu, tuanTuDs } from '@/lib/khoa'
import { scan } from '@/lib/may-scan'
import { dungPhien, LoiDaDung, phien, xongPhien } from '@/lib/may-scan/phien'
import { ghiNhatKy } from '@/lib/nhat-ky'
import { anhTrongLo, kiemConNhap, nhanLoScan, noiLoVao, taoLo, thuMucRa } from '@/lib/tai-lieu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 900

/**
 * Quét một lần với cấu hình đã lưu (client PUT /api/cau-hinh trước khi gọi).
 *   body {}                 → ảnh chia thành file nháp mới theo cách gộp
 *   body { noiVao: id }     → "scan tiếp": nối ảnh vào cuối file nháp đó
 * Không có trang nào → soTrang: 0 (khay trống). Bị dừng → daDung: true.
 */
export const POST = boc(async (req) => {
  const body = await req.json().catch(() => ({}))
  return tuanTu(async () => {
    const ch = docCauHinh()
    const thuMuc = thuMucRa(ch.thuMucGoc, ch.thuMucCon)
    // chỉ giữ khoá danh sách lúc đọc/ghi — trong lúc máy kéo giấy, người dùng vẫn sửa
    // được các file nháp vừa quét (tên, thư mục con của con…) và thấy ăn ngay
    const { lo, dir } = await tuanTuDs(async () => {
      if (body.noiVao) await kiemConNhap(thuMuc, body.noiVao)
      await mkdir(thuMuc, { recursive: true })
      const r = await taoLo(thuMuc)
      loDangQuet.add(r.lo)
      return r
    })
    try {
      // lyDo: 'mot-lan' bấm quét · 'co' cảm biến báo có giấy · 'thu' chờ lâu / cảm biến
      // không đọc được · 'ngay' bấm Quét ngay — để nhật ký đo được cảm biến sai bao nhiêu
      ghiNhatKy('yêu cầu quét:', body.lyDo ?? 'mot-lan', body.noiVao ? `(scan tiếp vào ${body.noiVao})` : '')
      let kq
      try {
        kq = await scan(dir, ch)
      } catch (e) {
        await rm(dir, { recursive: true, force: true })
        if (e instanceof LoiDaDung) return Response.json({ thuMuc, soTrang: 0, daDung: true, moi: [] })
        throw e
      }

      const anh = await anhTrongLo(dir)
      ghiNhatKy(`kết quả: ${anh.length} trang`)
      if (anh.length && ['thu', 'ngay'].includes(body.lyDo)) {
        ghiNhatKy('⚠ cảm biến báo khay trống nhưng thực tế CÓ giấy — cảm biến máy này báo sai')
      }
      if (!anh.length) {
        await rm(dir, { recursive: true, force: true })
        return Response.json({ thuMuc, soTrang: 0, hetGiay: kq.hetGiay, log: kq.log, moi: [] })
      }
      if (body.noiVao) {
        const t = await tuanTuDs(() => noiLoVao(thuMuc, lo, anh, body.noiVao, kq.dpi))
        return Response.json({ thuMuc, soTrang: anh.length, moi: [], noiVao: t, log: kq.log })
      }
      const moi = await tuanTuDs(() => nhanLoScan(thuMuc, lo, anh, { ...ch, dpi: kq.dpi }))
      return Response.json({ thuMuc, soTrang: anh.length, moi, log: kq.log })
    } finally {
      loDangQuet.delete(lo)
    }
  })
})

/** Trạng thái lượt quét đang chạy: { dang, hopThoai } — hopThoai = lỗi driver đang hiện. */
export const GET = boc(async () =>
  Response.json({ dang: phien.dang, hopThoai: phien.hopThoai, giay: phien.dang ? Date.now() - phien.batDau : 0 }),
)

/** Dừng lượt quét đang chạy ngay lập tức — HUỶ, không giữ trang nào. */
export const DELETE = boc(async () => Response.json({ daDung: dungPhien() }))

/** "Xong": kết thúc lượt quét nhưng GIỮ các trang đã quét (xem xongPhien). */
export const PUT = boc(async () => {
  ghiNhatKy('người dùng bấm Xong')
  return Response.json({ xong: await xongPhien() })
})
