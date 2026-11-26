// Preço → taxa de títulos de renda fixa brasileiros (debênture, CRI/CRA, Tesouro, LF): YTM, taxa até cada resgate
// antecipado (YTC) e YTW (yield to worst = a MENOR taxa entre o vencimento e as datas de resgate). Puro, sem DOM.
//
// Convenções (padrão ANBIMA para debêntures):
// - dias úteis (DU) pelo calendário de feriados nacionais (ANBIMA), contados de [início, fim): base 252;
// - juros por período = saldo × (fator(DU do período) − 1): pré/IPCA+ (1 + c)^(DU/252), CDI + s ((1 + CDI)(1 + s))^(DU/252),
//   % do CDI (1 + ((1 + CDI)^(1/252) − 1) × p)^DU; desconto pela mesma forma com a taxa procurada;
// - preço em % do PU par (PU par = saldo × fator desde o último evento até a liquidação), como o mercado secundário cota.
//   Valor nominal normalizado em 100; IPCA+ trabalha em termos reais (o VNA atualizado já está no PU par);
// - CDI projetado constante (o informado na tela) para os fluxos de CDI + e % do CDI;
// - resgate antecipado na data informada paga juros do período + saldo × preço de resgate (% do saldo).
// Taxas sempre brutas (antes de IR). Material educacional; não é recomendação de investimento.

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como "aaaa-mm-dd". */
export function easter(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(Date.UTC(y, month - 1, day));
}

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d, n) => iso(ms(d) + n * DAY);

const holCache = new Map();
/** Feriados nacionais do calendário ANBIMA no ano (Consciência Negra desde 2024). */
export function holidays(y) {
  if (holCache.has(y)) return holCache.get(y);
  const e = easter(y);
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
  if (y >= 2024) fixed.push("11-20");
  const set = new Set([
    ...fixed.map((md) => `${y}-${md}`),
    addDays(e, -48), // segunda de Carnaval
    addDays(e, -47), // terça de Carnaval
    addDays(e, -2), // Sexta-feira Santa
    addDays(e, 60), // Corpus Christi
  ]);
  holCache.set(y, set);
  return set;
}

