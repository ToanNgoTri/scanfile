/**
 * Script khởi động của gói đóng sẵn. chay.bat chỉ là vỏ mỏng tìm ra Node rồi
 * gọi file này.
 *
 *   1. đọc .env.local (PORT, NAPS2_PATH nếu có)
 *   2. kiểm NAPS2 — thiếu thì CẢNH BÁO (vẫn chạy được WIA / giả lập)
 *   3. bật server.js và mở trình duyệt
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const GOC = dirname(fileURLToPath(import.meta.url))
process.chdir(GOC)

/** Giữ cửa sổ lại để người dùng đọc được lỗi, thay vì nó biến mất ngay. */
async function dungLai(ma = 1) {
  process.stdout.write('\nBấm Enter để đóng...')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  await new Promise((r) => rl.question('', () => r()))
  rl.close()
  process.exit(ma)
}

// ── 1. .env.local ───────────────────────────────────────────────────────────
const fEnv = join(GOC, '.env.local')
if (existsSync(fEnv)) {
  for (const dong of readFileSync(fEnv, 'utf8').split(/\r?\n/)) {
    const m = dong.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

if (!existsSync(join(GOC, 'server.js'))) {
  console.error('✗ Không thấy server.js — file này chỉ chạy trong gói đóng sẵn.')
  console.error('  Ở project, dùng:  npm run dev')
  await dungLai()
}

// ── 2. NAPS2 ────────────────────────────────────────────────────────────────
function coNaps2(dir, sau = 3) {
  if (!existsSync(dir)) return false
  if (existsSync(join(dir, 'NAPS2.Console.exe'))) return true
  return sau > 0 && readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && coNaps2(join(dir, e.name), sau - 1))
}
if (process.env.NAPS2_PATH ? existsSync(process.env.NAPS2_PATH) : coNaps2(join(GOC, 'tools', 'naps2'))) {
  console.log('ℹ NAPS2: có — quét được qua TWAIN.')
} else {
  console.log('⚠ Không thấy NAPS2 trong tools\\naps2 — chỉ quét được qua WIA hoặc chế độ giả lập.')
}

// ── 3. Bật server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || '3100'
const URL_APP = `http://localhost:${PORT}`
console.log(`▶ scanFile đang chạy trên ${URL_APP}   (đóng cửa sổ này hoặc Ctrl+C để dừng)`)

const con = spawn(process.execPath, [join(GOC, 'server.js')], {
  stdio: 'inherit',
  env: { ...process.env, PORT, HOSTNAME: process.env.HOSTNAME || '127.0.0.1' },
})

setTimeout(() => {
  const [lenh, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', URL_APP]]
      : process.platform === 'darwin'
        ? ['open', [URL_APP]]
        : ['xdg-open', [URL_APP]]
  spawn(lenh, args, { stdio: 'ignore', detached: true }).unref()
}, 2000)

con.on('exit', async (ma) => {
  if (ma && ma !== 0) {
    console.error(`\n✗ Server dừng với mã ${ma}.`)
    if (ma === 1) console.error('  Cổng có thể đang bị chiếm. Thêm dòng PORT=3200 vào .env.local rồi chạy lại.')
    await dungLai(ma)
  }
  process.exit(ma ?? 0)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    con.kill()
    process.exit(0)
  })
}
