import { fmtDate, fmtTime, duration, num } from '../lib/format'
import { TAGS } from '../lib/stats'
import { Pnl } from './ui'

export default function TradeRow({ t, cur, tags = [], onOpen }) {
  const bad = tags.filter((k) => TAGS[k].tone === 'down' || TAGS[k].tone === 'warn')
  return (
    <button onClick={() => onOpen(t)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-raised/60 active:bg-raised transition-colors">
      <div className={`w-1 self-stretch rounded-full ${t.net_pnl > 0 ? 'bg-up' : t.net_pnl < 0 ? 'bg-down' : 'bg-faint'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[14.5px]">{t.symbol}</span>
          <span className={`text-[10.5px] font-semibold uppercase px-1.5 py-px rounded ${t.direction === 'buy' ? 'text-up bg-up/10' : 'text-down bg-down/10'}`}>{t.direction}</span>
          <span className="num text-[11.5px] text-muted">{num(t.volume, 2)}</span>
        </div>
        <div className="text-[11.5px] text-faint mt-0.5 truncate">
          {fmtDate(t.close_time)} · {fmtTime(t.open_time)} · {duration(t.duration_sec)}
          {bad.length > 0 && <span className="text-warn"> · {bad.map((k) => TAGS[k].label).join(', ')}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <Pnl v={t.net_pnl} cur={cur} className="text-[14.5px] font-semibold" />
        <div className="num text-[11px] text-faint">{t.r_multiple != null ? `${t.r_multiple > 0 ? '+' : ''}${num(t.r_multiple, 2)}R` : t.pips != null ? `${t.pips > 0 ? '+' : ''}${num(t.pips, 1)} pip` : ''}</div>
      </div>
    </button>
  )
}
