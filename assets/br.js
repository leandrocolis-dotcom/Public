// Mercado › Local (Brasil): universo da B3 acompanhado, séries montadas com o preço ao vivo, regime do dia,
// setores (cestas de ações), maiores altas/baixas, amplitude, volatilidade e a nota macro do Brasil (BCB/Focus).
// Puro (sem DOM): a tela fica em local-view.js e a carga em feeds.js (loadLocal).
import { decSep } from "./format.js";
import { alignSeries } from "./dash-extra.js";
import { regimeStrength } from "./regime-strength.js";
import { BASKETS, BR_NY, BR_RATIOS, BR_SECTORS, STOCKS } from "./br-universe.js";

export {
  BR_NY,
  BR_PANELS,
  BR_RATIOS,
  BR_SECTORS,
  BR_SYMBOLS,
  BR_TAPE,
  STOCKS,
  tick,
} from "./br-universe.js";

const DAY = new Map();
/** Data "AAAA-MM-DD" do instante (segundos) no fuso. */
export function dayIn(sec, tz = "America/Sao_Paulo") {
  const f = DAY.get(tz) ?? DAY.set(tz, new Intl.DateTimeFormat("en-CA", { timeZone: tz })).get(tz);
  return f.format(new Date(sec * 1000));
}

/**
 * Histórico diário + cotação ao vivo: troca o fechamento do dia ou acrescenta o pregão de hoje. O ponto anterior
 * vira o fechamento anterior oficial da cotação (pc), para a variação do dia ser a mesma do painel do ativo
 * (preço ÷ fechamento anterior); diferença absurda (> 25%) não mexe.
 */
export function mergeLive(src, q) {
  if (!src?.dates?.length) return src ?? null;
  if (!(q?.p > 0) || !q.t) return src;
  const d = dayIn(q.t);
  const last = src.dates.at(-1);
  if (d < last) return src;
  const close = d === last ? [...src.close.slice(0, -1), q.p] : [...src.close, q.p];
  const prev = close.length - 2;
  if (q.pc > 0 && prev >= 0 && Math.abs(q.pc / close[prev] - 1) < 0.25) close[prev] = q.pc;
  return d === last ? { ...src, close } : { ...src, dates: [...src.dates, d], close };
}

/** Variação no horizonte h: % para preços, bps para taxas. */
export function change(s, h, kind = "px") {
  if (!s || s.length <= h) return null;
  const a = s.at(-1);
  const b = s.at(-1 - h);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !b) return null;
  return kind === "yld" ? (a - b) * 100 : a / b - 1;
}

/** Cesta de peso igual: média das séries normalizadas (1 no início). */
function basket(close, syms) {
  const ss = syms.map((s) => close[s]).filter((s) => s?.length);
  if (!ss.length) return null;
  const n = ss[0].length;
  return Array.from({ length: n }, (_, i) => ss.reduce((a, s) => a + s[i] / s[0], 0) / ss.length);
}

/**
 * Séries alinhadas ao calendário da B3 (datas do Ibovespa) com o preço ao vivo no último ponto, mais as
 * sintéticas: IBOV_USD, BRLUSD (inverso do USD/BRL), S:<setor> e B:<cesta>.
 * hist: { SÍMBOLO: { dates, close } } · quotes: { SÍMBOLO: { p, t, ... } }
 */
export function buildClose(hist, quotes = {}) {
  const master = mergeLive(hist?.["^BVSP"], quotes["^BVSP"]) ?? mergeLive(hist?.["BOVA11.SA"], quotes["BOVA11.SA"]); // prettier-ignore
  if (!master?.dates?.length) return null;
  const dates = master.dates;
  const close = {};
  for (const [sym, src] of Object.entries(hist ?? {})) {
    const a = alignSeries(dates, mergeLive(src, quotes[sym]));
    if (a) close[sym] = a;
  }
  const brl = close["BRL=X"];
  if (brl) {
    close.BRLUSD = brl.map((v) => 1 / v);
    if (close["^BVSP"]) close.IBOV_USD = close["^BVSP"].map((v, i) => v / brl[i]);
  }
  for (const s of BR_SECTORS) {
    const b = basket(close, s.members);
    if (b) close[`S:${s.key}`] = b;
  }
  for (const [k, keys] of Object.entries(BASKETS)) {
    const b = basket(close, BR_SECTORS.filter((s) => keys.includes(s.key)).flatMap((s) => s.members)); // prettier-ignore
    if (b) close[`B:${k}`] = b;
  }
  return { dates, close };
}

