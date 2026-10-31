// scanfile-tro-giup.exe — làm thay mọi việc trước đây giao cho PowerShell.
//
// Vì sao: Node.js gọi `powershell.exe -ExecutionPolicy Bypass -NonInteractive`
// chạy ẩn là đúng kiểu hành vi mà phần mềm bảo mật canh mã độc — đã bị chặn ở
// máy khách. Một .exe riêng, làm đúng việc của nó, không chạy script nào.
//
// Biên dịch bằng csc.exe có sẵn trong .NET Framework 4 của Windows:
//   node scripts/bien-dich-tro-giup.mjs
//
// Lệnh (in đúng một dòng JSON ở cuối, trừ canh-hop-thoai in từng dòng sự kiện):
//   wia-list                                     → {"thietBi":[{"id":..,"ten":..}]}
//   wia-giay                                     → {"coGiay":true|false} | {"loi":..}
//   wia-scan <thư mục> <dpi> <mau> <nguon> [id]  → {"soTrang":n,"hetGiay":bool} | {"loi":..}
//   canh-hop-thoai <pid cha>                     → dòng: da-dong | khoa-may | loi-may<TAB>.. | hop-thoai<TAB>.. | hop-thoai-dong
//   don-wia [từ lúc, ms epoch]                   → số tiến trình wiawow64 đã tắt
//   dong-het-hop-thoai                           → số hộp thoại NAPS2/driver đã bấm Cancel (nút Xong)
//   usb-canon                                    → {"thietBi":[{"status":..,"ten":..}]}

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Automation;

