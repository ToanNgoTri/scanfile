# scanFile — hướng dẫn sử dụng

Quét giấy tờ bằng **Canon imageFORMULA DR-F120**, xem ngay ảnh vừa quét, tự ghép thành PDF và
đổi tên PDF ngay trên màn hình.

---

## 1. Chuẩn bị máy (một lần)

1. Cài **driver TWAIN của Canon DR-F120** (tải ở trang hỗ trợ Canon, mục *Driver*).
2. Cắm cáp USB, bật nguồn máy scan.
3. Giải nén gói `scanFile-windows` ra thư mục bất kỳ (Desktop cũng được).

Gói đã kèm sẵn Node và NAPS2 (phần mềm quét portable) — **không cần cài gì thêm, không cần mạng**.

## 2. Mở app

Bấm đúp **`chay.bat`** → trình duyệt tự mở `http://localhost:3100`.
Giữ cửa sổ đen mở trong lúc dùng; đóng nó là tắt app.

## 3. Chọn nơi lưu

| Ô | Ý nghĩa |
|---|---|
| **Thư mục kết quả scan** | Thư mục gốc, ví dụ `D:\Scan` |
| **Thư mục con** | Thư mục nằm ngay dưới thư mục trên — mỗi đợt / mỗi hồ sơ một thư mục. Mặc định `Scan-<ngày>` |

- Gõ tên **chưa có** → nhãn xanh dương *chưa có · tự tạo khi scan*.
- Gõ (hoặc chọn từ gợi ý) tên **đã có** → nhãn xanh lá *đã có · dùng tiếp*, các PDF cũ hiện ra
  bên dưới, file mới quét sẽ được thêm vào.
- **Đổi tên thư mục**: đổi tên thư mục con đang dùng ngay trên ổ đĩa (đóng Explorer / trình xem PDF
  đang mở thư mục đó trước).

## 4. Chọn máy scan

- **Kết nối = TWAIN** (khuyên dùng cho DR-F120) → bấm **↻** → chọn *Canon DR-F120*.
  Để trống = dùng máy đầu tiên tìm thấy.
- **WIA**: dùng khi driver có phần WIA và không có NAPS2.
- **Giả lập**: không cần máy, để làm quen với app.
- **Nguồn giấy**: *Tự động* (mặc định) — có giấy ở khay nạp thì quét 2 mặt qua khay nạp; khay nạp
  trống thì quét tờ đặt trên **mặt kính** (dưới nắp). *Khay nạp — 2 mặt*: 2 tờ cho ra 4 ảnh.
  *Mặt kính*: luôn quét mặt kính, mỗi lần 1 tờ (không dùng được với Scan liên tục).

## 5. Quét

1. Đặt giấy lên khay, bấm **▶ Bắt đầu scan**.
2. Mỗi lần quét, app chia ảnh thành các **file nháp** theo ô **Gộp PDF** (chưa ghi PDF nào):
   - **Đủ N trang → gộp 1 PDF** (mặc định N = 4): lần quét ra đúng 4 ảnh → 1 file PDF 4 trang;
     ra số ảnh khác → **mỗi ảnh 1 file PDF**.
   - **Mỗi lần scan → 1 PDF**: cả khay thành một file.
   - **Luôn mỗi ảnh 1 PDF**.
3. **Scan liên tục**: tích ô này rồi bấm Bắt đầu. App đọc cảm biến khay giấy: khay trống thì hiện
   *Đang chờ đặt giấy vào khay…*, đặt giấy vào là **tự quét**, không cần bấm gì. Quét xong lại chờ
   lượt giấy kế. Bấm **Dừng sau lượt này** để ngừng.

4. **Kết thúc**: trong lúc quét có 2 nút —
   - **✓ Xong**: hết giấy / không quét nữa → kết thúc ngay và **GIỮ** các trang đã quét (thành
     file nháp). Dùng khi máy cứ đứng chờ thêm giấy sau tờ cuối. Tắt luôn chế độ liên tục.
   - **✕ Huỷ lượt này**: bỏ lượt đang quét, **không giữ** trang nào (đặt nhầm giấy, kéo lệch…).
   Lượt quét ngay sau khi Huỷ có thể chậm ~1 phút vì máy khởi động lại driver.