const ratio = (close, a, b) => {
  if (!close[a]) return null;
  if (!b) return close[a];
  return close[b] ? close[a].map((v, i) => v / close[b][i]) : null;
};

/**
 * Regime do dia no Brasil: quantas razões de risco subiram no horizonte h. Estresse quando o dólar dispara e os
 * prefixados apanham juntos (fuga de risco local), com limites que crescem com √h.
 */
export function brRegime(close, h) {
  const items = BR_RATIOS.map(([a, b, label]) => {
    const s = ratio(close, a, b);
    return { a, b, label, s, c: change(s, h) };
  }).filter((x) => x.c != null);
  const on = items.filter((x) => x.c > 0).length;
  const share = items.length ? on / items.length : 0.5;
  let verdict = share >= 0.7 ? "Risk-on" : share <= 0.3 ? "Risk-off" : "Misto";
  const usd = change(close["BRL=X"], h);
  const jur = change(ratio(close, "IRFM11.SA", "LFTS11.SA"), h);
  const k = Math.sqrt(h);
  const stress = usd != null && jur != null && usd > 0.015 * k && jur < -0.004 * k;
  if (stress) verdict = "Estresse (dólar e juros em alta)";
  const strength = regimeStrength(items, h, { verdict });
  return { items, on, n: items.length, verdict, strength, usd, jur, stress };
}

/** Setores ordenados pela variação média das ações no horizonte (com a variação de cada ação). */
export function brSectors(close, h) {
  return BR_SECTORS.map((s) => {
    const members = s.members
      .map((sym) => ({ sym, c: change(close[sym], h) }))
      .filter((m) => m.c != null)
      .sort((a, b) => b.c - a.c);
    const c = members.length ? members.reduce((a, m) => a + m.c, 0) / members.length : null;
    return { key: s.key, label: s.label, c, members };
  })
    .filter((s) => s.c != null)
    .sort((a, b) => b.c - a.c);
}

/** Maiores altas e baixas entre as ações acompanhadas. */
export function brMovers(close, h, n = 5) {
  const all = STOCKS.map((sym) => ({ sym, c: change(close[sym], h), p: close[sym]?.at(-1) }))
    .filter((x) => x.c != null)
    .sort((a, b) => b.c - a.c);
  return { up: all.slice(0, n), dn: all.slice(-n).reverse(), n: all.length };
}

/** Amplitude: fatia das ações em alta no horizonte e acima da média de 50 pregões. */
export function brBreadth(close, h) {
  let up = 0;
  let n = 0;
  let above = 0;
  let m = 0;
  for (const sym of STOCKS) {
    const s = close[sym];
    const c = change(s, h);
    if (c != null) {
      n++;
      if (c > 0) up++;
    }
    if (s?.length >= 50) {
      const avg = s.slice(-50).reduce((a, v) => a + v, 0) / 50;
      m++;
      if (s.at(-1) > avg) above++;
    }
  }
  return { up: n ? up / n : null, n, above: m ? above / m : null, m };
}

/** Volatilidade realizada de 20 pregões (anualizada) e em que percentil está no último ano. */
export function realizedVol(s, win = 20) {
  if (!s || s.length < win + 2) return null;
  const r = [];
  for (let i = 1; i < s.length; i++)
    if (s[i] > 0 && s[i - 1] > 0) r.push(Math.log(s[i] / s[i - 1]));
  const vol = (a) => {
    const mu = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt((a.reduce((x, y) => x + (y - mu) ** 2, 0) / (a.length - 1)) * 252);
  };
  const hist = [];
  for (let i = win; i <= r.length; i++) hist.push(vol(r.slice(i - win, i)));
  const v = hist.at(-1);
  const pct = hist.filter((x) => x <= v).length / hist.length;
  return { v, pct };
}

