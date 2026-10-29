import { useEffect, useState } from 'react'
import { Card, Chips, Badge } from '../components/ui'
import { deleteShareLink, getShareLink, upsertShareLink } from '../lib/data'
import SetPassword from './SetPassword'
import { ago, fmtDateTime, money } from '../lib/format'

function ShareCard({ account, demo }) {
  if (account.id === 'all') return (
    <Card title="Profil publik"><p className="text-[12.5px] text-muted">Profil publik dibuat per akun. Pilih salah satu akun di daftar "Akun tertaut" untuk membuat atau mengatur tautannya.</p></Card>
  )
  return <ShareCardInner account={account} demo={demo} />
}

function ShareCardInner({ account, demo }) {
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(!demo)
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    if (demo) return
    setBusy(true)
    getShareLink(account.id).then(setLink).catch((e) => setMsg(e.message)).finally(() => setBusy(false))
  }, [account.id, demo])
  const url = (token) => `${location.origin}${location.pathname}#/p/${token}`
  const run = (fn) => async () => { setBusy(true); setMsg(null); try { await fn() } catch (e) { setMsg(e.message) } setBusy(false) }
  const copy = async () => {
    try { await navigator.clipboard.writeText(url(link.token)); setMsg('Tautan disalin.') } catch { setMsg('Salin manual tautan di atas.') }
  }
  return (
    <Card title="Profil publik">
      <p className="text-[12.5px] text-muted mb-3">Halaman statistik read-only yang bisa dibagikan lewat tautan, tanpa perlu login. Hanya orang yang punya tautan yang bisa membukanya.</p>
      {demo ? (
        <a href="#/p/demo" className="text-[13px] text-accent font-semibold">Lihat contoh profil publik</a>
      ) : !link ? (
        <button disabled={busy} onClick={run(async () => setLink(await upsertShareLink(account.id, { enabled: true, hide_amounts: true })))} className="rounded-xl bg-accent text-bg font-semibold text-[13px] px-4 py-2 disabled:opacity-50">Buat tautan profil</button>
      ) : (
        <div className="space-y-3">
          <div className={`rounded-xl border border-line px-3 py-2 text-[12px] num break-all ${link.enabled ? '' : 'opacity-50'}`}>{url(link.token)}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} disabled={!link.enabled} className="chip disabled:opacity-40">Salin tautan</button>
            <a href={`#/p/${link.token}`} className="chip">Buka</a>
            <button disabled={busy} onClick={run(async () => setLink(await upsertShareLink(account.id, { enabled: !link.enabled })))} className="chip">{link.enabled ? 'Matikan' : 'Aktifkan lagi'}</button>
            <button disabled={busy} onClick={run(async () => { await deleteShareLink(account.id); setLink(null) })} className="chip text-down">Hapus & buat ulang nanti</button>
          </div>
          <label htmlFor="hide-amounts" className="flex items-center justify-between gap-3 text-[13px]">
            <span>Sembunyikan nominal uang<span className="block text-[11.5px] text-faint">Hasil tampil sebagai % dari modal; lot juga disembunyikan.</span></span>
            <input id="hide-amounts" type="checkbox" className="w-5 h-5 accent-[var(--accent)]" checked={link.hide_amounts} disabled={busy}
              onChange={run(async () => setLink(await upsertShareLink(account.id, { hide_amounts: !link.hide_amounts })))} />
          </label>
        </div>
      )}
      {msg && <div className="text-[12px] text-muted mt-2">{msg}</div>}
    </Card>
  )
}

