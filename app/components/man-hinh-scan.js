'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { chuanThuMuc2, CO_ANH, DongDaLuu, TheNhap } from './the-tai-lieu'
import XemAnh from './xem-anh'
import { moTaLoiMay } from '@/lib/loi-may'

async function goiApi(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new Error(j.loi || `Lỗi ${r.status}`)
    e.chiTiet = j
    throw e
  }
  return j
}

const ngu = (ms) => new Promise((r) => setTimeout(r, ms))

/** Chế độ liên tục: cảm biến báo trống quá lâu thế này thì vẫn quét thử (cảm biến có lúc sai). */
const CHO_TOI_DA = 30_000

const DRIVER = [
  ['twain', 'TWAIN (khuyên dùng cho DR-F120)'],
  ['wia', 'WIA (Windows)'],
  ['gia-lap', 'Giả lập — thử khi chưa cắm máy'],
]

export default function ManHinhScan() {
  const [ch, setCh] = useState(null)
  const [tt, setTt] = useState(null)
  const [may, setMay] = useState({ dang: true, thietBi: [] })
  const [taiLieu, setTaiLieu] = useState([])
  const [moi, setMoi] = useState(() => new Set())
  const [dangScan, setDangScan] = useState(false)
  const [lienTuc, setLienTuc] = useState(false)
  const [trangThai, setTrangThai] = useState('')
  const [thongBao, setThongBao] = useState(null)
  const [xem, setXem] = useState(null) // { id, k } — tra tài liệu mới nhất mỗi lần vẽ
  const [dangDung, setDangDung] = useState(false)
  const [dangScanVao, setDangScanVao] = useState(null)
  const [hopThoai, setHopThoai] = useState('')
  const daDungRef = useRef(false)
  const [doiTenTm, setDoiTenTm] = useState(null)
  // tên thư mục con đang gõ khi trong thư mục có nháp: nháp đi theo tên mới (đổi tên trên ổ đĩa)
  const [conGo, setConGo] = useState(null)
  const [loiCon, setLoiCon] = useState('')
  // "thư mục con của con" chung đã áp dụng lần cuối: nháp đang ở thư mục này là nháp
  // "theo ô trên" — sửa ô trên thì chúng đổi theo ngay (live); nháp đã chọn riêng thì giữ
  const [capCu, setCapCu] = useState(null)
  const [loiCap, setLoiCap] = useState('')
  const dangDoiConRef = useRef(false)
  const [cuonXuong, setCuonXuong] = useState(false)
  const [loiLuu, setLoiLuu] = useState({})
  // cỡ thumbnail: tiện riêng từng người xem → localStorage (lỗi thì dùng mặc định)
  const [coAnh, setCoAnhState] = useState(() => {
    try {
      return localStorage.getItem('scanfile-co-anh') || 'vua'
    } catch {
      return 'vua'
    }
  })
  const setCoAnh = (v) => {
    setCoAnhState(v)
    try {
      localStorage.setItem('scanfile-co-anh', v)
    } catch {
      /* trình duyệt chặn lưu — chỉ mất phần nhớ */
    }
  }
  const [dangLuu, setDangLuu] = useState(false)
  const dangLuuRef = useRef(false)

  const lienTucRef = useRef(false)
  const dangScanRef = useRef(false)
  // bấm "Quét ngay" lúc đang chờ cảm biến báo có giấy
  const quetNgayRef = useRef(false)
  const daXongRef = useRef(false)
  const [dangXong, setDangXong] = useState(false)
  const [dangChoGiay, setDangChoGiay] = useState(false)
  const daNapRef = useRef(false)
  const lamMoiRef = useRef(false)
  const [dangLamMoi, setDangLamMoi] = useState(false)

  // ── nạp cấu hình ────────────────────────────────────────────────────────
  useEffect(() => {
    goiApi('/api/cau-hinh')
      .then(setCh)
      .catch((e) => setThongBao({ loi: true, text: e.message }))
  }, [])

  // ── lưu cấu hình (trễ 400ms sau lần sửa cuối) ───────────────────────────
  useEffect(() => {
    if (!ch) return
    if (!daNapRef.current) {
      daNapRef.current = true
      return
    }
    const t = setTimeout(() => goiApi('/api/cau-hinh', { method: 'PUT', body: ch }).catch(() => {}), 400)
    return () => clearTimeout(t)
  }, [ch])

  const napTaiLieu = useCallback(async (thuMuc) => {
    if (!thuMuc) return setTaiLieu([])
    try {
      setTaiLieu((await goiApi(`/api/tai-lieu?thuMuc=${encodeURIComponent(thuMuc)}`)).taiLieu)
    } catch {
      setTaiLieu([])
    }
  }, [])

  const napThuMuc = useCallback(
    async (goc, con) => {
      try {
        const r = await goiApi(`/api/thu-muc?goc=${encodeURIComponent(goc)}&con=${encodeURIComponent(con)}`)
        setTt(r)
        await napTaiLieu(r.tonTai ? r.duongDan : '')
      } catch (e) {
        setTt({ loi: e.message })
        setTaiLieu([])
      }
    },
    [napTaiLieu],
  )

  // ── thư mục ra đổi → kiểm đã có chưa, nạp danh sách PDF ─────────────────
  const goc = ch?.thuMucGoc
  const con = ch?.thuMucCon
  useEffect(() => {
    if (goc === undefined) return
    const t = setTimeout(() => napThuMuc(goc, con), 300)
    return () => clearTimeout(t)
  }, [goc, con, napThuMuc])

  // ── danh sách máy scan theo driver ──────────────────────────────────────
  const driver = ch?.driver
  const napMay = useCallback(async (d) => {
    setMay((m) => ({ ...m, dang: true }))
    try {
      setMay({ dang: false, ...(await goiApi(`/api/may-scan?driver=${d}`)) })
    } catch (e) {
      setMay({ dang: false, thietBi: [], loi: e.message })
    }
  }, [])
  useEffect(() => {
    if (!driver) return
    const t = setTimeout(() => napMay(driver), 0)
    return () => clearTimeout(t)
  }, [driver, napMay])

  const sua = (k) => (e) => {
    const v = e.target.type === 'number' ? Number(e.target.value) : e.target.value
    setCh((c) => ({ ...c, [k]: v }))
  }

  // ── scan ────────────────────────────────────────────────────────────────
  async function scanMotLan(noiVao, lyDo) {
    if (dangDoiConRef.current) throw new Error('Đang đổi tên thư mục con — bấm quét lại sau giây lát.')
    // lưu ngay, không chờ debounce: server scan theo cấu hình đã lưu
    await goiApi('/api/cau-hinh', { method: 'PUT', body: ch })
    setTrangThai('Đang quét… (máy đang kéo giấy)')
    const r = await goiApi('/api/scan', { method: 'POST', body: { noiVao, lyDo } })
    if (r.daDung) {
      setThongBao({
        text:
          'Đã dừng scan. Lượt đang quét dở không giữ trang nào — đặt lại giấy rồi quét lại.\n' +
          'Lượt quét ngay sau khi dừng có thể chậm khoảng 1 phút vì máy cần khởi động lại.',
      })
      return r
    }
    if (r.soTrang && r.noiVao) {
      setMoi(new Set([r.noiVao.id]))
      await napThuMuc(ch.thuMucGoc, ch.thuMucCon)
      setThongBao({ text: `Đã scan tiếp ${r.soTrang} trang vào cuối "${r.noiVao.ten}".` })
    } else if (r.soTrang) {
      setMoi(new Set(r.moi.map((t) => t.id)))
      await napThuMuc(ch.thuMucGoc, ch.thuMucCon)
      const kieu = r.moi.length === 1 && r.soTrang > 1 ? 'gộp thành 1 file nháp' : `${r.moi.length} file nháp`
      setThongBao({ text: `Đã quét ${r.soTrang} trang → ${kieu}. Sửa xong bấm Lưu để ghi PDF.` })
    }
    return r
  }

  /**
   * true = có giấy, null = máy không báo được (cứ quét), false = trống.
   * Ở chế độ liên tục thì chờ tới khi có giấy; người dùng tắt liên tục giữa chừng → false.
   */
  async function choGiay() {
    // Cảm biến DR-F120 đôi khi báo "trống" dù đã đặt giấy (người dùng gặp thật) →
    // không tin tuyệt đối: có nút "Quét ngay", và chờ quá CHO_TOI_DA vẫn quét thử.
    const batDau = Date.now()
    quetNgayRef.current = false
    for (;;) {
      if (!lienTucRef.current) return 'dung'
      if (quetNgayRef.current) return 'ngay'
      let g = null
      try {
        g = (await goiApi('/api/giay')).coGiay
      } catch {
        return 'thu'
      }
      if (g === true) return 'co'
      if (g === null) return 'thu' // cảm biến không đọc được → cứ quét
      const con = Math.ceil((CHO_TOI_DA - (Date.now() - batDau)) / 1000)
      if (con <= 0) return 'thu'
      setDangChoGiay(true)
      setTrangThai(`Đang chờ đặt giấy… (cảm biến báo khay trống — tự quét thử sau ${con} giây)`)
      await ngu(800)
    }
  }

  /** noiVao = id file nháp → "scan tiếp": quét MỘT lượt, nối trang vào cuối file đó. */
  async function batDauScan(noiVao) {
    if (dangScanRef.current) return
    if (typeof noiVao !== 'string') noiVao = null
    daDungRef.current = false
    daXongRef.current = false
    lamMoiRef.current = false
    setDangScanVao(noiVao)
    dangScanRef.current = true
    setDangScan(true)
    setThongBao(null)
    // Cảm biến báo CÓ giấy mà quét ra 0 trang → cảm biến của máy này không đáng
    // tin (đã gặp ở máy khác: luôn báo có giấy, vòng liên tục quét mãi). Khi đó bỏ
    // cảm biến, chờ giữa các lần thử và ghi rõ là đang chờ giấy.
    let camBienSai = false
    try {
      do {
        // Quét một lần / scan tiếp: người dùng bấm là quét luôn, KHÔNG hỏi cảm biến —
        // cảm biến báo sai "trống" thì máy không chạy (đã gặp). Chỉ chế độ liên tục
        // mới chờ cảm biến, để khỏi quét thử liên miên khi khay trống.
        let giay = 'mot-lan'
        // mặt kính chỉ có một tờ: quét liên tục sẽ ra mãi cùng một tờ
        if (ch.nguon === 'glass') lienTucRef.current = false
        if (lienTucRef.current && !noiVao) {
          giay = camBienSai ? 'thu' : await choGiay()
          setDangChoGiay(false)
          if (giay === 'dung') break
        }
        const r = await scanMotLan(noiVao, giay)
        if (r.daDung || daDungRef.current || daXongRef.current) break
        if (!r.soTrang && lienTucRef.current && !noiVao) {
          if (giay === 'co' && !camBienSai) {
            camBienSai = true
            setThongBao({
              text: 'Máy này không báo đúng cảm biến khay giấy — khi khay trống, app sẽ thử quét lại mỗi 5 giây. Bấm ✓ Xong để thôi.',
            })
          }
          for (let s = 5; s > 0 && lienTucRef.current; s--) {
            setTrangThai(`Khay trống — chờ đặt giấy (thử lại sau ${s} giây)…`)
            await ngu(1000)
          }
          continue
        }
        if (!r.soTrang && (noiVao || !lienTucRef.current)) {
          setThongBao({
            loi: true,
            text:
              ch.nguon === 'duplex' || ch.nguon === 'feeder'
                ? 'Không quét được trang nào — khay nạp đang trống? Giấy đặt trên mặt kính thì chọn Nguồn giấy: "Mặt kính" hoặc "Tự động".'
                : 'Không quét được trang nào — khay giấy đang trống?',
          })
        }
      } while (lienTucRef.current && !noiVao)
    } catch (e) {
      setThongBao({ loi: true, text: e.message })
      lienTucRef.current = false
      setLienTuc(false)
    } finally {
      dangScanRef.current = false
      setDangScan(false)
      setDangScanVao(null)
      setDangChoGiay(false)
      setDangXong(false)
      setDangDung(false)
      setHopThoai('')
      setTrangThai('')
      // Làm mới giữa lúc quét: thay câu "Đã dừng scan…" bằng thông báo làm mới
      if (lamMoiRef.current) setThongBao({ text: 'Đã làm mới — sẵn sàng cho đợt scan khác.' })
    }
  }

  /** Dừng ngay: tắt liên tục + giết tiến trình quét ở server. */
  /**
   * Xong: tắt liên tục, kết thúc lượt đang quét nhưng GIỮ các trang đã quét
   * (server đóng hộp thoại "thêm giấy?" của driver; quá 15 giây thì ngắt và nhặt
   * trang từ recovery của NAPS2). Lượt đang chạy trả kết quả về như thường.
   */
  async function xongScan() {
    daXongRef.current = true
    batTatLienTuc(false)
    quetNgayRef.current = false
    setDangXong(true)
    setTrangThai('Đang kết thúc — giữ các trang đã quét…')
    try {
      await goiApi('/api/scan', { method: 'PUT' })
    } catch {
      /* đang chờ giấy, không có lượt nào chạy — vòng lặp tự thoát */
    }
  }

  async function dungScan() {
    daDungRef.current = true
    batTatLienTuc(false)
    setDangDung(true)
    setTrangThai('Đang dừng…')
    try {
      await goiApi('/api/scan', { method: 'DELETE' })
    } catch {
      /* server không có lượt nào đang chạy (đang chờ giấy) — vòng lặp tự thoát */
    }
  }

  // Trong lúc quét: hỏi server mỗi giây xem driver có đang hiện hộp thoại lỗi không
  useEffect(() => {
    if (!dangScan) return
    const t = setInterval(() => {
      goiApi('/api/scan')
        .then((r) => setHopThoai(r.hopThoai || ''))
        .catch(() => {})
    }, 1000)
    return () => clearInterval(t)
  }, [dangScan])

  /**
   * Làm mới: xong mọi việc rồi thì về trạng thái ban đầu để làm đợt khác —
   * huỷ lượt quét còn treo, thư mục con về mặc định, xoá thông báo / đánh dấu.
   */
  async function lamMoi() {
    if (dangLamMoi) return
    const canhBao = []
    if (dangScan) canhBao.push('Đang có lượt quét — sẽ bị HUỶ, không giữ trang nào của lượt đó.')
    const soNhap = taiLieu.filter((t) => t.trangThai === 'nhap').length
    if (soNhap) canhBao.push(`Còn ${soNhap} file nháp chưa lưu — vẫn nằm trong thư mục "${con}", chọn lại thư mục đó là thấy.`)
    if (canhBao.length && !confirm(`${canhBao.join('\n')}\n\nVẫn làm mới?`)) return
    setDangLamMoi(true)
    lamMoiRef.current = true
    daDungRef.current = true
    batTatLienTuc(false)
    try {
      const r = await goiApi('/api/lam-moi', { method: 'POST' })
      daNapRef.current = false // cấu hình vừa lưu ở server — không PUT lại
      setCh(r.ch)
      setMoi(new Set())
      setLoiLuu({})
      setXem(null)
      setDoiTenTm(null)
      setHopThoai('')
      setTrangThai('')
      setThongBao({ text: 'Đã làm mới — sẵn sàng cho đợt scan khác.' })
    } catch (e) {
      setThongBao({ loi: true, text: e.message })
    } finally {
      setDangLamMoi(false)
    }
  }

  /**
   * Thư mục con đang có nháp mà gõ tên khác → ĐỔI TÊN thư mục trên ổ đĩa để nháp
   * đi theo (chưa có nháp thì gõ tên = chuyển sang thư mục khác như cũ).
   * Tên trùng một thư mục đã có → chuyển sang thư mục đó, nháp ở lại thư mục cũ.
   */
  async function apDungCon(go) {
    const tenMoi = go.trim()
    // gõ tiếp trong lúc đang đổi thì giữ chữ đang gõ
    const xong = () => setConGo((g) => (g === go ? null : g))
    if (tenMoi === con) {
      setLoiCon('')
      return xong()
    }
    if (!tenMoi) return setLoiCon('Tên thư mục con không được để trống.')
    if (dangDoiConRef.current) return
    const daCo = (tt?.thuMucCon ?? []).find((t) => t.toLowerCase() === tenMoi.toLowerCase())
    if (daCo && daCo.toLowerCase() !== con.toLowerCase()) {
      setLoiCon('')
      setCh((c) => ({ ...c, thuMucCon: daCo }))
      setThongBao({ text: `Đã có thư mục "${daCo}" — chuyển sang thư mục đó. File nháp vẫn nằm trong "${con}".` })
      return xong()
    }
    dangDoiConRef.current = true
    try {
      await goiApi('/api/thu-muc', { method: 'POST', body: { goc, con, hanhDong: 'doi-ten', tenMoi } })
      setLoiCon('')
      setCh((c) => ({ ...c, thuMucCon: tenMoi }))
      xong()
      await napThuMuc(goc, tenMoi)
    } catch (e) {
      setLoiCon(e.message)
    } finally {
      dangDoiConRef.current = false
    }
  }

  function batTatLienTuc(b) {
    lienTucRef.current = b
    setLienTuc(b)
  }

  // ── thao tác thư mục ────────────────────────────────────────────────────
  async function moThuMuc() {
    try {
      await goiApi('/api/thu-muc', { method: 'POST', body: { goc, con, hanhDong: 'mo' } })
      await napThuMuc(goc, con)
    } catch (e) {
      setThongBao({ loi: true, text: e.message })
    }
  }

  async function luuDoiTenThuMuc() {
    const tenMoi = doiTenTm?.trim()
    if (!tenMoi || tenMoi === con) return setDoiTenTm(null)
    try {
      await goiApi('/api/thu-muc', { method: 'POST', body: { goc, con, hanhDong: 'doi-ten', tenMoi } })
      setDoiTenTm(null)
      setCh((c) => ({ ...c, thuMucCon: tenMoi }))
      setThongBao({ text: `Đã đổi tên thư mục thành "${tenMoi}".` })
    } catch (e) {
      setThongBao({ loi: true, text: e.message })
    }
  }

  // ── thao tác trên nháp (chỉ sửa danh sách) và Lưu (ghi PDF) ────────────
  /** Trả về chuỗi lỗi hoặc null. imLoi: để thẻ tự hiện lỗi dưới ô thay vì báo chung. */
  async function thaoTac(body, { imLoi = false } = {}) {
    try {
      const r = await goiApi('/api/tai-lieu', { method: 'POST', body: { thuMuc: tt.duongDan, ...body } })
      setTaiLieu(r.taiLieu)
      if (body.id) setLoiLuu(({ [body.id]: _, ...con }) => con)
      if (body.hanhDong === 'sua-lai') setThongBao({ text: 'Đã đưa về nháp — sửa xong bấm Lưu.' })
      return null
    } catch (e) {
      if (!imLoi) setThongBao({ loi: true, text: e.message })
      return e.message
    }
  }

  async function luu() {
    if (dangLuuRef.current) return
    dangLuuRef.current = true
    setDangLuu(true)
    try {
      const r = await goiApi('/api/tai-lieu', { method: 'POST', body: { thuMuc: tt.duongDan, hanhDong: 'luu' } })
      setTaiLieu(r.taiLieu)
      setLoiLuu({})
      setMoi(new Set())
      setThongBao({ text: `Đã lưu ${r.soDaLuu} file PDF.` })
      await napThuMuc(goc, con)
    } catch (e) {
      setThongBao({ loi: true, text: e.message })
      setLoiLuu(e.chiTiet?.loiTheoId ?? {})
    } finally {
      dangLuuRef.current = false
      setDangLuu(false)
    }
  }
  const luuRef = useRef(luu)
  useEffect(() => {
    luuRef.current = luu
  })

  // gõ tên thư mục con khi có nháp: ngừng gõ chốc lát thì đổi tên thư mục trên ổ đĩa.
  // Đang quét thì chờ quét xong — đổi tên giữa chừng là ảnh ghi vào thư mục không còn.
  const apDungConRef = useRef(null)
  useEffect(() => {
    apDungConRef.current = apDungCon
  })
  useEffect(() => {
    if (conGo === null || dangScan) return
    const t = setTimeout(() => apDungConRef.current(conGo), 800)
    return () => clearTimeout(t)
  }, [conGo, dangScan, con])

  // nút mũi tên lên đầu trang: hiện khi đã cuộn xuống
  useEffect(() => {
    const xem = () => setCuonXuong(window.scrollY > 400)
    xem()
    window.addEventListener('scroll', xem, { passive: true })
    return () => window.removeEventListener('scroll', xem)
  }, [])
  // Ctrl+S = Lưu
  useEffect(() => {
    const phim = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        document.activeElement?.blur?.()
        // chờ ô đang gõ lưu tên xong rồi mới Lưu
        setTimeout(() => luuRef.current(), 150)
      }
    }
    window.addEventListener('keydown', phim)
    return () => window.removeEventListener('keydown', phim)
  }, [])

  const dongXem = useCallback(() => setXem(null), [])
  const xoayTrongXem = useCallback((anh, goc) => thaoTacRef.current({ hanhDong: 'xoay', anh, goc }), [])
  const thaoTacRef = useRef(null)
  useEffect(() => {
    thaoTacRef.current = thaoTac
  })

  if (ch && capCu === null) setCapCu(chuanThuMuc2(ch.thuMucCap3))
  const capGo = chuanThuMuc2(ch?.thuMucCap3)
  const coThuMuc = !!tt?.tonTai
  // ngừng gõ ô trên chốc lát → ghi vào nháp (giao diện đã đổi theo từ lúc gõ)
  useEffect(() => {
    if (capCu === null || capGo === capCu) return
    const t = setTimeout(async () => {
      const l = coThuMuc ? await thaoTacRef.current({ hanhDong: 'doi-thu-muc-chung', tu: capCu, den: capGo }, { imLoi: true }) : null
      setLoiCap(l ?? '')
      if (!l) setCapCu(capGo)
    }, 600)
    return () => clearTimeout(t)
  }, [capGo, capCu, coThuMuc])

  if (!ch) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        {thongBao?.text ?? 'Đang tải…'}
      </div>
    )
  }

  // Nháp theo thứ tự quét (cũ ở trên, mới ở dưới) để "đưa trang lên file trên /
  // xuống file dưới" đúng nghĩa. Đã lưu thì mới nhất lên đầu.
  const nhap = taiLieu.filter((t) => t.trangThai === 'nhap')
  const daLuu = taiLieu.filter((t) => t.trangThai !== 'nhap').reverse()
  const trangNhap = nhap.reduce((s, t) => s + t.anh.length, 0)
  const trung = timTrung(taiLieu)
  const tlXem = xem && taiLieu.find((t) => t.id === xem.id)
  const goiYThuMuc = [...new Set([...(tt?.thuMuc2 ?? []), ...taiLieu.map((t) => t.thuMuc2).filter(Boolean)])].sort()
  const o ='rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-sky-500'

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-28 pt-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          scanFile <span className="ml-2 text-sm font-normal text-neutral-500">Canon imageFORMULA DR-F120</span>
        </h1>
        <div className="flex items-center gap-3">
          {may.naps2 === null && ch.driver !== 'gia-lap' && (
            <span className="text-xs text-amber-400">Chưa có NAPS2 — xem HUONG-DAN.md</span>
          )}
          <button
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
            onClick={lamMoi}
            disabled={dangLamMoi || dangLuu}
            title="Xong việc: huỷ lượt quét còn treo, thư mục con về mặc định, xoá thông báo — để làm đợt scan khác"
          >
            {dangLamMoi ? 'Đang làm mới…' : '⟲ Làm mới'}
          </button>
        </div>
      </header>

      {/* ── nơi lưu ───────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Thư mục kết quả scan
          </span>
          <div className="flex gap-2">
            <input className={`${o} flex-1 font-mono`} value={ch.thuMucGoc} onChange={sua('thuMucGoc')} spellCheck={false} />
          </div>
        </label>

        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Thư mục con (bên trong thư mục trên)
          </span>
          {doiTenTm === null ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${o} min-w-64 flex-1 font-mono`}
                value={conGo ?? ch.thuMucCon}
                onChange={(e) => {
                  if (conGo === null && !taiLieu.some((t) => t.trangThai === 'nhap')) return sua('thuMucCon')(e)
                  setConGo(e.target.value)
                }}
                onBlur={() => conGo !== null && !dangScan && apDungCon(conGo)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') {
                    setConGo(null)
                    setLoiCon('')
                  }
                }}
                title="Đang có file nháp: gõ tên mới là đổi tên thư mục, nháp đi theo"
                list="ds-thu-muc-con"
                spellCheck={false}
              />
              <datalist id="ds-thu-muc-con">
                {(tt?.thuMucCon ?? []).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              {tt?.tonTai && (
                <button
                  className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800"
                  onClick={() => setDoiTenTm(ch.thuMucCon)}
                  disabled={dangScan}
                  title="Đổi tên thư mục này trên ổ đĩa"
                >
                  Đổi tên thư mục
                </button>
              )}
              <button className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800" onClick={moThuMuc}>
                Mở thư mục
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                className={`${o} min-w-64 flex-1 border-sky-600 font-mono`}
                value={doiTenTm}
                onChange={(e) => setDoiTenTm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') luuDoiTenThuMuc()
                  if (e.key === 'Escape') setDoiTenTm(null)
                }}
              />
              <button className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500" onClick={luuDoiTenThuMuc}>
                Lưu tên mới
              </button>
              <button className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800" onClick={() => setDoiTenTm(null)}>
                Huỷ
              </button>
            </div>
          )}
          <p className="mt-2 text-xs">
            {loiCon ? (
              <span className="text-red-400">{loiCon}</span>
            ) : conGo !== null && conGo.trim() !== con ? (
              <span className="text-sky-300">
                {dangScan ? 'Quét xong sẽ đổi tên thư mục' : 'Sắp đổi tên thư mục'} &quot;{con}&quot; → &quot;{conGo.trim()}&quot; — file nháp đi theo
              </span>
            ) : tt?.loi ? (
              <span className="text-red-400">{tt.loi}</span>
            ) : tt ? (
              <>
                <span className="font-mono text-neutral-300">{tt.duongDan}</span>
                {tt.tonTai ? (
                  <span className="ml-2 rounded bg-emerald-950 px-1.5 py-0.5 text-emerald-300">
                    đã có · dùng tiếp ({tt.soDaLuu} PDF{tt.soNhap ? `, ${tt.soNhap} nháp` : ''})
                  </span>
                ) : (
                  <span className="ml-2 rounded bg-sky-950 px-1.5 py-0.5 text-sky-300">chưa có · tự tạo khi scan</span>
                )}
              </>
            ) : null}
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
            Thư mục con của con{' '}
            <span className="normal-case text-neutral-500">
              — gõ là các file nháp ở dưới đổi theo ngay, file quét sau cũng vào đây; muốn khác thì chọn riêng từng file ở dưới
            </span>
          </span>
          <input
            className={`${o} w-full font-mono`}
            value={ch.thuMucCap3 ?? ''}
            onChange={sua('thuMucCap3')}
            list="ds-thu-muc-2"
            placeholder="để trống = lưu ngay trong thư mục con; nhiều cấp thì ngăn bằng \  ví dụ  Ho so A\Nguyen Van A"
            spellCheck={false}
          />
          {loiCap && <span className="mt-1 block text-xs text-red-400">{loiCap}</span>}
          {/* gợi ý dùng chung cho ô này và ô thư mục con của con trong từng file nháp */}
          <datalist id="ds-thu-muc-2">
            {goiYThuMuc.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </section>

      {/* ── máy scan ──────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Truong nhan="Kết nối">
            <select className={o} value={ch.driver} onChange={sua('driver')} disabled={dangScan}>
              {DRIVER.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </Truong>
          <Truong nhan="Máy scan">
            <div className="flex gap-2">
              <select className={`${o} min-w-0 flex-1`} value={ch.thietBi} onChange={sua('thietBi')} disabled={dangScan}>
                <option value="">{may.dang ? 'Đang tìm máy…' : '(máy mặc định / máy đầu tiên)'}</option>
                {may.thietBi.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.ten}
                  </option>
                ))}
              </select>
              <button
                className="rounded-md border border-neutral-700 px-2 text-sm hover:bg-neutral-800"
                onClick={() => napMay(ch.driver)}
                title="Tìm lại máy scan"
              >
                ↻
              </button>
            </div>
            {may.loi && <span className="mt-1 block text-xs text-red-400">{may.loi}</span>}
            {!may.dang && may.goiY && <span className="mt-1 block text-xs text-amber-400">{may.goiY}</span>}
          </Truong>
          <Truong nhan="Nguồn giấy">
            <select className={o} value={ch.nguon} onChange={sua('nguon')} disabled={dangScan}>
              <option value="tu-dong">Tự động (khay nạp 2 mặt, khay trống → mặt kính)</option>
              <option value="duplex">Khay nạp — 2 mặt</option>
              <option value="feeder">Khay nạp — 1 mặt</option>
              <option value="glass">Mặt kính (đặt giấy dưới nắp)</option>
            </select>
          </Truong>
          <Truong nhan="Độ phân giải">
            <select className={o} value={ch.dpi} onChange={sua('dpi')} disabled={dangScan}>
              {[150, 200, 300, 400, 600].map((d) => (
                <option key={d} value={d}>
                  {d} dpi
                </option>
              ))}
            </select>
          </Truong>
          <Truong nhan="Màu">
            <select className={o} value={ch.mau} onChange={sua('mau')} disabled={dangScan}>
              <option value="color">Màu</option>
              <option value="gray">Xám</option>
              <option value="bw">Đen trắng</option>
            </select>
          </Truong>
          <Truong nhan="Gộp PDF">
            <div className="flex items-center gap-2">
              <select className={`${o} min-w-0 flex-1`} value={ch.cachGop} onChange={sua('cachGop')} disabled={dangScan}>
                <option value="quy-tac">Đủ N trang → gộp 1 PDF</option>
                <option value="gop-ca-lo">Mỗi lần scan → 1 PDF</option>
                <option value="tach">Luôn mỗi ảnh 1 PDF</option>
              </select>
              {ch.cachGop === 'quy-tac' && (
                <input
                  type="number"
                  min={2}
                  max={50}
                  className={`${o} w-16 shrink-0 text-center`}
                  value={ch.soTrangGop}
                  onChange={sua('soTrangGop')}
                  disabled={dangScan}
                  title="N"
                />
              )}
            </div>
          </Truong>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {!dangScan ? (
            <button
              className="rounded-lg bg-sky-600 px-6 py-3 text-base font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-50"
              onClick={batDauScan}
              disabled={!!tt?.loi}
            >
              ▶ Bắt đầu scan
            </button>
          ) : (
            <>
              <button
                className="rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-60"
                onClick={xongScan}
                disabled={dangDung || dangXong}
                title="Hết giấy / không quét nữa: kết thúc ngay và GIỮ các trang đã quét"
              >
                {dangXong ? 'Đang kết thúc…' : '✓ Xong'}
              </button>
              <button
                className="rounded-lg border border-red-700/70 px-4 py-3 text-sm font-medium text-red-300 hover:bg-red-950/60 disabled:opacity-60"
                onClick={dungScan}
                disabled={dangDung || dangXong}
                title="Huỷ ngay, KHÔNG giữ trang nào của lượt đang quét"
              >
                {dangDung ? 'Đang huỷ…' : '✕ Huỷ lượt này'}
              </button>
              {dangChoGiay && (
                <button
                  className="rounded-lg bg-sky-600 px-5 py-3 text-base font-semibold text-white shadow hover:bg-sky-500"
                  onClick={() => (quetNgayRef.current = true)}
                  title="Cảm biến khay giấy có lúc báo sai — đã đặt giấy thì bấm để quét luôn"
                >
                  ▶ Quét ngay
                </button>
              )}
            </>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lienTuc && ch.nguon !== 'glass'}
              disabled={ch.nguon === 'glass'}
              onChange={(e) => batTatLienTuc(e.target.checked)}
              className="size-4 accent-sky-500"
            />
            Scan liên tục — đặt giấy là tự quét tiếp
            {ch.nguon === 'glass' && <span className="text-xs text-neutral-500">(chỉ dùng với khay nạp)</span>}
          </label>
          {trangThai && (
            <span className="flex items-center gap-2 text-sm text-sky-300">
              <span className="size-2 animate-pulse rounded-full bg-sky-400" />
              {trangThai}
            </span>
          )}
        </div>

        {dangScan && hopThoai && (
          <div className="mt-3 rounded-md border border-amber-600/60 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
            <b>⚠ Máy scan báo:</b> {moTaLoiMay(hopThoai)}
            <div className="mt-1 text-xs text-amber-300/80">
              Kiểm máy (kẹt giấy, giấy chồng…), rồi bấm nút trong hộp thoại của Canon trên màn hình — hoặc bấm{' '}
              <b>✓ Xong</b> để kết thúc và giữ các trang đã quét.
            </div>
          </div>
        )}

        {thongBao && (
          <p
            className={`mt-3 whitespace-pre-wrap rounded-md px-3 py-2 text-sm ${
              thongBao.loi ? 'bg-red-950/60 text-red-300' : 'bg-emerald-950/60 text-emerald-300'
            }`}
          >
            {thongBao.text}
          </p>
        )}
      </section>

      {/* ── nháp: sửa thoải mái, chưa ghi file nào ─────────────────────── */}
      <section>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-neutral-300">
            {nhap.length ? `Nháp — ${nhap.length} file · ${trangNhap} trang, chưa lưu` : 'Không có file nháp nào.'}
          </h2>
          {nhap.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-neutral-400">
              Cỡ ảnh
              {Object.keys(CO_ANH).map((c) => (
                <button
                  key={c}
                  onClick={() => setCoAnh(c)}
                  className={`rounded px-2 py-1 ${coAnh === c ? 'bg-sky-700 text-white' : 'hover:bg-neutral-800'}`}
                >
                  {{ nho: 'Nhỏ', vua: 'Vừa', lon: 'Lớn' }[c]}
                </button>
              ))}
            </div>
          )}
        </div>
        {nhap.length > 0 && (
          <p className="mb-3 text-xs text-neutral-500">
            Rê chuột vào trang để chuyển: ▲ lên file trên · ◀ ▶ đổi chỗ · ▼ xuống file dưới · ✂ tách ra file mới — hoặc kéo-thả
            trang sang file khác. Chưa có gì được ghi ra ổ đĩa cho tới khi bấm <b className="text-neutral-300">Lưu thành PDF</b>.
          </p>
        )}
        <div className="space-y-3">
          {nhap.map((tl, i) => (
            <TheNhap
              key={tl.id}
              tl={tl}
              thuMuc={tt.duongDan}
              tenCon={conGo?.trim() || ch.thuMucCon}
              idTren={nhap[i - 1]?.id}
              idDuoi={nhap[i + 1]?.id}
              laMoi={moi.has(tl.id)}
              tuDongChon={tl.id === nhap.find((t) => moi.has(t.id))?.id}
              loi={loiLuu[tl.id] || trung[tl.id]}
              goiYThuMuc={goiYThuMuc}
              tm2TheoTren={capCu !== null && chuanThuMuc2(tl.thuMuc2) === capCu ? capGo : null}
              tm2Tren={capGo}
              coAnh={coAnh}
              onThaoTac={thaoTac}
              onXemAnh={(k) => setXem({ id: tl.id, k })}
              dangScan={dangScan}
              dangScanVao={dangScanVao === tl.id}
              onScanTiep={batDauScan}
            />
          ))}
        </div>
      </section>

      {/* ── đã lưu ────────────────────────────────────────────────────── */}
      {daLuu.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-neutral-400">Đã lưu — {daLuu.length} file PDF (mới nhất ở trên)</h2>
          <div className="space-y-1.5">
            {daLuu.map((tl) => (
              <DongDaLuu key={tl.id} tl={tl} thuMuc={tt.duongDan} tenCon={conGo?.trim() || ch.thuMucCon} onThaoTac={thaoTac} />
            ))}
          </div>
        </section>
      )}

      {/* ── thanh Lưu ─────────────────────────────────────────────────── */}
      {nhap.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-neutral-300">
              {nhap.length} file nháp · {trangNhap} trang chưa lưu
              {Object.keys(trung).length > 0 && <span className="ml-2 text-red-400">· có tên trùng</span>}
            </span>
            <button
              className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
              onClick={() => {
                document.activeElement?.blur?.()
                setTimeout(luu, 150)
              }}
              disabled={dangLuu}
              title="Ctrl+S"
            >
              {dangLuu ? 'Đang lưu…' : `💾 Lưu thành PDF (${nhap.length})`}
            </button>
          </div>
        </div>
      )}

      {cuonXuong && (
        <button
          className={`fixed right-4 z-40 flex size-11 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/90 text-xl text-neutral-200 shadow-lg backdrop-blur hover:bg-neutral-800 ${
            nhap.length > 0 ? 'bottom-20' : 'bottom-6'
          }`}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Lên đầu trang"
          aria-label="Lên đầu trang"
        >
          ↑
        </button>
      )}

      {tlXem && (
        <XemAnh
          thuMuc={tt.duongDan}
          tl={tlXem}
          batDau={xem.k}
          onDong={dongXem}
          onXoay={tlXem.trangThai === 'nhap' ? xoayTrongXem : undefined}
        />
      )}
    </div>
  )
}

/**
 * Báo trùng ngay khi gõ (server vẫn kiểm lại lúc Lưu): hai file cùng đường dẫn
 * đích, không phân biệt hoa thường như Windows.
 */
function timTrung(ds) {
  const theoKhoa = new Map()
  for (const t of ds) {
    const rel = t.trangThai === 'nhap' ? (t.thuMuc2 ? `${t.thuMuc2}\\${t.ten}.pdf` : `${t.ten}.pdf`) : t.fileDaLuu
    const k = rel.replace(/\//g, '\\').toLowerCase()
    theoKhoa.set(k, [...(theoKhoa.get(k) ?? []), t])
  }
  const ra = {}
  for (const nhom of theoKhoa.values()) {
    if (nhom.length < 2) continue
    for (const t of nhom) if (t.trangThai === 'nhap') ra[t.id] = `Trùng tên với "${nhom.find((x) => x !== t).ten}.pdf" trong cùng thư mục.`
  }
  return ra
}

function Truong({ nhan, children }) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">{nhan}</span>
      {children}
    </label>
  )
}
