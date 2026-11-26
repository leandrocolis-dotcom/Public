// Notícias e juros: carga, ligação com a carteira e avisos.
import { topicTitle } from "./notif-topics.js";
import { ptTitle } from "./translate.js";
import { matchNews, mergeItems, newsSig, passTags, sameStory, tagNews } from "./news.js";
import { hooks, isOnshore, state, store } from "./state.js";
import { toast } from "./widgets.js";
import { fetchJSON } from "./net.js";
import { fetchQuotes, hubErrors } from "./quote-hub.js";
import { osNotify } from "./signal-center.js";
import { linkFor } from "./notif-log.js";
import { lists } from "./desk.js";
import { missingExtras } from "./dash-extra.js";
import { weekendWindow } from "./weekend.js";
import { BR_SYMBOLS, STOCKS, b3Session } from "./br.js";

/** Séries de 1 ano dos ativos que o usuário acrescentou aos quadros do Painel. */
export async function loadDashExtra() {
  state.dashSeries ??= {};
  state.dashMiss ??= new Set();
  const need = missingExtras(state.prefs.dashExtra, state.dashSeries).filter(
    (s) => !state.dashMiss.has(s),
  );
  await loadDashLive();
  if (!need.length) return;
  try {
    const r = await fetchJSON(`api/history?symbols=${encodeURIComponent(need.join(","))}`);
    Object.assign(state.dashSeries, r?.series ?? {});
    for (const s of r?.missing ?? []) state.dashMiss.add(s);
  } catch {
    for (const s of need) state.dashMiss.add(s);
  }
  if (["dash", "local"].includes(state.prefs.tab)) hooks.render?.();
}

/** Cotação ao vivo dos ativos acrescentados ao Painel (no máximo 1 busca por minuto). */
async function loadDashLive() {
  const syms = [
    ...new Set(
      Object.values(state.prefs.dashExtra ?? {})
        .flat()
        .map((x) => x.sym),
    ),
  ];
  if (!syms.length) return;
  // central de cotações: validade de 1 min por ativo, o que o canal traz não é buscado; erro fica na central
  const r = await fetchQuotes(syms, { id: "dash", bg: false });
  state.dashLive = { ...state.dashLive, ...r.quotes };
  if (r.fetched && ["dash", "local"].includes(state.prefs.tab)) hooks.render?.();
}

/**
 * Mercado › Local (Brasil): histórico de 1 ano (a cada 30 min), cotações ao vivo e macro do BCB (a cada 30 min).
 * O preço chega pelo canal de tempo real junto com o universo (15 s); sem canal, busca a cada 1 min no pregão
 * da B3 e 5 min fora dele. Chamado pelo relógio enquanto a aba está aberta.
 */
