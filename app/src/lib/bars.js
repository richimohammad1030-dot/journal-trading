// Timeframe dan data harga contoh (untuk mode demo). Logika timeframe sama dengan sync agent.
export const TFS = [['M1', 60], ['M5', 300], ['M15', 900], ['H1', 3600], ['H4', 14400], ['D1', 86400]]
const SEC = Object.fromEntries(TFS)

export function pickTimeframes(durationSec) {
  let i = TFS.findIndex(([, s]) => Math.max(durationSec, 1) / s <= 120)
  if (i < 0) i = TFS.length - 1
  return [TFS[i][0], TFS[Math.min(i + 1, TFS.length - 1)][0]]
}

function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/**
 * Jalur harga sintetis yang melewati entry, titik MAE, titik MFE, lalu exit.
 * Hanya untuk demo; data asli datang dari MT5 lewat sync agent.
 */
export function demoBars(t, kind) {
  const [execTf, ctxTf] = pickTimeframes(t.duration_sec)
  const tf = kind === 'ctx' ? ctxTf : execTf
  const step = SEC[tf]
  const o = Math.floor(+new Date(t.open_time) / 1000), c = Math.floor(+new Date(t.close_time) / 1000)
  const pipSize = Math.abs(t.close_price - t.open_price) / Math.max(Math.abs(t.pips || 0), 0.1) || 0.0001
  const sgn = t.direction === 'buy' ? 1 : -1
  const op = +t.open_price, cp = +t.close_price
  const maeP = op - sgn * (t.mae_pips || 0) * pipSize
  const mfeP = op + sgn * (t.mfe_pips || 0) * pipSize
  const r = rng(t.position_id * 7 + (kind === 'ctx' ? 3 : 1))
  const dur = Math.max(c - o, step)
  const from = kind === 'ctx' ? o - 120 * step : o - Math.max(40 * step, 0.6 * dur)
  const to = kind === 'ctx' ? c + 10 * step : c + Math.max(20 * step, 0.3 * dur)
  const firstMae = r() < 0.6
  const k1 = o + dur * (0.15 + r() * 0.3), k2 = o + dur * (0.5 + r() * 0.35)
  const knots = [[from, op - sgn * (r() - 0.3) * 40 * pipSize], [o, op],
    [k1, firstMae ? maeP : mfeP], [k2, firstMae ? mfeP : maeP], [c, cp], [to, cp + (r() - 0.5) * 30 * pipSize]]
  const at = (ts) => {
    for (let i = 1; i < knots.length; i++) {
      if (ts <= knots[i][0]) { const [a, pa] = knots[i - 1], [b, pb] = knots[i]; return pa + ((ts - a) / Math.max(b - a, 1)) * (pb - pa) }
    }
    return knots.at(-1)[1]
  }
  const noise = (kind === 'ctx' ? 6 : 2.5) * pipSize * Math.sqrt(step / 60)
  const bars = []
  let prev = at(from)
  for (let ts = Math.floor(from / step) * step; ts < to; ts += step) {
    const close = at(ts + step) + (r() - 0.5) * noise
    const inTrade = ts + step > o && ts < c
    let hi = Math.max(prev, close) + r() * noise * 0.6, lo = Math.min(prev, close) - r() * noise * 0.6
    if (inTrade) { hi = Math.min(hi, Math.max(maeP, mfeP)); lo = Math.max(lo, Math.min(maeP, mfeP)) }
    bars.push([ts, prev, Math.max(hi, prev, close), Math.min(lo, prev, close), close])
    prev = close
  }
  return { tf, bars }
}