static class TroGiup
{
    [DllImport("user32.dll")]
    static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);

    const string WIA_JPEG = "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}";

    [STAThread]
    static int Main(string[] a)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            switch (a.Length > 0 ? a[0] : "")
            {
                case "wia-list": return WiaList();
                case "wia-giay": return WiaGiay();
                case "wia-scan": return WiaScan(a);
                case "canh-hop-thoai": return CanhHopThoai(a.Length > 1 ? int.Parse(a[1]) : 0);
                // kiểm bộ nhận câu "hết giấy": thu-mau "<nội dung hộp thoại>"
                case "thu-mau": Ra((HET_GIAY.IsMatch(KhongDau(a[1])) ? "khop" : "khong-khop") + "\t" + KhongDau(a[1])); return 0;
                case "don-wia": return DonWia(a.Length > 1 ? long.Parse(a[1]) : 0);
                case "dong-het-hop-thoai": return DongHetHopThoai();
                case "usb-canon": return UsbCanon();
                default:
                    Console.Error.WriteLine("Lệnh: wia-list | wia-giay | wia-scan | canh-hop-thoai | don-wia | usb-canon");
                    return 2;
            }
        }
        catch (Exception e)
        {
            Ra("{\"loi\":" + Q(e.Message) + "}");
            return 1;
        }
    }

    // ── JSON tối thiểu ───────────────────────────────────────────────────────
    static string Q(string s)
    {
        var b = new StringBuilder("\"");
        foreach (var c in s ?? "")
        {
            if (c == '"' || c == '\\') b.Append('\\').Append(c);
            else if (c < ' ') b.AppendFormat("\\u{0:x4}", (int)c);
            else b.Append(c);
        }
        return b.Append('"').ToString();
    }
    static void Ra(string json) { Console.WriteLine(json); Console.Out.Flush(); }

    // ── WIA ──────────────────────────────────────────────────────────────────
    static dynamic DeviceManager() { return Activator.CreateInstance(Type.GetTypeFromProgID("WIA.DeviceManager")); }

    /// <summary>Máy scan WIA đầu tiên (hoặc đúng id); null nếu không có.</summary>
    static dynamic TimMay(dynamic dm, string id)
    {
        foreach (dynamic di in dm.DeviceInfos)
            if ((int)di.Type == 1 && (string.IsNullOrEmpty(id) || (string)di.DeviceID == id)) return di;
        return null;
    }

    static void DatThuocTinh(dynamic props, int id, object val)
    {
        foreach (dynamic p in props)
            if ((int)p.PropertyID == id) { try { p.Value = val; } catch { } return; }
    }

    static string MaLoi(Exception e)
    {
        while (e.InnerException != null) e = e.InnerException;
        return ((uint)Marshal.GetHRForException(e)).ToString("X8");
    }

    static int WiaList()
    {
        var ds = new List<string>();
        foreach (dynamic di in DeviceManager().DeviceInfos)
            if ((int)di.Type == 1)
                ds.Add("{\"id\":" + Q((string)di.DeviceID) + ",\"ten\":" + Q((string)di.Properties["Name"].Value) + "}");
        Ra("{\"thietBi\":[" + string.Join(",", ds) + "]}");
        return 0;
    }

    /// <summary>Đọc cảm biến khay: 3087 = DOCUMENT_HANDLING_STATUS, bit 1 = FEED_READY. DR-F120: trống = 2, có giấy = 3.</summary>
    static int WiaGiay()
    {
        var di = TimMay(DeviceManager(), null);
        if (di == null) { Ra("{\"loi\":\"Không thấy máy scan WIA nào.\"}"); return 0; }
        dynamic dev;
        try { dev = di.Connect(); }
        catch (Exception e) { Ra("{\"loi\":" + Q("Không kết nối được máy (mã " + MaLoi(e) + ").") + "}"); return 0; }
        foreach (dynamic p in dev.Properties)
            if ((int)p.PropertyID == 3087) { Ra("{\"coGiay\":" + ((((int)p.Value) & 1) != 0 ? "true" : "false") + "}"); return 0; }
        Ra("{\"loi\":\"Máy không báo trạng thái khay giấy qua WIA.\"}");
        return 0;
    }

    static int WiaScan(string[] a)
    {
        string dir = a[1];
        int dpi = int.Parse(a[2]);
        string mau = a[3], nguon = a[4];
        string id = a.Length > 5 ? a[5] : null;

        var di = TimMay(DeviceManager(), id);
        if (di == null) { Ra("{\"loi\":\"Không thấy máy scan WIA nào. Kiểm cáp USB, nguồn và driver.\"}"); return 0; }
        dynamic dev;
        try { dev = di.Connect(); }
        catch (Exception e) { Ra("{\"loi\":" + Q("Không kết nối được máy scan (mã " + MaLoi(e) + ").") + "}"); return 0; }

        bool kinh = nguon == "glass";
        // 3088: 1 khay nạp, 5 khay nạp + 2 mặt, 2 mặt kính
        DatThuocTinh(dev.Properties, 3088, kinh ? 2 : nguon == "duplex" ? 5 : 1);
        DatThuocTinh(dev.Properties, 3096, kinh ? 1 : 0);               // mặt kính 1 tờ, khay nạp quét hết
        dynamic item = dev.Items[1];
        DatThuocTinh(item.Properties, 6146, mau == "gray" ? 2 : mau == "bw" ? 4 : 1);
        DatThuocTinh(item.Properties, 6147, dpi);
        DatThuocTinh(item.Properties, 6148, dpi);

        int n = 0;
        while (true)
        {
            dynamic img;
            try { img = item.Transfer(WIA_JPEG); }
            catch (Exception e)
            {
                var ma = MaLoi(e);
                if (ma == "80210003") // hết giấy = quét xong khay
                {
                    if (n == 0) { Ra("{\"soTrang\":0,\"hetGiay\":true}"); return 0; }
                    break;
                }
                if (n > 0) break;
                var mota = ma == "80210002" ? "Kẹt giấy." : ma == "80210006" ? "Máy scan đang bận." :
                           ma == "80210005" ? "Máy scan đang tắt hoặc mất kết nối." : "Lỗi WIA mã " + ma + ".";
                Ra("{\"loi\":" + Q(mota) + "}");
                return 0;
            }
            n++;
            if ((string)img.FormatID != WIA_JPEG)
            {
                dynamic ip = Activator.CreateInstance(Type.GetTypeFromProgID("WIA.ImageProcess"));
                ip.Filters.Add(ip.FilterInfos["Convert"].FilterID);
                ip.Filters[1].Properties["FormatID"].Value = WIA_JPEG;
                img = ip.Apply(img);
            }
            img.SaveFile(Path.Combine(dir, n.ToString("D4") + ".jpg"));
            if (kinh) break; // mặt kính chỉ có một tờ — Transfer tiếp là quét lại tờ đó
        }
        Ra("{\"soTrang\":" + n + ",\"hetGiay\":false}");
        return 0;
    }

    // ── canh hộp thoại của driver Canon ──────────────────────────────────────
    // Câu tiếng Anh đã gặp thật. Driver tiếng Việt in chữ VỠ FONT (bảng mã cũ):
    // "Thiết bị" thành "Thiê´t bi?" (đã gặp thật ở lỗi -4630) — nên so trên chữ đã
    // gỡ dấu và gỡ ký tự rác ´ ` ? ~ (xem KhongDau), mẫu cũng viết không dấu.
    static readonly Regex HET_GIAY = new Regex(
        "no page in the scanner|add page to the scanner|no paper|khong co (trang|giay|tai lieu|ban)|(them|dat|hay dat) (trang|giay|tai lieu)|het giay",
        RegexOptions.IgnoreCase);

    /// <summary>"Không có trang" và "Không co´ trang" (vỡ font) đều thành "khong co trang".</summary>
    static string KhongDau(string s)
    {
        var bo = s.Replace("´", "").Replace("`", "").Replace("~", "").Replace("?", "").Replace("'", "");
        var b = new StringBuilder();
        foreach (var c in bo.Normalize(NormalizationForm.FormD))
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark) b.Append(c);
        return Regex.Replace(b.ToString().Replace('đ', 'd').Replace('Đ', 'D'), "\\s+", " ").ToLowerInvariant();
    }
    static readonly Regex NUT = new Regex("^(OK|Cancel|Yes|No|Retry|Ignore|Abort)$");
    /// <summary>Mã lỗi driver Canon ở cuối hộp thoại "Scanner Error", ví dụ "(-4536)".</summary>
    static readonly Regex MA_LOI = new Regex(@"\(-\d{3,5}\)");

    /// <summary>
    /// Mỗi 0,5 giây xem NAPS2 (tiến trình đang nói chuyện với driver) có bật hộp
    /// thoại #32770 nào không:
    ///   "No page in the scanner"  → gửi IDCANCEL (nút vẽ tay, UI Automation không bấm được,
    ///                               nhưng WM_COMMAND IDCANCEL đóng được — đã kiểm thật)
    ///   lỗi khoá máy (-4630)      → IDCANCEL + báo khoa-may để app dọn wiawow64 rồi thử lại
    ///   hộp thoại khác            → KHÔNG bấm, chỉ báo nội dung lên app
    /// Tự thoát khi tiến trình cha (server Node) không còn, để không bao giờ bị bỏ lại.
    /// </summary>
    static int CanhHopThoai(int pidCha)
    {
        var daBao = new HashSet<int>();
        while (true)
        {
            if (pidCha > 0) { try { if (Process.GetProcessById(pidCha).HasExited) return 0; } catch { return 0; } }
            var conMo = new HashSet<int>();
            foreach (var p in Process.GetProcessesByName("NAPS2.Worker").Concat(Process.GetProcessesByName("NAPS2.Console")))
            {
                try
                {
                    if (p.MainWindowHandle == IntPtr.Zero) continue;
                    var dk = new PropertyCondition(AutomationElement.ProcessIdProperty, p.Id);
                    foreach (AutomationElement w in AutomationElement.RootElement.FindAll(TreeScope.Children, dk))
                    {
                        if (w.Current.ClassName != "#32770") continue;
                        int hwnd = w.Current.NativeWindowHandle;
                        var chu = string.Join(" ", w.FindAll(TreeScope.Descendants, Condition.TrueCondition)
                            .Cast<AutomationElement>().Select(e => e.Current.Name)
                            .Where(s => !string.IsNullOrEmpty(s) && !NUT.IsMatch(s)));
                        if (HET_GIAY.IsMatch(KhongDau(chu)))
                        {
                            SendMessage(new IntPtr(hwnd), 0x0111, new IntPtr(2), IntPtr.Zero);
                            Ra("da-dong");
                        }
                        else if (chu.Contains("(-4630)"))
                        {
                            SendMessage(new IntPtr(hwnd), 0x0111, new IntPtr(2), IntPtr.Zero);
                            Ra("khoa-may");
                        }
                        else if (MA_LOI.IsMatch(chu))
                        {
                            // "Scanner Error … (-4536)": hộp thoại báo lỗi có mã, chỉ có nút OK —
                            // chờ người bấm là vô ích và làm app đứng "đang quét" mãi (đã gặp:
                            // máy tắt/ngủ). Đóng luôn; app báo lỗi kèm nội dung.
                            SendMessage(new IntPtr(hwnd), 0x0111, new IntPtr(2), IntPtr.Zero);
                            Ra("loi-may\t" + w.Current.Name + ": " + chu);
                        }
                        else
                        {
                            conMo.Add(hwnd);
                            if (daBao.Add(hwnd)) Ra("hop-thoai\t" + w.Current.Name + ": " + chu);
                        }
                    }
                }
                catch { /* cửa sổ vừa đóng giữa chừng — vòng sau xem lại */ }
            }
            foreach (var h in daBao.Where(h => !conMo.Contains(h)).ToList()) { daBao.Remove(h); Ra("hop-thoai-dong"); }
            Thread.Sleep(500);
        }
    }

    /// <summary>
    /// Nút "Xong": bấm Cancel MỌI hộp thoại driver đang mở trong NAPS2 (thường là
    /// "add page to the scanner?" khi máy chờ thêm giấy) để lượt quét kết thúc êm
    /// và NAPS2 tự xuất các trang đã quét. In số hộp thoại đã đóng.
    /// </summary>
    static int DongHetHopThoai()
    {
        int n = 0;
        foreach (var p in Process.GetProcessesByName("NAPS2.Worker").Concat(Process.GetProcessesByName("NAPS2.Console")))
        {
            try
            {
                var dk = new PropertyCondition(AutomationElement.ProcessIdProperty, p.Id);
                foreach (AutomationElement w in AutomationElement.RootElement.FindAll(TreeScope.Children, dk))
                {
                    if (w.Current.ClassName != "#32770") continue;
                    SendMessage(new IntPtr(w.Current.NativeWindowHandle), 0x0111, new IntPtr(2), IntPtr.Zero);
                    n++;
                }
            }
            catch { }
        }
        Console.WriteLine(n);
        return 0;
    }

    // ── dọn wiawow64 treo ────────────────────────────────────────────────────
    /// <summary>
    /// Driver TWAIN 32-bit của DR-F120 mở máy qua WIA → Windows tạo wiawow64.exe
    /// cho mỗi lượt quét; nó sót lại và giữ khoá máy (lỗi -4630). tuLuc = 0: tắt hết
    /// của người dùng này; khác 0: chỉ những cái tạo từ lúc đó (trừ 2 giây).
    /// </summary>
    static int DonWia(long tuLucMs)
    {
        var tu = tuLucMs > 0
            ? DateTimeOffset.FromUnixTimeMilliseconds(tuLucMs - 2000).LocalDateTime
            : DateTime.MinValue;
        int n = 0;
        foreach (var p in Process.GetProcessesByName("wiawow64"))
        {
            try { if (p.StartTime >= tu) { p.Kill(); n++; } }
            catch { /* của người dùng khác / vừa tự tắt */ }
        }
        Console.WriteLine(n);
        return 0;
    }

    // ── máy Canon trên USB ───────────────────────────────────────────────────
    /// <summary>Thiết bị đang cắm có VID 1083 (Canon Electronics). Status khác "OK" = chưa có driver.</summary>
    static int UsbCanon()
    {
        var ds = new List<string>();
        using (var q = new ManagementObjectSearcher("SELECT Name, Status FROM Win32_PnPEntity WHERE PNPDeviceID LIKE 'USB\\\\VID_1083%'"))
            foreach (ManagementObject m in q.Get())
                ds.Add("{\"status\":" + Q((m["Status"] ?? "").ToString()) + ",\"ten\":" + Q((m["Name"] ?? "").ToString()) + "}");
        Ra("{\"thietBi\":[" + string.Join(",", ds) + "]}");
        return 0;
    }
}