const pad = (n) => String(n).padStart(2, "0");
/**
 * Sessão da B3 (sem feriados): pré-abertura 9:45, pregão das 10:00 às 17:00 quando os EUA estão no horário de
 * verão e às 18:00 no resto do ano; depois, fechado. Horário de Brasília. frac = fração decorrida do pregão
 * (0 antes da abertura, 1 depois do fechamento e no fim de semana), para o volume relativo do dia.
 */
export function b3Session(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }) // prettier-ignore
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const min = Number(parts.hour) * 60 + Number(parts.minute);
  const nyOff = (() => {
    const t =
      new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }) // prettier-ignore
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value;
    return t === "GMT-4" ? -4 : -5;
  })();
  const closeMin = nyOff === -4 ? 17 * 60 : 18 * 60;
  const hhmm = `${pad(parts.hour)}:${pad(parts.minute)}`;
  const close = `${closeMin / 60}:00`;
  const frac = Math.max(0, Math.min(1, (min - 10 * 60) / (closeMin - 10 * 60)));
  if (["Sat", "Sun"].includes(parts.weekday))
    return { id: "closed", open: false, label: "fim de semana", hhmm, close, frac: 1 };
  if (min >= 9 * 60 + 45 && min < 10 * 60)
    return { id: "pre", open: false, label: "pré-abertura", hhmm, close, frac };
  if (min >= 10 * 60 && min < closeMin)
    return { id: "open", open: true, label: "pregão aberto", hhmm, close, frac };
  return { id: "closed", open: false, label: "pregão fechado", hhmm, close, frac };
}

// ───────────── macro do Brasil (BCB: SGS e Focus) ─────────────

/** Séries do SGS do Banco Central: [chave, código, quantos pontos]. */
export const SGS = [
  ["selic", 432, 2],
  ["cdi", 4389, 2],
  ["ipca", 433, 2],
  ["ipca12", 13522, 2],
  ["igpm", 189, 12],
  ["ibc", 24363, 13],
  ["desemp", 24369, 13],
  ["divida", 13762, 13],
];

const clamp = (x, lo = -2.5, hi = 2.5) => Math.max(lo, Math.min(hi, x));
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
/** "dd/mm/aaaa" -> "aaaa-mm-dd". */
const isoBR = (d) => (/^\d{2}\/\d{2}\/\d{4}$/.test(d ?? "") ? d.split("/").reverse().join("-") : (d ?? null)); // prettier-ignore
const pts = (rows) =>
  (rows ?? [])
    .map((r) => ({ d: isoBR(r.data), v: Number(r.valor) }))
    .filter((r) => r.d && Number.isFinite(r.v));

/** Mediana mais recente do Focus para o indicador/ano e a de ~4 semanas antes. */
export function focusPick(rows, ind, year) {
  const list = (rows ?? [])
    .filter(
      (r) =>
        r.Indicador === ind &&
        String(r.DataReferencia) === String(year) &&
        Number.isFinite(r.Mediana),
    ) // prettier-ignore
    .sort((a, b) => (a.Data < b.Data ? 1 : -1));
  if (!list.length) return null;
  const last = list[0];
  const lim = new Date(Date.parse(last.Data) - 28 * 864e5).toISOString().slice(0, 10);
  const prev = list.find((r) => r.Data <= lim) ?? null;
  return { v: last.Mediana, d: last.Data, prev: prev?.Mediana ?? null, prevD: prev?.Data ?? null };
}

export const BR_PILLARS = {
  juros: "Juros e política monetária",
  inflacao: "Inflação",
  atividade: "Atividade e emprego",
  fiscal: "Fiscal e câmbio",
};

/**
 * Nota macro do Brasil para a bolsa. raw: { sgs: { chave: [{data, valor}] }, focus: [linhas anuais],
 * focus12: [linhas 12 meses], year }. Cada indicador vai de −2,5 a +2,5 (+ é bom para ações); pilar = média;
 * nota = média dos pilares em −100 a +100.
 */
