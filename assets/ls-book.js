// Long & Short: livro do dia, execução manual, diário e reconciliação (puro, imutável, sem rede/relógio).
// Fases 8–10 de docs/PLANO-LONG-SHORT.md. Estado em pendulo_ls.data (assets/ls-data.js, schema v4) com:
//   links  { SYM: { stop, hwm, hwmAvg, partialDone, entryUnder, entryPrice, entryTs, sessions, lastLot } }
//   orders/fills (assets/ls-orders.js), day (contadores do dia), journal [], trips { data: { id: n } }
// Posição real = foto da Carteira (BTG/✎) + execuções registradas DEPOIS da foto (as anteriores já estão nela).
import { emptyDay, migrateLs } from "./ls-data.js";
import { closeRemainder, markSent, registerFill, suggest } from "./ls-orders.js";
import { isRiskAlert } from "./ls-alerts.js";
import { PARAMS } from "./ls-params.js";

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const REDUCE = new Set(["REDUZIR", "ZERAR"]);
const BUY_SIDES = new Set(["COMPRAR", "COMPRAR_PARA_COBRIR"]);

/** Lê o que veio da nuvem/aparelho e garante os campos do livro. { data, errors, migrated }. */
export function loadBook(raw) {
  const r = migrateLs(raw);
  if (!r.data) return r;
  const d = r.data;
  return { ...r, data: { ...d, links: d.links ?? {}, journal: d.journal ?? [], trips: d.trips ?? {} } }; // prettier-ignore
}

/**
 * Virada do dia de trading (4:00 ET): contadores zeram; pontas que dormiram posicionadas ganham +1 pregão
 * carregado. `held` = tickers com posição agora.
 */
export function rollDay(data, day, held = []) {
  if (data.day?.date === day) return data;
  const links = { ...data.links };
  if (data.day?.date) for (const s of held) links[s] = { ...(links[s] ?? {}), sessions: (links[s]?.sessions ?? 0) + 1 }; // prettier-ignore
  return { ...data, links, day: emptyDay(day) };
}

/** Variação de cotas por execuções registradas depois da foto da Carteira (`photoMs`). */
export function deltaSince(data, sym, photoMs) {
  let d = 0;
  for (const f of data.fills) {
    if (fin(photoMs) && fin(f.ts) && f.ts <= photoMs) continue;
    const o = data.orders.find((x) => x.id === f.orderId);
    if (o?.sym !== sym) continue;
    d += (BUY_SIDES.has(o.side) ? 1 : -1) * f.qty;
  }
  return d;
}

/** Melhor preço a favor desde a última mudança de preço médio (dir +1: máximo). Devolve links novos ou os mesmos. */
export function trackHwm(data, sym, { avg, price, dir = 1 }) {
  const cur = data.links[sym] ?? {};
  if (!fin(price) || !fin(avg)) return data;
  const same = cur.hwmAvg === avg && fin(cur.hwm);
  const cands = [same ? cur.hwm : avg, price];
  const hwm = dir === 1 ? Math.max(...cands) : Math.min(...cands);
  if (same && hwm === cur.hwm) return data;
  return { ...data, links: { ...data.links, [sym]: { ...cur, hwm, hwmAvg: avg } } };
}

/** O usuário definiu ou atualizou o stop na corretora. Stop só se aproxima, exceto o primeiro. */
export function setStop(data, sym, stop, { dir = 1, force = false } = {}) {
  if (!(stop > 0)) throw new Error("stop deve ser maior que zero");
  const cur = data.links[sym]?.stop;
  if (!force && fin(cur) && (dir === 1 ? stop < cur : stop > cur)) throw new Error("o stop só se aproxima do preço: não pode afastar"); // prettier-ignore
  return { ...data, links: { ...data.links, [sym]: { ...(data.links[sym] ?? {}), stop } } };
}

/**
 * "Executei": registra a execução da ordem sugerida `order` (saída de computeLs) com { uid, qty, price, fees,
 * ts, remainder: "aberto" | "cancelado" | null, avg (preço médio antes), dir, S (subjacente agora), R }.
 * Mesmo uid duas vezes não muda nada (applied = false). Atualiza contadores, stop, diário e realizado.
 */
