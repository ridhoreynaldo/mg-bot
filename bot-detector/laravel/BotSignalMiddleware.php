<?php
/**
 * BotSignalMiddleware v2 — FASE 3, MODE LOG-ONLY.
 *
 * Pemasangan (ringkas, detail di INSTALL.md folder yang sama):
 *  1. File ini -> app/Http/Middleware/BotSignalMiddleware.php
 *  2. public/js/bot-collector.js -> public/js/bot-collector.js
 *  3. Daftarkan alias 'bot.signal' di bootstrap/app.php
 *  4. Tempel snippet Blade di view login + pasang middleware HANYA pada
 *     route POST login: Route::post(...)->middleware('bot.signal')
 *  5. (Opsional) tambah channel 'bot' di config/logging.php; tanpa itu
 *     middleware otomatis jatuh ke log bawaan Laravel — tidak error.
 *
 * Sifat Fase 3: TIDAK PERNAH memblokir, mengubah respons, atau menyentuh
 * logika login. Ia hanya menghitung skor (dasar + korelasi 10 menit via
 * Cache, pola sama seperti lab Fase 2) lalu menulis satu baris log.
 * Mematikan = cabut middleware dari route. Titik.
 *
 * Payload dibaca dari dua tempat (mana yang ada):
 *  - header X-Bot-Signal (untuk submit via fetch/AJAX), atau
 *  - field form 'bot_signal' (untuk submit form klasik — cara snippet
 *    Blade bawaan paket ini bekerja).
 */
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class BotSignalMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        try {
            $this->observe($request);
        } catch (\Throwable $e) {
            // Detektor tidak boleh menjatuhkan login hanya karena ia error.
            Log::warning('bot-signal gagal diamati: ' . $e->getMessage());
        }

        return $next($request);
    }

    protected function observe(Request $request): void
    {
        $raw = $request->header('X-Bot-Signal') ?: $request->input('bot_signal');
        $signal = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);
        $client = $signal['client'] ?? [];
        $behav  = $signal['behavior'] ?? [];

        $score = 0;
        $reasons = [];
        $add = function (int $p, string $r) use (&$score, &$reasons) {
            $score += $p;
            $reasons[] = "$r (+$p)";
        };

        // --- skor dasar (bobot sama seperti lab Fase 1/2) ---
        if (($client['webdriver'] ?? false) === true)        $add(35, 'webdriver=true');
        if (($client['plugins'] ?? null) === 0)              $add(8, 'plugins kosong');
        if (isset($client['webglRenderer']) && is_string($client['webglRenderer'])
            && preg_match('/swiftshader|llvmpipe|software/i', $client['webglRenderer'])) {
            $add(12, 'WebGL renderer software');
        }
        if (($behav['untrustedClicks'] ?? 0) > 0)            $add(30, 'klik isTrusted=false');
        if (($behav['clicksWithoutPriorMove'] ?? 0) > 0)     $add(15, 'klik tanpa mousemove sebelumnya');
        if (($behav['clickCount'] ?? 0) > 0 && ($behav['mouseMoves'] ?? 0) === 0) {
            $add(15, 'klik tanpa mousemove sama sekali');
        }
        if (isset($behav['avgPressMs']) && $behav['avgPressMs'] > 0 && $behav['avgPressMs'] < 15) {
            $add(8, 'durasi tekan klik terlalu instan');
        }
        if (isset($behav['intervalCv'], $behav['intervalMeanMs'])
            && $behav['intervalMeanMs'] > 0 && $behav['intervalCv'] < 0.15) {
            $add(12, 'interval antar aksi terlalu teratur');
        }
        if (!$request->headers->has('accept-language'))      $add(5, 'Accept-Language kosong');

        $baseScore = $score;

        // --- korelasi 10 menit (Cache) — pola Fase 2 ---
        // Kunci: sesi dari payload bila ada, selain itu IP+UA.
        $key = 'bot-signal:' . sha1(
            (($signal['sessionId'] ?? null) ?: ($request->ip() . '|' . substr((string) $request->userAgent(), 0, 40)))
        );
        $now = now()->timestamp;
        $history = collect(Cache::get($key, []))
            ->filter(fn ($e) => $now - ($e['at'] ?? 0) <= 600)
            ->values();

        $suspicious = $history->whereBetween('score', [30, 59])->count();
        $bots       = $history->where('score', '>=', 60)->count();
        $corr = 0;
        // Gerbang anti false-positive: sama seperti lab — tanpa bukti
        // mencurigakan di jendela, aktivitas bersih berulang tidak naik.
        if ($suspicious + $bots > 0 || $baseScore >= 20) {
            if ($suspicious > 0) { $p = min(24, $suspicious * 6);  $corr += $p; $reasons[] = "korelasi: {$suspicious}x suspicious 10 mnt (+$p)"; }
            if ($bots > 0)       { $p = min(30, $bots * 10);       $corr += $p; $reasons[] = "korelasi: {$bots}x likely_bot 10 mnt (+$p)"; }
        }
        $history->push(['score' => $baseScore, 'at' => $now]);
        Cache::put($key, $history->all(), now()->addMinutes(10));

        $final = min(100, $baseScore + $corr);
        $verdict = $final >= 60 ? 'likely_bot' : ($final >= 30 ? 'suspicious' : 'likely_human');

        $context = [
            'ip' => $request->ip(),
            'path' => $request->path(),
            'base' => $baseScore,
            'correlation' => $corr,
            'score' => $final,
            'verdict' => $verdict,
            'reasons' => $reasons,
        ];

        // Channel 'bot' bila dikonfigurasi, selain itu log bawaan.
        $channels = array_keys((array) config('logging.channels', []));
        if (in_array('bot', $channels, true)) {
            Log::channel('bot')->info('bot-signal', $context);
        } else {
            Log::info('bot-signal', $context);
        }
    }
}
