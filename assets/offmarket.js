// Modo "Off market": fora do pregão regular, troca o preço de cada ativo pelo melhor dado de horário estendido.
// Ordem de preferência (ver docs/ON-OFF-MARKET.md):
//   1. Proxy EXATO por futuro (ex.: SPY ↔ ES=F): futuros negociam quase 24 h e são a referência mais fiel.
//   2. Pré/pós-mercado do próprio ativo (ações, setores, ETFs sem futuro exato), se for da sessão atual:
//      o pós de ontem não vale contra um futuro que já negocia na sessão seguinte.
//   3. Proxy APROXIMADO por futuro (ex.: setor ↔ S&P futuro), quando não há pré/pós.
//   4. Último preço regular (sem mudança).
// O fechamento anterior (pc) não muda: a variação do dia continua contra o último fechamento oficial.
import { sessionInfo } from "./ta-signals.js";
import { alignReturns, cov } from "./risk.js";

/** Símbolo Yahoo -> [proxy, fator, exato?, tipo?]. fator -1 = relação inversa (ex.: dólar/iene × futuro de iene).
 *  tipo "y": taxa de juros; fator = duration do futuro (taxa implícita = taxa − variação% do futuro / duration).
 *  tipo "etf": proxy é outro ativo com pré/pós (ex.: Ibovespa pelo EWZ). */
export const PROXY = {
  SPY: ["ES=F", 1, true], VOO: ["ES=F", 1, true], IVV: ["ES=F", 1, true], "^GSPC": ["ES=F", 1, true], SPXL: ["ES=F", 3, false],
  QQQ: ["NQ=F", 1, true], "^NDX": ["NQ=F", 1, true], "^IXIC": ["NQ=F", 1, false],
  IWM: ["RTY=F", 1, true], "^RUT": ["RTY=F", 1, true],
  DIA: ["YM=F", 1, true], "^DJI": ["YM=F", 1, true],
  "^IRX": ["ZT=F", 1.9, false, "y"], "^FVX": ["ZF=F", 4.5, true, "y"], "^TNX": ["ZN=F", 6.5, true, "y"], "^TYX": ["ZB=F", 17, true, "y"],
  LQD: ["ZN=F", 1.2, false], HYG: ["ES=F", 0.35, false], EMB: ["ZN=F", 0.8, false], TIP: ["ZN=F", 0.8, false],
  "^BVSP": ["EWZ", 1, false, "etf"], "^MXX": ["EWW", 1, false, "etf"], ILF: ["EEM", 1, false, "etf"],
  XLRE: ["ES=F", 0.8, false], RSP: ["ES=F", 1, false], EFA: ["ES=F", 0.8, false], EEM: ["ES=F", 0.8, false],
  EWJ: ["NKD=F", 1, false], "^N225": ["NKD=F", 1, true],
  // bolsas de fora sem futuro no Yahoo (só a CME tem): com a bolsa fechada, o ETF do país negociado em NY (4h–20h)
  "^STOXX50E": ["EZU", 1, false, "cty"], "^STOXX": ["VGK", 1, false, "cty"], "^GDAXI": ["EWG", 1, false, "cty"],
  "^FTSE": ["EWU", 1, false, "cty"], "^FCHI": ["EWQ", 1, false, "cty"], "^IBEX": ["EWP", 1, false, "cty"],
  "FTSEMIB.MI": ["EWI", 1, false, "cty"], "^HSI": ["EWH", 1, false, "cty"], "000001.SS": ["ASHR", 1, false, "cty"],
  "399001.SZ": ["ASHR", 1, false, "cty"], "^KS11": ["EWY", 1, false, "cty"], "^TWII": ["EWT", 1, false, "cty"],
  "^NSEI": ["INDA", 1, false, "cty"], "^BSESN": ["INDA", 1, false, "cty"], "^AXJO": ["EWA", 1, false, "cty"],
  TLT: ["ZB=F", 1, false], TBF: ["ZB=F", -1, false], IEF: ["ZN=F", 1, true], SHY: ["ZT=F", 1, true],
  // VIX: o Yahoo não tem o futuro de VIX (VX=F). Fora do pregão vale o VIXY (ETF dos futuros de VIX de curto
  // prazo, com pré 4h e pós até 20h de NY): o VIX à vista anda ~2x o VIXY (o de 3 meses ~1,2x). Sem pré/pós
  // fresco do VIXY (madrugada), o S&P: +1% no ES ≈ −3% no VIX (−2% no de 3 meses). Estimado, não exato.
  "^VIX": ["VIXY", 2, false, "vx", ["ES=F", -3]], "^VIX3M": ["VIXY", 1.2, false, "vx", ["ES=F", -2]],
  GLD: ["GC=F", 1, true], IAU: ["GC=F", 1, true], GDX: ["GC=F", 1.5, false],
  SLV: ["SI=F", 1, true], COPX: ["HG=F", 1, false],
  USO: ["CL=F", 1, true], DBC: ["CL=F", 0.5, false],
  FXY: ["6J=F", 1, true], "JPY=X": ["6J=F", -1, true], "BRL=X": ["6L=F", -1, true],
  UUP: ["6E=F", -0.6, false], "DX-Y.NYB": ["6E=F", -0.6, false],
  // setores e estilos dos EUA: acompanham o S&P (aproximado)
  XLK: ["NQ=F", 1, false], SMH: ["NQ=F", 1.3, false], XLC: ["NQ=F", 1, false],
  XLY: ["ES=F", 1, false], XLF: ["ES=F", 1, false], KRE: ["RTY=F", 1, false], XLI: ["ES=F", 1, false],
  XLB: ["ES=F", 1, false], XLE: ["CL=F", 0.5, false], XLP: ["ES=F", 0.6, false], XLV: ["ES=F", 0.7, false],
  XLU: ["ES=F", 0.5, false], VNQ: ["ES=F", 0.8, false],
  // alavancados/inversos de índice: o fator é o do próprio ETF (diário; aproximado ao longo da noite)
  SSO: ["ES=F", 2, false], UPRO: ["ES=F", 3, false], SH: ["ES=F", -1, false], SDS: ["ES=F", -2, false], SPXU: ["ES=F", -3, false], SPXS: ["ES=F", -3, false],
  QLD: ["NQ=F", 2, false], TQQQ: ["NQ=F", 3, false], PSQ: ["NQ=F", -1, false], QID: ["NQ=F", -2, false], SQQQ: ["NQ=F", -3, false],
  TNA: ["RTY=F", 3, false], TZA: ["RTY=F", -3, false], UDOW: ["YM=F", 3, false], SDOW: ["YM=F", -3, false],
}; // prettier-ignore

