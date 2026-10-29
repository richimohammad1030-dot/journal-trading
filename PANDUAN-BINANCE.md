# Panduan: menyambungkan Binance Futures (USDⓈ-M)

Akun Binance Futures muncul sebagai akun kedua di jurnal ("Binance Futures"). Sync berjalan di Supabase (Edge Function `binance-sync`) tiap 15 menit dari server Singapura, jadi tidak perlu laptop dan tidak lewat GitHub Actions (Binance memblokir server Amerika).

```
pg_cron (tiap 15 menit) ──> Edge Function binance-sync (region ap-southeast-1)
                              ├─ API Binance (read-only)
                              └─ tulis ke tabel yang sama dengan MT5 ──> dashboard
```

## 1. Buat API key read-only di Binance
1. Binance (web) → ikon profil → **API Management** → **Create API** → **System generated**.
2. Beri label, misalnya `jurnal-trading`. Selesaikan verifikasi keamanan.
3. Di pengaturan key, pastikan **hanya** pilihan berikut yang aktif:
   - ✅ **Enable Reading**
   - ❌ Enable Spot & Margin Trading
   - ❌ Enable Futures
   - ❌ Enable Withdrawals
   - ❌ fitur lain
4. **IP access restrictions**: biarkan **Unrestricted**. IP server Supabase berubah-ubah, dan Binance mengizinkan key tanpa batasan IP selama key itu hanya bisa membaca.
5. Salin **API Key** dan **Secret Key**. Secret hanya ditampilkan sekali.

Key ini tidak bisa membuka/menutup posisi atau menarik dana. Paling jauh, siapa pun yang memegangnya hanya bisa melihat riwayat akun.

## 2. Simpan key di Supabase
Supabase → project jurnal → **Edge Functions** → **Secrets** → tambahkan:

| Nama | Isi |
|---|---|
| `BINANCE_API_KEY` | API Key |
| `BINANCE_API_SECRET` | Secret Key |

Jangan kirim key lewat chat atau simpan di file repo.

## 3. Selesai
Sync berikutnya (paling lama 15 menit) akan:
- membuat akun **Binance Futures** di jurnal;
- menarik riwayat **~3 bulan terakhir** (batas API Binance). Sync pertama bisa butuh 2–3 putaran untuk mengisi semua chart; itu normal;
- mencatat posisi yang sedang terbuka beserta SL/TP-nya.

Pilih akunnya di jurnal lewat menu akun (pojok kanan atas di desktop, atau halaman Akun di HP).

## Catatan
- **Mode posisi** harus **One-way**. Mode Hedge belum didukung.
- **Riwayat > 3 bulan** tidak tersedia lewat API. Saldo sebelum itu dicatat sebagai satu baris "Saldo awal (perkiraan)" agar kurva ekuitas tetap benar.
- **Komisi BNB** dikonversi ke USDT memakai harga BNB saat sync (perkiraan).
- **Funding fee** dimasukkan ke trade yang posisinya terbuka saat funding dibayar (kolom swap).
- **Penutupan** "Kena SL/TP" dikenali dari order STOP/TAKE_PROFIT (termasuk Algo Order Binance); likuidasi dicatat sebagai "Stop out".
- **Mengecek sync**: Supabase → SQL Editor → `select * from sync_runs order by started_at desc limit 5;`
- **Menghentikan sync**: `select cron.unschedule('binance-sync');`
