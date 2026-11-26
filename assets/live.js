// Cotações ao vivo (/api/quotes) aplicadas sobre o histórico. Funções puras.
// O último pregão do histórico recebe o preço do momento; com isso momentum, RSI, z e entrada
// de cada par são recalculados ao longo do dia (o par pode perder validade no intradiário).
import { ASSETS } from "./universe.js";

const NY_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
/** Data do pregão (fuso de Nova York) de um horário Unix em segundos. */
export const nyDate = (unixSec) => NY_DATE.format(new Date(unixSec * 1000));

/** ISO em horário de Brasília (UTC−3) de um horário Unix em segundos. */
export function brtISO(unixSec) {
  return new Date(unixSec * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 19) + "-03:00";
}

/**
 * Aplica as cotações sobre uma tabela {dates, series|close, last_real, vol?}.
 * - Pregão de referência = data de NY da cotação do SPY.
 * - Se for um pregão novo, acrescenta uma linha (repetindo o último preço de quem não tem cotação).
 * - Cotação com data anterior ao pregão de referência não é aplicada (o ativo fica defasado).
 * @param key "series" (prices.json) ou "close" (flow.json)
 * @param symOf função código -> símbolo Yahoo
 */
// Fatores comuns de desdobramento (split) e grupamento (reverse split).
const SPLIT_FACTORS = [2, 3, 4, 5, 8, 10, 15, 20, 25, 50].flatMap((f) => [f, 1 / f]);

/**
 * Desdobramento/grupamento ainda não refletido no histórico: o fechamento anterior informado pela cotação
 * difere do último fechamento da base por um fator típico (2, 3, 1/2…). Ex.: ETHA (grupamento 3:1).
 * Devolve o fator (multiplicar a base) ou null.
 */
export function splitFactor(pc, ref) {
  if (!(pc > 0) || !(ref > 0)) return null;
  const r = pc / ref;
  if (r > 0.6 && r < 1.7) return null;
  const f = SPLIT_FACTORS.find((x) => Math.abs(r / x - 1) < 0.04);
  return f ?? null;
}

/**
 * Reescala a série para a escala nova. Anda do fim para o começo e multiplica cada ponto que fica mais
 * perto do vizinho seguinte (já ajustado) depois de multiplicado: trata linhas mistas que o Yahoo às vezes
 * devolve perto da data do evento.
 */
export function rescale(s, f, upto = s.length - 1) {
  for (let i = upto - 1; i >= 0; i--) {
    const next = s[i + 1];
    if (Math.abs(Math.log((s[i] * f) / next)) < Math.abs(Math.log(s[i] / next))) s[i] *= f;
  }
  return s;
}

function overlay(table, live, key, symOf) {
  const spy = live?.quotes?.SPY;
  if (!spy) return { table, applied: [], session: null, adjusted: [] };
  const session = nyDate(spy.t);
  const last = table.dates[table.dates.length - 1];
  if (session < last) return { table, applied: [], session, adjusted: [] };
  const out = structuredClone(table);
  const append = session > last;
  if (append) {
    out.dates.push(session);
    for (const s of Object.values(out[key])) s.push(s[s.length - 1]);
    for (const v of Object.values(out.vol ?? {})) v.push(0);
  }
  const applied = [];
  const adjusted = [];
  const fixedPrev = [];
  for (const code of Object.keys(out[key])) {
    const q = live.quotes[symOf(code)];
    if (!q || !(q.p > 0) || nyDate(q.t) < session) continue;
    const s = out[key][code];
    const f = splitFactor(q.pc, s[s.length - 2]);
    if (f) {
      s[s.length - 2] = q.pc; // fechamento anterior oficial, já na escala nova
      rescale(s, f, s.length - 2);
      if (out.vol?.[code]) out.vol[code] = out.vol[code].map((v) => v / f);
      adjusted.push({ code, factor: f });
    }
    s[s.length - 1] = q.p;
    // fechamento anterior = o oficial da cotação: a variação do dia da tabela é a mesma do painel do ativo e da
    // carteira (preço ÷ fechamento anterior). Corrige a base quando ela traz outro valor no lugar (futuro gravado
    // com o preço da sessão da noite, ajuste de dividendo no dia "ex"). Diferença absurda (> 25%) não mexe.
    if (!f && q.pc > 0 && s.length > 1 && Math.abs(q.pc / s[s.length - 2] - 1) < 0.25) {
      if (s[s.length - 2] !== q.pc) fixedPrev.push({ code, from: s[s.length - 2], to: q.pc });
      s[s.length - 2] = q.pc;
    }
    if (out.vol?.[code] && q.v > 0) out.vol[code][out.vol[code].length - 1] = q.v;
    applied.push(code);
  }
  // uma cópia só no fim (antes: um objeto novo por ativo, custo quadrático no número de ativos)
  if (applied.length) {
    out.last_real = { ...out.last_real };
    for (const code of applied) out.last_real[code] = session;
  }
  return { table: out, applied, session, adjusted, fixedPrev };
}

