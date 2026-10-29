import { Suspense, lazy, useEffect, useState } from 'react'
import { CLOSE_LABEL, SOURCE_LABEL, TAGS, session } from '../lib/stats'
import { duration, fmtDateTime, money, num, pct } from '../lib/format'
import { loadBars } from '../lib/data'
import { demoBars } from '../lib/bars'
import { Badge, Chips, Pnl, Sheet, Skeleton } from './ui'

const PriceChart = lazy(() => import('./PriceChart'))
const TREND = { up: 'Naik', down: 'Turun', flat: 'Datar' }

function ChartBlock({ t, accountId }) {
  const [view, setView] = useState('exec')
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let live = true
    setState({ loading: true })
    if (!accountId) {
      setState({ data: { exec: demoBars(t, 'exec'), ctx: demoBars(t, 'ctx') } })
    } else {
      loadBars(accountId, t.position_id).then((d) => live && setState({ data: d })).catch((e) => live && setState({ error: e.message }))
    }
    return () => { live = false }
  }, [t, accountId])
  const d = state.data?.[view]
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[11.5px] text-muted font-medium">Chart otomatis</span>
        <Chips value={view} onChange={setView} options={[['exec', `Eksekusi${state.data?.exec ? ' ' + state.data.exec.tf : ''}`], ['ctx', `Konteks${state.data?.ctx ? ' ' + state.data.ctx.tf : ''}`]]} />
      </div>
      {state.loading ? <Skeleton className="h-[280px]" /> : state.error ? (
        <div className="h-40 grid place-items-center text-sm text-down">Gagal memuat chart: {state.error}</div>
      ) : !d ? (
        <div className="h-40 grid place-items-center text-center text-[12.5px] text-muted px-6">Data harga untuk trade ini belum tersedia. Biasanya karena trade ini lebih tua dari riwayat chart yang disimpan broker.</div>
      ) : (
        <Suspense fallback={<Skeleton className="h-[280px]" />}><PriceChart key={view} bars={d.bars} tf={d.tf} t={t} /></Suspense>
      )}
    </div>
  )
}

