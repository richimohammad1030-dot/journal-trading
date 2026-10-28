import { useMemo, useState } from 'react'
import { Badge, Card, Chips, Empty, Pnl } from '../components/ui'
import TradeRow from '../components/TradeRow'
import { DIMENSIONS } from '../lib/dna'
import { buildReport, listPeriods } from '../lib/reports'
import { money, num, pct, pnlColor } from '../lib/format'

const pad = (n) => String(n).padStart(2, '0')

function Delta({ now, before, fmt, invert }) {
  if (now == null || before == null || !isFinite(now) || !isFinite(before)) return <span className="text-faint">–</span>
  const d = now - before
  if (Math.abs(d) < 1e-9) return <span className="text-faint">sama</span>
  const good = invert ? d < 0 : d > 0
  return <span className={good ? 'text-up' : 'text-down'}>{d > 0 ? '▲' : '▼'} {fmt(Math.abs(d))}</span>
}

function MiniCalendar({ period, daily, cur }) {
  const days = []
  for (let ms = period.from; ms < period.to; ms += 864e5) days.push(new Date(ms + 7 * 3600e3))
  const lead = (days[0].getUTCDay() + 6) % 7
  const maxAbs = Math.max(1, ...[...daily.values()].map(Math.abs))
  return (
    <div className="grid grid-cols-7 gap-1">
      {['S', 'S', 'R', 'K', 'J', 'S', 'M'].map((d, i) => <div key={i} className="text-center text-[10px] text-faint">{d}</div>)}
      {Array.from({ length: lead }, (_, i) => <div key={'l' + i} />)}
      {days.map((d) => {
        const k = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, v = daily.get(k)
        const a = v == null ? 0 : 15 + 55 * Math.min(1, Math.abs(v) / maxAbs)
        return (
          <div key={k} title={v != null ? money(v, cur, { sign: true }) : ''} className="aspect-square rounded-md text-[10px] p-1 flex items-start justify-start"
            style={{ background: v == null ? 'var(--raised)' : `color-mix(in oklab, ${v >= 0 ? 'var(--up)' : 'var(--down)'} ${a}%, transparent)` }}>
            <span className={v == null ? 'text-faint' : 'text-ink'}>{d.getUTCDate()}</span>
          </div>
        )
      })}
    </div>
  )
}