/** Dia útil (não é sábado, domingo nem feriado nacional). */
export function isBusiness(d) {
  const wd = new Date(ms(d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays(Number(d.slice(0, 4))).has(d);
}

/** Próximo dia útil (o próprio dia, se for útil): datas de pagamento que caem em dia não útil. */
export function nextBusiness(d) {
  let x = d;
  while (!isBusiness(x)) x = addDays(x, 1);
  return x;
}

/** Dias úteis em [a, b) (a inclusive, b exclusive); negativo se b < a. */
export function du(a, b) {
  if (a === b) return 0;
  if (b < a) return -du(b, a);
  let n = 0;
  for (let t = ms(a), end = ms(b); t < end; t += DAY) if (isBusiness(iso(t))) n++;
  return n;
}

/** Soma meses mantendo o dia (31 → último dia do mês). */
export function addMonths(d, n) {
  const [y, m, dd] = d.split("-").map(Number);
  const tm = m - 1 + n;
  const ty = y + Math.floor(tm / 12);
  const mm = ((tm % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, mm + 1, 0)).getUTCDate();
  return iso(Date.UTC(ty, mm, Math.min(dd, last)));
}

/** Datas de cupom de trás para frente a partir do vencimento (freq em meses; 0 = só no vencimento). */
export function couponDates(maturity, freq, from) {
  if (!freq) return [maturity];
  const out = [];
  for (let k = 0; k < 1200; k++) {
    const d = addMonths(maturity, -freq * k);
    out.unshift(d);
    if (d <= from) break;
  }
  return out;
}

/** Fator de juros de um período de `n` DU para a taxa (decimal; % do CDI em fração: 1,1 = 110%). */
export function factor(idx, rate, n, cdi) {
  if (idx === "pcdi") return (1 + ((1 + cdi) ** (1 / 252) - 1) * rate) ** n;
  if (idx === "cdis") return ((1 + cdi) * (1 + rate)) ** (n / 252);
  return (1 + rate) ** (n / 252); // pre, ipca (real)
}

export const IDX_BOND = {
  pre: "Prefixado (% a.a.)",
  ipca: "IPCA + (% a.a. real)",
  cdis: "CDI + (spread % a.a.)",
  pcdi: "% do CDI",
};
export const FREQS = [
  [0, "No vencimento"],
  [1, "Mensal"],
  [3, "Trimestral"],
  [6, "Semestral"],
  [12, "Anual"],
];

/**
 * Lista "data valor" colada de qualquer jeito → [{ date, v }] em ordem. Lê data e valor na mesma linha
 * ("15/12/2027 101,00"), em linhas alternadas (data numa linha, "5,86%" na seguinte, como sai do site da emissora,
 * debentures.com.br ou ANBIMA) e linhas de tabela com outras colunas ("1  18/04/2022  Amortização  5,8600%"): cada
 * data fica com o PRIMEIRO número que vem depois dela e antes da próxima data; números antes da 1ª data (índice da
 * linha) e palavras são ignorados. Datas em dd/mm/aaaa ou aaaa-mm-dd; valor com vírgula ou ponto, com ou sem %.
 * `bad` = datas sem valor ou inexistentes (31/02). Valores são % (amortização ou preço de resgate, sempre < 1000):
 * vírgula sozinha é SEMPRE decimal ("33,333%" = 33,333, nunca 33 mil); com vírgula e ponto, o último é o decimal.
 */
export function schedNum(raw) {
  let t = String(raw).replace(/[%\s]/g, "");
  const c = t.lastIndexOf(",");
  const d = t.lastIndexOf(".");
  if (c >= 0 && d >= 0) t = c > d ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else t = t.replace(",", ".");
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
export function parseSchedule(text, parseNum = schedNum) {
  const out = [];
  const bad = [];
  const re = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})|([-+]?\d+(?:[.,]\d+)*\s*%?)/g;
  let cur = null; // data à espera do seu valor
  const flush = () => {
    if (cur) bad.push(cur.raw);
    cur = null;
  };
  for (const m of String(text ?? "").matchAll(re)) {
    if (m[1]) {
      flush();
      let d = m[1];
      if (d.includes("/")) {
        const [dd, mm, yy] = d.split("/");
        d = `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
      // data inexistente (31/02) vira outra no Date: confere a volta
      if (Number.isNaN(ms(d)) || iso(ms(d)) !== d) bad.push(m[1]);
      else cur = { date: d, raw: m[1] };
    } else if (cur) {
      const v = parseNum(m[2]);
      if (Number.isFinite(v)) {
        out.push({ date: cur.date, v });
        cur = null;
      }
    }
  }
  flush();
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { list: out, bad };
}

/**
 * Fluxos a partir da liquidação até `end` (vencimento ou data do resgate antecipado).
 * bond = { idx, coupon (decimal ou fração do CDI), freq, maturity, amort: [{ date, v (% do valor nominal) }] }.
 * call = null ou { date, price (% do saldo) }. Devolve { puPar, flows: [{ date, pay, du, interest, principal }] }
 * em termos de valor nominal 100, ou { error }.
 */
export function cashflows(bond, settle, cdi, call = null) {
  const { idx, coupon, freq, maturity } = bond;
  const amort = bond.amort ?? [];
  if (!(maturity > settle)) return { error: "vencimento precisa ser depois da liquidação" };
  const end = call ? call.date : maturity;
  // eventos: datas de cupom + amortizações; juros pagos em todo evento sobre o saldo
  const events = new Set(couponDates(maturity, freq, settle));
  for (const a of amort) events.add(a.date);
  const dates = [...events].sort();
  const prev = dates.filter((d) => d <= settle).at(-1) ?? settle;
  let bal = 100 - amort.filter((a) => a.date <= settle).reduce((s, a) => s + a.v, 0);
  if (bal <= 0) return { error: "título já amortizado na liquidação" };
  const puPar = bal * factor(idx, coupon, du(nextBusiness(prev), settle), cdi);
  const flows = [];
  let last = prev;
  for (const d of dates.filter((x) => x > settle && x < end).concat([end])) {
    const pay = nextBusiness(d);
    const interest = bal * (factor(idx, coupon, du(nextBusiness(last), pay), cdi) - 1);
    let principal;
    if (d === end) principal = call ? (bal * call.price) / 100 : bal;
    else
      principal = Math.min(
        bal,
        amort.filter((a) => a.date === d).reduce((s, a) => s + a.v, 0),
      );
    flows.push({ date: d, pay, du: du(settle, pay), interest, principal });
    bal -= d === end ? bal : principal;
    last = d;
  }
  return { puPar, flows };
}

/** Valor presente dos fluxos à taxa `y` (mesma forma do indexador). */
export function pv(flows, idx, y, cdi) {
  return flows.reduce((s, f) => s + (f.interest + f.principal) / factor(idx, y, f.du, cdi), 0);
}

/** Taxa que iguala o valor presente ao preço (bisseção; pv cai quando a taxa sobe). */
export function solveRate(flows, idx, target, cdi) {
  let lo = idx === "pcdi" ? 0 : -0.5;
  let hi = idx === "pcdi" ? 20 : 3;
  if (pv(flows, idx, lo, cdi) < target || pv(flows, idx, hi, cdi) > target) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (pv(flows, idx, mid, cdi) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Duration de Macaulay (anos de 252 DU) à taxa `y`. */
export function duration(flows, idx, y, cdi) {
  let w = 0;
  let tot = 0;
  for (const f of flows) {
    const v = (f.interest + f.principal) / factor(idx, y, f.du, cdi);
    w += v * (f.du / 252);
    tot += v;
  }
  return tot > 0 ? w / tot : null;
}

/**
 * Cenários de saída (vencimento + cada resgate antecipado depois da liquidação), taxa de cada um e o pior (YTW).
 * p = { idx, coupon (% como digitado: 7,5 = 7,5% a.a.; % do CDI: 110), freq, maturity, settle, price (% do PU par),
 * cdi (% a.a.), calls: [{ date, v }], amort: [{ date, v }] }. Taxas devolvidas em % (como o mercado cota).
 */
export function yieldToWorst(p) {
  const cdi = (p.cdi ?? 0) / 100;
  const bond = {
    idx: p.idx,
    coupon: p.coupon / 100, // % a.a. → decimal; % do CDI → fração (110 → 1,1)
    freq: p.freq ?? 0,
    maturity: p.maturity,
    amort: p.amort ?? [],
  };
  if (!p.settle || !p.maturity) return { error: "informe liquidação e vencimento" };
  if (!(p.price > 0)) return { error: "informe o preço em % do PU par" };
  const amortSum = bond.amort.reduce((s, a) => s + a.v, 0);
  if (amortSum > 100.0001) return { error: "amortizações somam mais de 100%" };
  const exits = [{ kind: "maturity", date: p.maturity, price: 100 }].concat(
    (p.calls ?? [])
      .filter((c) => c.date > p.settle && c.date < p.maturity)
      .map((c) => ({ kind: "call", date: c.date, price: c.v })),
  );
  let puPar = null;
  const rows = [];
  for (const ex of exits) {
    const cf = cashflows(bond, p.settle, cdi, ex.kind === "call" ? { date: ex.date, price: ex.price } : null); // prettier-ignore
    if (cf.error) return { error: cf.error };
    puPar = cf.puPar;
    const target = (cf.puPar * p.price) / 100;
    const y = solveRate(cf.flows, p.idx, target, cdi);
    rows.push({
      ...ex,
      rate: y == null ? null : y * 100,
      du: cf.flows.at(-1).du,
      years: cf.flows.at(-1).du / 252,
      duration: y == null ? null : duration(cf.flows, p.idx, y, cdi),
      flows: cf.flows,
    });
  }
  const ok = rows.filter((r) => r.rate != null);
  const worst = ok.length ? ok.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
  const ytm = rows[0];
  return { puPar, pu: (puPar * p.price) / 100, rows, ytm, worst, isCall: worst?.kind === "call" };
}
