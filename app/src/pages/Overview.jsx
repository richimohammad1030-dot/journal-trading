import { Card, Stat, Empty, Badge, Pnl } from '../components/ui'
import { GradeBadge } from '../components/DnaPanel'
import { DIMENSIONS, label } from '../lib/dna'
import EquityChart from '../components/EquityChart'
import TradeRow from '../components/TradeRow'
import { ago, money, num, pct, pnlColor, fmtTime, fmtDate } from '../lib/format'

export default function Overview({ ctx }) {
  const { account, s, pm, trades, positions, tags, openTrade, go, dna } = ctx
  const openDna = () => { try { localStorage.setItem('analitik-tab', 'dna') } catch { /* abaikan */ } go('analitik') }
  const cur = account.currency
  const stale = !account.last_sync_at || Date.now() - new Date(account.last_sync_at) > 3 * 864e5
  const pf = s.profitFactor === Infinity ? '∞' : num(s.profitFactor, 2)
  const floating = positions.reduce((a, p) => a + +p.profit + +(p.swap || 0), 0)

  return (
    <div className="space-y-4">
      <section className="card p-5 overflow-hidden relative">
        <div className="absolute -right-16 -top-20 w-56 h-56 rounded-full blur-3xl opacity-20" style={{ background: pm.gain >= 0 ? 'var(--up)' : 'var(--down)' }} />
        <div className="relative">
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <span>Balance</span>
            <Badge tone={account.is_real ? 'warn' : 'muted'}>{account.is_real ? 'Real' : 'Demo'}</Badge>
          </div>
          <div className="num text-[32px] font-semibold leading-tight mt-1">{money(account.balance, cur)}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[13px]">
            <span className="text-muted">Equity <span className="num text-ink">{money(account.equity, cur)}</span></span>
            <span className="text-muted">Floating <span className={`num ${pnlColor(floating)}`}>{money(floating, cur, { sign: true })}</span></span>
          </div>
          <div className={`mt-3 text-[11.5px] ${stale ? 'text-warn' : 'text-faint'}`}>
            ● Sync terakhir {ago(account.last_sync_at)}{stale && ' — nyalakan laptop untuk memperbarui data'}
          </div>
        </div>
      </section>

      {s.n === 0 ? (
        <Card><Empty title="Belum ada trade di periode ini">Pilih periode lain, atau tunggu sync berikutnya dari laptop.</Empty></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <Stat label="Profit bersih" value={money(s.net, cur, { sign: true })} tone={pnlColor(s.net)} sub={`${s.n} trade`} />
            <Stat label="Gain" value={pct(pm.gain, 2, true)} tone={pnlColor(pm.gain)} sub="time-weighted" hint="Deposit dan withdrawal tidak dihitung sebagai profit" />
            <Stat label="Win rate" value={pct(s.winRate, 1)} sub={`${s.wins} menang · ${s.losses} kalah`} />
            <Stat label="Profit factor" value={pf} tone={s.profitFactor >= 1.5 ? 'text-up' : s.profitFactor < 1 ? 'text-down' : ''} sub="profit ÷ rugi" />
            <Stat label="Expectancy" value={money(s.expectancy, cur, { sign: true })} tone={pnlColor(s.expectancy)} sub="rata-rata per trade" />
            <Stat label="Max drawdown" value={pct(pm.maxDD, 1)} tone="text-down" sub="dari puncak" />
            <Stat label="Rata-rata R" value={s.avgR != null ? `${s.avgR > 0 ? '+' : ''}${num(s.avgR, 2)}R` : '–'} tone={pnlColor(s.avgR)} sub={`SL dipakai ${pct(s.slRate, 0)}`} />
            <Stat label="Rata-rata menang" value={money(s.avgWin, cur)} tone="text-up" sub={s.avgLoss ? `kalah ${money(s.avgLoss, cur)} · rasio ${num(s.avgWin / -s.avgLoss, 2)}` : ''} />
          </div>

          {dna && (
            <section className="card p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Trader DNA</h2>
                <GradeBadge dna={dna} />
              </div>
              <div className="grid grid-cols-5 gap-2">
                {DIMENSIONS.map(([k, name]) => {
                  const v = dna.scores[k], [, tone] = label(v)
                  return (
                    <div key={k} className="min-w-0">
                      <div className="h-14 rounded-lg bg-raised relative overflow-hidden">
                        <div className="absolute inset-x-0 bottom-0" style={{ height: `${v}%`, background: `var(--${tone})`, opacity: 0.75 }} />
                      </div>
                      <div className="num text-[12px] font-semibold mt-1 text-center">{v}</div>
                      <div className="text-[10px] text-faint text-center truncate">{name.replace('Manajemen ', '')}</div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[12.5px] text-muted mt-3"><span className="text-ink font-semibold">Fokus berikutnya:</span> {dna.details[dna.weakest].tip}</p>
              <button onClick={openDna} className="text-[12.5px] text-accent font-semibold mt-2">Lihat rincian skor</button>
            </section>
          )}

          <Card title="Kurva pertumbuhan"><EquityChart points={pm.points} cur={cur} /></Card>
        </>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card title={`Posisi terbuka (${positions.length})`} pad={false}>
          {positions.length === 0 ? <div className="px-4 pb-4 text-sm text-muted">Tidak ada posisi terbuka saat sync terakhir.</div> : (
            <div className="divide-y divide-line">
              {positions.map((p) => (
                <div key={p.ticket} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-semibold text-[14px]">{p.symbol} <span className={`text-[10.5px] uppercase ${p.direction === 'buy' ? 'text-up' : 'text-down'}`}>{p.direction}</span> <span className="num text-[11.5px] text-muted">{num(p.volume, 2)}</span></div>
                    <div className="text-[11.5px] text-faint">{fmtDate(p.open_time)} {fmtTime(p.open_time)} · {p.sl ? 'SL terpasang' : <span className="text-warn">tanpa SL</span>}</div>
                  </div>
                  <Pnl v={+p.profit} cur={cur} className="font-semibold" />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Trade terakhir" pad={false} action={<button onClick={() => go('trade')} className="text-[12px] text-accent font-semibold">Lihat semua</button>}>
          {trades.length === 0 ? <div className="px-4 pb-4 text-sm text-muted">Belum ada.</div> : (
            <div className="divide-y divide-line">
              {trades.slice(-5).reverse().map((t) => <TradeRow key={t.position_id} t={t} cur={cur} tags={tags.get(t.position_id)} onOpen={openTrade} />)}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
