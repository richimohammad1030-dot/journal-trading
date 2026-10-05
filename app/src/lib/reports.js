// Rapor mingguan & bulanan, dihitung di aplikasi dari trade yang sudah tersinkron.
import { dayKey } from './format'
import { traderDNA } from './dna'
import { DAYS, SESSIONS, TAGS, breakdown, periodMetrics, session, summarize } from './stats'

const H7 = 7 * 3600e3
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// Tengah malam WIB untuk tanggal (y, m, d) kalender WIB, dalam epoch ms
const midnight = (y, m, d) => Date.UTC(y, m, d) - H7
const wib = (ms) => new Date(ms + H7) // getter UTC dari objek ini = komponen WIB

export function periodOf(kind, ms) {
  const w = wib(ms)
  const y = w.getUTCFullYear(), m = w.getUTCMonth(), d = w.getUTCDate()
  if (kind === 'month') {
    const from = midnight(y, m, 1), to = midnight(y, m + 1, 1)
    return { kind, from, to, key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTHS[m]} ${y}`, short: `${MON3[m]} ${y}` }
  }
  const wd = (w.getUTCDay() + 6) % 7 // Senin = 0
  const from = midnight(y, m, d - wd), to = from + 7 * 864e5
  const a = wib(from), b = wib(to - 1)
  const label = `${a.getUTCDate()} ${MON3[a.getUTCMonth()]} – ${b.getUTCDate()} ${MON3[b.getUTCMonth()]} ${b.getUTCFullYear()}`
  return { kind, from, to, key: dayKey(new Date(from).toISOString()), label, short: `${a.getUTCDate()} ${MON3[a.getUTCMonth()]}` }
}
export const previousPeriod = (p) => periodOf(p.kind, p.from - 1)

/** Semua periode yang punya trade, terbaru dulu. */
export function listPeriods(trades, kind) {
  const seen = new Map()
  for (const t of trades) {
    const p = periodOf(kind, +new Date(t.close_time))
    const r = seen.get(p.key) || { ...p, n: 0, net: 0, wins: 0 }
    r.n++; r.net += +t.net_pnl; if (t.net_pnl > 0.005) r.wins++
    seen.set(p.key, r)
  }
  const now = Date.now()
  return [...seen.values()].sort((a, b) => b.from - a.from).map((p) => ({ ...p, running: now < p.to }))
}

const inP = (p) => (t) => { const ts = +new Date(t.close_time); return ts >= p.from && ts < p.to }

function findings(trades, tags, cur) {
  const out = []
  const add = (impact, text, tone) => out.push({ impact, text, tone })
  const fmt = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)} ${cur}`
  if (trades.length < 3) return out
  const losses = trades.filter((t) => t.net_pnl < 0)

  for (const [name, fn, order] of [['sesi', (t) => session(t.open_time), SESSIONS], ['pair', (t) => t.symbol], ['hari', (t) => DAYS[wib(+new Date(t.open_time)).getUTCDay()]]]) {
    const rows = breakdown(trades, fn, order).filter((r) => r.n >= 3)
    if (rows.length < 2) continue
    const worst = [...rows].sort((a, b) => a.net - b.net)[0]
    const best = [...rows].sort((a, b) => b.net - a.net)[0]
    if (worst.net < 0) {
      const lossShare = losses.length ? losses.filter((t) => fn(t) === worst.key).length / losses.length : 0
      add(worst.net, `${name[0].toUpperCase() + name.slice(1)} ${worst.key} paling merugikan: ${worst.n} trade, ${fmt(worst.net)}${lossShare >= 0.4 ? `, ${Math.round(lossShare * 100)}% dari semua loss` : ''}.`, 'down')
    }
    if (best.net > 0 && best.key !== worst.key) add(best.net * 0.6, `${name[0].toUpperCase() + name.slice(1)} ${best.key} paling menguntungkan: ${best.n} trade, ${fmt(best.net)}, win rate ${Math.round(best.winRate * 100)}%.`, 'up')
  }
  for (const k of ['no_sl', 'martingale', 'revenge', 'counter_trend', 'hold_loser']) {
    const ts = trades.filter((t) => (tags.get(t.position_id) || []).includes(k))
    if (ts.length < 2) continue
    const s = summarize(ts)
    if (s.net < 0) add(s.net * 1.1, `${TAGS[k].label}: ${ts.length} trade dengan total ${fmt(s.net)}.`, 'down')
  }
  // perilaku setelah loss
  const byOpen = [...trades].sort((a, b) => new Date(a.open_time) - new Date(b.open_time))
  let lotUp = 0, afterLoss = 0
  for (let i = 1; i < byOpen.length; i++) {
    if (byOpen[i - 1].net_pnl < 0) { afterLoss++; if (+byOpen[i].volume > +byOpen[i - 1].volume * 1.4) lotUp++ }
  }
  if (afterLoss >= 3 && lotUp / afterLoss >= 0.3) add(-Math.abs(lotUp) * 5, `Lot dinaikkan setelah rugi pada ${lotUp} dari ${afterLoss} kesempatan.`, 'warn')
  return out.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 3)
}

export function buildReport({ allTrades, cashflows, curve, tags, period, cur }) {
  const prev = previousPeriod(period)
  const trades = allTrades.filter(inP(period))
  const prevTrades = allTrades.filter(inP(prev))
  const s = summarize(trades), ps = summarize(prevTrades)
  const pm = periodMetrics(curve, period.from, period.to), ppm = periodMetrics(curve, prev.from, prev.to)
  const upTo = (ms) => allTrades.filter((t) => +new Date(t.close_time) < ms)
  const dnaNow = traderDNA(upTo(period.to), tags), dnaPrev = traderDNA(upTo(prev.to), tags)
  const violations = ['no_sl', 'sl_widened', 'martingale', 'revenge', 'overtrade']
    .map((k) => ({ k, label: TAGS[k].label, n: trades.filter((t) => (tags.get(t.position_id) || []).includes(k)).length }))
  const cash = cashflows.filter((c) => { const ts = +new Date(c.time); return ts >= period.from && ts < period.to })
  const daily = new Map()
  for (const t of trades) { const k = dayKey(t.close_time); daily.set(k, (daily.get(k) || 0) + +t.net_pnl) }
  return {
    period, prev, trades, s, ps, pm, ppm, dnaNow, dnaPrev, violations, daily,
    findings: findings(trades, tags, cur),
    deposits: cash.filter((c) => c.amount > 0).reduce((a, c) => a + +c.amount, 0),
    withdrawals: cash.filter((c) => c.amount < 0).reduce((a, c) => a + +c.amount, 0),
    running: Date.now() < period.to,
  }
}
