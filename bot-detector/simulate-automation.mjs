// Simulasi automation untuk menguji DETEKTORMU SENDIRI di lab lokal.
// Syarat: server lab sedang jalan (node server.js) di terminal lain.
// Jalan:  node simulate-automation.mjs        (dari folder bot-detector)
//
// Memakai Playwright dari repo induk mg-bot (sudah kamu install untuk bot-mu).
// Dua skenario, masing-masing di page baru supaya penghitung collector reset:
//  A) klik DOM via element.click() — cara bot script klasik
//  B) klik via Playwright page.click() — input lewat CDP, lebih mirip fisik
// Bandingkan skor + alasan keduanya di output dan di dashboard.
import { chromium } from 'playwright';

const BASE = process.env.DETECTOR_URL || 'http://127.0.0.1:8787';

async function scenario(browser, name, act) {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await act(page);
  const result = await page.evaluate(() => window.__sendSignal());
  console.log(`\n=== ${name} ===`);
  console.log(`skor: ${result.score}  verdict: ${result.verdict}`);
  for (const r of result.reasons) console.log(`  +${r.points}  ${r.reason}`);
  if (!result.reasons.length) console.log('  (tidak ada sinyal yang menyala)');
  await page.close();
  return result;
}

const browser = await chromium.launch({ headless: true });
try {
  await scenario(browser, 'A — klik DOM element.click()', async (page) => {
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) document.getElementById('target1').click();
    });
  });

  await scenario(browser, 'B — klik Playwright page.click()', async (page) => {
    for (let i = 0; i < 4; i++) await page.click(i % 2 ? '#target2' : '#target1');
  });

  console.log('\nSelesai. Refresh dashboard untuk melihat dua baris barunya: ' + BASE + '/dashboard');
} catch (e) {
  console.error('Gagal — pastikan server lab jalan di terminal lain: node server.js');
  console.error(String(e).split('\n')[0]);
  process.exitCode = 1;
} finally {
  await browser.close();
}
