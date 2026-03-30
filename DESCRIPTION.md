# Struktur Proyek Absensi App (Mobile)

Dokumen ini menjelaskan struktur direktori dan fungsi dari masing-masing folder pada proyek aplikasi mobile ini. Proyek ini dibangun menggunakan **React Native** dengan framework **Expo** (menggunakan Expo Router untuk navigasi), **TypeScript**, dan library **Zustand** untuk manajemen state.

## Struktur Direktori Utama

### `app/`
Folder ini berisi konfigurasi routing dan halaman (screens) menggunakan **Expo Router** (file-based routing).
- `_layout.tsx`: Layout utama aplikasi untuk pendefinisian navigasi (seperti Tab atau Stack layout).
- `(tabs)/`: Berisi halaman-halaman utama yang secara default menggunakan navigasi tab bawah (bottom tabs).
- `(no-tabs)/`: Berisi halaman-halaman yang tidak tergabung dalam navigasi tab (misalnya halaman detail, form edit, dll).
- `auth.tsx` & `modal.tsx`: Halaman spesifik untuk alur otentikasi dan tampilan modal.

### `components/`
Berisi komponen-komponen antarmuka (UI) React yang dapat digunakan ulang (reusable) di berbagai halaman.
- `ui/`: Komponen UI dasar yang modular seperti bagian-bagian kecil halaman.
- `icon/`: Komponen untuk ikon SVG yang digenerate secara otomatis dari file asli.
- `ticketing/`, dll.: Komponen atau sekumpulan komponen yang melayani fitur spesifik tertentu.

### `services/`
Folder ini bertanggung jawab untuk melakukan komunikasi jaringan (HTTP requests atau pemanggilan API) ke server backend.
- `auth.ts`: Fungsi-fungsi pemanggilan API terkait otentikasi (login, register, manipulasi akun).
- `attendance.ts`: Fungsi-fungsi pemanggilan API terkait entitas absensi/kehadiran.
- `ticket.ts`: Fungsi-fungsi pemanggilan API terkait entitas tiket.

### `stores/`
Digunakan untuk tempat penyimpanan manajemen state lokal yang bersifat *global* (dapat diakses dari semua halaman) memakai library **Zustand**.
- `auth.ts`: Menyimpan state terkait data otentikasi dan informasi profil pengguna yang sedang login.
- `ticket.ts`: Menyimpan state terkait data tiket untuk cache/kebutuhan UI yang efisien.

### `lib/`
Berisi inisialisasi dan konfigurasi dasar library eksternal inti yang menyokong aplikasi.
- `axios.ts`: Konfigurasi *instance* utama axios, termasuk pengaturan base URL, interceptors untuk penyisipan token, dan logic refresh token.
- `storage.ts`: Utilitas *wrapper* (pembungkus) untuk mengakses penyimpanan lokal persisten di sistem perangkat.

### `utils/`
Menyimpan komponen atau fungsi bantuan (*helper utility functions*) yang sering dipanggil dari berbagai tempat.
- `handle-request.ts`: Standarisasi cara menangani pemanggilan service, error handling terpusat, dan evaluasi respons dari API.
- `utils.ts`: Fungsi utilitas umum tambahan (misal: format string, regex, validasi form, format mata uang, dan tanggal).

### `types/`
Pusat pendefinisian jenis data (*interface* atau *type* TypeScript). Mengompilasi format data standar untuk seluruh sistem, memastikan tipe variabel tetap aman (type safety).
- File seperti `auth.ts`, `attendance.ts`, dan `ticket.ts` menstandarisasi bentuk permintaan (request payload) dan respon (response struct) dengan backend.

### `hooks/`
Berisi custom hook dari fungsi React (`use...`) yang bertujuan membungkus fungsionalitas sehingga logika lebih bersih.
- `use-request.ts`: Custom hook untuk mempermudah manajemen loading, error, dan trigger request API di dalam komponen.
- `use-auth-guard.ts`: Hook untuk melindungi (guard) sebuah rute; memaksa rute diproteksi supaya pengguna yang tak memiliki sesi yang valid dialihkan ke sistem login.
- `use-theme-color.ts`, `use-color-scheme.ts`: Hook pelengkap spesifik penanganan tata letak dan warna tema terang/gelap *(light/dark mode)*.

### `assets/`
Menyimpan aset proyek yang bersifat statis yang di-*bundle* langsung di dalam aplikasi; misalnya gambar lokal (`.png`, `.jpg`), file font kustom, atau referensi media audio.

### `scripts/`
Sekumpulan file skrip untuk menunjang kebutuhan administratif pengembangan program seperti pembersihan proyek, *build automation*, atau *generating asset* dengan spesifikasi tertentu di lingkungan *Node.js*.

---

## Panduan Alur Membuat Fitur Baru (Untuk AI / Developer Bantuan)

