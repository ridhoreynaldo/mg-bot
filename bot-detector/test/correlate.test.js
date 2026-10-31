'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { correlate, applyCorrelation } = require('../lib/correlate');

const T = 1_700_000_000_000;
const ev = (score, agoMs, ua = 'UA-1') => ({ score, at: T - agoMs, ua });

test('pengguna rajin tapi bersih: pengulangan TIDAK menaikkan skor', () => {
  const history = Array.from({ length: 15 }, (_, i) => ev(0, (i + 1) * 30_000));
  const r = correlate({ score: 0, at: T, ua: 'UA-1' }, history);
  assert.equal(r.points, 0);
});

test('suspicious berulang: eskalasi korelasi terpicu', () => {
  const history = [ev(35, 60_000), ev(40, 120_000), ev(38, 180_000)];
  const r = correlate({ score: 35, at: T, ua: 'UA-1' }, history);
  assert.ok(r.points >= 18, `points ${r.points}`);
});

test('applyCorrelation bisa menaikkan suspicious menjadi likely_bot', () => {
  const base = { score: 40, reasons: [{ points: 40, reason: 'dasar' }] };
  const history = [ev(62, 60_000), ev(70, 120_000)];
  const r = applyCorrelation(base, { score: 40, at: T, ua: 'UA-1' }, history);
  assert.equal(r.baseScore, 40);
  assert.ok(r.score > 40);
  assert.equal(r.verdict, 'likely_bot');
});

test('riwayat di luar jendela 10 menit diabaikan', () => {
  const history = [ev(90, 11 * 60_000), ev(90, 20 * 60_000)];
  const r = correlate({ score: 10, at: T, ua: 'UA-1' }, history);
  assert.equal(r.points, 0);
});

test('cluster: banyak UA dari kunci sama + ada bukti -> poin tambahan', () => {
  const history = [ev(45, 60_000, 'UA-1'), ev(45, 90_000, 'UA-2')];
  const r = correlate({ score: 45, at: T, ua: 'UA-3' }, history);
  assert.ok(r.reasons.some(x => /cluster/.test(x.reason)), JSON.stringify(r.reasons));
});
