'use client'

import dynamic from 'next/dynamic'

/**
 * Màn hình chỉ chạy ở client: nó đọc lựa chọn cỡ ảnh từ localStorage ngay
 * trong initializer của useState, nên không prerender ở server (lệch hydrate).
 */
const ManHinhScan = dynamic(() => import('./components/man-hinh-scan'), {
  ssr: false,
  loading: () => <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">Đang tải…</div>,
})

export default function Page() {
  return <ManHinhScan />
}
