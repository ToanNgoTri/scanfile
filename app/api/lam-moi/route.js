import { boc } from '@/lib/api'
import { luuCauHinh, macDinh } from '@/lib/cau-hinh'
import { donWiaTreo, dungPhien } from '@/lib/may-scan/phien'
import { ghiNhatKy } from '@/lib/nhat-ky'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Nút "Làm mới": xong việc rồi thì bắt đầu một đợt khác từ đầu.
 *  - huỷ lượt quét còn treo (nếu có) và dọn wiawow64 giữ khoá máy
 *  - thư mục con về mặc định (Scan-<hôm nay>), bỏ "thư mục con của con"
 * Giữ nguyên thư mục gốc và cài đặt máy scan. Nháp chưa lưu vẫn nằm trong thư
 * mục cũ — chọn lại thư mục đó là thấy.
 */
export const POST = boc(async () => {
  const daHuy = dungPhien()
  ghiNhatKy('người dùng bấm Làm mới', daHuy ? '(huỷ lượt quét đang chạy)' : '')
  await donWiaTreo(null)
  const ch = luuCauHinh({ thuMucCon: macDinh().thuMucCon, thuMucCap3: '' })
  return Response.json({ ch, daHuy })
})
