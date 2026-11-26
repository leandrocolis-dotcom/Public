// Medição de desempenho e de interface (docs/PLANO-OTIMIZACAO.md, Fase 0). Abre as abas do app em desktop
// (1440×900) e iPhone 13 com o Chromium do Playwright e grava, por aba: requisições (total, de API, de data/),
// KB transferidos, nós de DOM, textos visíveis < 12 px, controles visíveis < 40 px, tarefas longas (> 50 ms,
// CPU 4x mais lenta no celular).
// Uso: node scripts/perf-probe.mjs [--url http://localhost:8080] [--tabs home,dash,flow] [--idle 15000]
//      [--json saida.json] [--feed 6]. Sem --url, sobe o servidor local (npm run dev) numa porta livre.
//      --feed N: depois de parado, injeta N pacotes sintéticos do canal (preço de fechamento ± 0,2%, 1 a cada
//      1,5 s, via hooks.applyFeed; só no modo dev, com módulos soltos) e mede as tarefas longas que eles causam
//      (colunas feedLong/feedMax; Fase 3 do plano: nenhuma acima de 100 ms).
// Saída: tabela em Markdown no terminal (cole em docs/PERF-BASELINE.md).
/* global document, window, getComputedStyle */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const TABS = arg("tabs", "home,dash,local,flow,watch,signals,screener,portfolio").split(",");
const IDLE = Number(arg("idle", "8000"));
const OUT = arg("json", null);
const FEED = Number(arg("feed", "0"));

/** Injeta pacotes sintéticos do canal e devolve as tarefas longas do período (roda no navegador). */
async function feedBurst(n) {
  const { hooks, state } = await import("/assets/state.js");
  const close = state.flowBase?.close ?? {};
  const lt = [];
  const obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => lt.push(e.duration)));
  obs.observe({ type: "longtask" });
  for (let i = 0; i < n; i++) {
    const now = Date.now();
    const quotes = {};
    for (const [s, c] of Object.entries(close)) {
      if (!(c.at(-1) > 0)) continue;
      const p = c.at(-1) * (1 + (Math.random() - 0.5) * 0.004);
      quotes[s] = { p, pc: c.at(-2) ?? c.at(-1), t: Math.floor(now / 1000), ms: "REGULAR" };
    }
    const count = Object.keys(quotes).length;
    hooks.applyFeed?.({ fetched_at: new Date(now).toISOString(), market_state: "REGULAR", count, total: count, quotes, missing: [] }); // prettier-ignore
    await new Promise((r) => setTimeout(r, 1500));
  }
  obs.disconnect();
  return { feedLong: lt.filter((d) => d > 100).length, feedMax: Math.round(Math.max(0, ...lt)) };
}

async function startServer() {
  const port = 8800 + Math.floor(Math.random() * 100);
  const p = spawn(process.execPath, ["scripts/dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => p.kill() };
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  p.kill();
  throw new Error("servidor local não subiu");
}

/** Medidas na página já aberta (roda dentro do navegador). */
function pageMetrics() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0)
      return null;
    return r;
  };
  let small = 0;
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own || !vis(el)) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 12) small++;
  }
  const ctrls = [
    ...document.querySelectorAll(
      "button, a[href], [role=button], [role=tab], input, select, summary",
    ),
  ]
    .map(vis)
    .filter(Boolean);
  const tiny = ctrls.filter((r) => Math.min(r.width, r.height) < 40).length;
  return {
    dom: document.querySelectorAll("*").length,
    height: document.documentElement.scrollHeight,
    small,
    ctrls: ctrls.length,
    tiny,
    longTasks: (window.__lt ?? []).length,
    longMax: Math.round(Math.max(0, ...(window.__lt ?? []))),
  };
}

async function probe(browser, base, profile, tab) {
  const ctx = await browser.newContext(
    profile === "mobile" ? { ...devices["iPhone 13"] } : { viewport: { width: 1440, height: 900 } },
  );
  await ctx.addInitScript(() => {
    window.__lt = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: "longtask", buffered: true });
    } catch {
      /* sem suporte */
    }
  }); // prettier-ignore
  const page = await ctx.newPage();
  if (profile === "mobile") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  const reqs = [];
  page.on("requestfinished", async (r) => {
    const s = await r.sizes().catch(() => null);
    reqs.push({ url: r.url(), bytes: s ? s.responseBodySize + s.responseHeadersSize : 0 });
  });
  const t0 = Date.now();
  await page.goto(`${base}/?tab=${tab}`, { waitUntil: "load" });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(IDLE);
  const m = await page.evaluate(pageMetrics);
  const f = FEED ? await page.evaluate(feedBurst, FEED).catch(() => ({})) : {};
  await ctx.close();
  const path = (u) => new URL(u).pathname;
  return {
    profile,
    tab,
    loadMs,
    requests: reqs.length,
    api: reqs.filter((r) => path(r.url).startsWith("/api/")).length,
    data: reqs.filter((r) => path(r.url).startsWith("/data/")).length,
    js: reqs.filter((r) => path(r.url).endsWith(".js")).length,
    kb: Math.round(reqs.reduce((n, r) => n + r.bytes, 0) / 1024),
    ...m,
    ...f,
  };
}

const srv = arg("url", null) ? { url: arg("url"), stop: () => {} } : await startServer();
const browser = await chromium.launch();
const rows = [];
try {
  for (const profile of ["desktop", "mobile"])
    for (const tab of TABS) {
      const r = await probe(browser, srv.url, profile, tab).catch((e) => ({
        profile,
        tab,
        error: e.message,
      }));
      rows.push(r);
      process.stderr.write(`${profile}/${tab} ok\n`);
    }
} finally {
  await browser.close();
  srv.stop();
}

const cols = ["profile", "tab", "loadMs", "requests", "api", "data", "js", "kb", "dom", "height", "small", "tiny", "ctrls", "longTasks", "longMax", ...(FEED ? ["feedLong", "feedMax"] : [])]; // prettier-ignore
console.log(`| ${cols.join(" | ")} |`);
console.log(`| ${cols.map(() => "---").join(" | ")} |`);
for (const r of rows)
  console.log(
    `| ${cols.map((c) => r[c] ?? (r.error && c === "loadMs" ? "erro" : "")).join(" | ")} |`,
  );
if (OUT) writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
