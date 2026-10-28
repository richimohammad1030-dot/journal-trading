# Jurnal Trading MT5

Jurnal trading pribadi yang terisi otomatis dari akun MetaTrader 5. Read-only, tanpa isian manual, bisa dibuka di web dan dipasang di HP (PWA).

## Isi repo

| Folder | Isi |
| --- | --- |
| `app/` | Aplikasi web/PWA (React + Vite + Tailwind), data dari Supabase |
| `sync-agent/` | Program Python di PC Windows yang menarik riwayat MT5 ke Supabase |
| `PANDUAN-SETUP.md` | Langkah setup lengkap dari awal |
| `PANDUAN-CLOUD.md` | Sync selalu on lewat GitHub Actions (tanpa laptop) |

## Fitur

- Sync otomatis dari MT5 (saat login Windows + tiap 15 menit), trade dari HP ikut tercatat
- Ringkasan: balance, gain time-weighted, win rate, profit factor, drawdown, kurva pertumbuhan
- Kalender heatmap P/L, riwayat trade dengan filter
- Detail trade: chart otomatis (eksekusi + konteks), MAE/MFE, efisiensi exit, tag otomatis
- Analitik: Trader DNA (5 skor + grade), performa per kelompok, scatter MAE/MFE, simulasi "bagaimana jika"
- Rapor mingguan/bulanan + simpan PDF, rapor ke Telegram, profil publik opsional

## Menjalankan aplikasi secara lokal

```bash
cd app
cp .env.example .env      # isi URL & publishable key Supabase
npm install
npm run dev               # mode pengembangan
npm run build             # hasil di app/dist
```

Mode demo dengan data contoh: buka `/?demo`.

## Sync agent (Windows)

Mode utama sekarang cloud: lihat `PANDUAN-CLOUD.md`. Cara di bawah ini untuk menjalankan di laptop.

```bash
cd sync-agent
pip install -r requirements.txt
copy config.example.toml config.toml   # isi email, akun, server
python setup_credentials.py            # password disimpan di Windows Credential Manager
python sync_agent.py --full
powershell -ExecutionPolicy Bypass -File install_task.ps1
```

Opsi: `--full` (tarik ulang seluruh riwayat), `--rechart` (hitung ulang chart dan MAE/MFE).

`config.toml` dan `.env` tidak ikut di-commit. Password tidak pernah ditulis ke file.