export default function AccountPage({ ctx }) {
  const { accounts, account, setAccountId, cashflows, runs, theme, setTheme, signOut, demo } = ctx
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="space-y-4">
        <Card title="Akun tertaut">
          <div className="space-y-2">
            {accounts.length > 1 && (
              <button onClick={() => setAccountId('all')} className={`w-full text-left rounded-xl border px-3.5 py-3 transition ${account.id === 'all' ? 'border-accent bg-accent/5' : 'border-line hover:bg-raised'}`}>
                <div className="font-semibold">Semua akun</div>
                <div className="text-[12px] text-muted mt-0.5">{accounts.length} akun digabung · total {money(accounts.reduce((s, a) => s + (+a.balance || 0), 0), 'USD')}</div>
              </button>
            )}
            {accounts.map((a) => (
              <button key={a.id} onClick={() => setAccountId(a.id)} className={`w-full text-left rounded-xl border px-3.5 py-3 transition ${a.id === account.id ? 'border-accent bg-accent/5' : 'border-line hover:bg-raised'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{a.name || a.login}</span>
                  <Badge tone={a.is_real ? 'warn' : 'muted'}>{a.is_real ? 'Real' : 'Demo'}</Badge>
                </div>
                <div className="text-[12px] text-muted mt-0.5">{a.server === 'Binance-USDM' ? 'Binance USDⓈ-M Futures' : `#${a.login} · ${a.server}`} · {a.broker}</div>
                <div className="text-[12px] text-faint mt-0.5">{a.leverage ? `Leverage 1:${a.leverage} · ` : ''}Balance {money(+a.balance, 'USD')}{a.orig_currency && a.orig_currency !== 'USD' ? ` (asli ${a.orig_currency})` : ''} · sync {ago(a.last_sync_at)}</div>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Tampilan">
          <Chips value={theme} onChange={setTheme} options={[['dark', 'Gelap'], ['light', 'Terang']]} />
          <p className="text-[12.5px] text-muted mt-3">Pasang di HP: buka alamat aplikasi di Chrome (Android) atau Safari (iPhone), lalu pilih <b>Tambahkan ke Layar Utama</b>.</p>
        </Card>
        <Card title="Riwayat sync">
          {runs.length === 0 ? <div className="text-sm text-muted">Belum ada sync. Jalankan sync agent di laptop.</div> : (
            <div className="divide-y divide-line -my-2">
              {runs.map((r, i) => (
                <div key={i} className="flex justify-between py-2 text-[12.5px]">
                  <span className="text-muted">{r.finished_at ? fmtDateTime(r.finished_at) : fmtDateTime(r.started_at)}{r.account_name && account.id === 'all' ? <span className="text-faint"> · {r.account_name}</span> : null}</span>
                  <span className={r.status === 'ok' ? 'text-up' : r.status === 'running' ? 'text-warn' : 'text-down'}>{r.status === 'ok' ? `OK · ${r.trades_count} trade` : r.status === 'running' ? 'terputus' : 'gagal'}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Deposit & withdrawal">
          {cashflows.length === 0 ? <div className="text-sm text-muted">Belum ada.</div> : (
            <>
              <div className="flex justify-between text-[13px] mb-2">
                <span className="text-muted">Total modal disetor</span>
                <span className="num font-semibold">{money(cashflows.reduce((s, c) => s + +c.amount, 0), account.currency)}</span>
              </div>
              <div className="divide-y divide-line border-t border-line">
                {[...cashflows].reverse().map((c) => (
                  <div key={`${c.account_id}-${c.ticket}`} className="flex justify-between py-2 text-[12.5px]">
                    <span><span className="capitalize">{c.kind === 'deposit' ? 'Deposit' : c.kind === 'withdrawal' ? 'Withdrawal' : c.kind}</span> <span className="text-faint">· {fmtDateTime(c.time)}</span></span>
                    <span className={`num ${c.amount >= 0 ? 'text-up' : 'text-down'}`}>{money(+c.amount, account.currency, { sign: true })}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
        <ShareCard account={account} demo={demo} />
        {!demo && <Card title="Ganti password"><SetPassword inline /></Card>}
        <button onClick={signOut} className="w-full card py-3 text-down font-semibold">{demo ? 'Keluar dari demo' : 'Keluar'}</button>
      </div>
    </div>
  )
}
