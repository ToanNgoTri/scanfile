/**
 * Đóng gói scanFile thành một thư mục tự chứa cho Windows 64-bit: copy sang
 * máy khác là chạy được, KHÔNG cần npm install, KHÔNG cần cài Node, KHÔNG cần
 * cài NAPS2. Máy đích chỉ cần driver của máy scan Canon DR-F120.
 *
 * (Cùng cách làm với AutoWeb/scripts/dong-goi.mjs.)
 *
 *   npm run dong-goi:win
 *   node scripts/dong-goi.mjs --ra D:\USB
 *   node scripts/dong-goi.mjs --help
 *
 * Chỉ đóng cho Windows: TWAIN/WIA là công nghệ của Windows.
 */
import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GOC = resolve(fileURLToPath(import.meta.url), '..', '..')
const NODE_VER = 'v22.14.0'
const NAPS2_VER = '8.5.1'
const NAPS2_URL = `https://github.com/cyanfish/naps2/releases/download/v${NAPS2_VER}/naps2-${NAPS2_VER}-win-x64.zip`

/** Bộ nhớ đệm tải về, để đóng gói lần sau không phải tải lại (gitignore). */
const CACHE = join(GOC, 'tools')

// Phải là bsdtar của Windows (mở được .zip). Chạy từ Git Bash thì 'tar' trên PATH
// là GNU tar — nó báo 'This does not look like a tar archive' với file zip.
const TAR = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'

const HUONG_DAN = `Cách dùng:
  npm run dong-goi:win             đóng gói vào dist-offline\\scanFile-windows
  node scripts/dong-goi.mjs [cờ...]

Cờ:
  --ra <thư mục>       đặt gói vào thư mục khác, ví dụ:  --ra D:\\USB
  --khong-node         không nhúng Node (máy đích phải tự có Node >= 20)
  --khong-naps2        không nhúng NAPS2 (chỉ quét được qua WIA)
  --help               in bảng này

Chạy qua npm thì phải có -- trước cờ:  npm run dong-goi -- --ra D:\\USB`

let nhungNode = true
let nhungNaps2 = true
let thuMucRa = ''

const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const goc = args[i]
  const co = goc.toLowerCase()
  if (['--windows', '-windows', 'windows', '--win', 'win', '-w'].includes(co)) continue
  else if (['--khong-node', '--no-node'].includes(co)) nhungNode = false
  else if (['--khong-naps2', '--no-naps2'].includes(co)) nhungNaps2 = false
  else if (['--ra', '-ra', '--out', '-o'].includes(co)) {
    thuMucRa = args[++i] ?? ''
    if (!thuMucRa) thoat('✗ Cờ --ra cần kèm đường dẫn thư mục.')
  } else if (co.startsWith('--ra=') || co.startsWith('--out=')) thuMucRa = goc.slice(goc.indexOf('=') + 1)
  else if (['--help', '-h', 'help'].includes(co)) {
    console.log(HUONG_DAN)
    process.exit(0)
  } else {
    console.error(`✗ Không hiểu cờ: ${goc}\n\n${HUONG_DAN}`)
    process.exit(1)
  }
}

function thoat(msg) {
  console.error(msg)
  process.exit(1)
}

if (thuMucRa) {
  if (thuMucRa.startsWith('~')) thuMucRa = join(homedir(), thuMucRa.slice(1))
  thuMucRa = resolve(thuMucRa)
} else {
  thuMucRa = join(GOC, 'dist-offline')
}
const RA = join(thuMucRa, 'scanFile-windows')
if ([resolve('/'), homedir()].includes(RA) || thuMucRa === resolve('/')) thoat(`✗ Không đóng gói trực tiếp vào ${RA}`)

console.log(`▶ Đóng gói scanFile cho Windows 64-bit`)
console.log(`  Sẽ ghi vào: ${RA}\n`)

