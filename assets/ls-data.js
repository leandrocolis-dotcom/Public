// Long & Short: modelo de dados persistido e migração (puro). Mora em pendulo_ls.data (1 linha jsonb por
// usuário, RLS) e, para pares/plano/parâmetros/cadastro, em pendulo_settings (chaves pendulo.ls.*).
// Dado persistido é contrato: schemaVersion = 4; toda leitura passa por migrateLs, que lê formatos antigos.
import { ORDER_STATES, SCHEMA_VERSION } from "./ls-params.js";

export const PURPOSES = ["ENTRAR", "AUMENTAR", "REDUZIR", "ZERAR"];
export const FINAL_STATES = new Set(["EXECUTADA", "CANCELADA", "REJEITADA", "EXPIRADA"]);

export const emptyLs = () => ({
  schemaVersion: SCHEMA_VERSION,
  paramsVersion: null,
  legs: [],
  orders: [],
  fills: [],
  day: emptyDay(null),
});

/** Contadores do dia de trading (zeram às 4:00 ET). */
export const emptyDay = (date) => ({
  date,
  entries: 0,
  adds: {},
  stopsBySym: {},
  ignored: [],
  losses: 0,
  lastAdj: {},
  lastStop: {},
  realized: 0,
  maxPairPnl: {},
});

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * Vínculo de uma posição da Carteira ao L&S (migração v1→v4 das posições): dir = +1 se não informado,
 * hwm = max(pm, P) (mín. se dir = −1), stop vazio fica null (o motor gera alerta para definir).
 * `link` = o que já está gravado para o ativo (pode ser formato antigo, sem dir/hwm).
 */
export function legFromHolding(h, price, link = {}) {
  const dir = link.dir === -1 ? -1 : 1;
  const pm = num(h?.avg);
  const P = num(price);
  const stored = num(link.hwm);
  // hwm vale desde a última mudança de preço médio: se o pm mudou, recomeça
  const samePm = num(link.hwmAvg) === null || num(link.hwmAvg) === pm;
  let hwm = samePm ? stored : null;
  const cands = [hwm, pm, P].filter((x) => x !== null);
  hwm = cands.length ? (dir === 1 ? Math.max(...cands) : Math.min(...cands)) : null;
  return {
    sym: String(h?.sym ?? "").toUpperCase(),
    pairId: link.pairId ?? null,
    leg: link.leg === "short" ? "short" : link.leg === "long" ? "long" : null,
    dir,
    qty: num(h?.qty),
    avg: pm,
    stop: num(link.stop),
    hwm,
    hwmAvg: pm,
    partialDone: !!link.partialDone,
    entryTs: link.entryTs ?? null,
    entryUnder: num(link.entryUnder),
    entryPrice: num(link.entryPrice) ?? pm,
    sessions: num(link.sessions) ?? 0,
    borrow: link.borrow ?? null,
    recall: !!link.recall,
  };
}

/**
 * Lê qualquer versão gravada e devolve v4. v3→v4: ordem sem status com residual aberto vira ENVIADA com
 * needsConfirm (pede confirmação do usuário); sem residual, EXECUTADA. Status desconhecido = erro (não some).
 * Devolve { data, migrated, errors }.
 */
export function migrateLs(raw) {
  if (raw == null) return { data: emptyLs(), migrated: false, errors: [] };
  if (typeof raw !== "object")
    return { data: emptyLs(), migrated: false, errors: ["formato inválido"] };
  const v = num(raw.schemaVersion) ?? 3;
  if (v > SCHEMA_VERSION)
    return {
      data: null,
      migrated: false,
      errors: [`versão ${v} mais nova que o app (${SCHEMA_VERSION})`],
    };
  const errors = [];
  const orders = (raw.orders ?? []).map((o) => {
    if (o.status) {
      if (!ORDER_STATES.includes(o.status))
        errors.push(`ordem ${o.id}: status ${o.status} desconhecido`);
      return o;
    }
    const left = (num(o.qtySug) ?? 0) - (num(o.qtyExec) ?? 0);
    return left > 0
      ? { ...o, status: "ENVIADA", needsConfirm: true }
      : { ...o, status: "EXECUTADA" };
  });
  const data = {
    ...emptyLs(),
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    legs: Array.isArray(raw.legs) ? raw.legs : [],
    orders,
    fills: Array.isArray(raw.fills) ? raw.fills : [],
    day: { ...emptyDay(null), ...(raw.day ?? {}) },
  };
  return { data, migrated: v < SCHEMA_VERSION, errors };
}

/** Par { id, name, long, short }: tickers diferentes e válidos. Devolve { ok, pair, errors }. */
export function makePair(f) {
  const t = (s) =>
    String(s ?? "")
      .trim()
      .toUpperCase();
  const long = t(f?.long);
  const short = t(f?.short);
  const errors = [];
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(long)) errors.push("ponta long inválida");
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(short)) errors.push("ponta short inválida");
  if (long && long === short) errors.push("as duas pontas são o mesmo ativo");
  if (errors.length) return { ok: false, pair: null, errors };
  const name =
    String(f?.name ?? "")
      .trim()
      .slice(0, 40) || `${long} × ${short}`;
  return { ok: true, pair: { id: f?.id ?? `${long}-${short}`, name, long, short }, errors };
}

/**
 * Plano do dia: { date, capital, pairs: { id: { bias, trigger, dirPlan } }, filledAt }. Vale só para o dia de
 * trading `today` (AAAA-MM-DD, ET). Devolve { ok, errors }: sem plano válido de hoje, compras bloqueadas (PRE-01).
 */
export function checkPlan(plan, today) {
  const errors = [];
  if (!plan || typeof plan !== "object") return { ok: false, errors: ["sem plano do dia"] };
  if (plan.date !== today) errors.push("plano não é de hoje");
  if (!(num(plan.capital) > 0)) errors.push("capital do dia inválido");
  for (const [id, p] of Object.entries(plan.pairs ?? {})) {
    if (!["alta", "baixa", "neutro"].includes(p?.bias)) errors.push(`${id}: viés inválido`);
    if (!String(p?.trigger ?? "").trim()) errors.push(`${id}: gatilho vazio`);
    if (num(p?.dirPlan) === null) errors.push(`${id}: exposição direcional planejada inválida`);
  }
  return { ok: errors.length === 0, errors };
}
