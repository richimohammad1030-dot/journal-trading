import { dayKey } from './format'

export const SESSIONS = ['Asia', 'London', 'London–NY', 'New York']
// Sesi ditentukan dari jam buka (UTC)
export function session(iso) {
  const h = new Date(iso).getUTCHours()
  if (h >= 7 && h < 12) return 'London'
  if (h >= 12 && h < 16) return 'London–NY'
  if (h >= 16 && h < 21) return 'New York'
  return 'Asia'
}
export const SOURCE_LABEL = { mobile: 'HP', desktop: 'Desktop', web: 'Web', ea: 'Bot/EA', other: 'Lainnya' }
export const CLOSE_LABEL = { tp: 'Kena TP', sl: 'Kena SL', manual: 'Ditutup manual', ea: 'Ditutup bot', stop_out: 'Stop out', other: 'Lainnya' }
export const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export const outcome = (t) => (t.net_pnl > 0.005 ? 'win' : t.net_pnl < -0.005 ? 'loss' : 'be')

export function summarize(trades) {
  const n = trades.length
  let gp = 0, gl = 0, wins = 0, losses = 0, rSum = 0, rN = 0, slN = 0
  let streakW = 0, streakL = 0, maxW = 0, maxL = 0
  let best = null, worst = null
  for (const t of trades) {
    const v = t.net_pnl
    if (v > 0.005) { gp += v; wins++; streakW++; streakL = 0 } else if (v < -0.005) { gl += -v; losses++; streakL++; streakW = 0 } else { streakW = 0; streakL = 0 }
    maxW = Math.max(maxW, streakW); maxL = Math.max(maxL, streakL)
    if (t.r_multiple != null) { rSum += +t.r_multiple; rN++ }
    if (t.sl) slN++
    if (!best || v > best.net_pnl) best = t
    if (!worst || v < worst.net_pnl) worst = t
  }
  const net = gp - gl
  return {
    n, wins, losses, be: n - wins - losses, net, gp, gl,
    winRate: n ? wins / n : null,
    profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : null,
    expectancy: n ? net / n : null,
    avgWin: wins ? gp / wins : null,
    avgLoss: losses ? -gl / losses : null,
    avgR: rN ? rSum / rN : null,
    slRate: n ? slN / n : null,
    maxWinStreak: maxW, maxLossStreak: maxL, best, worst,
  }
}

/**
 * Kurva balance dari seluruh riwayat (trade + cashflow).
 * idx = indeks pertumbuhan time-weighted (deposit/withdrawal tidak dihitung sebagai hasil).
 */
export function buildCurve(trades, cashflows) {
  const ev = [
    ...cashflows.map((c) => ({ t: c.time, amt: +c.amount, cash: true, kind: c.kind })),
    ...trades.map((t) => ({ t: t.close_time, amt: +t.net_pnl, cash: false, trade: t })),
  ].sort((a, b) => new Date(a.t) - new Date(b.t))
  let bal = 0, idx = 1, peak = 1
  const pts = []
  for (const e of ev) {
    if (!e.cash && bal > 0) idx *= 1 + e.amt / bal
    bal += e.amt
    peak = Math.max(peak, idx)
    pts.push({ t: e.t, ts: +new Date(e.t), balance: bal, idx, dd: peak > 0 ? idx / peak - 1 : 0, cash: e.cash ? e.amt : 0, kind: e.kind })
  }
  return pts
}

export function periodMetrics(curve, from, to) {
  const inRange = curve.filter((p) => (!from || p.ts >= from) && (!to || p.ts < to))
  const before = from ? curve.filter((p) => p.ts < from).at(-1) : null
  const startIdx = before?.idx ?? 1
  let peak = startIdx, maxDD = 0
  for (const p of inRange) { peak = Math.max(peak, p.idx); maxDD = Math.min(maxDD, p.idx / peak - 1) }
  const endIdx = inRange.at(-1)?.idx ?? startIdx
  const deposits = inRange.reduce((s, p) => s + (p.cash > 0 ? p.cash : 0), 0)
  const withdrawals = inRange.reduce((s, p) => s + (p.cash < 0 ? p.cash : 0), 0)
  return {
    gain: endIdx / startIdx - 1, maxDD, deposits, withdrawals,
    startBalance: before?.balance ?? 0,
    points: inRange.map((p) => ({ ...p, rel: p.idx / startIdx - 1, ddRel: 0 })).map((p, i, arr) => {
      const pk = Math.max(startIdx, ...arr.slice(0, i + 1).map((q) => q.idx))
      return { ...p, ddRel: p.idx / pk - 1 }
    }),
  }
}

export function dailyMap(trades) {
  const m = new Map()
  for (const t of trades) {
    const k = dayKey(t.close_time)
    const d = m.get(k) || { pnl: 0, n: 0, wins: 0, trades: [] }
    d.pnl += +t.net_pnl; d.n++; if (t.net_pnl > 0.005) d.wins++; d.trades.push(t)
    m.set(k, d)
  }
  return m
}

export function breakdown(trades, keyFn, order) {
  const g = new Map()
  for (const t of trades) {
    const k = keyFn(t)
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(t)
  }
  const rows = [...g.entries()].map(([key, ts]) => ({ key, ...summarize(ts) }))
  if (order) return order.filter((k) => g.has(k)).map((k) => rows.find((r) => r.key === k))
  return rows.sort((a, b) => b.net - a.net)
}

