'use strict';
/**
 * Bot Detector Lab — server lab LOKAL, tanpa dependensi (Node stdlib saja).
 * Jalankan:  node server.js   →  http://127.0.0.1:8787
 *
 * Fase 2: hasil PERSISTEN dan ada KORELASI per sesi/IP.
 * - Setiap event ditambahkan ke data/events.jsonl (satu JSON per baris)
 *   dan dimuat kembali saat server start, jadi dashboard tidak kosong
 *   lagi setelah restart. Lokasi file bisa diganti lewat env DATA_FILE.
 * - Skor akhir = skor dasar (lib/score.js) + poin korelasi
 *   (lib/correlate.js) dari riwayat sesi/IP yang sama dalam 10 menit.
 *
 * Ini lab untuk server/halaman MILIKMU SENDIRI. Bukan untuk dipasang di
 * VPS produksi tanpa evaluasi — uji dulu di lokal sesuai batas pentest-mu.
 *
 * Catatan jujur soal JA3/TLS: fingerprint JA3 butuh terminasi TLS yang
 * mengekspos detail ClientHello. Server HTTP lab ini TIDAK mengklaim
 * membaca JA3 — yang dicatat di sini adalah konsistensi header.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { scoreSignal } = require('./lib/score');
const { applyCorrelation } = require('./lib/correlate');

const PORT = process.env.PORT || 8787;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'events.jsonl');
const MAX_EVENTS = 1000;

// ---------- persistensi ----------
function loadEvents() {
  try {
    return fs.readFileSync(DATA_FILE, 'utf8').split('\n').filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean).slice(-MAX_EVENTS).reverse(); // terbaru di depan
  } catch { return []; }
}
function persist(event) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.appendFileSync(DATA_FILE, JSON.stringify(event) + '\n');
  } catch (e) { console.error('gagal menyimpan event:', e.message); }
}
const events = loadEvents();
const hitsByIp = new Map();   // ip -> [timestamps] untuk sinyal burst/rate

function serverSignals(req) {
  const ua = req.headers['user-agent'] || '';
  const secChUa = req.headers['sec-ch-ua'] || '';
  const uaSaysChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua);
  const uaMismatch = (uaSaysChrome && secChUa && !/Chromium|Google Chrome/.test(secChUa)) ? true : false;

  const now = Date.now();
  const ip = req.socket.remoteAddress || 'unknown';
  const hits = (hitsByIp.get(ip) || []).filter(t => now - t < 60_000);
  hits.push(now); hitsByIp.set(ip, hits);
  const burst = hits.filter(t => now - t < 1_000).length >= 10;

  return {
    userAgent: ua,
    secChUa,
    hasSecFetch: Boolean(req.headers['sec-fetch-site'] || req.headers['sec-fetch-mode']),
    hasAcceptLanguage: Boolean(req.headers['accept-language']),
    uaMismatch,
    requestsInWindow: hits.length,
    burst,
    headerOrder: Object.keys(req.headers),
  };
}

function correlationKey(req, payload) {
  if (payload.sessionId) return `sess:${payload.sessionId}`;
  const ua = req.headers['user-agent'] || '';
  return `ip:${req.socket.remoteAddress}|${ua.slice(0, 40)}`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/signal') {
    let body = '';
    req.on('data', ch => { body += ch; if (body.length > 64_000) req.destroy(); });
    req.on('end', () => {
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch { /* payload kosong */ }
      const signal = { client: payload.client || {}, behavior: payload.behavior || {}, server: serverSignals(req) };
      const base = scoreSignal(signal);
      const key = correlationKey(req, payload);
      const now = Date.now();
      const history = events
        .filter(e => e.key === key)
        .map(e => ({ score: e.baseScore ?? e.score, at: Date.parse(e.at), ua: e.ua }));
      const result = applyCorrelation(base, { score: base.score, at: now, ua: signal.server.userAgent }, history);
      const event = {
        at: new Date(now).toISOString(), key,
        ip: req.socket.remoteAddress, ua: signal.server.userAgent, ...result,
      };
      events.unshift(event); if (events.length > MAX_EVENTS) events.pop();
      persist(event);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(event, null, 2));
    });
    return;
  }

  if (url.pathname === '/api/events') {
    const verdict = url.searchParams.get('verdict');
    const key = url.searchParams.get('key');
    let out = events;
    if (verdict) out = out.filter(e => e.verdict === verdict);
    if (key) out = out.filter(e => e.key === key);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out, null, 2));
    return;
  }

  if (url.pathname === '/dashboard') {
    const verdict = url.searchParams.get('verdict') || '';
    const key = url.searchParams.get('key') || '';
    let rows = events;
    if (verdict) rows = rows.filter(e => e.verdict === verdict);
    if (key) rows = rows.filter(e => e.key === key);
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const trs = rows.map(e =>
      `<tr><td>${esc(e.at)}</td><td>${esc(e.key)}</td><td>${e.baseScore ?? e.score} → <b>${e.score}</b></td><td>${esc(e.verdict)}</td><td>${e.reasons.map(r => `${esc(r.reason)} (+${r.points})`).join('<br>') || '—'}</td></tr>`
    ).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>Dashboard</title>
      <style>body{font-family:system-ui;margin:32px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px;vertical-align:top}</style>
      <h1>Dashboard detektor</h1>
      <p><a href="/">← Halaman uji</a> · <a href="/api/events">JSON</a></p>
      <form method="get" action="/dashboard">
        Verdict: <select name="verdict">
          <option value="">semua</option>
          ${['likely_human', 'suspicious', 'likely_bot'].map(v => `<option ${v === verdict ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        Kunci sesi/IP: <input name="key" value="${esc(key)}" size="36">
        <button>Terapkan filter</button>
      </form>
      <p>Skor ditampilkan sebagai <i>dasar → akhir</i> (akhir = dasar + korelasi 10 menit).</p>
      <table><tr><th>Waktu</th><th>Kunci</th><th>Skor</th><th>Verdict</th><th>Alasan</th></tr>${trs || '<tr><td colspan="5">Belum ada sinyal yang cocok</td></tr>'}</table>`);
    return;
  }

  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const full = path.join(__dirname, 'public', file);
  if (!full.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(full)) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
  fs.createReadStream(full).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => console.log(`Bot Detector Lab: http://127.0.0.1:${PORT} (data: ${DATA_FILE}, ${events.length} event lama dimuat)`));
