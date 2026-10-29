import { createClient } from '@supabase/supabase-js'
import { pickTimeframes } from './bars'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } },
)

async function all(query) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

export async function loadAccounts() {
  const { data, error } = await supabase.from('accounts').select('*').order('created_at')
  if (error) throw error
  return data
}

export async function loadAccountData(accountId) {
  const [trades, cashflows, positions, runs, sltp] = await Promise.all([
    all(() => supabase.from('trades').select('*').eq('account_id', accountId).order('close_time')),
    all(() => supabase.from('cashflows').select('*').eq('account_id', accountId).order('time')),
    supabase.from('open_positions').select('*').eq('account_id', accountId).order('open_time', { ascending: false }),
    supabase.from('sync_runs').select('*').eq('account_id', accountId).order('started_at', { ascending: false }).limit(10),
    all(() => supabase.from('position_sltp_log').select('position_id,seen_at,sl,tp').eq('account_id', accountId).order('seen_at')),
  ])
  if (positions.error) throw positions.error
  return { trades, cashflows, positions: positions.data, runs: runs.data || [], sltp }
}

/* ------------------------------------------------------------------ data demo */
function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
}
const SYMS = [
  // tv = nilai 1 pip untuk 1 lot (USD)
  { s: 'XAUUSD', p: 2350, pt: 0.01, pipDiv: 10, tv: 10, w: 5 },
  { s: 'EURUSD', p: 1.085, pt: 0.00001, pipDiv: 10, tv: 10, w: 3 },
  { s: 'GBPUSD', p: 1.27, pt: 0.00001, pipDiv: 10, tv: 10, w: 2 },
  { s: 'USDJPY', p: 151.2, pt: 0.001, pipDiv: 10, tv: 6.6, w: 2 },
  { s: 'BTCUSD', p: 64000, pt: 0.01, pipDiv: 1000, tv: 10, w: 1 },
]

