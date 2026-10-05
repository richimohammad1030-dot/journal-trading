import { useMemo, useState } from 'react'
import { Card, Chips, Empty } from '../components/ui'
import DnaPanel from '../components/DnaPanel'
import ExecPanel from '../components/ExecPanel'
import SimPanel from '../components/SimPanel'
import { DAYS, SESSIONS, SOURCE_LABEL, TAGS, breakdown, session, summarize } from '../lib/stats'
import { money, num, pct, pnlColor } from '../lib/format'

const wibDay = (iso) => new Date(+new Date(iso) + 7 * 3600e3).getUTCDay()
const wibHour = (iso) => new Date(+new Date(iso) + 7 * 3600e3).getUTCHours()
const GROUPS = {
  pair: { label: 'Pair', fn: (t) => t.symbol },
  session: { label: 'Sesi', fn: (t) => session(t.open_time), order: SESSIONS },
  day: { label: 'Hari', fn: (t) => DAYS[wibDay(t.open_time)], order: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] },
  source: { label: 'Sumber', fn: (t) => SOURCE_LABEL[t.source] || t.source },
  dir: { label: 'Arah', fn: (t) => (t.direction === 'buy' ? 'Buy' : 'Sell'), order: ['Buy', 'Sell'] },
}

function Breakdown({ trades, cur }) {
  const [g, setG] = useState('pair')
  const rows = useMemo(() => breakdown(trades, GROUPS[g].fn, GROUPS[g].order), [trades, g])
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.net)))
  return (
    <Card title="Performa per kelompok">
      <Chips className="mb-3" value={g} onChange={setG} options={Object.entries(GROUPS).map(([k, v]) => [k, v.label])} />
      <div className="grid grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1.6fr)] gap-x-2 text-[11px] text-faint font-medium pb-2 border-b border-line">
        <span>{GROUPS[g].label}</span><span className="text-right">Trade</span><span className="text-right">Win</span><span className="text-right">PF</span><span className="text-right">Profit bersih</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1.6fr)] gap-x-2 items-center py-2.5 border-b border-line last:border-0 text-[13px]">
          <span className="font-semibold truncate">{r.key}</span>
          <span className="num text-right text-muted">{r.n}</span>
          <span className="num text-right">{pct(r.winRate, 0)}</span>
          <span className={`num text-right ${r.profitFactor >= 1.5 ? 'text-up' : r.profitFactor < 1 ? 'text-down' : ''}`}>{r.profitFactor === Infinity ? '∞' : num(r.profitFactor, 2)}</span>
          <span className="text-right">
            <span className={`num block ${pnlColor(r.net)}`}>{money(r.net, cur, { sign: true, compact: true })}</span>
            <span className="flex justify-end mt-1"><span className="h-1 rounded-full" style={{ width: `${(Math.abs(r.net) / maxAbs) * 100}%`, background: r.net >= 0 ? 'var(--up)' : 'var(--down)' }} /></span>
          </span>
        </div>
      ))}
    </Card>
  )
}

