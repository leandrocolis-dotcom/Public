// Avisos do servidor: dado a carteira de um usuário e os dados publicados, decide o que merece push.
// Funções puras (sem rede nem banco): o script send-push.mjs cuida de ler, enviar e registrar.
import { signalsFor, ruleStats } from "../../assets/signals.js";
import { usSession } from "../../assets/refresh.js";
import { matchNews, passTags, tagNews, newsSig, sameStory } from "../../assets/news.js";
import { FLOW_BY_SYM } from "../../assets/flow-universe.js";
import { traderDecision } from "../../assets/decision.js";
import { levelAlert, levelText, mediumTerm } from "../../assets/level-alerts.js";
import { REGIME_TIP, above200, worsened } from "../../assets/regime-rules.js";
import { regimeOf } from "../../assets/edge.js";
import { macroAlerts } from "../../assets/macro-alerts.js";
import { topicTitle } from "../../assets/notif-topics.js";
import { quietNow } from "../../assets/weekend.js";
import { leaderAlertText } from "../../assets/leaders.js";
import { nyDate } from "../../assets/live.js";
import { trimAlerts } from "../../assets/trim.js";

/**
 * Candidatos a liderança de confiança alta (api/intraday?leaders=1): vale para todos, com ou sem carteira.
 * 1 aviso por tema por dia (chave com a data de Nova York).
 */
export function leaderAlerts(leaders, nowSec = Date.now() / 1000) {
  const day = nyDate(nowSec);
  return (leaders ?? [])
    .filter((c) => c.conf === "alta")
    .slice(0, 3)
    .map((c) => {
      const t = leaderAlertText(c);
      return {
        key: `lead:${day}:${c.group}:${c.sym}`,
        title: topicTitle("leaders", t.title),
        body: t.body,
        tag: `lead-${c.sym}`,
        url: `./?tab=flow&rot=${encodeURIComponent(c.group)}&focus=${encodeURIComponent(c.sym)}`,
      };
    });
}

// grupos do mapa de fluxo que são ações (o regime do S&P vale para eles); ativo fora do mapa = ação individual
const EQUITY = new Set(["us_style", "us_sectors", "us_ind", "gl_sectors", "regions", "idx_us", "idx_gl", "dm", "em"]); // prettier-ignore

/** Marcas de vantagem de um sinal (assets/edge.js): regra sem vantagem histórica e compra contra o regime. */
export function edgeNote(sg, sym, { global = null, regime = null } = {}) {
  if (sg.kind !== "entry") return "";
  const g = global?.rules?.[sg.code];
  const parts = [];
  if (g?.n >= 30 && global.base?.avgFwd != null && g.avgFwd <= global.base.avgFwd)
    parts.push("Regra sem vantagem medida (não bateu um dia qualquer)");
  const grp = FLOW_BY_SYM[sym]?.group;
  if (regime && !regime.bull && (!grp || EQUITY.has(grp)))
    parts.push("S&P abaixo da MM200: se comprar, metade do tamanho");
  return parts.length ? ` ✗ ${parts.join(". ")}.` : "";
}

const KIND = { entry: "▲ Entrada", exit: "▼ Saída", risk: "⚠ Risco" };

const pc = (x) =>
  `${x >= 0 ? "+" : "−"}${Math.abs(x * 100)
    .toFixed(1)
    .replace(".", ",")}%`;

/** Resumo do backtest da regra (5 pregões): no próprio ativo quando há amostra, e no conjunto de referência. */
export function statLine(code, kind, own, global) {
  const verb = kind === "entry" ? "subiu" : "caiu";
  const parts = [];
  const o = own?.rules?.[code];
  if (o?.n >= 3)
    parts.push(
      `neste ativo ${verb} em ${Math.round(o.hitRate * 100)}% de ${o.n} vezes (média ${pc(o.avgFwd)} em 5 dias)`,
    );
  const g = global?.rules?.[code];
  if (g?.n >= 20)
    parts.push(
      `em ${g.n} casos de referência, média ${pc(g.avgFwd)} em 5 dias (base ${pc(global.base.avgFwd)})`,
    );
  return parts.length
    ? ` Histórico: ${parts.join("; ")}. Não é recomendação.`
    : " Não é recomendação.";
}

