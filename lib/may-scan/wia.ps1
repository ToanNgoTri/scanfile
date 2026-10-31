# Quét qua WIA (có sẵn trong Windows, không cần NAPS2). Dùng khi driver máy scan
# có phần WIA. In ra đúng MỘT dòng JSON ở cuối để Node đọc.
param(
  [string]$Action = 'scan',
  [string]$DeviceId = '',
  [string]$OutDir = '',
  [int]$Dpi = 300,
  [string]$Mau = 'color',
  [string]$Nguon = 'feeder'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Ra($o) { Write-Output (ConvertTo-Json -InputObject $o -Compress -Depth 4); exit 0 }
function MaLoi($e) {
  while ($e.InnerException) { $e = $e.InnerException }
  return ('{0:X8}' -f $e.HResult)
}
function DatThuocTinh($props, [int]$id, $val) {
  foreach ($p in $props) {
    if ($p.PropertyID -eq $id) { try { $p.Value = $val } catch { }; return }
  }
}

try {
  $dm = New-Object -ComObject WIA.DeviceManager
} catch {
  Ra @{ loi = 'Không khởi tạo được WIA trên máy này.' }
}

if ($Action -eq 'list') {
  $ds = @()
  foreach ($di in $dm.DeviceInfos) {
    if ($di.Type -eq 1) { $ds += @{ id = $di.DeviceID; ten = $di.Properties.Item('Name').Value } }
  }
  Ra @{ thietBi = $ds }
}

$di = $null
foreach ($d in $dm.DeviceInfos) {
  if ($d.Type -eq 1 -and ($DeviceId -eq '' -or $d.DeviceID -eq $DeviceId)) { $di = $d; break }
}
if (-not $di) { Ra @{ loi = 'Không thấy máy scan WIA nào. Kiểm cáp USB, nguồn và driver.' } }

try { $dev = $di.Connect() } catch { Ra @{ loi = "Không kết nối được máy scan (mã $(MaLoi $_.Exception))." } }

# Chỉ đọc cảm biến giấy, không quét. 3087 = DOCUMENT_HANDLING_STATUS, bit 1 = FEED_READY.
# Đã kiểm với DR-F120: khay trống = 2, có giấy = 3.
if ($Action -eq 'giay') {
  foreach ($p in $dev.Properties) {
    if ($p.PropertyID -eq 3087) { Ra @{ coGiay = [bool]($p.Value -band 1) } }
  }
  Ra @{ loi = 'Máy không báo trạng thái khay giấy qua WIA.' }
}

$kinh = $Nguon -eq 'glass'
# 3088 = DOCUMENT_HANDLING_SELECT: 1 khay nạp, 5 khay nạp + 2 mặt, 2 mặt kính
DatThuocTinh $dev.Properties 3088 $(if ($kinh) { 2 } elseif ($Nguon -eq 'duplex') { 5 } else { 1 })
# 3096 = PAGES: 0 = quét hết khay; mặt kính 1 tờ
DatThuocTinh $dev.Properties 3096 $(if ($kinh) { 1 } else { 0 })

$item = $dev.Items.Item(1)
# 6146 = CURRENT_INTENT: 1 màu, 2 xám, 4 đen trắng
DatThuocTinh $item.Properties 6146 $(switch ($Mau) { 'gray' { 2 } 'bw' { 4 } default { 1 } })
DatThuocTinh $item.Properties 6147 $Dpi
DatThuocTinh $item.Properties 6148 $Dpi

$JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
$n = 0
while ($true) {
  try {
    $img = $item.Transfer($JPEG)
  } catch {
    $ma = MaLoi $_.Exception
    # 80210003 = hết giấy: đây là cách WIA báo "đã quét xong khay"
    if ($ma -eq '80210003') {
      if ($n -eq 0) { Ra @{ soTrang = 0; hetGiay = $true } }
      break
    }
    if ($n -gt 0) { break }
    $mota = switch ($ma) {
      '80210002' { 'Kẹt giấy.' }
      '80210006' { 'Máy scan đang bận.' }
      '80210005' { 'Máy scan đang tắt hoặc mất kết nối.' }
      default { "Lỗi WIA mã $ma." }
    }
    Ra @{ loi = $mota }
  }
  $n++
  $f = Join-Path $OutDir ('{0:D4}.jpg' -f $n)
  if ($img.FormatID -ne $JPEG) {
    $ip = New-Object -ComObject WIA.ImageProcess
    $ip.Filters.Add($ip.FilterInfos.Item('Convert').FilterID)
    $ip.Filters.Item(1).Properties.Item('FormatID').Value = $JPEG
    $img = $ip.Apply($img)
  }
  $img.SaveFile($f)
  # mặt kính chỉ có một tờ — Transfer tiếp là quét lại tờ đó
  if ($kinh) { break }
}
Ra @{ soTrang = $n }
