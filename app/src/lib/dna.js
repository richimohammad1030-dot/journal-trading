// Trader DNA: rapor karakter trading berbasis data, 5 dimensi skor 0–100.
// Ambang di bawah adalah titik awal yang bisa disetel ulang di THRESHOLDS.
import { dayKey } from './format'

export const MIN_TRADES = 30
export const DIMENSIONS = [
  ['consistency', 'Konsistensi'],
  ['profitability', 'Profitabilitas'],
  ['risk', 'Manajemen Risiko'],
  ['discipline', 'Disiplin'],
  ['resilience', 'Ketahanan'],
]

const clamp01 = (x) => Math.max(0, Math.min(1, x))
// Nilai jelek -> 0, nilai bagus -> 1 (bekerja untuk arah naik maupun turun)
const lerp = (v, bad, good) => (v == null || !isFinite(v) ? null : clamp01((v - bad) / (good - bad)))
const wavg = (parts) => {
  const ok = parts.filter(([v]) => v != null)
  const w = ok.reduce((s, [, k]) => s + k, 0)
  return w ? ok.reduce((s, [v, k]) => s + v * k, 0) / w : 0
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const pctS = (v, d = 0) => `${(v * 100).toFixed(d)}%`
const fx = (v, d = 2) => (v == null || !isFinite(v) ? '–' : v.toFixed(d))

export function grade(score) {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 30) return 'D'
  return 'E'
}
export function label(score) {
  if (score >= 70) return ['Baik', 'up']
  if (score >= 45) return ['Cukup', 'warn']
  return ['Perlu perbaikan', 'down']
}

/** Statistik dasar yang dibutuhkan skor. trades harus terurut close_time. */
function metrics(trades, tags) {
  const n = trades.length
  let gp = 0, gl = 0, wins = 0, streak = 0, maxLossStreak = 0
  for (const t of trades) {
    if (t.net_pnl > 0.005) { gp += +t.net_pnl; wins++; streak = 0 } else if (t.net_pnl < -0.005) { gl -= +t.net_pnl; streak++; maxLossStreak = Math.max(maxLossStreak, streak) } else streak = 0
  }
  const net = gp - gl
  const months = new Map(), days = new Map()
  for (const t of trades) {
    const d = dayKey(t.close_time), m = d.slice(0, 7)
    months.set(m, (months.get(m) || 0) + +t.net_pnl)
    days.set(d, (days.get(d) || 0) + +t.net_pnl)
  }
  const rs = trades.filter((t) => t.r_multiple != null).map((t) => +t.r_multiple)
  const avgLoss = n - wins ? gl / Math.max(1, trades.filter((t) => t.net_pnl < -0.005).length) : null

  // drawdown time-weighted dari balance sebelum tiap trade
  let idx = 1, peak = 1, maxDD = 0, ddStart = null, longestUnder = 0, peakAmt = 0, cum = 0, maxDDAmt = 0
  for (const t of trades) {
    const bal = t.balance_before
    if (bal > 0) idx *= 1 + t.net_pnl / bal
    cum += +t.net_pnl
    if (cum >= peakAmt) peakAmt = cum
    maxDDAmt = Math.max(maxDDAmt, peakAmt - cum)
    const ts = +new Date(t.close_time)
    if (idx >= peak) {
      if (ddStart != null) longestUnder = Math.max(longestUnder, (ts - ddStart) / 864e5)
      peak = idx; ddStart = null
    } else {
      if (ddStart == null) ddStart = ts
      maxDD = Math.min(maxDD, idx / peak - 1)
    }
  }
  if (ddStart != null) longestUnder = Math.max(longestUnder, (+new Date(trades.at(-1).close_time) - ddStart) / 864e5)

  const riskPct = trades.filter((t) => t.risk_amount && t.balance_before > 0).map((t) => t.risk_amount / t.balance_before)
  const vols = trades.map((t) => +t.volume)
  const meanVol = vols.reduce((s, v) => s + v, 0) / n
  const sdVol = Math.sqrt(vols.reduce((s, v) => s + (v - meanVol) ** 2, 0) / n)
  const tagRate = (k) => trades.filter((t) => (tags?.get(t.position_id) || []).includes(k)).length / n

  return {
    n, net, wins, winRate: wins / n,
    pf: gl > 0 ? gp / gl : gp > 0 ? 9.99 : 0,
    expR: rs.length >= 10 ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
    expRatio: avgLoss ? (net / n) / avgLoss : null, // expectancy dibanding rata-rata rugi, cadangan bila R tidak ada
    monthProfit: months.size ? [...months.values()].filter((v) => v > 0).length / months.size : null,
    monthsN: months.size, monthsUp: [...months.values()].filter((v) => v > 0).length,
    dayProfit: days.size ? [...days.values()].filter((v) => v > 0).length / days.size : null,
    daysN: days.size,
    maxDD: -maxDD, longestUnder, maxLossStreak,
    recovery: maxDDAmt > 0 ? net / maxDDAmt : net > 0 ? 9.99 : 0,
    medRisk: riskPct.length >= 5 ? median(riskPct) : null,
    slRate: trades.filter((t) => t.sl).length / n,
    lotCv: meanVol > 0 ? sdVol / meanVol : 0,
    martingale: tagRate('martingale'), revenge: tagRate('revenge'),
  }
}

