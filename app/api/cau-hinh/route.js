import { boc, docBody } from '@/lib/api'
import { docCauHinh, luuCauHinh } from '@/lib/cau-hinh'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = boc(async () => Response.json(docCauHinh()))

export const PUT = boc(async (req) => Response.json(luuCauHinh(await docBody(req))))
