import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, readdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { moTaLoiMay } from '../loi-may'
import { ghiNhatKy } from '../nhat-ky'
import { chayLenh, PS_ARGS, timScript } from './chay-lenh'
import { ganTienTrinh, giet, kiemDaDung, LoiKhoaMay, phien } from './phien'
import { timNaps2 } from './tim-naps2'
import { timTroGiup } from './tro-giup'

function canNaps2() {
  const exe = timNaps2()
  if (!exe) {
    throw new Error(
      'Không thấy NAPS2. Bản đóng gói có sẵn ở tools\\naps2; chạy từ project thì cài NAPS2 ' +
        '(naps2.com) hoặc đặt NAPS2_PATH trong .env.local trỏ tới NAPS2.Console.exe.',
    )
  }
  return exe
}

export async function dsThietBiNaps2(driver) {
  const { ma, out, err } = await chayLenh(canNaps2(), ['--listdevices', '--driver', driver], { timeout: 60000 })
  if (ma !== 0) {
    ghiNhatKy('listdevices lỗi', { driver, ma, out, err })
    // ma null = bị ngắt vì quá 60 giây: driver treo khi máy tắt / đang ngủ / vừa rút cáp
    if (ma === null) throw new Error('Dò máy scan quá 60 giây không xong — máy đang tắt, đang ngủ hoặc lỏng cáp USB? Bật lại máy rồi bấm ↻.')
    throw new Error((err || out).trim() || `NAPS2 lỗi mã ${ma}`)
  }
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((ten) => ({ id: ten, ten }))
}

/**
 * NAPS2 báo khay trống bằng lỗi (mã ≠ 0) chứ không phải "0 trang". Phải tách
 * riêng trường hợp này: chế độ scan liên tục coi khay trống là "chờ giấy",
 * còn lỗi thật (mất kết nối, kẹt giấy) phải dừng lại báo người dùng.
 */
// Đã kiểm với DR-F120 thật (NAPS2 8.5.1, TWAIN): khay trống → mã 1 kèm
// "0 page(s) scanned. No scanned pages to export." Các mẫu còn lại phòng driver khác.
const KHAY_TRONG = /0 page\(s\) scanned|no scanned pages|no pages|feeder is empty|out of paper|paper empty|no paper/i

/**
 * Không có tiến triển gì (NAPS2 không in thêm dòng nào: "Scanned page N.") quá
 * lâu mà cũng không có hộp thoại nào đang chờ người bấm → coi là treo, tự ngắt.
 * 120 giây: khởi động TWAIN mất ~20 giây, mỗi trang vài giây; lượt đầu sau khi
 * bị Dừng thì máy im ~70 giây mới chạy (đo thật) — đừng ngắt nhầm lượt đó.
 */
const TREO_SAU = 120_000

/**
 * Trong lúc quét, canh hộp thoại của driver Canon (xem dong-hop-thoai.ps1):
 *   - "No page in the scanner" → tự bấm Cancel
 *   - hộp thoại khác (kẹt giấy, kéo 2 tờ…) → đưa nội dung vào phien.hopThoai
 *     để giao diện hiện cảnh báo; người dùng tự xử lý trên máy rồi bấm trong hộp thoại
 * Không có script thì bỏ qua: quét vẫn chạy, chỉ là không tự động được.
 */
