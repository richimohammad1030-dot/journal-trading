import { useMemo, useState } from 'react'
import Calendar from '../components/Calendar'
import TradeRow from '../components/TradeRow'
import { Card, Pnl } from '../components/ui'
import { dailyMap } from '../lib/stats'
import { fmtDate, pct } from '../lib/format'

export default function CalendarPage({ ctx }) {
  const { allTrades, account, tags, openTrade } = ctx
  const daily = useMemo(() => dailyMap(allTrades), [allTrades])
  const now = new Date(Date.now() + 7 * 3600e3)
  const [ym, setYm] = useState([now.getUTCFullYear(), now.getUTCMonth()])
  const [sel, setSel] = useState(null)
  const move = (d) => setYm(([y, m]) => { const n = new Date(Date.UTC(y, m + d, 1)); return [n.getUTCFullYear(), n.getUTCMonth()] })
  const day = sel ? daily.get(sel) : null
  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
      <Card><Calendar year={ym[0]} month={ym[1]} daily={daily} cur={account.currency} selected={sel} onSelect={setSel} onMonth={move} /></Card>
      <Card pad={false} title={sel ? fmtDate(sel + 'T05:00:00Z', { weekday: 'long', year: 'numeric', month: 'long' }) : 'Detail hari'}>
        {!sel && <div className="px-4 pb-4 text-sm text-muted">Ketuk satu hari di kalender untuk melihat trade-nya.</div>}
        {sel && !day && <div className="px-4 pb-4 text-sm text-muted">Tidak ada trade yang ditutup di hari ini.</div>}
        {day && (
          <>
            <div className="flex items-baseline justify-between px-4 pb-3">
              <Pnl v={day.pnl} cur={account.currency} className="text-2xl font-semibold" />
              <span className="text-[12px] text-muted">{day.n} trade · win {pct(day.wins / day.n, 0)}</span>
            </div>
            <div className="divide-y divide-line border-t border-line">
              {day.trades.map((t) => <TradeRow key={t.position_id} t={t} cur={account.currency} tags={tags.get(t.position_id)} onOpen={(x) => openTrade(x, day.trades)} />)}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
