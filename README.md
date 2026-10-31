# Monster Galaxy Bot (beta tester)

Bot farming **satu akun** beta tester monstergalaxy.cc, berjalan di laptop dengan browser terlihat.
Tidak memakai penyamaran apa pun: akun harus di-whitelist admin dari sistem anti-bot.
Kalau muncul captcha atau peringatan, bot **berhenti** (tidak dilewati).

## Pakai

```bash
npm install
npm run setup     # unduh Chromium untuk Playwright (sekali saja)
npm run record    # rekam satu putaran farming -> routine.json
npm start         # putar ulang rute
```

Saat bot jalan, di terminal: `p` = jeda/lanjut, `q` = berhenti.

## Pengaturan (`config.json`)

- `limits`: batas aksi per jam, lama sesi maksimum, istirahat berkala. Sesuaikan dengan batas dari admin agar tidak membebani server.
- `login`: isi selector CSS form login kalau ingin login otomatis memakai `MG_USER` / `MG_PASS` di `.env`. Kalau kosong, login manual sekali saja; sesi tersimpan di folder `profile/`.
- `target`: elemen game. Posisi klik disimpan relatif terhadap elemen ini.
- `stopIf`: tanda yang membuat bot berhenti (frame captcha, teks banned/suspend).
- `routine.json`: bisa diedit manual. Langkah `{ "type": "key", "key": "Space", "waitMs": [500, 900] }` juga didukung.

Log tersimpan di `logs/`.
