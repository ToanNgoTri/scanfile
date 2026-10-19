import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Chạy một chương trình, gom stdout/stderr. Không dùng shell để khỏi phải escape. */
export function chayLenh(file, args, { timeout = 10 * 60 * 1000, onSpawn, onData } = {}) {
  return new Promise((ok, loi) => {
    const p = spawn(file, args, { windowsHide: true })
    onSpawn?.(p)
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => {
      out += d
      onData?.(String(d))
    })
    p.stderr.on('data', (d) => {
      err += d
      onData?.(String(d))
    })
    const t = setTimeout(() => p.kill(), timeout)
    p.on('error', (e) => {
      clearTimeout(t)
      loi(e)
    })
    p.on('close', (ma) => {
      clearTimeout(t)
      ok({ ma, out, err })
    })
  })
}

/**
 * Script .ps1 nằm ở lib/may-scan/ khi chạy từ project; bản đóng gói copy nó
 * ra cạnh server.js (bộ dò phụ thuộc của Next không gom file .ps1).
 */
export function timScript(ten) {
  const f = [join(/*turbopackIgnore: true*/ process.cwd(), ten), join(/*turbopackIgnore: true*/ process.cwd(), 'lib', 'may-scan', ten)].find((p) => existsSync(p))
  if (!f) throw new Error(`Thiếu file ${ten} cạnh app.`)
  return f
}

export const PS_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File']
