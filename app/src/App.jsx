import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, loadAccounts, loadAllData, accountsToUsd, demoData, demoPublicProfile } from './lib/data'
import { traderDNA } from './lib/dna'
import { PERIODS, buildCurve, computeTags, periodMetrics, periodRange, summarize } from './lib/stats'
import { MARKETS, MARKET_ICON, market as marketOf } from './lib/markets'
import { ago, money } from './lib/format'
import { I, Icon } from './components/icons'
import { Chips, Skeleton, Empty } from './components/ui'
import TradeDetail from './components/TradeDetail'
import CommandPalette from './components/CommandPalette'
import Login from './pages/Login'
import Overview from './pages/Overview'
import CalendarPage from './pages/CalendarPage'
import TradesPage from './pages/TradesPage'
import AnalyticsPage from './pages/AnalyticsPage'
import AccountPage from './pages/AccountPage'
import ReportsPage from './pages/ReportsPage'
import PublicProfile from './pages/PublicProfile'
import SetPassword from './pages/SetPassword'

const NAV = [
  ['ringkasan', 'Dashboard', I.home, Overview, true],
  ['trade', 'Trade Log', I.list, TradesPage, true],
  ['kalender', 'Kalender', I.cal, CalendarPage, false],
  ['analitik', 'Analitik', I.chart, AnalyticsPage, true],
  ['rapor', 'Rapor', I.doc, ReportsPage, false],
]
const ACCOUNT_ROUTE = ['akun', 'Akun', I.user, AccountPage, false]
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* abaikan */ } },
}
const routeFromHash = () => (location.hash.replace('#/', '') || 'ringkasan')