function ReportView({ r, cur, tags, openTrade, onBack }) {
  const { s, ps, pm, ppm } = r
  const kindWord = r.period.kind === 'week' ? 'minggu' : 'bulan'
  const rows = [
    ['Profit bersih', s.net, ps.net, (v) => money(v, cur, { sign: true }), (v) => money(v, cur)],
    ['Gain', pm.gain, ppm.gain, (v) => pct(v, 2, true), (v) => pct(v, 2)],
    ['Win rate', s.winRate, ps.winRate, (v) => pct(v, 1), (v) => pct(v, 1)],
    ['Profit factor', s.profitFactor, ps.profitFactor, (v) => (v === Infinity ? '∞' : num(v, 2)), (v) => num(v, 2)],
    ['Max drawdown', -pm.maxDD, -ppm.maxDD, (v) => pct(-v, 1), (v) => pct(v, 1), true],
    ['Jumlah trade', s.n, ps.n, (v) => String(v), (v) => String(v)],
  ]
  return (
    <div className="space-y-4 report">
      <div className="flex items-center justify-between gap-3 no-print">
        <button onClick={onBack} className="text-[13px] text-muted">‹ Semua rapor</button>
        <button onClick={() => window.print()} className="rounded-xl bg-accent text-bg font-semibold text-[13px] px-4 py-2">Simpan PDF</button>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span>Rapor {r.period.kind === 'week' ? 'mingguan' : 'bulanan'}</span>
          {r.running && <Badge tone="warn">Periode masih berjalan</Badge>}
        </div>
        <h2 className="text-[22px] font-semibold mt-1">{r.period.label}</h2>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Pnl v={s.net} cur={cur} className="text-[30px] font-semibold" />
          <span className="text-[13px] text-muted">{s.n} trade · win {pct(s.winRate, 0)} · gain <span className={`num ${pnlColor(pm.gain)}`}>{pct(pm.gain, 2, true)}</span></span>
        </div>
        {(r.deposits > 0 || r.withdrawals < 0) && (
          <div className="text-[12px] text-warn mt-1">{r.deposits > 0 && `Deposit ${money(r.deposits, cur)} `}{r.withdrawals < 0 && `Withdrawal ${money(-r.withdrawals, cur)}`} (tidak dihitung sebagai profit)</div>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title={`Dibanding ${kindWord} sebelumnya`}>
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 text-[13px]">
            <span className="text-[11px] text-faint pb-2 border-b border-line">Metrik</span>
            <span className="text-[11px] text-faint pb-2 border-b border-line text-right">{r.period.short}</span>
            <span className="text-[11px] text-faint pb-2 border-b border-line text-right">Perubahan</span>
            {rows.map(([k, a, b, f, fd, inv]) => [
              <span key={k + '1'} className="py-2 border-b border-line text-muted">{k}</span>,
              <span key={k + '2'} className="py-2 border-b border-line text-right num">{a == null ? '–' : f(a)}</span>,
              <span key={k + '3'} className="py-2 border-b border-line text-right num text-[12px]"><Delta now={a} before={ps.n ? b : null} fmt={fd} invert={inv} /></span>,
            ])}
          </div>
          {!ps.n && <p className="text-[11.5px] text-faint mt-2">Tidak ada trade di {kindWord} sebelumnya.</p>}
        </Card>

        <Card title="Temuan pola">
          {r.findings.length === 0 ? <div className="text-sm text-muted">Belum cukup trade untuk menemukan pola.</div> : (
            <ul className="space-y-2.5">
              {r.findings.map((f, i) => (
                <li key={i} className="flex gap-2.5 text-[13px]">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: `var(--${f.tone})` }} />{f.text}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 pt-3 border-t border-line">
            <div className="text-[11.5px] text-muted font-medium mb-2">Pelanggaran aturan</div>
            <div className="flex flex-wrap gap-1.5">
              {r.violations.map((v) => <Badge key={v.k} tone={v.n ? 'down' : 'muted'}>{v.label} {v.n}×</Badge>)}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Trader DNA (kumulatif)">
          {!r.dnaNow ? <div className="text-sm text-muted">Skor muncul setelah total 30 trade.</div> : (
            <>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-[22px] font-semibold">Grade {r.dnaNow.grade}</span>
                <span className="num text-muted">{r.dnaNow.overall}/100</span>
                {r.dnaPrev && <span className="num text-[12px]"><Delta now={r.dnaNow.overall} before={r.dnaPrev.overall} fmt={(v) => `${v} poin`} /></span>}
              </div>
              <div className="space-y-1.5">
                {DIMENSIONS.map(([k, name]) => (
                  <div key={k} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-muted">{name}</span>
                    <span className="num">{r.dnaNow.scores[k]} {r.dnaPrev && <span className="text-[11.5px] ml-1"><Delta now={r.dnaNow.scores[k]} before={r.dnaPrev.scores[k]} fmt={(v) => String(v)} /></span>}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
        <Card title="Kalender">
          <MiniCalendar period={r.period} daily={r.daily} cur={cur} />
        </Card>
      </div>

      {s.n > 0 && (
        <Card title="Trade terbaik & terburuk" pad={false}>
          <div className="divide-y divide-line">
            <TradeRow t={s.best} cur={cur} tags={tags.get(s.best.position_id)} onOpen={(t) => openTrade(t, r.trades)} />
            {s.worst.position_id !== s.best.position_id && <TradeRow t={s.worst} cur={cur} tags={tags.get(s.worst.position_id)} onOpen={(t) => openTrade(t, r.trades)} />}
          </div>
        </Card>
      )}
      <p className="text-[11px] text-faint">Dibuat otomatis dari riwayat MT5 · waktu WIB · Jurnal Trading</p>
    </div>
  )
}

export default function ReportsPage({ ctx }) {
  const { accountTrades: allTrades, cashflows, curve, tags, account, openTrade } = ctx
  const [kind, setKind] = useState('week')
  const [sel, setSel] = useState(null)
  const list = useMemo(() => listPeriods(allTrades, kind), [allTrades, kind])
  const report = useMemo(() => sel && buildReport({ allTrades, cashflows, curve, tags, period: sel, cur: account.currency }), [sel, allTrades, cashflows, curve, tags, account.currency])
  if (report) return <ReportView r={report} cur={account.currency} tags={tags} openTrade={openTrade} onBack={() => setSel(null)} />
  return (
    <div className="space-y-3">
      <Chips value={kind} onChange={setKind} options={[['week', 'Mingguan'], ['month', 'Bulanan']]} />
      <Card pad={false}>
        {list.length === 0 ? <Empty title="Belum ada rapor">Rapor muncul setelah ada trade yang tersinkron.</Empty> : (
          <div className="divide-y divide-line">
            {list.map((p) => (
              <button key={p.key} onClick={() => setSel(p)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-raised/60">
                <span className="min-w-0">
                  <span className="font-semibold text-[14.5px] flex items-center gap-2">{p.label}{p.running && <Badge tone="warn">berjalan</Badge>}</span>
                  <span className="block text-[11.5px] text-faint">{p.n} trade · win {pct(p.wins / p.n, 0)}</span>
                </span>
                <Pnl v={p.net} cur={account.currency} className="font-semibold" />
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
