import { useEffect, useRef } from 'react'
import { CandlestickSeries, ColorType, LineStyle, createChart, createSeriesMarkers } from 'lightweight-charts'

const WIB = 7 * 3600 // lightweight-charts menampilkan UTC, jadi waktu digeser ke WIB
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export default function PriceChart({ bars, tf, t, height = 280 }) {
  const el = useRef(null)
  useEffect(() => {
    if (!el.current || !bars?.length) return
    const up = css('--up'), down = css('--down'), muted = css('--muted'), line = css('--line'), ink = css('--ink'), faint = css('--faint')
    const pad2 = (n) => String(n).padStart(2, '0')
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    const fmtT = (ts) => { const d = new Date(ts * 1000); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}` }
    const chart = createChart(el.current, {
      autoSize: true,
      localization: { locale: 'en-US', timeFormatter: fmtT, priceFormatter: (p) => p.toFixed(p >= 1000 ? 2 : p >= 10 ? 3 : 5) },
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: faint, fontFamily: 'JetBrains Mono Variable, monospace', fontSize: 10.5, attributionLogo: false },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: line, timeVisible: true, secondsVisible: false, rightOffset: 2 },
      crosshair: { vertLine: { color: muted, labelBackgroundColor: ink }, horzLine: { color: muted, labelBackgroundColor: ink } },
      handleScale: { axisPressedMouseMove: false },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
      priceLineVisible: false, lastValueVisible: false,
      // pastikan garis SL/TP selalu terlihat walau di luar rentang candle
      autoscaleInfoProvider: (orig) => {
        const r = orig()
        const ps = [t.sl, t.tp].filter(Boolean).map(Number)
        if (!r || !ps.length) return r
        return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...ps), maxValue: Math.max(r.priceRange.maxValue, ...ps) } }
      },
    })
    const data = bars.map(([time, open, high, low, close]) => ({ time: time + WIB, open, high, low, close }))
    series.setData(data)

    const step = bars.length > 1 ? bars[1][0] - bars[0][0] : 60
    const snap = (iso) => {
      const ts = Math.floor(+new Date(iso) / 1000)
      let best = bars[0][0]
      for (const b of bars) { if (b[0] <= ts) best = b[0]; else break }
      return Math.min(best, bars.at(-1)[0]) + WIB
    }
    const buy = t.direction === 'buy'
    const win = t.net_pnl >= 0
    createSeriesMarkers(series, [
      { time: snap(t.open_time), position: buy ? 'belowBar' : 'aboveBar', color: buy ? up : down, shape: buy ? 'arrowUp' : 'arrowDown', text: `${buy ? 'Buy' : 'Sell'} ${t.volume}` },
      { time: snap(t.close_time), position: buy ? 'aboveBar' : 'belowBar', color: win ? up : down, shape: 'circle', text: 'Exit' },
    ].sort((a, b) => a.time - b.time))
    const pl = (price, color, title, style = LineStyle.Dashed) => price && series.createPriceLine({ price: +price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title })
    pl(t.open_price, muted, 'Entry', LineStyle.Solid)
    pl(t.sl, down, 'SL')
    pl(t.tp, up, 'TP')

    // fokus pada area trade dengan sedikit konteks di kiri dan kanan
    const o = snap(t.open_time), c = snap(t.close_time)
    const pad = Math.max((c - o) * 0.6, step * 25)
    chart.timeScale().setVisibleRange({ from: Math.max(data[0].time, o - pad), to: Math.min(data.at(-1).time, c + pad * 0.6) })

    return () => chart.remove()
  }, [bars, t, height])

  return (
    <div>
      <div ref={el} className="w-full" style={{ height }} />
      <div className="flex justify-between text-[10.5px] text-faint mt-1.5 px-0.5">
        <span>Timeframe {tf} · waktu WIB · cubit/geser untuk zoom</span>
        <span>Harga bid broker</span>
      </div>
    </div>
  )
}
