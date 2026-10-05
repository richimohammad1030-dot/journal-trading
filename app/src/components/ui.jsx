import { useEffect } from 'react'
import { money, pnlColor } from '../lib/format'

export function Card({ title, action, children, className = '', pad = true }) {
  return (
    <section className={`card ${pad ? 'p-4' : ''} ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between gap-3 ${pad ? 'mb-3' : 'px-4 pt-4 mb-2'}`}>
          <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub, tone, hint }) {
  return (
    <div className="card p-3.5 min-w-0" title={hint}>
      <div className="text-[11.5px] text-muted font-medium truncate">{label}</div>
      <div className={`num text-[19px] font-semibold mt-1 leading-tight truncate ${tone || ''}`}>{value}</div>
      {sub && <div className="text-[11px] text-faint mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

export function Pnl({ v, cur, className = '', compact }) {
  return <span className={`num ${pnlColor(v)} ${className}`}>{money(v, cur, { sign: true, compact })}</span>
}

export function Chips({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex gap-1.5 overflow-x-auto no-scrollbar ${className}`}>
      {options.map(([id, label]) => (
        <button key={id} className="chip transition-colors" data-on={value === id} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  )
}

export function Empty({ title, children }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-raised grid place-items-center text-faint">∅</div>
      <div className="font-semibold">{title}</div>
      {children && <div className="text-sm text-muted mt-1 max-w-sm mx-auto">{children}</div>}
    </div>
  )
}

export function Sheet({ open, onClose, children, title }) {
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className="sheet-in relative w-full md:w-[460px] max-h-[92vh] md:max-h-none md:h-full overflow-y-auto bg-bg border-t md:border-t-0 md:border-l border-line rounded-t-3xl md:rounded-none safe-b">
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur px-4 pt-3 pb-2 border-b border-line">
          <div className="md:hidden mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
          <div className="flex items-center justify-between">
            <div className="font-semibold">{title}</div>
            <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-full hover:bg-raised text-muted" aria-label="Tutup">✕</button>
          </div>
        </div>
        <div className="p-4 pb-24">{children}</div>
      </div>
    </div>
  )
}

export function Skeleton({ className }) {
  return <div className={`skeleton ${className}`} />
}

export function Badge({ children, tone = 'muted' }) {
  const cls = {
    up: 'text-up bg-up/10 border-up/25', down: 'text-down bg-down/10 border-down/25',
    warn: 'text-warn bg-warn/10 border-warn/25', muted: 'text-muted bg-raised border-line',
  }[tone]
  return <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>
}
