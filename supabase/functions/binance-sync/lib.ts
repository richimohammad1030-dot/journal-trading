// Logika murni sync Binance USDⓈ-M Futures (tanpa jaringan), supaya bisa diuji di mana saja.
// Mode posisi: One-way. Semua waktu dalam milidetik epoch UTC.

export type Fill = {
  id: number; orderId: number; symbol: string; side: 'BUY' | 'SELL'; price: number; qty: number
  realizedPnl: number; commission: number; time: number; ticket: number
}
export type Funding = { symbol: string; time: number; amount: number }
export type OrderInfo = { kind: 'sl' | 'tp' | 'stop_out' | 'other'; price?: number | null; time: number; side: string; closesOrderId?: number | null }

const EPS = 1e-12
export const iso = (ms: number) => new Date(ms).toISOString()

/** Hash simbol 12 bit: tiket fill = hash·2^40 + id < 2^52. Rentang [2^52, 2^53) dipakai tiket funding. */
export function symHash(symbol: string): number {
  let h = 2166136261
  for (const c of symbol) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return h & 0xfff
}
export const ticketOf = (symbol: string, id: number) => symHash(symbol) * 2 ** 40 + (id % 2 ** 40)
export const fundingTicket = (tranId: number) => 2 ** 52 + (tranId % 2 ** 51)

type Part = { f: Fill; qty: number; frac: number }
type Pos = { dir: 1 | -1; id: number; ins: Part[]; outs: Part[]; qty: number }

export type Built = {
  trades: Trade[]
  open: { id: number; dir: 1 | -1; qty: number; openTime: number; openPrice: number } | null
  dealRows: Record<string, unknown>[]
}
export type Trade = Record<string, unknown> & { position_id: number; open_ms: number; close_ms: number }

const wavg = (ps: Part[]) => {
  const q = ps.reduce((s, p) => s + p.qty, 0)
  return q > EPS ? ps.reduce((s, p) => s + p.qty * p.f.price, 0) / q : null
}

/**
 * Susun fill satu simbol (urut waktu) menjadi trade.
 * Fill penutup tanpa posisi pembuka di riwayat (posisi dibuka sebelum batas data) dilewati.
 */
