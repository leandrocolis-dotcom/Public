// Long & Short: ciclo de vida MANUAL das ordens e idempotência das execuções (puro, imutável). O app não envia
// ordens à corretora: o usuário executa e registra. Porte do LivroDeRegistros de pendulo_motor_ref.py.
// Regras (JSON v4, motor.execucao): posição/risco/exposição só com quantidade executada; PARCIAL exige status do
// saldo (aberto bloqueia a mesma finalidade; encerrado libera o recálculo); registro com id único aplicado no
// máximo uma vez; alerta de stop não é execução.
import { FINAL_STATES } from "./ls-data.js";

const CLOSE_STATES = new Set(["CANCELADA", "REJEITADA", "EXPIRADA"]);

/** Ordem sugerida pelo motor vira registro SUGERIDA (id estável: o mesmo id não duplica). */
export function suggest(data, o, now = null) {
  if (data.orders.some((x) => x.id === o.id)) return data;
  const order = {
    qtyExec: 0,
    avgExec: null,
    status: "SUGERIDA",
    createdAt: now,
    updatedAt: now,
    ...o,
  };
  return { ...data, orders: [...data.orders, order] };
}

const patch = (data, id, fn) => {
  const i = data.orders.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`ordem ${id} não existe`);
  const orders = data.orders.slice();
  orders[i] = fn(orders[i]);
  return { ...data, orders };
};

/** Usuário enviou a ordem à corretora. */
export const markSent = (data, id, now = null) =>
  patch(data, id, (o) =>
    o.status === "SUGERIDA" ? { ...o, status: "ENVIADA", updatedAt: now } : o,
  );

/**
 * Registra uma execução { uid, orderId, qty, price, fees, ts }. Mesmo uid duas vezes: ignorado
 * (applied = false, posição muda uma vez só). Devolve { data, applied }.
 */
export function registerFill(data, fill) {
  if (!fill?.uid) throw new Error("execução sem id único");
  if (data.fills.some((f) => f.uid === fill.uid)) return { data, applied: false };
  if (!(fill.qty > 0)) throw new Error("quantidade executada deve ser > 0");
  const next = patch(data, fill.orderId, (o) => {
    const exec = (o.qtyExec ?? 0) + fill.qty;
    const avg = fill.price > 0 ? ((o.avgExec ?? 0) * (o.qtyExec ?? 0) + fill.price * fill.qty) / exec : o.avgExec; // prettier-ignore
    return { ...o, qtyExec: exec, avgExec: avg, status: exec >= o.qtySug ? "EXECUTADA" : "PARCIAL", updatedAt: fill.ts ?? null }; // prettier-ignore
  });
  return { data: { ...next, fills: [...next.fills, { fees: 0, ...fill }] }, applied: true };
}

/** Saldo de uma PARCIAL encerrado na corretora (cancelado, rejeitado ou expirado): libera o recálculo. */
export function closeRemainder(data, id, status, now = null) {
  if (!CLOSE_STATES.has(status)) throw new Error(`status de encerramento inválido: ${status}`);
  return patch(data, id, (o) => ({ ...o, status, updatedAt: now }));
}

/** Há ordem viva (enviada ou parcial com saldo aberto) com esta finalidade (e ativo, se dado)? */
export const blocksSamePurpose = (data, purpose, sym = null) =>
  data.orders.some((o) => o.purpose === purpose && (sym === null || o.sym === sym) && !FINAL_STATES.has(o.status) && o.status !== "SUGERIDA"); // prettier-ignore

/** Variação de posição (cotas) pelas execuções registradas: compras +, vendas −. */
export function positionDelta(data, sym) {
  let d = 0;
  for (const f of data.fills) {
    const o = data.orders.find((x) => x.id === f.orderId);
    if (!o || o.sym !== sym) continue;
    d += (o.side === "COMPRAR" || o.side === "COMPRAR_PARA_COBRIR" ? 1 : -1) * f.qty;
  }
  return d;
}

/** Residual de uma ordem (sugerida − executada), para EXE-02. */
export const residual = (o) => Math.max(0, (o.qtySug ?? 0) - (o.qtyExec ?? 0));
