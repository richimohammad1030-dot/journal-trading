import { useEffect, useId, useRef, useState } from 'react'

/** Angka yang "berhitung" naik saat nilainya berubah. */
export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(target ?? 0)
  const from = useRef(0)
  useEffect(() => {
    if (target == null || !isFinite(target)) { setV(target); return }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return }
    const a = from.current, t0 = performance.now()
    let raf
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3)
      setV(a + (target - a) * e)
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = target
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}
export function CountUp({ value, format }) {
  const v = useCountUp(value)
  return <>{v == null || !isFinite(v) ? format(value) : format(v)}</>
}

/** Garis + area kecil. values: angka berurutan. */
export function Sparkline({ values, color = 'var(--up)', className = 'w-28 h-10', fill = true }) {
  const id = useId().replace(/:/g, '')
  if (!values || values.length < 2) return <div className={className} />
  const w = 100, h = 36, min = Math.min(...values), max = Math.max(...values), span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('')
  const last = pts.at(-1)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`${className} overflow-visible`}>
      <defs>
        <linearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".35" /><stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${line}L${w},${h}L0,${h}Z`} fill={`url(#sg${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="spark-draw" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Batang mini; nilai negatif diwarnai merah bila signed. */
export function MiniBars({ values, className = 'w-24 h-10', signed = false }) {
  if (!values?.length) return <div className={className} />
  const max = Math.max(...values.map(Math.abs), 1e-9)
  return (
    <div className={`${className} flex items-end gap-[3px]`}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm origin-bottom bar-grow"
          style={{
            height: `${Math.max(8, (Math.abs(v) / max) * 100)}%`,
            background: signed && v < 0 ? 'var(--down)' : 'var(--up)',
            opacity: 0.35 + 0.65 * ((i + 1) / values.length),
            animationDelay: `${i * 35}ms`,
          }} />
      ))}
    </div>
  )
}

/** Cincin progres 0..1 */
export function Ring({ value, size = 64, stroke = 8, color = 'var(--up)' }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const [k, setK] = useState(0)
  useEffect(() => { const t = requestAnimationFrame(() => setK(value ?? 0)); return () => cancelAnimationFrame(t) }, [value])
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0 overflow-visible">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, k)))}
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${color})` }} />
    </svg>
  )
}

/** Donat dua bagian (menang/kalah) dengan hover. */
export function Donut({ parts, size = 150, stroke = 16, center, active, onActive }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 6 : 0
  let off = 0
  const [shown, setShown] = useState(false)
  useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t) }, [])
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} opacity=".5" />
        {parts.map((p, i) => {
          const len = Math.max(0, (p.value / total) * c - gap)
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color}
              strokeWidth={active === i ? stroke + 4 : stroke} strokeLinecap="butt"
              strokeDasharray={`${shown ? len : 0} ${c}`} strokeDashoffset={-off}
              onMouseEnter={() => onActive?.(i)} onMouseLeave={() => onActive?.(null)} onClick={() => onActive?.(active === i ? null : i)}
              style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.8,.2,1), stroke-width .15s', cursor: 'pointer', opacity: active == null || active === i ? 1 : 0.35 }} />
          )
          off += (p.value / total) * c
          return el
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">{center}</div>
    </div>
  )
}
