import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, Empty } from './ui'
import { num, pct } from '../lib/format'

const axis = { fontSize: 10.5, fill: 'var(--faint)', fontFamily: 'var(--font-mono)' }
const q = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }

function Tip({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="card px-3 py-2 text-xs">
      <div className="font-semibold">{p.t.symbol} <span className="text-muted uppercase">{p.t.direction}</span></div>
      <div className="num text-muted">x {num(p.x, unit === 'R' ? 2 : 1)}{unit} · hasil {num(p.y, unit === 'R' ? 2 : 1)}{unit}</div>
      <div className="text-faint">ketuk untuk detail</div>
    </div>
  )
}

function Plot({ data, xLabel, unit, onOpen }) {
  const wins = data.filter((d) => d.y > 0), losses = data.filter((d) => d.y <= 0)
  return (
    <div className="h-60 -mx-1">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 10, bottom: 18, left: -6 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="0" />
          <XAxis type="number" dataKey="x" domain={[0, 'auto']} tickCount={6} tick={axis} tickLine={false} axisLine={false} label={{ value: xLabel, position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--muted)' }} />
          <YAxis type="number" dataKey="y" tick={axis} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} tickCount={6} allowDecimals />
          <ReferenceLine y={0} stroke="var(--muted)" strokeOpacity={0.6} />
          <Tooltip content={<Tip unit={unit} />} cursor={{ stroke: 'var(--line)' }} />
          <Scatter data={wins} fill="var(--up)" fillOpacity={0.7} isAnimationActive={false} onClick={(d) => onOpen((d.payload || d).t)} />
          <Scatter data={losses} fill="var(--down)" fillOpacity={0.7} isAnimationActive={false} onClick={(d) => onOpen((d.payload || d).t)} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function ExecPanel({ trades, openTrade }) {
  const withX = trades.filter((t) => t.mae_pips != null && t.mfe_pips != null)
  if (withX.length < 5) {
    return <Card><Empty title="Belum ada data MAE/MFE">Data ini muncul setelah sync agent Tahap 2 mengambil harga untuk minimal 5 trade.</Empty></Card>
  }
  const useR = withX.filter((t) => t.mae_r != null).length >= withX.length * 0.6
  const base = useR ? withX.filter((t) => t.mae_r != null && t.r_multiple != null) : withX
  const unit = useR ? 'R' : ' pip'
  const res = (t) => (useR ? +t.r_multiple : +t.pips)
  const maeData = base.map((t) => ({ x: useR ? +t.mae_r : +t.mae_pips, y: res(t), t }))
  const mfeData = base.map((t) => ({ x: useR ? +t.mfe_r : +t.mfe_pips, y: res(t), t }))

  const winners = base.filter((t) => t.net_pnl > 0)
  const losers = base.filter((t) => t.net_pnl < 0)
  const maeWin90 = q(winners.map((t) => (useR ? +t.mae_r : +t.mae_pips)), 0.9)
  const effMed = q(winners.filter((t) => t.exit_efficiency != null).map((t) => +t.exit_efficiency), 0.5)
  const gaveBack = losers.filter((t) => (useR ? +t.mfe_r >= 1 : +t.mfe_pips >= Math.abs(+t.pips))).length
  const leftOnTable = winners.filter((t) => (useR ? +t.mfe_r - +t.r_multiple >= 1 : t.exit_efficiency != null && t.exit_efficiency < 0.5)).length

  const insights = [
    maeWin90 != null && `90% trade menang tidak pernah melawan lebih dari ${num(maeWin90, useR ? 2 : 1)}${unit}. Trade yang melawan lebih jauh dari itu jarang berakhir untung.`,
    effMed != null && `Rata-rata (median) trade menang mengambil ${pct(effMed, 0)} dari pergerakan terbaiknya.`,
    leftOnTable > 0 && `${leftOnTable} trade menang meninggalkan ${useR ? '≥ 1R' : 'lebih dari separuh pergerakan'} di atas meja.`,
    gaveBack > 0 && `${gaveBack} trade rugi sempat untung ${useR ? '≥ 1R' : 'sebesar ruginya'} sebelum berbalik.`,
  ].filter(Boolean)

  return (
    <div className="space-y-4">
      <Card title="Temuan dari data eksekusi">
        <ul className="space-y-2">
          {insights.map((s, i) => <li key={i} className="flex gap-2.5 text-[13px]"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />{s}</li>)}
        </ul>
        <p className="text-[11.5px] text-faint mt-3">Dihitung dari {base.length} trade dengan data harga. Satuan {useR ? 'R (kelipatan risiko)' : 'pip'}.</p>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={`MAE vs hasil (${unit.trim()})`}>
          <Plot data={maeData} xLabel={`MAE, terjauh melawan (${unit.trim()})`} unit={unit} onOpen={openTrade} />
          <p className="text-[11.5px] text-faint mt-1">Titik hijau di kiri = trade menang yang hampir tidak pernah minus. Titik merah jauh di kanan = rugi yang dibiarkan berjalan.</p>
        </Card>
        <Card title={`MFE vs hasil (${unit.trim()})`}>
          <Plot data={mfeData} xLabel={`MFE, terjauh mendukung (${unit.trim()})`} unit={unit} onOpen={openTrade} />
          <p className="text-[11.5px] text-faint mt-1">Titik jauh di kanan tapi rendah = harga sempat jauh menguntungkan, tetapi exit mengambil sedikit atau malah rugi.</p>
        </Card>
      </div>
    </div>
  )
}