/** Skor lengkap untuk sekumpulan trade. Mengembalikan null bila trade < minimum. */
export function traderDNA(trades, tags, { min = MIN_TRADES } = {}) {
  if (trades.length < min) return null
  const m = metrics(trades, tags)

  // --- Konsistensi
  const cMonth = m.monthsN >= 2 ? lerp(m.monthProfit, 0.2, 0.8) : null
  const cDay = lerp(m.dayProfit, 0.3, 0.6)
  const consistency = wavg([[cMonth, 0.5], [cDay, 0.5]])

  // --- Profitabilitas
  const pPf = lerp(m.pf, 0.8, 2.0)
  const pExp = m.expR != null ? lerp(m.expR, -0.1, 0.5) : lerp(m.expRatio, -0.1, 0.5)
  const profitability = wavg([[pPf, 0.6], [pExp, 0.4]])

  // --- Manajemen risiko
  const rDd = lerp(m.maxDD, 0.4, 0.1)
  const rRisk = m.medRisk != null ? lerp(m.medRisk, 0.08, 0.02) : null
  const rRec = lerp(m.recovery, 0, 3)
  const risk = wavg([[rDd, 0.5], [rRisk, 0.3], [rRec, 0.2]])

  // --- Disiplin
  const dSl = lerp(m.slRate, 0.5, 1)
  const dLot = lerp(m.lotCv, 1.5, 0.3)
  const dMart = lerp(m.martingale, 0.1, 0)
  const dRev = lerp(m.revenge, 0.1, 0)
  const discipline = wavg([[dSl, 0.4], [dLot, 0.2], [dMart, 0.25], [dRev, 0.15]])

  // --- Ketahanan
  const kStreak = lerp(m.maxLossStreak, 10, 3)
  const kUnder = lerp(m.longestUnder, 90, 14)
  const kRec = rRec
  const resilience = wavg([[kStreak, 0.4], [kUnder, 0.3], [kRec, 0.3]])

  const raw = { consistency, profitability, risk, discipline, resilience }
  const scores = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round(v * 100)]))
  const overall = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / 5)

  // --- Angka pendukung + saran, disusun dari bagian terlemah tiap dimensi
  const details = {
    consistency: {
      what: 'Seberapa teratur profit datang, dari persentase bulan dan hari yang berakhir profit.',
      facts: [m.monthsN >= 2 ? `${m.monthsUp}/${m.monthsN} bulan profit` : 'baru 1 bulan data', `${pctS(m.dayProfit)} hari profit`],
      tip: (cDay ?? 1) <= (cMonth ?? 1)
        ? `Hanya ${pctS(m.dayProfit)} hari berakhir profit. Tetapkan batas rugi harian dan berhenti setelah target harian tercapai, supaya satu hari buruk tidak menghapus beberapa hari baik.`
        : `${m.monthsN - m.monthsUp} dari ${m.monthsN} bulan berakhir rugi. Evaluasi bulan-bulan rugi itu di Kalender: biasanya ada beberapa hari besar yang menentukan.`,
    },
    profitability: {
      what: 'Kualitas cuan, dari profit factor (total profit ÷ total rugi) dan ekspektasi rata-rata per trade.',
      facts: [`Profit factor ${fx(m.pf)}`, m.expR != null ? `ekspektasi ${m.expR >= 0 ? '+' : ''}${fx(m.expR)}R/trade` : `win rate ${pctS(m.winRate)}`],
      tip: m.pf < 1
        ? `Profit factor ${fx(m.pf)} berarti total rugi lebih besar dari total profit. Fokus pada setup dengan hasil terbaik di halaman Performa dan hentikan yang merugi.`
        : m.pf < 1.5
          ? `Profit factor ${fx(m.pf)} masih tipis. Potong rugi lebih cepat dan biarkan posisi untung berjalan, supaya rata-rata menang lebih besar dari rata-rata kalah.`
          : `Profit factor ${fx(m.pf)} sudah sehat. Jaga dengan tetap disiplin pada setup yang sama dan hindari menaikkan lot terlalu cepat.`,
    },
    risk: {
      what: 'Ketahanan modal, dari max drawdown, risiko per trade, dan recovery factor (profit ÷ drawdown).',
      facts: [`Max drawdown ${pctS(m.maxDD, 1)}`, m.medRisk != null ? `risiko median ${pctS(m.medRisk, 1)}/trade` : 'risiko per trade tidak terukur', `recovery ${fx(m.recovery, 1)}×`],
      tip: (rRisk ?? 1) < (rDd ?? 1) && m.medRisk != null
        ? `Risiko median ${pctS(m.medRisk, 1)} per trade terlalu besar. Turunkan ke 1–2% modal supaya rentetan rugi tidak menggerus akun.`
        : m.maxDD > 0.1
          ? `Drawdown ${pctS(m.maxDD, 1)} tergolong dalam. Kecilkan risiko per trade ke 1–2% modal dan pasang SL di setiap posisi agar kurva ekuitas lebih halus.`
          : `Drawdown terjaga di ${pctS(m.maxDD, 1)}. Pertahankan ukuran risiko yang sekarang.`,
    },
    discipline: {
      what: 'Kepatuhan pada aturan, dari pemakaian Stop Loss, kestabilan ukuran lot, dan pola martingale atau revenge trade.',
      facts: [`SL dipakai di ${pctS(m.slRate)} trade`, m.lotCv > 0.8 ? 'lot tidak stabil' : 'lot stabil', m.martingale > 0 ? `martingale ${pctS(m.martingale, 1)}` : 'tanpa martingale'],
      tip: [
        [dSl, `Hanya ${pctS(m.slRate)} trade memakai Stop Loss. Pasang SL di setiap posisi supaya satu trade tidak bisa menghabiskan akun.`],
        [dMart, `Lot dinaikkan setelah rugi pada ${pctS(m.martingale, 1)} trade (martingale). Tetapkan ukuran lot dari risiko %, bukan dari keinginan menutup rugi.`],
        [dLot, `Ukuran lot sangat bervariasi. Hitung lot dari jarak SL dan risiko tetap (mis. 1%) agar setiap trade punya bobot yang sama.`],
        [dRev, `${pctS(m.revenge, 1)} trade dibuka kurang dari 15 menit setelah rugi. Beri jeda setelah loss sebelum entry lagi.`],
      ].filter(([v]) => v != null).sort((a, b) => a[0] - b[0])[0]?.[1],
    },
    resilience: {
      what: 'Kemampuan bangkit dari tekanan, dari rentetan rugi terpanjang dan lama berada di bawah puncak ekuitas.',
      facts: [`Rugi beruntun terpanjang ${m.maxLossStreak}`, `terlama di bawah puncak ${Math.round(m.longestUnder)} hari`],
      tip: (kStreak ?? 1) <= (kUnder ?? 1)
        ? m.maxLossStreak > 5
          ? `Rugi beruntun sampai ${m.maxLossStreak} kali. Buat aturan berhenti hari itu setelah 3 rugi berturut-turut.`
          : 'Rentetan rugi masih terkendali. Jaga dengan SL dan risiko per trade yang kecil.'
        : `Butuh hingga ${Math.round(m.longestUnder)} hari untuk kembali ke puncak ekuitas. Risiko lebih kecil membuat drawdown lebih dangkal dan pemulihan lebih cepat.`,
    },
  }

  // Dimensi yang sudah baik mendapat saran mempertahankan, bukan kritik
  const keep = {
    consistency: `Profit datang teratur (${pctS(m.dayProfit)} hari profit). Pertahankan batas rugi harian yang sekarang.`,
    profitability: `Profit factor ${fx(m.pf)} sudah sehat. Jaga dengan tetap pada setup yang sama dan naikkan lot hanya pelan-pelan.`,
    risk: `Drawdown ${pctS(m.maxDD, 1)} masih terjaga. Pertahankan risiko per trade di 1–2% modal.`,
    discipline: `Aturan dipatuhi dengan baik: SL di ${pctS(m.slRate)} trade dan lot stabil. Pertahankan.`,
    resilience: `Rentetan rugi terkendali (maksimal ${m.maxLossStreak}). Jaga dengan SL dan risiko kecil.`,
  }
  for (const k of Object.keys(details)) if (scores[k] >= 70) details[k].tip = keep[k]

  const order = DIMENSIONS.map(([k]) => k).sort((a, b) => scores[b] - scores[a])
  return {
    scores, overall, grade: grade(overall), details, metrics: m,
    strongest: order[0], weakest: order.at(-1),
  }
}

/** Skor per bulan (bulan dengan minimal `min` trade) untuk grafik tren. */
export function dnaByMonth(trades, tags, min = 15) {
  const groups = new Map()
  for (const t of trades) {
    const k = dayKey(t.close_time).slice(0, 7)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(t)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, ts]) => ({ month, dna: traderDNA(ts, tags, { min }) }))
    .filter((r) => r.dna)
    .map(({ month, dna }) => ({ month, overall: dna.overall, ...dna.scores }))
}
