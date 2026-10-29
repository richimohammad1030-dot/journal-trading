// Sync Binance USDⓈ-M Futures -> Supabase (read-only API key).
// Dipanggil pg_cron tiap 15 menit dengan header x-region: ap-southeast-1 (Binance memblokir IP Amerika).
// Rahasia (Edge Function secrets): BINANCE_API_KEY, BINANCE_API_SECRET. Header x-cron-secret dicocokkan ke app_secrets.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  type Bar, type Fill, type Funding, type OrderInfo, type Trade, buildSymbol, cashflowKind, compact, ctxWindow, excursions,
  execWindow, fundingTicket, isStable, iso, pickTimeframes, tfInterval, ticketOf, trendAt,
} from './lib.ts'

const FAPI = 'https://fapi.binance.com'
const SERVER = 'Binance-USDM'
const DAY = 864e5
const HISTORY_DAYS = 89 // userTrades hanya tersedia 3 bulan ke belakang
const BUDGET_MS = 115_000
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

class RateLimited extends Error {}
let t0 = 0
let current: { run?: number } = {}
const left = () => BUDGET_MS - (Date.now() - t0)

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function bget(path: string, params: Record<string, string | number | undefined> = {}, signed = true, base = FAPI) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v))
  const headers: Record<string, string> = {}
  if (signed) {
    q.set('timestamp', String(Date.now())); q.set('recvWindow', '10000')
    q.set('signature', await hmac(Deno.env.get('BINANCE_API_SECRET')!, q.toString()))
    headers['X-MBX-APIKEY'] = Deno.env.get('BINANCE_API_KEY')!
  }
  const r = await fetch(`${base}${path}?${q}`, { headers })
  const used = +(r.headers.get('x-mbx-used-weight-1m') || 0)
  if (r.status === 429 || r.status === 418) throw new RateLimited(`Binance rate limit (${r.status})`)
  const body = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`Binance ${path} ${r.status}: ${body?.msg ?? JSON.stringify(body)}`)
  if (used > 1900) throw new RateLimited('Bobot API per menit hampir habis')
  return body
}
const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p } catch (e) { if (e instanceof RateLimited) throw e; return fallback } }

function chunks(from: number, to: number, size = 7 * DAY - 60e3): [number, number][] {
  const out: [number, number][] = []
  for (let a = from; a < to; a += size) out.push([a, Math.min(to, a + size)])
  return out
}

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`DB: ${(error as { message?: string }).message ?? JSON.stringify(error)}`)
  return data
}

async function klines(symbol: string, tf: string, fromSec: number, toSec: number): Promise<Bar[]> {
  const out: Bar[] = []
  let start = Math.floor(fromSec) * 1000
  const end = Math.ceil(toSec) * 1000
  for (let i = 0; i < 6 && start < end; i++) {
    const rows = await bget('/fapi/v1/klines', { symbol, interval: tfInterval(tf), startTime: start, endTime: end, limit: 1500 }, false)
    if (!rows?.length) break
    for (const k of rows) out.push([Math.floor(k[0] / 1000), +k[1], +k[2], +k[3], +k[4]])
    if (rows.length < 1500) break
    start = rows.at(-1)[0] + 1
  }
  return out
}

function orderKind(type: string | undefined, clientId = ''): OrderInfo['kind'] {
  const t = (type || '').toUpperCase()
  if (clientId.startsWith('autoclose') || t === 'LIQUIDATION') return 'stop_out'
  if (t.startsWith('TAKE_PROFIT')) return 'tp'
  if (t.startsWith('STOP') || t === 'TRAILING_STOP_MARKET') return 'sl'
  return 'other'
}