function chay(lenh, { im = false, cwd } = {}) {
  return new Promise((ok, loi) => {
    const p = spawn(lenh, { shell: true, cwd, stdio: im ? 'ignore' : 'inherit' })
    p.on('error', loi)
    p.on('exit', (ma) => (ma === 0 ? ok() : loi(new Error(`Lệnh thất bại (${ma}): ${lenh}`))))
  })
}

async function taiVe(url, file) {
  const res = await fetch(url)
  if (!res.ok) thoat(`✗ Tải thất bại: HTTP ${res.status} — ${url}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
}

// dereference: .next/standalone có symlink (serverExternalPackages); giữ symlink
// thì Windows báo EPERM, còn nếu tạo được thì nó trỏ về project → gói hỏng ở máy khác.
const CHEP = { recursive: true, dereference: true }

// ── 1. build ────────────────────────────────────────────────────────────────
console.log('▶ 1/5  Build production')
await rm(RA, { recursive: true, force: true })
// Xoá bản build cũ nhưng CHỪA .next/dev: `npm run dev` đang chạy song song dùng
// thư mục đó, xoá đi là dev server mất cache giữa chừng.
if (existsSync(join(GOC, '.next'))) {
  for (const e of await readdir(join(GOC, '.next'))) {
    if (e !== 'dev') await rm(join(GOC, '.next', e), { recursive: true, force: true })
  }
}
await chay('npm run build', { im: true, cwd: GOC })

// ── 2. standalone ───────────────────────────────────────────────────────────
console.log('▶ 2/5  Gom bản standalone')
const STANDALONE = join(GOC, '.next', 'standalone')
if (!existsSync(STANDALONE)) thoat('✗ Không thấy .next/standalone — next.config phải có output: "standalone".')
await mkdir(RA, { recursive: true })
await cp(STANDALONE, RA, CHEP)
// server.js không tự phục vụ 2 thư mục này, phải copy tay (theo tài liệu Next)
await cp(join(GOC, '.next', 'static'), join(RA, '.next', 'static'), CHEP)
if (existsSync(join(GOC, 'public'))) await cp(join(GOC, 'public'), join(RA, 'public'), CHEP)

// Gói KHÔNG gọi PowerShell: phần mềm bảo mật ở máy khách chặn kiểu Node gọi
// `powershell -ExecutionPolicy Bypass` chạy ẩn. Mọi việc đó do scanfile-tro-giup.exe
// làm — biên dịch ở đây (máy đóng gói), máy đích chỉ nhận .exe.
// lib/ trong standalone là mã nguồn bị bộ dò gom theo (kèm .ps1) — server chạy
// bằng .next/server nên bỏ đi.
await rm(join(RA, 'lib'), { recursive: true, force: true })
{
  const { bienDichTroGiup } = await import('./bien-dich-tro-giup.mjs')
  const exe = bienDichTroGiup()
  await mkdir(join(RA, 'tools', 'tro-giup'), { recursive: true })
  await cp(exe, join(RA, 'tools', 'tro-giup', 'scanfile-tro-giup.exe'))
  console.log('  ✓ tools\\tro-giup\\scanfile-tro-giup.exe (thay cho PowerShell)')
}

// pdf-lib phải có đủ file thật trong gói
for (const f of ['package.json', 'cjs/index.js']) {
  if (!existsSync(join(RA, 'node_modules', 'pdf-lib', f))) {
    console.log('  … pdf-lib thiếu file, copy tay cả package')
    for (const p of ['pdf-lib', '@pdf-lib', 'pako', 'tslib']) {
      if (existsSync(join(GOC, 'node_modules', p))) await cp(join(GOC, 'node_modules', p), join(RA, 'node_modules', p), CHEP)
    }
    break
  }
}

// Turbopack gặp fs/spawn với đường dẫn động là gom CẢ project vào standalone
// (app/, scripts/, AGENTS.md… lọt vào gói — đã xảy ra mấy lần). build chạy im
// lặng nên không thấy cảnh báo; chặn ở đây. Sửa bằng /*turbopackIgnore: true*/
// đặt NGAY TRONG lời gọi join(...) mà cảnh báo trỏ tới.
{
  const lot = ['app', 'scripts', 'AGENTS.md', 'next.config.mjs', 'eslint.config.mjs'].filter((f) => existsSync(join(RA, f)))
  if (lot.length) {
    thoat(`✗ Mã nguồn lọt vào gói (${lot.join(', ')}). Chạy "npm run build" xem dòng "Dynamic filesystem access causes tracing of the whole project".`)
  }
}
// dữ liệu riêng của máy đóng gói — máy đích tự tạo
for (const f of ['cau-hinh.json', 'nhat-ky-scan.txt', 'nhat-ky-scan.txt.cu']) await rm(join(RA, f), { force: true })

// Không được còn file .ps1 nào trong gói (xem trên).
{
  const ps1 = []
  const quet = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== 'node_modules') await quet(join(d, e.name))
      else if (e.name.toLowerCase().endsWith('.ps1')) ps1.push(join(d, e.name))
    }
  }
  await quet(RA)
  if (ps1.length) thoat(`✗ Gói còn script PowerShell: ${ps1.join(', ')}`)
}

// Còn symlink là gói không mang đi được — bắt ngay ở đây.
const conSymlink = []
async function quetSymlink(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isSymbolicLink()) conSymlink.push(p)
    else if (e.isDirectory()) await quetSymlink(p)
  }
}
await quetSymlink(RA)
if (conSymlink.length) {
  for (const p of conSymlink.slice(0, 10)) console.error(`    ${p} → ${await readlink(p)}`)
  thoat('✗ Gói còn symlink nên không mang sang máy khác được.')
}
console.log('  ✓ standalone đủ, không còn symlink')

// ── 3. NAPS2 portable ───────────────────────────────────────────────────────
if (nhungNaps2) {
  console.log(`▶ 3/5  NAPS2 ${NAPS2_VER} portable (quét TWAIN)`)
  const dirCache = join(CACHE, 'naps2')
  if (!existsSync(join(dirCache, '.xong'))) {
    console.log('  … tải về lần đầu (~50 MB)')
    await rm(dirCache, { recursive: true, force: true })
    await mkdir(dirCache, { recursive: true })
    const tmp = await mkdtemp(join(tmpdir(), 'scanfile-naps2-'))
    const zip = join(tmp, 'naps2.zip')
    await taiVe(NAPS2_URL, zip)
    await chay(`"${TAR}" -xf "${zip}" -C "${dirCache}"`)
    await rm(tmp, { recursive: true, force: true })
    await writeFile(join(dirCache, '.xong'), NAPS2_VER)
  }
  await cp(dirCache, join(RA, 'tools', 'naps2'), CHEP)
  // Data/ của NAPS2 portable chứa recovery/temp của các lượt quét trên máy ĐÓNG GÓI
  // (dev chạy NAPS2 từ cùng tools/naps2) — không mang sang máy đích: nút Xong nhặt
  // trang từ recovery, thư mục cũ lẫn vào thì dễ nhặt nhầm.
  for (const d of ['recovery', 'temp']) {
    await rm(join(RA, 'tools', 'naps2', 'Data', d), { recursive: true, force: true })
  }
  await rm(join(RA, 'tools', 'naps2', '.xong'), { force: true })
  console.log('  ✓ tools\\naps2')
} else {
  console.log('▶ 3/5  Bỏ qua NAPS2 (--khong-naps2)')
}

// ── 4. Node runtime ─────────────────────────────────────────────────────────
if (nhungNode) {
  console.log(`▶ 4/5  Node ${NODE_VER} (win-x64)`)
  const nodeCache = join(CACHE, `node-${NODE_VER}.exe`)
  if (!existsSync(nodeCache)) {
    const ten = `node-${NODE_VER}-win-x64`
    const tmp = await mkdtemp(join(tmpdir(), 'scanfile-node-'))
    const zip = join(tmp, 'node.zip')
    await taiVe(`https://nodejs.org/dist/${NODE_VER}/${ten}.zip`, zip)
    await chay(`"${TAR}" -xf "${zip}" -C "${tmp}"`)
    await mkdir(CACHE, { recursive: true })
    await cp(join(tmp, ten, 'node.exe'), nodeCache)
    await rm(tmp, { recursive: true, force: true })
  }
  await mkdir(join(RA, 'runtime'), { recursive: true })
  await cp(nodeCache, join(RA, 'runtime', 'node.exe'))
  console.log(`  ✓ runtime\\node.exe (${Math.round((await stat(nodeCache)).size / 1048576)} MB)`)
} else {
  console.log('▶ 4/5  Bỏ qua Node runtime (--khong-node)')
}

