// Universo de mercado único (Screener e painel de Oportunidades): S&P 500 do Quant Aberto + todos os rótulos da
// taxonomia de setores (universo_setores_tickers.md) + campeões. Histórico diário de 1 ano pela api/history, em blocos
// estáveis de 40 (cache da borda), só quando uma aba que usa o universo está aberta, no máximo 1 vez por hora.
import { momentumOf, rsi14 } from "./engine.js";
import { SECTORS, SECTOR_BLOCKS } from "./sectors.js";
import { SECTOR_PT, champ, loadChampions } from "./champions.js";
import { ensureQuant, qv } from "./quant-view.js";
import { fetchJSON, stableLots } from "./net.js";
import { fetchQuotes } from "./quote-hub.js";
import { hooks, state } from "./state.js";
import { nyDate } from "./live.js";
import { usSession } from "./refresh.js";

const TTL = 60 * 60_000;
export const mkt = { series: {}, at: 0, loading: false, quotes: {}, qAt: 0, qLoading: false, scan: null, scanBy: {}, scanAt: 0 }; // prettier-ignore
const Q_TTL = 60_000; // cotações ao vivo do universo: 1 vez por minuto (cache de 60 s na borda)
const BLOCK = Object.fromEntries(SECTOR_BLOCKS);

/** Todos os ativos do universo, com nome e grupo: { sym: { name, group } }. */
export function universe() {
  const out = {};
  for (const r of qv.data?.rows ?? [])
    out[r.sym] = { name: r.name, group: SECTOR_PT[r.sector] ?? r.sector ?? "Ações" };
  for (const s of SECTORS)
    for (const sym of s.syms) out[sym] ??= { name: sym, group: BLOCK[s.block] ?? s.block };
  for (const m of champ.data?.members ?? [])
    out[m.s] ??= { name: m.name, group: SECTOR_PT[m.sector] ?? m.sector ?? "Ações" };
  return out;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const ret = (s, k) => (s.length > k && s[s.length - 1 - k] > 0 ? s.at(-1) / s[s.length - 1 - k] - 1 : null); // prettier-ignore

/** Métricas do Screener a partir de 1 ano de fechamentos (mínimo 200 pregões). Pura. */
export function marketMetrics(sym, h, info = {}, q = null) {
  let s = h?.close ?? [];
  // preço ao vivo: substitui o fechamento do dia (mesma data) ou entra como o pregão de hoje
  const live = q?.p > 0 && s.length && q.t ? q : null;
  if (live) {
    const d = nyDate(live.t);
    const last = h.dates.at(-1);
    if (d === last) s = [...s.slice(0, -1), live.p];
    else if (d > last) s = [...s, live.p];
  }
  const out = { code: sym, name: h?.name ?? info.name ?? sym, group: info.group ?? "", ok: s.length >= 200 }; // prettier-ignore
  if (!out.ok) return out;
  const p = s.at(-1);
  const ma50 = mean(s.slice(-50));
  const ma200 = mean(s.slice(-200));
  const year = h.dates.at(-1).slice(0, 4);
  const i0 = h.dates.findLastIndex((d) => d.slice(0, 4) < year);
  const [r1m, r3m, r6m] = [ret(s, 21), ret(s, 63), ret(s, 126)];
  const rsi = rsi14(s);
  const prev = live?.pc > 0 ? live.pc : s.at(-2);
  // volatilidade: oscilação diária típica (σ de 20 pregões) e movimentos medidos nela
  const rets = [];
  for (let i = s.length - 21; i < s.length - 1; i++) rets.push(s[i] / s[i - 1] - 1);
  const rm = mean(rets);
  const vol20 = Math.sqrt(rets.reduce((a, x) => a + (x - rm) ** 2, 0) / (rets.length - 1));
  const ma20 = mean(s.slice(-20));
  const r1d = prev > 0 ? p / prev - 1 : null;
  // abaixo de 0,3% ao dia (caixa, T-bills) o σ é ruído: sem medida em σ
  const sig = (x) => (x != null && vol20 >= 0.003 ? x / vol20 : null);
  return Object.assign(out, {
    vol20,
    z1: sig(r1d),
    rangeZ: live?.dh > 0 && live?.dl > 0 && prev > 0 ? sig((live.dh - live.dl) / prev) : null,
    vsMa20: p / ma20 - 1,
    stretch: sig(p / ma20 - 1),
    r5d: ret(s, 5),
    price: p,
    live: !!live,
    r1d,
    prevAboveMa200: prev > ma200,
    relVol: live?.v > 0 && live?.av > 0 ? live.v / live.av : null,
    dayHigh: live?.dh ?? null,
    h52: Math.max(...s.slice(0, -1)),
    r1m,
    r3m,
    r6m,
    ytd: i0 >= 0 ? p / s[i0] - 1 : null,
    ma50,
    ma200,
    vsMa50: p / ma50 - 1,
    fromHigh: p / Math.max(...s) - 1,
    rsi,
    momentum: momentumOf({ p, ma50, ma200, r1m, r3m, r6m, rsi }),
  });
}

/** Busca o que falta do universo (só com a aba aberta). Redesenha ao terminar cada bloco. */
export async function loadMarket(force = false) {
  if (mkt.loading || (!force && Date.now() - mkt.at < TTL)) return;
  mkt.loading = true;
  mkt.at = Date.now();
  try {
    await Promise.all([ensureQuant(), loadChampions()]);
    const syms = Object.keys(universe());
    await Promise.all(
      stableLots(syms, syms, 40).map((c) =>
        fetchJSON(`api/history?symbols=${encodeURIComponent(c.join(","))}`, { bg: true })
          .then((j) => {
            Object.assign(mkt.series, j?.series ?? {});
            hooks.render();
          })
          .catch(() => null),
      ),
    );
  } finally {
    mkt.loading = false;
  }
  hooks.render();
}

/** Métricas de todo o universo (para o Screener). */
export function marketAssets() {
  const u = universe();
  return Object.entries(u).map(([sym, info]) =>
    marketMetrics(sym, mkt.series[sym], info, mkt.quotes[sym]),
  );
}

export const marketProgress = () => {
  const n = Object.keys(universe()).length;
  const u = universe();
  return { n, have: Object.keys(mkt.series).filter((s) => u[s]).length, loading: mkt.loading };
};

/** Cotações ao vivo do universo inteiro (?only=1, blocos estáveis de 60 = 1 consulta ao Yahoo cada). Só com pregão aberto/pré/pós. */
export async function loadMarketQuotes(force = false) {
  if (mkt.qLoading || (!force && Date.now() - mkt.qAt < Q_TTL)) return;
  if (!force && usSession() === "closed" && mkt.qAt) return;
  mkt.qLoading = true;
  mkt.qAt = Date.now();
  try {
    await Promise.all([ensureQuant(), loadChampions()]); // o universo completo (S&P 500) antes de pedir as cotações
    const syms = Object.keys(universe());
    // central de cotações: blocos estáveis de 60, um por vez (em rajada o Yahoo responde 429), sem o que o
    // canal já traz; erro por ativo fica registrado na central
    const r = await fetchQuotes(syms, { ttl: Q_TTL - 5_000, force });
    Object.assign(mkt.quotes, r.quotes);
  } finally {
    mkt.qLoading = false;
  }
  hooks.render();
}

const MARKET_TABS = new Set(["signals", "screener"]);
let timer = null;
/** Liga a atualização de 1 em 1 minuto enquanto uma aba do mercado estiver aberta. */
export function watchMarket() {
  loadMarket();
  loadMarketQuotes();
  if (timer) return;
  timer = setInterval(() => {
    if (!MARKET_TABS.has(state.prefs.tab) || document.hidden) return;
    loadMarketQuotes();
  }, Q_TTL);
}

/** Varredura diária do servidor (Decisão do trader do universo inteiro): no máximo a cada 30 min. */
let scanP = null;
export function loadScan(force = false) {
  if (scanP) return scanP;
  if (!force && mkt.scan && Date.now() - mkt.scanAt < 30 * 60_000) return Promise.resolve(mkt.scan);
  scanP = fetchJSON(`data/market-scan.json?d=${new Date().toISOString().slice(0, 13)}`, {
    bg: true,
  })
    .then((d) => {
      if (d?.rows?.length) {
        mkt.scan = d;
        mkt.scanBy = Object.fromEntries(d.rows.map((r) => [r.s, r]));
        hooks.render();
      }
      return mkt.scan;
    })
    .catch(() => mkt.scan)
    .finally(() => {
      mkt.scanAt = Date.now();
      scanP = null;
    });
  return scanP;
}
export const scanSyms = () => Object.keys(mkt.scanBy);

/** Preço de agora de um ticker, da MESMA fonte que a lista usa (carteira ao vivo, depois cotações do mercado). */
export const livePrice = (sym, st) => st?.live?.quotes?.[sym]?.p || mkt.quotes[sym]?.p || null;
