# Jurnal Trading MT5 — Panduan Setup (Tahap 1–4)

Isi paket:

| Folder | Isi |
| --- | --- |
| `app/dist/` | Aplikasi web/PWA yang sudah jadi (siap di-upload) |
| `app/` | Kode sumber aplikasi (React + Vite) |
| `sync-agent/` | Program Python yang menarik data MT5 ke database |

Database Supabase sudah dibuat: project **jurnal-trading** (region Singapura, paket gratis). Tabel dan keamanan (Row Level Security) sudah terpasang.

---

## 1. Online-kan aplikasi (sekali saja, ±5 menit)

Cara paling mudah, **Netlify Drop**:

1. Buat akun gratis di netlify.com, lalu login.
2. Buka **app.netlify.com/drop**.
3. Seret folder `app/dist` ke halaman itu.
4. Kamu dapat alamat seperti `nama-acak.netlify.app`. Ganti namanya di *Site configuration → Change site name*, misalnya `jurnal-richi`.

(Alternatif: push folder `app/` ke GitHub lalu import ke Vercel. Isi Environment Variables sesuai `app/.env.example`.)

## 2. Atur Supabase agar email konfirmasi mengarah ke aplikasimu

Di dashboard Supabase → project **jurnal-trading** → *Authentication → URL Configuration*:
- **Site URL**: alamat aplikasi dari langkah 1, mis. `https://jurnal-richi.netlify.app`

## 3. Buat akun jurnal

1. Buka alamat aplikasi → **Daftar** → isi email dan password.
2. Buka email konfirmasi dari Supabase, klik tautannya.
3. Masuk. Aplikasi akan bilang "Belum ada akun tersambung" — itu normal sampai sync pertama.
4. Disarankan: setelah akunmu jadi, matikan pendaftaran baru di *Authentication → Sign In / Providers → Allow new users to sign up* (off). Data tetap terlindungi RLS, ini hanya lapis tambahan.

## 4. Pasang sync agent di laptop Windows

**Persiapan**
- Python 3.12 dari python.org (centang *Add python.exe to PATH* saat install).
- MetaTrader 5 terpasang.
- **Disarankan:** instalasi MT5 kedua khusus jurnal (jalankan installer lagi, pilih folder lain, mis. `C:\MT5-Jurnal`). Alasannya: sync login memakai *investor password*; kalau memakai MT5 yang sama dengan yang kamu pakai trading di laptop, terminal itu ikut berpindah ke mode read-only.
- Investor password: di MT5 HP/desktop, atau minta ke broker. Bisa juga dibuat di MT5 desktop: *Tools → Options → Server → Change → Change investor (read only) password*.

**Langkah**
1. Salin folder `sync-agent` ke laptop, mis. ke `C:\JurnalTrading\sync-agent`.
2. Buka Command Prompt di folder itu, lalu:
   ```
   pip install -r requirements.txt
   copy config.example.toml config.toml
   notepad config.toml
   ```
3. Di `config.toml` isi: email login jurnal, nomor akun MT5, nama server (persis seperti di MT5), label, dan `terminal_path` bila memakai MT5 terpisah.
4. Simpan password (tersimpan di Windows Credential Manager, bukan di file):
   ```
   python setup_credentials.py
   ```
5. Sync pertama, tarik seluruh riwayat:
   ```
   python sync_agent.py --full
   ```
   Buka aplikasi jurnal: akun dan riwayat trade sudah muncul.
6. Aktifkan sync otomatis (saat login Windows + tiap 15 menit):
   ```
   powershell -ExecutionPolicy Bypass -File install_task.ps1
   ```

Log sync: `%LOCALAPPDATA%\JurnalTrading\sync.log`. Untuk mematikan sync otomatis: `uninstall_task.ps1`.

## 5. Pasang di HP

- **Android (Chrome):** buka alamat aplikasi → menu ⋮ → *Tambahkan ke layar utama* / *Install app*.
- **iPhone (Safari):** buka alamat → tombol Share → *Add to Home Screen*.

---

## Catatan penting

- **Trade dari HP tetap tercatat.** Riwayat ada di server broker, jadi sync berikutnya dari laptop menarik semuanya.
- **Jam broker** terdeteksi otomatis dari harga terakhir. Kalau kamu sering sync saat weekend dan waktu trade terlihat bergeser, isi `server_utc_offset_hours` di `config.toml`.
- **SL/TP**: diambil dari order pembuka. Bila SL dipasang belakangan, sync menangkapnya selama posisi masih terbuka saat laptop menyala. Trade yang kena SL selalu tercatat ber-SL.
- **Lebih dari satu akun**: tambahkan blok `[[accounts]]` baru di `config.toml`, lalu jalankan lagi `setup_credentials.py`.
- Semua waktu di aplikasi dalam **WIB**.

## Yang baru di Tahap 2

