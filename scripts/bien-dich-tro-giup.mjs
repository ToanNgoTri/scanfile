/**
 * Biên dịch tro-giup/scanfile-tro-giup.cs → tools/tro-giup/scanfile-tro-giup.exe
 * bằng csc.exe có sẵn trong .NET Framework 4 của Windows (không cần cài gì).
 *
 * Biên dịch ở MÁY ĐÓNG GÓI; máy đích chỉ nhận file .exe — gọi trình biên dịch
 * lúc chạy ở máy khách cũng là hành vi phần mềm bảo mật hay chặn.
 *
 *   node scripts/bien-dich-tro-giup.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GOC = resolve(fileURLToPath(import.meta.url), '..', '..')
const WIN = process.env.WINDIR || 'C:\\Windows'
const NET = join(WIN, 'Microsoft.NET', 'Framework64', 'v4.0.30319')
const CSC = join(NET, 'csc.exe')

export function bienDichTroGiup() {
  if (process.platform !== 'win32') throw new Error('Chỉ biên dịch được trên Windows (cần csc.exe của .NET Framework).')
  if (!existsSync(CSC)) throw new Error(`Không thấy ${CSC}`)

  // UIAutomation không nằm cạnh csc mà trong GAC — tìm theo tên
  const gac = (ten) => {
    const d = join(WIN, 'Microsoft.NET', 'assembly', 'GAC_MSIL', ten)
    const ban = existsSync(d) ? readdirSync(d).find((x) => x.startsWith('v4.0')) : null
    if (!ban) throw new Error(`Không thấy ${ten}.dll trong GAC`)
    return join(d, ban, ten + '.dll')
  }

  const ra = join(GOC, 'tools', 'tro-giup', 'scanfile-tro-giup.exe')
  mkdirSync(join(GOC, 'tools', 'tro-giup'), { recursive: true })
  const r = spawnSync(
    CSC,
    [
      '/nologo',
      '/target:exe',
      '/platform:anycpu',
      '/optimize+',
      '/codepage:65001',
      `/out:${ra}`,
      '/r:Microsoft.CSharp.dll',
      '/r:System.Core.dll',
      '/r:System.Management.dll',
      `/r:${gac('UIAutomationClient')}`,
      `/r:${gac('UIAutomationTypes')}`,
      join(GOC, 'tro-giup', 'scanfile-tro-giup.cs'),
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error('csc báo lỗi:\n' + (r.stdout || '') + (r.stderr || ''))
  return ra
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log('✓ ' + bienDichTroGiup())
  } catch (e) {
    console.error('✗ ' + e.message)
    process.exit(1)
  }
}
