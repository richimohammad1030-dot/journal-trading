# Panduan: sync jurnal selalu on (tanpa laptop)

Sync berjalan di mesin Windows gratis milik GitHub Actions. Mesin dijalankan oleh cron-job.org tiap 15 menit; GitHub sendiri juga menjalankannya tiap jam sebagai cadangan. Data masuk ke Supabase dan langsung tampil di dashboard. Laptop tidak dibutuhkan lagi.

```
cron-job.org ──(tiap 15 menit)──> GitHub Actions (Windows)
                                    ├─ pasang MT5 Exness
                                    ├─ login investor (read-only)
                                    └─ sync_agent.py ──> Supabase ──> dashboard jurnal
```

## 1. Jadikan repo public
Ini perlu agar menit GitHub Actions gratis tanpa batas.

GitHub → repo `journal-trading` → **Settings** → **General** → paling bawah, **Danger Zone** → **Change visibility** → **Make public**.

Kemudian buka **Settings → Actions → General**. Di bagian *Fork pull request workflows from outside collaborators*, pilih **Require approval for all external contributors**. Dengan begitu, orang lain tidak bisa menjalankan workflow di repo Anda.

## 2. Isi Secrets
Rahasia ini terenkripsi dan otomatis disamarkan (`***`) di log.

Buka **Settings → Secrets and variables → Actions → New repository secret**, lalu buat 5 secret:

| Nama | Isi |
|---|---|
| `MT5_LOGIN` | Nomor akun MT5 (angka saja) |
| `MT5_SERVER` | Nama server, persis seperti di MT5, mis. `Exness-MT5Real36` |
| `MT5_PASSWORD` | **Investor password** (read-only), jangan master password |
| `SUPABASE_EMAIL` | Email login jurnal |
| `SUPABASE_PASSWORD` | Password login jurnal |

Isi nilainya langsung di GitHub. Jangan dikirim lewat chat atau ditulis di file.

## 3. Uji coba satu kali
1. Buka tab **Actions** → **Sync jurnal** → **Run workflow** → pilih mode `normal` → **Run workflow**.
2. Tunggu sekitar 3–6 menit. Jika ikonnya hijau, buka dashboard jurnal. Waktu "sync terakhir" seharusnya baru saja.
3. Jika merah, buka langkah yang gagal dan salin pesan errornya untuk diperiksa.

Run pertama memakai mode `normal`. Catatan sync laptop tidak ikut pindah ke cloud, jadi run pertama otomatis menarik seluruh riwayat dan membuat chart semua trade. Karena itu run ini lebih lama dari biasanya.

Bila Exness mengirim email tentang login baru, itu normal. Login datang dari server GitHub dan hanya memakai investor password.

## 4. Jadwalkan di cron-job.org
Langkahnya sama seperti bot sinyal Anda.

1. Siapkan token GitHub. Buka **GitHub → Settings → Developer settings → Fine-grained tokens**. Tambahkan repo `journal-trading` ke token yang sudah ada, atau buat token baru dengan izin **Actions: Read and write** khusus untuk repo ini.
2. Di cron-job.org, buat job baru:
   - **URL**: `https://api.github.com/repos/richimohammad1030-dot/journal-trading/actions/workflows/sync.yml/dispatches`
   - **Schedule**: setiap 15 menit
   - **Advanced → Request method**: `POST`
   - **Headers**:
     - `Authorization: Bearer <token>`
     - `Accept: application/vnd.github+json`
     - `Content-Type: application/json`
   - **Request body**: `{"ref":"main"}`
3. Klik **Test run**. Respons `204` berarti berhasil, dan sebuah run baru akan muncul di tab Actions.

## 5. Matikan sync di laptop
Lakukan langkah ini setelah sync cloud berjalan lancar beberapa kali.

Di laptop, buka PowerShell di folder `sync-agent`, lalu jalankan:
```
powershell -ExecutionPolicy Bypass -File uninstall_task.ps1
```
Sync laptop masih bisa dijalankan manual kapan saja dengan `python sync_agent.py`. Data tidak akan dobel, karena semua data di-upsert berdasarkan nomor ticket.

## Perintah khusus
Buka **Actions → Sync jurnal → Run workflow**, lalu pilih mode:
- `full`: tarik ulang seluruh riwayat.
- `rechart`: hitung ulang chart, MAE/MFE, R, dan pips untuk semua trade.

## Catatan
- **Jeda**: trade dari HP muncul di dashboard paling lambat sekitar 15–20 menit kemudian. Kadang GitHub terlambat beberapa menit; sync berikutnya tetap mengambil semua yang terlewat.
- **Catatan sync** (offset jam server, SL/TP pertama tiap posisi, daftar trade yang sudah dibuatkan chart) disimpan di cache GitHub Actions. Jika cache hilang, sync berikutnya hanya menarik ulang riwayat. Tidak ada data yang rusak.
- **Mengganti link installer MT5**: tambahkan *variable* (bukan secret) bernama `MT5_INSTALLER_URL` di **Settings → Secrets and variables → Actions → Variables**.
