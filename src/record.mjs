// Rekam rute farming: klik di dalam game seperti biasa, setiap klik dicatat beserta jedanya.
// Tekan Enter di terminal untuk menyimpan ke routine.json.
import fs from "node:fs";
import path from "node:path";
import { config, gameBox, log, login, openBrowser, ROOT, waitEnter } from "./common.mjs";

const { ctx, page } = await openBrowser();
await login(page);
await waitEnter("Login & buka layar awal farming di browser, lalu tekan Enter untuk mulai merekam... ");

const steps = [];
let last = Date.now();
await page.exposeFunction("__mgRecord", async (x, y) => {
  const box = await gameBox(page);
  const now = Date.now();
  const gap = now - last;
  const step = {
    type: "click",
    x: +((x - box.x) / box.width).toFixed(4),
    y: +((y - box.y) / box.height).toFixed(4),
    // jeda sebelum klik ini, diberi rentang ±25% saat diputar ulang
    waitMs: [Math.round(gap * 0.75), Math.round(gap * 1.25)],
  };
  last = now;
  steps.push(step);
  log(`klik #${steps.length} di (${step.x}, ${step.y}) setelah ${(gap / 1000).toFixed(1)} dtk`);
});
// klik pada canvas/embed tidak selalu sampai ke dokumen; mousedown ditangkap di fase capture
await page.evaluate(() => document.addEventListener("mousedown", (e) => window.__mgRecord(e.clientX, e.clientY), true));

await waitEnter("Merekam. Lakukan satu putaran farming, lalu tekan Enter untuk menyimpan... ");
const file = path.join(ROOT, config.routineFile);
fs.writeFileSync(file, JSON.stringify({ loop: true, steps }, null, 2));
log(`${steps.length} langkah disimpan ke ${config.routineFile}`);
await ctx.close();
process.exit(0);