export function demoData() {
  const r = rng(21)
  const pick = () => { const tot = SYMS.reduce((s, x) => s + x.w, 0); let v = r() * tot; for (const x of SYMS) { if ((v -= x.w) < 0) return x } return SYMS[0] }
  const start = Date.now() - 150 * 864e5
  const cashflows = [
    { ticket: 1, time: new Date(start - 864e5).toISOString(), kind: 'deposit', amount: 2000 },
    { ticket: 2, time: new Date(start + 60 * 864e5).toISOString(), kind: 'deposit', amount: 500 },
    { ticket: 3, time: new Date(start + 120 * 864e5).toISOString(), kind: 'withdrawal', amount: -300 },
  ]
  const trades = []
  let pid = 5000, lastLoss = false, lot = 0.05
  for (let day = 0; day < 150; day++) {
    const nTr = Math.floor(r() * 5)
    for (let k = 0; k < nTr; k++) {
      const sym = pick()
      const hour = [1, 3, 8, 9, 10, 13, 14, 15, 17, 19][Math.floor(r() * 10)]
      const open = start + day * 864e5 + hour * 3600e3 + Math.floor(r() * 3600e3)
      if ([0, 6].includes(new Date(open + 7 * 3600e3).getUTCDay())) continue
      const dur = Math.floor((r() < 0.7 ? 5 + r() * 90 : 120 + r() * 900) * 60)
      const dir = r() < 0.55 ? 'buy' : 'sell'
      const useSL = r() < 0.72
      const stopPips = 15 + Math.floor(r() * 30)
      const martingale = lastLoss && r() < 0.25
      const vol = +(martingale ? lot * 2 : 0.03 + Math.floor(r() * 5) * 0.01).toFixed(2)
      const pipVal = sym.tv * vol
      const win = r() < (hour >= 8 && hour <= 15 ? 0.58 : 0.42)
      const slHit = !win && useSL && r() < 0.7
      let pips = win ? stopPips * (0.5 + r() * 1.8) : slHit ? -stopPips : -stopPips * (useSL ? 0.4 + r() * 0.5 : 0.8 + r() * 2.2)
      pips = Math.round(pips * 10) / 10
      const profit = Math.round(pips * pipVal * 100) / 100
      const commission = -Math.round(vol * 7 * 100) / 100
      const swap = dur > 86400 ? -Math.round(r() * 3 * 100) / 100 : 0
      const net = Math.round((profit + commission + swap) * 100) / 100
      const sgn = dir === 'buy' ? 1 : -1
      const pipSize = sym.pt * sym.pipDiv
      const op = +(sym.p * (1 + (r() - 0.5) * 0.04)).toFixed(5)
      const cp = +(op + sgn * pips * pipSize).toFixed(5)
      const sl = useSL ? +(op - sgn * stopPips * pipSize).toFixed(5) : null
      const risk = useSL ? Math.round(stopPips * pipVal * 100) / 100 : null
      const reason = slHit ? 'sl' : win && r() < 0.4 ? 'tp' : 'manual'
      const ap = Math.abs(pips)
      const maePips = +(reason === 'sl' ? ap : win ? r() * stopPips * 0.8 : ap + r() * (useSL ? Math.max(0, stopPips - ap) : 12)).toFixed(1)
      const mfePips = +(win ? ap * (1 + (r() < 0.35 ? 1.5 + r() * 2 : r() * 0.4)) : r() * stopPips * 0.9).toFixed(1)
      const [chartTf, ctxTf] = pickTimeframes(dur)
      const trendRoll = r()
      const trend = trendRoll < 0.4 ? (win ? (dir === 'buy' ? 'up' : 'down') : (dir === 'buy' ? 'down' : 'up')) : trendRoll < 0.75 ? (r() < 0.5 ? 'up' : 'down') : 'flat'
      trades.push({
        position_id: pid++, symbol: sym.s, direction: dir, volume: vol,
        open_time: new Date(open).toISOString(), close_time: new Date(open + dur * 1000).toISOString(),
        open_price: op, close_price: cp, sl, tp: reason === 'tp' ? cp : null,
        profit, commission, swap, fee: 0, net_pnl: net, pips, points: pips * sym.pipDiv,
        duration_sec: dur, magic: r() < 0.15 ? 2024 : 0,
        source: r() < 0.15 ? 'ea' : r() < 0.7 ? 'mobile' : 'desktop',
        close_reason: reason, partial_closes: r() < 0.08 ? 1 : 0,
        risk_amount: risk, r_multiple: risk ? Math.round((net / risk) * 100) / 100 : null,
        mae_pips: maePips, mfe_pips: mfePips,
        mae_amount: Math.round(maePips * pipVal * 100) / 100, mfe_amount: Math.round(mfePips * pipVal * 100) / 100,
        mae_r: risk ? Math.round((maePips * pipVal / risk) * 100) / 100 : null,
        mfe_r: risk ? Math.round((mfePips * pipVal / risk) * 100) / 100 : null,
        exit_efficiency: mfePips > 0 ? Math.round((pips / mfePips) * 1000) / 1000 : null,
        trend_ctx: trend, chart_tf: chartTf, ctx_tf: ctxTf,
      })
      lastLoss = net < 0; lot = vol
    }
  }
  trades.sort((a, b) => new Date(a.close_time) - new Date(b.close_time))
  // Dua akun contoh: MT5 (emas & forex) dan Binance Futures (crypto)
  for (const t of trades) t.account_id = /^BTC/.test(t.symbol) ? 'demo-crypto' : 'demo'
  for (const c of cashflows) c.account_id = 'demo'
  cashflows.push({ ticket: 4, time: new Date(start - 864e5).toISOString(), kind: 'deposit', amount: 500, account_id: 'demo-crypto' })
  const bal = (id) => cashflows.filter((c) => c.account_id === id).reduce((s, c) => s + c.amount, 0) + trades.filter((t) => t.account_id === id).reduce((s, t) => s + t.net_pnl, 0)
  const sync = new Date(Date.now() - 42 * 60e3).toISOString()
  const account = {
    id: 'demo', login: 88001234, server: 'DemoBroker-Server', name: 'Akun Demo MT5', broker: 'Demo Broker',
    currency: 'USD', leverage: 500, is_real: false, balance: bal('demo'), equity: bal('demo') + 12.4, last_sync_at: sync,
  }
  const crypto = {
    id: 'demo-crypto', login: 1, server: 'Binance-USDM', name: 'Demo Binance Futures', broker: 'Binance',
    currency: 'USDT', leverage: 20, is_real: false, balance: bal('demo-crypto'), equity: bal('demo-crypto'), last_sync_at: new Date(Date.now() - 6 * 60e3).toISOString(),
  }
  const positions = [
    { ticket: 9001, account_id: 'demo', symbol: 'XAUUSD', direction: 'buy', volume: 0.05, open_time: new Date(Date.now() - 3 * 3600e3).toISOString(), open_price: 2361.4, current_price: 2363.88, sl: 2355.0, tp: 2375.0, profit: 12.4, swap: 0, source: 'mobile' },
  ]
  // contoh: dua trade yang SL-nya dilebarkan saat posisi berjalan
  const sltp = []
  for (const t of trades.filter((x) => x.sl && x.net_pnl < 0).slice(-12, -10)) {
    const ps = Math.abs(t.open_price - t.sl)
    sltp.push({ position_id: t.position_id, seen_at: t.open_time, sl: t.direction === 'buy' ? t.open_price - ps * 0.6 : t.open_price + ps * 0.6 })
    sltp.push({ position_id: t.position_id, seen_at: t.close_time, sl: t.sl })
  }
  return { sltp, accounts: [account, crypto], trades, cashflows, positions, runs: [{ status: 'ok', finished_at: account.last_sync_at, trades_count: 3, account_name: account.name }] }
}

