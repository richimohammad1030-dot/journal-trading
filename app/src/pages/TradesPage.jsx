import { useMemo, useState } from 'react'
import TradeRow from '../components/TradeRow'
import { Card, Chips, Empty, Pnl } from '../components/ui'
import { SOURCE_LABEL, TAGS, outcome, summarize } from '../lib/stats'
import { pct } from '../lib/format'

const SORTS = { time: (a, b) => new Date(b.close_time) - new Date(a.close_time), pnl: (a, b) => b.net_pnl - a.net_pnl, r: (a, b) => (b.r_multiple ?? -1e9) - (a.r_multiple ?? -1e9), dur: (a, b) => b.duration_sec - a.duration_sec, lot: (a, b) => b.volume - a.volume }

export default function TradesPage({ ctx }) {
  const { trades, account, tags, openTrade } = ctx
  const [res, setRes] = useState('all')
  const [sym, setSym] = useState('all')
  const [src, setSrc] = useState('all')
  const [tag, setTag] = useState('all')
  const [sort, setSort] = useState('time')
  const [q, setQ] = useState('')
  const symbols = useMemo(() => [...new Set(trades.map((t) => t.symbol))].sort(), [trades])
  const sources = useMemo(() => [...new Set(trades.map((t) => t.source))], [trades])
  const list = useMemo(() => trades.filter((t) =>
    (res === 'all' || outcome(t) === res) && (sym === 'all' || t.symbol === sym) && (src === 'all' || t.source === src) &&
    (tag === 'all' || (tags.get(t.position_id) || []).includes(tag)) && (!q || String(t.position_id).includes(q.trim()))
  ).sort(SORTS[sort]), [trades, res, sym, src, tag, sort, q, tags])
  const s = summarize(list)
  const sel = 'bg-surface border border-line rounded-xl px-3 py-2 text-[13px] text-ink'
  return (
    <div className="space-y-3">
      <div className="card p-3 space-y-2.5">
        <Chips value={res} onChange={setRes} options={[['all', 'Semua'], ['win', 'Menang'], ['loss', 'Kalah'], ['be', 'Impas']]} />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select className={sel} value={sym} onChange={(e) => setSym(e.target.value)}><option value="all">Semua pair</option>{symbols.map((x) => <option key={x}>{x}</option>)}</select>
          <select className={sel} value={src} onChange={(e) => setSrc(e.target.value)}><option value="all">Semua sumber</option>{sources.map((x) => <option key={x} value={x}>{SOURCE_LABEL[x] || x}</option>)}</select>
          <select className={sel} value={tag} onChange={(e) => setTag(e.target.value)}><option value="all">Semua tag</option>{Object.entries(TAGS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select className={sel} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="time">Terbaru</option><option value="pnl">P/L terbesar</option><option value="r">R terbesar</option><option value="dur">Durasi terlama</option><option value="lot">Lot terbesar</option>
          </select>
          <input className={`${sel} col-span-2 md:col-span-1`} placeholder="Cari no. tiket" inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center justify-between px-1 text-[12.5px] text-muted">
        <span>{list.length} trade · win {pct(s.winRate, 0)}</span>
        <Pnl v={s.net} cur={account.currency} className="font-semibold" />
      </div>
      <Card pad={false}>
        {list.length === 0 ? <Empty title="Tidak ada trade yang cocok">Coba longgarkan filter.</Empty> : (
          <div className="divide-y divide-line">
            {list.slice(0, 400).map((t) => <TradeRow key={t.position_id} t={t} cur={account.currency} tags={tags.get(t.position_id)} onOpen={(x) => openTrade(x, list)} />)}
          </div>
        )}
      </Card>
      {list.length > 400 && <div className="text-center text-[12px] text-faint">Menampilkan 400 trade pertama. Persempit filter untuk melihat sisanya.</div>}
    </div>
  )
}
