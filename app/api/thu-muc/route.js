import { existsSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { boc, docBody, moTrongExplorer } from '@/lib/api'
import { luuCauHinh } from '@/lib/cau-hinh'
import { tuanTu, tuanTuDs } from '@/lib/khoa'
import { LoiNguoiDung, thongTinThuMuc, thuMucRa } from '@/lib/tai-lieu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** ?goc=D:\Scan&con=Scan-2026-10-17 → thư mục đó đã có chưa, gốc có những thư mục con nào. */
export const GET = boc(async (req) => {
  const u = new URL(req.url)
  return Response.json(await thongTinThuMuc(u.searchParams.get('goc') ?? '', u.searchParams.get('con') ?? ''))
})

/**
 * { hanhDong: 'tao' }                 tạo thư mục (đã có thì dùng luôn)
 * { hanhDong: 'mo' }                  mở trong Explorer
 * { hanhDong: 'doi-ten', tenMoi }     đổi tên thư mục con đang dùng
 */
export const POST = boc(async (req) => {
  const { goc, con, hanhDong, tenMoi } = await docBody(req)
  const p = thuMucRa(goc, con)

  if (hanhDong === 'tao') {
    await mkdir(p, { recursive: true })
    luuCauHinh({ thuMucGoc: goc, thuMucCon: con })
    return Response.json(await thongTinThuMuc(goc, con))
  }
  if (hanhDong === 'mo') {
    await mkdir(p, { recursive: true })
    moTrongExplorer(p)
    return Response.json({ ok: true })
  }
  if (hanhDong === 'doi-ten') {
    const moi = thuMucRa(goc, tenMoi)
    // đổi tên khi đang scan dở là ghi ảnh vào thư mục không còn tồn tại
    return tuanTu(() => tuanTuDs(async () => {
      if (!existsSync(p)) throw new LoiNguoiDung(`Chưa có thư mục "${con}" để đổi tên.`, 404)
      const cungTen = moi.toLowerCase() === p.toLowerCase()
      if (!cungTen && existsSync(moi)) throw new LoiNguoiDung(`Đã có thư mục "${tenMoi}" rồi.`, 409)
      try {
        await rename(p, moi)
      } catch (e) {
        if (e.code === 'EPERM' || e.code === 'EBUSY') {
          throw new LoiNguoiDung(
            'Thư mục đang được mở ở chương trình khác (Explorer, trình xem PDF…). Đóng lại rồi thử lại.',
            409,
          )
        }
        throw e
      }
      luuCauHinh({ thuMucGoc: goc, thuMucCon: tenMoi })
      return Response.json(await thongTinThuMuc(goc, tenMoi))
    }))
  }
  throw new LoiNguoiDung('Hành động không hợp lệ.')
})
