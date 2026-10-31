'use strict';
/**
 * Bot Detector Lab — server lab LOKAL, tanpa dependensi (Node stdlib saja).
 * Jalankan:  node server.js   →  http://127.0.0.1:8787
 *
 * Ini lab untuk server/halaman MILIKMU SENDIRI. Bukan untuk dipasang di
 * VPS produksi tanpa evaluasi — uji dulu di lokal sesuai batas pentest-mu.
 *
 * Catatan jujur soal JA3/TLS: fingerprint JA3 butuh terminasi TLS yang
 * mengekspos detail ClientHello (di produksi biasanya dari log load
 * balancer / nginx + modul, atau sensor khusus). Server HTTP lab ini TIDAK
 * mengklaim membaca JA3 — yang dicatat di sini adalah konsistensi header,
 * yang memang bisa diperiksa di lapisan aplikasi.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { scoreSignal } = require('./lib/score');

const PORT = process.env.PORT || 8787;
const events = [];            // {at, ip, score, verdict, reasons, ua}
const hitsByIp = new Map();   // ip -> [timestamps]

function serverSignals(req) {
  const ua = req.headers['user-agent'] || '';
  const secChUa = req.headers['sec-ch-ua'] || '';
  // Klaim Chrome di UA tapi client-hints kosong / sebaliknya = mismatch kasar
  const uaSaysChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua);
  const uaMismatch = uaSaysChrome && !secChUa && req.headers['sec-fetch-site'] !== undefined ? false
    : (uaSaysChrome && secChUa && !/Chromium|Google Chrome/.test(secChUa)) ? true : false;

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
    headerOrder: Object.keys(req.headers), // header order ikut dicatat utk dianalisis
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/signal') {
    let body = '';
    req.on('data', ch => { body += ch; if (body.length > 64_000) req.destroy(); });
    req.on('end', () => {
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch { /* payload kosong -> skor apa adanya */ }
      const signal = { client: payload.client || {}, behavior: payload.behavior || {}, server: serverSignals(req) };
      const result = scoreSignal(signal);
      const event = { at: new Date().toISOString(), ip: req.socket.remoteAddress, ua: signal.server.userAgent, ...result };
      events.unshift(event); if (events.length > 200) events.pop();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(event, null, 2));
    });
    return;
  }

  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(events, null, 2));
    return;
  }

  if (url.pathname === '/dashboard') {
    const rows = events.map(e =>
      `<tr><td>${e.at}</td><td>${e.score}</td><td>${e.verdict}</td><td>${e.reasons.map(r => `${r.reason} (+${r.points})`).join('<br>') || '—'}</td></tr>`
    ).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>Dashboard</title>
      <style>body{font-family:system-ui;margin:32px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px;vertical-align:top}</style>
      <h1>Dashboard detektor</h1><p><a href="/">← Halaman uji</a> · <a href="/api/events">JSON</a></p>
      <table><tr><th>Waktu</th><th>Skor</th><th>Verdict</th><th>Alasan</th></tr>${rows || '<tr><td colspan="4">Belum ada sinyal</td></tr>'}</table>`);
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

server.listen(PORT, '127.0.0.1', () => console.log(`Bot Detector Lab: http://127.0.0.1:${PORT}`));
