import './globals.css'

export const metadata = {
  title: 'scanFile',
  description: 'Quét từ Canon imageFORMULA DR-F120 ra PDF',
}

// Không dùng next/font/google: gói đóng sẵn phải chạy được trên máy không có mạng.
export default function RootLayout({ children }) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
