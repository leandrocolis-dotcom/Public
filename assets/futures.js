// Rolagem de futuros: qual contrato está vigente em cada data e série contínua ajustada na troca.
// O contínuo do Yahoo (ex.: CNH=F) às vezes congela por semanas depois de um vencimento e salta na troca de
// contrato (HE=F +14% num dia sem notícia). Aqui o app escolhe o contrato pela regra de vencimento de cada
// mercado e rola alguns dias antes, como faz quem opera; a série histórica é ajustada por razão na troca
// (o preço mais recente é o do contrato vigente e a variação do dia nunca mistura dois contratos).
// Feriados são ignorados: a data de rolagem pode cair um dia antes ou depois, sem efeito prático.
// Puro (sem rede): usado por api/quotes, api/history, scripts/fut-adjust.mjs (workflow update-prices) e testes.

export const MONTH_CODES = "FGHJKMNQUVXZ";

/**
 * Barra diária de futuro "da noite": depois das 18:00 de NY o Yahoo carimba a sessão que acabou de abrir (pregão
 * do dia seguinte) com a hora de abertura, 18:00 do MESMO dia. Ela cai na data de hoje e toma o lugar do ajuste
 * (ex.: Brent 29/10 gravado 113,84 = preço da madrugada de 30/10, com ajuste real de 110,80). Essa barra é
 * descartada: o pregão de hoje entra pela cotação ao vivo. Barras diárias normais vêm carimbadas de madrugada.
 * isFut = instrumentType FUTURE (ou símbolo XX=F / contrato .NYM .CME .CBT .CMX .NYB). Puro.
 */