/**
 * Sinais (entrada, saída, risco) de TODAS as posições. Série: `live[sym]` (histórico + preço ao vivo, montada pela
 * rota) ou, na falta, o histórico publicado do mapa de fluxo. Um aviso por regra, ativo e dia.
 * global: ruleStats do conjunto de referência (opcional).
 */
export function signalAlerts(holdings, flow, { live = {}, global = null, spy = null } = {}) {
  const regime = spy ? regimeOf(spy) : null;
  const out = [];
  for (const h of holdings ?? []) {
    const a = FLOW_BY_SYM[h.sym];
    let series = live[h.sym]?.close;
    let day = live[h.sym]?.dates?.at(-1);
    if (!series?.length) {
      const raw = flow?.close?.[h.sym];
      if (!a || !raw) continue; // sem série em nenhuma fonte
      series = raw; // a posição é o próprio ativo: sem inverter (igual ao app, em holdingSeries)
      day = flow?.dates?.at(-1);
    }
    const sigs = signalsFor(series, { sym: h.sym, label: a?.name ?? h.sym });
    if (!sigs.length) continue;
    const own = ruleStats([series]);
    const provisional = !!live[h.sym] && usSession() === "open";
    for (const sg of sigs) {
      const px = sg.ind?.price;
      out.push({
        key: `sig:${h.sym}:${sg.code}:${day}`,
        kind: "sig",
        title: topicTitle(
          "signal",
          `${KIND[sg.kind]} · ${h.sym}${px ? ` ${px.toFixed(2).replace(".", ",")}` : ""}`,
        ),
        body: `${sg.title}.${sg.context ? ` ⚠ ${sg.context}` : ""}${provisional ? " Provisório até o fechamento." : ""}${statLine(sg.code, sg.kind, own, global)}${edgeNote(sg, h.sym, { global, regime })}`,
        tag: `sig-${h.sym}`,
        url: `./?tab=portfolio&hold=${encodeURIComponent(h.sym)}`,
      });
    }
  }
  return out;
}

// ───────────── notícias: a mesma história só uma vez ─────────────
// A chave news:<id> vem do título exato; a mesma história chega com títulos diferentes (outra fonte,
// outro idioma, título atualizado). Por isso cada aviso registra também a "assinatura" (palavras
// fortes do título) e um contador por ativo/dia: história parecida com uma já enviada não repete,
// e cada ativo recebe no máximo NEWS_PER_DAY avisos de notícia por dia.
export const NEWS_PER_DAY = 2;
/**
 * Manchetes das últimas 12 h que afetam a carteira. mode: "all" | "direct" | "off".
 * Só notícia com impacto de mercado (sem opinião/ruído) e dentro das tags escolhidas (tags: null = padrão).
 * sent: chaves já enviadas (pula história repetida e respeita o limite diário por ativo).
 */
export function newsAlerts(
  holdings,
  items,
  { mode = "all", tags = null, nowSec = Date.now() / 1000, sent = new Set() } = {},
) {
  if (mode === "off" || !items?.length || !holdings?.length) return [];
  const names = holdings.map((h) => ({ sym: h.sym, name: FLOW_BY_SYM[h.sym]?.name ?? "" }));
  const day = new Date(nowSec * 1000).toISOString().slice(0, 10);
  const seen = [...sent].filter((k) => k.startsWith("nsig:")).map((k) => k.slice(5).split(" "));
  const used = {};
  for (const k of sent) {
    const m = /^nday:([^:]+):(\d{4}-\d{2}-\d{2}):\d+$/.exec(k);
    if (m && m[2] === day) used[m[1]] = (used[m[1]] ?? 0) + 1;
  }
  const out = [];
  const cands = tagNews(matchNews(items, names))
    .filter((x) => x.hits && x.id && (!x.t || nowSec - x.t < 12 * 3600))
    .filter((x) => x.impact && passTags(x, tags))
    .filter((x) => mode !== "direct" || x.hits.some((h) => h.direct))
    .filter((x) => !sent.has(`news:${x.id}`))
    // direta primeiro; entre iguais, a mais antiga primeiro (a primeira versão da história é a que avisa)
    .sort(
      (a, b) =>
        Number(b.hits.some((h) => h.direct)) - Number(a.hits.some((h) => h.direct)) ||
        (a.t ?? 0) - (b.t ?? 0),
    );
  for (const x of cands) {
    const sig = newsSig(x);
    if (sig.length && seen.some((s) => sameStory(sig, s))) continue;
    const syms = [...new Set(x.hits.map((h) => h.sym))];
    const open = syms.filter((s) => (used[s] ?? 0) < NEWS_PER_DAY);
    if (!open.length) continue;
    seen.push(sig);
    const covers = [`nsig:${sig.join(" ")}`.slice(0, 250)];
    for (const s of open) {
      used[s] = (used[s] ?? 0) + 1;
      covers.push(`nday:${s}:${day}:${used[s]}`);
    }
    out.push({
      key: `news:${x.id}`,
      kind: "news",
      title: topicTitle("news", open.join(", ")),
      body: `${x.source}: ${x.titlePt || x.title}`,
      tag: `news-${x.id}`,
      url: `./?tab=news&news=${encodeURIComponent(x.id)}`,
      covers,
    });
  }
  return out;
}