5. **Máy báo lỗi** (kẹt giấy, giấy chồng…): app hiện khung vàng *⚠ Máy scan báo: …* kèm nội dung
   lỗi của Canon. Xử lý trên máy, rồi bấm nút trong hộp thoại Canon trên màn hình — hoặc **✓ Xong** / **✕ Huỷ lượt này**.
6. **Scan tiếp vào một file**: đặt thêm giấy, bấm **📠 Scan tiếp vào file này** trên thẻ nháp —
   các trang quét được nối vào **cuối** file đó (không tạo file mới, không theo quy tắc gộp).

7. **Cảm biến khay giấy có lúc báo sai** (đã đặt giấy mà báo trống). Vì vậy:
   - Bấm **▶ Bắt đầu scan** (không tích liên tục) là máy chạy luôn, không hỏi cảm biến.
   - Ở chế độ liên tục, lúc đang chờ giấy có nút **▶ Quét ngay** — đã đặt giấy mà app vẫn chờ
     thì bấm nút này. Cảm biến cứ báo trống quá 30 giây thì app cũng tự quét thử một lần.
8. **Máy tắt / tự ngủ / lỏng cáp**: app báo *"Máy scan không còn kết nối…"* hoặc *"Không tìm thấy
   máy scan (mã -4536)"* và dừng, không còn đứng "đang quét" mãi. Bật lại máy rồi quét lại.

> Driver Canon khi bị bảo quét lúc khay trống sẽ bật hộp thoại *"No page in the scanner, add page
> to the scanner?"*. App tự đóng hộp thoại này — nếu bạn vẫn thấy nó nháy lên thì cứ kệ.

## 6. Sửa nháp rồi Lưu

Quét xong, mỗi file hiện thành một **thẻ nháp** (theo thứ tự quét, cũ ở trên). Sửa thoải mái —
**chưa có gì được ghi ra ổ đĩa** cho tới khi bấm **💾 Lưu thành PDF** ở đáy màn hình (hoặc **Ctrl+S**).

**Tên file** (dòng ✎): file vừa quét được chọn sẵn ô tên — gõ luôn, **Enter**. Không cần gõ `.pdf`.
Tên trùng hoặc có ký tự `\ / : * ? " < > |` báo đỏ ngay.

**Thư mục con của con** (dòng 📁, ngay dưới tên): PDF sẽ lưu vào thư mục này bên trong thư mục con.
Để trống = lưu thẳng trong thư mục con. Nhiều cấp thì ngăn bằng `\`, ví dụ `Ho so A\Nguyen Van A`.
Thư mục chưa có thì tự tạo lúc Lưu. Ô **Thư mục con của con** ở phần trên cùng là giá trị mặc định
cho các file quét tiếp theo.

**Di chuyển trang** — rê chuột vào một trang để hiện nút:

| Nút | Việc |
|---|---|
| ⟲ ⟳ (góc trên) | Xoay trang trái / phải 90° |
| ▲ | Đưa trang lên **cuối** file phía trên |
| ◀ ▶ | Đổi chỗ trong cùng file |
| ▼ | Đưa trang xuống **đầu** file phía dưới |
| ✂ | Tách trang ra thành file mới |
| ✕ | Bỏ trang |

Hoặc **kéo-thả** trang sang chỗ khác / sang file khác. File hết trang thì tự biến mất.

**Xem to**: bấm vào trang → bấm tiếp vào chỗ cần đọc để phóng ×2.5, cuộn chuột để zoom, kéo để di
chuyển, ← → đổi trang, **R** / **Shift+R** (hoặc nút ⟳ ⟲) xoay, Esc đóng.

**Xoay**: chỉ xoay khi hiển thị và trong PDF — ảnh gốc giữ nguyên, nên xoay bao nhiêu lần cũng không
mờ đi. Nút **⟳ Xoay cả file** xoay mọi trang của file. Nút **Cỡ ảnh: Nhỏ / Vừa / Lớn** chỉnh cỡ thumbnail.

Nút trên thẻ nháp: **Xem thử PDF** (dựng tạm, không ghi file) · **▲ Gộp vào file trên** ·
**Tách từng trang** · **Xoá**.

**Lưu**: app kiểm hết trước — có lỗi (trùng tên, tên sai) thì **không ghi file nào**, các thẻ lỗi
viền đỏ để sửa. Lưu xong, file chuyển xuống mục **Đã lưu** (Xem PDF · Hiện trong thư mục ·
**Sửa lại** chỉ còn với file lưu trước khi có bản này — từ nay Lưu xong app xoá ảnh scan cho nhẹ máy,
muốn sửa file đã lưu thì quét lại).

## 7. Trong thư mục kết quả có gì

```
D:\Scan\Ho so A\
  Giay khai sinh.pdf          ← các PDF của bạn
  scan-0002.pdf
  Nguyen Van A\CCCD.pdf       ← PDF lưu vào "thư mục con của con"
  _anh-scan\                  ← (thư mục ẩn) ảnh của các trang còn NHÁP; Lưu xong là ảnh bị xoá