export function buildSymbol(fills: Fill[], funding: Funding[], orders: Map<number, OrderInfo>, slHints: Map<number, { sl?: number | null; tp?: number | null }>, sltpOrders: OrderInfo[]): Built {
  const sorted = [...fills].sort((a, b) => a.time - b.time || a.id - b.id)
  const trades: Trade[] = []
  const dealRows: Record<string, unknown>[] = []
  let pos: Pos | null = null

  const finish = (p: Pos) => {
    const sym = p.ins[0].f.symbol
    const openMs = p.ins[0].f.time, closeMs = p.outs.at(-1)!.f.time
    const openPrice = wavg(p.ins)!, closePrice = wavg(p.outs)!
    const vol = p.ins.reduce((s, x) => s + x.qty, 0)
    const profit = p.outs.reduce((s, x) => s + x.f.realizedPnl * x.frac, 0)
    const commission = -[...p.ins, ...p.outs].reduce((s, x) => s + x.f.commission * x.frac, 0)
    const swap = funding.filter((x) => x.symbol === sym && x.time > openMs && x.time <= closeMs + 1000).reduce((s, x) => s + x.amount, 0)
    const netPnl = profit + commission + swap
    const last = p.outs.at(-1)!.f
    const info = orders.get(last.orderId)
    let closeReason = info?.kind === 'sl' || info?.kind === 'tp' || info?.kind === 'stop_out' ? info.kind : 'manual'
    // SL/TP: order kondisional yang dipasang selama posisi hidup (yang pertama = rencana awal)
    const closeSide = p.dir === 1 ? 'SELL' : 'BUY'
    const live = sltpOrders.filter((o) => o.side === closeSide && o.time >= openMs - 60e3 && o.time <= closeMs && o.price)
    let sl = live.find((o) => o.kind === 'sl')?.price ?? null
    let tp = live.find((o) => o.kind === 'tp')?.price ?? null
    const hint = slHints.get(p.id)
    sl = sl ?? hint?.sl ?? null
    tp = tp ?? hint?.tp ?? null
    if (closeReason === 'sl' && sl == null) sl = info?.price ?? last.price
    if (closeReason === 'tp' && tp == null) tp = info?.price ?? last.price
    // SL yang ada di sisi untung (trailing/break-even) tidak dipakai sebagai ukuran risiko
    const slRisky = sl != null && (p.dir === 1 ? sl < openPrice : sl > openPrice)
    const vpp = Math.abs(closePrice - openPrice) > EPS && Math.abs(profit) > EPS ? Math.abs(profit) / Math.abs(closePrice - openPrice) : vol
    const risk = slRisky ? Math.abs(openPrice - sl!) * vpp : null
    trades.push({
      position_id: p.id, symbol: sym, direction: p.dir === 1 ? 'buy' : 'sell', volume: +vol.toFixed(8),
      open_time: iso(openMs), close_time: iso(closeMs), open_price: openPrice, close_price: closePrice,
      sl, tp, profit: +profit.toFixed(4), commission: +commission.toFixed(4), swap: +swap.toFixed(4), fee: 0,
      net_pnl: +netPnl.toFixed(4), points: null, pips: null, duration_sec: Math.round((closeMs - openMs) / 1000),
      magic: 0, source: 'other', close_reason: closeReason, partial_closes: Math.max(0, p.outs.length - 1),
      risk_amount: risk && risk > 0 ? +risk.toFixed(4) : null, r_multiple: risk && risk > 0 ? +(netPnl / risk).toFixed(2) : null,
      comment: null, open_ms: openMs, close_ms: closeMs,
    })
  }

  for (const f of sorted) {
    const s = f.side === 'BUY' ? 1 : -1
    let q = f.qty
    if (!pos) {
      if (Math.abs(f.realizedPnl) > EPS) { // menutup posisi yang dibuka sebelum riwayat tersedia
        dealRows.push(dealRow(f, null, 1)); continue
      }
      pos = { dir: s as 1 | -1, id: f.ticket, ins: [], outs: [], qty: 0 }
    }
    if (s === pos.dir) {
      pos.ins.push({ f, qty: q, frac: 1 }); pos.qty += q
      dealRows.push(dealRow(f, pos.id, 0))
      continue
    }
    const closeQty = Math.min(q, pos.qty)
    const frac = closeQty / q
    pos.outs.push({ f, qty: closeQty, frac }); pos.qty -= closeQty
    q -= closeQty
    const flip = q > EPS
    dealRows.push(dealRow(f, pos.id, flip ? 2 : 1))
    if (pos.qty <= EPS * 1e3) {
      finish(pos); pos = null
      if (flip) {
        // id negatif: posisi hasil pembalikan arah, agar tidak bentrok dengan tiket fill lain
        pos = { dir: s as 1 | -1, id: -f.ticket, ins: [{ f, qty: q, frac: 1 - frac }], outs: [], qty: q }
      }
    }
  }
  const open = pos && pos.ins.length ? { id: pos.id, dir: pos.dir, qty: pos.qty, openTime: pos.ins[0].f.time, openPrice: wavg(pos.ins)! } : null
  return { trades, open, dealRows }
}

function dealRow(f: Fill, positionId: number | null, entry: number) {
  return {
    ticket: f.ticket, order_ticket: f.orderId, position_id: positionId, time: iso(f.time),
    type: f.side === 'BUY' ? 0 : 1, entry, reason: null, symbol: f.symbol, volume: f.qty, price: f.price,
    profit: f.realizedPnl, commission: -f.commission, swap: 0, fee: 0, magic: 0, comment: null,
  }
}

/* ---------------- konteks harga (port dari sync-agent/price_context.py) ---------------- */
export type Bar = [number, number, number, number, number] // detik, o, h, l, c
export const TFS: [string, number, string][] = [['M1', 60, '1m'], ['M5', 300, '5m'], ['M15', 900, '15m'], ['H1', 3600, '1h'], ['H4', 14400, '4h'], ['D1', 86400, '1d']]
export const tfSec = (tf: string) => TFS.find((t) => t[0] === tf)![1]
export const tfInterval = (tf: string) => TFS.find((t) => t[0] === tf)![2]

