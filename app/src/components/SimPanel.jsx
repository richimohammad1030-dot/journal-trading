import { useMemo, useState } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DEFAULT_RULES, simulate } from '../lib/sim'
import { SESSIONS, TAGS } from '../lib/stats'
import { fmtDate, money, num, pct, pnlColor } from '../lib/format'
import { Card } from './ui'

const axis = { fontSize: 10.5, fill: 'var(--faint)', fontFamily: 'var(--font-mono)' }

function Toggle({ id, on, onChange, children, hint }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 py-2.5 cursor-pointer">
      <input id={id} type="checkbox" className="peer sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className={`mt-0.5 w-9 h-5 rounded-full shrink-0 relative transition ${on ? 'bg-accent' : 'bg-line'} peer-focus-visible:ring-2 peer-focus-visible:ring-ink`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-bg transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className="min-w-0"><span className="text-[13.5px] block">{children}</span>{hint && <span className="text-[11.5px] text-faint block">{hint}</span>}</span>
    </label>
  )
}

function Stepper({ id, label, value, onChange, options, fmt }) {
  return (
    <div className="flex items-center justify-between py-2.5 gap-3">
      <label htmlFor={id} className="text-[13.5px]">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(+e.target.value)} className="bg-raised border border-line rounded-lg px-2.5 py-1.5 text-[13px]">
        {options.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}
      </select>
    </div>
  )
}

const pickToggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export default function SimPanel({ trades, tags, startBal, cashflows, cur }) {
  const [r, setR] = useState(DEFAULT_RULES)
  const set = (k) => (v) => setR((x) => ({ ...x, [k]: v }))
  const symbols = useMemo(() => [...new Set(trades.map((t) => t.symbol))].sort(), [trades])
  const base = useMemo(() => simulate(trades, tags, {}, startBal, cashflows), [trades, tags, startBal, cashflows])
  const sim = useMemo(() => simulate(trades, tags, r, startBal, cashflows), [trades, tags, r, startBal, cashflows])
  const changed = JSON.stringify(r) !== JSON.stringify(DEFAULT_RULES)

  // gabungkan dua kurva pada sumbu waktu yang sama
  const series = useMemo(() => {
    const m = new Map()
    for (const p of base.points) m.set(p.ts, { ts: p.ts, base: p.idx - 1 })
    for (const p of sim.points) m.set(p.ts, { ...(m.get(p.ts) || { ts: p.ts }), sim: p.idx - 1 })
    const rows = [...m.values()].sort((a, b) => a.ts - b.ts)
    let lb = 0, ls = 0
    return rows.map((x) => { lb = x.base ?? lb; ls = x.sim ?? ls; return { ts: x.ts, base: lb, sim: ls } })
  }, [base, sim])

  const rows = [
    ['Jumlah trade', base.n, sim.n, (v) => v],
    ['Profit bersih', base.net, sim.net, (v) => money(v, cur, { sign: true }), true],
    ['Gain', base.gain, sim.gain, (v) => pct(v, 1, true), true],
    ['Win rate', base.winRate, sim.winRate, (v) => pct(v, 1)],
    ['Profit factor', base.profitFactor, sim.profitFactor, (v) => (v === Infinity ? '∞' : num(v, 2))],
    ['Max drawdown', -base.maxDD, -sim.maxDD, (v) => pct(-v, 1)],
  ]
  const delta = sim.net - base.net

  return (
    <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
      <Card title="Aturan simulasi" action={changed && <button onClick={() => setR(DEFAULT_RULES)} className="text-[12px] text-accent font-semibold">Reset</button>}>
        <div className="divide-y divide-line -my-1">
          <Toggle id="sim-nosl" on={r.dropNoSl} onChange={set('dropNoSl')} hint="Seolah kamu tidak pernah entry tanpa stop loss">Buang trade tanpa SL</Toggle>
          <Toggle id="sim-mart" on={r.dropTags.includes('martingale')} onChange={() => set('dropTags')(pickToggle(r.dropTags, 'martingale'))}>Buang trade {TAGS.martingale.label.toLowerCase()}</Toggle>
          <Toggle id="sim-rev" on={r.dropTags.includes('revenge')} onChange={() => set('dropTags')(pickToggle(r.dropTags, 'revenge'))}>Buang {TAGS.revenge.label.toLowerCase()}</Toggle>
          <Toggle id="sim-ct" on={r.dropTags.includes('counter_trend')} onChange={() => set('dropTags')(pickToggle(r.dropTags, 'counter_trend'))}>Buang trade melawan tren</Toggle>
          <Stepper id="sim-max" label="Maksimal trade per hari" value={r.maxPerDay} onChange={set('maxPerDay')} options={[0, 1, 2, 3, 4, 5, 8]} fmt={(v) => (v ? `${v} trade` : 'Tanpa batas')} />
          <Stepper id="sim-stop" label="Berhenti setelah rugi beruntun" value={r.stopAfterLosses} onChange={set('stopAfterLosses')} options={[0, 1, 2, 3, 4]} fmt={(v) => (v ? `${v}× rugi` : 'Tidak')} />
          <Stepper id="sim-risk" label="Risiko tetap per trade" value={r.fixedRiskPct} onChange={set('fixedRiskPct')} options={[0, 0.5, 1, 2, 3]} fmt={(v) => (v ? `${v}% (trade ber-SL)` : 'Seperti asli')} />
          <div className="py-2.5">
            <div className="text-[13.5px] mb-2">Hanya sesi</div>
            <div className="flex flex-wrap gap-1.5">{SESSIONS.map((s) => <button key={s} className="chip" data-on={r.sessions.includes(s)} onClick={() => set('sessions')(pickToggle(r.sessions, s))}>{s}</button>)}</div>
          </div>
          <div className="py-2.5">
            <div className="text-[13.5px] mb-2">Hanya pair</div>
            <div className="flex flex-wrap gap-1.5">{symbols.map((s) => <button key={s} className="chip" data-on={r.symbols.includes(s)} onClick={() => set('symbols')(pickToggle(r.symbols, s))}>{s}</button>)}</div>
          </div>
        </div>
      </Card>

      <div className="space-y-4 min-w-0">
        <Card>
          <div className="text-[12.5px] text-muted">{changed ? 'Dengan aturan ini, hasil periode yang sama menjadi' : 'Pilih aturan di samping untuk melihat dampaknya pada hasil periode ini.'}</div>
          {changed && <div className={`num text-[26px] font-semibold mt-1 ${pnlColor(delta)}`}>{money(delta, cur, { sign: true })} <span className="text-[13px] text-muted font-normal">dibanding asli</span></div>}
          <div className="mt-4 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 text-[13px]">
            <span className="text-[11px] text-faint pb-2 border-b border-line">Metrik</span>
            <span className="text-[11px] text-faint pb-2 border-b border-line text-right">Asli</span>
            <span className="text-[11px] text-faint pb-2 border-b border-line text-right">Simulasi</span>
            {rows.map(([k, a, b, f, money_]) => [
              <span key={k + 'k'} className="py-2 border-b border-line text-muted">{k}</span>,
              <span key={k + 'a'} className={`py-2 border-b border-line text-right num ${money_ ? pnlColor(a) : ''}`}>{f(a)}</span>,
              <span key={k + 'b'} className={`py-2 border-b border-line text-right num font-semibold ${money_ ? pnlColor(b) : ''}`}>{f(b)}</span>,
            ])}
          </div>
        </Card>
        <Card title="Pertumbuhan: asli vs simulasi">
          {series.length < 2 ? <div className="text-sm text-muted">Belum cukup trade untuk kurva.</div> : (
            <div className="h-56 -mx-1">
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -4 }}>
                  <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tick={axis} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(v) => fmtDate(new Date(v).toISOString())} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={46} tickFormatter={(v) => pct(v, 0)} />
                  <ReferenceLine y={0} stroke="var(--line)" />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 12 }} labelFormatter={(v) => fmtDate(new Date(v).toISOString(), { year: 'numeric' })} formatter={(v, n) => [pct(v, 1, true), n === 'base' ? 'Asli' : 'Simulasi']} />
                  <Line type="monotone" dataKey="base" stroke="var(--muted)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="sim" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex gap-4 text-[11.5px] mt-2"><span className="text-muted">━ Asli</span><span className="text-accent">━ Simulasi</span></div>
          <p className="text-[11.5px] text-faint mt-2">Simulasi memakai trade yang sama dengan aturan berbeda. Ini tidak memperhitungkan trade lain yang mungkin kamu ambil bila aturannya benar-benar dipakai.</p>
        </Card>
      </div>
    </div>
  )
}
