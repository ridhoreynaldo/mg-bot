# Fase 3 — Pasang BotSignalMiddleware (LOG-ONLY) di satu aplikasi Laravel

Mode: **catat saja, tidak memblokir apa pun.** Tujuan 1–2 minggu pertama
hanya mengumpulkan data: verdict apa saja yang muncul dari pengguna asli,
dan alasan mana yang paling sering menyala (calon false positive).

## Langkah pasang

1. Salin file:
   - `BotSignalMiddleware.php` → `app/Http/Middleware/BotSignalMiddleware.php`
   - `bot-collector.js` → `public/js/bot-collector.js`
2. Daftarkan alias di `bootstrap/app.php` (Laravel 11/12), di dalam
   `withMiddleware(function (Middleware $middleware) { ... })`:
   ```php
   $middleware->alias([
       'bot.signal' => \App\Http\Middleware\BotSignalMiddleware::class,
   ]);
   ```
3. Terapkan HANYA pada route POST login aplikasi itu, misal:
   ```php
   Route::post('/login', [LoginController::class, 'login'])->middleware('bot.signal');
   ```
   (sesuaikan dengan definisi route login yang sudah ada — jangan buat
   route baru, tambahkan `->middleware('bot.signal')` pada yang ada.)
4. Ikuti `login-snippet.blade.php`: satu hidden field di form login +
   satu `<script>` sebelum `</body>`.
5. (Opsional tapi disarankan) pisahkan log-nya. Tambah di
   `config/logging.php` → `channels`:
   ```php
   'bot' => [
       'driver' => 'single',
       'path' => storage_path('logs/bot.log'),
       'level' => env('LOG_LEVEL', 'debug'),
       'days' => 14,
   ],
   ```
   Tanpa langkah ini pun aman: middleware jatuh ke log bawaan.
6. Di server: `git pull` seperti biasa. Tidak ada migrasi, tidak ada
   dependensi baru. `php artisan view:clear` untuk view login.

## Cara membaca hasil

```bash
tail -f storage/logs/bot.log        # atau laravel.log bila tanpa channel
grep -c "likely_bot" storage/logs/bot.log
grep "likely_bot" storage/logs/bot.log | head
```

Yang dicari selama masa log-only:
- Apakah ada pengguna ASLI yang kena `suspicious`/`likely_bot`? Alasan
  apa yang menyala padanya? (WebGL mati karena ekstensi privasi adalah
  tersangka klasik.)
- Volume percobaan login otomatis yang selama ini tidak terlihat.

## Mematikan / rollback

Cabut `->middleware('bot.signal')` dari route login, selesai. Middleware
yang terdaftar tapi tidak dipakai tidak berpengaruh apa-apa. Tidak ada
skema DB dan tidak ada state yang perlu dibersihkan (korelasi hidup di
Cache dan kedaluwarsa sendiri dalam 10 menit).

## Yang SENGAJA belum ada di Fase 3

Tidak ada blokir, challenge, atau rate-limit tambahan dari middleware
ini. Itu Fase 4, dan hanya dinyalakan setelah data log-only di atas
bersih — terutama setelah false positive dari pengguna asli dipahami.
