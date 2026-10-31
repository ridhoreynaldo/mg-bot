# Bot Detector Lab — untuk servermu sendiri

Detektor bot berlapis dalam bentuk lab lokal tanpa dependensi. Tujuannya
defensif: memahami dan menangkap trafik otomatis di layanan **milikmu
sendiri**, dengan cara yang sama seperti analisis Monster Galaxy yang kamu
kirim — tapi dibalik arahnya.

## Cara jalan (di laptop, bukan di VPS produksi)

```bash
node server.js
# buka http://127.0.0.1:8787        → halaman uji
# buka http://127.0.0.1:8787/dashboard → hasil semua sinyal
node --test test/score.test.js     # 4 tes scoring
```

Tidak ada `npm install` — hanya Node.js standar.

## Cara uji yang paling mengena

1. Buka halaman uji di browser biasa, gerakkan mouse, klik Tombol A/B/C
   beberapa kali dengan tempo manusia, lalu **Kirim sinyal**. Skor normalnya
   rendah (<30, `likely_human`).
2. Buka halaman yang sama pakai automation-mu sendiri (Puppeteer/Playwright/
   Selenium — untuk menguji detektormu, di lab-mu sendiri), klik via script,
   kirim sinyal. Lihat sinyal mana saja yang menyala di dashboard.
3. Coba hanya menambah delay 12–20 detik di automation itu, tanpa mengubah
   cara kliknya. Skornya hampir tidak turun — persis pelajaran dari analisis
   yang kamu kirim: delay hanya mengobati rate-limit, bukan lapisannya.

## Sinyal yang diperiksa

| Lapisan | Sinyal | Bobot |
|---|---|---|
| Environment | `navigator.webdriver=true` | +35 |
| Environment | WebGL renderer software (SwiftShader/llvmpipe) | +12 |
| Environment | plugins / languages kosong, canvas gagal | +8 / +8 / +8 |
| Event | klik `isTrusted=false` | +30 |
| Event | klik tanpa mousemove sebelumnya / tanpa mousemove sama sekali | +15 |
| Event | durasi tekan klik <15ms, interaksi pertama <150ms | +8 / +5 |
| Perilaku | interval antar aksi terlalu teratur (CV < 0,15) | +12 |
| Perilaku | kursor tidak berpindah antar klik | +8 |
| Server | UA vs Sec-CH-UA tidak konsisten | +18 |
| Server | Sec-Fetch-* / Accept-Language hilang | +8 / +5 |
| Server | ≥30 request/60 dtk dari IP yang sama, burst <1 dtk | +10 / +8 |

Ambang: `<30 likely_human` · `30–59 suspicious` · `≥60 likely_bot`.
Tidak ada sinyal tunggal yang memvonis — skor selalu jumlah banyak sinyal
lemah, dan setiap poin punya alasan tertulis yang tampil di dashboard.

**Yang TIDAK diklaim alat ini:** fingerprint JA3/TLS yang asli butuh akses
ke ClientHello di terminasi TLS (load balancer / sensor khusus). Lab ini
memeriksa konsistensi header di lapisan aplikasi — jangan tulis "JA3
checked" di laporanmu kalau yang diperiksa sebenarnya header.

## Naik ke produksi (Laravel-mu)

- `laravel/BotSignalMiddleware.php` — contoh middleware dengan bobot yang
  sama. Salin `collector.js` ke halaman sensitif (login/register/checkout),
  kirim payloadnya sebagai header `X-Bot-Signal` saat submit.
- **Wajib log-only dulu 1–2 minggu.** Pengguna asli dengan browser aneh
  (mode privat, ekstensi privasi, WebGL mati) akan ikut kena poin. Lihat
  false positive-nya dari log sebelum mode blokir dinyalakan.
- Pakai verdict-nya bertingkat: `suspicious` → tantangan tambahan / rate
  limit lebih ketat, `likely_bot` → baru blokir. Jangan blokir dari satu
  sinyal.
- Di nginx, lapisan server bisa ditambah tanpa kode aplikasi: `limit_req`
  untuk burst, dan log header-order + UA untuk korelasi antar request —
  korelasi antar sesi/IP jauh lebih kuat daripada satu request sendirian.

## Batasan & etika pakai

- Lab ini berjalan lokal sesuai batas pentest-mu (tanpa script di VPS).
  Evaluasi di lokal / container sekali pakai dulu sebelum mempertimbangkan
  produksi.
- Collector tidak merekam isi form atau data pribadi; yang dicatat hanya
  sinyal environment/perilaku + IP untuk keperluan rate di jendela 60 detik.