// ── 5. launcher + tài liệu ──────────────────────────────────────────────────
console.log('▶ 5/5  Script khởi động + hướng dẫn')
await cp(join(GOC, 'scripts', 'khoi-dong.mjs'), join(RA, 'khoi-dong.mjs'))
if (existsSync(join(GOC, 'HUONG-DAN.md'))) await cp(join(GOC, 'HUONG-DAN.md'), join(RA, 'HUONG-DAN.md'))
if (existsSync(join(GOC, '.env.local'))) await cp(join(GOC, '.env.local'), join(RA, '.env.local'))

// .bat phải dùng CRLF, nếu không cmd.exe hiểu sai dòng lệnh.
const bat = [
  '@echo off',
  'setlocal',
  'cd /d "%~dp0"',
  'chcp 65001 >nul',
  'title scanFile',
  '',
  'set "NODE="',
  'if exist "runtime\\node.exe" set "NODE=runtime\\node.exe"',
  'if not defined NODE (',
  '  where node >nul 2>&1 && set "NODE=node"',
  ')',
  'if not defined NODE (',
  '  echo [X] Khong tim thay Node.',
  '  echo     Goi nay duoc dong bang --khong-node nen may phai cai Node ^>= 20 tu nodejs.org',
  '  pause',
  '  exit /b 1',
  ')',
  '',
  '"%NODE%" khoi-dong.mjs',
  'if errorlevel 1 pause',
  '',
].join('\r\n')
await writeFile(join(RA, 'chay.bat'), bat, 'utf8')