async function run() {
  const now = Date.now()
  // ---- pemilik data (proyek ini satu pengguna)
  const owners = await must(sb.from('accounts').select('user_id'))
  const ids = [...new Set((owners as { user_id: string }[]).map((x) => x.user_id))]
  const userId = Deno.env.get('JOURNAL_USER_ID') || (ids.length === 1 ? ids[0] : null)
  if (!userId) throw new Error('Tidak bisa menentukan pemilik jurnal (set secret JOURNAL_USER_ID)')

  // ---- akun
  const acc = await bget('/fapi/v2/account')
  const existing = (await must(sb.from('accounts').select('id,login').eq('user_id', userId).eq('server', SERVER)) as { id: string; login: number }[])[0]
  let login = existing?.login
  if (!login) {
    const spot = await safe(bget('/api/v3/account', { omitZeroBalances: 'true' }, true, 'https://api.binance.com'), null)
    login = spot?.uid || 1
  }
  const accountRow = {
    user_id: userId, login, server: SERVER, name: 'Binance Futures', broker: 'Binance', currency: 'USDT', is_real: true,
    balance: +acc.totalWalletBalance, equity: +acc.totalMarginBalance, margin: +acc.totalInitialMargin,
    free_margin: +acc.availableBalance, server_tz_offset_min: 0,
  }
  const account = (await must(sb.from('accounts').upsert(accountRow, { onConflict: 'user_id,login,server' }).select('id').single())) as { id: string }
  const accountId = account.id
  const own = { account_id: accountId, user_id: userId }
  const run = (await must(sb.from('sync_runs').insert({ ...own }).select('id').single())) as { id: number }
  current.run = run.id

  const stRow = (await must(sb.from('sync_state').select('data').eq('account_id', accountId).maybeSingle())) as { data: Record<string, any> } | null
  const st: Record<string, any> = stRow?.data ?? {}
  st.fills_to ??= {}
  const histStart = now - HISTORY_DAYS * DAY
  let complete = true

  // ---- income: cashflow, funding, dan daftar simbol yang pernah ditradingkan
  let from = Math.max(st.income_to ?? 0, histStart)
  const symbols = new Set<string>(st.symbols ?? [])
  const cash: Record<string, unknown>[] = [], fundRows: Record<string, unknown>[] = []
  for (let i = 0; i < 30 && from < now; i++) {
    const rows = await bget('/fapi/v1/income', { startTime: from, endTime: now, limit: 1000 })
    for (const x of rows) {
      if (x.symbol) symbols.add(x.symbol)
      const amt = +x.income
      if (!isStable(x.asset)) continue
      if (x.incomeType === 'FUNDING_FEE') {
        fundRows.push({ ...own, ticket: fundingTicket(+x.tranId), time: iso(x.time), type: 11, entry: null, symbol: x.symbol, volume: 0, price: 0, profit: 0, commission: 0, swap: amt, fee: 0, magic: 0, comment: 'funding' })
        continue
      }
      const kind = cashflowKind(x.incomeType, amt)
      if (kind) cash.push({ ...own, ticket: +x.tranId % 2 ** 52, time: iso(x.time), kind, amount: amt, comment: x.incomeType + (x.info ? ` ${x.info}` : '') })
    }
    if (rows.length < 1000) { from = now; break }
    from = rows.at(-1).time + 1
  }
  st.income_to = Math.max(histStart, Math.min(from, now) - 10 * 60e3)
  if (cash.length) await must(sb.from('cashflows').upsert(cash, { onConflict: 'account_id,ticket' }))
  if (fundRows.length) await must(sb.from('deals').upsert(fundRows, { onConflict: 'account_id,ticket' }))

  const positions = ((await bget('/fapi/v2/positionRisk')) as any[]).filter((p) => Math.abs(+p.positionAmt) > 0)
  for (const p of positions) symbols.add(p.symbol)
  st.symbols = [...symbols]

  // ---- harga BNB untuk komisi yang dibayar dengan BNB
  let bnb: number | null = null
  const toQuote = async (amt: number, asset: string) => {
    if (isStable(asset)) return amt
    if (asset === 'BNB') { bnb ??= +(await bget('/fapi/v1/ticker/price', { symbol: 'BNBUSDT' }, false)).price; return amt * bnb }
    return 0
  }

  // ---- fill baru per simbol (jendela 7 hari)
  const touched = new Map<string, number>() // simbol -> waktu paling awal yang diambil ulang
  for (const sym of symbols) {
    const start = Math.max(histStart, (st.fills_to[sym] ?? 0) - 2 * DAY)
    for (const [a, b] of chunks(start, now)) {
      if (left() < 45_000) { complete = false; break }
      let s = a
      const rows: Record<string, unknown>[] = []
      for (let i = 0; i < 10; i++) {
        const got = await bget('/fapi/v1/userTrades', { symbol: sym, startTime: s, endTime: b, limit: 1000 })
        for (const f of got) {
          rows.push({
            ...own, ticket: ticketOf(sym, f.id), order_ticket: f.orderId, position_id: null, time: iso(f.time),
            type: f.side === 'BUY' ? 0 : 1, entry: null, reason: null, symbol: sym, volume: +f.qty, price: +f.price,
            profit: +f.realizedPnl, commission: -(await toQuote(+f.commission, f.commissionAsset)), swap: 0, fee: 0, magic: 0, comment: null,
          })
        }
        if (got.length < 1000) break
        s = got.at(-1).time + 1
      }
      if (rows.length) {
        await must(sb.from('deals').upsert(rows, { onConflict: 'account_id,ticket', ignoreDuplicates: false }))
        touched.set(sym, Math.min(touched.get(sym) ?? Infinity, a))
      }
      st.fills_to[sym] = b
    }
    if (!complete) break
  }
  for (const p of positions) if (!touched.has(p.symbol)) touched.set(p.symbol, now - 2 * DAY)

  // ---- rekonstruksi per simbol yang berubah
  let tradesCount = 0, dealsCount = 0
  const openBySymbol = new Map<string, ReturnType<typeof buildSymbol>['open']>()
  for (const [sym, changedFrom] of touched) {
    const dbFills = (await must(sb.from('deals').select('ticket,order_ticket,time,type,volume,price,profit,commission').eq('account_id', accountId).eq('symbol', sym).in('type', [0, 1]).order('time').limit(20000))) as any[]
    const fills: Fill[] = dbFills.map((d) => ({
      id: +d.ticket, ticket: +d.ticket, orderId: +d.order_ticket, symbol: sym, side: d.type === 0 ? 'BUY' : 'SELL',
      price: +d.price, qty: +d.volume, realizedPnl: +d.profit, commission: -d.commission, time: +new Date(d.time),
    }))
    const funding: Funding[] = ((await must(sb.from('deals').select('time,swap').eq('account_id', accountId).eq('symbol', sym).eq('type', 11).limit(20000))) as any[])
      .map((x) => ({ symbol: sym, time: +new Date(x.time), amount: +x.swap }))
    // Pertama: bangun tanpa info order untuk tahu rentang posisi yang perlu dilengkapi
    const draft = buildSymbol(fills, funding, new Map(), new Map(), [])
    const fresh = draft.trades.filter((t) => t.close_ms >= changedFrom - 60e3)
    const needFrom = Math.min(...fresh.map((t) => t.open_ms), draft.open?.openTime ?? Infinity)
    const orders = new Map<number, OrderInfo>()
    const sltp: OrderInfo[] = []
    if (isFinite(needFrom)) {
      for (const [a, b] of chunks(Math.max(needFrom - 60e3, now - 89 * DAY), now)) {
        const reg = await safe(bget('/fapi/v1/allOrders', { symbol: sym, startTime: a, endTime: b, limit: 1000 }), [] as any[])
        for (const o of reg) {
          const kind = orderKind(o.origType || o.type, o.clientOrderId)
          const info = { kind, price: +o.stopPrice || null, time: o.time, side: o.side }
          orders.set(+o.orderId, info)
          if (kind === 'sl' || kind === 'tp') sltp.push(info)
        }
        const algo = await safe(bget('/fapi/v1/allAlgoOrders', { symbol: sym, startTime: a, endTime: b, limit: 1000 }), [] as any)
        for (const o of (Array.isArray(algo) ? algo : algo?.orders ?? [])) {
          const kind = orderKind(o.orderType)
          const info = { kind, price: +o.triggerPrice || null, time: +o.createTime, side: o.side }
          if (o.actualOrderId && +o.actualOrderId > 0) orders.set(+o.actualOrderId, info)
          if (kind === 'sl' || kind === 'tp') sltp.push(info)
        }
      }
      sltp.sort((x, y) => x.time - y.time)
    }
    const posIds = [...fresh.map((t) => t.position_id), ...(draft.open ? [draft.open.id] : [])]
    const logs = posIds.length ? (await must(sb.from('position_sltp_log').select('position_id,sl,tp,seen_at').eq('account_id', accountId).in('position_id', posIds).order('seen_at'))) as any[] : []
    const hints = new Map<number, { sl?: number | null; tp?: number | null }>()
    for (const l of logs) { const h = hints.get(+l.position_id) ?? {}; h.sl ??= l.sl != null ? +l.sl : null; h.tp ??= l.tp != null ? +l.tp : null; hints.set(+l.position_id, h) }
    const built = buildSymbol(fills, funding, orders, hints, sltp)
    openBySymbol.set(sym, built.open)
    const upd = built.trades.filter((t) => t.close_ms >= changedFrom - 60e3)
      .map(({ open_ms: _a, close_ms: _b, ...t }: Trade) => ({ ...t, ...own, updated_at: iso(now) }))
    for (let i = 0; i < upd.length; i += 500) await must(sb.from('trades').upsert(upd.slice(i, i + 500), { onConflict: 'account_id,position_id' }))
    const dealUpd = built.dealRows.filter((d) => +new Date(d.time as string) >= changedFrom - 60e3).map((d) => ({ ...d, ...own }))
    for (let i = 0; i < dealUpd.length; i += 500) await must(sb.from('deals').upsert(dealUpd.slice(i, i + 500), { onConflict: 'account_id,ticket' }))
    tradesCount += upd.length; dealsCount += dealUpd.length
  }

  // ---- posisi terbuka + SL/TP yang sedang terpasang
  await must(sb.from('open_positions').delete().eq('account_id', accountId))
  const posRows = []
  for (const p of positions) {
    const amt = +p.positionAmt, dir = amt > 0 ? 'buy' : 'sell'
    const closeSide = amt > 0 ? 'SELL' : 'BUY'
    let open = openBySymbol.get(p.symbol)
    if (open === undefined) {
      const dbFills = (await must(sb.from('deals').select('ticket,order_ticket,time,type,volume,price,profit,commission').eq('account_id', accountId).eq('symbol', p.symbol).in('type', [0, 1]).order('time').limit(20000))) as any[]
      open = buildSymbol(dbFills.map((d) => ({ id: +d.ticket, ticket: +d.ticket, orderId: +d.order_ticket, symbol: p.symbol, side: d.type === 0 ? 'BUY' : 'SELL', price: +d.price, qty: +d.volume, realizedPnl: +d.profit, commission: -d.commission, time: +new Date(d.time) })), [], new Map(), new Map(), []).open
    }
    const reg = await safe(bget('/fapi/v1/openOrders', { symbol: p.symbol }), [] as any[])
    const algo = await safe(bget('/fapi/v1/openAlgoOrders', { symbol: p.symbol }), [] as any)
    const cands = [
      ...reg.map((o: any) => ({ kind: orderKind(o.origType || o.type), price: +o.stopPrice, side: o.side })),
      ...(Array.isArray(algo) ? algo : algo?.orders ?? []).map((o: any) => ({ kind: orderKind(o.orderType), price: +o.triggerPrice, side: o.side })),
    ].filter((o) => o.side === closeSide && o.price > 0)
    const sl = cands.find((o) => o.kind === 'sl')?.price ?? null
    const tp = cands.find((o) => o.kind === 'tp')?.price ?? null
    const ticket = open?.id ?? ticketOf(p.symbol, 0)
    posRows.push({
      ...own, ticket, symbol: p.symbol, direction: dir, volume: Math.abs(amt), open_time: open ? iso(open.openTime) : iso(+p.updateTime),
      open_price: +p.entryPrice, current_price: +p.markPrice, sl, tp, profit: +p.unRealizedProfit, swap: 0, magic: 0, source: 'other',
    })
    const last = (await must(sb.from('position_sltp_log').select('sl,tp').eq('account_id', accountId).eq('position_id', ticket).order('seen_at', { ascending: false }).limit(1))) as any[]
    const prev = last[0]
    if (!prev || (prev.sl != null ? +prev.sl : null) !== sl || (prev.tp != null ? +prev.tp : null) !== tp) {
      await must(sb.from('position_sltp_log').insert({ ...own, position_id: ticket, sl, tp }))
    }
  }
  if (posRows.length) await must(sb.from('open_positions').upsert(posRows, { onConflict: 'account_id,ticket' }))

  // ---- chart, MAE/MFE, tren untuk trade yang belum diproses
  let charted = 0
  if (left() > 25_000) {
    const pending = (await must(sb.from('trades').select('position_id,symbol,direction,volume,open_time,close_time,open_price,close_price,profit,risk_amount,duration_sec')
      .eq('account_id', accountId).is('chart_tf', null).gte('close_time', iso(now - 89 * DAY)).order('close_time', { ascending: false }).limit(60))) as any[]
    const info = pending.length ? await bget('/fapi/v1/exchangeInfo', {}, false) : null
    const digitsOf = (sym: string) => info?.symbols?.find((x: any) => x.symbol === sym)?.pricePrecision ?? 4
    for (const t0r of pending) {
      if (left() < 15_000) { complete = false; break }
      const t: Trade = { ...t0r, open_price: +t0r.open_price, close_price: +t0r.close_price, profit: +t0r.profit, volume: +t0r.volume, risk_amount: t0r.risk_amount != null ? +t0r.risk_amount : null, open_ms: +new Date(t0r.open_time), close_ms: +new Date(t0r.close_time) }
      const o = t.open_ms / 1000, c = t.close_ms / 1000
      const [execTf, ctxTf] = pickTimeframes(t0r.duration_sec ?? c - o)
      const ex = await safe(klines(t0r.symbol, execTf, ...execWindow(o, c, execTf)), [] as Bar[])
      const ctx = ex.length ? await safe(klines(t0r.symbol, ctxTf, ...ctxWindow(o, c, ctxTf)), [] as Bar[]) : []
      let fine = ex
      if (execTf !== 'M1' && c - o <= 3 * 86400) fine = (await safe(klines(t0r.symbol, 'M1', o - 60, c + 60), [] as Bar[])) || ex
      const digits = digitsOf(t0r.symbol)
      const extra = ex.length ? excursions(t, fine.length ? fine : ex) : {}
      await must(sb.from('trades').update({ ...extra, trend_ctx: ctx.length ? trendAt(ctx, o) : null, chart_tf: execTf, ctx_tf: ctx.length ? ctxTf : null })
        .eq('account_id', accountId).eq('position_id', t0r.position_id))
      const bars = [{ ...own, position_id: t0r.position_id, tf: execTf, kind: 'exec', bars: compact(ex, digits) }]
      if (ctx.length) bars.push({ ...own, position_id: t0r.position_id, tf: ctxTf, kind: 'ctx', bars: compact(ctx, digits) })
      if (ex.length) await must(sb.from('trade_bars').upsert(bars, { onConflict: 'account_id,position_id,kind' }))
      charted++
    }
  }

  // ---- saldo awal (perkiraan): riwayat API hanya 3 bulan, jadi saldo sebelum itu dihitung mundur
  const sums = (await must(sb.rpc('binance_opening_balance_inputs', { p_account: accountId }))) as any
  const opening = +acc.totalWalletBalance - (+sums.trades_net || 0) - (+sums.cash || 0)
  if (sums.first_time && Math.abs(opening) > 0.005) {
    await must(sb.from('cashflows').upsert({ ...own, ticket: 1, time: iso(+new Date(sums.first_time) - 1000), kind: opening >= 0 ? 'deposit' : 'withdrawal', amount: +opening.toFixed(4), comment: 'Saldo awal (perkiraan dari saldo sekarang)' }, { onConflict: 'account_id,ticket' }))
  }

  await must(sb.from('account_snapshots').insert({ ...own, balance: +acc.totalWalletBalance, equity: +acc.totalMarginBalance, margin: +acc.totalInitialMargin, floating: +acc.totalUnrealizedProfit }))
  const done = iso(Date.now())
  await must(sb.from('accounts').update({ last_sync_at: done }).eq('id', accountId))
  await must(sb.from('sync_state').upsert({ ...own, data: st, updated_at: done }, { onConflict: 'account_id' }))
  await must(sb.from('sync_runs').update({ finished_at: done, status: 'ok', deals_count: dealsCount, trades_count: tradesCount, message: complete ? null : 'sebagian; dilanjutkan di sync berikutnya' }).eq('id', run.id))
  return { ok: true, complete, symbols: symbols.size, trades: tradesCount, deals: dealsCount, positions: posRows.length, charted, ms: Date.now() - t0 }
}

Deno.serve(async (req) => {
  t0 = Date.now(); current = {}
  const given = req.headers.get('x-cron-secret') ?? ''
  const { data } = await sb.from('app_secrets').select('value').eq('name', 'binance_cron').maybeSingle()
  if (!data?.value || given !== data.value) return new Response('forbidden', { status: 403 })
  if (!Deno.env.get('BINANCE_API_KEY') || !Deno.env.get('BINANCE_API_SECRET')) return Response.json({ ok: false, error: 'BINANCE_API_KEY / BINANCE_API_SECRET belum diisi' }, { status: 500 })
  try {
    return Response.json(await run())
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(msg)
    if (current.run) await sb.from('sync_runs').update({ finished_at: iso(Date.now()), status: 'error', message: msg.slice(0, 500) }).eq('id', current.run)
    return Response.json({ ok: false, error: msg }, { status: e instanceof RateLimited ? 429 : 500 })
  }
})