Jika kamu bermaksud **menambahkan fungsionalitas / fitur baru** ke dalam proyek ini, ikuti alur standar berikut:
1. **Types**: Pastikan *structure model* atau *interface* entitas datanya sudah didefinisikan secara tegas di folder `types/`.
2. **Services**: Tambahkan fungsi untuk memanggil atau merespon endpoint terkait API spesifik tersebut di folder `services/`.
3. **Stores**: Jika data yang diterima perlu diteruskan dan dipakai dalam beberapa *view* sekaligus (state global lanjutan), gunakan / sediakan penyimpanannya di `stores/`.
4. **Hooks** (Opsional): Jika ada kebutuhan UI interaktif berbasis state yang panjang/susah dikelola, bungkus logikanya ke dalam custom react hook di `hooks/`.
5. **Components**: Buat komponen partisi spesifik untuk entitasnya di `components/` apabila ia dapat dipakai ulang, atau memecah kompleksitas layar utama (misal: card item, list section).
6. **Screens/Routing**: Hubungkan semuanya menjadi satu layar final yang disajikan di dalam struktur susunan spesifik di `app/` (misalnya di root untuk non-tab atau di dalam `(tabs)` untuk navigasi tabulasi utama).

## Alur Penggunaan Aplikasi (User Flow)

Berikut adalah ringkasan alur aplikasi dari saat pengguna pertama kali membuka aplikasi hingga menggunakan fitur-fitur yang ada:

1. **Otentikasi (Login)**: 
   - Rute masuk: `app/auth.tsx`
   - User memasukkan kredensial login. Jika sukses, data token akan disimpan (via utilitas `lib/storage.ts` ke dalam `stores/auth.ts`).
   - *Guard* (`hooks/use-auth-guard.ts`) akan membaca state otentikasi. Jika sesi pengguna valid, maka pengguna otomatis diarahkan ke dalam sistem (Main Dashboard).

2. **Halaman Utama (Main Dashboard) & Navigasi Utama**:
   - Berada di halaman `app/(tabs)/index.tsx`.
   - Menampilkan ringkasan (summary) data pengguna hari ini beserta tombol akses cepat (*shortcuts*) menuju fitur utama operasional.
   - Menggunakan model navigasi tab di bagian bawah layar untuk dengan mudah beralih ke menu utama yang lain.

3. **Fitur Absensi (Kehadiran)**:
   - **Check-In (Absen Masuk)**: Diakses melalui rute `app/(no-tabs)/checkin.tsx`. Fitur ini akan mencatat log lokasi geospasial dan waktu kehadiran.
   - **Check-Out (Absen Keluar)**: Diakses melalui rute `app/(no-tabs)/checkout.tsx`. Memproses log kepulangan atau jadwal kepulangan (*clock-out*).
   - **Jadwal Kerja**: Melalui tab menu `app/(tabs)/jadwal.tsx`, pengguna dapat melihat penugasan atau shift hari ini dan kedepannya.

4. **Fitur Izin (Leave Management)**:
   - **Daftar Riwayat Izin**: Tab menu `app/(tabs)/izin.tsx` menampilkan daftar (list) seluruh izin atau cuti yang pernah diajukan oleh pengguna beserta status permohonannya (Disetujui/Ditolak/Proses).
   - **Pengajuan Izin**: Pengguna dapat masuk ke formulir khusus yang terletak pada rute `app/(no-tabs)/leave/create.tsx` untuk mengisi pengajuan izin baru dengan detail alasan serta lampiran bila diperlukan (seperti surat keterangan dokter).

5. **Fitur Tiket (Ticketing / Bantuan Teknis Pusat)**:
   - **Daftar Tiket Kendala**: Terletak di menu terpisah (`app/(no-tabs)/ticketing/index.tsx`). Menampilkan daftar pengajuan dan laporan status dari kendala operasional yang dibuat pengguna.
   - **Membuat Tiket Baru**: Masuk ke formulir pelaporan melalui `app/(no-tabs)/ticketing/create.tsx` untuk menyampaikan laporan.
   - **Detail Laporan Tiket**: `app/(no-tabs)/ticketing/[id].tsx` digunakan ketika pengguna mengklik satu nomor tiket; menampilkan informasi detil perkembangan resolusi oleh admin.

6. **Manajemen Profil & Keluar (Logout)**:
   - Melalui tab menu `app/(tabs)/profile.tsx`. Menampilkan profil lengkap karyawan beserta foto. Tersedia opsi **Logout**, yang akan mengeksekusi fungsi hapus token sesi dan memicu navigasi paksa kembali ke layar `app/auth.tsx`.

## Perintah Utama Pendukung (Berdasarkan `package.json`)
- **Menjalankan project** : `npm start` (atau menggunakan `npx expo start -c`)
- **Android development** : `npm run android`
- **iOS development** : `npm run ios`
- **Generasi ikon baru** : `npm run generate:icons` (apabila ada asupan `SVG` baru di file `/assets/icons`)