await writeFile(
  join(RA, 'BAT-DAU-TU-DAY.txt'),
  `scanFile - bat dau tu day
=========================

1. Cai driver may scan Canon imageFORMULA DR-F120 (TWAIN) tu trang Canon,
   cam cap USB, bat nguon may.

2. Bam dup vao  chay.bat   -> trinh duyet tu mo http://localhost:3100
   Neu SmartScreen canh bao: "More info" -> "Run anyway". Chi lam mot lan.

3. Tren trang: chon thu muc ket qua + ten thu muc con, chon Ket noi = TWAIN,
   bam nut tim may, chon Canon DR-F120, roi bam "Bat dau scan".

4. KHONG can mang, KHONG can cai Node, KHONG can cai NAPS2 (da kem san).

Doi cong: them dong  PORT=3200  vao file .env.local (tao moi bang Notepad).
Huong dan day du: HUONG-DAN.md
`.replace(/\n/g, '\r\n'),
  'utf8',
)

{
  const f = join(RA, 'package.json')
  const pkg = JSON.parse(await readFile(f, 'utf8'))
  pkg.scripts = { start: 'node khoi-dong.mjs' }
  delete pkg.devDependencies
  pkg['//'] = 'Day la GOI DA DONG SAN, khong phai project. Chay bang chay.bat. Muon sua code thi dung project goc.'
  await writeFile(f, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}
// cấu hình của máy đóng gói không mang theo — máy đích tự tạo lần đầu
await rm(join(RA, 'cau-hinh.json'), { force: true })

console.log(`\n✓ Xong: ${RA}`)
console.log('\n  Nén để mang đi:')
console.log(`    powershell Compress-Archive -Path "${RA}" -DestinationPath "${RA}.zip"`)
