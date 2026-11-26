// Decisão do trader (aba Análise, detalhe do ativo): junta técnico, fundamentos, momento de mercado e o histórico de
// situações parecidas, cada um com direção (−1 vender … +1 comprar) e confiança, numa escala com níveis de preço.
// Funções puras e testadas (tests/decision.test.js). Material educacional; não é recomendação de investimento.

import { decSep } from "./format.js";
import { backtestDaily, prepareDaily } from "./ta-signals.js";
import { GRADE_TXT, edgeOf, regimeOf } from "./edge.js";
import { etfClass, leverageOf } from "./etf-fund.js";

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const pc = (x, d = 1) =>
  `${x >= 0 ? "+" : "−"}${Math.abs(x * 100)
    .toFixed(d)
    .replace(".", decSep())}%`;
const sma = (c, i, w) => (i + 1 >= w ? avg(c.slice(i + 1 - w, i + 1)) : null);

export const CONF_W = { Alta: 1, Média: 0.6, Baixa: 0.3 };
/** Peso de cada sub-análise na decisão (antes da confiança). */
// Momentum 12-1 (F9) foi testado como 5ª parte com peso 20% e revertido: piorou as compras no estudo de 10 anos
// (docs/estudo-conclusoes.md). Segue calculado e exibido só como informação (fora da combinação).
export const SUB_W = { tech: 0.35, fund: 0.25, market: 0.2, history: 0.2 };
// Quant Aberto (notas estilo Seeking Alpha, só S&P 500): 5ª parte da decisão AO VIVO, por ordem do usuário (12/10/2026).
// Fica fora de SUB_W de propósito: o Simulador e o aprendizado (modo sombra) seguem medindo as 4 partes originais.
// Peso relativo 0,15 (a soma é normalizada pela confiança de cada parte presente; sem nota, não pesa).
export const EXTRA_W = { quant: 0.15 };
export const SUB_LABEL = {
  quant: "Quant Aberto (S&P 500)",
  tech: "Técnica",
  trend: "Momentum de 12 meses",
  fund: "Fundamentalista",
  market: "Momento de mercado",
  history: "Situações parecidas (backtest)",
};

const dirLabel = (d) =>
  d >= 0.35 ? "Favorece comprar" : d >= 0.12 ? "Leve viés de alta" : d > -0.12 ? "Neutro" : d > -0.35 ? "Leve viés de baixa" : "Favorece vender"; // prettier-ignore

