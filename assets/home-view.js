// Início: o cockpit do dia. Em uma tela: a sessão de NY, o pulso do mercado, a carteira, o fluxo, a agenda e as
// manchetes. Só lê o estado; não busca nada novo.
// Partes de cálculo puras e testadas: sessionLine, pulseTiles, agendaNext, portfolioBrief, pendulumReading,
// sparkPath, donutArcs, regimeWord. Direção visual: docs/design/measured-equilibrium-philosophy.md.
import { esc, num, pct } from "./format.js";
import { ARCHIVE, GROUPS, TAB_INFO, TABS, hooks, state } from "./state.js";
import { barsKey, useBars } from "./bars-hub.js";
import {
  MOVE_HOURS,
  OVER_STEPS,
  REGIME_SYMS,
  regimeMoves,
  regimeOver,
  moodSpeed,
  pushTrail,
} from "./regime-history.js";
import { marketEdge } from "./signal-center.js";
import {
  nyClock,
  sessionInfo,
  usSession,
  marketClock,
  marketClockText,
  OPEN,
  PRE,
} from "./sessions.js";
import { DASH_H, PEND_HOURS, regime } from "./dash.js";
import { applyOrder, dashLayout } from "./dash-layout.js";
import { flowSummary } from "./flow-summary.js";
import { topHeadlines } from "./dash-extra.js";
import { ptTitle } from "./translate.js";
import { CC_PT } from "./calendar.js";
import { PEND_ZONES } from "./regime-zones.js";
import { STRENGTH_W } from "./regime-strength.js";
import { WK_SYMS, UP_W, weekendGap, weekendPulse } from "./weekend-pulse.js";
import { liveReversal, revDetailHtml, revOverlay, revStripHtml } from "./reversal-view.js";
import { fgHtml } from "./fear-greed.js";
import { fetchJSON } from "./net.js";

const NAME = Object.fromEntries(TABS);

/** Passos do primeiro uso: cada um com "feito?" e o botão que leva até ele. */
export function firstSteps({ hasPortfolio, pushState, seenSignals }) {
  return [
    {
      done: hasPortfolio,
      title: "Importe a sua carteira",
      text: "Cole a tabela Holdings do Investing. Com ela o app mostra resultado, risco e sinais de cada posição.",
      btn: `<button class="btn primary" data-tab="settings" data-sub="carteira">Importar carteira</button>`,
    },
    {
      done: seenSignals,
      title: "Veja os gatilhos de agora",
      text: "Só o que passou no teste: proteção das posições, repique, filtro de alavancagem e o que não fazer.",
      btn: `<button class="btn" data-tab="trig">Abrir Gatilhos</button>`,
    },
    {
      done: pushState === "on",
      title: "Ative os avisos no celular",
      text: "Receba sinais de entrada, saída e notícias da carteira mesmo com o app fechado.",
      btn: `<button class="btn" data-tab="settings" data-sub="avisos">Configurar avisos</button>`,
    },
  ];
}

// ───────────────────────── partes puras ─────────────────────────

const hm = (m) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h${r ? String(r).padStart(2, "0") : ""}` : `${r} min`;
};

/** Sessão de Nova York em uma linha: { key, label, hint, tone }. */
export function sessionLine(ms = Date.now()) {
  const { date, min } = nyClock(ms);
  const info = sessionInfo(date);
  const s = usSession(ms);
  const close = info.closeMin;
  if (s === "open")
    return { key: s, label: "Pregão aberto", hint: `fecha em ${hm(close - min)}${info.early ? " (encurtado: 13h de NY)" : ""}`, tone: "ok" }; // prettier-ignore
  if (s === "pre")
    return { key: s, label: "Pré-mercado", hint: `abre em ${hm(OPEN - min)}`, tone: "wait" };
  if (s === "post")
    return { key: s, label: "Pós-mercado", hint: `até ${info.postEnd / 60}h de NY (${hm(info.postEnd - min)})${info.early ? " · pregão encurtado" : ""}`, tone: "wait" }; // prettier-ignore
  if (!info.open) return { key: s, label: "Bolsa fechada", hint: info.reason, tone: "" };
  return {
    key: s,
    label: "Bolsa fechada",
    hint: min < PRE ? `pré abre em ${hm(PRE - min)}` : "volta amanhã às 4h de NY (pré)",
    tone: "",
  };
}

/** Pulso do mercado: os termômetros que cabem numa olhada. kind "yld" mostra a variação em bps. */
export const PULSE = [
  ["SPY", "S&P 500"],
  ["QQQ", "Nasdaq 100"],
  ["IWM", "Small caps"],
  ["^VIX", "VIX", "vol"],
  ["^TNX", "Juro 10a", "yld"],
  ["DX-Y.NYB", "Dólar DXY"],
  ["GC=F", "Ouro"],
  ["CL=F", "Petróleo"],
  ["BTC-USD", "Bitcoin"],
];

/** Variação do dia SEMPRE como p / pc (docs/COERENCIA.md). Só entra o que tem cotação. */
export function pulseTiles(quotes = {}) {
  return PULSE.map(([sym, label, kind]) => {
    const q = quotes?.[sym];
    if (!(q?.p > 0)) return null;
    const c = q.pc > 0 ? q.p / q.pc - 1 : null;
    const bps = kind === "yld" && q.pc > 0 ? (q.p - q.pc) * 100 : null;
    return { sym, label, kind: kind ?? "px", p: q.p, c, bps };
  }).filter(Boolean);
}

/** Resumo da carteira: total, dia, contra o SPY, maiores altas/quedas e a fatia das maiores posições. */
export function portfolioBrief(v, quotes = {}) {
  if (!v?.rows?.length) return null;
  const spy = quotes?.SPY?.p > 0 && quotes.SPY.pc > 0 ? quotes.SPY.p / quotes.SPY.pc - 1 : null;
  const withDay = v.rows.filter((r) => Number.isFinite(r.dayPLPct));
  const byDay = [...withDay].sort((a, b) => b.dayPLPct - a.dayPLPct);
  const up = byDay.filter((r) => r.dayPLPct > 0);
  const top = v.rows.slice(0, 6);
  const rest = 1 - top.reduce((a, r) => a + r.weight, 0);
  return {
    total: v.total,
    dayPL: v.dayPL,
    dayPLPct: v.dayPLPct,
    netPL: v.netPL,
    netPLPct: v.netPLPct,
    vsSpy: v.dayPLPct != null && spy != null ? v.dayPLPct - spy : null,
    spy,
    n: v.rows.length,
    upCount: up.length,
    downCount: withDay.filter((r) => r.dayPLPct < 0).length,
    best: byDay.slice(0, 3).filter((r) => r.dayPLPct > 0),
    worst: byDay
      .slice(-3)
      .reverse()
      .filter((r) => r.dayPLPct < 0),
    slices: [...top.map((r) => ({ sym: r.sym, w: r.weight })), ...(rest > 0.005 ? [{ sym: "Outros", w: rest }] : [])], // prettier-ignore
  };
}

/** Eventos macro e balanços das próximas `hours` horas (macro: alto impacto em qualquer região, médio só EUA). */
export function agendaNext(cal, held = [], nowSec = Date.now() / 1000, hours = 48) {
  const end = nowSec + hours * 3600;
  const macro = (cal?.events ?? [])
    .filter((e) => e.t >= nowSec - 30 * 60 && e.t <= end)
    .filter((e) => e.impact === "high" || (e.impact === "medium" && e.cc === "USD"))
    .map((e) => ({ t: e.t, kind: "macro", cc: e.cc, title: e.titlePT ?? e.title, impact: e.impact, forecast: e.forecast, previous: e.previous })); // prettier-ignore
  const own = new Set(held);
  const corp = (cal?.corporate ?? [])
    .filter((e) => e.kind === "earnings" && own.has(e.sym) && e.t >= nowSec - 86400 && e.t <= nowSec + 7 * 86400) // prettier-ignore
    .map((e) => ({ t: e.t, kind: "earnings", sym: e.sym, title: `Balanço ${e.sym}`, estimated: e.estimated })); // prettier-ignore
  return [...macro, ...corp].sort((a, b) => a.t - b.t);
}

const KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
function dayWord(t, nowSec) {
  const a = KEY.format(new Date(nowSec * 1000));
  const b = KEY.format(new Date(t * 1000));
  const d = Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  return d <= 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`;
}

/** Ângulo máximo do pêndulo (graus) para cada lado: nota −100 = extremo da defesa, +100 = extremo do risco. */
export const PEND_MAX = 38;

export { PEND_ZONES };

const BLOCK_SHORT = { eq: "Bolsas", cls: "Classes de ativos", vol: "VIX e vol" };
const PREVIEW_PT = { pre: "pré-mercado", post: "pós-mercado", closed: "fora do pregão" };
/** Janelas do pêndulo da Início (as mesmas da Visão geral): 1D = regime do dia; as demais olham mais longe. */
export const PEND_WIN = {
  "1h": { btn: "1h", label: "Última hora" },
  "3h": { btn: "3h", label: "Últimas 3 horas" },
  "5h": { btn: "5h", label: "Últimas 5 horas" },
  "1d": { btn: "1D", label: "Regime do dia" },
  "5d": { btn: "5D", label: "Últimos 5 pregões" },
  "1m": { btn: "1M", label: "Último mês" },
  "3m": { btn: "3M", label: "Últimos 3 meses" },
};
/** Janela válida do pêndulo (padrão 1D). */
export const pendWin = (k) => ((k in DASH_H || k in PEND_HOURS) && k in PEND_WIN ? k : "1d");

