import { boc } from '@/lib/api'
import { dsThietBi, DRIVER, goiYKhiTrong, trangThai } from '@/lib/may-scan'
import { LoiNguoiDung } from '@/lib/tai-lieu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** ?driver=twain → danh sách máy scan driver đó thấy được. */
export const GET = boc(async (req) => {
  const driver = new URL(req.url).searchParams.get('driver') ?? 'twain'
  if (!DRIVER.includes(driver)) throw new LoiNguoiDung('Driver không hợp lệ.')
  const tt = trangThai()
  let thietBi = []
  let loi
  try {
    thietBi = await dsThietBi(driver)
  } catch (e) {
    loi = e instanceof Error ? e.message : String(e)
  }
  const goiY = !thietBi.length && driver !== 'gia-lap' ? await goiYKhiTrong() : ''
  return Response.json({ ...tt, thietBi, loi, goiY })
})
