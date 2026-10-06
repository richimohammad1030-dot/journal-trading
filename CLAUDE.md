# CLAUDE.md — konteks proyek untuk AI

Baca file ini dulu sebelum mengubah apa pun. Isinya: arsitektur, keputusan desain, aturan keamanan, dan hal yang TIDAK ada di repo.

## Apa ini
Jurnal trading pribadi milik Richi, **read-only**, yang tersinkron otomatis dari akun MT5 (Exness, akun cent / USC).
- Catatan per trade dibuat otomatis. Sengaja **tidak ada kolom input**, mirip setra.id.
- Ada chart otomatis per trade dan skor **Trader DNA** (5 dimensi, grade A–E) sebagai pengganti saran trading.
- Web + PWA (HP) berjalan dari satu codebase yang sama.

## Arsitektur
```
MT5 (laptop Windows) ──> sync-agent (Python, Task Scheduler: saat login + tiap 15 menit)
                              │  REST (PostgREST upsert on_conflict)
                              ▼
                        Supabase (Postgres + Auth + RLS)
                              ▲
                              │  supabase-js
                        app/ (React PWA) ──> Netlify (jurnal-trading-saya.netlify.app)
```
- Trade yang dibuka dari HP saat laptop mati tetap tercatat: sync berikutnya membaca riwayat deal MT5.
- Login MT5 memakai **investor password (read-only)** yang disimpan di Windows Credential Manager (`keyring`), bukan di file.

## Struktur
| Path | Isi |
|---|---|
| `sync-agent/reconstruct.py` | Murni (tanpa MT5): deal → trade. `pip_size`, `value_per_price`, risk/R, close_reason, source |
| `sync-agent/price_context.py` | Murni: pilih timeframe chart, MAE/MFE, exit efficiency, tren EMA50 |
| `sync-agent/sync_agent.py` | Loop utama: MT5 → Supabase. Flag `--full` (sinkron ulang semua deal), `--rechart` (hitung ulang chart dan MAE/MFE) |
| `sync-agent/telegram_*.py` | Rapor mingguan/bulanan ke Telegram (opsional) |
| `sync-agent/install_task.ps1` | Mendaftarkan Task Scheduler |
| `app/src/App.jsx` | Shell, auth, hash routing. Di HP: tab atas + swipe (dock melayang sengaja dihapus) |
| `app/src/pages/` | Ringkasan, Kalender, Trade, Analitik, Rapor, Akun, Login, SetPassword, PublicProfile (`#/p/<token>`) |
| `app/src/lib/` | `data.js` (query Supabase), `stats.js`, `dna.js`, `sim.js`, `reports.js`, `bars.js`, `format.js` |

Stack app: React 19, Vite 8, Tailwind v4, vite-plugin-pwa, recharts, lightweight-charts v5 (lazy, `localization.locale='en-US'`). Tema memakai CSS variables + `data-theme`.

## Database Supabase (project `nhbyarsjourxjxtigmrb`)
Tabel: `accounts`, `deals`, `trades`, `cashflows`, `open_positions`, `position_sltp_log`, `account_snapshots`, `sync_runs`, `trade_bars`, `share_links`. Ada juga RPC `public_profile(p_token)` (SECURITY DEFINER, di-grant ke anon; warning advisor-nya disengaja).
- Semua tabel memakai RLS `user_id = auth.uid()`.
- Kunci upsert:
  - `accounts(user_id,login,server)`
  - `deals` / `cashflows` / `open_positions`: `(account_id,ticket)`
  - `trades(account_id,position_id)`
  - `trade_bars(account_id,position_id,kind)`
  - `share_links(account_id)`
- Migrasi yang sudah diterapkan: `init_journal_schema`, `stage2_price_context`, `stage4_public_profile`. SQL lengkapnya ada di dashboard Supabase (Database → Migrations), belum disalin ke repo.

## Aturan perhitungan (jangan diubah tanpa alasan)
- Waktu disimpan dalam UTC. Offset server broker dikoreksi otomatis (Exness = UTC+0).
- Pip: XAU = 0.1, XAG = 0.01, simbol lain = point×10 bila digits 3/5.
- Nilai per satuan harga diambil dari profit trade itu sendiri (`|profit| / |close−open|`). Ini wajib untuk akun cent karena `tick_value` bisa 0.
- Risk = |open − SL| × nilai per harga; R = net / risk.
- Bila trade ditutup oleh TP/SL tapi level TP/SL tidak tercatat, harga eksekusi dipakai sebagai level tersebut.

## Keamanan — wajib
- Jangan pernah meminta, menulis, atau meng-commit password (MT5 maupun Supabase).
- `sync-agent/config.toml` dan `app/.env` hanya ada di laptop (di-gitignore). Templatenya: `config.example.toml` dan `.env.example`. Anon key Supabase memang publik; keamanan data dijaga oleh RLS.
- Operasi destruktif di database (delete/drop) dijalankan atau disetujui sendiri oleh Richi.

## Yang tidak ada di repo
| Item | Alasan | Cara mendapatkannya |
|---|---|---|
| `config.toml` | Data akun pribadi | Salin dari `config.example.toml` |
| `app/.env` | Konfigurasi lokal | Salin dari `.env.example` (isinya sama) |
| `node_modules/`, `app/dist/` | Hasil build | `npm install` dan `npm run build` |
| Password | Rahasia | Windows Credential Manager, lewat `setup_credentials.py` |

## Deploy
- App: `cd app && npm install && npm run build`, lalu unggah `app/dist` ke Netlify (manual drag & drop, belum tersambung ke GitHub).
- Sync agent: lihat `PANDUAN-SETUP.md`. Copy di laptop: `C:\Users\USER\Documents\JurnalTrading`.

## Status & ide berikutnya
- Tahap 1–4 selesai.
- Ide yang belum diputuskan: versi multi-user, di mana orang lain cukup memasukkan akun MT5 dan sync berjalan di VPS. Jangan mulai tanpa konfirmasi Richi.