/**
 * Leitura do pêndulo: nota contínua (−100 a +100) do regime, faixa, ângulo e quão dentro do risco/da defesa.
 * Usa a nota da intensidade (amplitude, força, médias e VIX); sem ela, a fração de razões em alta.
 * Estresse (VIX invertido) não mexe na nota: vira um alerta à parte (warn). No pré/pós a nota é a PRÉVIA, com as
 * razões que já têm preço fora do pregão (rg.live).
 */
export function pendulumReading(rg, sesKey = null) {
  if (!rg?.n) return null;
  let score = Number.isFinite(rg.strength?.score)
    ? rg.strength.score
    : Math.round((rg.on / rg.n - 0.5) * 200);
  // curva do VIX invertida: alerta à parte, também no repique (tipo Risk-on com o VIX ainda invertido)
  const stress = rg.inverted ?? /Estresse/.test(rg.verdict ?? "");
  const relief = stress && /^Risk-on/.test(rg.verdict ?? "");
  score = Math.max(-100, Math.min(100, score));
  const zone = PEND_ZONES.find((z) => score < z.max || z.key === "rkx") ?? PEND_ZONES[2];
  const abs = Math.abs(score);
  const depth =
    zone.key === "nt"
      ? score > 0
        ? `zona neutra, pende para o risco (+${abs})`
        : score < 0
          ? `zona neutra, pende para a defesa (−${abs})`
          : "zona neutra, sem lado"
      : bandDepth(score);
  const prev = PREVIEW_PT[sesKey] && rg.live > 0 ? PREVIEW_PT[sesKey] : null;
  // amplitude do movimento: quantos módulos (Bolsas, Classes de ativos, VIX e vol) vão para o mesmo lado da nota
  const blocks = rg.blocks ?? [];
  const nb = blocks.length;
  const breadth =
    nb > 1 && score !== 0
      ? rg.agree === nb
        ? `${nb} de ${nb} módulos no mesmo lado: movimento amplo`
        : rg.agree <= nb / 2
          ? `só ${rg.agree} de ${nb} módulos no mesmo lado: movimento isolado`
          : `${rg.agree} de ${nb} módulos no mesmo lado`
      : "";
  // agulha pela nota sem arredondar (anda a cada pacote de cotações); faixa e número seguem a nota inteira
  const fine = Number.isFinite(rg.strength?.raw)
    ? Math.max(-100, Math.min(100, rg.strength.raw))
    : score;
  return {
    score,
    angle: Math.round((fine / 100) * PEND_MAX * 100) / 100,
    zone,
    stress,
    depth,
    label: zone.label,
    warn: relief
      ? "Repique com o VIX ainda invertido: alívio sob estresse, pode devolver rápido"
      : stress
        ? "VIX invertido (estresse): a nota pode piorar rápido"
        : "",
    blocks,
    breadth,
    outliers: rg.outliers ?? [],
    parts: scoreParts(rg.strength),
    session: prev
      ? `Prévia do ${prev} · ${rg.n} ${rg.n === 1 ? "razão" : "razões"} com preço do ${prev}`
      : sesKey === "open"
        ? "Ao vivo no pregão"
        : "Último fechamento",
    feed: feedLine(rg.feed),
  };
}

/** Fontes da nota agora (puro): "11 de 15 razões ao vivo · futuros, bolsas de fora abertas · VIX pelos futuros". */
export function feedLine(f) {
  if (!f?.n) return "";
  const parts = [`${f.live} de ${f.n} razões ao vivo`];
  if (f.srcs?.length) parts.push(f.srcs.join(", "));
  if (f.vix) parts.push(f.vix);
  return parts.join(" · ");
}

/**
 * Como a nota se forma (puro): as parcelas somam a nota. Bolsas e Classes de ativos = amplitude e força das razões
 * de cada módulo; VIX e vol = nível, curva e rumo do VIX + MOVE; tendência (médias de 20 e 50) só fora do 1D.
 */
export function scoreParts(st) {
  const p = st?.parts;
  if (!p) return [];
  const W = st.weights ?? STRENGTH_W;
  const wsum = Object.entries(W).reduce((t, [k, w]) => t + (Number.isFinite(p[k]) ? w : 0), 0); // prettier-ignore
  if (!wsum) return [];
  const pt = (k) => (Number.isFinite(p[k]) && W[k] ? (100 * W[k] * p[k]) / wsum : null);
  const modPt = (id) => {
    const m = st.mods?.[id];
    if (!m) return null;
    const v = [["breadth", m.breadth], ["force", m.force]].filter(([k, x]) => Number.isFinite(x) && Number.isFinite(p[k])); // prettier-ignore
    return v.length ? v.reduce((t, [k, x]) => t + (100 * W[k] * m.w * x) / wsum, 0) : null;
  };
  const byMod = st.mods && Object.keys(st.mods).length;
  const move = [pt("breadth"), pt("force")].filter((x) => x != null);
  const out = [
    ...(byMod
      ? [
          { key: "eq", label: "Bolsas", hint: "EUA, Europa, Ásia e emergentes", pts: modPt("eq") },
          { key: "cls", label: "Classes de ativos", hint: "risco × segurança", pts: modPt("cls") },
        ]
      : [{ key: "move", label: "Movimento do dia", hint: "amplitude e força das razões", pts: move.length ? move.reduce((a, b) => a + b, 0) : null }]), // prettier-ignore
    { key: "trend", label: "Tendência", hint: "médias de 20 e 50 pregões", pts: pt("trend") },
    { key: "vol", label: "VIX e vol", hint: "VIX, curva, rumo do VIX e MOVE", pts: pt("vol") },
  ].filter((x) => x.pts != null);
  // arredonda e joga a sobra do arredondamento na maior parcela: a soma bate com a nota mostrada
  for (const x of out) x.pts = Math.round(x.pts);
  const gap = Number.isFinite(st.score) ? st.score - out.reduce((t, x) => t + x.pts, 0) : 0;
  if (gap && out.length)
    out.reduce((m, x) => (Math.abs(x.pts) > Math.abs(m.pts) ? x : m)).pts += gap;
  return out;
}

const pts = (n) => `${n} ${n === 1 ? "ponto" : "pontos"}`;
/**
 * Onde a nota está dentro da faixa, pela fronteira mais próxima (puro). Evita repetir a nota numa segunda
 * escala ("24/100 dentro da defesa" com nota −24 confundia): diz quanto falta para mudar de faixa.
 */
export function bandDepth(score) {
  const abs = Math.abs(score);
  const side = score < 0;
  if (abs >= 60)
    return `${pts(abs - 60)} além da fronteira ${side ? "da defesa forte" : "do risco forte"}`;
  const toNeutral = abs - 20;
  const toStrong = 60 - abs;
  return toNeutral <= toStrong
    ? `${pts(toNeutral)} da fronteira com o neutro`
    : `${pts(toStrong)} da fronteira com ${side ? "a defesa forte" : "o risco forte"}`;
}

/** Caminho SVG de uma série (pontos válidos) numa caixa w×h, com 1 px de folga. null se < 2 pontos. */
export function sparkPath(vals, w = 100, h = 28) {
  const v = (vals ?? []).filter((x) => Number.isFinite(x) && x > 0);
  if (v.length < 2) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = hi - lo || 1;
  return v
    .map((x, i) => {
      const X = (i / (v.length - 1)) * w;
      const Y = h - 1 - ((x - lo) / span) * (h - 2);
      return `${i ? "L" : "M"}${X.toFixed(1)} ${Y.toFixed(1)}`;
    })
    .join("");
}

/** Arcos da rosca: cada fatia com comprimento e deslocamento no perímetro (2πr). */
export function donutArcs(slices, r = 42) {
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (slices ?? []).map((s) => {
    const len = Math.max(0, s.w) * C;
    const out = { ...s, len, off: acc, C };
    acc += len;
    return out;
  });
}

/** Leitura do regime em palavras: segue a faixa do pêndulo (nota); sem nota, o tipo do regime. */
export function regimeWord(rg) {
  const r = pendulumReading(rg);
  if (r) {
    // "sob estresse" só quando a nota confirma (defesa forte); antes disso o VIX invertido é um alerta à parte
    if (r.stress && r.zone.key === "dfx") return ["sob estresse", "dn"];
    if ((r.zone.key === "df" || r.zone.key === "rk") && Math.abs(r.score) < 40)
      return [r.score < 0 ? "levemente defensivo" : "levemente favorável ao risco", r.zone.tone];
    return [r.zone.word, r.zone.tone];
  }
  const v = rg?.verdict ?? "";
  if (/Estresse/.test(v)) return ["sob estresse", "dn"];
  if (/on/i.test(v)) return ["favorável ao risco", "up"];
  if (/off/i.test(v)) return ["defensivo", "dn"];
  if (v) return ["dividido", "mid"];
  return null;
}

// ───────────────────────── desenho ─────────────────────────

