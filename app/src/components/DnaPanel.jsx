import { useMemo } from 'react'
import { Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import { DIMENSIONS, MIN_TRADES, dnaByMonth, label } from '../lib/dna'
import { Card, Empty } from './ui'

const NAME = Object.fromEntries(DIMENSIONS)
const SHORT = { consistency: 'Konsistensi', profitability: 'Profit', risk: 'Risiko', discipline: 'Disiplin', resilience: 'Ketahanan' }
const TONE = { up: 'var(--up)', warn: 'var(--warn)', down: 'var(--down)' }
const GRADE_TONE = { A: 'up', B: 'up', C: 'warn', D: 'down', E: 'down' }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const axis = { fontSize: 10.5, fill: 'var(--faint)', fontFamily: 'var(--font-mono)' }

export function GradeBadge({ dna, size = 'md' }) {
  const tone = TONE[GRADE_TONE[dna.grade]]
  const big = size === 'lg'
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-xl border px-3 ${big ? 'py-1.5' : 'py-1'}`} style={{ borderColor: `color-mix(in oklab, ${tone} 40%, transparent)`, background: `color-mix(in oklab, ${tone} 10%, transparent)` }}>
      <span className={`font-semibold ${big ? 'text-[22px]' : 'text-[15px]'}`} style={{ color: tone }}>Grade {dna.grade}</span>
      <span className="num text-[12px] text-muted">{dna.overall}/100</span>
    </span>
  )
}

function ScoreBar({ k, v }) {
  const [, tone] = label(v)
  return (
    <div>
      <div className="flex justify-between text-[12.5px] mb-1"><span className="text-muted">{NAME[k]}</span><span className="num font-semibold">{v}</span></div>
      <div className="h-2 rounded-full bg-raised overflow-hidden"><div className="h-full rounded-full" style={{ width: `${v}%`, background: TONE[tone] }} /></div>
    </div>
  )
}

export default function DnaPanel({ trades, tags, dna }) {
  const trend = useMemo(() => dnaByMonth(trades, tags), [trades, tags])
  if (!dna) {
    return (
      <Card>
        <Empty title="Data belum cukup untuk Trader DNA">
          Skor dihitung setelah ada minimal {MIN_TRADES} trade di periode ini (sekarang {trades.length}). Pilih periode yang lebih panjang, misalnya "Semua".
        </Empty>
      </Card>
    )
  }
  const radar = DIMENSIONS.map(([k]) => ({ dim: SHORT[k], v: dna.scores[k] }))
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="font-semibold text-[16px]">Trader DNA</h2>
            <p className="text-[12.5px] text-muted">Rapor karakter trading dari {dna.metrics.n} trade di periode ini.</p>
          </div>
          <GradeBadge dna={dna} size="lg" />
        </div>
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-center">
          <div className="h-64 -mx-2">
            <ResponsiveContainer>
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="var(--line)" />
                <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="v" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.18} isAnimationActive={false} dot={{ r: 2.5, fill: 'var(--accent)' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {DIMENSIONS.map(([k]) => <ScoreBar key={k} k={k} v={dna.scores[k]} />)}
          </div>
        </div>
        <p className="text-[13px] mt-4 pt-3 border-t border-line">
          <b>Baca cepat:</b> terkuat di <b>{NAME[dna.strongest]}</b> ({dna.scores[dna.strongest]}), paling perlu ditingkatkan di <b>{NAME[dna.weakest]}</b> ({dna.scores[dna.weakest]}). Grade {dna.grade} = rata-rata {dna.overall}/100 dari lima dimensi.
        </p>
      </Card>

      <div className="space-y-2.5">
        <h3 className="text-[13px] font-semibold tracking-wide text-muted uppercase px-1">Rincian skor & cara meningkatkan</h3>
        {DIMENSIONS.map(([k]) => {
          const v = dna.scores[k], [lbl, tone] = label(v), d = dna.details[k]
          return (
            <div key={k} className="card p-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-semibold">{NAME[k]}</span>
                <span className="num text-[11.5px] font-semibold px-2 py-0.5 rounded-full" style={{ color: TONE[tone], background: `color-mix(in oklab, ${TONE[tone]} 12%, transparent)` }}>{v}/100 · {lbl}</span>
              </div>
              <div className="text-[11.5px] text-faint mb-2">{d.facts.join(' · ')}</div>
              <p className="text-[12.5px] text-muted mb-2">{d.what}</p>
              <p className="text-[13px]"><span className="font-semibold" style={{ color: TONE[tone] }}>{v >= 70 ? "Pertahankan: " : "Cara tingkatkan: "}</span>{d.tip}</p>
            </div>
          )
        })}
      </div>

      {trend.length >= 2 && (
        <Card title="Tren skor per bulan">
          <div className="h-48 -mx-1">
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 8, right: 22, bottom: 0, left: -8 }}>
                <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} tickFormatter={(m) => `${MON[+m.slice(5) - 1]} ${m.slice(2, 4)}`} />
                <YAxis domain={[0, 100]} ticks={[0, 30, 50, 65, 80, 100]} tick={axis} tickLine={false} axisLine={false} width={36} />
                <ReferenceLine y={65} stroke="var(--line)" strokeDasharray="3 3" />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 12 }} labelFormatter={(m) => `${MON[+m.slice(5) - 1]} ${m.slice(0, 4)}`} formatter={(v) => [`${v}/100`, 'Skor']} />
                <Line type="monotone" dataKey="overall" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11.5px] text-faint mt-2">Hanya bulan dengan minimal 15 trade. Garis putus-putus = batas grade B (65).</p>
        </Card>
      )}
    </div>
  )
}