export function brMacro(raw) {
  const s = Object.fromEntries(SGS.map(([k]) => [k, pts(raw?.sgs?.[k])]));
  const last = (k) => s[k].at(-1) ?? null;
  const year = raw?.year ?? new Date().getUTCFullYear();
  const f = (ind, y) => focusPick(raw?.focus, ind, y);
  const f12 = (raw?.focus12 ?? [])
    .filter((r) => Number.isFinite(r.Mediana))
    .sort((a, b) => (a.Data < b.Data ? 1 : -1))[0];
  const out = [];
  const now = raw?.now ?? Date.now();
  const add = (id, pillar, label, value, unit, date, read, score = null) => {
    // dado com mais de 8 meses (série descontinuada ou atrasada): aparece, mas não entra na nota
    if (date && now - Date.parse(date) > 240 * 864e5) {
      read = `${read} (dado antigo: fora da nota)`;
      score = null;
    }
    if (Number.isFinite(value)) out.push({ id, pillar, label, value: r2(value), unit, date, read, score: score == null ? null : r2(clamp(score)) }); // prettier-ignore
  };
  const selic = last("selic");
  const exp12 = f12?.Mediana ?? null;
  add(
    "selic",
    "juros",
    "Selic (meta do Copom)",
    selic?.v,
    "% a.a.",
    selic?.d,
    "Taxa básica definida pelo Copom",
  );
  add("cdi", "juros", "CDI", last("cdi")?.v, "% a.a.", last("cdi")?.d, "Quanto rende o caixa (a régua da renda fixa)"); // prettier-ignore
  if (selic && exp12 != null) {
    const real = ((1 + selic.v / 100) / (1 + exp12 / 100) - 1) * 100;
    add("real", "juros", "Juro real (Selic − IPCA esperado 12 m)", real, "% a.a.", f12.Data, real > 7 ? "Muito restritivo: renda fixa compete forte com a bolsa" : real > 5 ? "Restritivo" : "Neutro ou estimulativo", (5 - real) / 1.2); // prettier-ignore
  }
  const fs = f("Selic", year + 1);
  if (fs && selic)
    add("fselic", "juros", `Selic esperada no fim de ${year + 1} (Focus)`, fs.v, "% a.a.", fs.d, fs.v < selic.v ? `Mercado espera ${(selic.v - fs.v).toFixed(2).replace(".", decSep())} p.p. de cortes` : fs.v > selic.v ? "Mercado espera altas" : "Mercado espera estabilidade", (selic.v - fs.v) / 1.5); // prettier-ignore
  const i12 = last("ipca12");
  add("ipca12", "inflacao", "IPCA em 12 meses", i12?.v, "%", i12?.d, i12 ? (i12.v > 4.5 ? "Acima do teto da meta (3% ± 1,5)" : i12.v < 1.5 ? "Abaixo do piso da meta" : "Dentro da banda da meta (3% ± 1,5)") : "", i12 ? (3 - i12.v) / 1 : null); // prettier-ignore
  add("ipca", "inflacao", "IPCA do mês", last("ipca")?.v, "%", last("ipca")?.d, "Variação mensal (IBGE)"); // prettier-ignore
  if (f12) add("exp12", "inflacao", "IPCA esperado para 12 meses (Focus)", exp12, "%", f12.Data, exp12 > 3.5 ? "Expectativa longe da meta de 3%" : "Expectativa perto da meta", (3 - exp12) / 0.5); // prettier-ignore
  const fi = f("IPCA", year + 1);
  if (fi?.prev != null)
    add("fipca", "inflacao", `IPCA ${year + 1}: Focus em 4 semanas`, fi.v - fi.prev, "p.p.", fi.d, `De ${fi.prev.toFixed(2).replace(".", decSep())}% para ${fi.v.toFixed(2).replace(".", decSep())}%`, -(fi.v - fi.prev) / 0.1); // prettier-ignore
  const igpm = s.igpm.length >= 12 ? (s.igpm.slice(-12).reduce((a, x) => a * (1 + x.v / 100), 1) - 1) * 100 : null; // prettier-ignore
  add("igpm", "inflacao", "IGP-M em 12 meses", igpm, "%", last("igpm")?.d, "Inflação de atacado (aluguéis e contratos)"); // prettier-ignore
  if (s.ibc.length >= 13) {
    const g = (s.ibc.at(-1).v / s.ibc.at(-13).v - 1) * 100;
    add("ibc", "atividade", "IBC-Br em 12 meses", g, "%", s.ibc.at(-1).d, "Prévia do PIB do Banco Central (mês contra o mesmo mês do ano anterior)", (g - 1.5) / 1); // prettier-ignore
  }
  if (s.desemp.length >= 13) {
    const u = s.desemp.at(-1);
    const du = u.v - s.desemp.at(-13).v;
    add("desemp", "atividade", "Desemprego (PNAD)", u.v, "%", u.d, `${du <= 0 ? "Caiu" : "Subiu"} ${Math.abs(du).toFixed(1).replace(".", decSep())} p.p. em 12 meses`, -du / 0.5); // prettier-ignore
  }
  const fp = f("PIB Total", year);
  if (fp) add("fpib", "atividade", `PIB ${year} esperado (Focus)`, fp.v, "%", fp.d, "Crescimento esperado pelo mercado", (fp.v - 1.5) / 0.75); // prettier-ignore
  if (s.divida.length >= 13) {
    const d = s.divida.at(-1);
    const dd = d.v - s.divida.at(-13).v;
    add("divida", "fiscal", "Dívida bruta do governo", d.v, "% do PIB", d.d, `${dd >= 0 ? "Subiu" : "Caiu"} ${Math.abs(dd).toFixed(1).replace(".", decSep())} p.p. em 12 meses`, -dd / 1.5); // prettier-ignore
  }
  const fc = f("Câmbio", year + 1);
  if (fc) add("fcambio", "fiscal", `Dólar esperado no fim de ${year + 1} (Focus)`, fc.v, "R$", fc.d, fc.prev != null ? `${fc.v > fc.prev ? "Subiu" : fc.v < fc.prev ? "Caiu" : "Estável"} em 4 semanas (era ${fc.prev.toFixed(2).replace(".", decSep())})` : "", fc.prev != null ? -((fc.v / fc.prev - 1) * 100) / 1 : null); // prettier-ignore
  const pillars = Object.fromEntries(
    Object.entries(BR_PILLARS).map(([k, label]) => {
      const sc = out.filter((x) => x.pillar === k && x.score != null).map((x) => x.score);
      return [
        k,
        { label, score: sc.length ? r2(sc.reduce((a, b) => a + b, 0) / sc.length) : null },
      ];
    }),
  );
  const ps = Object.values(pillars).filter((p) => p.score != null).map((p) => p.score); // prettier-ignore
  const overall = ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length / 2.5) * 100) : null; // prettier-ignore
  return { indicators: out, pillars, overall };
}

