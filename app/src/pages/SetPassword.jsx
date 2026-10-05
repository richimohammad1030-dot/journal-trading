import { useState } from 'react'
import { supabase } from '../lib/data'

/** Dipakai setelah klik tautan reset di email, dan dari menu Akun untuk ganti password. */
export default function SetPassword({ onDone, inline = false }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (pw !== pw2) return setMsg({ err: true, text: 'Kedua password tidak sama.' })
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg({ err: true, text: error.message })
    setPw(''); setPw2('')
    setMsg({ text: 'Password baru tersimpan. Jangan lupa jalankan ulang setup_credentials.py di laptop.' })
    onDone?.()
  }
  const inp = 'w-full bg-raised border border-line rounded-xl px-3.5 py-3 text-[15px] outline-none focus:border-accent'
  const form = (
    <form onSubmit={submit} className="space-y-3">
      <input id="new-password" className={inp} type="password" required minLength={6} placeholder="Password baru (min. 6 karakter)" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <input id="new-password-2" className={inp} type="password" required minLength={6} placeholder="Ulangi password baru" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      {msg && <div className={`text-[13px] ${msg.err ? 'text-down' : 'text-up'}`}>{msg.text}</div>}
      <button disabled={busy} className="w-full rounded-xl bg-accent text-bg font-semibold py-3 disabled:opacity-60">{busy ? 'Menyimpan…' : 'Simpan password baru'}</button>
    </form>
  )
  if (inline) return form
  return (
    <div className="min-h-dvh grid place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <img src="icon.svg" alt="" className="w-14 h-14 mb-5" />
        <h1 className="text-2xl font-semibold">Buat password baru</h1>
        <p className="text-muted text-sm mt-1 mb-6">Password ini dipakai untuk login aplikasi dan untuk sync agent di laptop.</p>
        {form}
      </div>
    </div>
  )
}