/**
 * Avisos de nível (piloto): ativo da carteira perto da resistência, do suporte ou do stop da "Decisão do trader".
 * analyses: { SÍMBOLO: analyzeTicker(...) }, quotes: { SÍMBOLO: { p } }, market: { spy }.
 * Chave por ativo + zona + tom + dia: no máximo um aviso de cada tipo por dia.
 */
export function levelAlerts(holdings, analyses, { quotes = {}, market = {}, day } = {}) {
  const out = [];
  const d = day ?? new Date().toISOString().slice(0, 10);
  for (const h of holdings ?? []) {
    const r = analyses?.[h.sym];
    if (!r || !(h.qty > 0)) continue;
    const a = levelAlert(r, traderDecision(r, market, { gate: true }), {
      price: quotes[h.sym]?.p > 0 ? quotes[h.sym].p : r.price,
      hold: h,
    });
    if (!a) continue;
    const t = levelText(a);
    out.push({
      key: `lvl:${h.sym}:${a.zone}:${a.tone}:${d}`,
      title: topicTitle("level", t.title),
      body: t.body,
      tag: `lvl-${h.sym}`,
      url: `./?tab=portfolio&hold=${encodeURIComponent(h.sym)}`,
    });
  }
  return out;
}

const TONE_PT = { buy: "comprar/ampliar", wait: "esperar/manter", sell: "não comprar/reduzir" };

/**
 * Vigia de regime da carteira com o app FECHADO (mesmas regras do app, assets/regime-rules.js): compara a varredura
 * do fechamento anterior (data/market-scan.json: tom da decisão e médio prazo) e a MM200 de ontem com o estado de
 * agora. scan: { SÍMBOLO: { st, mt, d } }; live: séries com o preço ao vivo no fim. Uma vez por ativo por dia.
 */
export function regimeAlerts(holdings, analyses, { scan = {}, live = {}, market = {}, day } = {}) {
  const out = [];
  const d = day ?? new Date().toISOString().slice(0, 10);
  for (const h of holdings ?? []) {
    const r = analyses?.[h.sym];
    const sc = scan[h.sym];
    const close = live[h.sym]?.close ?? r?.series?.close;
    if (!(h.qty > 0) || !close?.length) continue;
    // a varredura já é de hoje (depois do fechamento): não há "ontem" para comparar com ela
    const fresh = sc && sc.d && sc.d < d;
    const dec = r ? traderDecision(r, market, { gate: true }) : null;
    const tone = dec?.final?.step?.tone;
    const prev = { label: TONE_PT[sc?.st] ?? "", tone: fresh ? sc.st : undefined, up200: above200(close.slice(0, -1)), mt: fresh ? sc.mt : undefined }; // prettier-ignore
    const cur = { label: TONE_PT[tone] ?? "", tone: fresh ? tone : undefined, up200: above200(close), mt: fresh && dec ? mediumTerm(dec).dir : undefined }; // prettier-ignore
    const why = worsened(prev, cur);
    if (!why.length) continue;
    out.push({
      key: `rg:${h.sym}:${d}`,
      title: topicTitle("regime", `${h.sym}: o regime piorou`),
      body: `${why.join("; ")}. ${REGIME_TIP}`,
      tag: `rg-${h.sym}`,
      url: `./?tab=portfolio&hold=${encodeURIComponent(h.sym)}`,
    });
  }
  return out;
}