export function recordExecution(data, order, f) {
  if (!f?.uid) throw new Error("execução sem id único");
  if (!(f.qty > 0) || !(f.price > 0))
    throw new Error("quantidade e preço precisam ser maiores que zero");
  if (data.fills.some((x) => x.uid === f.uid)) return { data, applied: false };
  let d = suggest(data, { id: order.id, pairId: order.pairId, sym: order.sym, purpose: order.purpose, side: order.side, qtySug: order.qty, limit: order.limit, stop: order.stop, reason: order.reason, alert: order.alert, episode: order.episode ?? null }, f.ts); // prettier-ignore
  const prev = d.orders.find((o) => o.id === order.id);
  if (prev && ["EXECUTADA", "CANCELADA", "REJEITADA", "EXPIRADA"].includes(prev.status)) throw new Error("ordem já encerrada"); // prettier-ignore
  d = markSent(d, order.id, f.ts);
  const r = registerFill(d, { uid: f.uid, orderId: order.id, qty: f.qty, price: f.price, fees: f.fees ?? 0, ts: f.ts }); // prettier-ignore
  d = r.data;
  const o = d.orders.find((x) => x.id === order.id);
  if (o.status === "PARCIAL" && f.remainder === "cancelado") d = closeRemainder(d, order.id, "CANCELADA", f.ts); // prettier-ignore
  const sym = order.sym;
  const day = { ...d.day, done: { ...(d.day.done ?? {}) }, lastAdj: { ...d.day.lastAdj }, adds: { ...d.day.adds }, stopsBySym: { ...d.day.stopsBySym }, lastStop: { ...d.day.lastStop }, reduced: { ...(d.day.reduced ?? {}) } }; // prettier-ignore
  const link = { ...(d.links[sym] ?? {}) };
  const dir = f.dir === -1 ? -1 : 1;
  let realized = null;
  if (order.episode) day.done[`${sym}|${order.episode}`] = true;
  if (["P5", "P6", "P7"].includes(order.reason)) day.lastAdj[sym] = f.ts;
  if (REDUCE.has(order.purpose)) {
    realized = fin(f.avg) ? dir * (f.price - f.avg) * f.qty - (f.fees ?? 0) : null;
    if (fin(realized)) {
      day.realized = (day.realized ?? 0) + realized;
      if (order.purpose === "ZERAR" && realized < 0) {
        day.losses = (day.losses ?? 0) + 1;
        day.lastLossAt = f.ts;
      } else if (realized > 0) day.losses = 0;
    }
    if (order.alert === "DEC-07" || order.alert === "SES-03") {
      day.lastStop[sym] = f.ts;
      day.stopsBySym[sym] = (day.stopsBySym[sym] ?? 0) + 1;
    }
    if (order.reason === "P3" && order.pairId) day.reduced[order.pairId] = [...new Set([...(day.reduced[order.pairId] ?? []), sym])]; // prettier-ignore
    if (order.reason === "P5" && order.alert === "DEC-04") link.partialDone = true;
    if (order.purpose === "ZERAR" && o.status === "EXECUTADA") Object.assign(link, { stop: null, hwm: null, hwmAvg: null, partialDone: false, sessions: 0, entryUnder: null, entryPrice: null }); // prettier-ignore
  } else {
    if (order.reason === "P6") day.adds[sym] = (day.adds[sym] ?? 0) + 1;
    if (order.reason === "P7") {
      day.entries = (day.entries ?? 0) + 1;
      Object.assign(link, { entryTs: f.ts, entryPrice: f.price, entryUnder: fin(f.S) ? f.S : null, sessions: 0, partialDone: false }); // prettier-ignore
    }
    if (fin(order.stop)) link.stop = fin(link.stop) && order.reason === "P6" ? (dir === 1 ? Math.max(link.stop, order.stop) : Math.min(link.stop, order.stop)) : order.stop; // prettier-ignore
    link.lastLot = f.qty;
  }
  const journal = [...(d.journal ?? []), { ts: f.ts, kind: "exec", alertId: order.alert ?? order.reason, reason: order.reason, sym, purpose: order.purpose, side: order.side, qty: f.qty, qtySug: order.qty, price: f.price, fees: f.fees ?? 0, followed: true, realized, pnlR: fin(realized) && f.R > 0 ? realized / f.R : null }]; // prettier-ignore
  return { data: { ...d, day, links: { ...d.links, [sym]: link }, journal }, applied: r.applied };
}

/** Saldo de uma parcial: "aberto" mantém a ordem viva (bloqueia a mesma finalidade); "cancelado" libera. */
export function answerRemainder(data, orderId, answer, ts) {
  if (answer === "aberto") return data;
  return closeRemainder(data, orderId, answer === "rejeitado" ? "REJEITADA" : answer === "expirado" ? "EXPIRADA" : "CANCELADA", ts); // prettier-ignore
}

/** "Ignorar": alerta de risco exige motivo; conta para o BEH-01 (2 em 30 min bloqueiam entradas). */
export function recordIgnore(data, { id, sym = null, why = "", ts, orderId = null }) {
  const risk = isRiskAlert(id);
  if (risk && String(why).trim().length < 3)
    throw new Error("escreva o motivo para ignorar um alerta de risco");
  const day = { ...data.day, ignored: [...(data.day.ignored ?? []), { ts, id, sym, risk }] };
  const journal = [...(data.journal ?? []), { ts, kind: "ignore", alertId: id, sym, orderId, followed: false, why: String(why).slice(0, 280), realized: null }]; // prettier-ignore
  return { ...data, day, journal };
}

