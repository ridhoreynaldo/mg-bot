// Cek cepat: buka situs, cari elemen game, form login & tanda captcha, simpan screenshot ke logs/.
// Tidak melakukan aksi farming apa pun.
import path from "node:path";
import { config, gameBox, log, openBrowser, ROOT, sleep } from "./common.mjs";

const { ctx, page } = await openBrowser();
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await sleep(3000);

log("judul:", JSON.stringify(await page.title()), "url:", page.url());
const target = await page.locator(config.target).count();
log("elemen game (target):", target ? `${target} ditemukan` : "TIDAK ditemukan", JSON.stringify(await gameBox(page)));
const inputs = await page.locator("input").evaluateAll((els) =>
  els.map((e) => `${e.tagName.toLowerCase()}[type=${e.type}]${e.name ? `[name=${e.name}]` : ""}${e.id ? `#${e.id}` : ""}`),
);
log("input di halaman:", inputs.join(", ") || "-");
const frames = page.frames().map((f) => f.url()).filter((u) => u && u !== "about:blank");
log("frame:", frames.join(" | ") || "-");
const captcha = frames.filter((u) => config.stopIf.frameUrlContains.some((s) => u.includes(s)));
log("captcha/tantangan:", captcha.length ? captcha.join(" | ") : "tidak ada");

const shot = path.join(ROOT, "logs", "check.png");
await page.screenshot({ path: shot });
log("screenshot:", shot);
await ctx.close();