function canhHopThoai() {
  if (process.platform !== 'win32') return { kill() {} }
  try {
    // .exe nhận pid của server để tự thoát nếu server chết — không bao giờ bị bỏ lại
    const exe = timTroGiup()
    const [file, args] = exe
      ? [exe, ['canh-hop-thoai', String(process.pid)]]
      : ['powershell.exe', [...PS_ARGS, timScript('dong-hop-thoai.ps1')]]
    const p = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    p.on('error', () => {})
    let du = ''
    p.stdout.setEncoding('utf8')
    p.stdout.on('data', (d) => {
      du += d
      const dong = du.split(/\r?\n/)
      du = dong.pop()
      for (const l of dong) {
        if (l.startsWith('hop-thoai\t')) {
          phien.hopThoai = l.slice('hop-thoai\t'.length).trim()
          // nhớ lại cả khi người dùng đã đóng hộp thoại: lượt này có lỗi thật
          phien.loiDriver = phien.hopThoai
          ghiNhatKy('driver bật hộp thoại:', phien.hopThoai)
        } else if (l.startsWith('loi-may\t')) {
          // hộp thoại lỗi có mã (-4536…): trợ giúp đã tự đóng; lượt này kết thúc bằng lỗi
          phien.loiDriver = l.slice('loi-may\t'.length).trim()
          ghiNhatKy('driver báo lỗi (đã tự đóng hộp thoại):', phien.loiDriver)
        } else if (l === 'hop-thoai-dong') phien.hopThoai = ''
        else if (l === 'khoa-may') {
          phien.biKhoa = true
          ghiNhatKy('driver báo máy bị khoá (-4630) — đã tự đóng hộp thoại')
        } else if (l === 'da-dong') ghiNhatKy('driver hỏi "No page in the scanner" — đã tự bấm Cancel')
      }
    })
    return p
  } catch {
    return { kill() {} }
  }
}

/**
 * NAPS2 ghi từng trang vừa quét vào thư mục recovery (mỗi lượt một thư mục con,
 * kèm .lock; lượt kết thúc êm thì tự xoá). Bị ngắt giữa chừng thì ảnh còn đó —
 * nhặt về `dir` theo thứ tự trong index.xml (nếu có), không thì theo giờ ghi.
 * Chỉ xét thư mục tạo từ lúc bắt đầu lượt này. Trả về số trang nhặt được.
 *
 * Bản portable: tools/naps2/Data/recovery; bản cài: %APPDATA%/NAPS2/recovery.
 */
async function nhatTuRecovery(dir, tuLuc) {
  const goc = [
    join(/*turbopackIgnore: true*/ dirname(canNaps2()), '..', 'Data', 'recovery'),
    process.env.APPDATA && join(/*turbopackIgnore: true*/ process.env.APPDATA, 'NAPS2', 'recovery'),
  ].filter((d) => d && existsSync(/*turbopackIgnore: true*/ d))
  let n = 0
  for (const g of goc) {
    for (const ten of await readdir(g)) {
      const thu = join(g, ten)
      const st = await stat(thu).catch(() => null)
      if (!st?.isDirectory() || Math.max(st.birthtimeMs, st.mtimeMs) < tuLuc - 2000) continue
      const tep = await readdir(thu)
      ghiNhatKy('recovery của lượt này:', thu, tep)
      let thuTu = []
      const fIndex = tep.find((f) => /\.xml$/i.test(f))
      if (fIndex) {
        const xml = await readFile(join(thu, fIndex), 'utf8').catch(() => '')
        thuTu = [...xml.matchAll(/<FileName>([^<]+)<\/FileName>/gi)].map((m) => m[1])
      }
      let anh = tep.filter((f) => /\.(jpe?g|png)$/i.test(f))
      if (thuTu.length) anh = thuTu.filter((f) => anh.includes(f))
      else {
        const gio = new Map(await Promise.all(anh.map(async (f) => [f, (await stat(join(thu, f))).mtimeMs])))
        anh.sort((a, b) => gio.get(a) - gio.get(b))
      }
      for (const f of anh) {
        n += 1
        await copyFile(join(thu, f), join(dir, `${String(n).padStart(4, '0')}${extname(f).toLowerCase()}`))
      }
      // lượt đã xong: thư mục recovery của nó không còn tác dụng
      await rm(thu, { recursive: true, force: true }).catch(() => {})
    }
  }
  ghiNhatKy(`Xong: nhặt được ${n} trang từ recovery`)
  return n
}

/**
 * Quét một lần: mọi tờ đang đặt trên khay → ảnh JPG trong `dir`,
 * đánh số 0001.jpg, 0002.jpg… theo thứ tự quét.
 */
