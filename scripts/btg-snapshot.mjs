// Confere a leitura do BTG antes de gravar (puro, testado). Os números passam por um modelo de linguagem,
// então cada posição é recalculada e os totais precisam fechar; qualquer divergência recusa a foto inteira.
const n = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const SYM = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
const DAY = /^\d{4}-\d{2}-\d{2}/;
const MAX_AGE = 24 * 3600 * 1000;
const bad = (why) => ({ ok: false, why });

export function checkSnapshot(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return bad("leitura vazia");
  if (raw.unsupported) return bad(`posição não suportada: ${String(raw.unsupported).slice(0, 80)}`);
  const at = Date.parse(raw.asOf);
  if (!Number.isFinite(at) || at > now + 300000 || now - at > MAX_AGE) return bad("data da foto inválida"); // prettier-ignore

  const on = raw.onshore;
  const off = raw.offshore;
  const onTotal = n(on?.total);
  if (onTotal == null || onTotal < 0 || !Array.isArray(on.items)) return bad("conta Brasil incompleta"); // prettier-ignore
  const items = [];
  for (const i of on.items) {
    if (
      n(i?.value) == null ||
      i.value < 0 ||
      typeof i.name !== "string" ||
      !i.name.trim() ||
      !DAY.test(i.date ?? "")
    )
      // prettier-ignore
      return bad("item da conta Brasil inválido");
    const cost = i.cost == null ? null : n(i.cost);
    if (i.cost != null && !(cost >= 0)) return bad("valor aplicado inválido no Brasil");
    items.push({ name: i.name.trim().slice(0, 120), value: i.value, date: i.date.slice(0, 10), ...(cost != null ? { cost } : {}) }); // prettier-ignore
  }
  if (!near(items.reduce((a, i) => a + i.value, 0), onTotal, 1)) return bad("itens do Brasil não fecham com o total"); // prettier-ignore

  const [totalUsd, investedUsd, cashUsd, totalBrl] = [off?.totalUsd, off?.investedUsd, off?.cashUsd, off?.totalBrl].map(n); // prettier-ignore
  if ([totalUsd, investedUsd, cashUsd, totalBrl].some((x) => x == null || x < 0)) return bad("conta internacional incompleta"); // prettier-ignore
  if (!near(investedUsd + cashUsd, totalUsd, 1)) return bad("investido + caixa não fecha com o total"); // prettier-ignore
  if (!Array.isArray(off.positions) || !off.positions.length) return bad("leitura sem posições");

  const positions = [];
  for (const p of off.positions) {
    const [qty, avg, price, value, cost] = [p?.qty, p?.avg, p?.price, p?.value, p?.cost].map(n);
    if (
      !SYM.test(p?.sym ?? "") ||
      !(qty > 0) ||
      !(avg >= 0) ||
      !(price > 0) ||
      !(value > 0) ||
      !(cost >= 0)
    )
      // prettier-ignore
      return bad("posição com campo inválido");
    if (!near(qty * price, value, Math.max(0.05, value * 0.01))) return bad(`${p.sym}: quantidade × preço não fecha`); // prettier-ignore
    if (!near(qty * avg, cost, Math.max(0.05, cost * 0.01))) return bad(`${p.sym}: quantidade × preço médio não fecha`); // prettier-ignore
    positions.push({ sym: p.sym, qty, avg, price, value, cost });
  }
  if (new Set(positions.map((p) => p.sym)).size !== positions.length) return bad("ticker repetido");
  const sum = positions.reduce((a, p) => a + p.value, 0);
  if (!near(sum, investedUsd, Math.max(1, investedUsd * 0.01))) return bad("posições não fecham com o investido"); // prettier-ignore

  const ptax = n(raw.fx?.ptax);
  if (!(ptax > 0) || !DAY.test(raw.fx?.date ?? "")) return bad("câmbio inválido");
  return {
    ok: true,
    snap: {
      asOf: new Date(at).toISOString(),
      fx: { ptax, date: raw.fx.date.slice(0, 10) },
      onshore: { total: onTotal, items },
      offshore: { totalUsd, investedUsd, cashUsd, totalBrl, positions },
    },
  };
}
