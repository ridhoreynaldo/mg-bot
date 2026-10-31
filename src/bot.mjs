// Putar ulang routine.json dengan batas aksi, istirahat berkala, dan berhenti otomatis
// saat muncul captcha / peringatan (tidak dilewati).
// Terminal: p = jeda/lanjut, q = berhenti.
import fs from "node:fs";
import path from "node:path";
import { between, config, gameBox, log, login, openBrowser, ROOT, sleep, waitEnter } from "./common.mjs";

const file = path.join(ROOT, config.routineFile);
if (!fs.existsSync(file)) {
  console.error(`${config.routineFile} belum ada. Jalankan dulu: npm run record`);
  process.exit(1);
}
const routine = JSON.parse(fs.readFileSync(file, "utf8"));
const L = config.limits;

const { ctx, page } = await openBrowser();
await login(page);
await waitEnter("Pastikan sudah login & berada di layar awal rute, lalu tekan Enter untuk mulai... ");

let paused = false;
let quit = false;
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on("data", (k) => {
  const c = k.toString().toLowerCase();
  if (c === "p") log((paused = !paused) ? "DIJEDA (tekan p untuk lanjut)" : "lanjut");
  if (c === "q" || c === "\u0003") quit = true;
});

async function stopReason() {
  for (const f of page.frames()) if (config.stopIf.frameUrlContains.some((s) => f.url().includes(s))) return `captcha/tantangan: ${f.url().slice(0, 80)}`;
  const text = ((await page.locator("body").innerText().catch(() => "")) || "").toLowerCase();
  const hit = config.stopIf.pageTextContains.find((s) => text.includes(s.toLowerCase()));
  return hit ? `teks peringatan: "${hit}"` : null;
}

const started = Date.now();
let nextBreak = started + L.breakEveryMinutes * 60_000;
const actions = []; // waktu aksi dalam 1 jam terakhir
let rounds = 0;

main: while (!quit) {
  for (const step of routine.steps) {
    while (paused && !quit) await sleep(500);
    if (quit) break main;

    if (Date.now() - started > L.maxSessionMinutes * 60_000) {
      log(`batas sesi ${L.maxSessionMinutes} menit tercapai`);
      break main;
    }
    if (Date.now() > nextBreak) {
      log(`istirahat ${L.breakMinutes} menit`);
      await sleep(L.breakMinutes * 60_000);
      nextBreak = Date.now() + L.breakEveryMinutes * 60_000;
    }
    while (actions.length && actions[0] < Date.now() - 3_600_000) actions.shift();
    if (actions.length >= L.maxActionsPerHour) {
      const wait = actions[0] + 3_600_000 - Date.now();
      log(`batas ${L.maxActionsPerHour} aksi/jam, tunggu ${Math.ceil(wait / 1000)} dtk`);
      await sleep(wait);
    }

    await sleep(between(step.waitMs ?? [800, 1500]));
    const reason = await stopReason();
    if (reason) {
      log(`BERHENTI — ${reason}. Selesaikan sendiri di browser, lalu jalankan ulang bot.`);
      break main;
    }

    if (step.type === "click") {
      const box = await gameBox(page);
      await page.mouse.click(box.x + step.x * box.width, box.y + step.y * box.height);
    } else if (step.type === "key") {
      await page.keyboard.press(step.key);
    }
    actions.push(Date.now());
  }
  rounds++;
  log(`putaran ${rounds} selesai (${actions.length} aksi dalam 1 jam terakhir)`);
  if (!routine.loop) break;
}

log(`selesai: ${rounds} putaran`);
if (process.stdin.isTTY) process.stdin.setRawMode(false);
await ctx.close();
process.exit(0);
