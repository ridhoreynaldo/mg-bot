'use strict';
/**
 * Korelasi per sesi/IP — Fase 2.
 *
 * Skor dasar (lib/score.js) menilai SATU kiriman sinyal. Korelasi menilai
 * RIWAYAT kunci yang sama (sessionId, atau IP+UA bila sesi tidak ada)
 * dalam jendela waktu, lalu menambah poin HANYA bila memang sudah ada
 * bukti mencurigakan di jendela itu.
 *
 * Gerbang anti false-positive (penting):
 * - Pengguna asli yang rajin memakai situs akan mengirim banyak sinyal
 *   bersih. Mengulang aktivitas bersih TIDAK PERNAH menaikkan skor:
 *   tanpa minimal satu event suspicious/likely_bot di jendela (atau skor
 *   dasar kiriman ini sendiri >= 20), poin korelasi = 0.
 * - Korelasi tidak pernah menciptakan vonis dari nol — ia memperkuat
 *   bukti yang sudah ada.
 *
 * correlate(current, history) -> { points, reasons[] }
 *   current : { score, at (ms epoch), ua }
 *   history : event-event SEBELUMNYA dengan key sama (objek {score, at, ua})
 *   windowMs: default 10 menit
 */
function correlate(current, history = [], windowMs = 10 * 60 * 1000) {
  const now = current.at;
  const win = history.filter(e => now - e.at <= windowMs && e.at <= now);
  const reasons = [];
  let points = 0;
  const add = (p, r) => { points += p; reasons.push({ points: p, reason: r }); };

  const suspicious = win.filter(e => e.score >= 30 && e.score < 60).length;
  const bots = win.filter(e => e.score >= 60).length;
  const evidence = suspicious + bots;

  // Gerbang: tidak ada bukti mencurigakan -> tidak ada eskalasi, titik.
  if (evidence === 0 && current.score < 20) return { points: 0, reasons: [] };
  if (win.length === 0) return { points: 0, reasons: [] };

  if (suspicious > 0) {
    const p = Math.min(24, suspicious * 6);
    add(p, `korelasi: ${suspicious}x sinyal suspicious dari sesi/IP sama dalam 10 menit`);
  }
  if (bots > 0) {
    const p = Math.min(30, bots * 10);
    add(p, `korelasi: ${bots}x sinyal likely_bot dari sesi/IP sama dalam 10 menit`);
  }

  // Cluster: satu IP, banyak identitas browser berbeda + ada bukti.
  const distinctUa = new Set(win.map(e => e.ua).filter(Boolean));
  if (current.ua) distinctUa.add(current.ua);
  if (distinctUa.size >= 3 && evidence > 0) {
    add(10, `korelasi cluster: ${distinctUa.size} User-Agent berbeda dari IP/sesi sama dalam 10 menit`);
  }

  // Velocity: ramai saja tidak cukup — rata-rata skor jendela harus kotor.
  const total = win.length + 1;
  const meanBase = (win.reduce((a, e) => a + e.score, 0) + current.score) / total;
  if (total >= 10 && meanBase >= 20) {
    add(10, `korelasi velocity: ${total} sinyal dalam 10 menit dengan skor rata-rata ${Math.round(meanBase)}`);
  }

  return { points, reasons };
}

function applyCorrelation(baseResult, current, history, windowMs) {
  const { points, reasons } = correlate(current, history, windowMs);
  const score = Math.max(0, Math.min(100, baseResult.score + points));
  return {
    baseScore: baseResult.score,
    score,
    verdict: score >= 60 ? 'likely_bot' : score >= 30 ? 'suspicious' : 'likely_human',
    reasons: [...baseResult.reasons, ...reasons],
    correlationPoints: points,
  };
}

module.exports = { correlate, applyCorrelation };
