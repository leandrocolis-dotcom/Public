// Alertas de nível para ativos da CARTEIRA: preço chegando perto da resistência, do suporte ou do stop da escala
// da "Decisão do trader". Cada alerta diz a ação (ampliar/reduzir, parcial/total), a chance histórica de
// romper/segurar naquele ativo (backtest) e o pano de fundo de médio prazo ("carrego": fundamentos + mercado).
// Regras conservadoras (piloto): o médio prazo negativo veta ampliar; o médio prazo forte só permite redução parcial.

import { decSep } from "./format.js";
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pc0 = (x) => `${Math.round(x * 100)}%`;
const n2 = (x) => x.toFixed(2).replace(".", decSep());
const pc1 = (x) => `${(Math.abs(x) * 100).toFixed(1).replace(".", decSep())}%`;

/** Proximidade: até 0,5 ATR do nível (ou 1% quando não há ATR). */
export const NEAR_ATR = 0.5;
/** Mínimo de casos parecidos para o backtest mudar a ação (abaixo disso: só manter e observar). */
export const MIN_N = 10;

/**
 * Backtest no próprio ativo: nos dias em que o fechamento ficou a até 0,5 ATR ABAIXO da máxima de 20 dias
 * (resistência) ou ACIMA da mínima de 20 dias (suporte), com a mesma tendência (lado da média de 50), quantas
 * vezes rompeu (fechou acima da máxima) ou segurou (não fechou abaixo da mínima − 0,25 ATR) em 5 pregões.
 */
export function levelOdds(bars, kind, { horizon = 5, look = 20 } = {}) {
  const c = bars?.c ?? [];
  const h = bars?.h ?? c;
  const l = bars?.l ?? c;
  if (c.length < 80) return null;
  const tr = c.map((x, i) => (i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i])); // prettier-ignore
  const atrAt = (i) => avg(tr.slice(i - 13, i + 1));
  const smaAt = (i) => avg(c.slice(i - 49, i + 1));
  const last = c.length - 1;
  const upNow = c[last] > smaAt(last);
  let n = 0;
  let ok = 0;
  for (let i = 60; i < last - horizon; i++) {
    if (c[i] > smaAt(i) !== upNow) continue;
    const a = atrAt(i);
    if (kind === "res") {
      const lvl = Math.max(...h.slice(i - look, i));
      if (!(c[i] < lvl && lvl - c[i] <= NEAR_ATR * a)) continue;
      n++;
      if (c.slice(i + 1, i + 1 + horizon).some((x) => x > lvl)) ok++;
    } else {
      const lvl = Math.min(...l.slice(i - look, i));
      if (!(c[i] > lvl && c[i] - lvl <= NEAR_ATR * a)) continue;
      n++;
      if (!c.slice(i + 1, i + 1 + horizon).some((x) => x < lvl - 0.25 * a)) ok++;
    }
  }
  return n ? { n, p: ok / n, conf: n >= 20 ? "Alta" : n >= 10 ? "Média" : "Baixa", trend: upNow ? "alta" : "baixa" } : null; // prettier-ignore
}

/** Médio prazo ("carrego"): fundamentos + momento de mercado da decisão, de −1 a +1. */
export function mediumTerm(dec) {
  const s = [dec?.subs?.fund, dec?.subs?.market].filter(Boolean);
  if (!s.length) return { dir: 0, label: "sem dados de médio prazo" };
  const dir = avg(s.map((x) => x.dir));
  return { dir, label: dir >= 0.25 ? "médio prazo favorável" : dir <= -0.25 ? "médio prazo desfavorável" : "médio prazo neutro" }; // prettier-ignore
}

/** Tamanho da ação pela confiança: alta 50%, média 25%, baixa só observar. */
const size = (conf) => (conf === "Alta" ? "50%" : conf === "Média" ? "25%" : null);

/**
 * Alerta para um ativo da carteira (ou null). r = analyzeTicker(...), dec = traderDecision(r, ...),
 * price = último preço (ao vivo), hold = { qty } (só alerta quem tem posição).
 */
export function levelAlert(r, dec, opts = {}) {
  const a = levelAlertCore(r, dec, opts);
  // vantagem (assets/edge.js): regime contra ou produto com decaimento = compras com metade do tamanho
  if (a && a.tone === "buy" && dec.edge?.sizeMult < 1)
    return { ...a, action: `${a.action} (metade do tamanho: contexto contra)`, why: `${a.why} ${dec.edge.flags.find((f) => f.ok === false)?.text ?? ""}.` }; // prettier-ignore
  return a;
}

