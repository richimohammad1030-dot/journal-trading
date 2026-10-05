import { useEffect, useMemo, useState } from 'react'
import { loadPublicProfile } from '../lib/data'
import { buildCurve, computeTags, dailyMap, periodMetrics, summarize, SOURCE_LABEL } from '../lib/stats'
import { traderDNA } from '../lib/dna'
import { ago, money, num, pct, pnlColor } from '../lib/format'
import { Badge, Card, Empty, Skeleton, Stat } from '../components/ui'
import EquityChart from '../components/EquityChart'
import Calendar from '../components/Calendar'
import DnaPanel from '../components/DnaPanel'

export default function PublicProfile({ token, demoData }) {
  const [data, setData] = useState(demoData || null)
  const [err, setErr] = useState(null)
  const now = new Date(Date.now() + 7 * 3600e3)
  const [ym, setYm] = useState([now.getUTCFullYear(), now.getUTCMonth()])
  useEffect(() => {
    if (demoData) return
    loadPublicProfile(token).then((d) => (d ? setData(d) : setErr('notfound'))).catch((e) => setErr(e.message))
  }, [token, demoData])

  const v = useMemo(() => {
    if (!data) return null
    const trades = [...data.trades].sort((a, b) => new Date(a.close_time) - new Date(b.close_time))
    let bal = 0
    const ev = [...data.cashflows.map((c) => ({ t: c.time, a: +c.amount })), ...trades.map((t) => ({ t: t.close_time, a: +t.net_pnl, id: t.position_id }))].sort((x, y) => new Date(x.t) - new Date(y.t))
    const before = new Map()
    for (const e of ev) { if (e.id != null) before.set(e.id, bal); bal += e.a }
    for (const t of trades) t.balance_before = before.get(t.position_id)
    const curve = buildCurve(trades, data.cashflows)
    const tags = computeTags(trades, [])
    return { trades, curve, pm: periodMetrics(curve, null, null), s: summarize(trades), tags, dna: traderDNA(trades, tags), daily: dailyMap(trades) }
  }, [data])

  if (err) return (
    <div className="min-h-dvh grid place-items-center px-5"><div className="card max-w-sm w-full"><Empty title={err === 'notfound' ? 'Profil tidak ditemukan' : 'Gagal memuat profil'}>{err === 'notfound' ? 'Tautan ini sudah dimatikan pemiliknya atau salah ketik.' : err}</Empty></div></div>
  )
  if (!v) return <div className="max-w-5xl mx-auto p-4 space-y-3"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>

  const { account, hide } = data
  const cur = hide ? null : account.currency
  const amt = (x) => (hide ? `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}% modal` : money(x, cur, { sign: true }))
  const months = new Set(v.trades.map((t) => t.close_time.slice(0, 7))).size
  const move = (d) => setYm(([y, m]) => { const n = new Date(Date.UTC(y, m + d, 1)); return [n.getUTCFullYear(), n.getUTCMonth()] })
  const sources = [...new Set(v.trades.map((t) => SOURCE_LABEL[t.source] || t.source))]

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface safe-t">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center gap-2 text-[12px] text-muted mb-1">
            <img src="icon.svg" alt="" className="w-5 h-5" />
            <span>Profil trading publik</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-semibold">{account.name}</h1>
            <Badge tone={account.is_real ? 'warn' : 'muted'}>{account.is_real ? 'Akun real' : 'Akun demo'}</Badge>
          </div>
          <p className="text-[12.5px] text-muted mt-1">{account.broker} · leverage 1:{account.leverage} · {v.s.n} trade selama {months} bulan · diperbarui {ago(account.last_sync_at)}</p>
          <p className="text-[11.5px] text-faint mt-2 max-w-2xl">Semua angka ditarik otomatis dari akun MT5 lewat akses read-only, bukan diketik manual. {hide && 'Nominal disembunyikan pemilik; hasil ditampilkan sebagai persen dari total modal yang disetor.'}</p>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Stat label="Gain" value={pct(v.pm.gain, 2, true)} tone={pnlColor(v.pm.gain)} sub="time-weighted" />
          <Stat label="Max drawdown" value={pct(v.pm.maxDD, 1)} tone="text-down" sub="dari puncak" />
          <Stat label="Win rate" value={pct(v.s.winRate, 1)} sub={`${v.s.wins} menang · ${v.s.losses} kalah`} />
          <Stat label="Profit factor" value={v.s.profitFactor === Infinity ? '∞' : num(v.s.profitFactor, 2)} />
          <Stat label="Profit bersih" value={amt(v.s.net)} tone={pnlColor(v.s.net)} />
          <Stat label="Rata-rata R" value={v.s.avgR != null ? `${v.s.avgR > 0 ? '+' : ''}${num(v.s.avgR, 2)}R` : '–'} tone={pnlColor(v.s.avgR)} />
          <Stat label="Pakai SL" value={pct(v.s.slRate, 0)} sub="dari semua trade" />
          <Stat label="Sumber" value={sources.slice(0, 2).join(', ')} sub={sources.length > 2 ? `+${sources.length - 2} lainnya` : 'eksekusi'} />
        </div>
        <Card title="Kurva pertumbuhan"><EquityChart points={v.pm.points.map((p) => ({ ...p, cash: hide ? 0 : p.cash }))} cur={cur} relOnly={hide} /></Card>
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <Card><Calendar year={ym[0]} month={ym[1]} daily={v.daily} cur={cur} selected={null} onSelect={() => {}} onMonth={move} /></Card>
          <DnaPanel trades={v.trades} tags={v.tags} dna={v.dna} />
        </div>
        <p className="text-[11px] text-faint text-center">Dibuat dengan Jurnal Trading · data read-only dari MT5 · bukan nasihat investasi</p>
      </main>
    </div>
  )
}
