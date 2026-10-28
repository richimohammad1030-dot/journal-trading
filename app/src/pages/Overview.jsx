import { useEffect, useMemo, useState } from 'react'
import { Empty, Badge } from '../components/ui'
import { GradeBadge } from '../components/DnaPanel'
import DashEquity from '../components/DashEquity'
import TradeRow from '../components/TradeRow'
import { CountUp, Donut, MiniBars, Ring, Sparkline } from '../components/viz'
import { I, Icon } from '../components/icons'
import { DIMENSIONS, label } from '../lib/dna'
import { CLOSE_LABEL, SESSIONS, breakdown, dailyMap, session, summarize } from '../lib/stats'
import { MARKETS, MARKET_ICON } from '../lib/markets'
import { ago, dayKey, fmtDate, fmtTime, money, num, pct, pnlColor } from '../lib/format'

const QUOTES = [
  ['Konsisten hari ini,', 'bebas di kemudian hari.'],
  ['Lindungi modal dulu,', 'profit akan menyusul.'],
  ['Satu trade tidak menentukan', 'apa pun. Seratus trade, ya.'],
  ['Disiplin pada rencana', 'lebih penting dari tebakan arah.'],
  ['Rugi kecil itu biaya usaha,', 'rugi besar itu kesalahan.'],
]
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const pad = (n) => String(n).padStart(2, '0')
const shortAmt = (v) => {
  const a = Math.abs(v)
  const s = a >= 10000 ? (a / 1000).toFixed(0) + 'k' : a >= 1000 ? (a / 1000).toFixed(1) + 'k' : a >= 100 ? a.toFixed(0) : a.toFixed(1)
  return (v < 0 ? '−' : '+') + s
}
const price = (v) => v == null ? '–' : num(+v, +v >= 1000 ? 2 : +v >= 20 ? 3 : 5)

function greeting() {
  const h = new Date(Date.now() + 7 * 3600e3).getUTCHours()
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
}