function Excursion({ t, cur }) {
  // Forex/emas: dalam pip. Crypto (tanpa pip): dalam % dari harga entry.
  const usePips = t.mfe_pips != null || t.mae_pips != null
  if (!usePips && t.mae == null && t.mfe == null) return null
  const op = +t.open_price || 1
  const conv = (pipV, priceV) => (usePips ? +pipV || 0 : ((+priceV || 0) / op) * 100)
  const mae = conv(t.mae_pips, t.mae), mfe = conv(t.mfe_pips, t.mfe)
  const move = usePips ? +t.pips || 0 : (((t.direction === 'buy' ? 1 : -1) * (+t.close_price - op)) / op) * 100
  const fmtU = (v) => (usePips ? `${num(v, 1)} pip` : `${num(v, 2)}%`)
  const total = Math.max(mae + mfe, usePips ? 0.1 : 0.001)
  const zero = (mae / total) * 100
  const exitPos = zero + (move / total) * 100
  const eff = t.net_pnl > 0 ? t.exit_efficiency : null // untuk trade rugi, efisiensi negatif tidak bermakna
  const effTone = eff == null ? 'text-muted' : eff >= 0.6 ? 'text-up' : eff >= 0.3 ? 'text-ink' : 'text-warn'
  const unit = (p, a, r) => [p != null && fmtU(p), a != null && money(a, cur), r != null && `${num(r, 2)}R`].filter(Boolean).join(' · ')
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-[11.5px] text-muted font-medium">Pergerakan selama posisi terbuka</span>
        {eff != null ? <span className={`text-[12px] ${effTone}`}>Efisiensi exit <b className="num">{pct(Math.min(eff, 1), 0)}</b></span> : t.net_pnl < 0 && mfe > 0 ? <span className="text-[12px] text-warn">Sempat untung <b className="num">{fmtU(mfe)}</b></span> : null}
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-raised">
        <div className="absolute inset-y-0 left-0" style={{ width: `${zero}%`, background: 'color-mix(in oklab, var(--down) 45%, transparent)' }} />
        <div className="absolute inset-y-0 right-0" style={{ width: `${100 - zero}%`, background: 'color-mix(in oklab, var(--up) 45%, transparent)' }} />
      </div>
      <div className="relative h-0">
        <div className="absolute -top-[18px] w-0.5 h-6 bg-muted" style={{ left: `${zero}%` }} />
        <div className="absolute -top-[20px] -translate-x-1/2 w-3 h-3 rotate-45 border-2 border-bg" style={{ left: `${Math.min(99, Math.max(1, exitPos))}%`, background: t.net_pnl >= 0 ? 'var(--up)' : 'var(--down)' }} />
      </div>
      <div className="flex justify-between text-[10.5px] text-faint mt-2"><span>◂ melawan (MAE)</span><span>entry</span><span>mendukung (MFE) ▸</span></div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-xl bg-raised p-2.5"><div className="text-[11px] text-muted">MAE (terjauh melawan)</div><div className="num text-[12.5px] text-down mt-0.5">{unit(mae, t.mae_amount, t.mae_r)}</div></div>
        <div className="rounded-xl bg-raised p-2.5"><div className="text-[11px] text-muted">MFE (terjauh mendukung)</div><div className="num text-[12.5px] text-up mt-0.5">{unit(mfe, t.mfe_amount, t.mfe_r)}</div></div>
      </div>
      <p className="text-[11.5px] text-faint mt-3">
        ◆ = posisi exit. {eff != null && eff < 0.3 && t.net_pnl > 0 ? 'Harga sempat bergerak jauh lebih menguntungkan dari titik exit.' : eff != null && eff >= 0.6 ? 'Exit mengambil sebagian besar pergerakan yang tersedia.' : t.net_pnl < 0 && mfe > Math.abs(move) ? 'Posisi sempat untung sebelum berbalik menjadi rugi.' : ''}
      </p>
    </div>
  )
}

const dp = (v) => (v == null ? '–' : Math.abs(v) >= 1000 ? num(v, 2) : Math.abs(v) >= 10 ? num(v, 3) : num(v, 5))

