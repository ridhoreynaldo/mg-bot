'use strict';
/*
 * Collector sisi klien untuk LAB detektor bot milik sendiri.
 * Mengumpulkan sinyal environment + perilaku, lalu POST ke /api/signal.
 * Tidak mengumpulkan isi form, password, atau data pribadi.
 */
(function () {
  const startedAt = performance.now();
  const behavior = {
    mouseMoves: 0, mouseDistance: 0, clickCount: 0,
    untrustedClicks: 0, clicksWithoutPriorMove: 0,
    pressDurations: [], clickTimes: [], timeToFirstMs: null,
  };
  let lastX = null, lastY = null, movedSinceLastClick = false, downAt = null;

  addEventListener('mousemove', (e) => {
    behavior.mouseMoves++;
    movedSinceLastClick = true;
    if (lastX !== null) behavior.mouseDistance += Math.hypot(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
  }, { passive: true });

  addEventListener('mousedown', (e) => {
    downAt = performance.now();
    if (behavior.timeToFirstMs === null) behavior.timeToFirstMs = downAt - startedAt;
    if (!e.isTrusted) behavior.untrustedClicks++;
  }, true);

  addEventListener('click', (e) => {
    behavior.clickCount++;
    behavior.clickTimes.push(performance.now());
    if (!e.isTrusted) { /* sudah dihitung di mousedown utk klik fisik; klik script tidak memicu mousedown */ 
      if (downAt === null) behavior.untrustedClicks++;
    }
    if (!movedSinceLastClick && behavior.clickCount > 1) behavior.clicksWithoutPriorMove++;
    if (downAt !== null) behavior.pressDurations.push(performance.now() - downAt);
    downAt = null; movedSinceLastClick = false;
  }, true);

  function canvasOk() {
    try {
      const cv = document.createElement('canvas');
      const ctx = cv.getContext('2d');
      ctx.fillText('bot-detector-lab', 2, 2);
      return cv.toDataURL().length > 100;
    } catch { return false; }
  }
  function webglRenderer() {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    } catch { return null; }
  }
  function intervals() {
    const t = behavior.clickTimes;
    if (t.length < 3) return { intervalMeanMs: null, intervalCv: null };
    const gaps = t.slice(1).map((v, i) => v - t[i]);
    const mean = gaps.reduce((a, x) => a + x, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, x) => a + (x - mean) ** 2, 0) / gaps.length);
    return { intervalMeanMs: mean, intervalCv: mean ? sd / mean : null };
  }

  window.__sendSignal = async function sendSignal() {
    const avgPressMs = behavior.pressDurations.length
      ? behavior.pressDurations.reduce((a, x) => a + x, 0) / behavior.pressDurations.length : null;
    const payload = {
      client: {
        webdriver: navigator.webdriver === true,
        plugins: navigator.plugins ? navigator.plugins.length : null,
        languages: navigator.languages || [],
        canvasOk: canvasOk(),
        webglRenderer: webglRenderer(),
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        userAgent: navigator.userAgent,
      },
      behavior: {
        mouseMoves: behavior.mouseMoves,
        mouseDistance: Math.round(behavior.mouseDistance),
        clickCount: behavior.clickCount,
        untrustedClicks: behavior.untrustedClicks,
        clicksWithoutPriorMove: behavior.clicksWithoutPriorMove,
        avgPressMs, timeToFirstMs: behavior.timeToFirstMs,
        ...intervals(),
      },
    };
    const res = await fetch('/api/signal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const el = document.getElementById('result');
    if (el) el.textContent = JSON.stringify(data, null, 2);
    return data;
  };
})();