function Kpi({ icon, title, children, chart, delta, deltaTone = 'up', onClick, delay = 0, className = '' }) {
  return (
    <button onClick={onClick} className={`card card-hover fade-up p-4 text-left flex flex-col gap-2.5 min-w-0 ${className}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2.5 text-[13px] text-muted">
        <span className="icon-tile !w-7 !h-7"><Icon d={icon} className="w-[15px] h-[15px]" /></span>{title}
      </div>
      <div className="num text-[24px] md:text-[27px] font-bold leading-none tracking-tight truncate">{children}</div>
      <div className="flex flex-wrap md:flex-nowrap items-end justify-between gap-2 min-w-0 mt-auto">
        {delta ? <span className={`inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap ${deltaTone === 'up' ? 'pill-up' : deltaTone === 'down' ? 'pill-down' : 'bg-raised text-muted'}`}>
          {deltaTone !== 'muted' && <span className="text-[9px]">{deltaTone === 'up' ? '▲' : '▼'}</span>}{delta}
        </span> : <span />}
        <div className="basis-full md:basis-auto md:flex-1 min-w-0 flex justify-end">{chart}</div>
      </div>
    </button>
  )
}

function MiniCalendar({ daily, cur, openTrade }) {
  const now = new Date(Date.now() + 7 * 3600e3)
  const [[y, m], setYm] = useState([now.getUTCFullYear(), now.getUTCMonth()])
  const [sel, setSel] = useState(null)
  const move = (d) => { setSel(null); setYm(([yy, mm]) => { const n = new Date(Date.UTC(yy, mm + d, 1)); return [n.getUTCFullYear(), n.getUTCMonth()] }) }
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const key = (d) => `${y}-${pad(m + 1)}-${pad(d)}`
  const month = Array.from({ length: days }, (_, i) => daily.get(key(i + 1))).filter(Boolean)
  const total = month.reduce((s, d) => s + d.pnl, 0)
  const maxAbs = Math.max(1, ...month.map((d) => Math.abs(d.pnl)))
  const todayKey = now.toISOString().slice(0, 10)
  const day = sel ? daily.get(sel) : null
  return (
    <section className="card p-5 h-full fade-up">
      <div className="flex items-center gap-3 mb-1">
        <span className="icon-tile"><Icon d={I.cal} className="w-4 h-4" /></span>
        <h2 className="font-semibold text-[16px] leading-tight mr-auto">Kalender Trading</h2>
        <button onClick={() => move(-1)} className="w-8 h-8 rounded-lg hover:bg-raised text-muted" aria-label="Bulan sebelumnya">‹</button>
        <span className="text-[13px] font-medium w-[104px] text-center">{MONTHS[m]} {y}</span>
        <button onClick={() => move(1)} className="w-8 h-8 rounded-lg hover:bg-raised text-muted" aria-label="Bulan berikutnya">›</button>
      </div>
      <div className="text-[12px] text-muted mb-3 pl-[42px]"><span className={`num ${pnlColor(total)}`}>{money(total, cur, { sign: true })}</span> · {month.filter((d) => d.pnl > 0).length}/{month.length} hari hijau</div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-faint text-center mb-1">{['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const k = key(d), v = daily.get(k), on = sel === k
          const a = v ? 0.1 + 0.45 * Math.min(1, Math.abs(v.pnl) / maxAbs) : 0
          return (
            <button key={i} onClick={() => setSel(on ? null : k)} title={v ? `${v.n} trade` : ''}
              className={`h-[46px] rounded-lg flex flex-col items-center justify-center border transition hover:scale-[1.06] ${on ? 'border-accent shadow-[0_0_0_2px_rgb(var(--glow)/.3)]' : k === todayKey ? 'border-muted/50' : 'border-line/60'}`}
              style={v ? { background: `color-mix(in oklab, ${v.pnl >= 0 ? 'var(--up)' : 'var(--down)'} ${Math.round(a * 100)}%, transparent)` } : undefined}>
              <span className="text-[10.5px] text-muted leading-none">{d}</span>
              {v && <span className={`num text-[10.5px] font-semibold leading-none mt-1 ${v.pnl >= 0 ? 'text-up' : 'text-down'}`}>{shortAmt(v.pnl)}</span>}
            </button>
          )
        })}
      </div>
      {sel && (
        <div className="mt-3 rounded-xl border border-line bg-raised/40 p-2 sheet-in">
          <div className="flex items-center justify-between px-2 py-1 text-[12px]">
            <span className="text-muted">{fmtDate(sel + 'T05:00:00Z', { weekday: 'long', month: 'long' })}</span>
            {day && <span className={`num font-semibold ${pnlColor(day.pnl)}`}>{money(day.pnl, cur, { sign: true })}</span>}
          </div>
          {!day ? <div className="px-2 pb-1 text-[12px] text-faint">Tidak ada trade ditutup.</div> : day.trades.map((t) => (
            <button key={t.position_id} onClick={() => openTrade(t, day.trades)} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-raised text-[12.5px]">
              <span><span className="font-semibold">{t.symbol}</span> <span className={`uppercase text-[10px] ${t.direction === 'buy' ? 'text-up' : 'text-down'}`}>{t.direction}</span> <span className="text-faint">{fmtTime(t.close_time)}</span></span>
              <span className={`num ${pnlColor(t.net_pnl)}`}>{money(+t.net_pnl, cur, { sign: true })}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function sharpe(curve, from) {
  const byDay = new Map()
  for (const p of curve) if (!from || p.ts >= from) byDay.set(dayKey(p.t), p.idx)
  const v = [...byDay.values()]
  if (v.length < 6) return null
  const r = v.slice(1).map((x, i) => x / v[i] - 1)
  const mean = r.reduce((s, x) => s + x, 0) / r.length
  const sd = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1))
  return sd > 0 ? (mean / sd) * Math.sqrt(252) : null
}

export default function Overview({ ctx }) {
  const { account, s, pm, trades, allTrades, accountTrades, positions, tags, openTrade, go, dna, curve, market, setMarket, range } = ctx
  const cur = account.currency
  const [qi, setQi] = useState(0)
  const [donutActive, setDonutActive] = useState(null)
  const [groupBy, setGroupBy] = useState('session')
  useEffect(() => { const t = setInterval(() => setQi((x) => (x + 1) % QUOTES.length), 7000); return () => clearInterval(t) }, [])
  const openDna = () => { try { localStorage.setItem('analitik-tab', 'dna') } catch { /* abaikan */ } go('analitik') }

  const cum = useMemo(() => { let a = 0; return trades.map((t) => (a += +t.net_pnl)) }, [trades])
  const rollR = useMemo(() => {
    const rs = trades.filter((t) => t.r_multiple != null).map((t) => +t.r_multiple)
    return rs.map((_, i) => { const w = rs.slice(Math.max(0, i - 9), i + 1); return w.reduce((x, y) => x + y, 0) / w.length })
  }, [trades])
  const weekly = useMemo(() => {
    const out = Array(10).fill(0), now = Date.now()
    for (const t of trades) { const w = Math.floor((now - new Date(t.close_time)) / (7 * 864e5)); if (w >= 0 && w < 10) out[9 - w]++ }
    return out
  }, [trades])
  const daily = useMemo(() => dailyMap(allTrades), [allTrades])
  const byMarket = useMemo(() => MARKETS.slice(1).map(([id, l]) => {
    const ts = accountTrades.filter((t) => t.market === id && (!range[0] || +new Date(t.close_time) >= range[0]))
    let a = 0
    return { id, l, n: ts.length, net: ts.reduce((x, t) => x + +t.net_pnl, 0), spark: ts.map((t) => (a += +t.net_pnl)), wr: summarize(ts).winRate }
  }), [accountTrades, range])
  const groups = useMemo(() => groupBy === 'session'
    ? breakdown(trades, (t) => session(t.open_time), SESSIONS)
    : breakdown(trades, (t) => t.symbol).slice(0, 5), [trades, groupBy])
  const shp = useMemo(() => sharpe(curve, range[0]), [curve, range])
  const rr = s.avgWin && s.avgLoss ? s.avgWin / -s.avgLoss : null
  const pf = s.profitFactor === Infinity ? '∞' : num(s.profitFactor, 2)
  const floating = positions.reduce((a, p) => a + +p.profit + +(p.swap || 0), 0)
  const gMax = Math.max(1e-9, ...groups.map((g) => Math.abs(g.net)))
  const firstName = (account.name || 'Trader').split(/[\s·]/)[0]
  const [q1, q2] = QUOTES[qi]

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Sapaan + filter pasar + kutipan */}
      <div className="grid lg:grid-cols-[1fr_auto] 2xl:grid-cols-[1fr_auto_340px] gap-4 items-center">
        <div className="fade-up">
          <h1 className="text-[24px] md:text-[30px] font-bold tracking-tight leading-tight">{greeting()}, {firstName}</h1>
          <p className="text-muted text-[13.5px] md:text-[15px] mt-1">Pantau. Analisis. Tingkatkan. Balance <span className="num text-ink">{money(+account.balance, cur)}</span>
            {positions.length > 0 && <> · floating <span className={`num ${pnlColor(floating)}`}>{money(floating, cur, { sign: true })}</span></>}</p>
        </div>
        <div className="hidden md:block justify-self-start xl:justify-self-auto"><div className="seg">
          {MARKETS.map(([id, l]) => <button key={id} data-on={market === id} onClick={() => setMarket(id)}>{l}</button>)}
        </div></div>
        <div className="card p-4 hidden 2xl:flex items-center gap-4 fade-up">
          <span className="w-11 h-11 rounded-xl grid place-items-center bg-accent/15 text-accent shrink-0"><Icon d={I.chart} className="w-6 h-6" /></span>
          <div key={qi} className="text-[13.5px] text-muted leading-snug sheet-in">{q1}<br /><span className="text-ink">{q2}</span></div>
        </div>
      </div>

      {s.n === 0 ? (
        <div className="card"><Empty title="Belum ada trade di periode/pasar ini">Pilih periode atau pasar lain, atau tunggu sync berikutnya.</Empty></div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
            <Kpi icon={I.wallet} title="Profit Bersih" onClick={() => go('analitik')} delay={0}
              delta={pm.gain != null && market === 'all' ? pct(pm.gain, 1, true) : `${s.n} trade`} deltaTone={market === 'all' ? (pm.gain >= 0 ? 'up' : 'down') : 'muted'}
              chart={<Sparkline values={cum} color={s.net >= 0 ? 'var(--up)' : 'var(--down)'} className="w-full max-w-[110px] h-10" />}>
              <span className={pnlColor(s.net)}><CountUp value={s.net} format={(v) => money(v, cur, { sign: true })} /></span>
            </Kpi>
            <Kpi icon={I.chart} title="Win Rate" onClick={() => go('trade')} delay={60}
              delta={`${s.wins}/${s.n} menang`} deltaTone="muted"
              chart={<Ring value={s.winRate} size={46} stroke={6} />}>
              <CountUp value={s.winRate * 100} format={(v) => `${v.toFixed(1)}%`} />
            </Kpi>
            <Kpi icon={I.doc} title="Profit Factor" onClick={() => go('analitik')} delay={120}
              delta={`${money(s.expectancy, cur, { sign: true })}/trade`} deltaTone={s.expectancy >= 0 ? 'up' : 'down'}
              chart={<MiniBars values={trades.slice(-12).map((t) => +t.net_pnl)} signed className="w-full max-w-[96px] h-10" />}>
              <span className={s.profitFactor >= 1.5 ? 'text-up' : s.profitFactor < 1 ? 'text-down' : ''}>{pf}</span>
            </Kpi>
            <Kpi icon={I.list} title="Total Trade" onClick={() => go('trade')} delay={180}
              delta={`${num(weekly.reduce((a, b) => a + b, 0) / 10, 1)}/minggu`} deltaTone="muted"
              chart={<MiniBars values={weekly} className="w-full max-w-[96px] h-10" />}>
              <CountUp value={s.n} format={(v) => Math.round(v)} />
            </Kpi>
            <Kpi icon={I.clock} title="Rata-rata R:R" onClick={() => go('analitik')} delay={240} className="col-span-2 md:col-span-1"
              delta={s.avgR != null ? `${s.avgR > 0 ? '+' : ''}${num(s.avgR, 2)}R/trade` : 'tanpa SL'} deltaTone={s.avgR == null ? 'muted' : s.avgR >= 0 ? 'up' : 'down'}
              chart={<Sparkline values={rollR} color="var(--up)" className="w-full max-w-[110px] h-10" />}>
              {rr ? <>1 : <CountUp value={rr} format={(v) => num(v, 1)} /></> : '–'}
            </Kpi>
          </div>

          {/* Kurva + breakdown */}
          <div className="grid xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7 2xl:col-span-8"><DashEquity curve={curve} trades={allTrades} cur={cur} marketFiltered={market !== 'all'} /></div>
            <section className="card p-5 xl:col-span-5 2xl:col-span-4 fade-up">
              <div className="flex items-center gap-3 mb-4">
                <span className="icon-tile"><Icon d={I.chart} className="w-4 h-4" /></span>
                <h2 className="font-semibold text-[16px]">Rincian P&L</h2>
              </div>
              <div className="flex items-center gap-5">
                <Donut size={152} stroke={16} active={donutActive} onActive={setDonutActive}
                  parts={[{ value: s.gp, color: 'var(--up)' }, { value: s.gl, color: 'var(--down)' }]}
                  center={<div>
                    <div className={`num text-[17px] font-bold ${donutActive === 0 ? 'text-up' : donutActive === 1 ? 'text-down' : pnlColor(s.net)}`}>
                      {money(donutActive === 0 ? s.gp : donutActive === 1 ? -s.gl : s.net, cur, { sign: true, compact: true })}</div>
                    <div className="text-[11px] text-muted">{donutActive === 0 ? 'Gross profit' : donutActive === 1 ? 'Gross loss' : 'Net P&L'}</div>
                  </div>} />
                <div className="flex-1 space-y-3 min-w-0">
                  {[[0, 'Trade menang', s.wins, s.gp, 'up'], [1, 'Trade kalah', s.losses, -s.gl, 'down']].map(([i, l, n, v, tone]) => (
                    <button key={i} onMouseEnter={() => setDonutActive(i)} onMouseLeave={() => setDonutActive(null)} onClick={() => setDonutActive(donutActive === i ? null : i)}
                      className={`w-full text-left rounded-xl p-2 -m-2 transition ${donutActive === i ? 'bg-raised' : ''}`}>
                      <div className="flex items-center gap-2 text-[12px] text-muted whitespace-nowrap"><span className={`w-2.5 h-2.5 rounded-full bg-${tone}`} />{l}</div>
                      <div className="flex items-baseline justify-between gap-2 mt-0.5">
                        <span className="font-semibold text-[15px] whitespace-nowrap">{n} <span className="text-[12px] text-muted font-normal">({pct(n / s.n, 0)})</span></span>
                        <span className={`num text-[13px] font-semibold whitespace-nowrap text-${tone}`}>{money(v, cur, { sign: true, compact: true })}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-5">
                {[['Rata-rata menang', s.avgWin, 'text-up', null], ['Rata-rata kalah', s.avgLoss, 'text-down', null],
                  ['Menang terbesar', s.best?.net_pnl, 'text-up', s.best], ['Kalah terbesar', s.worst?.net_pnl, 'text-down', s.worst]].map(([l, v, tone, t]) => (
                  <button key={l} disabled={!t} onClick={() => t && openTrade(t)} className={`rounded-xl border border-line bg-raised/30 p-3 text-left transition ${t ? 'hover:border-accent/40' : ''}`}>
                    <div className="text-[11.5px] text-muted">{l}</div>
                    <div className={`num text-[16px] font-semibold mt-0.5 ${tone}`}>{v != null ? money(+v, cur, { sign: true }) : '–'}</div>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Trade terakhir + kalender */}
          <div className="grid xl:grid-cols-12 gap-4">
            <section className="card xl:col-span-8 fade-up overflow-hidden">
              <div className="flex items-center gap-3 p-5 pb-3">
                <span className="icon-tile"><Icon d={I.list} className="w-4 h-4" /></span>
                <h2 className="font-semibold text-[16px] mr-auto">Trade Terakhir</h2>
                <button onClick={() => go('trade')} className="text-[13px] text-accent font-semibold flex items-center gap-1 hover:gap-2 transition-all">Lihat semua <span>→</span></button>
              </div>
              <div className="hidden md:block overflow-x-auto scroll-thin">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-left text-[11.5px] text-faint border-y border-line bg-raised/30">
                    {['Waktu tutup', 'Pair', 'Arah', 'Entry', 'Exit', 'P&L', 'R', 'Penutupan'].map((h, i) => <th key={h} className={`font-medium py-2.5 ${i === 0 ? 'pl-5' : ''} ${i >= 3 && i <= 6 ? 'text-right pr-4' : 'pr-3'}`}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {trades.slice(-8).reverse().map((t) => {
                      const bad = (tags.get(t.position_id) || []).filter((k) => k !== 'rule_ok' && k !== 'weekend')
                      return (
                        <tr key={t.position_id} onClick={() => openTrade(t)} className="border-b border-line/60 last:border-0 cursor-pointer hover:bg-raised/60 transition-colors group">
                          <td className="pl-5 py-3 text-muted whitespace-nowrap">{fmtDate(t.close_time)} <span className="num">{fmtTime(t.close_time)}</span></td>
                          <td className="pr-3 font-semibold">{t.symbol}</td>
                          <td className="pr-3"><span className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${t.direction === 'buy' ? 'pill-up' : 'pill-down'}`}>{t.direction === 'buy' ? 'Buy' : 'Sell'}</span></td>
                          <td className="num text-right pr-4">{price(t.open_price)}</td>
                          <td className="num text-right pr-4">{price(t.close_price)}</td>
                          <td className={`num text-right pr-4 font-semibold ${pnlColor(t.net_pnl)}`}>{money(+t.net_pnl, cur, { sign: true })}</td>
                          <td className={`num text-right pr-4 ${pnlColor(t.r_multiple)}`}>{t.r_multiple != null ? num(+t.r_multiple, 1) : '–'}</td>
                          <td className="pr-5 text-muted whitespace-nowrap">{CLOSE_LABEL[t.close_reason] || '–'}{bad.length > 0 && <span className="ml-1.5 text-warn" title={bad.join(', ')}>●</span>}<span className="ml-2 text-faint opacity-0 group-hover:opacity-100 transition">›</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden divide-y divide-line border-t border-line">
                {trades.slice(-6).reverse().map((t) => <TradeRow key={t.position_id} t={t} cur={cur} tags={tags.get(t.position_id)} onOpen={openTrade} />)}
              </div>
            </section>
            <div className="xl:col-span-4"><MiniCalendar daily={daily} cur={cur} openTrade={openTrade} /></div>
          </div>

          {/* Pasar, sesi/pair, risiko */}
          <div className="grid md:grid-cols-2 xl:grid-cols-12 gap-4">
            <section className="card p-5 xl:col-span-5 fade-up">
              <h2 className="font-semibold text-[16px] mb-3">Performa per Pasar</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {byMarket.map((b) => (
                  <button key={b.id} onClick={() => setMarket(market === b.id ? 'all' : b.id)} disabled={!b.n}
                    className={`rounded-xl border p-3 text-left transition ${market === b.id ? 'border-accent/60 bg-accent/10' : 'border-line bg-raised/30 hover:border-accent/40'} ${!b.n ? 'opacity-45' : ''}`}>
                    <div className="flex items-center gap-2 text-[12.5px]"><Icon d={MARKET_ICON[b.id]} className="w-4 h-4 text-accent" />{b.l}<span className="ml-auto text-[11px] text-faint">{b.n}</span></div>
                    <div className="flex items-end justify-between gap-2 mt-1.5">
                      <div>
                        <div className={`num text-[15px] font-semibold ${pnlColor(b.net)}`}>{b.n ? money(b.net, cur, { sign: true, compact: true }) : '–'}</div>
                        <div className="text-[10.5px] text-faint">{b.n ? `win ${pct(b.wr, 0)}` : 'belum ada'}</div>
                      </div>
                      <Sparkline values={b.spark} color={b.net >= 0 ? 'var(--up)' : 'var(--down)'} className="w-16 h-8" />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="card p-5 xl:col-span-4 fade-up">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="font-semibold text-[16px]">Performa Terbaik</h2>
                <div className="seg !p-0.5">{[['session', 'Sesi'], ['symbol', 'Pair']].map(([id, l]) => <button key={id} className="!py-1 !px-2.5" data-on={groupBy === id} onClick={() => setGroupBy(id)}>{l}</button>)}</div>
              </div>
              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g.key} className="text-[12.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{g.key}</span>
                      <span className="text-faint shrink-0">{g.n} trade · {pct(g.winRate, 0)}</span>
                      <span className={`num font-semibold w-20 text-right shrink-0 ${pnlColor(g.net)}`}>{money(g.net, cur, { sign: true, compact: true })}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-raised mt-1.5 overflow-hidden">
                      <div className="h-full rounded-full bar-grow origin-left" style={{ width: `${(Math.abs(g.net) / gMax) * 100}%`, background: g.net >= 0 ? 'var(--up)' : 'var(--down)', transform: 'none' }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-5 md:col-span-2 xl:col-span-3 fade-up">
              <h2 className="font-semibold text-[16px] mb-3">Ringkasan Risiko</h2>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11.5px] text-muted">Max drawdown</div>
                  <div className="num text-[22px] font-semibold text-down">{pct(pm.maxDD, 1)}</div>
                </div>
                <Sparkline values={pm.points.map((p) => p.ddRel)} color="var(--down)" className="w-28 h-12" />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 text-[12px]">
                <div><div className="text-muted">Sharpe ratio</div><div className="num text-[16px] font-semibold mt-0.5" title="Dari return harian, disetahunkan">{shp != null ? num(shp, 2) : '–'}</div></div>
                <div><div className="text-muted">Pakai SL</div><div className={`num text-[16px] font-semibold mt-0.5 ${s.slRate < 0.8 ? 'text-warn' : 'text-up'}`}>{pct(s.slRate, 0)}</div></div>
                <div><div className="text-muted">Kalah beruntun</div><div className="num text-[16px] font-semibold mt-0.5">{s.maxLossStreak}×</div></div>
                <div><div className="text-muted">Menang beruntun</div><div className="num text-[16px] font-semibold mt-0.5">{s.maxWinStreak}×</div></div>
              </div>
            </section>
          </div>

          {/* DNA + posisi terbuka */}
          <div className="grid xl:grid-cols-12 gap-4">
            {dna && (
              <section className="card p-5 xl:col-span-7 fade-up">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="font-semibold text-[16px]">Trader DNA</h2>
                  <GradeBadge dna={dna} />
                </div>
                <div className="grid grid-cols-5 gap-2.5">
                  {DIMENSIONS.map(([k, name], i) => {
                    const v = dna.scores[k], [, tone] = label(v)
                    return (
                      <div key={k} className="min-w-0 group">
                        <div className="h-20 rounded-xl bg-raised relative overflow-hidden border border-line">
                          <div className="absolute inset-x-0 bottom-0 bar-grow origin-bottom" style={{ height: `${v}%`, background: `linear-gradient(180deg, var(--${tone}), color-mix(in oklab, var(--${tone}) 35%, transparent))`, animationDelay: `${i * 80}ms` }} />
                        </div>
                        <div className="num text-[13px] font-semibold mt-1.5 text-center">{v}</div>
                        <div className="text-[10.5px] text-faint text-center truncate">{name.replace('Manajemen ', '')}</div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[13px] text-muted mt-4"><span className="text-ink font-semibold">Fokus berikutnya:</span> {dna.details[dna.weakest].tip}</p>
                <button onClick={openDna} className="text-[13px] text-accent font-semibold mt-2">Lihat rincian skor →</button>
              </section>
            )}
            <section className={`card fade-up overflow-hidden ${dna ? 'xl:col-span-5' : 'xl:col-span-12'}`}>
              <div className="flex items-center gap-3 p-5 pb-3">
                <h2 className="font-semibold text-[16px] mr-auto">Posisi Terbuka</h2>
                <Badge tone={positions.length ? 'up' : 'muted'}>{positions.length}</Badge>
              </div>
              {positions.length === 0 ? <div className="px-5 pb-5 text-sm text-muted">Tidak ada posisi terbuka saat sync terakhir ({ago(account.last_sync_at)}).</div> : (
                <div className="divide-y divide-line border-t border-line">
                  {positions.map((p) => (
                    <div key={p.ticket} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <div className="font-semibold text-[14px]">{p.symbol} <span className={`text-[10.5px] uppercase ${p.direction === 'buy' ? 'text-up' : 'text-down'}`}>{p.direction}</span> <span className="num text-[11.5px] text-muted">{num(+p.volume, 2)}</span></div>
                        <div className="text-[11.5px] text-faint">{fmtDate(p.open_time)} {fmtTime(p.open_time)} · {p.sl ? 'SL terpasang' : <span className="text-warn">tanpa SL</span>}</div>
                      </div>
                      <span className={`num font-semibold ${pnlColor(+p.profit)}`}>{money(+p.profit, cur, { sign: true })}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