function levelAlertCore(r, dec, { price = r?.price, hold } = {}) {
  if (!r || !dec?.final || !(price > 0) || !(hold?.qty > 0)) return null;
  const t = r.pillars?.tech ?? {};
  const atr = t.atr > 0 ? t.atr : price * 0.02;
  const near = NEAR_ATR * atr;
  const res = (t.levels?.resistances ?? []).map((x) => x.price).filter((p) => p > price).sort((a, b) => a - b)[0]; // prettier-ignore
  const sup = (t.levels?.supports ?? []).map((x) => x.price).filter((p) => p < price).sort((a, b) => b - a)[0]; // prettier-ignore
  const stop = dec.ladder?.find((z) => z.kind === "stop")?.to;
  const mt = mediumTerm(dec);
  const f = dec.final;
  const base = { sym: r.sym, price, mt, decision: f.step.label, conf: f.conf };

  // 1) stop: perdeu os suportes. Encostando ainda não é venda: é "não comprar mais" + gatilho no fechamento.
  if (Number.isFinite(stop) && price <= stop + near) {
    const below = price < stop;
    const total = mt.dir < 0.25; // médio prazo forte segura metade da posição
    const cut = total ? "vender tudo (zerar)" : "vender 50%";
    const dist = pc1(price / stop - 1);
    return {
      ...base,
      zone: "stop",
      level: stop,
      tone: below ? "sell" : "wait",
      action: below ? `Agora: ${cut}` : "Agora: segurar, sem comprar mais",
      trigger: below ? null : `Se fechar abaixo de ${n2(stop)}: ${cut}`,
      headline: below ? `Perdeu o stop ${n2(stop)}` : `A ${dist} do stop ${n2(stop)}`,
      why: `${below ? "Fechou abaixo do stop da escala: a tese de curto prazo falhou" : "Preço a menos de 0,5 ATR do stop da escala. Ainda não perdeu: a venda só vale se fechar abaixo dele"}. ${mt.label}${total ? "" : ": por isso só metade"}.`,
    };
  }
  // 2) resistência: rompe ou trava?
  if (Number.isFinite(res) && res - price <= near) {
    const odds = levelOdds(r.bars, "res");
    const p = odds?.n >= MIN_N ? odds.p : null; // amostra pequena não decide
    const st = odds ? `${odds.n < MIN_N ? "amostra pequena (não decide): " : ""}rompeu em ${pc0(p)} de ${odds.n} casos parecidos neste ativo (tendência de ${odds.trend}, 5 pregões)` : "sem histórico suficiente"; // prettier-ignore
    let action;
    let trigger = null;
    let tone = "wait";
    if (p !== null && p >= 0.55 && f.step.tone === "buy" && mt.dir >= 0 && size(odds.conf)) {
      action = "Agora: segurar e esperar o rompimento";
      trigger = `Se fechar acima de ${n2(res)}: ampliar ${size(f.conf === "Alta" && odds.conf === "Alta" ? "Alta" : "Média")}`;
      tone = "buy";
    } else if (p !== null && p <= 0.4 && f.step.tone !== "buy") {
      action = `Agora: vender ${mt.dir >= 0.25 ? "25%" : "50%"} (realizar)`;
      tone = "sell";
    } else {
      action = "Agora: segurar, sem comprar mais";
      trigger = `Só ampliar se fechar acima de ${n2(res)}`;
    }
    return { ...base, zone: "res", level: res, tone, odds, action, trigger, headline: `Perto da resistência ${n2(res)}`, why: `${st}. Decisão: ${f.step.label} (${f.conf}); ${mt.label}.${mt.dir < 0 && tone !== "sell" ? " Médio prazo negativo veta ampliar." : ""}` }; // prettier-ignore
  }
  // 3) suporte: segura ou perde?
  if (Number.isFinite(sup) && price - sup <= near) {
    const odds = levelOdds(r.bars, "sup");
    const p = odds?.n >= MIN_N ? odds.p : null; // amostra pequena não decide
    const st = odds ? `${odds.n < MIN_N ? "amostra pequena (não decide): " : ""}segurou em ${pc0(p)} de ${odds.n} casos parecidos neste ativo (tendência de ${odds.trend}, 5 pregões)` : "sem histórico suficiente"; // prettier-ignore
    let action;
    let trigger;
    let tone = "wait";
    if (p !== null && p >= 0.6 && f.step.tone !== "sell" && mt.dir >= 0 && size(odds.conf)) {
      action = "Agora: ampliar 25% no suporte";
      trigger = `Se fechar abaixo de ${n2(sup - 0.25 * atr)}: desfazer a compra`;
      tone = "buy";
    } else if (p !== null && p < 0.45) {
      action = "Agora: segurar, sem comprar mais (suporte fraco)";
      trigger = `Se fechar abaixo de ${n2(sup)}: vender ${mt.dir >= 0.25 ? "25%" : "50%"}`;
    } else {
      action = "Agora: segurar";
      trigger = `Se fechar abaixo de ${n2(sup)}: vender 25%`;
    }
    return { ...base, zone: "sup", level: sup, tone, odds, action, trigger, headline: `Perto do suporte ${n2(sup)}`, why: `${st}. Decisão: ${f.step.label} (${f.conf}); ${mt.label}.${mt.dir < 0 && tone !== "sell" ? " Médio prazo negativo veta ampliar." : ""}` }; // prettier-ignore
  }
  return null;
}

/** Sem posição não existe segurar nem vender: traduz para comprar / esperar / evitar, com o gatilho. */
export function noPosAlert(a) {
  const lv = a.level.toFixed(2).replace(".", decSep());
  if (a.zone === "stop")
    return { ...a, tone: "sell", action: "Agora: não comprar (no stop)", trigger: null };
  if (a.tone === "sell") return { ...a, action: "Agora: não comprar", trigger: null };
  if (a.zone === "res") return { ...a, action: "Agora: esperar", trigger: a.tone === "buy" ? `Se fechar acima de ${lv}: comprar em partes` : `Só comprar se fechar acima de ${lv}` }; // prettier-ignore
  if (a.tone === "buy") return { ...a, action: "Agora: comprar em partes no suporte", trigger: a.trigger?.replace("desfazer a compra", "sair") }; // prettier-ignore
  return { ...a, action: "Agora: esperar", trigger: `Comprar só se segurar acima de ${lv}` };
}

/** Texto curto para notificação. */
export function levelText(a) {
  return {
    title: `${a.tone === "buy" ? "🟢" : a.tone === "sell" ? "🔴" : "🟡"} ${a.sym} · ${a.headline}`,
    body: `${a.action}.${a.trigger ? ` ${a.trigger}.` : ""} ${a.why} Preço ${n2(a.price)}. Educacional; não é recomendação.`,
  };
}