function Levels({ t }) {
  const lv = [
    t.sl && { k: 'SL', v: +t.sl, c: 'var(--down)' },
    { k: 'Entry', v: +t.open_price, c: 'var(--muted)' },
    { k: 'Exit', v: +t.close_price, c: t.net_pnl >= 0 ? 'var(--up)' : 'var(--down)' },
    t.tp && { k: 'TP', v: +t.tp, c: 'var(--up)' },
  ].filter(Boolean)
  const vals = lv.map((l) => l.v)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  if (!(hi > lo)) return null
  const x = (v) => 6 + ((v - lo) / (hi - lo)) * 88
  const e = x(+t.open_price), c = x(+t.close_price)
  return (
    <div className="card p-4">
      <div className="text-[11.5px] text-muted font-medium mb-7">Posisi harga</div>
      <div className="relative h-2 rounded-full bg-raised">
        <div className="absolute h-2 rounded-full" style={{ left: `${Math.min(e, c)}%`, width: `${Math.abs(c - e)}%`, background: t.net_pnl >= 0 ? 'var(--up)' : 'var(--down)', opacity: 0.55 }} />
        {lv.map((l, i) => (
          <div key={l.k} className="absolute -translate-x-1/2" style={{ left: `${x(l.v)}%`, top: -4 }}>
            <div className="w-0.5 h-4 mx-auto rounded" style={{ background: l.c }} />
            <div className={`absolute whitespace-nowrap ${i % 2 ? 'top-5' : '-top-6'} ${x(l.v) > 80 ? 'right-0 translate-x-1' : x(l.v) < 20 ? 'left-0 -translate-x-1' : 'left-1/2 -translate-x-1/2'}`}>
              <span className="text-[10.5px] font-semibold" style={{ color: l.c }}>{l.k}</span>
              <span className="num text-[10px] text-faint ml-1">{dp(l.v)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="h-6" />
    </div>
  )
}

export default function TradeDetail({ t, cur, tags = [], accountId, onClose, onPrev, onNext }) {
  if (!t) return null
  const gross = +t.profit
  const rows = [
    ['Entry', `${dp(t.open_price)}`, fmtDateTime(t.open_time)],
    ['Exit', `${dp(t.close_price)}`, fmtDateTime(t.close_time)],
    ['Durasi', duration(t.duration_sec)],
    ['Sesi', session(t.open_time)],
    ['Tren saat entry', t.trend_ctx ? `${TREND[t.trend_ctx]}${t.ctx_tf ? ` (${t.ctx_tf})` : ''}` : '–'],
    ['Lot', num(t.volume, 2)],
    ['Pips', t.pips != null ? `${t.pips > 0 ? '+' : ''}${num(t.pips, 1)}` : '–'],
    ['Stop loss', t.sl ? dp(t.sl) : 'Tidak dipasang'],
    ['Take profit', t.tp ? dp(t.tp) : '–'],
    ['Risiko', t.risk_amount ? money(t.risk_amount, cur) : '–', t.risk_amount && t.balance_before ? `${pct(t.risk_amount / t.balance_before, 2)} dari balance` : null],
    ['R-multiple', t.r_multiple != null ? `${t.r_multiple > 0 ? '+' : ''}${num(t.r_multiple, 2)}R` : '–'],
    ['Profit kotor', money(gross, cur, { sign: true })],
    ['Komisi + swap', money(+t.commission + +t.swap + +(t.fee || 0), cur, { sign: true })],
    ['Partial close', t.partial_closes ? `${t.partial_closes}×` : 'Tidak'],
    ['Tiket posisi', `#${t.position_id}`, t.magic ? `Magic ${t.magic}` : null],
  ]
  return (
    <Sheet open onClose={onClose} title={`${t.symbol} · ${t.direction.toUpperCase()}`}>
      <div className="flex items-end justify-between mb-3">
        <div>
          <Pnl v={t.net_pnl} cur={cur} className="text-3xl font-semibold" />
          <div className="text-xs text-muted mt-1">{fmtDateTime(t.close_time)}</div>
        </div>
        <div className="flex gap-1">
          <button onClick={onPrev} disabled={!onPrev} className="w-9 h-9 rounded-full border border-line text-muted disabled:opacity-30" aria-label="Trade sebelumnya">‹</button>
          <button onClick={onNext} disabled={!onNext} className="w-9 h-9 rounded-full border border-line text-muted disabled:opacity-30" aria-label="Trade berikutnya">›</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        <Badge tone={t.direction === 'buy' ? 'up' : 'down'}>{t.direction === 'buy' ? 'Buy' : 'Sell'}</Badge>
        <Badge>Dari {SOURCE_LABEL[t.source] || t.source}</Badge>
        <Badge tone={t.close_reason === 'tp' ? 'up' : t.close_reason === 'sl' || t.close_reason === 'stop_out' ? 'down' : 'muted'}>{CLOSE_LABEL[t.close_reason] || t.close_reason}</Badge>
        {tags.map((k) => <Badge key={k} tone={TAGS[k].tone}>{TAGS[k].label}</Badge>)}
      </div>
      <div className="space-y-3">
        <ChartBlock t={t} accountId={accountId} />
        <Excursion t={t} cur={cur} />
        <Levels t={t} />
      </div>
      <div className="card mt-3 divide-y divide-line">
        {rows.map(([k, v, sub]) => (
          <div key={k} className="flex items-start justify-between gap-4 px-4 py-2.5">
            <span className="text-[13px] text-muted">{k}</span>
            <span className="text-right">
              <span className="num text-[13px]">{v}</span>
              {sub && <span className="block text-[11px] text-faint">{sub}</span>}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
