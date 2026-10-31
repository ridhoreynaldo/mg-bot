// Status bot + data akun yang dibaca dari respons API game di browser bot (hanya membaca, tidak mengirim apa pun).
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./common.mjs";

const API_DIR = path.join(ROOT, "logs", "api");
fs.mkdirSync(API_DIR, { recursive: true });

export const state = {
  mode: "idle", // idle | monitor | record | farming | paused | break | stopped
  startedAt: Date.now(),
  rounds: 0,
  actionsLastHour: 0,
  note: "",
  stopReason: "",
  api: {}, // path -> { at, data }
  log: [],
};

export function setState(patch) {
  Object.assign(state, patch);
}

export function pushLog(line) {
  state.log.push(line);
  if (state.log.length > 200) state.log.shift();
}

/** Simpan setiap respons JSON /api/* terakhir per endpoint; juga ditulis ke logs/api/ untuk dipelajari. */
export function captureApi(page) {
  page.on("response", async (r) => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith("/api/") || r.status() >= 400) return;
    if (!(r.headers()["content-type"] ?? "").includes("json")) return;
    let data;
    try {
      data = await r.json();
    } catch {
      return;
    }
    const key = url.pathname.slice(5) || "root";
    state.api[key] = { at: Date.now(), data };
    fs.writeFile(path.join(API_DIR, key.replace(/\W+/g, "_") + ".json"), JSON.stringify(data, null, 2), () => {});
  });
}