- **Chart otomatis per trade.** Sync agent mengambil candle dari MT5 di sekitar waktu trade. Ada dua tampilan: *Eksekusi* (timeframe dipilih otomatis sesuai durasi trade) dan *Konteks* (satu timeframe di atasnya), lengkap dengan tanda entry, exit, garis SL/TP.
- **MAE/MFE dan efisiensi exit.** Dihitung dari candle M1 bila tersedia: seberapa jauh harga sempat melawan dan mendukung posisi, dalam pip, uang, dan R.
- **Tren saat entry** dari EMA50 di timeframe konteks.
- **Tag baru:** SL dilebarkan, Melawan tren, Cut profit cepat, Hold loser. Ringkasannya ada di kartu *Kebiasaan terdeteksi* di halaman Analitik.

Catatan:
- Chart dibuat sekali per trade. Trade yang lebih tua dari riwayat candle yang disimpan broker/terminal tidak punya chart. Untuk riwayat panjang, naikkan *Tools → Options → Charts → Max bars in chart* di MT5 jurnal sebelum `--full`.
- Kalau sudah pernah menjalankan sync Tahap 1, cukup ganti file di folder `sync-agent`, lalu jalankan `python sync_agent.py --full` sekali agar trade lama ikut mendapat chart.
- Candle MT5 adalah harga bid, jadi untuk posisi sell nilai MAE/MFE bisa sedikit berbeda dari harga ask yang sebenarnya.

## Yang baru di Tahap 3

Halaman **Analitik** sekarang punya empat tab:

- **Trader DNA:** skor 0–100 untuk Konsistensi, Profitabilitas, Manajemen Risiko, Disiplin, dan Ketahanan, grade A–E, radar chart, dan saran per dimensi yang disusun dari angka kamu sendiri. Ada juga grafik tren skor per bulan. Skor baru muncul setelah minimal 30 trade di periode yang dipilih. Ringkasannya juga tampil di halaman Ringkasan.
- **Performa:** isi Analitik sebelumnya (per pair/sesi/hari/sumber, distribusi R, kebiasaan terdeteksi, heatmap jam × hari).
- **Eksekusi:** scatter MAE vs hasil dan MFE vs hasil, ditambah temuan otomatis (mis. seberapa jauh trade menang biasanya melawan). Ketuk titik untuk membuka trade-nya.
- **Simulasi:** hitung ulang periode yang sama dengan aturan berbeda: buang trade tanpa SL / martingale / revenge / melawan tren, batas trade per hari, berhenti setelah N rugi beruntun, risiko tetap per trade, hanya sesi atau pair tertentu. Hasil asli dan simulasi dibandingkan berdampingan.

Tahap 3 tidak mengubah sync agent atau database, cukup upload ulang folder `app/dist`.

Grade: A ≥ 80, B 65–79, C 50–64, D 30–49, E < 30. Ambang tiap skor ada di `app/src/lib/dna.js` dan bisa disetel.

## Yang baru di Tahap 4

**Rapor mingguan & bulanan (menu Rapor).** Menu bawah sekarang: Ringkasan, Kalender, Trade, Analitik, Rapor. Akun pindah ke ikon orang di kanan atas.
Setiap rapor berisi angka utama dibanding periode sebelumnya, tiga temuan pola teratas, jumlah pelanggaran aturan, perubahan skor Trader DNA, kalender mini, serta trade terbaik dan terburuk.
Tombol **Simpan PDF** membuka dialog cetak; pilih *Simpan sebagai PDF*. Hasil cetaknya otomatis memakai tampilan terang yang rapi.

**Rapor ke Telegram (opsional).**
1. Di Telegram, chat **@BotFather** → `/newbot` → beri nama → salin token.
2. Di folder `sync-agent`, jalankan `python telegram_setup.py`, tempel token, lalu kirim `/start` ke bot kamu.
3. Di `config.toml`, bagian `[telegram]`: ubah `enabled = true` dan isi `app_url` dengan alamat aplikasimu.

Rapor mingguan dikirim pada sync pertama setiap Senin, rapor bulanan pada sync pertama tanggal 1. Karena sync berjalan dari laptop, pesan terkirim saat laptop menyala hari itu (atau sesudahnya). Token disimpan di Windows Credential Manager.

**Profil publik (opsional).** Di menu Akun → *Profil publik* → *Buat tautan profil*. Siapa pun yang punya tautan bisa melihat statistik read-only (gain, drawdown, win rate, kurva, kalender, Trader DNA) tanpa login. Secara bawaan nominal uang dan lot disembunyikan; hasil tampil sebagai persen dari modal. Tautan bisa dimatikan atau dihapus kapan saja.

Tahap 4 menambah tabel `share_links` dan fungsi `public_profile` di database (sudah terpasang). Untuk memperbarui: upload ulang `app/dist`, dan ganti file di folder `sync-agent` dengan yang baru.

## Ide lanjutan

- Notifikasi push langsung dari aplikasi (butuh server yang selalu menyala).
- Pindah sync ke VPS agar jurnal ter-update tanpa laptop.
