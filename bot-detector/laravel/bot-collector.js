'use strict';
/*
 * Collector versi FORM (Fase 3) — untuk halaman login Laravel.
 * Beda dengan public/collector.js di lab: versi ini TIDAK mengirim
 * apa-apa sendiri. Ia mengisi hidden field #bot_signal di dalam form
 * tepat sebelum form di-submit, supaya payload ikut terkirim bersama
 * kredensial sebagai satu request POST login biasa.
 * Tidak merekam isi form lain / password / data pribadi.
 */
(function () {
  const startedAt = performance.now();
  const b = { mouseMoves: 0, mouseDistance: 0, clickCount: 0, untrustedClicks: 0,
    clicksWithoutPriorMove: 0, pressDurations: [], clickTimes: [], timeToFirstMs: null };
  let lastX = null, lastY = null, moved = false, downAt = null;

  addEventListener('mousemove', (e) => {
    b.mouseMoves++; moved = true;
    if (lastX !== null) b.mouseDistance += Math.hypot(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  }, { passive: true });
  addEventListener('mousedown', (e) => {
    downAt = performance.now();
    if (b.timeToFirstMs === null) b.timeToFirstMs = downAt - startedAt;
    if (!e.isTrusted) b.untrustedClicks++;
  }, true);
  addEventListener('click', (e) => {
    b.clickCount++; b.clickTimes.push(performance.now());
    if (!e.isTrusted && downAt === null) b.untrustedClicks++;
    if (!moved && b.clickCount > 1) b.clicksWithoutPriorMove++;
    if (downAt !== null) b.pressDurations.push(performance.now() - downAt);
    downAt = null; moved = false;
  }, true);

  function sessionId() {
    try {
      let id = sessionStorage.getItem('bd-session');
      if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()); sessionStorage.setItem('bd-session', id); }
      return id;
    } catch { return null; }
  }
  function payload() {
    const gaps = b.clickTimes.slice(1).map((v, i) => v - b.clickTimes[i]);
    const mean = gaps.length ? gaps.reduce((a, x) => a + x, 0) / gaps.length : null;
    const cv = mean ? Math.sqrt(gaps.reduce((a, x) => a + (x - mean) ** 2, 0) / gaps.length) / mean : null;
    let renderer = null, canvasOk = null;
    try {
      const cv2 = document.createElement('canvas'); const ctx = cv2.getContext('2d');
      ctx.fillText('bd', 2, 2); canvasOk = cv2.toDataURL().length > 100;
      const gl = document.createElement('canvas').getContext('webgl');
      if (gl) { const ext = gl.getExtension('WEBGL_debug_renderer_info');
        renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)); }
    } catch { canvasOk = false; }
    return JSON.stringify({
      sessionId: sessionId(),
      client: { webdriver: navigator.webdriver === true,
        plugins: navigator.plugins ? navigator.plugins.length : null,
        languages: navigator.languages || [], canvasOk,
        webglRenderer: renderer, hardwareConcurrency: navigator.hardwareConcurrency || null,
        userAgent: navigator.userAgent },
      behavior: { mouseMoves: b.mouseMoves, mouseDistance: Math.round(b.mouseDistance),
        clickCount: b.clickCount, untrustedClicks: b.untrustedClicks,
        clicksWithoutPriorMove: b.clicksWithoutPriorMove,
        avgPressMs: b.pressDurations.length ? b.pressDurations.reduce((a, x) => a + x, 0) / b.pressDurations.length : null,
        intervalMeanMs: mean, intervalCv: cv, timeToFirstMs: b.timeToFirstMs },
    });
  }

  document.addEventListener('submit', (e) => {
    const field = e.target.querySelector('#bot_signal');
    if (field) field.value = payload();
  }, true);
})();
