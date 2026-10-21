import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { taoPdf } from './pdf'
import { chuanTenPdf, loiTen } from './ten-file'

/**
 * Bố cục một thư mục kết quả:
 *
 *   <thuMucGoc>/<thuMucCon>/
 *     scan-0001.pdf                         ← PDF đã LƯU
 *     Ho so A/Nguyen Van A/CCCD.pdf         ← PDF lưu vào "thư mục con của con"
 *     _anh-scan/
 *       danh-sach.json                      ← các tài liệu: nháp + đã lưu
 *       lo-20261017-213000/0001.jpg …       ← ảnh gốc của từng lần scan
 *
 * Quét xong chỉ tạo tài liệu NHÁP (ảnh + cách chia trang + tên + thư mục).
 * Đổi tên, chuyển trang, gộp, tách chỉ sửa danh-sach.json. Chỉ khi người dùng
 * bấm Lưu thì luuTatCa() mới kiểm hết rồi ghi PDF ra ổ đĩa.
 */
export const THU_MUC_ANH = '_anh-scan'
const FILE_DS = 'danh-sach.json'

export class LoiNguoiDung extends Error {
  constructor(msg, status = 400, chiTiet) {
    super(msg)
    this.status = status
    this.chiTiet = chiTiet
  }
}

/** Ghép thư mục gốc + thư mục con, chặn tên con trèo ra ngoài gốc. */
export function thuMucRa(goc, con) {
  if (!goc || !isAbsolute(goc)) throw new LoiNguoiDung('Thư mục kết quả phải là đường dẫn đầy đủ, ví dụ D:\\Scan')
  const l = loiTen(con)
  if (l) throw new LoiNguoiDung('Tên thư mục con: ' + l)
  return join(resolve(goc), con)
}

/** Đường dẫn bên trong `goc` — chặn ../ từ query string. */
export function trongThuMuc(goc, tuongDoi) {
  const p = resolve(goc, tuongDoi)
  const r = relative(goc, p)
  if (!r || r.startsWith('..') || isAbsolute(r)) throw new LoiNguoiDung('Đường dẫn không hợp lệ.')
  return p
}

