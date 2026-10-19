'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { urlAnh } from './the-tai-lieu'

const ZOOM_MIN = 1
const ZOOM_MAX = 8

/**
 * Xem to từng trang, phóng to được để đọc chữ nhỏ.
 *   bấm vào ảnh      phóng ×2.5 đúng chỗ bấm / bấm lại về vừa màn hình
 *   cuộn chuột       phóng to / thu nhỏ quanh con trỏ
 *   kéo              di chuyển khi đang phóng
 *   ← →              trang trước / sau     + −  0   phóng / thu / vừa màn hình     Esc  đóng
 *   R / Shift+R      xoay phải / trái 90° (chỉ file nháp — onXoay có mặt)
 */
export default function XemAnh({ thuMuc, tl, batDau, onDong, onXoay }) {
  const [kChon, setK] = useState(batDau)
  // trang bị chuyển/bỏ trong lúc đang xem → đừng trỏ ra ngoài danh sách
  const k = Math.min(kChon, tl.anh.length - 1)
  const goc = tl.xoay?.[tl.anh[k]] ?? 0
  const [co, setCo] = useState({ w: 0, h: 0 }) // kích thước vùng xem
  const [goc0, setGoc0] = useState({ w: 210, h: 297 }) // kích thước thật của ảnh
  const [z, setZ] = useState(1)
  const [xy, setXy] = useState({ x: 0, y: 0 })
  const khung = useRef(null)
  const keo = useRef(null)
  const [dangKeo, setDangKeo] = useState(false)
  const n = tl.anh.length

  const veVua = useCallback(() => {
    setZ(1)
    setXy({ x: 0, y: 0 })
  }, [])

  const doiTrang = useCallback(
    (moi) => {
      setK(Math.max(0, Math.min(n - 1, moi)))
      veVua()
    },
    [n, veVua],
  )

  /** Phóng tới mức `zMoi`, giữ nguyên điểm ảnh nằm dưới (cx, cy) trên màn hình. */
  const phongQuanh = useCallback(
    (zMoi, cx, cy) => {
      const r = khung.current.getBoundingClientRect()
      const ox = cx - (r.left + r.width / 2)
      const oy = cy - (r.top + r.height / 2)
      setZ((zCu) => {
        const zz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zMoi(zCu)))
        setXy((p) => (zz === 1 ? { x: 0, y: 0 } : { x: ox - ((ox - p.x) * zz) / zCu, y: oy - ((oy - p.y) * zz) / zCu }))
        return zz
      })
    },
    [],
  )

  const phongGiua = useCallback(
    (f) => {
      const r = khung.current.getBoundingClientRect()
      phongQuanh(f, r.left + r.width / 2, r.top + r.height / 2)
    },
    [phongQuanh],
  )

  useEffect(() => {
    const phim = (e) => {
      if (e.key === 'Escape') onDong()
      else if (e.key === 'ArrowRight') doiTrang(k + 1)
      else if (e.key === 'ArrowLeft') doiTrang(k - 1)
      else if (e.key === '+' || e.key === '=') phongGiua((x) => x * 1.5)
      else if (e.key === '-') phongGiua((x) => x / 1.5)
      else if (e.key === '0') veVua()
      else if (onXoay && (e.key === 'r' || e.key === 'R')) onXoay(tl.anh[k], e.shiftKey ? -90 : 90)
    }
    window.addEventListener('keydown', phim)
    return () => window.removeEventListener('keydown', phim)
  }, [k, tl.anh, onDong, onXoay, doiTrang, phongGiua, veVua])

  // theo dõi kích thước vùng xem để tính khung vừa màn hình cho ảnh đã xoay
  useEffect(() => {
    const el = khung.current
    const ro = new ResizeObserver(() => setCo({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // wheel phải gắn không-passive mới chặn được trang cuộn theo
  useEffect(() => {
    const el = khung.current
    const lan = (e) => {
      e.preventDefault()
      phongQuanh((x) => x * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', lan, { passive: false })
    return () => el.removeEventListener('wheel', lan)
  }, [phongQuanh])

  const nut = 'rounded-md bg-neutral-800/90 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-30'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950">
      {/* thanh trên */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm text-neutral-200">
        <span className="mr-auto truncate">
          {tl.ten}.pdf — trang {k + 1}/{n}
        </span>
        <button className={nut} onClick={() => phongGiua((x) => x / 1.5)} disabled={z <= ZOOM_MIN} title="Thu nhỏ (−)">
          −
        </button>
        <span className="w-14 text-center tabular-nums">{Math.round(z * 100)}%</span>
        <button className={nut} onClick={() => phongGiua((x) => x * 1.5)} disabled={z >= ZOOM_MAX} title="Phóng to (+)">
          +
        </button>
        {onXoay && (
          <>
            <button className={nut} onClick={() => onXoay(tl.anh[k], -90)} title="Xoay trái 90° (Shift+R)">
              ⟲
            </button>
            <button className={nut} onClick={() => onXoay(tl.anh[k], 90)} title="Xoay phải 90° (R)">
              ⟳
            </button>
          </>
        )}
        <button className={nut} onClick={veVua} title="Vừa màn hình (0)">
          Vừa màn hình
        </button>
        <button className={nut} onClick={() => doiTrang(k - 1)} disabled={k === 0} title="Trang trước (←)">
          ‹ Trước
        </button>
        <button className={nut} onClick={() => doiTrang(k + 1)} disabled={k === n - 1} title="Trang sau (→)">
          Sau ›
        </button>
        <button className={`${nut} bg-red-900/80 hover:bg-red-700`} onClick={onDong} title="Đóng (Esc)">
          ✕ Đóng
        </button>
      </div>

      {/* vùng ảnh */}
      <div
        ref={khung}
        className={`relative flex-1 select-none overflow-hidden ${z > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
        onPointerDown={(e) => {
          keo.current = { x: e.clientX, y: e.clientY, x0: xy.x, y0: xy.y, da: false }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = keo.current
          if (!d) return
          const dx = e.clientX - d.x
          const dy = e.clientY - d.y
          if (Math.abs(dx) + Math.abs(dy) > 4) d.da = true
          if (d.da && z > 1) {
            setDangKeo(true)
            setXy({ x: d.x0 + dx, y: d.y0 + dy })
          }
        }}
        onPointerUp={(e) => {
          const d = keo.current
          keo.current = null
          setDangKeo(false)
          if (d && !d.da) {
            // bấm (không kéo): phóng đúng chỗ bấm, hoặc về vừa màn hình
            if (z > 1) veVua()
            else phongQuanh(() => 2.5, e.clientX, e.clientY)
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh local */}
        <img
          src={urlAnh(thuMuc, tl.anh[k])}
          alt={`Trang ${k + 1}`}
          draggable={false}
          onLoad={(e) => setGoc0({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="absolute left-1/2 top-1/2 max-w-none bg-white shadow-2xl"
          style={{
            // vừa màn hình tính theo khung SAU khi xoay: trang dọc xoay 90° thành ngang
            ...vuaKhung(goc0, co, goc),
            transform: `translate(-50%, -50%) translate(${xy.x}px, ${xy.y}px) scale(${z}) rotate(${goc}deg)`,
            transition: dangKeo ? 'none' : 'transform 80ms ease-out',
          }}
        />
      </div>

      <p className="py-1.5 text-center text-xs text-neutral-500">
        Bấm vào ảnh để phóng to chỗ đó · cuộn chuột để zoom · kéo để di chuyển · ← → đổi trang · Esc đóng
      </p>
    </div>
  )
}

/** Kích thước <img> (trước khi xoay) để ảnh SAU khi xoay vừa khít vùng xem. */
function vuaKhung(anh, co, goc) {
  if (!co.w || !co.h) return { width: 0, height: 0 }
  const nam = goc % 180 !== 0
  const rw = nam ? anh.h : anh.w
  const rh = nam ? anh.w : anh.h
  const s = Math.min(co.w / rw, co.h / rh)
  return { width: anh.w * s, height: anh.h * s }
}