export async function scanNaps2(dir, ch) {
  // --noprofile bắt buộc phải có --device. Không chọn máy → lấy máy đầu tiên.
  let thietBi = ch.thietBi
  if (!thietBi) {
    const ds = await dsThietBiNaps2(ch.driver)
    if (!ds.length) throw new Error(`Không thấy máy scan nào qua ${ch.driver.toUpperCase()}. Kiểm cáp USB, nguồn và driver Canon.`)
    thietBi = ds[0].id
  }
  const args = [
    '--noprofile',
    '--driver', ch.driver,
    '--device', thietBi,
    '--source', ch.nguon === 'duplex' ? 'duplex' : 'feeder',
    '--dpi', String(ch.dpi),
    '--bitdepth', ch.mau,
    '--jpegquality', '85',
    '-o', join(dir, '$(nnnn).jpg'),
    '-f',
    '-v',
  ]
  ghiNhatKy('bắt đầu quét', { thietBi, driver: ch.driver, nguon: ch.nguon, dpi: ch.dpi })

  let lanCuoi = Date.now()
  let treo = false
  let naps2 = null
  const canh = canhHopThoai()
  const gac = setInterval(() => {
    // đang có hộp thoại chờ người dùng (kẹt giấy…) thì cứ để chờ, không tính là treo
    if (phien.hopThoai) {
      lanCuoi = Date.now()
      return
    }
    if (Date.now() - lanCuoi > TREO_SAU && naps2 && !treo) {
      treo = true
      ghiNhatKy(`không có tiến triển ${TREO_SAU / 1000} giây — tự ngắt lượt quét`)
      giet(naps2)
    }
  }, 5000)

  let kq
  try {
    kq = await chayLenh(canNaps2(), args, {
      onSpawn: (p) => {
        naps2 = p
        ganTienTrinh(p)
      },
      onData: () => (lanCuoi = Date.now()),
    })
  } finally {
    clearInterval(gac)
    canh.kill()
  }
  kiemDaDung()
  if (phien.biKhoa) throw new LoiKhoaMay()
  const { ma, out, err } = kq
  const log = (out + '\n' + err).trim()
  ghiNhatKy('NAPS2 kết thúc', { ma, treo, xong: phien.xong }, '\n' + log)

  if (phien.xong) {
    // Bấm "Xong": giữ mọi trang đã quét, lỗi do bị ngắt/huỷ không còn ý nghĩa.
    // NAPS2 tự xuất được (sau khi đóng hộp thoại "thêm giấy?") thì ảnh đã nằm trong dir;
    // không thì nhặt từ thư mục recovery của lượt này.
    let n = (await readdir(dir)).filter((f) => /\.(jpe?g|png)$/i.test(f)).length
    ghiNhatKy(`Xong: NAPS2 tự xuất ${n} trang`, { daDongHopThoai: phien.xongDongHopThoai ?? 0, phaiNgat: !!phien.xongPhaiNgat })
    if (!n) n = await nhatTuRecovery(dir, phien.batDau)
    return { hetGiay: n === 0, log }
  }
  if (treo) {
    throw new Error(
      `Máy scan không phản hồi quá ${TREO_SAU / 1000} giây nên app đã tự ngắt lượt này.\n` +
        'Kiểm máy (bật nguồn, cáp USB, có hộp thoại nào của Canon đang mở không), rồi quét lại.',
    )
  }
  if (ma !== 0) {
    // Driver báo lỗi (mất kết nối -4536, kẹt giấy…) thì NAPS2 vẫn in "0 page(s) scanned"
    // y như khay trống — đừng coi là khay trống, không thì scan liên tục quét lại mãi.
    if (phien.loiDriver) throw new Error('Máy scan báo lỗi: ' + moTaLoiMay(phien.loiDriver))
    if (KHAY_TRONG.test(log)) return { hetGiay: true, log }
    if (/could not be found/i.test(log)) {
      throw new Error(`Không tìm thấy máy scan "${thietBi}". Kiểm cáp USB / nguồn, rồi bấm ↻ để tìm lại.`)
    }
    throw new Error('NAPS2 báo lỗi:\n' + (log || `mã ${ma}`))
  }
  return { hetGiay: false, log }
}
