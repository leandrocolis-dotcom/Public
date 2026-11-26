// Balanços das empresas de tecnologia por subtema -> data/earnings.json (Agenda › 💻 Balanços tech).
// Fonte: Nasdaq (gratuita, sem chave): calendário de resultados por dia (data, horário, consenso de LPA),
// previsão por trimestre (faixa, nº de analistas, revisões em 4 semanas) e histórico de surpresas (data divulgada).
// Preço em volta de cada divulgação: base histórica do repositório (data/hist).
// Uso: node scripts/update-earnings.mjs
import { writeFile } from "node:fs/promises";
import { readHist } from "../api/_hist.js";
import {
  EARN_THEMES,
  buildCompany,
  earningsUniverse,
  parseCalendarRows,
  parseForecast,
  parseSurprise,
} from "../assets/earnings.js";

const OUT = new URL("../data/earnings.json", import.meta.url);
const AHEAD_DAYS = 100;
const PAR = 4;
const HEADERS = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (pendulo)" };

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch {
      /* tenta de novo */
    }
    await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  throw new Error(`falhou: ${url}`);
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let k = 0;
  await Promise.all(
    Array.from({ length: PAR }, async () => {
      while (k < items.length) {
        const i = k++;
        out[i] = await fn(items[i]).catch((e) => ({ error: e.message }));
      }
    }),
  );
  return out;
}

const iso = (d) => d.toISOString().slice(0, 10);
const BACK_DAYS = 21;
const weekdays = (n) => {
  const out = [];
  for (let i = -BACK_DAYS; i <= n; i++) {
    const d = new Date(Date.now() + i * 864e5);
    if (d.getUTCDay() % 6) out.push(iso(d));
  }
  return out;
};

const universe = earningsUniverse();
const wanted = new Set(universe.map((u) => u.sym));
const errors = [];

// 1) calendário: próxima data confirmada (de hoje em diante) e divulgação recente (últimas 3 semanas)
const today = iso(new Date());
const calBy = {};
const recentBy = {};
const days = weekdays(AHEAD_DAYS);
const calRes = await pool(days, (d) => getJson(`https://api.nasdaq.com/api/calendar/earnings?date=${d}`)); // prettier-ignore
days.forEach((d, i) => {
  const r = calRes[i];
  if (r?.error) return errors.push(`calendário ${d}`);
  for (const row of parseCalendarRows(r?.data?.rows, d))
    if (!wanted.has(row.sym)) continue;
    else if (row.date >= today) calBy[row.sym] ??= row;
    else recentBy[row.sym] = row; // dias em ordem: fica a mais recente
});

// 2) por empresa: surpresas (o que já saiu) + previsão do próximo trimestre
const per = await pool(universe, async ({ sym }) => {
  const q = encodeURIComponent(sym);
  const [s, f] = await Promise.all([
    getJson(`https://api.nasdaq.com/api/company/${q}/earnings-surprise`),
    getJson(`https://api.nasdaq.com/api/analyst/${q}/earnings-forecast`),
  ]);
  return { surprise: parseSurprise(s), forecast: parseForecast(f) };
});

const companies = [];
universe.forEach((u, i) => {
  const r = per[i];
  if (r?.error) return errors.push(u.sym);
  // ETF (ou sem cobertura): sem histórico, sem previsão e fora do calendário -> fica de fora
  if (!r.surprise.length && !r.forecast.length && !calBy[u.sym] && !recentBy[u.sym]) return;
  const h = readHist(u.sym);
  const bars = h ? h.dates.map((date, k) => ({ date, c: h.c[k] })) : null;
  companies.push(buildCompany({ ...u, cal: calBy[u.sym] ?? null, recent: recentBy[u.sym] ?? null, ...r, bars, today })); // prettier-ignore
});

const body = {
  generated_at: new Date().toISOString(),
  source: "Nasdaq (calendário, consenso e surpresas) + data/hist (preço)",
  themes: EARN_THEMES.map((t) => t.label),
  companies: companies.sort((a, b) =>
    (a.next?.date ?? "9999").localeCompare(b.next?.date ?? "9999"),
  ),
  errors,
};
await writeFile(OUT, JSON.stringify(body) + "\n");
console.log(`${companies.length} empresas · ${Object.keys(calBy).length} com data confirmada · ${errors.length} falhas`); // prettier-ignore
