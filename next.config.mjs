/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gom mọi thứ cần thiết vào .next/standalone để đóng gói mang sang máy khác
  // mà không phải npm install. Xem scripts/dong-goi.mjs
  output: 'standalone',

  // pdf-lib chạy ở server (ghép ảnh thành PDF), không cần bundle.
  serverExternalPackages: ['pdf-lib'],

  // Đường dẫn file ở lib/ đều động (thư mục người dùng chọn) nên bộ dò phụ
  // thuộc dễ gom nhầm cả project. tools/ (NAPS2, Node ~100 MB) và gói cũ thì
  // tuyệt đối không được lọt vào — dong-goi.mjs tự copy NAPS2 vào đúng chỗ.
  // Đừng thêm ./.next/** vào đây: nó loại luôn chunk server, gói chạy báo
  // "Cannot find module '../chunks/ssr/[turbopack]_runtime.js'".
  outputFileTracingExcludes: {
    '/*': ['./tools/**', './dist-offline/**'],
  },
}

export default nextConfig
