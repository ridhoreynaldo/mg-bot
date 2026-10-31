'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { scoreSignal } = require('../lib/score');

test('manusia normal: skor rendah', () => {
  const r = scoreSignal({
    client: { webdriver: false, plugins: 5, languages: ['id-ID', 'en'], canvasOk: true, webglRenderer: 'ANGLE (Intel UHD)', hardwareConcurrency: 8 },
    behavior: { mouseMoves: 420, mouseDistance: 5200, clickCount: 4, untrustedClicks: 0, clicksWithoutPriorMove: 0, avgPressMs: 78, intervalMeanMs: 3800, intervalCv: 0.62, timeToFirstMs: 2400 },
    server: { hasSecFetch: true, hasAcceptLanguage: true, uaMismatch: false, requestsInWindow: 3, burst: false },
  });
  assert.ok(r.score < 30, `skor ${r.score}`);
  assert.equal(r.verdict, 'likely_human');
});

test('automation klasik: webdriver + klik script + tanpa gerak mouse', () => {
  const r = scoreSignal({
    client: { webdriver: true, plugins: 0, languages: [], canvasOk: true, webglRenderer: 'Google SwiftShader', hardwareConcurrency: 2 },
    behavior: { mouseMoves: 0, mouseDistance: 0, clickCount: 6, untrustedClicks: 6, clicksWithoutPriorMove: 5, avgPressMs: 1, intervalMeanMs: 15000, intervalCv: 0.08, timeToFirstMs: 40 },
    server: { hasSecFetch: false, hasAcceptLanguage: false, uaMismatch: true, requestsInWindow: 6, burst: false },
  });
  assert.ok(r.score >= 60, `skor ${r.score}`);
  assert.equal(r.verdict, 'likely_bot');
  assert.ok(r.reasons.length >= 5);
});

test('delay 12-20 detik saja tidak menyelamatkan pola teratur', () => {
  // Interval mean besar (15 dtk) TAPI CV kecil = tetap kena sinyal tempo.
  const r = scoreSignal({
    client: { webdriver: false, plugins: 3, languages: ['en-US'], canvasOk: true },
    behavior: { mouseMoves: 10, mouseDistance: 2, clickCount: 5, untrustedClicks: 0, clicksWithoutPriorMove: 0, avgPressMs: 60, intervalMeanMs: 15000, intervalCv: 0.09 },
    server: { hasSecFetch: true, hasAcceptLanguage: true, uaMismatch: false },
  });
  assert.ok(r.reasons.some(x => /teratur/.test(x.reason)));
});

test('sinyal kosong tidak divonis bot', () => {
  const r = scoreSignal({});
  assert.equal(r.verdict, 'likely_human');
});
