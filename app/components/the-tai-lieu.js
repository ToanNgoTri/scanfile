'use client'

import { useEffect, useRef, useState } from 'react'
import AnhXoay from './anh-xoay'

export function urlAnh(thuMuc, a) {
  return `/api/tep?thuMuc=${encodeURIComponent(thuMuc)}&anh=${encodeURIComponent(a)}`
}

export function urlPdf(thuMuc, tl) {
  // v= đổi theo nội dung để trình duyệt không hiện bản xem thử cũ
  const v = encodeURIComponent(`${tl.anh.map((a) => a + (tl.xoay?.[a] ?? '')).join('|')}#${tl.luuLuc ?? ''}`).slice(-60)
  return `/api/tep?thuMuc=${encodeURIComponent(thuMuc)}&id=${encodeURIComponent(tl.id)}&v=${v}`
}

const LOAI_KEO = 'application/x-scanfile-trang'

/** Giống chuanThuMuc2 ở server: bỏ khoảng trắng hai đầu từng cấp, gộp dấu \ / thừa. */
export const chuanThuMuc2 = (s) =>
  String(s ?? '')
    .split(/[\\/]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join('\\')

/**
 * Ô nhập báo lên khi Enter hoặc rời ô; Esc trả lại giá trị lúc bắt đầu gõ.
 * onGo: báo từng chữ đang gõ (để chỗ khác hiện "live"). chuan: hai giá trị
 * chuẩn hoá ra giống nhau thì coi như không đổi.
 * Giá trị đổi từ ngoài (danh sách nạp lại, tự lưu) thì cập nhật theo — trừ lúc
 * đang gõ, kẻo bản đã chuẩn hoá giật mất chữ (vd dấu \ vừa gõ ở cuối).
 */
function ONhap({ giaTri, onLuu, oRef, onGo, chuan = (x) => x, ...props }) {
  const [v, setV] = useState(giaTri)
  const [goc, setGoc] = useState(giaTri)
  const [dangGo, setDangGo] = useState(false)
  const banDau = useRef(giaTri)
  if (goc !== giaTri && !dangGo) {
    setGoc(giaTri)
    setV(giaTri)
  }
  const ref = useRef(null)
  const r = oRef ?? ref
  const doi = (x) => {
    setV(x)
    onGo?.(x)
  }
  return (
    <input
      ref={r}
      value={v}
      onFocus={() => {
        banDau.current = giaTri
        setDangGo(true)
      }}
      onChange={(e) => doi(e.target.value)}
      onBlur={() => {
        setDangGo(false)
        setGoc(giaTri)
        if (chuan(v) !== chuan(giaTri)) onLuu(v)
        else {
          // không đổi gì → thôi "đang gõ", để chỗ khác lại theo giá trị thật
          setV(giaTri)
          onGo?.(null)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          doi(banDau.current)
          setTimeout(() => r.current?.blur(), 0)
        }
      }}
      spellCheck={false}
      {...props}
    />
  )
}

/**
 * Một tài liệu NHÁP: dải trang (di chuyển được) + tên + thư mục con của con.
 * Mọi sửa đổi ở đây chỉ sửa bản nháp; PDF chỉ được ghi khi bấm Lưu.
 */
/** Chiều cao thumbnail (px) theo nút Cỡ ảnh. */
export const CO_ANH = { nho: 144, vua: 224, lon: 320 }

export function TheNhap({
  tl, thuMuc, tenCon, coAnh = 'nho', idTren, idDuoi, laMoi, tuDongChon, loi, goiYThuMuc, tm2TheoTren, tm2Tren,
  dangScan, dangScanVao, onThaoTac, onXemAnh, onScanTiep,
}) {
  const oTen = useRef(null)
  const [loiO, setLoiO] = useState('')
  const [keoVao, setKeoVao] = useState(null) // vị trí sẽ chèn khi thả: 0..n

  // thư mục con của con đang gõ dở: đường dẫn + nút chọn nhanh đổi theo từng chữ,
  // và tự lưu vào nháp sau khi ngừng gõ chốc lát (không cần Enter / rời ô)
  const [tm2Go, setTm2Go] = useState(null)
  const [tm2Cu, setTm2Cu] = useState(tl.thuMuc2)
  if (tm2Cu !== tl.thuMuc2) {
    setTm2Cu(tl.thuMuc2)
    setTm2Go(null)
  }
  // nháp đang theo ô "thư mục con của con" ở trên: hiện ngay giá trị đang gõ ở trên
  const tm2Goc = tm2TheoTren ?? tl.thuMuc2 ?? ''
  const tm2 = tm2Go === null ? tm2Goc : chuanThuMuc2(tm2Go)
  const luuORef = useRef(null)
  useEffect(() => {
    luuORef.current = luuO
  })
  useEffect(() => {
    if (tm2Go === null || chuanThuMuc2(tm2Go) === (tl.thuMuc2 ?? '')) return
    const t = setTimeout(() => luuORef.current({ hanhDong: 'doi-thu-muc', id: tl.id, thuMuc2: tm2Go }), 500)
    return () => clearTimeout(t)
  }, [tm2Go, tl.id, tl.thuMuc2])

  // file vừa quét xong: chọn sẵn ô tên để gõ luôn, trừ khi đang gõ ở ô khác
  useEffect(() => {
    if (!tuDongChon) return
    const dang = document.activeElement
    if (dang && dang !== document.body && dang.tagName === 'INPUT') return
    oTen.current?.focus()
    oTen.current?.select()
    oTen.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [tuDongChon])

  const chuyen = (anh, denId, viTri) => onThaoTac({ hanhDong: 'chuyen-trang', anh, denId, viTri })
  const xoay = (anh, goc) => onThaoTac({ hanhDong: 'xoay', anh, goc })

  // lỗi (tên có ký tự cấm…) → giữ chữ vừa gõ, tô đỏ để sửa tiếp
  async function luuO(body) {
    const l = await onThaoTac(body, { imLoi: true })
    setLoiO(l ?? '')
  }

  function tha(e, viTri) {
    e.preventDefault()
    e.stopPropagation()
    setKeoVao(null)
    const anh = e.dataTransfer.getData(LOAI_KEO)
    if (!anh) return
    const cu = tl.anh.indexOf(anh)
    // server bỏ trang ra trước rồi mới chèn → cùng file mà kéo về sau thì lùi 1
    const vt = cu >= 0 && cu < viTri ? viTri - 1 : viTri
    if (cu >= 0 && vt === cu) return
    chuyen(anh, tl.id, vt)
  }

  const n = tl.anh.length
  const nutTrang =
    'flex size-6 items-center justify-center rounded bg-black/75 text-[11px] text-white hover:bg-sky-600 disabled:pointer-events-none disabled:opacity-25'
  const nut = 'rounded-md px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40'
  const vach = (k) => keoVao === k && <span className="w-1 shrink-0 self-stretch rounded bg-sky-400" />
  const thongBao = loiO || loi

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        thongBao ? 'border-red-600/70 bg-red-950/10' : laMoi ? 'border-sky-600/70 bg-sky-950/20' : 'border-neutral-800 bg-neutral-900/40'
      }`}
    >
      {/* ── dải trang ─────────────────────────────────────────────────── */}
      <div
        className="flex min-h-40 gap-2 overflow-x-auto pb-2"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(LOAI_KEO)) return
          e.preventDefault()
          if (e.target === e.currentTarget) setKeoVao(n)
        }}
        onDragLeave={(e) => e.currentTarget.contains(e.relatedTarget) || setKeoVao(null)}
        onDrop={(e) => tha(e, n)}
      >
        {tl.anh.map((a, k) => (
          <div key={a} className="flex shrink-0 gap-2">
            {vach(k)}
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(LOAI_KEO, a)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(LOAI_KEO)) return
                e.preventDefault()
                e.stopPropagation()
                const r = e.currentTarget.getBoundingClientRect()
                setKeoVao(e.clientX < r.left + r.width / 2 ? k : k + 1)
              }}
              onDrop={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                tha(e, e.clientX < r.left + r.width / 2 ? k : k + 1)
              }}
              className="group relative cursor-grab overflow-hidden rounded border border-neutral-700 bg-white hover:border-sky-500 active:cursor-grabbing"
              title="Kéo để đổi chỗ / thả sang file khác"
            >
              <button onClick={() => onXemAnh(k)} className="block" title={`Trang ${k + 1} — bấm để xem to`}>
                <AnhXoay src={urlAnh(thuMuc, a)} xoay={tl.xoay?.[a] ?? 0} cao={CO_ANH[coAnh] ?? CO_ANH.nho} alt={`Trang ${k + 1}`} />
              </button>
              <span className="absolute left-0 top-0 rounded-br bg-black/70 px-1.5 text-[10px] text-white">{k + 1}</span>
              <div className="absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button className={nutTrang} onClick={() => xoay([a], -90)} title="Xoay trái 90°">
                  ⟲
                </button>
                <button className={nutTrang} onClick={() => xoay([a], 90)} title="Xoay phải 90°">
                  ⟳
                </button>
              </div>

              {/* nút di chuyển — hiện khi rê chuột vào trang */}
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-0.5 bg-gradient-to-t from-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button className={nutTrang} disabled={!idTren} onClick={() => chuyen(a, idTren)} title="Đưa lên cuối file phía trên">
                  ▲
                </button>
                <button className={nutTrang} disabled={k === 0} onClick={() => chuyen(a, tl.id, k - 1)} title="Sang trái (lên trước 1 trang)">
                  ◀
                </button>
                <button className={nutTrang} disabled={k === n - 1} onClick={() => chuyen(a, tl.id, k + 1)} title="Sang phải (lùi sau 1 trang)">
                  ▶
                </button>
                <button className={nutTrang} disabled={!idDuoi} onClick={() => chuyen(a, idDuoi, 0)} title="Đưa xuống đầu file phía dưới">
                  ▼
                </button>
                <button className={nutTrang} disabled={n === 1} onClick={() => chuyen(a, '')} title="Tách trang này ra thành file mới">
                  ✂
                </button>
                <button
                  className={`${nutTrang} hover:bg-red-600`}
                  onClick={() => confirm(`Bỏ trang ${k + 1} khỏi "${tl.ten}"?`) && onThaoTac({ hanhDong: 'bo-trang', anh: a })}
                  title="Bỏ trang này"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
        {vach(n)}
      </div>

      {/* ── tên + thư mục ─────────────────────────────────────────────── */}
      <div className="grid gap-2">
        <div className="flex items-center rounded-md border border-neutral-700 bg-neutral-950 focus-within:border-sky-500">
          <span className="w-8 shrink-0 pl-3 text-neutral-500" aria-hidden>
            ✎
          </span>
          <ONhap
            oRef={oTen}
            giaTri={tl.ten}
            onLuu={(v) => luuO({ hanhDong: 'doi-ten', id: tl.id, ten: v })}
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base font-medium outline-none"
            aria-label="Tên file PDF"
          />
          <span className="pr-3 text-sm text-neutral-500">.pdf</span>
        </div>
        <div className="flex items-center rounded-md border border-neutral-800 bg-neutral-950/60 text-sm focus-within:border-sky-500">
          <span className="w-8 shrink-0 pl-3 text-neutral-500" aria-hidden>
            📁
          </span>
          <span className="shrink-0 pl-2 font-mono text-xs text-neutral-500">{tenCon}\</span>
          <ONhap
            giaTri={tm2Goc}
            onLuu={(v) => luuO({ hanhDong: 'doi-thu-muc', id: tl.id, thuMuc2: v })}
            onGo={setTm2Go}
            chuan={chuanThuMuc2}
            list="ds-thu-muc-2"
            placeholder="thư mục con của con — để trống = lưu ngay trong thư mục con"
            className="min-w-0 flex-1 bg-transparent px-1 py-1.5 font-mono text-xs outline-none placeholder:font-sans placeholder:text-neutral-600"
            aria-label="Thư mục con của con"
          />
        </div>
        <p className="-mt-1 truncate pl-8 font-mono text-[11px] text-neutral-500" title="Nơi PDF sẽ được ghi khi bấm Lưu">
          → {tenCon}\{tm2 ? `${tm2}\\` : ''}
          <span className="text-neutral-300">{tl.ten}.pdf</span>
          {!tm2 && <span className="font-sans"> (ngay trong thư mục con)</span>}
          {tm2TheoTren !== null && tm2Go === null ? (
            <span className="font-sans text-neutral-600"> · theo ô trên</span>
          ) : (
            tm2Tren !== undefined &&
            tm2 !== tm2Tren && (
              <>
                <span className="font-sans text-amber-400/80"> · chọn riêng</span>
                <button
                  className="ml-2 rounded px-1 font-sans text-sky-400 hover:bg-neutral-800 hover:underline"
                  onClick={() => luuO({ hanhDong: 'doi-thu-muc', id: tl.id, thuMuc2: tm2Tren })}
                  title="Bỏ chọn riêng, lại đổi theo ô thư mục con của con ở trên"
                >
                  ↺ theo ô trên
                </button>
              </>
            )
          )}
        </p>
        {goiYThuMuc.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pl-8" aria-label="Chọn nhanh thư mục con của con">
            {['', ...goiYThuMuc].map((t) => {
              const dangChon = tm2 === t
              return (
                <button
                  key={t || '.'}
                  className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                    dangChon ? 'bg-sky-900/60 text-sky-200' : 'text-sky-400 hover:bg-neutral-800 hover:underline'
                  }`}
                  onClick={() => !dangChon && luuO({ hanhDong: 'doi-thu-muc', id: tl.id, thuMuc2: t })}
                  aria-pressed={dangChon}
                  title={t ? `Lưu vào ${tenCon}\\${t}` : 'Lưu ngay trong thư mục con'}
                >
                  {t ? `${t}\\` : '(ngay trong thư mục con)'}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs">
          {thongBao ? (
            <span className="text-red-400">{thongBao}</span>
          ) : (
            <span className="text-neutral-500">
              {n} trang · nháp{laMoi && <span className="ml-2 text-sky-400">● vừa quét</span>}
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-1">
          <button
            className={`${nut} ${dangScanVao ? 'text-sky-300' : ''}`}
            disabled={dangScan}
            onClick={() => onScanTiep(tl.id)}
            title="Đặt thêm giấy vào khay rồi bấm: các trang quét được nối vào cuối file này"
          >
            {dangScanVao ? 'Đang scan tiếp…' : '📠 Scan tiếp vào file này'}
          </button>
          <button className={nut} onClick={() => xoay(tl.anh, 90)} title="Xoay mọi trang của file sang phải 90°">
            ⟳ Xoay cả file
          </button>
          <a href={urlPdf(thuMuc, tl)} target="_blank" rel="noreferrer" className={nut} title="Dựng tạm PDF để xem, chưa ghi file">
            Xem thử PDF
          </a>
          <button className={nut} disabled={!idTren} onClick={() => onThaoTac({ hanhDong: 'gop', id: tl.id })} title="Nối các trang của file này vào cuối file phía trên">
            ▲ Gộp vào file trên
          </button>
          <button className={nut} disabled={n < 2} onClick={() => onThaoTac({ hanhDong: 'tach', id: tl.id })}>
            Tách từng trang
          </button>
          <button
            className={`${nut} text-red-400 hover:bg-red-950/50`}
            onClick={() => confirm(`Bỏ file nháp "${tl.ten}"?${tl.fileDaLuu ? '\nPDF đã lưu trước đó sẽ bị xoá khi bấm Lưu.' : ''}`) && onThaoTac({ hanhDong: 'xoa', id: tl.id })}
          >
            Xoá
          </button>
        </div>
      </div>
    </div>
  )
}

/** Một file ĐÃ LƯU: dòng gọn, chỉ xem / mở / đưa về nháp để sửa. */
export function DongDaLuu({ tl, thuMuc, tenCon, onThaoTac }) {
  const nut = 'rounded-md px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-neutral-800/70 bg-neutral-900/30 px-3 py-2">
      <span className="text-emerald-400" aria-hidden>
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{tl.ten}.pdf</div>
        <div className="truncate font-mono text-xs text-neutral-500">
          {tenCon}\{tl.fileDaLuu} · {tl.anh.length} trang
          {tl.mat && <span className="ml-2 font-sans text-amber-400">không thấy file trên ổ đĩa</span>}
        </div>
      </div>
      <div className="flex gap-1">
        <a href={urlPdf(thuMuc, tl)} target="_blank" rel="noreferrer" className={nut}>
          Xem PDF
        </a>
        <button className={nut} onClick={() => onThaoTac({ hanhDong: 'mo', id: tl.id })}>
          Hiện trong thư mục
        </button>
        <button className={nut} onClick={() => onThaoTac({ hanhDong: 'sua-lai', id: tl.id })} title="Đưa về nháp để đổi tên, chuyển trang… rồi Lưu lại">
          Sửa lại
        </button>
      </div>
    </div>
  )
}