export async function loadLocal(force = false) {
  const L = (state.br ??= { hist: {}, quotes: {}, macro: null, errors: {} });
  const now = Date.now();
  const jobs = [];
  if (force || !L.histAt || now - L.histAt > 30 * 60000) {
    L.histAt = now;
    const need = BR_SYMBOLS;
    const parts = [];
    for (let i = 0; i < need.length; i += 40) parts.push(need.slice(i, i + 40));
    jobs.push(
      Promise.allSettled(
        parts.map((p) =>
          fetchJSON(`api/history?vol=1&symbols=${encodeURIComponent(p.join(","))}`, { bg: true }),
        ),
      ).then((rs) => {
        const ok = rs.filter((r) => r.status === "fulfilled");
        for (const r of ok) Object.assign(L.hist, r.value?.series ?? {});
        L.errors.hist = ok.length ? null : "histórico indisponível";
        if (!ok.length) L.histAt = now - 25 * 60000; // tenta de novo em 5 min
      }),
    );
  }
  // o canal de tempo real (15 s) já traz a B3 no pacote: a busca própria só cobre quando ele está mudo
  const viaFeed =
    state.liveRaw?.quotes?.["^BVSP"] && now - Date.parse(state.liveRaw.fetched_at ?? 0) < 90000;
  const every = b3Session().open ? 60000 : 5 * 60000;
  if (force || !L.qAt || (!viaFeed && now - L.qAt > every)) {
    L.qAt = now;
    jobs.push(
      fetchQuotes(BR_SYMBOLS, { id: "local", ttl: every, force, bg: false }).then((r) => {
        L.quotes = { ...L.quotes, ...r.quotes };
        L.quotesAt = Date.now();
        const errs = hubErrors().filter(([s]) => BR_SYMBOLS.includes(s));
        L.errors.quotes = errs.length ? `cotações ao vivo: ${errs[0][1].msg}` : null;
      }),
    );
  }
  if (force || !L.macroAt || now - L.macroAt > 30 * 60000) {
    L.macroAt = now;
    jobs.push(
      fetchJSON("api/yields?br=1")
        .then((r) => {
          L.macro = r;
          L.errors.macro = null;
        })
        .catch((e) => {
          L.errors.macro = `macro do BCB: ${e?.message ?? e}`;
          L.macroAt = now - 25 * 60000;
        }),
    );
  }
  // assertividade medida do Fluxo Onshore e curva de volume do pregão (estudo semanal): 1 vez por hora
  if (state.prefs.tab === "brflow" && (force || !L.studyAt || now - L.studyAt > 60 * 60000)) {
    L.studyAt = now;
    jobs.push(
      fetchJSON("data/br-flow-study.json")
        .then((r) => {
          state.brFlowStudy = r?.checkpoints ? r : null;
        })
        .catch(() => {
          /* sem estudo publicado: a tela funciona com a curva linear */
        }),
    );
  }
  if (!jobs.length) return;
  await Promise.allSettled(jobs);
  if (isOnshore(state.prefs.tab)) hooks.render?.();
}

/** Agenda Onshore: indicadores do Brasil (Nasdaq) + resultados e dividendos das ações da B3 (a cada 30 min). */
export async function loadBrCal(force = false) {
  if (state.brCalLoading || (!force && Date.now() - (state.brCalAt ?? 0) < 30 * 60000)) return;
  state.brCalLoading = true;
  state.brCalAt = Date.now();
  const mine = (state.portfolio?.holdings ?? []).map((h) => h.sym).filter((x) => /\.SA$/.test(x));
  const syms = [...new Set([...mine, ...STOCKS])].slice(0, 60);
  try {
    state.brCal = await fetchJSON(
      `api/calendar?br=1&symbols=${encodeURIComponent(syms.join(","))}`,
    );
  } catch (e) {
    state.brCal ??= { events: [], released: [], corporate: [], errors: [e.message] };
    state.brCalAt = Date.now() - 25 * 60000;
  }
  state.brCalLoading = false;
  if (["brcal", "brmacro", "brflow"].includes(state.prefs.tab)) hooks.render();
}

/** Agenda econômica + resultados/dividendos da carteira e das listas (a cada 30 min). */
export async function loadCalendar(force = false) {
  if (state.calLoading || (!force && Date.now() - state.calAt < 30 * 60000)) return;
  state.calLoading = true;
  state.calAt = Date.now();
  const syms = [
    ...new Set([
      ...(state.portfolio?.holdings ?? []).map((h) => h.sym),
      ...lists().flatMap((l) => l.syms ?? []),
    ]),
  ].filter((x) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(x));
  try {
    state.cal = await fetchJSON(
      `api/calendar${syms.length ? `?symbols=${encodeURIComponent(syms.join(","))}` : ""}`,
    );
  } catch (e) {
    state.cal ??= { events: [], corporate: [], errors: [e.message] };
    state.calAt = Date.now() - 25 * 60000; // tenta de novo em ~5 min
  }
  state.calLoading = false;
  if (["calendar", "entry", "home"].includes(state.prefs.tab)) hooks.render();
}

