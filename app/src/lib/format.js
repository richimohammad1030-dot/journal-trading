export const TZ = 'Asia/Jakarta'

export function money(v, cur = 'USD', { sign = false, compact = false } = {}) {
  if (v == null || Number.isNaN(v)) return '–'
  const opts = { style: 'currency', currency: cur || 'USD', maximumFractionDigits: compact && Math.abs(v) >= 1000 ? 1 : 2, minimumFractionDigits: compact ? 0 : 2 }
  if (compact) opts.notation = 'compact'
  let s
  try { s = new Intl.NumberFormat('en-US', opts).format(Math.abs(v)) } catch { s = Math.abs(v).toFixed(2) }
  const pre = v < 0 ? '−' : sign && v > 0 ? '+' : ''
  return pre + s
}
export const num = (v, d = 2) => v == null || !isFinite(v) ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
export const pct = (v, d = 1, sign = false) => v == null || !isFinite(v) ? '–' : (v < 0 ? '−' : sign && v > 0 ? '+' : '') + Math.abs(v * 100).toFixed(d) + '%'
export const signed = (v, d = 1) => v == null || !isFinite(v) ? '–' : (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d)

const dkey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
export const dayKey = (iso) => dkey.format(new Date(iso)) // YYYY-MM-DD dalam WIB
export const fmtDate = (iso, o = {}) => new Date(iso).toLocaleDateString('id-ID', { timeZone: TZ, day: 'numeric', month: 'short', ...o })
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
export const fmtDateTime = (iso) => `${fmtDate(iso, { year: 'numeric' })} · ${fmtTime(iso)} WIB`
export function duration(sec) {
  if (sec == null) return '–'
  if (sec < 60) return `${sec} dtk`
  const m = Math.floor(sec / 60), h = Math.floor(m / 60), d = Math.floor(h / 24)
  if (d) return `${d}h ${h % 24}j`
  if (h) return `${h}j ${m % 60}m`
  return `${m}m`
}
export function ago(iso) {
  if (!iso) return 'belum pernah'
  const s = (Date.now() - new Date(iso)) / 1000
  if (s < 90) return 'baru saja'
  if (s < 3600) return `${Math.round(s / 60)} menit lalu`
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`
  return `${Math.round(s / 86400)} hari lalu`
}
export const pnlColor = (v) => v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-muted'