export function periodRange(id) {
  // "Sekarang" dalam WIB (UTC+7, tanpa DST); tengah malam WIB = 17:00 UTC hari sebelumnya
  const wibNow = new Date(Date.now() + 7 * 3600e3)
  const midnight = (y, m, d) => +new Date(Date.UTC(y, m, d)) - 7 * 3600e3
  const y = wibNow.getUTCFullYear(), m = wibNow.getUTCMonth(), d = wibNow.getUTCDate()
  switch (id) {
    case 'today': return [midnight(y, m, d), null]
    case 'week': { const wd = (wibNow.getUTCDay() + 6) % 7; return [midnight(y, m, d - wd), null] }
    case 'month': return [midnight(y, m, 1), null]
    case '30d': return [Date.now() - 30 * 864e5, null]
    case '90d': return [Date.now() - 90 * 864e5, null]
    case 'ytd': return [midnight(y, 0, 1), null]
    default: return [null, null]
  }
}
export const PERIODS = [
  ['all', 'Semua'], ['today', 'Hari ini'], ['week', 'Minggu ini'], ['month', 'Bulan ini'],
  ['30d', '30 hari'], ['90d', '90 hari'], ['ytd', 'Tahun ini'],
]

/** Tag otomatis berbasis aturan. Mengembalikan Map position_id -> [tag]. */
export const TAGS = {
  no_sl: { label: 'Tanpa SL', tone: 'down' },
  martingale: { label: 'Martingale', tone: 'down' },
  revenge: { label: 'Revenge trade', tone: 'warn' },
  overtrade: { label: 'Overtrading', tone: 'warn' },
  sl_widened: { label: 'SL dilebarkan', tone: 'down' },
  counter_trend: { label: 'Melawan tren', tone: 'warn' },
  cut_profit: { label: 'Cut profit cepat', tone: 'warn' },
  hold_loser: { label: 'Hold loser', tone: 'warn' },
  weekend: { label: 'Lewat weekend', tone: 'muted' },
  rule_ok: { label: 'Sesuai aturan', tone: 'up' },
}
function widenedSet(trades, sltp = []) {
  const byPos = new Map(trades.map((t) => [t.position_id, t]))
  const logs = new Map()
  for (const l of sltp) { if (l.sl == null) continue; if (!logs.has(l.position_id)) logs.set(l.position_id, []); logs.get(l.position_id).push(+l.sl) }
  const out = new Set()
  for (const [pid, sls] of logs) {
    const t = byPos.get(pid)
    if (!t || sls.length < 2) continue
    const dist = (sl) => (t.direction === 'buy' ? t.open_price - sl : sl - t.open_price)
    let best = dist(sls[0])
    for (const sl of sls.slice(1)) { if (dist(sl) > best * 1.05 + 1e-9) { out.add(pid); break } best = Math.min(best, dist(sl)) }
  }
  return out
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

export function computeTags(trades, sltp) {
  const byOpen = [...trades].sort((a, b) => new Date(a.open_time) - new Date(b.open_time))
  const perDay = new Map()
  for (const t of byOpen) { const k = dayKey(t.open_time); perDay.set(k, (perDay.get(k) || 0) + 1) }
  const counts = [...perDay.values()]
  const avgDay = counts.length ? counts.reduce((s, c) => s + c, 0) / counts.length : 0
  const tags = new Map()
  const widened = widenedSet(trades, sltp)
  const winDurs = trades.filter((t) => t.net_pnl > 0).map((t) => t.duration_sec)
  const medWin = winDurs.length >= 10 ? median(winDurs) : null
  let prevClosed = null
  const closedSorted = [...trades].sort((a, b) => new Date(a.close_time) - new Date(b.close_time))
  let ci = 0
  for (const t of byOpen) {
    const tOpen = +new Date(t.open_time)
    while (ci < closedSorted.length && +new Date(closedSorted[ci].close_time) <= tOpen) prevClosed = closedSorted[ci++]
    const out = []
    if (!t.sl) out.push('no_sl')
    if (widened.has(t.position_id)) out.push('sl_widened')
    if ((t.trend_ctx === 'up' && t.direction === 'sell') || (t.trend_ctx === 'down' && t.direction === 'buy')) out.push('counter_trend')
    if (t.net_pnl > 0 && t.exit_efficiency != null && t.exit_efficiency < 0.3) out.push('cut_profit')
    if (t.net_pnl < 0 && medWin && t.duration_sec > medWin * 2 && t.duration_sec > 15 * 60) out.push('hold_loser')
    if (prevClosed && prevClosed.net_pnl < 0 && prevClosed.symbol === t.symbol && t.volume > prevClosed.volume * 1.4) out.push('martingale')
    if (prevClosed && prevClosed.net_pnl < 0 && tOpen - new Date(prevClosed.close_time) < 15 * 60e3) out.push('revenge')
    if (avgDay > 0 && perDay.get(dayKey(t.open_time)) >= Math.max(6, avgDay * 2)) out.push('overtrade')
    const o = new Date(t.open_time), c = new Date(t.close_time)
    if (c - o > 36e5 && (c.getUTCDay() < o.getUTCDay() || c - o > 5 * 864e5)) out.push('weekend')
    if (!out.some((x) => TAGS[x].tone !== 'muted')) out.push('rule_ok')
    tags.set(t.position_id, out)
  }
  return tags
}
