import { useState } from 'react'
import { supabase } from '../lib/data'

const ERR = {
  'Invalid login credentials': 'Email atau password salah.',
  'Email not confirmed': 'Email belum dikonfirmasi. Buka email konfirmasi dari Supabase dulu.',
}

export default function Login({ onDemo }) {
  const [mode, setMode] = useState('in') // in | up | reset
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const redirect = window.location.origin + window.location.pathname
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null)
    let res
    if (mode === 'reset') res = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect })
    else if (mode === 'in') res = await supabase.auth.signInWithPassword({ email, password: pw })
    else res = await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect } })
    setBusy(false)
    if (res.error) setMsg({ err: true, text: ERR[res.error.message] || res.error.message })
    else if (mode === 'reset') setMsg({ text: 'Tautan reset password sudah dikirim. Buka email dari Supabase, klik tautannya, lalu buat password baru.' })
    else if (mode === 'up' && !res.data.session) setMsg({ text: 'Akun dibuat. Buka email konfirmasi, klik tautannya, lalu masuk di sini.' })
  }
  const go = (m) => { setMode(m); setMsg(null) }
  const inp = 'w-full bg-raised border border-line rounded-xl px-3.5 py-3 text-[15px] outline-none focus:border-accent'
  return (
    <div className="min-h-dvh grid place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <img src="icon.svg" alt="" className="w-14 h-14 mb-5" />
        <h1 className="text-2xl font-semibold">{mode === 'reset' ? 'Reset password' : 'Jurnal Trading'}</h1>
        <p className="text-muted text-sm mt-1 mb-6">{mode === 'reset' ? 'Masukkan email akunmu. Kami kirim tautan untuk membuat password baru.' : 'Catatan otomatis dari akun MT5 kamu. Read-only, tanpa isian manual.'}</p>
        <form onSubmit={submit} className="space-y-3">
          <input id="login-email" className={inp} type="email" required placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode !== 'reset' && <input id="login-password" className={inp} type="password" required minLength={6} placeholder="Password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} />}
          {msg && <div className={`text-[13px] ${msg.err ? 'text-down' : 'text-up'}`}>{msg.text}</div>}
          <button disabled={busy} className="w-full rounded-xl bg-accent text-bg font-semibold py-3 disabled:opacity-60">{busy ? 'Memproses…' : mode === 'in' ? 'Masuk' : mode === 'up' ? 'Buat akun' : 'Kirim tautan reset'}</button>
        </form>
        <div className="flex flex-wrap justify-between gap-2 text-[13px] mt-4">
          {mode === 'in' && <button className="text-muted" onClick={() => go('reset')}>Lupa password?</button>}
          {mode !== 'in' && <button className="text-muted" onClick={() => go('in')}>Kembali ke Masuk</button>}
          {mode === 'in' && <button className="text-muted" onClick={() => go('up')}>Daftar</button>}
          <button className="text-accent font-semibold" onClick={onDemo}>Lihat demo</button>
        </div>
      </div>
    </div>
  )
}