function rsiAt(c, i, n = 14) {
  if (i < n) return null;
  let g = 0;
  let l = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const d = c[k] - c[k - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

/** Retrato do ativo no dia i: lado da tendência, RSI e o retorno de 20 dias em desvios (z). */
export function stateAt(c, i) {
  if (i < 200) return null;
  const ma50 = sma(c, i, 50);
  const ma200 = sma(c, i, 200);
  const rets = [];
  for (let k = i - 59; k <= i; k++) rets.push(Math.log(c[k] / c[k - 1]));
  const m = avg(rets);
  const vol = Math.sqrt(avg(rets.map((r) => (r - m) ** 2)));
  const r20 = c[i] / c[i - 20] - 1;
  return {
    up: c[i] > ma200,
    ma: ma50 > ma200,
    rsi: rsiAt(c, i),
    z20: vol > 0 ? Math.log(1 + r20) / (vol * Math.sqrt(20)) : 0,
  };
}

/**
 * Backtest de situações parecidas no próprio histórico: mesmos lados das médias (preço × MM200, MM50 × MM200),
 * RSI a ±8 e retorno de 20 dias a ±0,75σ. Dias não sobrepostos (um a cada 5). Compara com a média de qualquer dia.
 */
export function similarSituations(c, { horizons = [5, 20] } = {}) {
  const n = c?.length ?? 0;
  const now = stateAt(c, n - 1);
  if (!now) return null;
  const H = Math.max(...horizons);
  const hits = [];
  const base = Object.fromEntries(horizons.map((h) => [h, []]));
  let skip = -1;
  for (let i = 200; i < n - 1 - H; i++) {
    for (const h of horizons) base[h].push(c[i + h] / c[i] - 1);
    if (i <= skip) continue;
    const s = stateAt(c, i);
    if (!s || s.up !== now.up || s.ma !== now.ma) continue;
    if (Math.abs(s.rsi - now.rsi) > 8 || Math.abs(s.z20 - now.z20) > 0.75) continue;
    hits.push(i);
    skip = i + 4;
  }
  const out = { n: hits.length, now, by: {} };
  for (const h of horizons) {
    const f = hits.map((i) => c[i + h] / c[i] - 1);
    out.by[h] = {
      avg: avg(f),
      hit: f.length ? f.filter((x) => x > 0).length / f.length : null,
      base: avg(base[h]),
    };
  }
  return out;
}

const confOfN = (n) => (n >= 20 ? "Alta" : n >= 10 ? "Média" : "Baixa");
const confNorm = (x) => ({ alta: "Alta", média: "Média", media: "Média", baixa: "Baixa" })[String(x ?? "").toLowerCase()] ?? "Baixa"; // prettier-ignore

/**
 * Técnica: placar gráfico (−100..+100) + momentum (0..100). Sinal de CURTO prazo: na validação fora da amostra
 * (47 ETFs, 2024-2026) a leitura de compra rendeu +0,58% em 5 dias contra +0,38% da base, mas não ajudou em 20 dias.
 */
export function techSub(tech, mom) {
  if (!Number.isFinite(tech?.raw) && !Number.isFinite(mom?.score)) return null;
  const parts = [];
  if (Number.isFinite(tech?.raw)) parts.push(tech.raw / 100);
  if (Number.isFinite(mom?.score)) parts.push((mom.score - 50) / 50);
  const dir = clamp(avg(parts));
  const agree = parts.length === 2 && Math.sign(parts[0]) === Math.sign(parts[1]);
  let conf = confNorm(tech?.confidence);
  if (parts.length === 2 && !agree) conf = "Baixa";
  else if (agree && conf === "Baixa" && Math.abs(dir) > 0.3) conf = "Média";
  const txt = [
    Number.isFinite(tech?.raw)
      ? `gráfico ${tech.raw > 0 ? "+" : ""}${tech.raw} (${tech.verdict})`
      : null,
    Number.isFinite(mom?.score) ? `momentum ${Math.round(mom.score)}/100` : null,
  ].filter(Boolean);
  return {
    dir,
    conf,
    text: `${txt.join(" e ")}${parts.length === 2 ? (agree ? ": os dois apontam o mesmo lado." : ": gráfico e momentum discordam.") : "."} Vale para os próximos dias (até ~1 semana), não para meses.`,
  };
}

/**
 * Quant Aberto: nota 1–5 do modelo estilo Seeking Alpha (assets/quant.js). dir = (nota − 3) ÷ 2, de −1 a +1.
 * Confiança média: o diário fora da amostra ainda está em observação (até out/2027). Nota com fator desqualificante
 * (capped) entra com confiança baixa. Sem nota (fora do S&P 500): null, não pesa.
 */
export function quantSub(row, ratingLabel = null) {
  if (!row || !Number.isFinite(row.score)) return null;
  const dir = clamp((row.score - 3) / 2);
  return {
    dir,
    conf: row.capped ? "Baixa" : "Média",
    text: `nota ${row.score.toFixed(2).replace(".", decSep())}/5${ratingLabel ? ` (${ratingLabel})` : ""}${row.capped ? ", com fator desqualificante (teto em Manter)" : ""}. Parte do valor, rentabilidade e crescimento também está em Fundamentalista: o Quant soma momentum e revisões de analistas.`,
  };
}

/** Fundamentalista: fundamentos (0..100) + analistas (0..100). Sem dados: null (não pesa). */
export function fundSub(fund, analyst, f) {
  const parts = [];
  if (Number.isFinite(fund?.score)) parts.push({ v: (fund.score - 50) / 50, w: 0.75 });
  if (Number.isFinite(analyst?.score)) parts.push({ v: (analyst.score - 50) / 50, w: 0.25 });
  if (!parts.length) return null;
  const ws = parts.reduce((a, p) => a + p.w, 0);
  const dir = clamp(parts.reduce((a, p) => a + p.v * p.w, 0) / ws);
  const isEtf = f?.type === "ETF" || f?.type === "MUTUALFUND";
  const full = fund?.parts ? Object.values(fund.parts).filter(Number.isFinite).length : 0;
  const conf = isEtf
    ? (fund?.conf ?? "Média")
    : full >= 3 && parts.length === 2
      ? "Alta"
      : full >= 2
        ? "Média"
        : "Baixa";
  const bits = [
    Number.isFinite(fund?.score) ? `fundamentos ${Math.round(fund.score)}/100` : null,
    Number.isFinite(analyst?.score) ? `analistas ${Math.round(analyst.score)}/100${Number.isFinite(analyst.upside) ? ` (alvo ${pc(analyst.upside, 0)})` : ""}` : null,
  ].filter(Boolean); // prettier-ignore
  return {
    dir,
    conf,
    text: `${bits.join(" e ")}${isEtf && fund?.basis ? ` · ETF: ${fund.basis}.` : "."}`,
  };
}

/**
 * Momento de mercado: regime do app (risco, dólar, juros, commodities, curva), tendência do S&P 500 e força relativa
 * do ativo contra o S&P nos últimos 3 meses; beta alto amplifica (ativo sofre mais no risk-off).
 */
export function marketSub({ regime, spy, asset, beta }) {
  const parts = [];
  const bits = [];
  if (regime && Object.keys(regime).length) {
    const vals = Object.values(regime);
    const good = vals.filter((x) => x.tone === "good").length;
    const bad = vals.filter((x) => x.tone === "bad").length;
    parts.push((good - bad) / vals.length);
    bits.push(`regime: ${vals.map((x) => x.label.toLowerCase()).join(", ")}`);
  }
  if (spy?.length > 200) {
    const i = spy.length - 1;
    const upT = spy[i] > sma(spy, i, 200);
    const r1m = spy[i] / spy[i - 21] - 1;
    parts.push((upT ? 0.5 : -0.5) + clamp(r1m / 0.06, -0.5, 0.5));
    bits.push(`S&P 500 ${upT ? "acima" : "abaixo"} da média de 200 dias, ${pc(r1m)} em 1 mês`);
    if (asset?.length > 63) {
      const rel = asset.at(-1) / asset.at(-64) - spy[i] / spy[i - 63];
      parts.push(clamp(rel / 0.1));
      bits.push(
        `ativo ${rel >= 0 ? "mais forte" : "mais fraco"} que o S&P em 3 meses (${pc(rel)})`,
      );
    }
  }
  if (!parts.length) return null;
  let dir = clamp(avg(parts));
  if (beta > 1.3 && dir < 0) dir = clamp(dir * Math.min(beta, 2)); // beta alto: o mercado ruim pesa mais
  const signs = parts.filter((x) => Math.abs(x) > 0.1).map(Math.sign);
  const agree = signs.length && signs.every((s) => s === signs[0]);
  const conf = parts.length >= 3 && agree ? "Alta" : parts.length >= 2 && (agree || Math.abs(dir) > 0.3) ? "Média" : "Baixa"; // prettier-ignore
  return {
    dir,
    conf,
    text: `${bits.join("; ")}${beta > 1.3 ? `; beta ${beta.toFixed(1).replace(".", decSep())} (oscila mais que o mercado)` : ""}.`,
  };
}

/**
 * Momentum de série temporal (Moskowitz, Ooi e Pedersen; Jegadeesh e Titman): retorno de 12 meses sem o último mês.
 * dir = m12 ÷ 20% (limitado a ±1); confiança alta quando 6 e 12 meses concordam e |m12| ≥ 10%.
 */
export function trendSub(c) {
  const n = c?.length ?? 0;
  if (n < 253 || !(c[n - 253] > 0) || !(c[n - 127] > 0)) return null;
  const m12 = c[n - 22] / c[n - 253] - 1;
  const m6 = c[n - 22] / c[n - 127] - 1;
  const agree = Math.sign(m12) === Math.sign(m6);
  return {
    dir: clamp(m12 / 0.2),
    conf: agree && Math.abs(m12) >= 0.1 ? "Alta" : agree ? "Média" : "Baixa",
    m12,
    text: `12 meses sem o último: ${pc(m12)}; 6 meses: ${pc(m6)}${agree ? "" : " (sentidos opostos)"}. ${m12 > 0 ? "Tendência de alta" : "Tendência de baixa"}: quem vem subindo tende a seguir subindo (a estratégia técnica com mais evidência).`,
  };
}

/**
 * Situações parecidas: excesso de retorno em 20 dias contra um dia qualquer, com a taxa de acerto.
 * Validação fora da amostra (47 ETFs, 2022-2026, só com o passado disponível em cada data): leitura favorável
 * rendeu +2,5% em 20 dias contra +1,1% da base; leitura desfavorável rendeu +1,5% (NÃO antecipou queda). Por isso a
 * leitura negativa entra sempre com confiança baixa.
 */
export function historySub(sim) {
  if (!sim || sim.n < 3) return sim ? { dir: 0, conf: "Baixa", n: sim.n, text: `só ${sim.n} situação(ões) parecida(s) no histórico: amostra pequena demais.` } : null; // prettier-ignore
  const b = sim.by[20];
  const ex = b.avg - b.base;
  const dir = clamp(ex / 0.04);
  const neg = dir < -0.12;
  return {
    dir,
    conf: neg ? "Baixa" : confOfN(sim.n),
    n: sim.n,
    text: `${sim.n} situações parecidas em ~2 anos: em 20 dias ${b.hit >= 0.5 ? "subiu" : "caiu"} em ${Math.round((b.hit >= 0.5 ? b.hit : 1 - b.hit) * 100)}% delas, média ${pc(b.avg)} (dia qualquer ${pc(b.base)}); em 5 dias ${pc(sim.by[5].avg)}.${neg ? " Leitura negativa do histórico não antecipou quedas na validação: peso baixo." : ""}`,
  };
}

export const DECISION = [
  { min: 0.35, key: "buy", label: "Comprar", tone: "buy" },
  { min: 0.12, key: "buy-part", label: "Comprar em partes", tone: "buy" },
  { min: -0.12, key: "wait", label: "Aguardar", tone: "wait" },
  { min: -0.35, key: "reduce", label: "Reduzir", tone: "sell" },
  { min: -Infinity, key: "sell", label: "Vender / evitar", tone: "sell" },
];

/** Combina as sub-análises (peso × confiança). Discordância forte rebaixa a confiança final.
 * W = pesos de cada sub-análise (padrão SUB_W; o modelo em treino do Simulador passa os pesos aprendidos). */
export function combine(subs, W = SUB_W) {
  let acc = 0;
  let ws = 0;
  for (const [k, s] of Object.entries(subs)) {
    if (!s) continue;
    const w = (W[k] ?? SUB_W[k] ?? EXTRA_W[k] ?? 0) * CONF_W[s.conf];
    acc += s.dir * w;
    ws += w;
  }
  if (!ws) return null;
  const score = acc / ws;
  const present = Object.values(subs).filter(Boolean);
  const strong = present.filter((s) => Math.abs(s.dir) >= 0.3 && s.conf !== "Baixa");
  const conflict = strong.some((s) => s.dir > 0) && strong.some((s) => s.dir < 0);
  const avgConf = avg(present.map((s) => CONF_W[s.conf]));
  const conf =
    conflict || present.length < 3
      ? "Baixa"
      : avgConf >= 0.8
        ? "Alta"
        : avgConf >= 0.5
          ? "Média"
          : "Baixa";
  return { score, conf, conflict, step: DECISION.find((d) => score >= d.min) };
}

/**
 * Escala de preço: zonas a partir de suportes/resistências e do ATR, do preço mais alto para o mais baixo.
 * É a FONTE ÚNICA da ação de agora: cada zona traz `act` (a decisão para quem não tem o ativo) e o rótulo usa o
 * mesmo vocabulário da lista (Comprar, Comprar em partes, Esperar rompimento, Ficar de fora, Não comprar).
 * step = passo da decisão (DECISION) ou, na falta, só o tom ("buy" | "wait" | "sell").
 */
export function priceLadder({ price, levels, atr, plan, tone = "wait", step = null }) {
  if (!(price > 0)) return [];
  const a = atr > 0 ? atr : price * 0.02;
  const key = step?.key ?? (tone === "buy" ? "buy" : tone === "sell" ? "sell" : "wait");
  const t = step?.tone ?? tone;
  const sup = (levels?.supports ?? []).map((x) => x.price).filter((p) => p < price).sort((x, y) => y - x); // prettier-ignore
  const res = (levels?.resistances ?? []).map((x) => x.price).filter((p) => p > price).sort((x, y) => x - y); // prettier-ignore
  const s1 = sup[0] ?? price - 1.5 * a;
  const s2 = sup[1] ?? s1 - 1.5 * a;
  const r1 = res[0] ?? price + 2 * a;
  const r2 = res[1] ?? r1 + 2 * a;
  const stop = plan?.dir > 0 && plan.stop < price ? plan.stop : s2 - 0.5 * a;
  const lo = s1 + 0.5 * a; // topo da zona de compra
  const brk = Math.max(lo, r1 - a); // a até 1 ATR da resistência: esperar o rompimento
  const buyAct = key === "buy-part" ? "buy-part" : "buy";
  const buyLbl = key === "buy-part" ? "Comprar em partes (metade agora)" : "Comprar";
  let z;
  if (t === "sell")
    z = [
      { kind: "sell", act: "no-buy", label: "Não comprar · com posição: vender", from: r2, to: null, note: "acima da 2ª resistência" },
      { kind: "sell", act: "no-buy", label: "Não comprar · com posição: vender nos repiques", from: r1, to: r2, note: "1ª resistência: costuma travar a alta" },
      { kind: "sell", act: "no-buy", label: "Não comprar · com posição: reduzir", from: s1 + 0.5 * a, to: r1, note: "decisão de venda: aproveite para diminuir a posição" },
      { kind: "wait", act: "no-buy", zone: true, label: "Não comprar (repique só para operação curta)", from: s1 - 0.5 * a, to: s1 + 0.5 * a, note: "suporte: contra a decisão" },
      { kind: "wait", act: "no-buy", label: "Não comprar (suporte final)", from: s2, to: s1 - 0.5 * a, note: "2º suporte" },
    ];
  else if (t === "buy")
    z = [
      { kind: "sell", act: "wait-break", label: "Não perseguir · com posição: realizar forte", from: r2, to: null, note: "acima da 2ª resistência" },
      { kind: "sell", act: "wait-break", label: "Não perseguir · com posição: realizar parte", from: r1, to: r2, note: "1ª resistência: costuma travar a alta" },
      { kind: "wait", act: "wait-break", label: "Esperar rompimento", from: brk, to: r1, note: `colado na resistência: comprar se fechar acima de ${f2(r1)}` },
      { kind: "buy", act: buyAct, label: buyLbl, from: lo, to: brk, note: key === "buy-part" ? "metade agora; o resto na zona de compra" : "posição inteira, com stop" },
      { kind: "buy", act: buyAct, zone: true, label: key === "buy-part" ? "Zona de compra (comprar em partes)" : "Zona de compra", from: s1 - 0.5 * a, to: lo, note: "perto do suporte, stop curto" },
      { kind: "buy", act: buyAct, label: "Compra agressiva (se o suporte segurar)", from: s2, to: s1 - 0.5 * a, note: "2º suporte" },
    ];
  else
    z = [
      { kind: "sell", act: "stay-out", label: "Ficar de fora · com posição: realizar forte", from: r2, to: null, note: "acima da 2ª resistência" },
      { kind: "sell", act: "stay-out", label: "Ficar de fora · com posição: realizar parte", from: r1, to: r2, note: "1ª resistência: costuma travar a alta" },
      { kind: "wait", act: "stay-out", label: "Ficar de fora · com posição: manter", from: lo, to: r1, note: "sem vantagem clara agora" },
      { kind: "wait", act: "stay-out", zone: true, label: "Ficar de fora (reavaliar no suporte)", from: s1 - 0.5 * a, to: lo, note: "suporte: só vira compra se a decisão mudar" },
      { kind: "wait", act: "stay-out", label: "Ficar de fora (suporte final)", from: s2, to: s1 - 0.5 * a, note: "2º suporte" },
    ]; // prettier-ignore
  z.push({ kind: "stop", act: "no-buy", label: "Sair (stop)", from: null, to: stop, note: "perdeu os suportes: a ideia falhou" }); // prettier-ignore
  return z
    .filter((x) => x.to === null || x.from === null || x.to > x.from)
    .map((x) => ({ ...x, here: (x.from === null || price >= x.from) && (x.to === null || price < x.to) })); // prettier-ignore
}

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace(".", decSep()) : "–");

const ACT = {
  buy: { label: "Comprar", tone: "buy" },
  "buy-part": { label: "Comprar em partes", tone: "buy" },
  "wait-break": { label: "Esperar rompimento", tone: "wait" },
  "stay-out": { label: "Ficar de fora", tone: "wait" },
  "no-buy": { label: "Não comprar", tone: "sell" },
};

/**
 * O que fazer AGORA = a zona da escala onde o preço está (mesma fonte da escala mostrada no detalhe), num vocabulário
 * fechado: Comprar · Comprar em partes · Esperar rompimento · Ficar de fora · Não comprar. Com posição, holdNow()
 * traduz para Ampliar / Manter / Reduzir / Vender. Base nos estudos do app: esperar recuo para entrar NÃO ajudou entre
 * os mais fortes (docs/ESTUDO-MOMENTUM-UNIVERSO.md), então a compra não é adiada no meio da faixa; só colado na
 * resistência (até 1 ATR) espera o rompimento. Comprar em partes foi positivo em ações (docs/ESTUDO-UNIVERSO-SETORES.md).
 */
export function nowAction(final, ladder) {
  if (!final?.step) return null;
  const st = final.step;
  const L = ladder ?? [];
  const here = L.find((z) => z.here);
  const zone = L.find((z) => z.zone); // faixa do 1º suporte (zona de compra quando a decisão é comprar)
  const res = L.find((z) => z.kind === "sell" && z.to !== null);
  const stop = L.find((z) => z.kind === "stop");
  const key = here?.act ?? (st.tone === "sell" ? "no-buy" : st.tone === "wait" ? "stay-out" : st.key === "buy-part" ? "buy-part" : "buy"); // prettier-ignore
  const stopTxt = stop?.to ? `; stop ${f2(stop.to)}` : "";
  const note = {
    buy: `posição inteira${stopTxt}`,
    "buy-part": here?.kind === "buy" && /^Zona|^Compra agressiva/.test(here.label) ? `preço já na zona de compra: metade agora, metade no 2º suporte${stopTxt}` : `metade agora; o resto em ${f2(zone?.from)} – ${f2(zone?.to)}${stopTxt}`, // prettier-ignore
    "wait-break": `colado na resistência ${f2(res?.from)}: comprar se fechar acima dela${zone ? `, ou em ${f2(zone.from)} – ${f2(zone.to)}` : ""}`, // prettier-ignore
    "stay-out": res ? `sem vantagem clara agora; reavaliar acima de ${f2(res.from)} ou perto de ${f2(zone?.to)}` : "sem vantagem clara agora", // prettier-ignore
    "no-buy":
      here?.kind === "stop" ? "o preço perdeu os suportes" : "análises contra: não abrir posição",
  }[key];
  return { key, bias: st.key, ...ACT[key], note, zone: here?.label ?? null };
}

/** Com posição: a mesma decisão em verbos de quem já tem o ativo. */
export function holdNow(now) {
  if (!now) return now;
  const map = {
    buy: ["Ampliar", "buy"],
    "buy-part": ["Ampliar em partes", "buy"],
    "wait-break": ["Manter", "wait"],
    "stay-out": ["Manter", "wait"],
    "no-buy": [now.bias === "sell" ? "Vender" : "Reduzir", "sell"],
  };
  const [label, tone] = map[now.key] ?? [now.label, now.tone];
  return { ...now, label, tone, held: true };
}

const edgeMemo = new Map();
/**
 * Vantagem da decisão (assets/edge.js): expectativa em R do sinal técnico NO PRÓPRIO ATIVO (mesmo teste da aba
 * Quando entrar), regime do S&P e produtos com decaimento. Usa o histórico inteiro: só para decisões AO VIVO
 * (no Simulador e no treino do modelo seria olhar o futuro).
 */
export function decisionEdge(r, market = {}, dir = 0) {
  const b = r?.bars;
  if (!dir || !(b?.c?.length >= 260)) return null;
  const key = `${r.sym}|${b.dates?.at(-1)}|${b.c.length}`;
  let bt = edgeMemo.get(key);
  if (!bt) {
    const full = b.o?.length === b.c.length && b.h?.length === b.c.length && b.l?.length === b.c.length; // prettier-ignore
    const bars = {
      dates: b.dates ?? b.c.map((_, i) => i),
      o: full ? b.o : b.c,
      h: full ? b.h : b.c,
      l: full ? b.l : b.c,
      c: b.c,
      v: b.v?.length === b.c.length ? b.v : b.c.map(() => 0),
      closeOnly: !full,
    };
    bt = backtestDaily(prepareDaily(bars));
    if (edgeMemo.size > 300) edgeMemo.clear();
    edgeMemo.set(key, bt);
  }
  const cls = etfClass(r.fund, r.sym);
  const lev = leverageOf(r.sym, r.name);
  return edgeOf({
    dir,
    stats: dir > 0 ? bt.buyR : bt.sellR,
    regime: regimeOf(market.spy),
    group: cls === null || cls === "equity" ? "Ações EUA" : cls,
    decay: cls === "vol" || (!!lev && (lev.lev < 0 || Math.abs(lev.lev) > 1)),
  });
}

/**
 * Decisão completa. r = analyzeTicker(...) (com pillars.tech.levels/atr/confidence), market = { regime, spy }.
 * gate = true (decisões ao vivo): aplica a vantagem medida; compra/venda com expectativa negativa vira "Aguardar".
 */
export function traderDecision(r, market = {}, { weights, gate = false } = {}) {
  if (!r) return null;
  const c = r.series?.close ?? [];
  const sim = similarSituations(c);
  const subs = {
    tech: techSub(r.pillars?.tech, r.pillars?.mom),
    fund: fundSub(r.pillars?.fund, r.pillars?.analyst, r.fund),
    market: marketSub({ regime: market.regime, spy: market.spy, asset: c, beta: r.fund?.beta }),
    history: historySub(sim),
    trend: trendSub(c),
    // Quant Aberto: só nas decisões ao vivo que passam quantOf (Simulador e treino ficam com as 4 partes)
    ...(market.quantOf ? { quant: quantSub(...market.quantOf(r.sym)) } : {}),
  };
  const core = Object.fromEntries(Object.entries(subs).filter(([k]) => k !== "trend")); // momentum: só informativo
  let final = combine(core, weights);
  // "Comprar em partes / no recuo" em ETFs e fundos foi a pior decisão nos estudos de 10 anos (−0,17R a −0,28R por dia
  // em excesso em ETFs 1x e inversos). Em AÇÕES individuais funcionou (+0,08R, 220 ações; docs/ESTUDO-UNIVERSO-SETORES.md),
  // por isso a troca por "Aguardar" vale só para ETFs/fundos. Só nas decisões ao vivo (gate); Simulador e treino seguem
  // medindo a lógica original.
  const isStock = r.fund?.type === "EQUITY" && !leverageOf(r.sym, r.name);
  if (gate && final?.step.key === "buy-part" && !isStock)
    final = { ...final, rawStep: final.step, partGated: true, step: DECISION.find((d) => d.key === "wait") }; // prettier-ignore
  const t = r.pillars?.tech ?? {};
  const tone = final?.step.tone;
  const edge = gate && final ? decisionEdge(r, market, tone === "buy" ? 1 : tone === "sell" ? -1 : 0) : null; // prettier-ignore
  if (edge?.block)
    final = { ...final, rawStep: final.step, gated: true, step: DECISION.find((d) => d.key === "wait") }; // prettier-ignore
  const ladder = priceLadder({
    price: r.price,
    levels: t.levels,
    atr: t.atr,
    plan: t.plan,
    tone: final?.step.tone,
    step: final?.step,
  });
  return {
    subs,
    sim,
    final,
    ladder,
    now: nowAction(final, ladder),
    dirLabel,
    edge,
    edgeText: edge?.grade ? GRADE_TXT[edge.grade] : null,
  };
}

/**
 * Decisão a partir da varredura diária do servidor (data/market-scan.json, scripts/market-scan.mjs): a análise e a
 * combinação vêm do fechamento; a escala de preço e a ação de agora são refeitas com o preço ao vivo, iguais às do app.
 */
export function decisionFromScan(row, price = row?.p) {
  if (!row?.st) return null;
  const step = DECISION.find((d) => d.key === row.st);
  if (!step) return null;
  const final = { score: row.sc, conf: row.cf, conflict: !!row.cx, step, ...(row.gt ? { gated: true } : {}), ...(row.pg ? { partGated: true } : {}) }; // prettier-ignore
  const subs = Object.fromEntries(Object.entries(row.sub ?? {}).map(([k, [dir, conf]]) => [k, { dir, conf, text: "" }])); // prettier-ignore
  const p = price > 0 ? price : row.p;
  const ladder = priceLadder({
    price: p,
    levels: { supports: (row.lv?.s ?? []).map((x) => ({ price: x })), resistances: (row.lv?.r ?? []).map((x) => ({ price: x })) }, // prettier-ignore
    atr: row.atr,
    plan: row.stop ? { dir: 1, stop: row.stop } : null,
    tone: step.tone,
    step,
  });
  return { subs, final, ladder, now: nowAction(final, ladder), dirLabel, scan: true };
}
