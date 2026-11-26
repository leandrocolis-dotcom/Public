// Lentes de Oportunidades: o que cada análise do app indica hoje sobre o MESMO universo de mercado (assets/market.js).
// Cada análise vira uma lente da tabela de Sinais de hoje (filtro + ordem própria). A decisão final de um ativo segue
// na Decisão do trader (abra o ativo).
import { ratingOf } from "./quant.js";
import { qv } from "./quant-view.js";
import { champ } from "./champions.js";
import { marketAssets } from "./market.js";
import { PRESETS } from "./screener.js";
import { num, pct } from "./format.js";

const TOP = 20;

/** Linhas de cada bloco: [{ sym, name, txt, tone }]. Funções puras sobre os dados já carregados. */
export function oppBlocks({
  quant = qv.data,
  champs = champ.data,
  assets = marketAssets(),
  desk = [],
  limit = TOP,
} = {}) {
  const rows = quant?.rows ?? [];
  const byScore = (dir) => (a, b) => dir * ((a.score ?? 0) - (b.score ?? 0));
  const qRow = (r) => ({ sym: r.sym, name: r.name, txt: `nota ${num(r.score, 2)} · ${ratingOf(r.score)?.label ?? ""}`, tone: ratingOf(r.score)?.tone }); // prettier-ignore
  const qBy = (label, dir) => rows.filter((r) => ratingOf(r.score)?.label === label).sort(byScore(dir)).slice(0, limit).map(qRow); // prettier-ignore
  const picks = (quant?.top ?? []).map((s) => rows.find((r) => r.sym === s) ?? { sym: s, name: s }).slice(0, limit).map(qRow); // prettier-ignore
  const ok = assets.filter((a) => a.ok);
  const scr = (preset) => ok.filter(PRESETS[preset].test).sort((a, b) => (b.momentum ?? 0) - (a.momentum ?? 0)).slice(0, limit)
    .map((a) => ({ sym: a.code, name: a.name, txt: `momentum ${num(a.momentum, 0)} · RSI ${num(a.rsi, 0)} · 3m ${pct(a.r3m, 1)}`, tone: "buy" })); // prettier-ignore
  const dk = desk.filter((r) => !r.missing && r.dec?.now);
  const trader = (keys, dir) => dk.filter((r) => keys.includes(r.dec.now.key)).sort((a, b) => dir * (a.dec.final.score - b.dec.final.score)).slice(0, limit)
    .map((r) => ({ sym: r.sym, name: r.name, txt: `${r.dec.now.label} · confiança ${r.dec.final.conf}`, tone: r.dec.now.tone })); // prettier-ignore
  const ch = (champs?.members ?? []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit)
    .map((m) => ({ sym: m.s, name: m.name, txt: `nota ${num(m.score, 1)} · qualidade ${num(m.Q, 0)} · tendência ${num(m.T, 0)}`, tone: "buy" })); // prettier-ignore
  const day = (a) =>
    `hoje ${pct(a.r1d, 1)}${a.relVol ? ` · vol ${num(a.relVol, 1)}x` : ""} · ${num(a.price, 2)}`;
  const intra = (preset, sort, tone) => ok.filter((a) => a.live && PRESETS[preset].test(a)).sort(sort).slice(0, limit)
    .map((a) => ({ sym: a.code, name: a.name, txt: day(a), tone })); // prettier-ignore
  const up = (a, b) => (b.r1d ?? 0) - (a.r1d ?? 0);
  return [
    { id: "i-break", title: "⚡ Intraday · Rompendo a máxima de 52 semanas", src: "mercado inteiro ao vivo, maior alta do dia primeiro", items: intra("breakout", up, "buy") },
    { id: "i-volup", title: "⚡ Intraday · Volume anormal em alta", src: "volume do dia ≥ 2x a média de 10 dias (parcial durante o pregão), maior volume primeiro", items: intra("volUp", (a, b) => b.relVol - a.relVol, "buy") },
    { id: "i-cross", title: "⚡ Intraday · Cruzou a MM200 para cima hoje", src: "fechou ontem abaixo da média de 200 dias e está acima agora", items: intra("crossUp", up, "buy") },
    { id: "i-up", title: "⚡ Intraday · Maiores altas do dia", src: "acima de +4% hoje", items: intra("bigUp", up, "buy") },
    { id: "i-down", title: "⚡ Intraday · Maiores quedas do dia", src: "abaixo de −4% hoje, maior queda primeiro", items: intra("bigDown", (a, b) => (a.r1d ?? 0) - (b.r1d ?? 0), "sell") },
    { id: "i-voldn", title: "⚡ Intraday · Volume anormal em queda", src: "volume ≥ 2x a média com o preço caindo: possível saída de dinheiro", items: intra("volDown", (a, b) => b.relVol - a.relVol, "sell") },
    { id: "q-buy", title: "Quant Aberto · Compra forte", src: "notas estilo Seeking Alpha (S&P 500), maior nota primeiro", items: qBy("Compra forte", -1) },
    { id: "q-sell", title: "Quant Aberto · Venda forte", src: "notas estilo Seeking Alpha (S&P 500), menor nota primeiro", items: qBy("Venda forte", 1) },
    { id: "propicks", title: "ProPicks aberto · Top 20 do mês", src: "carteira do mês estilo ProPicks (máx. 4 por setor)", items: picks },
    { id: "t-buy", title: "Decisão do trader · Comprar", src: "lista aberta abaixo; Comprar e Comprar em partes, mais forte primeiro", items: trader(["buy", "buy-part"], -1) },
    { id: "t-sell", title: "Decisão do trader · Não comprar", src: "lista aberta abaixo; análises mais contra primeiro", items: trader(["no-buy"], 1) },
    { id: "s-trend", title: "Screener · Tendência de alta", src: "mercado inteiro, maior momentum primeiro", items: scr("uptrend") },
    { id: "s-pull", title: "Screener · Recuo em tendência de alta", src: "mercado inteiro, maior momentum primeiro", items: scr("pullback") },
    { id: "champs", title: "Campeões dos setores", src: "modelo mensal de entra/sai, maior nota primeiro", items: ch },
  ]; // prettier-ignore
}

