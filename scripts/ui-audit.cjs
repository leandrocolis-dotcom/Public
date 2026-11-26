/* global __dirname, process, console, URL, document, getComputedStyle, innerWidth, localStorage */
// Auditoria visual de TODAS as telas no celular (390 px) e no desktop (1280 px), com dados simulados a partir
// do histórico real (data/flow.json e data/hist): sem depender do Yahoo. Mede transbordo horizontal, alvos de
// toque pequenos, texto minúsculo e tabelas sem rolagem; salva prints em JPEG.
// Uso: npm run dev (porta 8080) e, em outro terminal: node scripts/ui-audit.cjs [saida] [aba1,aba2]
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT = process.argv[2] ?? path.join(ROOT, ".ui-audit");
const ONLY = process.argv[3]?.split(",");
const BASE = process.env.BASE ?? "http://localhost:8080";
fs.mkdirSync(OUT, { recursive: true });

const flow = JSON.parse(fs.readFileSync(path.join(ROOT, "data/flow.json"), "utf8"));
const lastOf = (s) => (flow.close[s] ?? []).filter((x) => x > 0);
function quoteFor(sym, i) {
  const s = lastOf(sym);
  let p = s.at(-1);
  if (!p) {
    const f = path.join(ROOT, "data/hist", `${sym}.csv`);
    if (fs.existsSync(f))
      p = Number(fs.readFileSync(f, "utf8").trim().split("\n").at(-1).split(",")[4]);
  }
  if (!p) p = 50 + (i % 40);
  const c = Math.sin(i * 1.7) * 0.012; // variação determinística
  return { p, pc: p / (1 + c), t: Math.floor(Date.now() / 1000) - 60, v: 1e6, av: 1.2e6, n: sym };
}
function quotesBody(url) {
  const u = new URL(url);
  const extra = (u.searchParams.get("extra") ?? "").split(",").filter(Boolean);
  const syms = u.searchParams.get("only") ? extra : [...Object.keys(flow.close), ...extra];
  const quotes = Object.fromEntries(syms.map((s, i) => [s, quoteFor(s, i)]));
  return { fetched_at: new Date().toISOString(), version: "audit", source: "audit", market_state: "REGULAR", count: syms.length, quotes, missing: [], errors: [] }; // prettier-ignore
}
function historyBody(url) {
  const u = new URL(url);
  const syms = (u.searchParams.get("symbols") ?? "").split(",").filter(Boolean);
  const series = {};
  for (const s of syms) {
    const f = path.join(ROOT, "data/hist", `${s}.csv`);
    if (fs.existsSync(f)) {
      const rows = fs
        .readFileSync(f, "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .map((l) => l.split(","));
      series[s] = { dates: rows.map((r) => r[0]), close: rows.map((r) => Number(r[4])), vol: rows.map((r) => Number(r[5])), name: s }; // prettier-ignore
    } else if (flow.close[s]) series[s] = { dates: flow.dates, close: flow.close[s], name: s };
  }
  return { fetched_at: new Date().toISOString(), series, missing: [], errors: [] };
}

const HOLDINGS = [["QQQ", 40, 380], ["XLK", 60, 190], ["GLD", 30, 210], ["TLT", 80, 95], ["SMH", 25, 220], ["XLE", 50, 88], ["IWM", 30, 205]].map(([sym, qty, avg]) => ({ sym, qty, avg })); // prettier-ignore

const TABS = ["home", "dash", "macro", "rates", "news", "calendar", "flow", "watch", "local", "brmacro", "brrates", "brnews", "brcal", "brflow", "brwatch", "portfolio", "journal", "risk", "rebal", "signals", "entry", "screener", "analysis", "value", "sim", "checks", "archive", "mesa", "settings"]; // prettier-ignore
const VPS = { mob: { width: 390, height: 844 }, desk: { width: 1280, height: 860 } };

(async () => {
  const b = await chromium.launch();
  const report = [];
  for (const tab of ONLY ?? TABS) {
    for (const [vk, vp] of Object.entries(VPS)) {
      const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: vk === "mob", isMobile: vk === "mob" }); // prettier-ignore
      await ctx.addInitScript((h) => {
        try {
          localStorage.setItem(
            "pendulo.portfolio",
            JSON.stringify({ holdings: h, at: Date.now() }),
          );
        } catch {
          // navegador sem armazenamento: a auditoria segue sem carteira
        }
      }, HOLDINGS);
      await ctx.route("**/api/quotes**", (r) => r.fulfill({ json: quotesBody(r.request().url()) }));
      await ctx.route("**/api/history**", (r) =>
        r.fulfill({ json: historyBody(r.request().url()) }),
      );
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
      await p.goto(`${BASE}/?tab=${tab}`, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(4500);
      const m = await p.evaluate(() => {
        const W = innerWidth;
        const R = (e) => e.getBoundingClientRect();
        const vis = (e) => {
          const r = R(e);
          const s = getComputedStyle(e);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const inScroller = (e) => {
          for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) {
            const s = getComputedStyle(x);
            if (/(auto|scroll|hidden)/.test(s.overflowX) && x.scrollWidth > x.clientWidth + 1)
              return true;
          }
          return false;
        };
        const view = document.getElementById("view");
        const all = [...view.querySelectorAll("*")].filter(vis);
        const name = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`; // prettier-ignore
        const over = all.filter((e) => R(e).right > W + 1 && !inScroller(e)).map(name);
        const taps = [...view.querySelectorAll("button,a,select,input,[role=button],[data-tab]")].filter(vis).filter((e) => R(e).height < 32 || R(e).width < 32); // prettier-ignore
        const tiny = all.filter((e) => e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 11.5); // prettier-ignore
        const tables = [...view.querySelectorAll("table")].filter(vis).map((t) => ({ w: Math.round(t.scrollWidth), box: Math.round(t.parentElement.clientWidth), scroll: inScroller(t.firstElementChild ?? t) || t.parentElement.scrollWidth > t.parentElement.clientWidth })); // prettier-ignore
        return {
          docW: document.documentElement.scrollWidth,
          h: document.documentElement.scrollHeight,
          over: [...new Set(over)].slice(0, 6),
          taps: taps.length,
          tapEx: [...new Set(taps.map(name))].slice(0, 5),
          tiny: tiny.length,
          tinyEx: [...new Set(tiny.map(name))].slice(0, 5),
          // altura até o primeiro conteúdo da tela (topo fixo + sub-abas + frase da aba)
          chrome: Math.round(R([...view.children].find((e) => !e.classList.contains("subnav") && vis(e)) ?? view).top), // prettier-ignore
          // textos cortados com reticências ou escondidos pela largura
          clipped: all.filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 2 && /hidden|clip/.test(getComputedStyle(e).overflow + getComputedStyle(e).textOverflow)).length, // prettier-ignore
          tables: tables.length,
          wideTables: tables.filter((t) => t.w > t.box + 2).length,
          cards: view.querySelectorAll(".card").length,
          empty: (view.innerText.match(/indispon|erro|falhou/gi) ?? []).length,
        };
      });
      await p.screenshot({ path: path.join(OUT, `${tab}-${vk}.jpg`), type: "jpeg", quality: 55, fullPage: true }).catch(() => {}); // prettier-ignore
      report.push({ tab, vp: vk, ...m, errs: errs.slice(0, 2) });
      console.log(JSON.stringify(report.at(-1)));
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  await b.close();
})();
