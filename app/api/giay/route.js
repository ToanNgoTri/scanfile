import { boc } from '@/lib/api'
import { docCauHinh } from '@/lib/cau-hinh'
import { tuanTu } from '@/lib/khoa'
import { coGiay } from '@/lib/may-scan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * { coGiay: true | false | null } — đọc cảm biến khay giấy.
 * Đi qua hàng đợi chung: không được mở máy qua WIA khi TWAIN đang quét.
 */
export const GET = boc(() => tuanTu(async () => Response.json({ coGiay: await coGiay(docCauHinh()) })))
