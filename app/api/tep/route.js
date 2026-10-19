import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { boc, canThuMuc } from '@/lib/api'
import { pdfBytes } from '@/lib/pdf'
import { docDs, LoiNguoiDung, THU_MUC_ANH, trangCua, trongThuMuc } from '@/lib/tai-lieu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ?thuMuc=…&anh=lo-x/0001.jpg   ảnh gốc (thumbnail + xem to)
 * ?thuMuc=…&id=…                PDF của tài liệu: đã lưu → file thật trên ổ đĩa;
 *                               nháp → dựng tạm trong bộ nhớ để xem thử, KHÔNG ghi file
 */
export const GET = boc(async (req) => {
  const q = new URL(req.url).searchParams
  const thuMuc = canThuMuc(q.get('thuMuc'))

  if (q.get('anh')) {
    const file = trongThuMuc(join(thuMuc, THU_MUC_ANH), q.get('anh'))
    let buf
    try {
      buf = await readFile(/*turbopackIgnore: true*/ file)
    } catch {
      throw new LoiNguoiDung('Không thấy ảnh.', 404)
    }
    return new Response(buf, {
      headers: {
        'Content-Type': /\.png$/i.test(file) ? 'image/png' : 'image/jpeg',
        // ảnh gốc không bao giờ đổi nội dung → cache được
        'Cache-Control': 'private, max-age=86400',
      },
    })
  }

  const ds = await docDs(thuMuc)
  const t = ds.taiLieu.find((x) => x.id === q.get('id'))
  if (!t) throw new LoiNguoiDung('Không thấy tài liệu.', 404)
  let buf
  if (t.trangThai === 'da-luu') {
    try {
      buf = await readFile(/*turbopackIgnore: true*/ trongThuMuc(thuMuc, t.fileDaLuu))
    } catch {
      throw new LoiNguoiDung('Không thấy file PDF trên ổ đĩa (đã bị đổi tên/xoá bên ngoài?).', 404)
    }
  } else {
    buf = await pdfBytes(trangCua(thuMuc, ds, t))
  }
  const tenTai = encodeURIComponent(t.ten + '.pdf')
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${tenTai}`,
      'Cache-Control': 'no-store',
    },
  })
})
