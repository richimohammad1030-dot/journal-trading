import { useEffect, useMemo, useRef, useState } from 'react'
import { I, Icon } from './icons'
import { MARKETS, MARKET_ICON } from '../lib/markets'
import { fmtDate, fmtTime, money, pnlColor } from '../lib/format'

/** Pencarian cepat (Ctrl/⌘+K): halaman, pasar, dan trade berdasarkan pair, tiket, tanggal, atau arah. */
export default function CommandPalette({ trades, cur, nav, onClose, onGo, onTrade, onMarket }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef(null)
  const listRef = useRef(null)
  useEffect(() => { input.current?.focus(); document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])

  const items = useMemo(() => {
    const s = q.trim().toLowerCase()
    const pages = nav.filter(([, l]) => !s || l.toLowerCase().includes(s)).map(([id, l, icon]) => ({ kind: 'page', id, label: l, icon }))
    const mkts = MARKETS.filter(([, l]) => !s || l.toLowerCase().includes(s) || 'pasar'.includes(s)).map(([id, l]) => ({ kind: 'market', id, label: `Pasar: ${l}`, icon: MARKET_ICON[id] }))
    const terms = s.split(/\s+/).filter(Boolean)
    const tr = [...trades].reverse().filter((t) => {
      if (!terms.length) return true
      const hay = `${t.symbol} ${t.position_id} ${t.direction} ${fmtDate(t.close_time, { year: 'numeric' })} ${t.net_pnl > 0 ? 'profit menang win' : 'loss kalah rugi'}`.toLowerCase()
      return terms.every((x) => hay.includes(x))
    }).slice(0, 30).map((t) => ({ kind: 'trade', t }))
    return [...(s ? pages : pages.slice(0, 3)), ...(s ? mkts : []), ...tr]
  }, [q, trades, nav])

  useEffect(() => { setI(0) }, [q])
  useEffect(() => { listRef.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }) }, [i])
  const pick = (it) => { if (!it) return; if (it.kind === 'page') onGo(it.id); else if (it.kind === 'market') onMarket(it.id); else onTrade(it.t) }
  const onKey = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
    else if (e.key === 'Enter') pick(items[i])
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[10vh]" onKeyDown={onKey}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative w-full max-w-xl overflow-hidden shadow-2xl sheet-in">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Icon d={I.search} className="w-5 h-5 text-accent" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik pair, no. tiket, tanggal, 'buy', 'loss'…"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-faint" />
          <button onClick={onClose} className="text-[11px] text-faint border border-line rounded-md px-1.5 py-0.5">Esc</button>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto scroll-thin p-1.5">
          {items.length === 0 && <div className="text-center text-sm text-muted py-10">Tidak ada yang cocok.</div>}
          {items.map((it, k) => (
            <button key={k} data-i={k} onMouseEnter={() => setI(k)} onClick={() => pick(it)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${k === i ? 'nav-on' : ''}`}>
              {it.kind === 'trade' ? (
                <>
                  <span className={`w-1 h-8 rounded-full ${it.t.net_pnl >= 0 ? 'bg-up' : 'bg-down'}`} />
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold text-[14px]">{it.t.symbol}</span>
                    <span className={`ml-2 text-[10.5px] uppercase font-semibold ${it.t.direction === 'buy' ? 'text-up' : 'text-down'}`}>{it.t.direction}</span>
                    <span className="block text-[11.5px] text-faint">#{it.t.position_id} · {fmtDate(it.t.close_time, { year: 'numeric' })} {fmtTime(it.t.close_time)}</span>
                  </span>
                  <span className={`num text-[13px] font-semibold ${pnlColor(it.t.net_pnl)}`}>{money(+it.t.net_pnl, cur, { sign: true })}</span>
                </>
              ) : (
                <>
                  <span className="icon-tile"><Icon d={it.icon} className="w-4 h-4" /></span>
                  <span className="flex-1 text-[14px]">{it.label}</span>
                  <span className="text-[11px] text-faint">{it.kind === 'page' ? 'Halaman' : 'Filter'}</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
