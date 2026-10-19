'use client'

import { useState } from 'react'

/**
 * Ảnh xoay `xoay` độ mà khung chứa vẫn ôm sát: xoay 90°/270° thì trang dọc
 * thành ngang, khung đổi theo — CSS rotate thường giữ nguyên khung cũ nên ảnh
 * tràn ra ngoài/đè lên trang bên cạnh.
 *   cao: chiều cao khung (px), chiều rộng tự tính theo tỉ lệ ảnh
 */
export default function AnhXoay({ src, xoay = 0, cao, alt, className = '' }) {
  // tỉ lệ rộng/cao của ảnh gốc; A4 dọc cho tới khi ảnh tải xong
  const [tiLe, setTiLe] = useState(210 / 297)
  const nam = xoay % 180 !== 0
  // kích thước <img> TRƯỚC khi xoay
  const rong = nam ? cao : cao * tiLe
  const doc = nam ? cao / tiLe : cao
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width: nam ? doc : rong, height: cao }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh từ ổ đĩa local, không qua next/image */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        onLoad={(e) => setTiLe(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        className="absolute left-1/2 top-1/2 max-w-none"
        style={{ width: rong, height: doc, transform: `translate(-50%, -50%) rotate(${xoay}deg)` }}
      />
    </div>
  )
}