const HHMM = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
const TODAY = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }); // prettier-ignore
const tone = (x) => (!Number.isFinite(x) || Math.abs(x) < 0.00005 ? "" : x > 0 ? "up" : "dn");
const usd = (x, d = 0) => (Number.isFinite(x) ? `US$ ${num(Math.abs(x), d)}` : "–");
const sUsd = (x) => (Number.isFinite(x) ? `${x > 0 ? "+" : x < 0 ? "−" : ""}${usd(x)}` : "–");
const px = (v) => num(v, v >= 1000 ? 0 : 2);
const pp = (x) =>
  Number.isFinite(x) ? `${x > 0 ? "+" : x < 0 ? "−" : ""}${num(Math.abs(x) * 100, 2)} p.p.` : "–";
const A = (i) => `hm-anim" style="--i:${i}`; // classe da entrada em cascata (só na chegada à aba)

function greeting(ms) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(new Date(ms))); // prettier-ignore
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** O pêndulo: escala em arco com as 5 faixas, haste e peso. A haste balança e assenta na nota do regime. */
function pendulumSvg(deg, tn, zoneKey = null, ghost = null, rv = null) {
  const known = deg != null;
  const a = known ? deg : 0;
  const P = (d, r) => [120 + r * Math.cos(((d + 90) * Math.PI) / 180), 14 + r * Math.sin(((d + 90) * Math.PI) / 180)]; // prettier-ignore
  const ticks = [];
  for (let k = -PEND_MAX; k <= PEND_MAX + 0.01; k += PEND_MAX / 10) {
    const major = Math.abs(Math.round(k / (PEND_MAX / 10))) % 2 === 0;
    const [x1, y1] = P(k, 112);
    const [x2, y2] = P(k, major ? 102 : 107);
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${major ? "mj" : ""}"/>`); // prettier-ignore
  }
  const arc = (from, to, r) => {
    const [x1, y1] = P(from, r);
    const [x2, y2] = P(to, r);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 0 0 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  // no SVG o ângulo positivo fica à esquerda (defesa): a nota entra com o sinal trocado
  const toDeg = (score) => (-score / 100) * PEND_MAX;
  const zones = PEND_ZONES.map((z) => {
    const on = z.key === zoneKey ? " on" : "";
    const lvl = Math.abs(z.min + z.max) > 100 ? " x" : "";
    return `<path d="${arc(toDeg(z.min) - 1, toDeg(z.max) + 1, 112)}" class="hm-arc ${z.tone}${lvl}${on}"/>`;
  }).join("");
  // radar de virada: o balanço do pêndulo desenhado por dentro da escala (perna anterior tracejada, volta
  // colorida com seta até a agulha, marca no topo/fundo); a volta parte do extremo e vai no sentido de agora
  const arcTo = (from, to, r) => {
    const [x1, y1] = P(from, r);
    const [x2, y2] = P(to, r);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 0 ${to > from ? 1 : 0} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  let rvSvg = "";
  if (rv) {
    const [eb, ee, en] = [toDeg(rv.base), toDeg(rv.ext), toDeg(rv.now)];
    const [mx, my] = P(ee, 92);
    const [lx, ly] = P(ee, 78);
    const leg = Math.abs(ee - eb) > 0.5 ? `<path d="${arcTo(eb, ee, 92)}" class="rva-leg"/>` : "";
    const back = Math.abs(en - ee) > 0.5 ? `<path d="${arcTo(ee, en, 92)}" class="rva-back ${rv.tone}" marker-end="url(#rvArr-${rv.tone})"/>` : ""; // prettier-ignore
    rvSvg = `<g class="rva ${rv.stage}">${leg}${back}<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="3" class="rva-ext"/><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="rva-lb" text-anchor="middle">${esc(rv.label)}</text></g>`; // prettier-ignore
  }
  const marks = ["warn", "dn", "up", "mid"].map((t) => `<marker id="rvArr-${t}" class="rvm ${t}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker>`).join(""); // prettier-ignore
  return `<svg class="hm-pend-svg" viewBox="0 0 240 146" role="img" aria-label="Pêndulo do regime">
    <defs><radialGradient id="hmBob" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity=".55"/></radialGradient>${rv ? marks : ""}</defs>
    ${zones}
    <g class="hm-ticks">${ticks.join("")}</g>
    ${rvSvg}
    <g class="hm-pend ${tn} ${A(1)};--a:${-a}deg"><line x1="120" y1="14" x2="120" y2="118" class="hm-rod"/><circle cx="120" cy="124" r="11" class="hm-bob" fill="url(#hmBob)"/><circle cx="120" cy="124" r="20" class="hm-halo"/>${rv && rv.stage !== "failed" ? `<circle cx="120" cy="124" r="16" class="hm-rvring ${rv.tone}"/>` : ""}</g>
    ${ghost == null ? "" : `<g class="hm-ghost" style="--a:${-ghost}deg"><line x1="120" y1="14" x2="120" y2="122"/><circle cx="120" cy="124" r="6"/></g>`}
    <circle cx="120" cy="14" r="4" class="hm-pivot"/>
  </svg>`;
}

/** Leitura embaixo do pêndulo: nota, faixa, quão dentro e de quando é (pregão, prévia do pré/pós). */
const HMS = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }); // prettier-ignore

/** Hora (s) do dado mais novo entre os ativos do regime (pregão ou pré/pós). */
export function regimeDataTime(quotes) {
  let t = 0;
  for (const s of REGIME_SYMS) {
    const q = quotes?.[s];
    t = Math.max(t, q?.regT ?? 0, q?.t ?? 0, q?.xt ?? 0);
  }
  return t || null;
}

/**
 * Quanto a nota andou na última hora: nota agora × 60 min atrás pela MESMA conta (barras de 5 min + preço ao
 * vivo), a dos avisos de mudança de regime. Pede as barras à central (revalida a cada barra) e redesenha quando
 * chegam. null sem barras.
 */
let hourMemo = { bars: null, quotes: null, hours: null, val: null };
/** Pêndulo das últimas 1h/3h/5h (regimeOver). Pede as barras de 5 min à central; null até elas chegarem. */
export function hourRegime(flow, quotes, hours, nowMs = Date.now()) {
  if (!flow?.close) return null;
  const e = useBars(barsKey({ symbols: REGIME_SYMS, win: "short" }), { bg: true, onUpdate: () => hooks.render() }); // prettier-ignore
  const bars = e?.data?.series;
  if (!bars) return null;
  if (hourMemo.bars !== bars || hourMemo.quotes !== quotes || hourMemo.hours !== hours) {
    let val = null;
    try {
      val = regimeOver({ daily: { dates: flow.dates, close: flow.close }, series: bars, quotes, nowSec: nowMs / 1000, hours }); // prettier-ignore
    } catch {
      val = null;
    }
    hourMemo = { bars, quotes, hours, val };
  }
  return hourMemo.val;
}

const moveMemo = new Map(); // passos ("1,3,5", "0.083…,0.25,…") → { bars, quotes, val }: 1D, janelas curtas e pílula
/** Variação da nota do dia nos passos `hours` (padrão 1h, 3h e 5h; pontos) pela conta dos avisos. null sem barras. */
export function regimeMovesNow(flow, quotes, nowMs = Date.now(), hours = MOVE_HOURS) {
  if (!flow?.close) return null;
  const e = useBars(barsKey({ symbols: REGIME_SYMS, win: "short" }), { bg: true, onUpdate: () => hooks.render() }); // prettier-ignore
  const bars = e?.data?.series;
  if (!bars) return null;
  const key = hours.join(",");
  const m = moveMemo.get(key);
  if (m && m.bars === bars && m.quotes === quotes) return m.val;
  let val = null;
  try {
    val = regimeMoves({ daily: { dates: flow.dates, close: flow.close }, series: bars, quotes, nowSec: nowMs / 1000, hours }); // prettier-ignore
  } catch {
    val = null;
  }
  moveMemo.set(key, { bars, quotes, val });
  return val;
}
/** Quanto a nota andou na última hora (pontos), a conta dos avisos de mudança de regime. */
export function regimeMove(flow, quotes, nowMs = Date.now()) {
  return regimeMovesNow(flow, quotes, nowMs)?.[1] ?? null;
}