/** Junta fontes de cotação ({ SÍMBOLO: {p, t, ...} }) ficando, por ativo, com a mais nova (empate: a última). */
export function freshestQuotes(...sources) {
  const out = {};
  for (const src of sources)
    for (const [sym, q] of Object.entries(src ?? {}))
      if (q?.p > 0 && (!out[sym] || (q.t ?? 0) >= (out[sym].t ?? 0))) out[sym] = q;
  return out;
}

/**
 * Fora do pregão da B3 (mesmo esquema do Off market do offshore): o pré/pós de Nova York do espelho (ADR ou
 * ETF, ver BR_NY) vira o pré/pós aproximado do ativo da B3: xp = último preço × (1 + variação do espelho fora
 * do pregão). Só vale se o dado estendido for posterior ao último preço da B3. xv = espelho usado.
 */
export function brExtQuotes(quotes, open) {
  if (open) return quotes;
  const out = { ...quotes };
  for (const [sym, ny] of Object.entries(BR_NY)) {
    const q = quotes[sym];
    const a = quotes[ny];
    if (!(q?.p > 0) || q.xk || !a?.xk || !(a.xp > 0) || !Number.isFinite(a.xc)) continue;
    if (!a.xt || (q.t && a.xt <= q.t)) continue;
    out[sym] = { ...q, xk: a.xk, xp: q.p * (1 + a.xc), xt: a.xt, xc: a.xc, xv: ny };
  }
  return out;
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/**
 * Fluxo Onshore (B3), inferido por preço e volume como o Fluxo Offshore: alta com volume acima da média = dinheiro
 * entrando; queda com volume = saindo. pressão = variação do dia × volume relativo (limitado a 3). Setores = média
 * das ações; rotação = força relativa contra o Ibovespa em 1, 5 e 20 pregões. EWZ (Brasil em NY) mede o canal do
 * investidor estrangeiro.
 * close: séries de buildClose · quotes: { SÍMBOLO: { v, av } } · rv: volume relativo já calculado pelo mapa
 * (mesmo número nas duas partes da tela) · share: parcela do volume do dia esperada até agora (br-flow.js volShare),
 * que ajusta o volume da cotação (hoje ÷ média de 10 pregões) quando o ativo não está em rv.
 */
export function brFlow(close, quotes = {}, { rv = {}, share = 1 } = {}) {
  const sh = Math.max(0.05, Math.min(1, share));
  const rvOf = (sym) => {
    if (rv[sym] != null) return rv[sym];
    const q = quotes[sym];
    return q?.v > 0 && q?.av > 0 ? q.v / (q.av * sh) : null;
  };
  const ib = {
    1: change(close["^BVSP"], 1),
    5: change(close["^BVSP"], 5),
    20: change(close["^BVSP"], 20),
  };
  const stocks = STOCKS.map((sym) => {
    const c = change(close[sym], 1);
    const rv = rvOf(sym);
    return {
      sym,
      c,
      rv,
      p: c == null ? null : c * Math.min(rv ?? 1, 3),
      price: close[sym]?.at(-1),
    };
  }).filter((x) => x.c != null);
  const sectors = BR_SECTORS.map((s) => {
    const m = stocks.filter((x) => s.members.includes(x.sym));
    const rs = (h) => {
      const cs = s.members.map((sym) => change(close[sym], h)).filter((x) => x != null);
      return cs.length && ib[h] != null ? avg(cs) - ib[h] : null;
    };
    return {
      key: s.key,
      label: s.label,
      n: m.length,
      c: avg(m.map((x) => x.c)),
      rv: avg(m.map((x) => x.rv).filter((x) => x != null)),
      p: avg(m.map((x) => x.p)),
      rs1: rs(1),
      rs5: rs(5),
      rs20: rs(20),
      lead: [...m].sort((a, b) => Math.abs(b.p) - Math.abs(a.p))[0]?.sym ?? null,
    };
  })
    .filter((s) => s.n && s.p != null)
    .sort((a, b) => b.p - a.p);
  const vs = stocks.filter((x) => quotes[x.sym]?.v > 0 && quotes[x.sym]?.av > 0);
  const volDay = vs.length
    ? vs.reduce((a, x) => a + quotes[x.sym].v, 0) /
      (vs.reduce((a, x) => a + quotes[x.sym].av, 0) * sh)
    : null;
  return {
    sectors,
    unusual: stocks
      .filter((x) => x.rv >= 1.5)
      .sort((a, b) => b.rv - a.rv)
      .slice(0, 12),
    inflow: [...stocks]
      .sort((a, b) => b.p - a.p)
      .slice(0, 6)
      .filter((x) => x.p > 0),
    outflow: [...stocks]
      .sort((a, b) => a.p - b.p)
      .slice(0, 6)
      .filter((x) => x.p < 0),
    ibov: ib[1],
    volDay,
    ewz: { c: change(close.EWZ, 1), rv: rvOf("EWZ") },
    n: stocks.length,
    nVol: vs.length,
  };
}
