import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, loadAccounts, loadAccountData, demoData, demoPublicProfile } from './lib/data'
import { traderDNA } from './lib/dna'
import { PERIODS, buildCurve, computeTags, periodMetrics, periodRange, summarize } from './lib/stats'
import { Chips, Skeleton, Empty } from './components/ui'
import TradeDetail from './components/TradeDetail'
import Login from './pages/Login'
import Overview from './pages/Overview'
import CalendarPage from './pages/CalendarPage'
import TradesPage from './pages/TradesPage'
import AnalyticsPage from './pages/AnalyticsPage'
import AccountPage from './pages/AccountPage'
import ReportsPage from './pages/ReportsPage'
import PublicProfile from './pages/PublicProfile'
import SetPassword from './pages/SetPassword'

const I = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
  cal: 'M4 6.5h16v13H4zM4 10.5h16M8.5 3.5v5M15.5 3.5v5',
  list: 'M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  chart: 'M4 19.5h16M7 16v-5M12 16V6.5M17 16v-8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  doc: 'M6.5 3.5h8l3.5 3.5v13.5h-11.5zM14 3.5V7.5h4M9.5 12h5M9.5 15.5h5',
}
const NAV = [
  ['ringkasan', 'Ringkasan', I.home, Overview, true],
  ['kalender', 'Kalender', I.cal, CalendarPage, false],
  ['trade', 'Trade', I.list, TradesPage, true],
  ['analitik', 'Analitik', I.chart, AnalyticsPage, true],
  ['rapor', 'Rapor', I.doc, ReportsPage, false],
]
const ACCOUNT_ROUTE = ['akun', 'Akun', I.user, AccountPage, false]
const Icon = ({ d, className = 'w-[22px] h-[22px]' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* abaikan */ } },
}
const routeFromHash = () => (location.hash.replace('#/', '') || 'ringkasan')

