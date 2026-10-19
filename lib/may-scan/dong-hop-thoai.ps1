# Chạy song song với một lượt quét NAPS2/TWAIN. Driver Canon DR-F120 khi khay
# trống không trả lỗi mà bật hộp thoại "No page in the scanner, add page to the
# scanner?" (OK/Cancel) rồi treo chờ người bấm — scan liên tục sẽ kẹt ở đó.
# Script này thấy hộp thoại đó thì gửi IDCANCEL, lượt quét kết thúc với 0 trang.
#
# Nút trong hộp thoại là loại vẽ tay (UI Automation không bấm được), nhưng
# hộp thoại là #32770 chuẩn nên WM_COMMAND IDCANCEL đóng được — đã kiểm thật.
# Node kill script này khi lượt quét xong.
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class HopThoai {
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
'@

# Câu tiếng Anh đã gặp thật; câu tiếng Việt phòng driver/Windows tiếng Việt ở máy khác.
# Câu lạ không khớp thì không tự bấm — nó được báo lên giao diện (khung vàng) và nhật ký.
$MAU = 'No page in the scanner|add page to the scanner|no paper|Không có (trang|giấy|tài liệu)|(Thêm|Đặt|Hãy đặt) (trang|giấy|tài liệu)'
$goc = [Windows.Automation.AutomationElement]::RootElement
$tatCa = [Windows.Automation.Condition]::TrueCondition

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$daBao = @{}

while ($true) {
  $conMo = @{}
  foreach ($p in Get-Process -Name 'NAPS2.Worker', 'NAPS2.Console' -ErrorAction SilentlyContinue) {
    if ($p.MainWindowHandle -eq 0) { continue }
    $dk = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
    foreach ($w in $goc.FindAll([Windows.Automation.TreeScope]::Children, $dk)) {
      if ($w.Current.ClassName -ne '#32770') { continue }
      $hwnd = $w.Current.NativeWindowHandle
      $chu = (($w.FindAll([Windows.Automation.TreeScope]::Descendants, $tatCa) | ForEach-Object { $_.Current.Name }) |
        Where-Object { $_ -and $_ -notmatch '^(OK|Cancel|Yes|No|Retry|Ignore|Abort)$' }) -join ' '
      if ($chu -match $MAU) {
        [void][HopThoai]::SendMessage([IntPtr]$hwnd, 0x0111, [IntPtr]2, [IntPtr]::Zero)
        Write-Output 'da-dong'
      } elseif ($chu -match '\(-4630\)') {
        # "Thiết bị này có thể không thể khóa…" — máy bị tiến trình cũ giữ. Đóng hộp
        # thoại để lượt quét kết thúc; app sẽ dọn wiawow64 treo rồi thử lại.
        [void][HopThoai]::SendMessage([IntPtr]$hwnd, 0x0111, [IntPtr]2, [IntPtr]::Zero)
        Write-Output 'khoa-may'
      } else {
        # Hộp thoại khác (kẹt giấy, kéo 2 tờ…): KHÔNG tự bấm — người dùng phải
        # xem máy rồi tự chọn. Chỉ báo nội dung về app để hiện lên màn hình.
        $conMo[$hwnd] = $true
        if (-not $daBao.ContainsKey($hwnd)) {
          $daBao[$hwnd] = $true
          Write-Output ("hop-thoai`t" + $w.Current.Name + ': ' + $chu)
        }
      }
    }
  }
  # hộp thoại đã được người dùng đóng → báo để app xoá cảnh báo
  foreach ($h in @($daBao.Keys)) {
    if (-not $conMo.ContainsKey($h)) { $daBao.Remove($h); Write-Output 'hop-thoai-dong' }
  }
  Start-Sleep -Milliseconds 500
}