const HOUR_FMT = new Map(); // um formatador por fuso (criar um por barra é caro)
export function isEveningFutBar(t, tz, isFut) {
  if (!isFut || !Number.isFinite(t)) return false;
  const zone = tz || "America/New_York";
  const f = HOUR_FMT.get(zone) ?? HOUR_FMT.set(zone, new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", hourCycle: "h23" })).get(zone); // prettier-ignore
  const h = Number(f.format(new Date(t * 1000)));
  return h >= 17;
}
export const isFutMeta = (meta) =>
  meta?.instrumentType
    ? meta.instrumentType === "FUTURE"
    : /=F$|\.(NYM|CME|CBT|CMX|NYB)$/.test(String(meta?.symbol ?? ""));

const DAY = 86400000;
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const isBiz = (t) => t.getUTCDay() % 6 !== 0;
const addDays = (t, k) => new Date(t.getTime() + k * DAY);
function addBiz(t, k) {
  let x = t;
  const step = k < 0 ? -1 : 1;
  for (let left = Math.abs(k); left > 0;) {
    x = addDays(x, step);
    if (isBiz(x)) left--;
  }
  return x;
}
/** n-ésimo dia da semana (0 = domingo) do mês m (0–11). */
function nthWeekday(y, m, wd, n) {
  const first = utc(y, m, 1);
  return utc(y, m, 1 + ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
}
function lastWeekday(y, m, wd) {
  const last = utc(y, m + 1, 0);
  return addDays(last, -((last.getUTCDay() - wd + 7) % 7));
}
function lastBiz(y, m) {
  let t = utc(y, m + 1, 0);
  while (!isBiz(t)) t = addDays(t, -1);
  return t;
}
function firstBiz(y, m) {
  let t = utc(y, m, 1);
  while (!isBiz(t)) t = addDays(t, 1);
  return t;
}
const prev = (y, m, k = 1) => [y + Math.floor((m - k) / 12), (((m - k) % 12) + 12) % 12];

// Data de rolagem do contrato (y, m): a partir desse dia o vigente passa a ser o seguinte.
// Regras simplificadas de vencimento / primeiro aviso de entrega de cada bolsa, com folga de alguns dias.
const RULES = {
  // índices: vencem na 3ª sexta; o mercado rola na semana anterior
  idx: (y, m) => addDays(nthWeekday(y, m, 5, 3), -8),
  // Nikkei (CME): dia útil antes da 2ª sexta
  nkd: (y, m) => addDays(nthWeekday(y, m, 5, 2), -8),
  // moedas da CME: 2 dias úteis antes da 3ª quarta
  fx: (y, m) => addDays(addBiz(nthWeekday(y, m, 3, 3), -2), -7),
  // real (6L): último dia útil do mês anterior
  brl: (y, m) => addDays(lastBiz(...prev(y, m)), -5),
  // Treasuries: primeiro aviso no último dia útil do mês anterior
  ust: (y, m) => addBiz(lastBiz(...prev(y, m)), -2),
  // WTI: 3 dias úteis antes do dia 25 do mês anterior
  cl: (y, m) => addDays(addBiz(utc(...prev(y, m), 25), -3), -3),
  // Brent (NYMEX BZ): último dia útil do 2º mês anterior
  bz: (y, m) => addDays(lastBiz(...prev(y, m, 2)), -3),
  // gás natural: 3 dias úteis antes do 1º dia do mês
  ng: (y, m) => addDays(addBiz(utc(y, m, 1), -3), -3),
  // gasolina, diesel, açúcar: último dia útil do mês anterior
  eom: (y, m) => addDays(lastBiz(...prev(y, m)), -5),
  // metais e grãos: primeiro aviso no último dia útil do mês anterior
  fnd: (y, m) => addDays(lastBiz(...prev(y, m)), -5),
  // café, cacau, algodão (ICE): primeiro aviso dias úteis antes do 1º dia útil do mês
  kc: (y, m) => addBiz(firstBiz(y, m), -10),
  cc: (y, m) => addBiz(firstBiz(y, m), -13),
  ct: (y, m) => addBiz(firstBiz(y, m), -8),
  // boi gordo: último dia útil do mês do contrato
  le: (y, m) => addDays(lastBiz(y, m), -8),
  // suínos: 10º dia útil do mês do contrato
  he: (y, m) => addBiz(addBiz(addDays(utc(y, m, 1), -1), 10), -3),
  // cripto (CME): última sexta do mês
  crypto: (y, m) => addDays(lastWeekday(y, m, 5), -4),
};

// raiz -> [bolsa no Yahoo, meses listados, regra]
const Q = "HMUZ";
const ALL = MONTH_CODES;
export const FUT_SPECS = {
  ES: ["CME", Q, "idx"], NQ: ["CME", Q, "idx"], YM: ["CBT", Q, "idx"], RTY: ["CME", Q, "idx"], NKD: ["CME", Q, "nkd"],
  ZT: ["CBT", Q, "ust"], ZF: ["CBT", Q, "ust"], ZN: ["CBT", Q, "ust"], ZB: ["CBT", Q, "ust"], TN: ["CBT", Q, "ust"], UB: ["CBT", Q, "ust"],
  "6E": ["CME", Q, "fx"], "6J": ["CME", Q, "fx"], "6B": ["CME", Q, "fx"], "6A": ["CME", Q, "fx"], "6C": ["CME", Q, "fx"],
  "6S": ["CME", Q, "fx"], "6N": ["CME", Q, "fx"], "6M": ["CME", Q, "fx"], CNH: ["CME", Q, "fx"], "6L": ["CME", ALL, "brl"],
  CL: ["NYM", ALL, "cl"], BZ: ["NYM", ALL, "bz"], NG: ["NYM", ALL, "ng"], RB: ["NYM", ALL, "eom"], HO: ["NYM", ALL, "eom"],
  GC: ["CMX", "GJMQVZ", "fnd"], SI: ["CMX", "HKNUZ", "fnd"], HG: ["CMX", "HKNUZ", "fnd"], PL: ["NYM", "FJNV", "fnd"], PA: ["NYM", Q, "fnd"],
  ZC: ["CBT", "HKNUZ", "fnd"], ZW: ["CBT", "HKNUZ", "fnd"], ZS: ["CBT", "FHKNQUX", "fnd"], ZL: ["CBT", "FHKNQUVZ", "fnd"], ZM: ["CBT", "FHKNQUVZ", "fnd"],
  KC: ["NYB", "HKNUZ", "kc"], CC: ["NYB", "HKNUZ", "cc"], CT: ["NYB", "HKNVZ", "ct"], SB: ["NYB", "HKNV", "eom"],
  LE: ["CME", "GJMQVZ", "le"], HE: ["CME", "GJKMNQVZ", "he"],
  BTC: ["CME", ALL, "crypto"], ETH: ["CME", ALL, "crypto"],
}; // prettier-ignore

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "HEZ26" -> "dez/26" (vencimento do contrato, para mostrar ao lado do preço). */
export function futMonth(code) {
  const m = /([FGHJKMNQUVXZ])(\d{2})$/.exec(String(code ?? ""));
  return m ? `${MESES[MONTH_CODES.indexOf(m[1])]}/${m[2]}` : "";
}

/** "HE=F" -> "HE" (só raízes conhecidas). */
export function rootOf(sym) {
  const m = /^([A-Z0-9]+)=F$/.exec(String(sym ?? ""));
  return m && FUT_SPECS[m[1]] ? m[1] : null;
}

const toDate = (d) =>
  d instanceof Date ? d : new Date(typeof d === "number" ? d : `${d}T00:00:00Z`);
const iso = (t) => t.toISOString().slice(0, 10);

/** Contratos da raiz em ordem, a partir do ano y0: { root, code, sym, y, m, rollAt }. */
function* contracts(root, y0) {
  const [ex, months, rule] = FUT_SPECS[root];
  const ms = [...months].map((c) => MONTH_CODES.indexOf(c));
  for (let y = y0; y < y0 + 30; y++)
    for (const m of ms) {
      const code = `${root}${MONTH_CODES[m]}${String(y % 100).padStart(2, "0")}`;
      yield { root, code, sym: `${code}.${ex}`, y, m, rollAt: iso(RULES[rule](y, m)) };
    }
}

/**
 * Contrato vigente na data (o primeiro cuja rolagem ainda não chegou) e o seguinte.
 * date: Date, ms ou "AAAA-MM-DD". Devolve { root, code, sym, rollAt, next } ou null.
 */
export function activeContract(rootOrSym, date = new Date()) {
  const root = FUT_SPECS[rootOrSym] ? rootOrSym : rootOf(rootOrSym);
  if (!root) return null;
  const day = iso(toDate(date));
  const it = contracts(root, Number(day.slice(0, 4)) - 1);
  for (let c = it.next(); !c.done; c = it.next())
    if (c.value.rollAt > day) {
      const nx = it.next().value;
      return { ...c.value, next: { code: nx.code, sym: nx.sym, rollAt: nx.rollAt } };
    }
  return null;
}

/** Contratos vigentes entre duas datas (inclusive), do mais antigo ao mais novo: [{ sym, code, from, rollAt }]. */
export function contractsBetween(rootOrSym, from, to) {
  const a = activeContract(rootOrSym, from);
  if (!a) return [];
  const end = iso(toDate(to));
  const out = [];
  let start = iso(toDate(from));
  for (let c = a; c; c = activeContract(rootOrSym, c.rollAt)) {
    out.push({ sym: c.sym, code: c.code, from: start, rollAt: c.rollAt });
    if (c.rollAt > end) break;
    start = c.rollAt;
  }
  return out;
}

/**
 * Série contínua ajustada por razão (back-adjusted), do mais novo para o mais antigo.
 * dates: datas da série; cont: contínuo do Yahoo alinhado às datas (null = sem dado);
 * byContract: { "HEZ26.CME": { "AAAA-MM-DD": fechamento } }; segs: contractsBetween(...) da janela.
 * Em cada data usa o contrato vigente; sem ele, o contínuo. Na troca de fonte, a parte mais antiga é
 * multiplicada pela razão entre as duas fontes num mesmo pregão, então a troca nunca vira variação.
 * Valor do contínuo repetido enquanto o contrato vigente andou = congelado (descartado).
 * Devolve { close, src } (src[i] = símbolo do contrato ou "cont"; null = sem dado em nenhuma fonte).
 */
export function backAdjust(dates, cont, byContract, segs) {
  const n = dates.length;
  const close = new Array(n).fill(null);
  const src = new Array(n).fill(null);
  const ok = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
  const active = (d) => {
    for (let k = segs.length - 1; k >= 0; k--) if (d >= segs[k].from) return segs[k].sym;
    return null;
  };
  const kv = (sym, i) => (sym && i >= 0 && i < n ? byContract[sym]?.[dates[i]] : undefined);
  const cv = (i) => {
    if (i < 0 || i >= n || !ok(cont[i])) return undefined;
    // congelado: igual ao pregão anterior enquanto o contrato vigente mudou de preço
    const sym = active(dates[i]);
    const k0 = kv(sym, i);
    const k1 = kv(sym, i - 1);
    if (i > 0 && cont[i] === cont[i - 1] && ok(k0) && ok(k1) && k0 !== k1) return undefined;
    return cont[i];
  };
  const val = (s, i) => (s === "cont" ? cv(i) : kv(s, i));
  let factor = 1;
  let newer = null; // fonte do pregão seguinte (já ajustado)
  let newerI = -1;
  for (let i = n - 1; i >= 0; i--) {
    const sym = active(dates[i]);
    const s = ok(kv(sym, i)) ? sym : ok(cv(i)) ? "cont" : null;
    if (!s) continue;
    if (newer && s !== newer) {
      // razão entre as duas fontes num mesmo pregão: o mais novo em comum, a partir do ponto de troca
      let r = null;
      for (let j = newerI; j >= Math.max(0, i - 5) && r == null; j--) {
        const a = val(s, j);
        const b = val(newer, j);
        if (ok(a) && ok(b)) r = b / a;
      }
      factor *= r ?? val(newer, newerI) / val(s, i);
    }
    close[i] = val(s, i) * factor;
    src[i] = s;
    newer = s;
    newerI = i;
  }
  return { close, src };
}

/**
 * Histórico diário de um contínuo XX=F com o contrato vigente: { dates, close } de cada fonte (o contrato pode
 * faltar). Usa o contrato onde ele tem preço (inclusive antes de virar o vigente: é o mesmo ativo que será
 * acompanhado) e o contínuo antes disso, ajustado na emenda; pregões congelados do contínuo são descartados.
 * Devolve { dates, close, fut, contractFrom } (fut = código do contrato, ex.: "HEZ26").
 */
export function rollHistory(cont, k, active) {
  if (!k?.dates?.length) return cont ? { dates: cont.dates, close: cont.close, fut: null } : null;
  const toMap = (x) => Object.fromEntries((x?.dates ?? []).map((d, i) => [d, x.close[i]]));
  const cmap = toMap(cont);
  const dates = [...new Set([...(cont?.dates ?? []), ...k.dates])].sort();
  const r = backAdjust(
    dates,
    dates.map((d) => cmap[d] ?? null),
    { [active.sym]: toMap(k) },
    [{ sym: active.sym, from: "0000-00-00" }],
  );
  const keep = dates.map((_, i) => r.close[i] != null);
  const round = (v) => Math.round(v * 1e6) / 1e6;
  return {
    dates: dates.filter((_, i) => keep[i]),
    close: r.close.filter((_, i) => keep[i]).map(round),
    fut: active.code,
    contractFrom: k.dates[0],
  };
}