/** Contadores derivados para o motor: alertas de risco ignorados nos últimos 30 min. */
export function dayForEngine(data, now) {
  const d = data.day ?? {};
  const ignoredRisk30 = (d.ignored ?? []).filter((x) => x.risk && now - x.ts < 30 * 60000).length;
  return { ...d, ignoredRisk30 };
}

/** Ordens vivas (enviadas ou parciais com saldo aberto) no formato que o motor espera. */
export const liveOrders = (data) => data.orders.filter((o) => o.status === "ENVIADA" || o.status === "PARCIAL"); // prettier-ignore

/** Travas acionadas hoje (para o relatório): conta cada id uma vez por dia. */
export function noteTrips(data, ids, day) {
  const today = { ...(data.trips?.[day] ?? {}) };
  let changed = false;
  for (const id of ids) if (!today[id]) ((today[id] = 1), (changed = true));
  return changed ? { ...data, trips: { ...data.trips, [day]: today } } : data;
}

/** Leitura do crítico confirmada ("Li e entendi"), por alerta e dia. */
export const ackCritical = (data, id) => ({ ...data, day: { ...data.day, ack: { ...(data.day.ack ?? {}), [id]: true } } }); // prettier-ignore

/**
 * Reconciliação ao abrir (Fase 9): Carteira × ordens abertas × execuções × stops. Compras ficam bloqueadas
 * (blocker REC) enquanto houver pendência. rows = posições { sym, qty }; photoMs = horário da foto.
 */
export function reconcile({ data, rows, photoMs, now, loaded = true, migrationErrors = [] }) {
  const issues = [];
  if (!loaded)
    issues.push({ id: "estado", msg: "estado do Long & Short ainda não carregado da nuvem" });
  for (const e of migrationErrors) issues.push({ id: "migracao", msg: e });
  for (const o of data.orders) {
    if (o.needsConfirm && !["EXECUTADA", "CANCELADA", "REJEITADA", "EXPIRADA"].includes(o.status)) issues.push({ id: "confirmar", msg: `confirme a ordem ${o.sym} (${o.purpose}) da versão anterior`, orderId: o.id }); // prettier-ignore
    if ((o.status === "ENVIADA" || o.status === "PARCIAL") && fin(o.updatedAt) && now - o.updatedAt > 18 * 3600000) issues.push({ id: "antiga", msg: `ordem ${o.sym} (${o.purpose}) aberta desde o pregão anterior: está viva na corretora?`, orderId: o.id }); // prettier-ignore
  }
  const held = Object.fromEntries((rows ?? []).map((r) => [r.sym, r.qty]));
  const syms = new Set([...Object.keys(held), ...data.orders.map((o) => o.sym)]);
  for (const s of syms) {
    const q = (held[s] ?? 0) + deltaSince(data, s, photoMs);
    if (q < 0) issues.push({ id: "divergencia", msg: `${s}: execuções registradas somam mais vendas do que a posição (${q})`, sym: s }); // prettier-ignore
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Relatório do modo registro (Fase 10): seguidas × ignoradas, resultado e queda máxima de cada grupo, alertas
 * mais ignorados e travas mais acionadas. Ignorada não tem execução: o resultado dela é o da ordem que NÃO foi
 * feita, então entra só a contagem (a comparação de P&L usa as execuções seguidas × o dia sem a ordem).
 */
export function registerReport(data, p = PARAMS) {
  const j = data.journal ?? [];
  const followed = j.filter((x) => x.followed);
  const ignored = j.filter((x) => !x.followed);
  const curve = (xs) => {
    let acc = 0;
    let peak = 0;
    let dd = 0;
    for (const x of xs) {
      acc += x.realized ?? 0;
      peak = Math.max(peak, acc);
      dd = Math.min(dd, acc - peak);
    }
    return { pnl: acc, maxDD: dd };
  };
  const byId = (xs) => Object.entries(xs.reduce((m, x) => ((m[x.alertId] = (m[x.alertId] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]); // prettier-ignore
  const trips = {};
  for (const day of Object.values(data.trips ?? {})) for (const [id, n] of Object.entries(day)) trips[id] = (trips[id] ?? 0) + n; // prettier-ignore
  const days = new Set(j.map((x) => new Date(x.ts).toISOString().slice(0, 10))).size;
  return {
    days,
    followed: { n: followed.length, ...curve(followed), pnlR: followed.reduce((s, x) => s + (x.pnlR ?? 0), 0), fees: followed.reduce((s, x) => s + (x.fees ?? 0), 0) }, // prettier-ignore
    ignored: { n: ignored.length, risk: ignored.filter((x) => isRiskAlert(x.alertId)).length },
    topIgnored: byId(ignored).slice(0, 5),
    topTrips: Object.entries(trips)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    ready: days >= 10,
    note: `Modo registro: ${p.max_entradas_dia} entradas/dia no máximo; decidir manter ou ajustar parâmetros só com 10+ pregões.`,
  };
}