export function pickTimeframes(durationSec: number): [string, string] {
  let exec = 'D1'
  for (const [n, sec] of TFS) if (Math.max(durationSec, 1) / sec <= 120) { exec = n; break }
  const i = TFS.findIndex((t) => t[0] === exec)
  return [exec, TFS[Math.min(i + 1, TFS.length - 1)][0]]
}
export function execWindow(o: number, c: number, tf: string): [number, number] {
  const sec = tfSec(tf), dur = Math.max(c - o, sec)
  return [o - Math.max(40 * sec, 0.6 * dur), c + Math.max(20 * sec, 0.3 * dur)]
}
export const ctxWindow = (o: number, c: number, tf: string): [number, number] => [o - 120 * tfSec(tf), c + 10 * tfSec(tf)]

export function excursions(t: Trade, bars: Bar[]) {
  const o = (t.open_ms as number) / 1000, c = (t.close_ms as number) / 1000
  const step = bars.length > 1 ? bars[1][0] - bars[0][0] : 60
  const inside = bars.filter((b) => b[0] + step > o && (b[0] < c || b[0] <= o))
  if (!inside.length) return {}
  const op = t.open_price as number, cp = t.close_price as number
  const hi = Math.max(...inside.map((b) => b[2]), op, cp), lo = Math.min(...inside.map((b) => b[3]), op, cp)
  const buy = t.direction === 'buy'
  const mfe = buy ? hi - op : op - lo, mae = buy ? op - lo : hi - op, cap = buy ? cp - op : op - cp
  const profit = t.profit as number
  const vpp = Math.abs(cp - op) > EPS && Math.abs(profit) > EPS ? Math.abs(profit) / Math.abs(cp - op) : (t.volume as number)
  const amt = (d: number) => +(d * vpp).toFixed(4)
  const risk = t.risk_amount as number | null
  return {
    mae: +mae.toFixed(8), mfe: +mfe.toFixed(8), mae_amount: amt(mae), mfe_amount: amt(mfe), mae_pips: null, mfe_pips: null,
    exit_efficiency: mfe > 0 ? +(cap / mfe).toFixed(3) : null,
    mae_r: risk ? +(amt(mae) / risk).toFixed(2) : null, mfe_r: risk ? +(amt(mfe) / risk).toFixed(2) : null,
  }
}
export function trendAt(ctx: Bar[], openSec: number, n = 50): string | null {
  const hist = ctx.filter((b) => b[0] <= openSec)
  if (hist.length < n / 2) return null
  const k = 2 / (n + 1)
  const e: number[] = []
  for (const b of hist) e.push(e.length ? b[4] * k + e.at(-1)! * (1 - k) : b[4])
  const slope = e.length > 6 ? e.at(-1)! - e.at(-6)! : 0
  const last = hist.at(-1)![4]
  return last > e.at(-1)! && slope > 0 ? 'up' : last < e.at(-1)! && slope < 0 ? 'down' : 'flat'
}
export const compact = (bars: Bar[], digits: number) => bars.map((b) => [b[0], ...b.slice(1).map((v) => +v.toFixed(digits))])

/* ---------------- cashflow dari income history ---------------- */
const STABLE = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD'])
export function cashflowKind(type: string, amount: number): string | null {
  if (['REALIZED_PNL', 'COMMISSION', 'FUNDING_FEE'].includes(type)) return null
  if (['TRANSFER', 'INTERNAL_TRANSFER', 'CROSS_COLLATERAL_TRANSFER', 'STRATEGY_UMFUTURES_TRANSFER', 'COIN_SWAP_DEPOSIT', 'COIN_SWAP_WITHDRAW', 'AUTO_EXCHANGE'].includes(type)) return amount >= 0 ? 'deposit' : 'withdrawal'
  if (['WELCOME_BONUS', 'REFERRAL_KICKBACK', 'COMMISSION_REBATE', 'API_REBATE', 'CONTEST_REWARD', 'POSITION_LIMIT_INCREASE_FEE'].includes(type)) return 'bonus'
  return 'correction'
}
export const isStable = (asset: string) => STABLE.has(asset)
