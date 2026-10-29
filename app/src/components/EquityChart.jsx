import { useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import { fmtDate, money, pct } from '../lib/format'
import { Chips } from './ui'

const axis = { fontSize: 10.5, fill: 'var(--faint)', fontFamily: 'var(--font-mono)' }

function Tip({ active, payload, mode, cur }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="card px-3 py-2 text-xs shadow-xl">
      <div className="text-muted mb-1">{fmtDate(p.t, { year: 'numeric' })}</div>
      <div className="num font-semibold">{mode === 'bal' ? money(p.balance, cur) : pct(p.rel, 2, true)}</div>
      <div className="num text-down">DD {pct(p.ddRel, 1)}</div>
      {p.cash !== 0 && cur && <div className="text-warn mt-0.5">{p.cash > 0 ? 'Deposit' : 'Withdrawal'} {money(Math.abs(p.cash), cur)}</div>}
    </div>
  )
}

export default function EquityChart({ points, cur, relOnly = false }) {
  const [mode, setMode] = useState(relOnly ? 'rel' : 'bal')
  if (points.length < 2) return <div className="h-48 grid place-items-center text-sm text-muted">Belum cukup data untuk kurva.</div>
  const key = mode === 'bal' ? 'balance' : 'rel'
  const up = (points.at(-1)?.rel ?? 0) >= 0
  const color = up ? 'var(--up)' : 'var(--down)'
  const fmtY = (v) => (mode === 'bal' ? money(v, cur, { compact: true }) : pct(v, 0))
  const deposits = points.filter((p) => p.cash !== 0)
  const xTicks = Array.from({ length: 5 }, (_, i) => points[0].ts + ((points.at(-1).ts - points[0].ts) * i) / 4)
  return (
    <div>
      {!relOnly && <Chips className="mb-3" value={mode} onChange={setMode} options={[['bal', 'Balance'], ['rel', 'Pertumbuhan %']]} />}
      <div className="h-52 -mx-1">
        <ResponsiveContainer>
          <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time" ticks={xTicks} interval={0} tick={axis} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(v) => fmtDate(new Date(v).toISOString())} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={fmtY} domain={['auto', 'auto']} />
            <Tooltip content={<Tip mode={mode} cur={cur} />} cursor={{ stroke: 'var(--line)' }} />
            {mode === 'rel' && <ReferenceLine y={0} stroke="var(--line)" />}
            {mode === 'bal' && deposits.map((d) => <ReferenceLine key={d.ts} x={d.ts} stroke="var(--warn)" strokeDasharray="2 3" strokeOpacity={0.6} />)}
            <Area type="monotone" dataKey={key} stroke={color} strokeWidth={2} fill="url(#eqfill)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between mt-3 mb-1">
        <span className="text-[11px] text-muted font-medium">Drawdown dari puncak</span>
        {mode === 'bal' && deposits.length > 0 && <span className="text-[11px] text-warn">┊ deposit / withdrawal</span>}
      </div>
      <div className="h-16 -mx-1">
        <ResponsiveContainer>
          <AreaChart data={points} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time" hide />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => pct(v, 0)} domain={['dataMin', 0]} />
            <Tooltip content={<Tip mode={mode} cur={cur} />} cursor={{ stroke: 'var(--line)' }} />
            <Area type="monotone" dataKey="ddRel" stroke="var(--down)" strokeWidth={1.25} fill="var(--down)" fillOpacity={0.18} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