/** Rótulo de um passo em horas: 0,25 → "15 min", 3 → "3h". */
const stepLabel = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h}h`);

/** Faixa "Variação da nota: 1h ▲ 4 · 3h ▼ 2 · 5h ▲ 10" (puro); `steps` em horas (janelas curtas: 15 min…). */
export function movesHtml(m, steps = MOVE_HOURS) {
  if (!m || steps.every((h) => m[h] == null)) return "";
  const chip = (h) => {
    const v = m[h] == null ? null : Math.round(m[h]);
    const cls = v > 0 ? "up" : v < 0 ? "dn" : "";
    const txt = v == null ? "—" : `${v > 0 ? "▲" : v < 0 ? "▼" : "="} ${Math.abs(v)}`;
    return `<span class="hm-pmv ${cls}"><small>${stepLabel(h)}</small> ${txt}</span>`;
  };
  const ago = steps
    .map(stepLabel)
    .join(", ")
    .replace(/, ([^,]+)$/, " e $1");
  return `<span class="hm-pmoves" title="Quanto a nota do dia (o humor) andou (pontos, −100 a +100) desde ${ago} atrás: a mesma conta dos avisos de mudança de regime e da velocidade do humor, em qualquer janela. ▲ rumo ao risco, ▼ rumo à defesa."><small>Variação da nota</small> ${steps.map(chip).join("")}</span>`;
}

/** Faixa "Velocidade do humor ▲ 0.8 pts/min · acelerando · 4 de 5 trechos" (puro). */
const SPEED_TXT = { parado: "parado", acelerando: "acelerando", freando: "freando", constante: "ritmo constante" }; // prettier-ignore
export function speedHtml(sp) {
  if (!sp) return "";
  const cls = sp.side > 0 ? "up" : sp.side < 0 ? "dn" : "";
  const arrow = sp.pace > 0.05 ? "▲" : sp.pace < -0.05 ? "▼" : "=";
  const st = sp.state === "virando" ? `virando${sp.side > 0 ? " para a defesa" : " para o risco"}` : SPEED_TXT[sp.state]; // prettier-ignore
  const firm = sp.agree == null ? "" : ` · ${sp.agree} de ${sp.n} trechos`;
  const r = (x) => (x == null ? "—" : `${x > 0 ? "+" : ""}${num(x, 1)}`);
  const segs = (sp.seg ?? []).map((x) => `${x.from}–${x.to} min ${r(x.rate)}`).join(" · ");
  const last = sp.coarse ? "últimos 5 min" : "último minuto";
  const before = sp.coarse ? "de 5 a 15 min" : "de 1 a 5 min";
  const tip = `Velocidade do humor: quanto a nota do dia (a mesma dos chips de variação, dos avisos de mudança de regime e do radar de virada) anda por MINUTO. Ritmo = variação em 5 min (${r(sp.pace)} pts/min); ${last} ${r(sp.fast)} pts/min × ${before} ${r(sp.slow)} pts/min. Acelerando/freando = diferença de 0,3 pt/min ou mais a favor/contra o ritmo; virando = o trecho recente já anda 0,3 pt/min ou mais contra o ritmo; parado = ritmo abaixo de 0,3 pt/min. Trechos (pts/min): ${segs}.${sp.coarse ? " Medindo: o ponto de 1 min aparece depois de 1 a 3 min com o app aberto (a trilha grava a nota a cada atualização de preço); até lá, só barras de 5 min." : ""} Leitura em modo sombra.`; // prettier-ignore
  return `<span class="hm-pspeed ${cls} st-${sp.state}${sp.conf ? ` cf-${sp.conf}` : ""}" title="${esc(tip)}"><small>Velocidade do humor</small> <b>${arrow} ${num(Math.abs(sp.pace), 1)} pts/min</b> · ${st}${firm}${sp.coarse ? " · medindo" : ""}</span>`; // prettier-ignore
}

// Trilha da nota do dia para a velocidade em minutos: um ponto a cada atualização (no máximo a cada 10 s), últimos
// 20 min; fica no aparelho (pendulo.moodTrail) para sobreviver a um recarregar. Não é edição: não vai para a nuvem.
const TRAIL_KEY = "pendulo.moodTrail";
let moodTrail = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(TRAIL_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
})();
let speedMemo = { bars: null, quotes: null, at: 0, val: null };
/** Velocidade do humor agora (moodSpeed, em minutos), pelas barras de 5 min e pela trilha. null sem barras. */
export function speedNow(flow, quotes, nowMs = Date.now()) {
  if (!flow?.close) return null;
  const e = useBars(barsKey({ symbols: REGIME_SYMS, win: "short" }), { bg: true, onUpdate: () => hooks.render() }); // prettier-ignore
  const bars = e?.data?.series;
  if (!bars) return null;
  if (speedMemo.bars !== bars || speedMemo.quotes !== quotes || nowMs - speedMemo.at >= 10_000) {
    let val = null;
    const nowSec = nowMs / 1000;
    try {
      val = moodSpeed({ daily: { dates: flow.dates, close: flow.close }, series: bars, quotes, nowSec, trail: moodTrail }); // prettier-ignore
    } catch {
      val = null;
    }
    if (Number.isFinite(val?.now)) {
      moodTrail = pushTrail(moodTrail, nowSec, val.now);
      try {
        localStorage.setItem(TRAIL_KEY, JSON.stringify(moodTrail));
      } catch {
        /* armazenamento cheio ou bloqueado: a trilha segue só na memória */
      }
    }
    speedMemo = { bars, quotes, at: nowMs, val };
  }
  return speedMemo.val;
}

/**
 * Fim de semana: no vão entre o fechamento de sexta e a volta do câmbio/futuros (domingo à noite), a agulha
 * passa a ser a prévia pelo cripto (assets/weekend-pulse.js); a nota de sexta fica como agulha fantasma.
 * Fora do vão devolve a leitura como veio. Pede as barras de 30 min do cripto à central e redesenha quando chegam.
 */
let wkMemo = { bars: null, quotes: null, flow: null, val: null };
export function weekendLayer(read, flow, quotes, nowMs = Date.now()) {
  if (!read || !flow?.close || !weekendGap(quotes, nowMs / 1000)) return read;
  const e = useBars(barsKey({ symbols: WK_SYMS, win: "long" }), { bg: true, onUpdate: () => hooks.render() }); // prettier-ignore
  const bars = e?.data?.series;
  if (!bars) return { ...read, session: `${read.session} · fim de semana, lendo o cripto…` };
  if (wkMemo.bars !== bars || wkMemo.quotes !== quotes || wkMemo.flow !== flow) {
    let val = null;
    try {
      val = weekendPulse({ quotes, series: bars, close: flow.close, nowSec: nowMs / 1000 });
    } catch {
      val = null;
    }
    wkMemo = { bars, quotes, flow, val };
  }
  const wk = wkMemo.val;
  if (!wk) return read;
  const b = pendulumReading({ n: 1, on: wk.score > 0 ? 1 : 0, strength: { score: wk.score, raw: wk.score }, verdict: "" }); // prettier-ignore
  return {
    ...read,
    score: b.score,
    angle: b.angle,
    zone: b.zone,
    label: b.label,
    depth: b.depth,
    breadth: "",
    outliers: [],
    ghost: read.angle,
    fri: read.score,
    weekend: wk,
    feed: "fim de semana: Bitcoin e Ether (24/7); bolsas e futuros fechados",
    warn: wk.crash
      ? "Queda forte do cripto no fim de semana: no estudo de 2017–2026, a segunda abriu em média −1,0% e fechou em queda 71% das vezes"
      : read.warn,
    at: wk.at,
    move: null,
    moves: null,
    session:
      "Fim de semana · prévia da abertura de segunda pelo cripto (bolsa, futuros e câmbio fechados)",
  };
}

/** Quando foi a medição, discreto: "medido sáb 21/11 14:32". */
const AT_FMT = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
export function measuredAt(sec) {
  if (!(sec > 0)) return "";
  const p = Object.fromEntries(AT_FMT.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value])); // prettier-ignore
  return `${p.weekday.replace(".", "")} ${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** Detalhe do pêndulo em linhas: rótulo à esquerda, valor à direita, nota curta embaixo; agrupadas por tema. */
const dRow = (label, value, note = "", cls = "") =>
  `<div class="hm-dr"><span class="hm-dl">${label}</span><b class="hm-dv ${cls}">${value}</b>${note ? `<small class="hm-dn">${note}</small>` : ""}</div>`; // prettier-ignore
const dGroup = (title, rows) => (rows.filter(Boolean).length ? `<div class="hm-dg"><span class="hm-dgh">${title}</span>${rows.join("")}</div>` : ""); // prettier-ignore
const sgnPts = (x) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x))}`;
const toneOf = (x) => (x > 0 ? "up" : x < 0 ? "dn" : "mid");
/** Barrinha de −100 a +100 com marca no zero, para comparar blocos de um olhar. */
const dBar = (x) =>
  `<i class="hm-dbar" aria-hidden="true"><i class="${toneOf(x)}" style="${x >= 0 ? `left:50%;width:${(Math.min(100, x) / 2).toFixed(1)}%` : `right:50%;width:${(Math.min(100, -x) / 2).toFixed(1)}%`}"></i></i>`; // prettier-ignore

function pendWinHtml(hk) {
  const b = Object.entries(PEND_WIN)
    .map(
      ([k, w]) =>
        `<button data-pend-h="${k}" aria-pressed="${k === hk}" title="${esc(w.label)}">${w.btn}</button>`,
    ) // prettier-ignore
    .join("");
  const busy = !!state.pendBusy;
  const at = state.pendAt ? ` · última: ${new Date(state.pendAt).toLocaleTimeString("pt-BR")}` : "";
  const rf = `<button class="hm-prf${busy ? " spin" : ""}" data-action="pend-refresh" ${busy ? "disabled aria-busy=\"true\"" : ""} title="Atualizar só o pêndulo agora: cotações das razões de risco e barras de 5 min, sem esperar o ciclo${at}" aria-label="Atualizar só o pêndulo"><span aria-hidden="true">⟳</span></button>`; // prettier-ignore
  return `<div class="seg hm-pwin" role="group" aria-label="Janela do pêndulo">${rf}${b}</div>`;
}

function pendReadHtml(r, hk = "1d") {
  if (!r) return `${pendWinHtml(hk)}<p class="hm-pread idle">Lendo as razões de risco…</p>`;
  const sign = r.score > 0 ? "+" : r.score < 0 ? "−" : "";
  return `${pendWinHtml(hk)}<div class="hm-pread" title="Nota do regime (−100 a +100), o humor do mercado agora: 15 razões de risco em 3 blocos de peso igual (EUA, mundo e câmbio/commodities), cada uma com o preço mais novo que existe no momento (pregão, pré/pós, futuros ou bolsa de fora aberta). Na janela de 1 dia pesam amplitude 40%, força em desvios 40% e VIX (nível, curva e rumo agora) 20%; o longo prazo fica na linha MM200 + crédito. Fora do padrão = razão que anda 1,5 desvio ou mais contra o contexto. Faixas: −100 a −60 defesa forte, −60 a −20 defesa, −20 a +20 neutro, +20 a +60 risco, +60 a +100 risco forte.">
    <b class="hm-pscore ${r.zone.tone}">${sign}${Math.abs(r.score)}</b>
    <div class="hm-pbar" aria-hidden="true">${PEND_ZONES.map((z) => `<span class="${z.tone}${z.key === r.zone.key ? " on" : ""}">${esc(z.label)}</span>`).join("")}<i style="left:${((r.score + 100) / 2).toFixed(1)}%"></i></div>
    <span class="hm-pzone"><b class="${r.zone.tone}">${esc(r.label)}</b> · ${esc(r.depth)}</span>
    ${r.at ? `<small class="hm-pat" title="Hora (Brasília) do dado mais novo que a nota considera${r.weekend ? ": cotação do cripto" : ""}">medido ${esc(measuredAt(r.at))}${r.weekend ? " · fds" : ""}</small>` : r.asOf ? `<small class="hm-pat">${esc(r.asOf)}</small>` : ""}
    ${r.feed ? `<small class="hm-pat hm-pfeed" title="De onde vem cada dado da nota agora: no pregão, os preços do pregão; no pré e no pós, futuros e o pré/pós dos ETFs; de madrugada, futuros e bolsas de fora abertas. VIX pelos futuros de VIX (VIXY) no pré/pós; sem eles, estimado pelo S&P.">${esc(r.feed)}</small>` : ""}
    ${r.moves ? movesHtml(r.moves, r.steps) : ""}
    ${r.speed ? speedHtml(r.speed) : ""}
    ${r.move == null || r.moves ? "" : `<span class="hm-pmove ${r.move > 0 ? "up" : r.move < 0 ? "dn" : ""}">${r.move > 0 ? "▲" : r.move < 0 ? "▼" : "="} ${r.move ? `${Math.abs(Math.round(r.move))} ${Math.abs(Math.round(r.move)) === 1 ? "ponto" : "pontos"} na última hora (${r.move > 0 ? "rumo ao risco" : "rumo à defesa"})` : "estável na última hora"}</span>`}
  </div>`;
}

/** Linhas do fim de semana no detalhe: cada cripto desde sexta 16h e como entra na nota. */
function weekendRows(r) {
  const wk = r.weekend;
  const rows = wk.items.map((x) => dRow(esc(x.label), `${pct(x.chg, 1)}`, `${num(x.z, 1)}σ desde sexta 16h (NY)`, toneOf(x.chg))); // prettier-ignore
  const note = `Nota de sexta: ${sgnPts(r.fri)} (agulha clara). Bitcoin e Ether meio a meio × correlação Bitcoin × S&P (${num(wk.rho, 2)}); queda pesa inteira, alta ${num(UP_W, 2)}. No estudo (2017–2026) o cripto do fds antecipou a ABERTURA de segunda (acerto de direção ~62%), não o fechamento. Domingo à noite voltam futuros, câmbio e Ásia.`; // prettier-ignore
  return { group: dGroup("Fim de semana · prévia pelo cripto", rows), note: `<span class="hm-pses" title="Estudo: Mourey, Shahrour e Șoiman (Finance Research Letters, 2025). Leitura em modo sombra.">${esc(note)}</span>` }; // prettier-ignore
}
/** Detalhe do pêndulo (blocos, fora do padrão, radar): no desktop fica à esquerda, embaixo do texto. */
/** Detalhe do pêndulo (blocos, fora do padrão, longo prazo): no desktop fica à esquerda, embaixo do texto. */
function pendDetailHtml(r, rev = null) {
  if (!r) return "";
  const wk = r.weekend ? weekendRows(r) : null;
  return `<div class="hm-hero-d">
    <div class="hm-dcol">${wk ? wk.group : ""}
    ${
      !r.weekend && r.parts?.length > 1
        ? dGroup(
            `Como a nota ${sgnPts(r.score)} se forma`,
            r.parts.map((x) => dRow(esc(x.label), `${dBar(x.pts)}${sgnPts(x.pts)}`, esc(x.hint), toneOf(Math.round(x.pts)))), // prettier-ignore
          )
        : ""
    }
    ${
      r.blocks.length > 1
        ? dGroup(
            r.weekend ? "Módulos · fechamento de sexta" : "Módulos",
            r.blocks.flatMap((b) => [
              dRow(
                esc(BLOCK_SHORT[b.id] ?? b.label),
                `${dBar(b.score)}${sgnPts(b.score)}`,
                "",
                toneOf(b.score),
              ),
              ...(b.groups ?? []).map(
                (g) =>
                dRow(`<span class="hm-dsub">${esc(g.label)}</span>`, `${dBar(g.score)}${sgnPts(g.score)}`, "", toneOf(g.score)), // prettier-ignore
              ),
            ]),
          )
        : ""
    }
    </div>${wk ? wk.note : ""}
    ${r.breadth ? `<span class="hm-pses">${esc(r.breadth)}</span>` : ""}
    ${
      r.outliers.length
        ? `<span class="hm-pout">Fora do padrão: ${r.outliers
            .slice(0, 3)
            .map((o) => `${esc(o.label)} (${o.z > 0 ? "+" : "−"}${num(Math.abs(o.z), 1)}σ)`)
            .join(" · ")}</span>`
        : ""
    }
    ${r.warn ? `<span class="hm-pwarn">⚠ ${esc(r.warn)}</span>` : ""}
    ${revDetailHtml(rev)}
    <em class="hm-pses">${esc(r.session)}${r.at ? ` · dado de ${HMS.format(new Date(r.at * 1000))}` : ""}</em>
    <button class="hm-hist-btn" data-reg-hist>Como andou o regime <span aria-hidden="true">›</span></button>
  </div>`;
}

function heroHtml(c, ses, rg, trend, pb, hk = "1d") {
  let word = regimeWord(rg);
  const day = hk === "1d";
  const read0 = pendulumReading(rg, day ? ses.key : null);
  // fora do 1D: fechamentos da janela, sem prévia nem "última hora" (que medem o regime do dia)
  const lastDay = c.flow?.dates?.at(-1);
  const hrs = PEND_HOURS[hk] ?? null;
  const read1 = read0 && hrs ? { ...read0, session: `${PEND_WIN[hk].label} · preço agora × ${hrs} h atrás (barras de 5 min com pré/pós; parado, futuro ou ETF do país)`, at: regimeDataTime(c.quotes), move: null, moves: regimeMovesNow(c.flow, c.quotes, c.now, OVER_STEPS[hrs]), steps: OVER_STEPS[hrs], speed: speedNow(c.flow, c.quotes, c.now), feed: `variação das razões nas últimas ${hrs} h, em desvios de ${hrs} h` } : read0 && (day ? { ...read0, at: regimeDataTime(c.quotes), move: regimeMove(c.flow, c.quotes, c.now), moves: regimeMovesNow(c.flow, c.quotes, c.now), speed: speedNow(c.flow, c.quotes, c.now) } : { ...read0, session: `${PEND_WIN[hk].label} · fechamentos`, at: null, move: null, asOf: lastDay ? `fechamentos até ${lastDay.slice(8, 10)}/${lastDay.slice(5, 7)}` : "" }); // prettier-ignore
  const read = day ? weekendLayer(read1, c.flow, c.quotes, c.now) : read1;
  if (read?.weekend) word = [`${read.zone.word} (prévia do fim de semana)`, read.zone.tone];
  // radar de virada: só no regime do dia e fora do fim de semana (a trilha é intraday)
  let rev = null;
  if (day && read && !read.weekend) {
    try {
      rev = liveReversal(c.flow, c.quotes, c.now);
    } catch {
      rev = null;
    }
  }
  const head = word
    ? `O mercado está <em class="${word[1]}">${word[0]}</em>${day ? "" : ` <small class="hm-hwin">${esc(PEND_WIN[hk].label.toLowerCase())}</small>`}.`
    : `Lendo o mercado<span class="hm-dots"><i>.</i><i>.</i><i>.</i></span>`;
  const sub = pb
    ? `Sua carteira ${pb.dayPLPct == null ? "aguarda cotações" : `${pb.dayPLPct >= 0 ? "sobe" : "cai"} <b class="${tone(pb.dayPLPct)}">${pct(Math.abs(pb.dayPLPct), 2).replace("+", "")}</b> hoje${pb.vsSpy == null ? "" : `, <b class="${tone(pb.vsSpy)}">${pp(Math.abs(pb.vsSpy)).replace("+", "")}</b> ${pb.vsSpy >= 0 ? "à frente do" : "atrás do"} S&amp;P`}`}.`
    : `<button type="button" class="hm-sub-cta" data-tab="portfolio">Importar carteira</button> para o app medir o seu dia.`;
  const chips = [
    `<span class="hm-chip ${ses.tone}"><i class="hm-dot ${ses.key}"></i>${esc(ses.label)}<em>${esc(ses.hint ?? "")}</em></span>`,
    rg
      ? `<button class="hm-chip" data-tab="dash">Regime <b>${esc(rg.verdict)}${rg.strength ? ` · ${esc(rg.strength.level)}` : ""}</b><em>${rg.on}/${rg.n} razões</em></button>`
      : "",
    trend
      ? `<button class="hm-chip" data-tab="macro">Tendência <b class="${trend.bull ? "up" : "dn"}">${esc(trend.label)}</b></button>`
      : "",
  ].join("");
  return `<section class="hm-hero card ${A(0)}">
    <div class="hm-hero-t">
      <p class="hm-date">${esc(TODAY.format(new Date(c.now)))} · ${greeting(c.now)}</p>
      <h2 class="hm-head">${head}</h2>
      <p class="hm-sub">${sub}</p>
      <div class="hm-chips">${chips}</div>
    </div>
    <div class="hm-hero-g ${read ? "" : "idle"}">${pendulumSvg(read?.angle ?? null, word?.[1] ?? "mid", read?.zone.key, read?.ghost ?? null, revOverlay(rev, read?.score))}${pendReadHtml(read, hk)}${revStripHtml(rev)}${(() => {
      const m = useFearGreed();
      return fgHtml(m.d, { err: m.err });
    })()}</div>
    ${pendDetailHtml(read, rev)}
  </section>`;
}

// Medo & Ganância (CNN), embaixo do pêndulo: carrega sozinho, a cada 2 min (api/yields?fg=1, cache na borda de 2 min;
// a CNN recalcula a nota durante o pregão)
const fgMem = { d: null, err: null, p: null, at: 0 };
function useFearGreed() {
  const age = Date.now() - fgMem.at;
  if (!fgMem.p && age > (fgMem.err ? 60_000 : 2 * 60_000)) {
    fgMem.p = fetchJSON("api/yields?fg=1", { bg: true })
      .then((d) =>
        Object.assign(
          fgMem,
          Number.isFinite(d?.score) ? { d, err: null } : { err: d?.error ?? "sem nota" },
        ),
      ) // prettier-ignore
      .catch((e) => (fgMem.err = String(e?.message ?? e)))
      .finally(() => {
        fgMem.p = null;
        fgMem.at = Date.now();
        if (state.prefs.tab === "home") hooks.render();
      });
  }
  return fgMem;
}

/** Pêndulo da carteira: cartão próprio, separado do pêndulo do mercado (que não muda). */
export function portPendHtml(pp) {
  if (!pp) return "";
  if (!pp.ok)
    return `<section class="card hm-card hm-ppend ${A(2)}"><header class="hm-ch"><div><span class="hm-eyebrow">Carteira × mercado</span><h3>Pêndulo da carteira</h3></div></header><p class="muted small">Aguardando o histórico das posições para medir o beta${pp.missing?.length ? ` (${esc(pp.missing.join(", "))})` : ""}.</p></section>`; // prettier-ignore
  const deg = (pp.posture / 100) * PEND_MAX;
  const ghost = pp.target == null ? null : (pp.target / 100) * PEND_MAX;
  const br = (x, d = 2) => num(x, d);
  const ppTxt = (x) =>
    `${x >= 0 ? "+" : "−"}${br(Math.abs(x) * 100, Math.abs(x) < 0.1 ? 1 : 0)} p.p.`;
  // sinergia aberta: nota de cada parte (0–100), peso e quantos pontos ela soma na nota final
  const W = { align: 0.5, asym: 0.3, alpha: 0.2 };
  const wsum = Object.keys(W).reduce((a, k) => a + (Number.isFinite(pp.parts?.[k]) ? W[k] : 0), 0);
  const part = (k, label) => {
    const v = pp.parts?.[k];
    if (!Number.isFinite(v))
      return dRow(label, "–", `sem dado · peso ${br(W[k] * 100, 0)}%`, "mid");
    const pts = (100 * W[k] * v) / wsum;
    return dRow(label, `${br(v * 100, 0)}<small>/100</small>`, `peso ${br(W[k] * 100, 0)}% · soma ${br(pts, 0)} pts`, v >= 0.6 ? "up" : v < 0.4 ? "dn" : "mid"); // prettier-ignore
  };
  const synRows = pp.synergy == null ? "" : dGroup("Como se forma a sinergia", [part("align", "Alinhamento ao alvo"), part("asym", "Assimetria de captura"), part("alpha", "Alfa de hoje")]); // prettier-ignore
  const expRows = dGroup("Exposição × cenário", [
    dRow("Postura atual", `${esc(pp.zone.label)} ${sgnPts(pp.posture)}`, `beta ${br(pp.netBeta)} contra o S&amp;P`, pp.zone.tone),
    pp.target == null ? "" : dRow("Alvo pelo cenário", sgnPts(pp.target), `beta ${br(pp.targetBeta)}${Number.isFinite(pp.market) ? ` · regime ${sgnPts(pp.market)}` : ""}`),
    pp.target == null ? "" : dRow("Distância ao alvo", sgnPts(pp.posture - pp.target), Math.abs(pp.posture - pp.target) < 10 ? "alinhada" : pp.posture > pp.target ? "mais exposta que o cenário" : "mais protegida que o cenário", Math.abs(pp.posture - pp.target) < 10 ? "up" : "dn"), // prettier-ignore
    pp.read?.move > 0 ? dRow("Para alinhar", `${pp.read.dir === "reduzir" ? "▼" : "▲"} ~${usd(pp.read.move)}`, `${esc(pp.read.dir)} exposição em S&amp;P`) : "",
  ]); // prettier-ignore
  const behRows = dGroup(pp.capture ? `Comportamento · ${pp.capture.days} pregões` : "Comportamento", [
    pp.capture ? dRow("Captura na alta", `${br(pp.capture.up * 100, 0)}%`, "do S&amp;P quando ele sobe", pp.capture.up >= 1 ? "up" : "mid") : "",
    pp.capture ? dRow("Captura na queda", `${br(pp.capture.down * 100, 0)}%`, "do S&amp;P quando ele cai", pp.capture.down <= pp.capture.up ? "up" : "dn") : "",
    Number.isFinite(pp.asym) ? dRow("Assimetria", ppTxt(pp.asym), "alta − queda", toneOf(pp.asym)) : "",
    Number.isFinite(pp.alpha) ? dRow("Alfa de hoje", ppTxt(pp.alpha), "além do que o beta explica", toneOf(pp.alpha)) : "",
  ]); // prettier-ignore
  return `<section class="card hm-card hm-ppend ${A(2)}" aria-label="Pêndulo da carteira">
    <header class="hm-ch"><div><span class="hm-eyebrow">Carteira × mercado</span><h3>Pêndulo da carteira</h3></div><button class="linkish" data-tab="portfolio">Plano na Carteira →</button></header>
    <div class="hm-ppend-b">
      <div class="hm-hero-g">${pendulumSvg(deg, pp.zone.tone, pp.zone.key, ghost)}<p class="hm-pses hm-pleg"><i class="hm-lg-n"></i>carteira <i class="hm-lg-g"></i>alvo pelo cenário</p></div>
      <div class="hm-pread" title="Postura = 50 × beta líquido da carteira contra o S&amp;P (beta 1 = +50). Alvo = beta pela nota do regime, para carteira comprada: 0,2 na defesa forte, 0,7 no neutro, 1,2 no risco forte. Sinergia (0–100) = 50% alinhamento ao alvo + 30% assimetria (captura de alta − captura de queda, 63 pregões) + 20% alfa de hoje.">
        ${pp.synergy == null ? "" : `<b class="hm-pscore ${pp.level.key === "ok" ? "up" : pp.level.key === "bad" ? "dn" : "mid"}">${pp.synergy}</b><span class="hm-pzone"><b>Sinergia</b> · ${esc(pp.level.label)}</span>`}
        ${pp.read ? `<span class="hm-pses ${pp.read.key === "ok" ? "" : "hm-pwarn"}">${esc(pp.read.text)}</span>` : ""}
        <div class="hm-dgs">${synRows}${expRows}${behRows}</div>
        ${pp.coverage < 0.99 ? `<em class="hm-pses">Beta medido em ${br(pp.coverage * 100, 0)}% da carteira${pp.missing.length ? ` (sem histórico: ${esc(pp.missing.slice(0, 4).join(", "))})` : ""}.</em>` : ""}
        <em class="hm-pses">Leitura educacional, separada do pêndulo do mercado; não é recomendação.</em>
      </div>
    </div>
  </section>`;
}

function kpiHtml(pb, now = Date.now()) {
  if (!pb)
    return `<section class="hm-kband card hm-empty-band ${A(2)}"><div><b>Sem carteira importada</b><p class="muted small">Cole a tabela Holdings do Investing e a Início passa a mostrar patrimônio, resultado do dia e avisos de cada posição.</p></div><button class="btn primary" data-tab="settings" data-sub="carteira">Importar carteira</button></section>`; // prettier-ignore
  const cell = (k, v, s, cls = "") =>
    `<div class="hm-kc"><span class="hm-k">${k}</span><b class="hm-kv ${cls}">${v}</b><span class="hm-ks ${cls}">${s}</span></div>`;
  return `<section class="hm-kband card ${A(2)}" aria-label="Carteira em números">
    ${cell("Patrimônio", usd(pb.total), `${pb.n} posições`)}
    ${cell("Hoje", pb.dayPLPct == null ? "–" : pct(pb.dayPLPct, 2), sUsd(pb.dayPL), tone(pb.dayPL))}
    ${cell("Contra o S&amp;P", pp(pb.vsSpy), `SPY ${pct(pb.spy, 2)}`, tone(pb.vsSpy))}
    ${cell("Resultado total", pct(pb.netPLPct, 1), sUsd(pb.netPL), tone(pb.netPL))}
    ${cell("Pregão NY", esc(marketClockText(now)), marketClock(now).open ? "aberto até o fechamento" : "até a abertura (9h30 de NY)", marketClock(now).open ? "up" : "")}
  </section>`;
}

const SLICE = ["var(--accent)", "var(--buy)", "var(--info)", "var(--violet)", "var(--wait)", "var(--sell)", "var(--text-3)"]; // prettier-ignore

function walletHtml(pb) {
  if (!pb) return "";
  const arcs = donutArcs(pb.slices);
  const segs = arcs
    .map(
      (s, i) =>
        `<circle cx="60" cy="60" r="42" stroke="${SLICE[i % SLICE.length]}" stroke-dasharray="${Math.max(0, s.len - 1.5).toFixed(2)} ${(s.C - Math.max(0, s.len - 1.5)).toFixed(2)}" stroke-dashoffset="${(-s.off).toFixed(2)}"><title>${esc(s.sym)} ${pct(s.w, 1).replace("+", "")}</title></circle>`,
    ) // prettier-ignore
    .join("");
  const leg = arcs
    .map(
      (s, i) =>
        `<li><i style="background:${SLICE[i % SLICE.length]}"></i><span>${esc(s.sym)}</span><b>${pct(s.w, 1).replace("+", "")}</b></li>`,
    ) // prettier-ignore
    .join("");
  const mv = (r) =>
    `<button class="hm-mv" data-hold="${esc(r.sym)}"><b>${esc(r.sym)}</b><span class="${tone(r.dayPLPct)}">${pct(r.dayPLPct, 2)}</span><em>${sUsd(r.dayPL)}</em></button>`;
  return `<section class="card hm-card hm-wallet ${A(5)}">
    <header class="hm-ch"><div><span class="hm-eyebrow">Carteira</span><h3>Onde está o dinheiro</h3></div><button class="linkish" data-tab="portfolio">Posições →</button></header>
    <div class="hm-donut-w">
      <svg class="hm-donut" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="42" class="hm-dtrack"/><g class="hm-dsegs ${A(6)}" transform="rotate(-90 60 60)">${segs}</g><text x="60" y="57" text-anchor="middle" class="hm-dn">${pb.n}</text><text x="60" y="72" text-anchor="middle" class="hm-dl">POSIÇÕES</text></svg>
      <ul class="hm-dleg">${leg}</ul>
    </div>
    <div class="hm-movers"><div><span class="hm-k">Sobem${pb.upCount ? ` · ${pb.upCount}` : ""}</span>${pb.best.map(mv).join("") || `<p class="muted small">Nenhuma em alta.</p>`}</div>
    <div><span class="hm-k">Caem${pb.downCount ? ` · ${pb.downCount}` : ""}</span>${pb.worst.map(mv).join("") || `<p class="muted small">Nenhuma em queda.</p>`}</div></div>
  </section>`;
}

function pulseHtml(tiles, close) {
  const body = tiles.length
    ? tiles
        .map((t, i) => {
          const hist = close?.[t.sym]?.slice(-22) ?? [];
          const d = sparkPath([...hist, t.p], 100, 28);
          const m = hist.length ? t.p / hist[0] - 1 : null;
          const val = t.kind === "yld" ? `${num(t.p, 2)}%` : px(t.p);
          const chg = t.kind === "yld" ? (t.bps == null ? "–" : `${t.bps > 0 ? "+" : t.bps < 0 ? "−" : ""}${num(Math.abs(t.bps), 0)} bps`) : pct(t.c, 2); // prettier-ignore
          return `<button class="hm-tile ${A(7 + i * 0.5)}" data-home-sym="${esc(t.sym)}" title="${esc(t.label)}: abrir"><span class="hm-tl">${esc(t.label)}</span><b>${val}</b><span class="hm-tc ${tone(t.kind === "yld" ? t.bps : t.c)}">${chg}</span>${d ? `<svg class="hm-spark ${tone(m)}" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" pathLength="1" class="hm-anim"/></svg>` : ""}</button>`; // prettier-ignore
        })
        .join("")
    : `<p class="muted small">Cotações chegando…</p>`;
  return `<section class="hm-pulse-w ${A(6)}"><header class="hm-ch"><div><span class="hm-eyebrow">Mercado</span><h3>Pulso agora</h3></div><span class="hm-hint">linha = último mês</span></header><div class="hm-pulse">${body}</div></section>`; // prettier-ignore
}

function flowHtml(sum) {
  if (!sum)
    return `<section class="card hm-card ${A(8)}"><header class="hm-ch"><div><span class="hm-eyebrow">Fluxo</span><h3>Para onde vai o dinheiro</h3></div></header><p class="muted small">Fluxo indisponível no momento.</p></section>`; // prettier-ignore
  const T = { risk_on: ["up", "Apetite por risco"], risk_off: ["dn", "Aversão a risco"], mixed: ["mid", "Fluxo misto"] }[sum.tone] ?? ["mid", "Fluxo misto"]; // prettier-ignore
  const rows = [...sum.groups]
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 7)
    .sort((a, b) => b.z - a.z)
    .map((g) => {
      const w = (Math.min(Math.abs(g.z), 2) / 2) * 50;
      return `<button class="hm-fr" data-group="${esc(g.id)}" data-fh="1d"><span class="hm-fl">${esc(g.label)}</span><span class="hm-ftrack"><i class="hm-fbar hm-anim ${g.z >= 0 ? "up" : "dn"}" style="left:${g.z >= 0 ? 50 : 50 - w}%;width:${w}%;transform-origin:${g.z >= 0 ? "left" : "right"}"></i></span><b class="${g.z >= 0 ? "up" : "dn"}">${g.z > 0 ? "+" : g.z < 0 ? "−" : ""}${num(Math.abs(g.z), 1)}</b></button>`; // prettier-ignore
    })
    .join("");
  return `<section class="card hm-card hm-flow ${A(8)}">
    <header class="hm-ch"><div><span class="hm-eyebrow">Fluxo</span><h3>Para onde vai o dinheiro</h3></div><button class="linkish" data-tab="flow">Fluxo →</button></header>
    <p class="hm-tone ${T[0]}"><i></i>${T[1]}</p>
    <div class="hm-frs">${rows}</div>
    <p class="hm-foot">Força do grupo hoje em desvios-padrão; inferida por preço e volume.</p>
  </section>`;
}

function agendaHtml(items, nowSec) {
  const list = items.slice(0, 7);
  let marked = false;
  const li = [];
  for (const e of list) {
    if (!marked && e.t > nowSec) {
      li.push(`<li class="hm-nowmark"><span>agora · ${esc(HHMM.format(new Date(nowSec * 1000)))}</span></li>`); // prettier-ignore
      marked = true;
    }
    li.push(
      `<li class="hm-ev ${e.t <= nowSec ? "past" : ""} ${e.kind === "earnings" ? "earn" : e.impact}"><span class="hm-when"><b>${esc(HHMM.format(new Date(e.t * 1000)))}</b><em>${esc(dayWord(e.t, nowSec))}</em></span><span class="hm-evt"><b>${esc(e.title)}</b><em>${e.kind === "earnings" ? "posição da carteira" : esc(CC_PT[e.cc] ?? e.cc)}${e.forecast ? ` · proj. ${esc(e.forecast)}` : ""}${e.previous ? ` · ant. ${esc(e.previous)}` : ""}</em></span></li>`,
    );
  }
  const body = list.length
    ? `<ol class="hm-tline">${li.join("")}</ol>`
    : `<p class="muted small">Sem divulgação de alto impacto nas próximas 48 h.</p>`;
  return `<section class="card hm-card hm-cal ${A(9)}"><header class="hm-ch"><div><span class="hm-eyebrow">Agenda</span><h3>Próximas 48 h</h3></div><button class="linkish" data-tab="calendar">Agenda →</button></header>${body}</section>`; // prettier-ignore
}

function newsHtml(news, nowSec) {
  const list = topHeadlines(news, nowSec, 5);
  const body = list.length
    ? `<ul class="hm-news">${list
        .map(
          (it) =>
            `<li><button data-news-pop="${esc(it.link ?? "")}"><span class="hm-nt">${it.t ? esc(HHMM.format(new Date(it.t * 1000))) : ""}</span><span class="hm-nx">${esc(ptTitle(it))}</span><span class="hm-ns">${esc(it.source ?? "")}${it.hits?.length ? ` <span class="hm-hit">${esc(it.hits[0].sym)}</span>` : ""}</span></button></li>`,
        )
        .join("")}</ul>`
    : `<p class="muted small">Manchetes chegando…</p>`;
  return `<section class="card hm-card hm-newsc ${A(10)}"><header class="hm-ch"><div><span class="hm-eyebrow">Notícias</span><h3>Manchetes</h3></div><button class="linkish" data-tab="news">Todas →</button></header>${body}</section>`; // prettier-ignore
}

function stepsCard(steps) {
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) return "";
  const pct0 = Math.round((n / steps.length) * 100);
  return `<section class="card home-steps ${A(11)}"><div class="home-steps-h"><h2>Primeiros passos</h2><span class="muted small">${n} de ${steps.length}</span></div>
    <div class="home-bar" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${steps.length}"><i style="width:${pct0}%"></i></div>
    <ol class="home-step-list">${steps
      .map(
        (s, i) =>
          `<li class="${s.done ? "done" : ""}"><span class="home-num">${s.done ? "✓" : i + 1}</span><div><b>${esc(s.title)}</b><p class="muted small">${esc(s.text)}</p></div>${s.done ? "" : s.btn}</li>`,
      )
      .join("")}</ol></section>`;
}

const SEC_ICO = { market: "◍", wallet: "◫", opps: "◎" };

function shortcutsHtml() {
  const first = (g) => (g.segs ? g.segs[0].tabs[0] : g.tabs[0]);
  const sec = GROUPS.filter((g) => g.id !== "home")
    .map(
      (g) =>
        `<button class="hm-sc" data-tab="${esc(first(g))}"><span class="hm-ico" aria-hidden="true">${SEC_ICO[g.id] ?? "•"}</span><b>${esc(g.label)}</b><em>${esc(g.q.split(/[.?]/)[0])}?</em></button>`,
    )
    .join("");
  const quick = [
    ["watch", "Watchlist"],
    ["journal", "Diário"],
    ["risk", "Risco"],
    ["screener", "Scanner"],
    ["macro", "Macro"],
    ["local", "Brasil"],
  ]
    .filter(([id]) => NAME[id])
    .map(([id, l]) => `<button class="hm-q" data-tab="${id}">${l}</button>`)
    .join("");
  return `<section class="hm-shortcuts ${A(12)}"><header class="hm-ch"><div><span class="hm-eyebrow">Navegar</span><h3>Ir para</h3></div><span class="hm-hint">teclas 1–5 · <kbd>/</kbd> busca</span></header><div class="hm-scs">${sec}</div><div class="hm-quick">${quick}</div></section>`; // prettier-ignore
}

function mapDetails() {
  const sections = GROUPS.filter((g) => g.id !== "home")
    .map(
      (g) =>
        `<article class="home-sec"><h3>${esc(g.label)}</h3>${(g.segs ?? [{ tabs: g.tabs }])
          .map(
            (m) =>
              `${m.label ? `<h4 class="home-side">${m.flag} ${esc(m.label)}</h4>` : ""}<ul>${m.tabs
                .filter((id) => id !== "entry" && !ARCHIVE.includes(id))
                .map(
                  (id) =>
                    `<li><button class="home-link" data-tab="${id}">${esc(NAME[id])}</button><span class="muted small">${esc(TAB_INFO[id].replace(/^(Offshore|Onshore) · /, ""))}</span></li>`,
                )
                .join("")}</ul>`,
          )
          .join("")}</article>`,
    )
    .join("");
  return `<details class="card hm-more"><summary>Mapa completo do app e como ler os sinais</summary>
    <div class="home-grid2">${sections}</div>
    <dl class="hm-legend">
      <div><dt><span class="tag buy">Entrada</span></dt><dd>A regra vê ponto de compra (ex.: recuo dentro de uma tendência de alta).</dd></div>
      <div><dt><span class="tag sell">Saída</span></dt><dd>A regra sugere reduzir ou sair de uma posição que você já tem.</dd></div>
      <div><dt><span class="tag wait">Risco</span></dt><dd>Limite de perda atingido (ex.: perdeu a média de 200 dias). Serve para proteger, não para prever.</dd></div>
    </dl></details>`;
}

/** Chave da ordem dos blocos da Início (localStorage, mesma mecânica dos quadros do Mercado). */
export const HOME_LAYOUT = "homeLayout";

/**
 * Larguras na grade de 12 colunas: blocos "small" seguidos dividem a linha (1 = inteira, 2 = 7/5,
 * 3 = 4/4/4; o 3º leva "e" para ocupar a linha toda na tela média); os demais ocupam a linha inteira.
 */
export function homeSpans(items) {
  const out = [];
  for (let i = 0; i < items.length;) {
    if (!items[i].small) {
      out.push("12");
      i++;
      continue;
    }
    let n = 0;
    while (items[i + n]?.small) n++;
    while (n > 0) {
      const k = n === 4 || n === 2 ? 2 : n === 1 ? 1 : 3;
      out.push(...(k === 1 ? ["12"] : k === 2 ? ["7", "5"] : ["4", "4", "4e"]));
      n -= k;
      i += k;
    }
  }
  return out;
}

/** Blocos [{id, html, small}] na ordem padrão → HTML na ordem do usuário, cada um com a alça de arrastar. */
export function homeBlocks(items, order = []) {
  const list = applyOrder(
    items.filter((x) => x.html),
    order,
  );
  const sp = homeSpans(list);
  const grip = `<span class="hm-grip" data-dp-grip title="Arraste para mudar a ordem" aria-hidden="true"></span>`;
  return list
    .map((x, i) =>
      x.html.replace(/^\s*<([a-z]+)([^>]*)>/, `<$1 data-dp="${x.id}" data-sp="${sp[i]}"$2>${grip}`),
    )
    .join("");
}

let rgMemo = { flow: null, quotes: null, h: null, val: null, back: null };

export function viewHome(ctx) {
  const now = ctx.now ?? Date.now();
  const nowSec = now / 1000;
  const c = { ...ctx, now };
  const ses = sessionLine(now);
  // janela do pêndulo (só a tela): avisos 🧭, histórico e pêndulo da carteira seguem no regime do dia (h = 1)
  const hk = pendWin(ctx.pendH);
  const hrs = PEND_HOURS[hk] ?? null;
  const h = hrs ? 1 : DASH_H[hk];
  let rg = null;
  if (ctx.flow?.close) {
    if (rgMemo.flow !== ctx.flow || rgMemo.quotes !== ctx.quotes || rgMemo.h !== h) {
      let val = null;
      try {
        // prévia com futuros e pré/pós só no 1D, como na Visão geral
        val = h === 1 ? regime(ctx.flow.close, 1, ses.key !== "open" ? ctx.quotes : null, { world: ctx.quotes }) : regime(ctx.flow.close, h); // prettier-ignore
      } catch {
        val = null;
      }
      rgMemo = { flow: ctx.flow, quotes: ctx.quotes, h, val };
    }
    rg = rgMemo.val;
    // janelas de horas: humor só nas últimas 1h/3h/5h (barras de 5 min); até as barras chegarem, "lendo…"
    if (hrs) rg = hourRegime(ctx.flow, ctx.quotes, hrs, now);
  }
  const trend = marketEdge()?.regime ?? null;
  const held = (ctx.valuation?.rows ?? []).map((r) => r.sym);
  const agenda = agendaNext(ctx.cal, held, nowSec);
  const pb = portfolioBrief(ctx.valuation, ctx.quotes);
  let fsum = null;
  try {
    fsum = flowSummary(ctx.flow, { horizon: "1d", session: ses.key, sessionFrac: ctx.sessionFrac }); // prettier-ignore
  } catch {
    fsum = null;
  }
  const steps = stepsCard(firstSteps(ctx));
  const blocks = [
    { id: "hero", html: heroHtml(c, ses, rg, trend, pb, hk) },
    { id: "ppend", html: ctx.hasPortfolio ? portPendHtml(ctx.portPend) : "" },
    { id: "kpi", html: kpiHtml(pb, now) },
    ...(ctx.hasPortfolio ? [] : [{ id: "steps", html: steps }]),
    { id: "wallet", html: walletHtml(pb), small: true },
    { id: "pulse", html: pulseHtml(pulseTiles(ctx.quotes), ctx.flow?.close) },
    { id: "flow", html: flowHtml(fsum), small: true },
    { id: "agenda", html: agendaHtml(agenda, nowSec), small: true },
    { id: "news", html: newsHtml(ctx.news, nowSec), small: true },
    ...(ctx.hasPortfolio ? [{ id: "steps", html: steps }] : []),
    { id: "shortcuts", html: shortcutsHtml() },
    { id: "map", html: mapDetails() },
  ];
  return `<div class="hm" data-layout="${HOME_LAYOUT}">
    ${homeBlocks(blocks, dashLayout(HOME_LAYOUT).order)}
    <p class="note">Arraste qualquer bloco pela alça no topo para mudar a ordem · <button class="linkish" data-dash-reset="${HOME_LAYOUT}">restaurar ordem</button>. Preços do Yahoo (alguns com ~15 min de atraso). Variação do dia = preço ÷ fechamento anterior. Material educacional; não é recomendação de investimento.</p>
  </div>`;
}
