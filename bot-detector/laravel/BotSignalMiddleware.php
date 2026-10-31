<?php
/**
 * CONTOH integrasi Laravel — salin & sesuaikan, jangan langsung pasang buta.
 * Letakkan di app/Http/Middleware/BotSignalMiddleware.php, daftarkan di
 * bootstrap/app.php (Laravel 11/12) sebagai middleware alias 'bot.signal',
 * lalu pakai pada route sensitif saja (login, register, checkout, dsb).
 *
 * Cara kerja: collector.js mengirim payload ke route ini (atau lampirkan
 * payload pada header X-Bot-Signal saat submit form). Middleware menghitung
 * skor dengan bobot yang sama seperti lib/score.js di lab, mencatatnya ke
 * log channel 'bot', dan HANYA memblokir pada skor sangat tinggi.
 * Default aman: mode log-only dulu 1-2 minggu, lihat false positive-nya,
 * baru naikkan ke mode blokir. Detektor yang langsung memblokir = mengunci
 * pengguna asli yang browser-nya aneh (mode privat, ekstensi, dsb).
 */
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class BotSignalMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $signal  = json_decode((string) $request->header('X-Bot-Signal', '{}'), true) ?: [];
        $client  = $signal['client']   ?? [];
        $behav   = $signal['behavior'] ?? [];
        $score   = 0;
        $reasons = [];
        $add = function (int $p, string $r) use (&$score, &$reasons) {
            $score += $p; $reasons[] = "$r (+$p)";
        };

        if (($client['webdriver'] ?? false) === true)            $add(35, 'webdriver=true');
        if (($behav['untrustedClicks'] ?? 0) > 0)                $add(30, 'klik isTrusted=false');
        if (($behav['clicksWithoutPriorMove'] ?? 0) > 0)        $add(15, 'klik tanpa mousemove');
        if (($behav['clickCount'] ?? 0) > 0 && ($behav['mouseMoves'] ?? 0) === 0)
                                                                 $add(15, 'klik tanpa mousemove sama sekali');
        if (isset($behav['intervalCv'], $behav['intervalMeanMs'])
            && $behav['intervalMeanMs'] > 0 && $behav['intervalCv'] < 0.15)
                                                                 $add(12, 'interval aksi terlalu teratur');
        if (!$request->headers->has('accept-language'))          $add(5,  'Accept-Language kosong');
        // Catatan: Sec-Fetch-* hanya dikirim browser modern pada request
        // navigasi/fetch tertentu — perlakukan sebagai sinyal lemah saja.

        $verdict = $score >= 60 ? 'likely_bot' : ($score >= 30 ? 'suspicious' : 'likely_human');
        Log::channel('bot')->info('bot-signal', [
            'ip' => $request->ip(), 'path' => $request->path(),
            'score' => $score, 'verdict' => $verdict, 'reasons' => $reasons,
        ]);

        // Mode blokir: aktifkan hanya setelah periode log-only bersih.
        // if ($verdict === 'likely_bot') {
        //     abort(429, 'Terlalu banyak aktivitas otomatis terdeteksi.');
        // }

        return $next($request);
    }
}
