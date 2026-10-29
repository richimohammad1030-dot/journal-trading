import { useMemo, useState } from 'react'
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtDate, money, pct } from '../lib/format'
import { I, Icon } from './icons'

const axis = { fontSize: 11, fill: 'var(--faint)', fontFamily: 'var(--font-mono)' }
const RANGES = [['1M', 30], ['3M', 91], ['6M', 182], ['1Y', 365], ['All', 0]]
const MODES = [['bal', 'Balance'], ['pnl', 'P&L kumulatif'], ['dd', 'Drawdown']]

function Tip({ active, payload, mode, cur }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="card px-3 py-2 text-xs shadow-2xl border-accent/40">
      <div className="text-muted mb-1">{fmtDate(new Date(p.ts).toISOString(), { year: 'numeric' })}</div>
      <div className="num font-semibold text-[13px]">{mode === 'dd' ? pct(p.v, 2) : money(p.v, cur, { sign: mode === 'pnl' })}</div>
      {p.trade && <div className="text-faint mt-0.5">{p.trade.symbol} <span className={p.trade.net_pnl >= 0 ? 'text-up' : 'text-down'}>{money(+p.trade.net_pnl, cur, { sign: true })}</span></div>}
      {p.cash ? <div className="text-warn mt-0.5">{p.cash > 0 ? 'Deposit' : 'Withdrawal'} {money(Math.abs(p.cash), cur)}</div> : null}
    </div>
  )
}

/** Kurva ekuitas dashboard: balance akun, P&L kumulatif (ikut filter pasar), atau drawdown. */
export default function DashEquity({ curve, trades, cur, marketFiltered }) {
  const [mode, setMode] = useState(marketFiltered ? 'pnl' : 'bal')
  const [range, setRange] = useState('All')
  const m = marketFiltered && mode === 'bal' ? 'pnl' : mode

  const points = useMemo(() => {
    const days = RANGES.find((r) => r[0] === range)[1]
    const from = days ? Date.now() - days * 864e5 : -Infinity
    if (m === 'pnl') {
      let acc = 0
      const pts = trades.map((t) => ({ ts: +new Date(t.close_time), trade: t, cum: (acc += +t.net_pnl) }))
      const base = pts.filter((p) => p.ts < from).at(-1)?.cum ?? 0
      return pts.filter((p) => p.ts >= from).map((p) => ({ ts: p.ts, v: p.cum - base, trade: p.trade }))
    }
    const inR = curve.filter((p) => p.ts >= from)
    if (m === 'bal') return inR.map((p) => ({ ts: p.ts, v: p.balance, cash: p.cash }))
    let peak = -Infinity
    return inR.map((p) => { peak = Math.max(peak, p.idx); return { ts: p.ts, v: p.idx / peak - 1 } })
  }, [curve, trades, m, range])

  const last = points.at(-1)
  // tick sumbu-x eksplisit (6 titik rata) agar label tidak bertumpuk bila ada waktu yang sama
  const xTicks = points.length > 1 ? Array.from({ length: 6 }, (_, i) => points[0].ts + ((points.at(-1).ts - points[0].ts) * i) / 5) : undefined
  const first = points[0]
  const up = m === 'dd' ? false : (last?.v ?? 0) >= (m === 'pnl' ? 0 : first?.v ?? 0)
  const color = m === 'dd' ? 'var(--down)' : up ? 'var(--up)' : 'var(--down)'
  const change = m === 'bal' && first && last ? last.v - first.v : null
  const fmtY = (v) => (m === 'dd' ? pct(v, 0) : money(v, cur, { compact: true }))

  return (
    <section className="card p-5 h-full flex flex-col fade-up">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="icon-tile"><Icon d={I.chart} className="w-4 h-4" /></span>
        <div className="mr-auto">
          <h2 className="font-semibold text-[16px] leading-tight">Kurva Ekuitas</h2>
          {last && <div className="text-[12px] text-muted">
            {m === 'dd' ? <>Drawdown saat ini <span className="num text-down">{pct(last.v, 2)}</span></>
              : <>Sekarang <span className="num text-ink">{money(last.v, cur, { sign: m === 'pnl' })}</span>
                {change != null && <span className={`num ml-1.5 ${change >= 0 ? 'text-up' : 'text-down'}`}>({money(change, cur, { sign: true })} di rentang ini)</span>}</>}
          </div>}
        </div>
        <div className="seg">
          {MODES.filter(([id]) => !(marketFiltered && id === 'bal')).map(([id, l]) => <button key={id} data-on={m === id} onClick={() => setMode(id)}>{l}</button>)}
        </div>
        <div className="seg">
          {RANGES.map(([id]) => <button key={id} data-on={range === id} onClick={() => setRange(id)}>{id === 'All' ? 'Semua' : id}</button>)}
        </div>
      </div>
      {points.length < 2 ? (
        <div className="flex-1 min-h-56 grid place-items-center text-sm text-muted">Belum cukup data di rentang ini.</div>
      ) : (
        <div className="flex-1 min-h-[260px] -mx-1">
          <ResponsiveContainer>
            <AreaChart data={points} margin={{ top: 28, right: 36, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="dash-eq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.42} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time" ticks={xTicks} interval={0} tick={axis} tickLine={false} axisLine={false} minTickGap={50} tickFormatter={(v) => fmtDate(new Date(v).toISOString())} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={60} tickFormatter={fmtY} domain={m === 'dd' ? ['dataMin', 0] : ['auto', 'auto']} />
              <Tooltip content={<Tip mode={m} cur={cur} />} cursor={{ stroke: color, strokeDasharray: '3 4', strokeOpacity: 0.6 }} />
              {m !== 'bal' && <ReferenceLine y={0} stroke="var(--line)" />}
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2.2} fill="url(#dash-eq)" dot={false}
                activeDot={{ r: 5, fill: color, stroke: 'var(--bg)', strokeWidth: 2 }} isAnimationActive={false} />
              {last && <ReferenceDot x={last.ts} y={last.v} r={5} fill={color} stroke="var(--bg)" strokeWidth={2}
                label={{ position: 'top', offset: 12, value: m === 'dd' ? pct(last.v, 1) : money(last.v, cur, { compact: true, sign: m === 'pnl' }), fill: 'var(--ink)', fontSize: 11.5, fontFamily: 'var(--font-mono)' }} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
