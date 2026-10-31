import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));

const LOG_DIR = path.join(ROOT, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(LOG_DIR, `bot-${new Date().toISOString().slice(0, 10)}.log`);

export function log(...parts) {
  const line = `[${new Date().toLocaleTimeString("id-ID")}] ${parts.join(" ")}`;
  console.log(line);
  fs.appendFileSync(logFile, line + "\n");
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const between = ([min, max]) => min + Math.random() * (max - min);

/** Browser biasa yang terlihat; profil disimpan di ./profile agar login tidak diulang. */
export async function openBrowser() {
  const ctx = await chromium.launchPersistentContext(path.join(ROOT, "profile"), {
    headless: false,
    viewport: config.viewport,
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(config.url, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

/** Isi form login kalau selector diisi di config.json; kalau kosong, login manual di jendela browser. */
export async function login(page) {
  const { userSelector, passSelector, submitSelector } = config.login;
  if (!userSelector || !process.env.MG_USER) return;
  const field = page.locator(userSelector).first();
  if (!(await field.isVisible().catch(() => false))) return; // sudah login (profil tersimpan)
  await field.fill(process.env.MG_USER);
  await page.locator(passSelector).first().fill(process.env.MG_PASS ?? "");
  await page.locator(submitSelector).first().click();
  log("login dikirim untuk", process.env.MG_USER);
}

/** Elemen game (canvas / embed / iframe); posisi klik disimpan relatif terhadapnya. */
export async function gameBox(page) {
  const box = await page.locator(config.target).first().boundingBox().catch(() => null);
  return box ?? { x: 0, y: 0, width: config.viewport.width, height: config.viewport.height };
}

export function waitEnter(prompt) {
  process.stdout.write(prompt);
  return new Promise((r) => process.stdin.once("data", () => r()));
}