/** Balanços de tecnologia por subtema (data/earnings.json, gerado pelo cron update-earnings): a cada 30 min, só quando a tela pede. */
export async function loadEarnings(force = false) {
  if (state.earningsLoading || (!force && Date.now() - (state.earningsAt ?? 0) < 30 * 60000))
    return;
  state.earningsLoading = true;
  state.earningsAt = Date.now();
  try {
    state.earnings = await fetchJSON(`data/earnings.json?t=${Date.now()}`);
  } catch {
    state.earnings ??= { companies: [], themes: [], errors: ["balanços indisponíveis"] };
    state.earningsAt = Date.now() - 25 * 60000; // tenta de novo em ~5 min
  }
  state.earningsLoading = false;
  if (state.prefs.tab === "calendar") hooks.render();
}

/** Nome de cada posição (para ligar manchetes à empresa): Yahoo ou histórico. */
function holdingNames() {
  return (state.portfolio?.holdings ?? []).map((h) => ({
    sym: h.sym,
    name:
      state.valuation?.rows.find((r) => r.sym === h.sym)?.name ?? state.history[h.sym]?.name ?? "",
  }));
}

/** Manchetes: função (fontes que aceitam a Vercel + Yahoo por ticker) e arquivo do cron (FT, Economist). */
export async function loadNews() {
  // ritmo alinhado ao cache do servidor (api/news: s-maxage=120): 2 min só com a aba Notícias aberta,
  // 5 min no resto (antes 2 e 4 min contra 300 s de cache: metade das chamadas voltava igual)
  const gap = ["news", "brnews"].includes(state.prefs.tab) ? 2 * 60000 : 5 * 60000;
  if (state.newsLoading || Date.now() - state.newsAt < gap) return;
  state.newsLoading = true;
  state.newsAt = Date.now();
  const held = (state.portfolio?.holdings ?? [])
    .map((h) => h.sym)
    .filter((x) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(x));
  const [api, cron] = await Promise.allSettled([
    fetchJSON(`api/news${held.length ? `?symbols=${encodeURIComponent(held.join(","))}` : ""}`),
    fetchJSON("data/news.json"),
  ]);
  const a = api.status === "fulfilled" ? api.value : null;
  const c = cron.status === "fulfilled" ? cron.value : null;
  const fresh = tagNews(matchNews(mergeItems([a?.items ?? [], c?.items ?? []]), holdingNames()));
  const items = accumulate(state.news?.items, fresh, Date.now() / 1000, !state.news);
  state.news = {
    items,
    fetched_at: a?.fetched_at ?? c?.updated_at ?? null,
    sources: [...new Set([...(a?.sources ?? []), ...(c?.items ?? []).map((x) => x.source)])],
    error: !a && !c ? (api.reason?.message ?? "indisponível") : null,
  };
  state.newsLoading = false;
  hooks.afterNews?.(); // notificação de notícia que chegou antes do feed: abre a matéria agora
  notifyNews(items);
  if (state.prefs.newsWknd && state.prefs.tab === "news") loadWeekendNews();
  if (["news", "brnews", "dash", "local", "home"].includes(state.prefs.tab)) hooks.renderNow();
}

/**
 * Resumo do fds (aba Notícias): arquivo do cron de fim de semana (data/news-weekend.json) + o feed já carregado,
 * ligados à carteira. No máximo a cada 10 min.
 */
export async function loadWeekendNews() {
  const w = state.newsWknd;
  if (w?.loading || (w && Date.now() - w.at < 10 * 60000)) return;
  state.newsWknd = { ...(w ?? { items: [] }), loading: true, at: Date.now() };
  const arch = await fetchJSON("data/news-weekend.json").catch(() => null);
  const now = Date.now() / 1000;
  const lists = [arch?.items ?? [], state.news?.items ?? []];
  state.newsWknd = {
    items: tagNews(matchNews(mergeItems(lists, now, 24 * 7), holdingNames())),
    win: weekendWindow(now),
    loading: false,
    at: Date.now(),
  };
  if (["news", "brnews"].includes(state.prefs.tab)) hooks.renderNow();
}

