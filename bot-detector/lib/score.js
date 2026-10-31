'use strict';
/**
 * Scoring detektor bot — fungsi murni, tanpa I/O, supaya bisa di-unit-test.
 *
 * Prinsip:
 * - Tidak ada satu sinyal pun yang sendirian = vonis bot. Skor adalah JUMLAH
 *   banyak sinyal lemah, sama seperti sistem deteksi beneran bekerja.
 * - Skor 0-100. <30 likely_human | 30-59 suspicious | >=60 likely_bot
 * - Setiap poin WAJIB punya alasan yang bisa dibaca manusia (reasons[]).
 *
 * Input `signal`:
 * {
 *   client: { webdriver, plugins, languages, canvasOk, webglRenderer,
 *             hardwareConcurrency, userAgent },
 *   behavior: { mouseMoves, mouseDistance, clickCount, untrustedClicks,
 *               clicksWithoutPriorMove, avgPressMs, intervalMeanMs,
 *               intervalCv, timeToFirstMs },
 *   server: { userAgent, secChUa, hasSecFetch, hasAcceptLanguage,
 *             uaMismatch, requestsInWindow, burst }
 * }
 */

function scoreSignal(signal = {}) {
  const c = signal.client || {};
  const b = signal.behavior || {};
  const s = signal.server || {};
  let score = 0;
  const reasons = [];
  const add = (points, reason) => { score += points; reasons.push({ points, reason }); };

  // ---------- 1. Environment / headless ----------
  if (c.webdriver === true) add(35, 'navigator.webdriver = true (tanda klasik automation)');
  if (typeof c.plugins === 'number' && c.plugins === 0) add(8, 'navigator.plugins kosong (0)');
  if (Array.isArray(c.languages) && c.languages.length === 0) add(8, 'navigator.languages kosong');
  if (c.canvasOk === false) add(8, 'canvas tidak bisa di-render / diblokir');
  if (typeof c.webglRenderer === 'string' && /swiftshader|llvmpipe|software/i.test(c.webglRenderer)) {
    add(12, `WebGL renderer software: ${c.webglRenderer.slice(0, 60)}`);
  }
  if (typeof c.hardwareConcurrency === 'number' && c.hardwareConcurrency <= 1) {
    add(5, `hardwareConcurrency sangat kecil (${c.hardwareConcurrency})`);
  }

  // ---------- 2. Interaksi / event ----------
  if (typeof b.untrustedClicks === 'number' && b.untrustedClicks > 0) {
    add(30, `${b.untrustedClicks} klik dengan isTrusted=false (klik buatan script, bukan mouse fisik)`);
  }
  if (typeof b.clicksWithoutPriorMove === 'number' && b.clicksWithoutPriorMove > 0) {
    add(15, `${b.clicksWithoutPriorMove} klik tanpa mousemove sebelumnya`);
  }
  if (b.clickCount > 0 && (b.mouseMoves || 0) === 0) {
    add(15, 'ada klik tapi mousemove = 0 sama sekali');
  }
  if (typeof b.avgPressMs === 'number' && b.avgPressMs > 0 && b.avgPressMs < 15) {
    add(8, `durasi tekan klik rata-rata terlalu instan (${Math.round(b.avgPressMs)}ms, manusia umumnya 40-120ms)`);
  }
  if (typeof b.timeToFirstMs === 'number' && b.timeToFirstMs < 150) {
    add(5, `interaksi pertama terlalu cepat setelah halaman dimuat (${Math.round(b.timeToFirstMs)}ms)`);
  }

  // ---------- 3. Pola perilaku / tempo ----------
  // CV = std/mean interval antar aksi. Manusia berantakan (CV tinggi),
  // mesin yang di-delay tetap cenderung terlalu teratur (CV rendah).
  if (typeof b.intervalCv === 'number' && typeof b.intervalMeanMs === 'number'
      && b.intervalMeanMs > 0 && b.intervalCv < 0.15) {
    add(12, `interval antar aksi terlalu teratur (CV=${b.intervalCv.toFixed(2)}), delay acak sempit pun masih terbaca polanya`);
  }
  if (typeof b.mouseDistance === 'number' && b.clickCount > 0 && b.mouseDistance < 5) {
    add(8, 'kursor praktis tidak berpindah antar klik (koordinat statis)');
  }

  // ---------- 4. Sinyal server / header ----------
  if (s.uaMismatch === true) add(18, 'User-Agent tidak konsisten dengan Sec-CH-UA (klaim browser vs header client-hints beda)');
  if (s.hasSecFetch === false) add(8, 'header Sec-Fetch-* tidak ada (browser modern selalu mengirimnya saat navigasi)');
  if (s.hasAcceptLanguage === false) add(5, 'Accept-Language tidak ada');
  if (typeof s.requestsInWindow === 'number' && s.requestsInWindow >= 30) {
    add(10, `${s.requestsInWindow} request dalam jendela 60 detik dari IP/sesi yang sama (burst)`);
  }
  if (s.burst === true) add(8, 'burst: banyak request dalam <1 detik');

  score = Math.max(0, Math.min(100, score));
  const verdict = score >= 60 ? 'likely_bot' : score >= 30 ? 'suspicious' : 'likely_human';
  return { score, verdict, reasons };
}

module.exports = { scoreSignal };
