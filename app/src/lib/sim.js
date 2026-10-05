// Simulasi "bagaimana jika": hitung ulang riwayat yang sama dengan aturan berbeda.
// Data asli tidak diubah; hasilnya hanya untuk perbandingan.
import { dayKey } from './format'
import { session } from './stats'

export const DEFAULT_RULES = {
  dropNoSl: false,          // buang trade tanpa SL
  dropTags: [],             // buang trade dengan tag tertentu
  sessions: [],             // kosong = semua sesi; selain itu hanya sesi ini
  symbols: [],              // kosong = semua pair; selain itu hanya pair ini
  maxPerDay: 0,             // 0 = tanpa batas
  stopAfterLosses: 0,       // berhenti hari itu setelah N rugi beruntun, 0 = tidak
  fixedRiskPct: 0,          // >0: P/L dihitung ulang = R × risiko% × balance (hanya trade ber-R)
}

/**
 * @param trades   trade periode terpilih, terurut close_time, dengan balance_before
 * @param startBal balance pada awal periode
 * @param cashflows deposit/withdrawal di dalam periode
 */
export function simulate(trades, tags, rules, startBal, cashflows = []) {
  const r = { ...DEFAULT_RULES, ...rules }
  // 1) filter statis
  let kept = trades.filter((t) => {
    if (r.dropNoSl && !t.sl) return false
    if (r.dropTags.length && (tags.get(t.position_id) || []).some((k) => r.dropTags.includes(k))) return false
    if (r.sessions.length && !r.sessions.includes(session(t.open_time))) return false
    if (r.symbols.length && !r.symbols.includes(t.symbol)) return false
    if (r.fixedRiskPct > 0 && t.r_multiple == null) return false
    return true
  })
  // 2) aturan harian berdasarkan urutan buka
  if (r.maxPerDay > 0 || r.stopAfterLosses > 0) {
    const byOpen = [...kept].sort((a, b) => new Date(a.open_time) - new Date(b.open_time))
    const allow = new Set(), count = new Map(), streak = new Map()
    for (const t of byOpen) {
      const d = dayKey(t.open_time)
      if (r.maxPerDay > 0 && (count.get(d) || 0) >= r.maxPerDay) continue
      if (r.stopAfterLosses > 0 && (streak.get(d) || 0) >= r.stopAfterLosses) continue
      allow.add(t.position_id)
      count.set(d, (count.get(d) || 0) + 1)
      streak.set(d, t.net_pnl < 0 ? (streak.get(d) || 0) + 1 : 0)
    }
    kept = kept.filter((t) => allow.has(t.position_id))
  }
  // 3) kurva balance, dengan P/L yang dihitung ulang bila risiko tetap
  const ev = [
    ...cashflows.map((c) => ({ ts: +new Date(c.time), cash: +c.amount })),
    ...kept.map((t) => ({ ts: +new Date(t.close_time), t })),
  ].sort((a, b) => a.ts - b.ts)
  let bal = startBal, idx = 1, peak = 1, maxDD = 0, gp = 0, gl = 0, wins = 0
  const points = [], pnls = []
  for (const e of ev) {
    if (e.cash != null) { bal += e.cash; continue }
    const pnl = r.fixedRiskPct > 0 ? +e.t.r_multiple * (r.fixedRiskPct / 100) * Math.max(bal, 0) : +e.t.net_pnl
    if (bal > 0) idx *= 1 + pnl / bal
    bal += pnl
    peak = Math.max(peak, idx); maxDD = Math.min(maxDD, idx / peak - 1)
    if (pnl > 0) { gp += pnl; wins++ } else gl -= pnl
    pnls.push(pnl)
    points.push({ ts: e.ts, idx })
  }
  const n = kept.length
  return {
    n, net: gp - gl, gain: idx - 1, maxDD, endBalance: bal,
    winRate: n ? wins / n : null, profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : null,
    expectancy: n ? (gp - gl) / n : null, points, keptIds: new Set(kept.map((t) => t.position_id)),
  }
}