function HourHeat({ trades, cur }) {
  const order = [1, 2, 3, 4, 5, 6, 0]
  const grid = useMemo(() => {
    const m = new Map()
    for (const t of trades) { const k = `${wibDay(t.open_time)}-${wibHour(t.open_time)}`; const v = m.get(k) || { pnl: 0, n: 0 }; v.pnl += +t.net_pnl; v.n++; m.set(k, v) }
    return m
  }, [trades])
  const maxAbs = Math.max(1, ...[...grid.values()].map((v) => Math.abs(v.pnl)))
  const hours = Array.from({ length: 24 }, (_, i) => i)
  return (
    <Card title="Jam × hari (WIB, jam buka)">
      <div className="overflow-x-auto no-scrollbar">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[32px_repeat(24,minmax(0,1fr))] gap-[3px] text-[9.5px] text-faint mb-1">
            <span />{hours.map((h) => <span key={h} className="text-center num">{h % 3 === 0 ? h : ''}</span>)}
          </div>
          {order.map((d) => (
            <div key={d} className="grid grid-cols-[32px_repeat(24,minmax(0,1fr))] gap-[3px] mb-[3px]">
              <span className="text-[10.5px] text-muted self-center">{DAYS[d]}</span>
              {hours.map((h) => {
                const v = grid.get(`${d}-${h}`)
                const a = v ? 15 + 60 * Math.min(1, Math.abs(v.pnl) / maxAbs) : 0
                return <div key={h} title={v ? `${DAYS[d]} ${h}:00 · ${v.n} trade · ${money(v.pnl, cur, { sign: true })}` : ''} className="aspect-square rounded-[4px]" style={{ background: v ? `color-mix(in oklab, ${v.pnl >= 0 ? 'var(--up)' : 'var(--down)'} ${a}%, transparent)` : 'var(--raised)' }} />
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="text-[11.5px] text-faint mt-2">Kotak makin pekat = profit (hijau) atau rugi (merah) makin besar. Arahkan atau ketuk kotak untuk rinciannya.</div>
    </Card>
  )
}

function Distribution({ trades, s, cur }) {
  const rs = trades.filter((t) => t.r_multiple != null).map((t) => +t.r_multiple)
  const bins = [-3, -2, -1, 0, 1, 2, 3]
  const counts = bins.map((b, i) => rs.filter((r) => (i === 0 ? r < -2 : i === bins.length - 1 ? r >= 3 : r >= b && r < b + 1)).length)
  const max = Math.max(1, ...counts)
  const lbl = ['< −2R', '−2…−1', '−1…0', '0…1', '1…2', '2…3', '≥ 3R']
  return (
    <Card title="Distribusi hasil">
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="rounded-xl bg-raised p-2.5"><div className="text-[11px] text-muted">Menang beruntun</div><div className="num font-semibold text-up">{s.maxWinStreak}</div></div>
        <div className="rounded-xl bg-raised p-2.5"><div className="text-[11px] text-muted">Kalah beruntun</div><div className="num font-semibold text-down">{s.maxLossStreak}</div></div>
        <div className="rounded-xl bg-raised p-2.5"><div className="text-[11px] text-muted">Pakai SL</div><div className="num font-semibold">{pct(s.slRate, 0)}</div></div>
      </div>
      {rs.length < 5 ? <div className="text-sm text-muted">Distribusi R muncul setelah ada minimal 5 trade ber-SL.</div> : (
        <div className="flex items-end gap-1.5 h-32">
          {counts.map((c, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <span className="num text-[10.5px] text-muted">{c || ''}</span>
              <div className="w-full rounded-t-md" style={{ height: `${(c / max) * 100}%`, minHeight: c ? 3 : 0, background: i < 3 ? 'var(--down)' : 'var(--up)', opacity: 0.75 }} />
              <span className="text-[9.5px] text-faint whitespace-nowrap">{lbl[i]}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between text-[12px] mt-4 pt-3 border-t border-line">
        <span className="text-muted">Trade terbaik <span className="num text-up">{money(s.best?.net_pnl, cur, { sign: true })}</span></span>
        <span className="text-muted">Terburuk <span className="num text-down">{money(s.worst?.net_pnl, cur, { sign: true })}</span></span>
      </div>
    </Card>
  )
}

function Habits({ trades, tags, cur, go }) {
  const rows = Object.entries(TAGS).filter(([k]) => k !== 'rule_ok').map(([k, v]) => {
    const ts = trades.filter((t) => (tags.get(t.position_id) || []).includes(k))
    return { k, ...v, ...summarize(ts) }
  }).filter((r) => r.n > 0).sort((a, b) => a.net - b.net)
  const ok = summarize(trades.filter((t) => (tags.get(t.position_id) || []).includes('rule_ok')))
  return (
    <Card title="Kebiasaan terdeteksi">
      {rows.length === 0 ? <div className="text-sm text-muted">Tidak ada kebiasaan berisiko di periode ini.</div> : (
        <div className="divide-y divide-line -my-1">
          {rows.map((r) => (
            <button key={r.k} onClick={() => go('trade')} className="w-full flex items-center justify-between py-2.5 text-left">
              <span className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${r.tone === 'down' ? 'bg-down' : r.tone === 'warn' ? 'bg-warn' : 'bg-faint'}`} />
                <span className="text-[13.5px] font-medium">{r.label}</span>
                <span className="num text-[11.5px] text-faint">{r.n}× · {pct(r.n / trades.length, 0)}</span>
              </span>
              <span className={`num text-[13px] ${pnlColor(r.net)}`}>{money(r.net, cur, { sign: true })}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-line flex justify-between text-[12.5px]">
        <span className="text-muted">Trade sesuai aturan <span className="num text-faint">{ok.n}×</span></span>
        <span className={`num ${pnlColor(ok.net)}`}>{money(ok.net, cur, { sign: true })} · win {pct(ok.winRate, 0)}</span>
      </div>
    </Card>
  )
}

const TABS = [['dna', 'Trader DNA'], ['performa', 'Performa'], ['eksekusi', 'Eksekusi'], ['simulasi', 'Simulasi']]
const getTab = () => { try { return localStorage.getItem('analitik-tab') || 'dna' } catch { return 'dna' } }

export default function AnalyticsPage({ ctx }) {
  const { trades, account, s, tags, go, dna, pm, periodCashflows, openTrade } = ctx
  const [tab, setTabState] = useState(getTab)
  const setTab = (t) => { setTabState(t); try { localStorage.setItem('analitik-tab', t) } catch { /* abaikan */ } }
  if (!trades.length) return <Card><Empty title="Belum ada trade di periode ini" /></Card>
  return (
    <div className="space-y-4">
      <div className="card p-1 grid grid-cols-4 gap-1">
        {TABS.map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-xl py-2 text-[12.5px] sm:text-[13.5px] transition ${tab === id ? 'bg-raised text-ink font-semibold' : 'text-muted hover:text-ink'}`}>{lbl}</button>
        ))}
      </div>
      {tab === 'dna' && <DnaPanel trades={trades} tags={tags} dna={dna} />}
      {tab === 'performa' && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <Breakdown trades={trades} cur={account.currency} />
          <div className="space-y-4">
            <Distribution trades={trades} s={s} cur={account.currency} />
            <Habits trades={trades} tags={tags} cur={account.currency} go={go} />
          </div>
          <div className="lg:col-span-2"><HourHeat trades={trades} cur={account.currency} /></div>
        </div>
      )}
      {tab === 'eksekusi' && <ExecPanel trades={trades} openTrade={(t) => openTrade(t, trades)} />}
      {tab === 'simulasi' && <SimPanel trades={trades} tags={tags} startBal={pm.startBalance} cashflows={periodCashflows} cur={account.currency} />}
    </div>
  )
}