// ── thư mục con của con ─────────────────────────────────────────────────────
/** "a/b\\c " → "a\\b\\c" (theo dấu phân cách của hệ). '' = ngay trong thư mục con. */
export function chuanThuMuc2(s) {
  return String(s ?? '')
    .split(/[\\/]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(sep)
}

export function loiThuMuc2(tm) {
  if (!tm) return ''
  for (const doan of tm.split(sep)) {
    if (doan === '.' || doan === '..') return 'Thư mục không được chứa "." hoặc "..".'
    if (doan.toLowerCase() === THU_MUC_ANH) return `"${THU_MUC_ANH}" là thư mục riêng của app.`
    const l = loiTen(doan)
    if (l) return `Thư mục "${doan}": ${l}`
  }
  return ''
}

/** Các thư mục đã có bên trong thư mục con (sâu 3 cấp) — để gợi ý. */
async function dsThuMuc2(goc, tienTo = '', sau = 3) {
  if (sau <= 0) return []
  let ds
  try {
    ds = await readdir(join(goc, tienTo), { withFileTypes: true })
  } catch {
    return []
  }
  const ra = []
  for (const e of ds) {
    if (!e.isDirectory() || (!tienTo && e.name === THU_MUC_ANH)) continue
    const rel = tienTo ? join(tienTo, e.name) : e.name
    ra.push(rel, ...(await dsThuMuc2(goc, rel, sau - 1)))
  }
  return ra
}

export async function thongTinThuMuc(goc, con) {
  const ra = { duongDan: '', tonTai: false, gocTonTai: false, thuMucCon: [], thuMuc2: [], soNhap: 0, soDaLuu: 0 }
  ra.duongDan = thuMucRa(goc, con)
  ra.gocTonTai = existsSync(goc)
  ra.tonTai = existsSync(/*turbopackIgnore: true*/ ra.duongDan)
  if (ra.gocTonTai) {
    try {
      const ds = await readdir(goc, { withFileTypes: true })
      ra.thuMucCon = ds.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse()
    } catch {
      /* không đọc được gốc — vẫn trả phần còn lại */
    }
  }
  if (ra.tonTai) {
    const ds = await docDs(ra.duongDan)
    ra.soNhap = ds.taiLieu.filter(laNhap).length
    ra.soDaLuu = ds.taiLieu.length - ra.soNhap
    ra.thuMuc2 = [...new Set([...(await dsThuMuc2(ra.duongDan)), ...ds.taiLieu.map((t) => t.thuMuc2).filter(Boolean)])].sort()
  }
  return ra
}

// ── danh-sach.json ──────────────────────────────────────────────────────────
const laNhap = (t) => t.trangThai === 'nhap'

export async function docDs(thuMuc) {
  let ds
  try {
    ds = JSON.parse(await readFile(join(thuMuc, THU_MUC_ANH, FILE_DS), 'utf8'))
  } catch {
    return { dem: 0, taiLieu: [], choXoa: [], dpiLo: {}, xoayAnh: {} }
  }
  // Bản cũ (trước khi có nháp): mọi tài liệu đều đã ghi PDF ngay trong thư mục con.
  for (const t of ds.taiLieu ?? []) {
    if (!t.trangThai) {
      t.trangThai = 'da-luu'
      t.fileDaLuu = t.ten + '.pdf'
    }
    t.thuMuc2 ??= ''
  }
  return { dem: 0, taiLieu: [], choXoa: [], dpiLo: {}, xoayAnh: {}, ...ds }
}

async function ghiDs(thuMuc, ds) {
  const f = join(thuMuc, THU_MUC_ANH, FILE_DS)
  await mkdir(join(thuMuc, THU_MUC_ANH), { recursive: true })
  await writeFile(f + '.tmp', JSON.stringify(ds, null, 2), 'utf8')
  await rename(f + '.tmp', f)
}

/**
 * Ảnh + dpi của từng trang. dpi theo LÔ chứ không theo tài liệu: trang chuyển
 * từ lần quét 200dpi sang file quét 300dpi vẫn ra đúng khổ giấy.
 */
export function trangCua(thuMuc, ds, t) {
  return t.anh.map((a) => ({
    duong: join(thuMuc, THU_MUC_ANH, a),
    dpi: ds.dpiLo[a.split('/')[0]] ?? t.dpi,
    xoay: ds.xoayAnh[a] ?? 0,
  }))
}

/** Đường dẫn PDF (tương đối so với thư mục con) mà tài liệu sẽ được lưu ra. */
const fileDich = (t) => (t.thuMuc2 ? join(t.thuMuc2, t.ten + '.pdf') : t.ten + '.pdf')
const khoa = (rel) => rel.toLowerCase()

/** Tên kế tiếp chưa bị chiếm: scan-0001, scan-0002 … */
function tenMoi(thuMuc, ds, tienTo, thuMuc2) {
  const daDung = new Set(ds.taiLieu.map((t) => khoa(fileDich(t))))
  for (;;) {
    ds.dem += 1
    const ten = `${tienTo}-${String(ds.dem).padStart(4, '0')}`
    const rel = fileDich({ ten, thuMuc2 })
    if (!daDung.has(khoa(rel)) && !existsSync(join(thuMuc, rel))) return ten
  }
}

export async function danhSach(thuMuc) {
  const ds = await docDs(thuMuc)
  return ds.taiLieu.map((t) => ({
    ...t,
    mat: t.trangThai === 'da-luu' && !existsSync(join(thuMuc, t.fileDaLuu)),
    // góc xoay theo ẢNH (không theo tài liệu) nên chuyển trang sang file khác vẫn giữ chiều
    xoay: Object.fromEntries(t.anh.map((a) => [a, ds.xoayAnh[a] ?? 0])),
  }))
}

/**
 * Nhận ảnh của MỘT lần scan (đã nằm trong _anh-scan/<lo>/) và chia thành các
 * tài liệu NHÁP theo cách gộp đang chọn. Chưa ghi PDF nào.
 */
export async function nhanLoScan(thuMuc, lo, tenAnh, ch) {
  const ds = await docDs(thuMuc)
  let nhom
  if (ch.cachGop === 'gop-ca-lo') nhom = [tenAnh]
  else if (ch.cachGop === 'tach') nhom = tenAnh.map((a) => [a])
  else nhom = tenAnh.length === ch.soTrangGop ? [tenAnh] : tenAnh.map((a) => [a])

  // file mới quét nằm ngay trong thư mục con; chọn thư mục con của con riêng từng file
  const thuMuc2 = ''
  const moi = nhom.map((g, k) => ({
    id: `${lo}-${k + 1}`,
    ten: tenMoi(thuMuc, ds, ch.tienToTen || 'scan', thuMuc2),
    thuMuc2,
    anh: g.map((a) => `${lo}/${a}`),
    lo,
    dpi: ch.dpi,
    taoLuc: new Date().toISOString(),
    trangThai: 'nhap',
    fileDaLuu: null,
  }))
  ds.dpiLo[lo] = ch.dpi
  ds.taiLieu.push(...moi)
  await ghiDs(thuMuc, ds)
  return moi
}

// ── thao tác trên NHÁP (chỉ sửa danh-sach.json) ─────────────────────────────
function tim(ds, id, { canNhap = true } = {}) {
  const i = ds.taiLieu.findIndex((t) => t.id === id)
  if (i < 0) throw new LoiNguoiDung('Không thấy tài liệu này — có thể đã bị xoá.', 404)
  if (canNhap && !laNhap(ds.taiLieu[i])) throw new LoiNguoiDung('File đã lưu. Bấm "Sửa lại" để đưa về nháp trước.')
  return i
}

/**
 * Mọi thao tác trên nháp đi qua đây: đọc danh sách → sửa → ghi lại.
 * `viec(ds)` sửa ds tại chỗ.
 */
export async function suaNhap(thuMuc, viec) {
  const ds = await docDs(thuMuc)
  await viec(ds)
  await ghiDs(thuMuc, ds)
}

export function doiTen(ds, id, tenGo) {
  const ten = chuanTenPdf(tenGo)
  const l = loiTen(ten)
  if (l) throw new LoiNguoiDung(l)
  ds.taiLieu[tim(ds, id)].ten = ten
}

export function doiThuMuc2(ds, id, tm) {
  const thuMuc2 = chuanThuMuc2(tm)
  const l = loiThuMuc2(thuMuc2)
  if (l) throw new LoiNguoiDung(l)
  ds.taiLieu[tim(ds, id)].thuMuc2 = thuMuc2
}

/**
 * Chuyển một trang (ảnh `anh`) sang tài liệu `denId` ở vị trí `viTri`.
 * denId rỗng = tách trang ra thành tài liệu nháp MỚI ngay sau tài liệu cũ.
 * Tài liệu nguồn hết trang thì bị bỏ khỏi danh sách.
 */
export function chuyenTrang(ds, thuMuc, anh, denId, viTri, ch) {
  const iNguon = ds.taiLieu.findIndex((t) => t.anh.includes(anh))
  if (iNguon < 0) throw new LoiNguoiDung('Không thấy trang này.', 404)
  const nguon = ds.taiLieu[iNguon]
  if (!laNhap(nguon)) throw new LoiNguoiDung('Trang thuộc file đã lưu. Bấm "Sửa lại" trước.')

  let dich
  if (denId) {
    dich = ds.taiLieu[tim(ds, denId)]
  } else {
    dich = {
      ...nguon,
      id: `${nguon.lo}-t${Date.now().toString(36)}`,
      ten: '',
      anh: [],
      taoLuc: new Date().toISOString(),
      fileDaLuu: null,
    }
    dich.ten = tenMoi(thuMuc, ds, ch.tienToTen || 'scan', nguon.thuMuc2)
    ds.taiLieu.splice(iNguon + 1, 0, dich)
  }

  const viTriCu = nguon.anh.indexOf(anh)
  nguon.anh.splice(viTriCu, 1)
  let vt = Number.isInteger(viTri) ? viTri : dich.anh.length
  vt = Math.max(0, Math.min(vt, dich.anh.length))
  dich.anh.splice(vt, 0, anh)

  if (!nguon.anh.length) xoaKhoiDs(ds, nguon.id)
}

/**
 * Xoay các trang (ảnh) thêm `goc` độ (±90, 180). Chỉ ghi góc vào danh sách —
 * ảnh gốc không bị sửa; PDF đặt /Rotate cho trang lúc Lưu.
 */
export function xoayTrang(ds, anh, goc) {
  if (![90, -90, 180].includes(goc)) throw new LoiNguoiDung('Góc xoay không hợp lệ.')
  for (const a of anh) {
    const t = ds.taiLieu.find((x) => x.anh.includes(a))
    if (!t) throw new LoiNguoiDung('Không thấy trang này.', 404)
    if (!laNhap(t)) throw new LoiNguoiDung('Trang thuộc file đã lưu. Bấm "Sửa lại" trước.')
    ds.xoayAnh[a] = ((((ds.xoayAnh[a] ?? 0) + goc) % 360) + 360) % 360
  }
}

/** Bỏ một trang khỏi nháp. Ảnh chỉ bị xoá khỏi ổ đĩa khi bấm Lưu. */
export function boTrang(ds, anh) {
  const t = ds.taiLieu.find((x) => x.anh.includes(anh))
  if (!t) throw new LoiNguoiDung('Không thấy trang này.', 404)
  if (!laNhap(t)) throw new LoiNguoiDung('Trang thuộc file đã lưu. Bấm "Sửa lại" trước.')
  t.anh.splice(t.anh.indexOf(anh), 1)
  if (!t.anh.length) xoaKhoiDs(ds, t.id)
}

/** Gộp tài liệu `id` vào cuối tài liệu NHÁP đứng ngay trước nó. */
export function gopVaoTruoc(ds, id) {
  const i = tim(ds, id)
  let j = i - 1
  while (j >= 0 && !laNhap(ds.taiLieu[j])) j--
  if (j < 0) throw new LoiNguoiDung('Không có file nháp nào phía trên để gộp vào.')
  ds.taiLieu[j].anh.push(...ds.taiLieu[i].anh)
  xoaKhoiDs(ds, id)
}

/** Tách thành mỗi trang một tài liệu nháp; trang đầu giữ tên cũ. */
export function tachTrang(ds, thuMuc, id, tienTo) {
  const i = tim(ds, id)
  const tl = ds.taiLieu[i]
  if (tl.anh.length < 2) throw new LoiNguoiDung('File chỉ có 1 trang.')
  const [dau, ...con] = tl.anh
  const them = con.map((a, k) => ({
    ...tl,
    id: `${tl.id}-t${Date.now().toString(36)}${k}`,
    ten: tenMoi(thuMuc, ds, tienTo || 'scan', tl.thuMuc2),
    anh: [a],
    fileDaLuu: null,
  }))
  tl.anh = [dau]
  ds.taiLieu.splice(i + 1, 0, ...them)
}

/** Bỏ tài liệu; nếu nó từng được lưu thì PDF cũ sẽ bị xoá khi bấm Lưu. */
function xoaKhoiDs(ds, id) {
  const i = ds.taiLieu.findIndex((t) => t.id === id)
  const t = ds.taiLieu[i]
  if (t.fileDaLuu) ds.choXoa.push(t.fileDaLuu)
  ds.taiLieu.splice(i, 1)
}

export function xoa(ds, id) {
  tim(ds, id)
  xoaKhoiDs(ds, id)
}

/** File đã lưu → về nháp để sửa. PDF cũ vẫn nằm đó cho tới lần Lưu kế. */
export function suaLai(ds, id) {
  const t = ds.taiLieu[tim(ds, id, { canNhap: false })]
  t.trangThai = 'nhap'
}

// ── LƯU: kiểm hết rồi mới ghi PDF ───────────────────────────────────────────
/**
 * Lưu mọi tài liệu nháp thành PDF. Kiểm toàn bộ TRƯỚC khi ghi bất kỳ file nào:
 * có lỗi thì không ghi gì, trả về lỗi theo từng tài liệu để giao diện tô đỏ.
 */
export async function luuTatCa(thuMuc) {
  const ds = await docDs(thuMuc)
  const nhap = ds.taiLieu.filter(laNhap)
  if (!nhap.length) throw new LoiNguoiDung('Không có file nháp nào để lưu.')

  // File cũ sẽ bị thay/xoá trong lần lưu này → được phép trùng chỗ với file mới.
  const fileCu = new Set([...nhap.map((t) => t.fileDaLuu).filter(Boolean), ...ds.choXoa].map(khoa))
  const daChiem = new Map(ds.taiLieu.filter((t) => !laNhap(t)).map((t) => [khoa(t.fileDaLuu), t.ten]))
  const loi = {}
  const dich = new Map()

  for (const t of nhap) {
    const l = loiTen(t.ten) || loiThuMuc2(t.thuMuc2) || (t.anh.length ? '' : 'File không còn trang nào.')
    if (l) {
      loi[t.id] = l
      continue
    }
    const rel = fileDich(t)
    const k = khoa(rel)
    if (daChiem.has(k)) loi[t.id] = `Trùng tên với file đã lưu "${daChiem.get(k)}.pdf".`
    else if (dich.has(k)) loi[t.id] = loi[dich.get(k)] = `Hai file nháp cùng tên "${rel}".`
    else if (!fileCu.has(k) && existsSync(join(thuMuc, rel))) loi[t.id] = `Trong thư mục đã có sẵn file "${rel}".`
    dich.set(k, t.id)
  }
  if (Object.keys(loi).length) {
    throw new LoiNguoiDung(`${Object.keys(loi).length} file chưa lưu được — sửa các ô báo đỏ rồi bấm Lưu lại.`, 400, { loiTheoId: loi })
  }

  // 1. dựng PDF ra file tạm cạnh chỗ đích
  const tam = []
  for (const t of nhap) {
    const rel = fileDich(t)
    await mkdir(join(/*turbopackIgnore: true*/ thuMuc, t.thuMuc2 || '.'), { recursive: true })
    const f = join(thuMuc, rel + `.${Date.now().toString(36)}.tmp`)
    await taoPdf(trangCua(thuMuc, ds, t), f)
    tam.push([t, f, rel])
  }
  // 2. xoá file cũ (đổi tên / xoá / thư mục khác)
  for (const rel of new Set([...nhap.map((t) => t.fileDaLuu).filter(Boolean), ...ds.choXoa])) {
    await rm(join(thuMuc, rel), { force: true })
    await xoaThuMucRong(thuMuc, rel)
  }
  // 3. đưa file tạm vào chỗ
  const luuLuc = new Date().toISOString()
  for (const [t, f, rel] of tam) {
    await rename(f, join(thuMuc, rel))
    t.trangThai = 'da-luu'
    t.fileDaLuu = rel
    t.luuLuc = luuLuc
  }
  ds.choXoa = []
  await ghiDs(thuMuc, ds)
  await donAnhThua(thuMuc, ds)
  return nhap.length
}

/** Xoá các thư mục con của con bị trống sau khi dời file đi (không đụng thư mục con chính). */
async function xoaThuMucRong(thuMuc, rel) {
  const doan = rel.split(sep).slice(0, -1)
  while (doan.length) {
    try {
      await rmdir(join(thuMuc, ...doan))
    } catch {
      return // còn file hoặc không xoá được → dừng
    }
    doan.pop()
  }
}

/** Ảnh không còn thuộc tài liệu nào (trang đã bỏ, file đã xoá) → dọn khi Lưu. */
async function donAnhThua(thuMuc, ds) {
  const dung = new Set(ds.taiLieu.flatMap((t) => t.anh))
  for (const a of Object.keys(ds.xoayAnh)) if (!dung.has(a)) delete ds.xoayAnh[a]
  await ghiDs(thuMuc, ds)
  const goc = join(thuMuc, THU_MUC_ANH)
  for (const e of await readdir(goc, { withFileTypes: true })) {
    if (!e.isDirectory() || !e.name.startsWith('lo-')) continue
    const anh = await readdir(join(goc, e.name))
    let con = 0
    for (const a of anh) {
      if (dung.has(`${e.name}/${a}`)) con++
      else await rm(join(goc, e.name, a), { force: true })
    }
    if (!con) await rm(join(goc, e.name), { recursive: true, force: true })
  }
}

// ── lô scan ─────────────────────────────────────────────────────────────────
/** Kiểm tài liệu còn là nháp TRƯỚC khi quét "scan tiếp" — khỏi kéo giấy rồi mới báo lỗi. */
export async function kiemConNhap(thuMuc, id) {
  tim(await docDs(thuMuc), id)
}

/** Scan tiếp: nối ảnh của lần quét này vào CUỐI tài liệu nháp `id`. */
export async function noiLoVao(thuMuc, lo, tenAnh, id, dpi) {
  const ds = await docDs(thuMuc)
  const t = ds.taiLieu[tim(ds, id)]
  t.anh.push(...tenAnh.map((a) => `${lo}/${a}`))
  ds.dpiLo[lo] = dpi
  await ghiDs(thuMuc, ds)
  return t
}

/** Chuẩn bị thư mục cho một lần scan mới, trả về tên lô + đường dẫn. */
export async function taoLo(thuMuc) {
  const d = new Date()
  const p = (n, k = 2) => String(n).padStart(k, '0')
  let lo = `lo-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const goc = join(thuMuc, THU_MUC_ANH)
  let k = 1
  while (existsSync(join(goc, lo + (k > 1 ? `-${k}` : '')))) k++
  if (k > 1) lo += `-${k}`
  const dir = join(goc, lo)
  await mkdir(dir, { recursive: true })
  return { lo, dir }
}

/** Ảnh trong thư mục lô, sắp theo số tự nhiên (2.jpg trước 10.jpg). */
export async function anhTrongLo(dir) {
  const ds = (await readdir(dir)).filter((f) => /\.(jpe?g|png)$/i.test(f))
  ds.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const ra = []
  for (const f of ds) if ((await stat(join(dir, f))).size > 0) ra.push(f)
  return ra
}