/** prices.json do Pêndulo + cotações ao vivo. Atualiza meta com o horário da cotação do SPY. */
export function applyLiveToPrices(prices, live) {
  const r = overlay(prices, live, "series", (c) => ASSETS[c]?.yahoo ?? c);
  if (!r.applied.length) return r;
  const spy = live.quotes.SPY;
  r.table.meta = {
    updated_at_brt: brtISO(spy.t),
    market_status: spy.ms === "REGULAR" ? "Intradiário" : "Fechamento",
    source: "Yahoo Finance (ao vivo)",
  };
  return r;
}

/** flow.json + cotações ao vivo (códigos já são símbolos Yahoo). */
export const applyLiveToFlow = (flow, live) => overlay(flow, live, "close", (s) => s);

// Agrícolas e pecuária encerram o pregão diurno antes das 16h de NY, mas o Yahoo segue marcando "REGULAR".
const EARLY_CLOSE = new Set([
  "ZC=F",
  "ZW=F",
  "ZS=F",
  "KC=F",
  "CC=F",
  "CT=F",
  "LE=F",
  "HE=F",
  "ZL=F",
  "ZM=F",
  "SB=F",
]);

/** Séries que o Yahoo só publica no fechamento (o "último negócio" é sempre da véspera): nunca estão atrasadas. */
const DAILY_ONLY = new Set(["^SKEW"]);

/**
 * Volume médio abaixo disto (ações/dia) = ativo pouco negociado: passar 20 min ou horas sem negócio é normal
 * (EIRL, ENZL, CEW...), não é atraso da fonte. A defasagem do canal em si já aparece no selo de frescor.
 */
export const ILLIQUID_VOL = 200_000;

/** Pouco negociado pelo volume médio (3 meses → 10 dias → do dia); sem volume informado (câmbio, índice) = não. */
export function illiquid(q) {
  const vol = q?.av3 || q?.av || q?.v;
  return Number.isFinite(vol) && vol > 0 && vol < ILLIQUID_VOL;
}

/** Atraso aceitável por tipo de ativo, em minutos (futuros da CME vêm com ~10 min de atraso). */
export function toleranceMin(sym) {
  if (EARLY_CLOSE.has(sym)) return 300;
  if (DAILY_ONLY.has(sym)) return Infinity;
  if (sym.endsWith("=X")) return 60; // câmbio do Yahoo: moedas fora do G10 (CNY, INR) atualizam a cada ~30 min
  if (sym === "^VIX") return 20;
  if (sym.startsWith("^")) return 75; // índices de juros atualizam com menos frequência
  if (sym.endsWith("=F")) return 25;
  return 20;
}

/**
 * Ativos com cotação atrasada: pregão regular dos EUA aberto (SPY em REGULAR), mercado do ativo
 * aberto, ativo líquido (illiquid) e última negociação mais antiga que a tolerância do tipo de ativo.
 */
export function lateQuotes(live, symbols, nowSec = Date.now() / 1000) {
  const out = [];
  if (live?.quotes?.SPY?.ms !== "REGULAR") return out;
  for (const sym of symbols) {
    const q = live?.quotes?.[sym];
    if (!q || q.ms !== "REGULAR" || illiquid(q)) continue;
    const lag = (nowSec - q.t) / 60;
    if (lag > toleranceMin(sym)) out.push({ sym, lagMin: Math.round(lag) });
  }
  return out.sort((a, b) => b.lagMin - a.lagMin);
}
