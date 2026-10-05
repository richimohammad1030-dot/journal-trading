import { money, pnlColor } from '../lib/format'

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const pad = (n) => String(n).padStart(2, '0')
const short = (v) => {
  const a = Math.abs(v)
  const s = a >= 10000 ? (a / 1000).toFixed(0) + 'k' : a >= 1000 ? (a / 1000).toFixed(1) + 'k' : a >= 100 ? a.toFixed(0) : a.toFixed(1)
  return (v < 0 ? '−' : '+') + s
}

export default function Calendar({ year, month, daily, cur, selected, onSelect, onMonth }) {
  const first = new Date(Date.UTC(year, month, 1))
  const lead = (first.getUTCDay() + 6) % 7 // Senin = 0
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const key = (d) => `${year}-${pad(month + 1)}-${pad(d)}`
  const monthDays = Array.from({ length: days }, (_, i) => daily.get(key(i + 1))).filter(Boolean)
  const maxAbs = Math.max(1, ...monthDays.map((d) => Math.abs(d.pnl)))
  const total = monthDays.reduce((s, d) => s + d.pnl, 0)
  const greenDays = monthDays.filter((d) => d.pnl > 0).length
  const todayKey = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)

  const shade = (pnl) => {
    const a = 0.12 + 0.55 * Math.min(1, Math.abs(pnl) / maxAbs)
    return { background: `color-mix(in oklab, ${pnl >= 0 ? 'var(--up)' : 'var(--down)'} ${Math.round(a * 100)}%, transparent)` }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button className="w-9 h-9 rounded-full hover:bg-raised text-muted" onClick={() => onMonth(-1)} aria-label="Bulan sebelumnya">‹</button>
        <div className="text-center">
          <div className="font-semibold">{MONTHS[month]} {year}</div>
          <div className="text-[11.5px] text-muted">
            <span className={`num ${pnlColor(total)}`}>{cur ? money(total, cur, { sign: true }) : `${total >= 0 ? '+' : '−'}${Math.abs(total).toFixed(2)}% modal`}</span> · {greenDays}/{monthDays.length} hari hijau
          </div>
        </div>
        <button className="w-9 h-9 rounded-full hover:bg-raised text-muted" onClick={() => onMonth(1)} aria-label="Bulan berikutnya">›</button>
      </div>

      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.15fr)] gap-1 text-[10.5px] text-faint font-medium mb-1 text-center">
        {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => <div key={d}>{d}</div>)}
        <div>Minggu</div>
      </div>
      <div className="space-y-1">
        {weeks.map((w, wi) => {
          const wk = w.filter(Boolean).map((d) => daily.get(key(d))).filter(Boolean)
          const wPnl = wk.reduce((s, d) => s + d.pnl, 0)
          const wN = wk.reduce((s, d) => s + d.n, 0)
          return (
            <div key={wi} className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.15fr)] gap-1">
              {w.map((d, i) => {
                if (!d) return <div key={i} />
                const k = key(d), v = daily.get(k)
                const sel = selected === k
                return (
                  <button
                    key={i} onClick={() => onSelect(sel ? null : k)}
                    className={`aspect-square md:aspect-[1.25] rounded-lg p-1 flex flex-col justify-between text-left transition ring-inset ${sel ? 'ring-2 ring-ink' : ''} ${v ? '' : 'bg-raised/50'} ${k === todayKey ? 'outline outline-1 outline-muted/60' : ''}`}
                    style={v ? shade(v.pnl) : undefined}
                  >
                    <span className={`text-[10px] leading-none ${v ? 'text-ink/80' : 'text-faint'}`}>{d}</span>
                    {v && (
                      <span className="leading-none">
                        <span className="num block text-[10px] sm:text-[11.5px] font-semibold text-ink truncate">{short(v.pnl)}</span>
                        <span className="hidden sm:block text-[9.5px] text-ink/70 mt-0.5">{v.n} trade</span>
                      </span>
                    )}
                  </button>
                )
              })}
              <div className="rounded-lg bg-raised/70 border border-line p-1 flex flex-col justify-center items-end">
                {wN ? <>
                  <span className={`num text-[10px] sm:text-[11.5px] font-semibold ${pnlColor(wPnl)}`}>{short(wPnl)}</span>
                  <span className="text-[9.5px] text-faint">{wN} tr</span>
                </> : <span className="text-[10px] text-faint">–</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