/**
 * Feed contínuo: junta as manchetes novas às já vistas (as fontes só devolvem as últimas N),
 * marca a hora em que cada uma apareceu no app (seen) e descarta as de mais de 36 h.
 * Na primeira carga nada é marcado como novo.
 */
export function accumulate(prev, fresh, now, first = false) {
  const old = new Map((prev ?? []).map((x) => [x.id, x]));
  const out = fresh.map((x) => ({ ...x, seen: old.get(x.id)?.seen ?? (first ? 0 : now) }));
  const ids = new Set(out.map((x) => x.id));
  for (const x of prev ?? []) if (!ids.has(x.id)) out.push(x);
  return out
    .filter((x) => !x.t || now - x.t < 36 * 3600)
    .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
    .slice(0, 600);
}

/** Avisa uma vez por notícia que afeta a carteira (das últimas 12 h): na tela e no sistema. */
function notifyNews(items) {
  const mode = state.prefs.newsAlerts ?? "all";
  if (mode === "off") return;
  const seen = store.get("pendulo.news.seen", []);
  const set = new Set(seen);
  // a mesma história com outro título (outra fonte/idioma) não avisa de novo
  const sigs = store.get("pendulo.news.sigs", []).map((s) => s.split(" "));
  const now = Date.now() / 1000;
  const cands = items
    .filter((x) => x.hits && !set.has(x.id) && (!x.t || now - x.t < 12 * 3600))
    .filter((x) => x.impact && passTags(x, state.prefs.newsTags)) // só o que mexe com preço, nas tags escolhidas
    .filter((x) => mode !== "direct" || x.hits.some((h) => h.direct))
    .sort((a, b) => Number(b.hits.some((h) => h.direct)) - Number(a.hits.some((h) => h.direct)));
  if (!cands.length) return;
  store.set("pendulo.news.seen", [...cands.map((x) => x.id), ...seen].slice(0, 400));
  const fresh = [];
  for (const x of cands) {
    const sig = newsSig(x);
    if (sig.length && sigs.some((s) => sameStory(sig, s))) continue;
    sigs.unshift(sig);
    fresh.push(x);
  }
  store.set(
    "pendulo.news.sigs",
    sigs.slice(0, 300).map((s) => s.join(" ")),
  );
  if (!fresh.length) return;
  const syms = (x) => [...new Set(x.hits.map((h) => h.sym))].join(", ");
  const top = fresh[0];
  toast(
    `📰 ${syms(top)} · ${top.title}${fresh.length > 1 ? ` (+${fresh.length - 1} na aba Notícias)` : ""}`,
    top.hits.some((h) => h.direct) ? "warn" : "ok",
    15000,
    linkFor({ tab: "news", news: top.id }),
  );
  for (const x of fresh.slice(0, 3))
    osNotify(topicTitle("news", syms(x)), `${x.source}: ${ptTitle(x)}`, linkFor({ tab: "news", news: x.id }), { log: false }); // prettier-ignore
}

/** Juros soberanos de fontes oficiais (publicação diária): no máximo a cada 30 min. */
export async function loadYields() {
  if (Date.now() - state.yieldsAt < 30 * 60000) return;
  state.yieldsAt = Date.now();
  try {
    state.yields = await fetchJSON("api/yields");
  } catch (e) {
    state.yields = { rows: state.yields?.rows ?? [], error: e.message };
  }
  if (state.prefs.tab === "dash") hooks.render();
}

/** Fundamentos da aba Valor (arquivo do cron, 1x por dia): relê no máximo a cada 6 h. */
export async function loadFundamentals() {
  if (Date.now() - state.fundAt < 6 * 3600000) return;
  state.fundAt = Date.now();
  try {
    state.fund = await fetchJSON("data/fundamentals.json");
    state.fundError = null;
  } catch (e) {
    state.fundError = e.message;
  }
  if (["value", "dash"].includes(state.prefs.tab)) hooks.render();
}