/**
 * Proxy aproximado para ativos da carteira fora de PROXY (ações, alavancados de setor…): futuro do S&P × beta de
 * 1 ano contra o SPY. Só entra quando o ativo não tem pré/pós (à noite, por exemplo), marcado como estimado.
 * history: { SÍMBOLO: { dates, close } }.
 */
export function betaProxies(syms, history, { bench = "SPY", lookback = 252 } = {}) {
  const want = (syms ?? []).filter(
    (s) => !PROXY[s] && /^[A-Z][A-Z0-9.-]*$/.test(s) && !/\.SA$/.test(s),
  );
  if (!want.length || !history?.[bench]) return {};
  const { syms: got, R } = alignReturns(history, [...new Set([...want, bench])], lookback);
  if (!got.includes(bench) || (R[bench]?.length ?? 0) < 20) return {};
  const vb = cov(R[bench], R[bench]);
  const out = {};
  for (const s of want) {
    if (!got.includes(s)) continue;
    const b = cov(R[s], R[bench]) / vb;
    if (Number.isFinite(b)) out[s] = ["ES=F", Math.round(b * 100) / 100, false];
  }
  return out;
}

const ET = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
}); // prettier-ignore
function nyParts(sec) {
  const p = Object.fromEntries(
    ET.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
/** Data do pregão da CME: a sessão que abre às 18:00 de NY já é do dia seguinte. */
const cmeDate = (sec) => nyParts(sec + 6 * 3600).date;

/**
 * Preço implícito pelo futuro. O fechamento de referência do futuro (pc) só "vira" às 18:00 de NY;
 * antes disso ele ainda é o do pregão anterior, então a base do ativo também é o fechamento anterior (q.pc).
 */
export function impliedByFuture(q, f, k = 1) {
  if (!(q?.p > 0) || !(f?.p > 0) || !(f.pc > 0) || !q.t || !f.t) return null;
  const rolled = cmeDate(f.t) > nyParts(q.t).date; // futuro já está na sessão seguinte ao último pregão do ativo
  const base = rolled ? q.p : (q.pc ?? q.p);
  const fchg = f.p / f.pc - 1;
  const p = base * (1 + k * fchg);
  return { p, t: f.t, chgVsClose: p / q.p - 1, fchg, rolled };
}

/** Taxa implícita pelo futuro de Treasury: preço do futuro sobe -> taxa cai (variação% / duration). */
export function impliedYield(q, f, dur) {
  const r = impliedByFuture(q, f, 1);
  if (!r) return null;
  const base = r.rolled ? q.p : (q.pc ?? q.p);
  const y = base - (r.fchg * 100) / dur;
  return { p: y, t: f.t, chgVsClose: y - q.p, fchg: r.fchg, rolled: r.rolled };
}

/**
 * Índice de fora estimado pelo ETF do país em NY, quando a bolsa local está fechada e o ETF negociou DEPOIS do
 * último negócio local. Índice ≈ fechamento local anterior × (ETF agora ÷ fechamento anterior do ETF): a
 * variação fica medida desde o último fechamento de NY, sem contar duas vezes a sessão local (o ETF já a
 * embute). Aproximado: o ETF está em dólar (inclui o câmbio) e o pré/pós dele tem pouca liquidez.
 */
export function impliedByCountryEtf(q, f, k = 1) {
  if (!(q?.p > 0) || !(q.pc > 0) || !(f?.pc > 0) || !q.t) return null;
  const ext = f.xp > 0 && f.xt > (f.t ?? 0);
  const fp = ext ? f.xp : f.p;
  const ft = ext ? f.xt : f.t;
  if (!(fp > 0) || !ft || ft <= q.t + 600) return null;
  const fchg = fp / f.pc - 1;
  const p = q.pc * (1 + k * fchg);
  return { p, t: ft, chgVsClose: p / q.p - 1, fchg, rolled: false };
}

/** Frescor do pré/pós do VIXY para valer como futuro de VIX (s). */
export const VX_FRESH = 1800;

/**
 * VIX pelos futuros de VIX (via VIXY no pré/pós): VIX ≈ último VIX × (1 + k × variação do VIXY no pré/pós sobre
 * o último fechamento dele). Só com pré/pós do VIXY dos últimos 30 min; senão null (cai no S&P).
 */
export function impliedByVixEtf(q, f, k, nowSec) {
  if (!(q?.p > 0) || !(f?.p > 0) || !(f.xp > 0) || !f.xt || !(f.xt > (f.t ?? 0))) return null;
  if (nowSec - f.xt > VX_FRESH || f.xt <= (q.t ?? 0)) return null;
  const fchg = f.xp / f.p - 1;
  const p = q.p * (1 + k * fchg);
  return { p, t: f.xt, chgVsClose: p / q.p - 1, fchg, rolled: false };
}

/** Horário a usar na barra do dia: o do dado estendido, se cair num dia de pregão; senão o do último regular. */
const barTime = (q, t) => (t && sessionInfo(nyParts(t).date).open ? Math.max(t, q.t ?? 0) : q.t);

/** Cotação "Off market" de um símbolo. Devolve o quote original + campos off* (fonte, preço, proxy). */
export function offQuote(sym, q, quotes, nowSec = Date.now() / 1000, proxies = null) {
  if (!q) return q;
  // o próprio mercado do ativo está aberto agora (Europa no pré dos EUA, Ásia à noite): o preço regular já é o real
  if (q.ms === "REGULAR" && q.t && nowSec - q.t < 1800)
    return { ...q, regP: q.p, regT: q.t, offSrc: "live", offFut: null };
  const px = PROXY[sym] ?? proxies?.[sym] ?? null;
  const f = px ? quotes[px[0]] : null;
  let imp = null;
  let useP = px;
  if (px && px[3] === "vx") {
    imp = f ? impliedByVixEtf(q, f, px[1], nowSec) : null;
    if (!imp && quotes[px[4][0]]) {
      useP = [px[4][0], px[4][1], false];
      imp = impliedByFuture(q, quotes[px[4][0]], px[4][1]);
    }
  } else if (px && f && px[3] === "y") imp = impliedYield(q, f, px[1]);
  else if (px && f && px[3] === "cty") imp = impliedByCountryEtf(q, f, px[1]);
  else if (px && f && px[3] === "etf") {
    const o = f.regP > 0 && f.offSrc && f.offSrc !== "reg" ? f.p / f.regP - 1 : null;
    if (o !== null) imp = { p: q.p * (1 + px[1] * o), t: f.t, chgVsClose: px[1] * o, fchg: o };
  } else if (px && f) imp = impliedByFuture(q, f, px[1]);
  let ext = q.xp > 0 ? { p: q.xp, t: q.xt, kind: q.xk } : null;
  // pré/pós velho (ex.: pós de sexta no domingo à noite) perde para o futuro que já abriu sessão nova
  if (ext && imp?.rolled && f?.t && (!ext.t || f.t - ext.t > 1800)) ext = null;
  let pick = null;
  if (imp && useP[2]) pick = { src: "fut", p: imp.p, t: imp.t };
  else if (ext) pick = { src: ext.kind, p: ext.p, t: ext.t };
  else if (imp) pick = { src: "fut~", p: imp.p, t: imp.t };
  const extra = {
    regP: q.p,
    regT: q.t,
    offSrc: pick?.src ?? "reg",
    offFut: useP ? useP[0] : null,
    offFutK: useP ? useP[1] : null,
    offFutExact: useP ? useP[2] : null,
    offFutChg: imp ? imp.fchg : null,
    offImplChg: imp ? imp.chgVsClose : null,
    offExtChg: q.xc ?? null,
  };
  if (!pick) return { ...q, ...extra };
  return { ...q, ...extra, p: pick.p, t: barTime(q, pick.t) };
}

/** Todas as cotações no modo Off (futuros seguem como estão: já negociam fora do pregão). */
export function offQuotes(quotes, nowSec = Date.now() / 1000, proxies = null) {
  const out = {};
  const later = [];
  for (const [s, q] of Object.entries(quotes ?? {})) {
    if (/=F$/.test(s)) out[s] = q;
    else if (PROXY[s]?.[3] === "etf")
      later.push(s); // depende do Off do outro ativo
    else out[s] = offQuote(s, q, quotes, nowSec, proxies);
  }
  for (const s of later) out[s] = offQuote(s, quotes[s], { ...quotes, ...out }, nowSec);
  return out;
}

/** Modo efetivo: preferência "auto" segue a sessão (pregão = on; pré, pós e fechado = off). */
export const effectiveMode = (pref, session) =>
  pref === "on" || pref === "off" ? pref : session === "open" ? "on" : "off";