/** Lentes para filtrar a tabela de Sinais de hoje (cada bloco vira um filtro, sem o limite de 20). */
export const LENS_GROUPS = [
  ["⚡ Intraday (ao vivo)", ["i-break", "i-volup", "i-cross", "i-up", "i-down", "i-voldn"]],
  ["Análises", ["q-buy", "q-sell", "propicks", "s-trend", "s-pull", "champs"]],
];
const LENS_LABEL = { "i-break": "Rompendo a máxima de 52 semanas", "i-volup": "Volume anormal em alta", "i-cross": "Cruzou a MM200 para cima hoje", "i-up": "Altas fortes do dia (> 4%)", "i-down": "Quedas fortes do dia (> 4%)", "i-voldn": "Volume anormal em queda", "q-buy": "Quant Aberto: Compra forte", "q-sell": "Quant Aberto: Venda forte", propicks: "ProPicks aberto: Top 20 do mês", "s-trend": "Screener: tendência de alta", "s-pull": "Screener: recuo em tendência de alta", champs: "Campeões dos setores" }; // prettier-ignore
export const lensLabel = (id) => LENS_LABEL[id] ?? id;

/**
 * { id: { rank: Map(sym → posição), src } } de todas as lentes, sem limite. Varre o universo inteiro (~12 ms), então
 * fica guardado por LENS_TTL: dentro de uma rajada de redesenhos (filtro, busca, cotações) a varredura roda 1 vez.
 */
const LENS_TTL = 5_000;
let lensMemo = { at: 0, v: null };
export function lenses(now = Date.now()) {
  if (lensMemo.v && now - lensMemo.at < LENS_TTL) return lensMemo.v;
  const out = {};
  for (const b of oppBlocks({ limit: Infinity }))
    if (LENS_LABEL[b.id])
      out[b.id] = { rank: new Map(b.items.map((x, i) => [x.sym, i])), src: b.src };
  lensMemo = { at: now, v: out };
  return out;
}
