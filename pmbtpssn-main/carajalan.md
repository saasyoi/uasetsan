# Walkthrough - Penghubungan Frontend ke Database Terpusat

Pekerjaan untuk menyambungkan dashboard web pengaduan taruna ke database PostgreSQL (melalui API backend) telah selesai dilakukan.

## Perubahan yang Dilakukan

### 1. Integrasi API & Auto-Fallback Offline di Frontend
Kami telah memperbarui seluruh logika di [assets/app.js](file:///c:/Users/Aidhan/Documents/KULIAH/SEMS6/etossandi/pmbtpssn-main/pmbtpssn-main/assets/app.js):
- **Deteksi Konektivitas API (`isOfflineMode`):** Saat halaman dimuat, frontend melakukan pengecekan ketersediaan API backend. Jika gagal (misal dibuka sebagai file lokal biasa atau API offline), sistem otomatis beralih ke mode offline menggunakan penyimpanan browser (`localStorage`).
- **Pengiriman Aduan Baru (`submitReport`):** Mengirimkan aduan melalui `POST /api/reports` ke backend jika API aktif, lalu memperbarui daftar laporan lokal.
- **Pelacakan Aduan (`trackReport`):** Melakukan pencarian real-time via `GET /api/reports/:id` langsung ke database backend jika online untuk mendapatkan data status terbaru.
- **Pembaruan Status (`updateReport`):** Polisi Taruna dapat memproses status dan masukan aduan secara terpusat melalui `PATCH /api/reports/:id`.
- **Penyimpanan Catatan Supervisi (`saveMentorNote`):** Pengasuh dapat mengirim catatan supervisi langsung ke database pusat melalui `POST /api/notes`.

---

## Cara Verifikasi dan Menjalankan Proyek

### Uji Coba Offline Mode (Buka File Langsung)
1. Buka file `index.html` menggunakan browser Anda (URL akan berupa `file:///...`).
2. Masuk ke halaman **Pengadu**, isi formulir aduan, dan kirimkan.
3. Anda akan melihat pesan Toast di kanan bawah bertuliskan `"Aduan terkirim"`.
4. Buka Konsol Developer browser Anda (F12) -> bagian **Console**, Anda akan melihat peringatan log berikut yang menunjukkan fallback bekerja dengan sukses:
   `Menggunakan localStorage sebagai fallback karena API error: TypeError: Failed to fetch`

### Uji Coba Online Mode (Local Development dengan Netlify CLI)
Jika Anda ingin menyimulasikan server backend dan database lokal:
1. Pastikan Anda sudah menginstal **Netlify CLI** (`npm install -g netlify-cli`).
2. Buat database PostgreSQL gratis di [Neon.tech](https://neon.tech) untuk mendapatkan URL koneksi.
3. Di root direktori proyek, buat file `.env` dan masukkan variabel:
   `DATABASE_URL=postgresql://user:password@endpoint/dbname`
4. Jalankan perintah:
   `netlify dev`
5. Buka port lokal yang disediakan oleh Netlify CLI (biasanya `http://localhost:8888`). Sekarang, setiap aduan yang dimasukkan akan langsung tersimpan di database Neon Anda secara otomatis!

---

## Langkah Publikasi ke Mahasiswa Kampus Lain
Untuk mempublikasikan web ini agar bisa diisi oleh mahasiswa lain secara online:
1. Hubungkan repositori proyek ini ke **Netlify** (atau upload foldernya langsung melalui Netlify Drop).
2. Di dashboard Netlify proyek tersebut, masuk ke **Site configuration** -> **Environment variables**.
3. Tambahkan variabel baru dengan nama **`DATABASE_URL`** dan nilai berupa Connection String dari database Neon PostgreSQL Anda.
4. Publikasikan (*deploy*) situs tersebut. Mahasiswa di mana pun kini dapat mengisi aduan dan datanya akan langsung masuk ke database terpusat yang sama.