```

Đừng xoá `_anh-scan` khi còn file nháp chưa Lưu. Gửi hồ sơ cho người khác thì chỉ cần các file PDF.

## 8. Gặp lỗi

| Hiện tượng | Cách sửa |
|---|---|
| Danh sách máy scan trống | Kiểm cáp/nguồn, cài lại driver TWAIN Canon, bấm ↻ |
| "Không quét được trang nào" | Khay trống hoặc giấy chưa vào hẳn khay |
| "Chưa có NAPS2" | Gói bị thiếu `tools\naps2` — đóng gói lại, hoặc cài NAPS2 từ naps2.com |
| Cổng 3100 bị chiếm | Tạo file `.env.local` cạnh `chay.bat`, ghi `PORT=3200` |
| Hết giấy mà vẫn ghi "Đang quét" mãi | Bấm **✓ Xong** (giữ các trang đã quét). Nếu lặp lại: gửi file `nhat-ky-scan.txt` (cạnh `chay.bat`) cho người hỗ trợ |
| Ngay sau khi Huỷ, lượt quét kế chậm ~1 phút | Bình thường — máy khởi động lại driver |
| Khung vàng "Máy scan báo …" | Driver Canon đang hiện hộp thoại: xử lý trên máy rồi bấm nút trong hộp thoại, hoặc ✓ Xong |

| Phần mềm bảo mật cảnh báo / chặn | App không dùng PowerShell. Nếu vẫn bị chặn: thêm thư mục gói vào danh sách loại trừ (exclusion) của phần mềm bảo mật, hoặc nhờ IT cho phép `tools\tro-giup\scanfile-tro-giup.exe` và `tools\naps2\` |

**Nhật ký**: mọi lượt quét được ghi vào `nhat-ky-scan.txt` cạnh `chay.bat` (cảm biến giấy báo gì,
driver bật hộp thoại nào, NAPS2 trả về gì). Gặp lỗi ở máy nào thì gửi file đó.

---

## Cho người phát triển

```
npm install
npm run dev -- -p 3100        chạy thử (chọn Kết nối = Giả lập nếu chưa có máy)
npm run dong-goi:win          đóng gói → dist-offline\scanFile-windows
node scripts/dong-goi.mjs --ra D:\USB
```

Lần đóng gói đầu cần mạng để tải Node và NAPS2 portable (lưu đệm ở `tools\`, lần sau không tải lại).

Đóng gói cũng biên dịch `tro-giup\scanfile-tro-giup.cs` → `tools\tro-giup\scanfile-tro-giup.exe`
bằng `csc.exe` có sẵn của Windows (chạy riêng: `node scripts/bien-dich-tro-giup.mjs`). Chương trình
nhỏ này làm mọi việc trước đây giao cho PowerShell (WIA, cảm biến giấy, canh hộp thoại driver, dọn
`wiawow64`, kiểm USB) — phần mềm bảo mật chặn kiểu Node gọi `powershell -ExecutionPolicy Bypass`.
Gói không được chứa file `.ps1` nào (script đóng gói tự kiểm). File `.ps1` trong `lib\may-scan\` chỉ
còn là đường lùi khi chạy từ project mà chưa biên dịch `.exe`.
Chạy từ project mà muốn quét thật: cài NAPS2, hoặc ghi `NAPS2_PATH=...\NAPS2.Console.exe` vào `.env.local`.