export default function App() {
  const [session, setSession] = useState(undefined)
  const [recovery, setRecovery] = useState(false)
  const DEMO_ONLY = import.meta.env.VITE_DEMO_ONLY === '1'
  const [demo, setDemo] = useState(() => DEMO_ONLY || new URLSearchParams(location.search).has('demo'))
  const [route, setRoute] = useState(routeFromHash)
  const [theme, setThemeState] = useState(() => store.get('theme', 'dark'))
  const [period, setPeriod] = useState(() => store.get('period', 'all'))
  const [accounts, setAccounts] = useState(null)
  const [accountId, setAccountIdState] = useState(() => store.get('account', null))
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const setTheme = (t) => { setThemeState(t); store.set('theme', t) }
  const setAccountId = (id) => { setAccountIdState(id); store.set('account', id) }
  const changePeriod = (p) => { setPeriod(p); store.set('period', p) }

  useEffect(() => {
    const f = () => { setRoute(routeFromHash()); setDetail(null) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  const [slideDir, setSlideDir] = useState('none')
  const go = (r) => {
    const a = NAV.findIndex((n) => n[0] === route), b = NAV.findIndex((n) => n[0] === r)
    setSlideDir(a < 0 || b < 0 || a === b ? 'none' : b > a ? 'left' : 'right')
    location.hash = `#/${r}`; window.scrollTo({ top: 0 })
  }
  // Geser kiri/kanan di HP untuk pindah tab (diabaikan di atas chart, chip, dan area yang bisa digulir menyamping)
  const touch = useRef(null)
  const onTouchStart = (e) => {
    const t = e.touches[0]
    touch.current = e.target.closest('canvas, .recharts-wrapper, .no-scrollbar, .overflow-x-auto, input, select') ? null : { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e) => {
    if (!touch.current || detail) return
    const t = e.changedTouches[0], dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return
    const i = NAV.findIndex((n) => n[0] === route)
    if (i < 0) return
    const j = dx < 0 ? i + 1 : i - 1
    if (j >= 0 && j < NAV.length) go(NAV[j][0])
  }

  useEffect(() => {
    if (DEMO_ONLY) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setRecovery(true) })
    return () => sub.subscription.unsubscribe()
  }, [])

  // muat akun
  useEffect(() => {
    setErr(null)
    if (demo) { const d = demoData(); setAccounts(d.accounts); setData(d); return }
    if (!session) { setAccounts(null); setData(null); return }
    loadAccounts().then(setAccounts).catch((e) => setErr(e.message))
  }, [session, demo])

  const account = accounts?.find((a) => a.id === accountId) || accounts?.[0]

  const reload = useCallback(() => {
    if (demo || !account) return
    setErr(null)
    loadAccountData(account.id).then(setData).catch((e) => setErr(e.message))
  }, [account?.id, demo]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (demo) return; setData(null); reload() }, [reload, demo])

  const ctx = useMemo(() => {
    if (!data || !account) return null
    const allTrades = [...data.trades].sort((a, b) => new Date(a.close_time) - new Date(b.close_time))
    const curve = buildCurve(allTrades, data.cashflows)
    const before = new Map()
    let bal = 0
    const ev = [...data.cashflows.map((c) => ({ t: c.time, a: +c.amount })), ...allTrades.map((t) => ({ t: t.close_time, a: +t.net_pnl, id: t.position_id }))].sort((x, y) => new Date(x.t) - new Date(y.t))
    for (const e of ev) { if (e.id != null) before.set(e.id, bal); bal += e.a }
    for (const t of allTrades) t.balance_before = before.get(t.position_id)
    const [from, to] = periodRange(period)
    const trades = allTrades.filter((t) => { const ts = +new Date(t.close_time); return (!from || ts >= from) && (!to || ts < to) })
    const tags = computeTags(allTrades, data.sltp)
    const inRange = (iso) => { const ts = +new Date(iso); return (!from || ts >= from) && (!to || ts < to) }
    return {
      account, accounts, allTrades, trades, curve, cashflows: data.cashflows, positions: data.positions, runs: data.runs,
      periodCashflows: data.cashflows.filter((c) => inRange(c.time)),
      s: summarize(trades), pm: periodMetrics(curve, from, to), tags, accountId: account.id,
      dna: traderDNA(trades, tags),
    }
  }, [data, account, accounts, period])

  if (route.startsWith('p/')) {
    const token = route.slice(2)
    return <PublicProfile token={token} demoData={token === 'demo' ? demoPublicProfile() : null} />
  }
  if (session === undefined && !demo) return <div className="min-h-dvh" />
  if (recovery && session) return <SetPassword onDone={() => setTimeout(() => { setRecovery(false); history.replaceState(null, '', location.pathname + '#/ringkasan') }, 2500)} />
  if (!session && !demo) return <Login onDemo={() => { setDemo(true); history.replaceState(null, '', '?demo#/ringkasan') }} />

  const signOut = async () => {
    if (DEMO_ONLY) return
    if (demo) { setDemo(false); setAccounts(null); setData(null); history.replaceState(null, '', location.pathname); return }
    await supabase.auth.signOut()
  }
  const openTrade = (t, list) => setDetail({ t, list: list || ctx.trades })
  const cur = route === 'akun' ? ACCOUNT_ROUTE : NAV.find((n) => n[0] === route) || NAV[0]
  const Page = cur[3]
  const di = detail ? detail.list.findIndex((x) => x.position_id === detail.t.position_id) : -1

  return (
    <div className="min-h-dvh md:pl-60">
      {/* Sidebar desktop */}
      <aside className="no-print hidden md:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-line bg-surface px-3 py-5">
        <div className="flex items-center gap-2.5 px-2 mb-7">
          <img src="icon.svg" className="w-8 h-8" alt="" />
          <div><div className="font-semibold leading-tight">Jurnal Trading</div><div className="text-[11px] text-faint">{demo ? 'Mode demo' : 'Read-only dari MT5'}</div></div>
        </div>
        {NAV.map(([id, label, icon]) => (
          <button key={id} onClick={() => go(id)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-[14px] transition ${route === id ? 'bg-raised text-ink font-semibold' : 'text-muted hover:text-ink hover:bg-raised/60'}`}>
            <Icon d={icon} className="w-5 h-5" />{label}
          </button>
        ))}
        <button onClick={() => go('akun')} className={`mt-auto flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] transition ${route === 'akun' ? 'bg-raised text-ink font-semibold' : 'text-muted hover:text-ink hover:bg-raised/60'}`}>
          <Icon d={I.user} className="w-5 h-5" />
          <span className="min-w-0 text-left"><span className="block">Akun</span>{account && <span className="block text-[11px] text-faint font-normal truncate">{account.name} · #{account.login}</span>}</span>
        </button>
      </aside>

      {/* Judul halaman (ikut tergulir di HP) */}
      <div className="no-print max-w-6xl mx-auto px-4 pt-5 safe-t md:hidden">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight">{cur[1]}</h1>
            {account && <div className="text-[11.5px] text-faint truncate">{account.name} · #{account.login}{demo && ' · data contoh'}</div>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => go('akun')} className={`w-9 h-9 rounded-full grid place-items-center ${route === 'akun' ? 'bg-raised text-ink' : 'text-muted hover:bg-raised'}`} aria-label="Akun dan pengaturan"><Icon d={I.user} className="w-5 h-5" /></button>
            {!demo && account && <button onClick={reload} className="w-9 h-9 rounded-full hover:bg-raised text-muted grid place-items-center" aria-label="Muat ulang"><Icon d="M20 11.5A8 8 0 1 0 17.7 17M20 5v6.5h-6.5" className="w-5 h-5" /></button>}
          </div>
        </div>
      </div>

      <header className="no-print sticky top-0 z-30 bg-bg/90 backdrop-blur-md border-b border-line md:safe-t">
        {/* Tab menu HP: di atas, bebas dari lencana Netlify di pojok bawah */}
        <nav className="md:hidden relative max-w-6xl mx-auto px-2 pt-2">
          <div className="grid grid-cols-5 relative">
            <span aria-hidden className="absolute bottom-0 h-[3px] rounded-full bg-accent transition-transform duration-300 ease-out"
              style={{ width: '20%', transform: `translateX(${Math.max(0, NAV.findIndex((n) => n[0] === route)) * 100}%)`, opacity: route === 'akun' ? 0 : 1 }} />
            {NAV.map(([id, label, icon]) => (
              <button key={id} onClick={() => go(id)} className={`flex flex-col items-center gap-0.5 pt-1 pb-2 text-[10.5px] transition-colors ${route === id ? 'text-ink font-semibold' : 'text-faint'}`}>
                <Icon d={icon} className={`w-[21px] h-[21px] transition-transform duration-300 ${route === id ? 'scale-110 text-accent' : ''}`} />{label}
              </button>
            ))}
          </div>
        </nav>
        <div className="max-w-6xl mx-auto px-4 md:pt-3 pb-2.5">
          <div className="hidden md:flex items-center justify-between mb-2">
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold leading-tight">{cur[1]}</h1>
              {account && <div className="text-[11.5px] text-faint truncate">{account.name} · #{account.login}{demo && ' · data contoh'}</div>}
            </div>
            {!demo && account && <button onClick={reload} className="w-9 h-9 rounded-full hover:bg-raised text-muted grid place-items-center" aria-label="Muat ulang">
              <Icon d="M20 11.5A8 8 0 1 0 17.7 17M20 5v6.5h-6.5" className="w-5 h-5" />
            </button>}
          </div>
          {cur[4] && <Chips className="pt-2 md:pt-0" value={period} onChange={changePeriod} options={PERIODS} />}
        </div>
      </header>

      <main key={route} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className={`max-w-6xl mx-auto px-4 pt-4 pb-24 page-in-${slideDir}`}>
        {err && <div className="card p-4 mb-4 text-sm text-down">Gagal memuat data: {err}</div>}
        {accounts && accounts.length === 0 ? (
          <div className="card"><Empty title="Belum ada akun tersambung">Jalankan sync agent di laptop (lihat panduan setup). Setelah sync pertama selesai, akun dan riwayat trade muncul di sini otomatis.</Empty>
            <div className="text-center pb-6"><button onClick={signOut} className="text-sm text-muted underline">Keluar</button></div></div>
        ) : !ctx ? (
          <div className="space-y-3">
            <Skeleton className="h-36" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
            <Skeleton className="h-64" />
          </div>
        ) : (
          <Page ctx={{ ...ctx, openTrade, go, setAccountId, theme, setTheme, signOut, demo }} />
        )}
      </main>

      {detail && ctx && (
        <TradeDetail
          t={detail.t} cur={ctx.account.currency} accountId={demo ? null : ctx.account.id} tags={ctx.tags.get(detail.t.position_id)}
          onClose={() => setDetail(null)}
          onPrev={di > 0 ? () => setDetail({ ...detail, t: detail.list[di - 1] }) : null}
          onNext={di >= 0 && di < detail.list.length - 1 ? () => setDetail({ ...detail, t: detail.list[di + 1] }) : null}
        />
      )}
    </div>
  )
}
