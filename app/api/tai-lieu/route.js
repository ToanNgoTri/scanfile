import { join } from 'node:path'
import { boc, canThuMuc, docBody, moTrongExplorer } from '@/lib/api'
import { docCauHinh } from '@/lib/cau-hinh'
import { tuanTuDs } from '@/lib/khoa'
import {
  boTrang,
  chuyenTrang,
  danhSach,
  doiTen,
  doiThuMuc2,
  doiThuMuc2Chung,
  gopVaoTruoc,
  LoiNguoiDung,
  luuTatCa,
  suaLai,
  suaNhap,
  tachTrang,
  xoa,
  xoayTrang,
} from '@/lib/tai-lieu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 900

export const GET = boc(async (req) => {
  const thuMuc = canThuMuc(new URL(req.url).searchParams.get('thuMuc'))
  return Response.json({ taiLieu: await danhSach(thuMuc) })
})

/**
 * Thao tác trên NHÁP — chỉ sửa danh sách, không đụng file PDF:
 *   { hanhDong: 'doi-ten', id, ten }
 *   { hanhDong: 'doi-thu-muc', id, thuMuc2 }
 *   { hanhDong: 'doi-thu-muc-chung', tu, den }   nháp đang ở thư mục `tu` → `den`
 *   { hanhDong: 'chuyen-trang', anh, denId, viTri }   denId rỗng = tách ra file mới
 *   { hanhDong: 'xoay', anh: [..] | anh, goc: 90 | -90 | 180 }
 *   { hanhDong: 'gop' | 'tach' | 'xoa' | 'sua-lai', id }
 * Ghi ra ổ đĩa:
 *   { hanhDong: 'luu' }                                lưu mọi nháp thành PDF
 *   { hanhDong: 'mo', id }                             hiện file đã lưu trong Explorer
 */
export const POST = boc(async (req) => {
  const b = await docBody(req)
  const thuMuc = canThuMuc(b.thuMuc)
  const ch = docCauHinh()
  // hàng đợi danh sách, KHÔNG chờ máy scan: sửa nháp vừa quét ăn ngay cả khi đang quét lượt sau
  return tuanTuDs(async () => {
    let soDaLuu
    switch (b.hanhDong) {
      case 'doi-ten':
        await suaNhap(thuMuc, (ds) => doiTen(ds, b.id, b.ten))
        break
      case 'doi-thu-muc':
        await suaNhap(thuMuc, (ds) => doiThuMuc2(ds, b.id, b.thuMuc2))
        break
      case 'doi-thu-muc-chung':
        await suaNhap(thuMuc, (ds) => doiThuMuc2Chung(ds, b.tu, b.den))
        break
      case 'chuyen-trang':
        await suaNhap(thuMuc, (ds) => chuyenTrang(ds, thuMuc, b.anh, b.denId, b.viTri, ch))
        break
      case 'xoay':
        await suaNhap(thuMuc, (ds) => xoayTrang(ds, [].concat(b.anh), Number(b.goc)))
        break
      case 'bo-trang':
        await suaNhap(thuMuc, (ds) => boTrang(ds, b.anh))
        break
      case 'gop':
        await suaNhap(thuMuc, (ds) => gopVaoTruoc(ds, b.id))
        break
      case 'tach':
        await suaNhap(thuMuc, (ds) => tachTrang(ds, thuMuc, b.id, ch.tienToTen))
        break
      case 'xoa':
        await suaNhap(thuMuc, (ds) => xoa(ds, b.id))
        break
      case 'sua-lai':
        await suaNhap(thuMuc, (ds) => suaLai(ds, b.id))
        break
      case 'luu':
        soDaLuu = await luuTatCa(thuMuc)
        break
      case 'mo': {
        const tl = (await danhSach(thuMuc)).find((t) => t.id === b.id)
        if (!tl?.fileDaLuu) throw new LoiNguoiDung('File này chưa được lưu.', 404)
        moTrongExplorer(join(thuMuc, tl.fileDaLuu), true)
        break
      }
      default:
        throw new LoiNguoiDung('Hành động không hợp lệ.')
    }
    return Response.json({ taiLieu: await danhSach(thuMuc), soDaLuu })
  })
})
