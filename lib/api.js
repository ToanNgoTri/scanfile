import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { LoiNguoiDung } from './tai-lieu'

/** Bọc handler: lỗi người dùng → 4xx kèm thông báo, lỗi khác → 500. */
export function boc(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx)
    } catch (e) {
      if (e instanceof LoiNguoiDung) {
        return Response.json({ loi: e.message, ...e.chiTiet }, { status: e.status })
      }
      console.error('[api]', e)
      return Response.json({ loi: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }
}

export async function docBody(req) {
  try {
    return await req.json()
  } catch {
    throw new LoiNguoiDung('Body không phải JSON hợp lệ.')
  }
}

/** Thư mục kết quả client gửi lên: phải tuyệt đối và tồn tại. */
export function canThuMuc(p) {
  if (!p || !isAbsolute(p)) throw new LoiNguoiDung('Thiếu thư mục kết quả.')
  if (!existsSync(p)) throw new LoiNguoiDung('Thư mục kết quả không còn tồn tại.', 404)
  return p
}

/** Mở Explorer / Finder; `chon` = bôi đen file thay vì mở thư mục. */
export function moTrongExplorer(p, chon = false) {
  const [lenh, args] =
    process.platform === 'win32'
      ? ['explorer.exe', chon ? [`/select,${p}`] : [p]]
      : process.platform === 'darwin'
        ? ['open', chon ? ['-R', p] : [p]]
        : ['xdg-open', [p]]
  spawn(/*turbopackIgnore: true*/ lenh, args, { stdio: 'ignore', detached: true }).unref()
}