/** Dropdown kecil di topbar */
function Dropdown({ icon, label, value, options, onChange, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const f = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    window.addEventListener('pointerdown', f)
    return () => window.removeEventListener('pointerdown', f)
  }, [open])
  const cur = options.find((o) => o[0] === value)
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className={`card flex items-center gap-2.5 h-11 pl-3.5 pr-3 text-[13.5px] rounded-xl hover:border-accent/40 transition ${open ? 'border-accent/50' : ''}`}>
        <Icon d={icon} className="w-[18px] h-[18px] text-accent" />
        <span className="max-w-[160px] truncate">{label || cur?.[1]}</span>
        <Icon d={I.chev} className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`card absolute z-50 mt-2 min-w-[210px] p-1.5 shadow-2xl sheet-in ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {options.map(([id, l, sub]) => (
            <button key={id} onClick={() => { onChange(id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 rounded-lg text-[13px] flex items-center justify-between gap-3 ${id === value ? 'nav-on' : 'text-muted hover:text-ink hover:bg-raised'}`}>
              <span className="truncate">{l}{sub && <span className="block text-[11px] text-faint">{sub}</span>}</span>
              {id === value && <span className="text-accent">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [recovery, setRecovery] = useState(false)
  const DEMO_ONLY = import.meta.env.VITE_DEMO_ONLY === '1'
  const [demo, setDemo] = useState(() => DEMO_ONLY || new URLSearchParams(location.search).has('demo'))
  const [route, setRoute] = useState(routeFromHash)
  const [theme, setThemeState] = useState(() => store.get('theme', 'dark'))
  const [period, setPeriod] = useState(() => store.get('period', 'all'))
  const [mkt, setMktState] = useState(() => store.get('market', 'all'))
  const [collapsed, setCollapsedState] = useState(() => store.get('sidebar', '0') === '1')
  const [accounts, setAccounts] = useState(null)
  const [accountId, setAccountIdState] = useState(() => store.get('account', 'all'))
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [detail, setDetail] = useState(null)
  const [palette, setPalette] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const setTheme = (t) => { setThemeState(t); store.set('theme', t) }
  const setAccountId = (id) => { setAccountIdState(id); store.set('account', id) }
  const changePeriod = (p) => { setPeriod(p); store.set('period', p) }
  const setMarket = (m) => { setMktState(m); store.set('market', m) }
  const setCollapsed = (c) => { setCollapsedState(c); store.set('sidebar', c ? '1' : '0') }

  useEffect(() => {
    const f = () => { setRoute(routeFromHash()); setDetail(null) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  useEffect(() => {
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
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
    touch.current = e.target.closest('canvas, svg, .recharts-wrapper, .no-scrollbar, .overflow-x-auto, input, select') ? null : { x: t.clientX, y: t.clientY }
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

  // muat semua akun yang tertaut, lalu gabungkan dalam USD
  const load = useCallback(async (quiet) => {
    setErr(null)
    if (demo) { const d = demoData(); setAccounts(accountsToUsd(d.accounts)); setData(d); return }
    if (!session) { setAccounts(null); setData(null); return }
    if (!quiet) setData(null)
    setRefreshing(true)
    try {
      const accs = await loadAccounts()
      const all = await loadAllData(accs)
      setAccounts(accountsToUsd(accs)); setData(all)
    } catch (e) { setErr(e.message) } finally { setRefreshing(false) }
  }, [session, demo])
  useEffect(() => { load() }, [load])
  const reload = () => load(true)

  const selected = accountId !== 'all' ? accounts?.find((a) => a.id === accountId) || null : null

  const ctx = useMemo(() => {
    if (!data || !accounts?.length) return null
    const scope = selected ? [selected] : accounts
    const ids = new Set(scope.map((a) => a.id))
    const inScope = (x) => ids.has(x.account_id)
    const account = selected || {
      id: 'all', name: accounts.length > 1 ? 'Semua akun' : accounts[0].name, broker: `${accounts.length} akun tertaut`, currency: 'USD',
      balance: accounts.reduce((s, a) => s + (+a.balance || 0), 0), equity: accounts.reduce((s, a) => s + (+a.equity || 0), 0),
      last_sync_at: accounts.map((a) => a.last_sync_at).filter(Boolean).sort()[0] || null,
      is_real: accounts.some((a) => a.is_real), login: null, server: '', leverage: null,
    }
    const cashflows = data.cashflows.filter(inScope).sort((a, b) => new Date(a.time) - new Date(b.time))
    const accountTrades = data.trades.filter(inScope).sort((a, b) => new Date(a.close_time) - new Date(b.close_time))
    const curve = buildCurve(accountTrades, cashflows)
    const before = new Map()
    let bal = 0
    const ev = [...cashflows.map((c) => ({ t: c.time, a: +c.amount })), ...accountTrades.map((t) => ({ t: t.close_time, a: +t.net_pnl, id: t.position_id }))].sort((x, y) => new Date(x.t) - new Date(y.t))
    for (const e of ev) { if (e.id != null) before.set(e.id, bal); bal += e.a }
    for (const t of accountTrades) { t.balance_before = before.get(t.position_id); t.market = marketOf(t.symbol) }
    const marketCounts = { all: accountTrades.length }
    for (const t of accountTrades) marketCounts[t.market] = (marketCounts[t.market] || 0) + 1
    const allTrades = mkt === 'all' ? accountTrades : accountTrades.filter((t) => t.market === mkt)
    const [from, to] = periodRange(period)
    const inRange = (iso) => { const ts = +new Date(iso); return (!from || ts >= from) && (!to || ts < to) }
    const trades = allTrades.filter((t) => inRange(t.close_time))
    // tag dihitung per akun (pola martingale/revenge hanya bermakna di dalam satu akun)
    const tags = new Map()
    for (const a of scope) for (const [k, v] of computeTags(accountTrades.filter((t) => t.account_id === a.id), data.sltp.filter((l) => l.account_id === a.id))) tags.set(k, v)
    const linked = accounts.map((a) => {
      const ts = data.trades.filter((t) => t.account_id === a.id && inRange(t.close_time) && (mkt === 'all' || marketOf(t.symbol) === mkt))
      return { ...a, n: ts.length, net: ts.reduce((s, t) => s + +t.net_pnl, 0), wins: ts.filter((t) => t.net_pnl > 0).length,
        markets: [...new Set(data.trades.filter((t) => t.account_id === a.id).map((t) => marketOf(t.symbol)))] }
    })
    return {
      account, accounts, linked, selected, accountTrades, allTrades, trades, curve, cashflows,
      positions: data.positions.filter(inScope), runs: data.runs.filter(inScope),
      periodCashflows: cashflows.filter((c) => inRange(c.time)), period, market: mkt, setMarket, marketCounts, range: [from, to],
      s: summarize(trades), pm: periodMetrics(curve, from, to), tags, accountId: account.id,
      dna: traderDNA(trades, tags),
    }
  }, [data, accounts, selected, period, mkt]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const account = ctx?.account
  const syncAge = account?.last_sync_at ? Date.now() - new Date(account.last_sync_at) : Infinity
  const syncTone = syncAge < 45 * 60e3 ? 'text-up' : syncAge < 6 * 3600e3 ? 'text-warn' : 'text-down'
  const initial = (account?.name || 'T').trim()[0]?.toUpperCase()
  const navBtn = (on) => `group relative flex items-center gap-3 rounded-xl text-[14px] transition ${collapsed ? 'justify-center h-11 w-11 mx-auto' : 'px-3.5 h-11'} ${on ? 'nav-on font-semibold' : 'text-muted hover:text-ink hover:bg-raised/70'}`
  const toneOf = (iso) => { const a = iso ? Date.now() - new Date(iso) : Infinity; return a < 45 * 60e3 ? 'text-up' : a < 6 * 3600e3 ? 'text-warn' : 'text-down' }
  const accOptions = accounts ? [['all', 'Semua akun', `${accounts.length} akun · ${money(accounts.reduce((s, a) => s + (+a.balance || 0), 0), 'USD')}`],
    ...accounts.map((a) => [a.id, a.name, `${a.broker || ''} · ${money(+a.balance, 'USD')}`])] : []
  const Tip = ({ children }) => collapsed ? <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md bg-raised border border-line text-[12px] text-ink whitespace-nowrap opacity-0 group-hover:opacity-100 transition z-50">{children}</span> : null

  return (
    <div className={`min-h-dvh transition-[padding] duration-300 ${collapsed ? 'md:pl-[76px]' : 'md:pl-64'}`}>
      {/* Sidebar desktop */}
      <aside className={`no-print hidden md:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-line bg-surface/80 backdrop-blur-xl py-5 transition-[width] duration-300 ${collapsed ? 'w-[76px] px-2' : 'w-64 px-4'}`}>
        <div className={`flex items-center mb-7 ${collapsed ? 'flex-col gap-3' : 'gap-3 px-1'}`}>
          <img src="icon.svg" className="w-10 h-10 drop-shadow-[0_0_12px_rgb(var(--glow)/.45)]" alt="" />
          {!collapsed && <div className="min-w-0 flex-1"><div className="font-bold tracking-wide leading-tight">JURNAL</div><div className="text-[11.5px] text-muted">{demo ? 'Mode demo' : 'Trading Journal'}</div></div>}
          <button onClick={() => setCollapsed(!collapsed)} className="w-8 h-8 rounded-lg border border-line text-muted hover:text-ink hover:border-accent/40 grid place-items-center transition" aria-label={collapsed ? 'Lebarkan menu' : 'Ciutkan menu'}>
            <Icon d={I.collapse} className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <nav className="space-y-1">
          {NAV.map(([id, label, icon]) => (
            <button key={id} onClick={() => go(id)} className={navBtn(route === id)}>
              <Icon d={icon} className="w-5 h-5 shrink-0" />{!collapsed && label}<Tip>{label}</Tip>
            </button>
          ))}
        </nav>
        {!collapsed && <div className="mt-6 mb-2 px-3 text-[11px] font-semibold tracking-[.14em] text-faint">PASAR</div>}
        {collapsed && <div className="my-4 mx-3 border-t border-line" />}
        <nav className="space-y-1">
          {MARKETS.map(([id, label]) => (
            <button key={id} onClick={() => setMarket(id)} className={navBtn(mkt === id)}>
              <Icon d={MARKET_ICON[id]} className="w-5 h-5 shrink-0" />
              {!collapsed && <><span className="flex-1 text-left">{id === 'all' ? 'Semua Pasar' : label}</span>
                {ctx && <span className="num text-[11px] text-faint">{ctx.marketCounts[id] || 0}</span>}</>}
              <Tip>{label}</Tip>
            </button>
          ))}
        </nav>
        {accounts?.length > 0 && <>
          {!collapsed && <div className="mt-6 mb-2 px-3 text-[11px] font-semibold tracking-[.14em] text-faint">AKUN TERTAUT</div>}
          {collapsed && <div className="my-4 mx-3 border-t border-line" />}
          <nav className="space-y-1 overflow-y-auto scroll-thin min-h-0">
            {[{ id: 'all', name: 'Semua akun', last_sync_at: null }, ...accounts].map((a) => (
              <button key={a.id} onClick={() => setAccountId(a.id)} className={navBtn(accountId === a.id || (a.id === 'all' && !selected))}>
                {a.id === 'all' ? <Icon d={I.wallet} className="w-5 h-5 shrink-0" />
                  : <span className="w-5 h-5 shrink-0 grid place-items-center"><span className={`w-2 h-2 rounded-full bg-current ${toneOf(a.last_sync_at)}`} /></span>}
                {!collapsed && <><span className="flex-1 min-w-0 text-left truncate">{a.name}</span>
                  {a.id !== 'all' && <span className="num text-[11px] text-faint">{money(+a.balance, 'USD', { compact: true })}</span>}</>}
                <Tip>{a.name}</Tip>
              </button>
            ))}
          </nav>
        </>}

        <div className="mt-auto space-y-2">
          {!collapsed && account && (
            <div className="card p-3.5">
              <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                <span className={`pulse-dot w-2 h-2 rounded-full bg-current ${syncTone}`} />Sync otomatis
              </div>
              <div className="text-[11.5px] text-muted mt-1">{selected ? `Terakhir ${ago(account.last_sync_at)}` : `Akun paling lama: ${ago(account.last_sync_at)}`} · tiap 15 menit dari cloud</div>
              {!demo && <button onClick={reload} className="mt-2.5 w-full h-8 rounded-lg nav-on text-[12px] font-semibold flex items-center justify-center gap-2">
                <Icon d={I.refresh} className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />Muat ulang data
              </button>}
            </div>
          )}
          <button onClick={() => go('akun')} className={navBtn(route === 'akun')}>
            <Icon d={I.user} className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="min-w-0 text-left"><span className="block">Akun & pengaturan</span></span>}
            <Tip>Akun</Tip>
          </button>
        </div>
      </aside>

      {/* Topbar desktop */}
      <div className="no-print hidden md:block sticky top-0 z-30 bg-bg/70 backdrop-blur-xl border-b border-line">
        <div className="max-w-[1500px] mx-auto px-6 h-[72px] flex items-center gap-3">
          <button onClick={() => setPalette(true)} className="card flex-1 max-w-[460px] h-11 rounded-xl flex items-center gap-3 px-4 text-[13.5px] text-faint hover:text-muted hover:border-accent/40 transition">
            <Icon d={I.search} className="w-[18px] h-[18px]" />Cari trade, pair, tiket, atau halaman…
            <span className="ml-auto text-[11px] border border-line rounded-md px-1.5 py-0.5">Ctrl K</span>
          </button>
          <div className="ml-auto flex items-center gap-2.5">
            {cur[4] && <Dropdown icon={I.cal} value={period} options={PERIODS} onChange={changePeriod} />}
            {accounts?.length > 0 && (
              <Dropdown icon={I.wallet} value={selected ? selected.id : 'all'} onChange={setAccountId}
                label={account ? account.name : 'Akun'} options={accOptions} />
            )}
            {!demo && account && <button onClick={reload} className="card w-11 h-11 rounded-xl grid place-items-center text-muted hover:text-ink transition" aria-label="Muat ulang" title={`Sync terakhir ${ago(account.last_sync_at)}`}>
              <Icon d={I.refresh} className={`w-[18px] h-[18px] ${refreshing ? 'animate-spin' : ''}`} />
            </button>}
            <button onClick={() => go('akun')} className="w-11 h-11 rounded-full grid place-items-center font-semibold text-[15px] bg-gradient-to-br from-raised to-surface border border-line hover:border-accent/50 transition" aria-label="Akun">{initial}</button>
          </div>
        </div>
      </div>

      {/* Judul halaman (ikut tergulir di HP) */}
      <div className="no-print px-4 pt-5 safe-t md:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="icon.svg" className="w-8 h-8 drop-shadow-[0_0_10px_rgb(var(--glow)/.45)]" alt="" />
            <div className="min-w-0">
              <h1 className="text-[20px] font-bold leading-tight">{cur[1]}</h1>
              {account && <div className="text-[11.5px] text-faint truncate flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full bg-current ${syncTone}`} />{account.name} · sync {ago(account.last_sync_at)}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPalette(true)} className="w-9 h-9 rounded-full text-muted hover:bg-raised grid place-items-center" aria-label="Cari"><Icon d={I.search} className="w-5 h-5" /></button>
            {!demo && account && <button onClick={reload} className="w-9 h-9 rounded-full hover:bg-raised text-muted grid place-items-center" aria-label="Muat ulang"><Icon d={I.refresh} className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} /></button>}
            <button onClick={() => go('akun')} className={`w-9 h-9 rounded-full grid place-items-center text-[13px] font-semibold border ${route === 'akun' ? 'border-accent/60 text-ink' : 'border-line text-muted'}`} aria-label="Akun dan pengaturan">{initial}</button>
          </div>
        </div>
      </div>

      <header className="no-print md:hidden sticky top-0 z-30 bg-bg/85 backdrop-blur-xl border-b border-line">
        {/* Tab menu HP: di atas, bebas dari lencana Netlify di pojok bawah */}
        <nav className="relative px-2 pt-2">
          <div className="grid grid-cols-5 relative">
            <span aria-hidden className="absolute bottom-0 h-[3px] rounded-full bg-accent shadow-[0_0_10px_rgb(var(--glow)/.8)] transition-transform duration-300 ease-out"
              style={{ width: '20%', transform: `translateX(${Math.max(0, NAV.findIndex((n) => n[0] === route)) * 100}%)`, opacity: route === 'akun' ? 0 : 1 }} />
            {NAV.map(([id, label, icon]) => (
              <button key={id} onClick={() => go(id)} className={`flex flex-col items-center gap-0.5 pt-1 pb-2 text-[10.5px] transition-colors ${route === id ? 'text-ink font-semibold' : 'text-faint'}`}>
                <Icon d={icon} className={`w-[21px] h-[21px] transition-transform duration-300 ${route === id ? 'scale-110 text-accent' : ''}`} />{label}
              </button>
            ))}
          </div>
        </nav>
        {(cur[4] || route === 'kalender') && (
          <div className="px-4 pb-2.5 pt-2 space-y-2">
            {accounts?.length > 1 && <Chips value={selected ? selected.id : 'all'} onChange={setAccountId} options={accOptions.map(([id, l]) => [id, l])} />}
            {cur[4] && <Chips value={period} onChange={changePeriod} options={PERIODS} />}
            <Chips value={mkt} onChange={setMarket} options={MARKETS.map(([id, l]) => [id, `${l}${ctx ? ` · ${ctx.marketCounts[id] || 0}` : ''}`])} />
          </div>
        )}
      </header>

      <main key={route} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className={`max-w-[1500px] mx-auto px-4 md:px-6 pt-4 md:pt-6 pb-24 page-in-${slideDir}`}>
        {route !== 'ringkasan' && <h1 className="hidden md:block text-[26px] font-bold tracking-tight mb-4 fade-up">{cur[1]}</h1>}
        {err && <div className="card p-4 mb-4 text-sm text-down">Gagal memuat data: {err}</div>}
        {accounts && accounts.length === 0 ? (
          <div className="card"><Empty title="Belum ada akun tersambung">Jalankan sync (lihat panduan). Setelah sync pertama selesai, akun dan riwayat trade muncul di sini otomatis.</Empty>
            <div className="text-center pb-6"><button onClick={signOut} className="text-sm text-muted underline">Keluar</button></div></div>
        ) : !ctx ? (
          <div className="space-y-4">
            <Skeleton className="h-16" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div>
            <div className="grid md:grid-cols-3 gap-4"><Skeleton className="h-80 md:col-span-2" /><Skeleton className="h-80" /></div>
          </div>
        ) : (
          <Page ctx={{ ...ctx, openTrade, go, setAccountId, theme, setTheme, signOut, demo }} />
        )}
      </main>

      {palette && ctx && (
        <CommandPalette trades={ctx.accountTrades} cur="USD" nav={NAV} onClose={() => setPalette(false)}
          onGo={(r) => { setPalette(false); go(r) }}
          onTrade={(t) => { setPalette(false); setDetail({ t, list: ctx.accountTrades }) }}
          onMarket={(m) => { setPalette(false); setMarket(m) }} />
      )}

      {detail && ctx && (
        <TradeDetail
          t={detail.t} cur="USD" accountId={demo ? null : detail.t.account_id} tags={ctx.tags.get(detail.t.position_id)}
          onClose={() => setDetail(null)}
          onPrev={di > 0 ? () => setDetail({ ...detail, t: detail.list[di - 1] }) : null}
          onNext={di >= 0 && di < detail.list.length - 1 ? () => setDetail({ ...detail, t: detail.list[di + 1] }) : null}
        />
      )}
    </div>
  )
}