export async function loadBars(accountId, positionId) {
  const { data, error } = await supabase.from('trade_bars').select('kind,tf,bars').eq('account_id', accountId).eq('position_id', positionId)
  if (error) throw error
  return Object.fromEntries(data.map((d) => [d.kind, { tf: d.tf, bars: d.bars }]))
}

/* ------------------------------------------------------------------ profil publik */
export async function getShareLink(accountId) {
  const { data, error } = await supabase.from('share_links').select('*').eq('account_id', accountId).maybeSingle()
  if (error) throw error
  return data
}
export async function upsertShareLink(accountId, patch) {
  const { data, error } = await supabase.from('share_links').upsert({ account_id: accountId, ...patch }, { onConflict: 'account_id' }).select().single()
  if (error) throw error
  return data
}
export async function deleteShareLink(accountId) {
  const { error } = await supabase.from('share_links').delete().eq('account_id', accountId)
  if (error) throw error
}
export async function loadPublicProfile(token) {
  const { data, error } = await supabase.rpc('public_profile', { p_token: token })
  if (error) throw error
  return data
}

/** Profil publik contoh (mode demo), nominal disembunyikan seperti aslinya. */
export function demoPublicProfile() {
  const d = demoData()
  const dep = d.cashflows.filter((c) => c.amount > 0).reduce((s, c) => s + c.amount, 0)
  const f = 100 / dep
  return {
    hide: true,
    account: { ...d.accounts[0], currency: null },
    trades: d.trades.map((t) => ({ ...t, volume: null, net_pnl: t.net_pnl * f, risk_amount: t.risk_amount && t.risk_amount * f })),
    cashflows: d.cashflows.map((c) => ({ ...c, amount: c.amount * f })),
  }
}

/* ------------------------------------------------------- gabungan multi-akun (USD) */
// Semua nominal dikonversi ke USD: akun cent (USC) dibagi 100, stablecoin 1:1.
export const usdRate = (cur) => (/^US[CX]$/i.test(cur || '') ? 0.01 : 1)
const T_MONEY = ['profit', 'commission', 'swap', 'fee', 'net_pnl', 'risk_amount', 'mae_amount', 'mfe_amount']
const conv = (o, keys, k) => { const x = { ...o }; for (const f of keys) if (x[f] != null) x[f] = +x[f] * k; return x }

export function accountsToUsd(accounts) {
  return accounts.map((a) => {
    const k = usdRate(a.currency)
    return { ...conv(a, ['balance', 'equity', 'margin', 'free_margin'], k), orig_currency: a.currency, currency: 'USD' }
  })
}

/** Muat semua akun lalu gabungkan dalam USD. Setiap baris tetap membawa account_id. */
export async function loadAllData(accounts) {
  const per = await Promise.all(accounts.map((a) => loadAccountData(a.id)))
  const out = { trades: [], cashflows: [], positions: [], runs: [], sltp: [] }
  accounts.forEach((a, i) => {
    const k = usdRate(a.currency), d = per[i]
    out.trades.push(...d.trades.map((t) => ({ ...conv(t, T_MONEY, k), account_id: a.id })))
    out.cashflows.push(...d.cashflows.map((c) => ({ ...conv(c, ['amount'], k), account_id: a.id })))
    out.positions.push(...d.positions.map((p) => ({ ...conv(p, ['profit', 'swap'], k), account_id: a.id })))
    out.runs.push(...d.runs.map((r) => ({ ...r, account_id: a.id, account_name: a.name })))
    out.sltp.push(...d.sltp.map((l) => ({ ...l, account_id: a.id })))
  })
  out.runs.sort((x, y) => new Date(y.started_at) - new Date(x.started_at))
  return out
}