/**
 * Tudo que um usuário deve receber agora, sem repetir o que já foi enviado.
 * prefs: { sig: boolean, news: "all"|"direct"|"off", newsTags?: string[], portfolio?, levels?, regime?, macro?: boolean }. sent: Set de chaves já enviadas.
 * Agrupa o excedente (o relógio e a tela de bloqueio não aguentam uma enxurrada): no máximo `max` avisos.
 */
/**
 * Preferências do usuário entre os aparelhos inscritos: as do que foi atualizado por último (a escolha mais
 * recente). Um aparelho antigo, sem abrir o app há dias, não pode desfazer o "silenciar" ligado em outro.
 */
export function userPrefs(devices) {
  const last = [...(devices ?? [])].sort((a, b) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
  )[0];
  return last?.prefs ?? {};
}

export function alertsFor({
  holdings,
  flow,
  news,
  live,
  global,
  analyses = null,
  quotes = {},
  market = {},
  scan = {},
  eco = [],
  leaders = [],
  mkt = [],
  prefs = {},
  sent = new Set(),
  nowSec,
  max = 4,
}) {
  // fim de semana silenciado pelo usuário (Configurações › Avisos): nada sai, nada fica marcado como enviado
  if (quietNow(prefs, nowSec ?? Date.now() / 1000)) return { send: [], all: [] };
  const all = [
    // regime do mercado trocando de faixa ou ganhando tração rumo à fronteira: vale para todos, com ou sem carteira
    ...mkt
      .filter((a) => (a.topic === "rev" ? prefs.reversal !== false : prefs.mktregime !== false))
      .map((a) => ({ ...a, title: topicTitle(a.topic ?? "mkt", a.title) })),
    // dado macro divulgado (EUA, Europa, Reino Unido, Japão, China, Brasil): alto impacto para todos; médio só
    // quando a carteira tem ativo na região do dado (💼, com os ativos atingidos)
    ...(prefs.macro === false
      ? []
      : macroAlerts(eco, nowSec ?? Date.now() / 1000, { holdings, all: prefs.macroAll === true })),
    // tema ganhando liderança com regime a favor e nomes confirmando (Fluxo › Rotação relativa)
    ...(prefs.leaders === false ? [] : leaderAlerts(leaders, nowSec ?? Date.now() / 1000)),
    // posições marcadas no termômetro bull/bear: vender na força / comprar no recuo
    ...(prefs.trim === false || !prefs.trimPicks
      ? []
      : trimAlerts(holdings, prefs.trimPicks, { quotes, live }).map((a) => ({
          ...a,
          title: topicTitle("trim", a.title),
        }))),
    // regime primeiro: é o aviso de proteger o que já está ganho
    ...(prefs.sig === false || prefs.regime === false
      ? []
      : regimeAlerts(holdings, analyses, { scan, live, market })),
    ...(prefs.sig === false || prefs.levels === false || !analyses
      ? []
      : levelAlerts(holdings, analyses, { quotes, market })),
    ...(prefs.sig === false || prefs.portfolio === false
      ? []
      : signalAlerts(holdings, flow, { live, global, spy: market?.spy })),
    ...newsAlerts(holdings, news, {
      mode: prefs.news ?? "all",
      tags: prefs.newsTags ?? null,
      nowSec,
      sent,
    }),
  ].filter((a) => !sent.has(a.key));
  const shown = all.slice(0, max);
  const extra = all.slice(max);
  if (extra.length)
    shown.push({
      key: `more:${extra
        .map((x) => x.key)
        .join("|")
        .slice(0, 200)}`,
      title: topicTitle("more", `+${extra.length} aviso(s)`),
      body: extra.map((x) => x.title).join(" · "),
      tag: "more",
      url: "./?tab=signals&log=1",
      covers: extra.flatMap((x) => [x.key, ...(x.covers ?? [])]),
    });
  return { send: shown, all };
}
