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
  // Desde 26/11/2026 o conector do BTG não traz mais as posições do exterior ativo a ativo (get_offshore_position
  // saiu; get_balances só dá patrimônio, investido e caixa em US$). Foto parcial: Brasil + totais do exterior;
  // as posições ficam as da última foto completa (o banco as carrega, ver pendulo_btg_apply).
  const keep = off?.positions == null && raw.keepPositions === true;
  if (keep) {
    const ptax = n(raw.fx?.ptax);
    if (!(ptax > 0) || !DAY.test(raw.fx?.date ?? "")) return bad("câmbio inválido");
    if (!near(totalUsd * ptax, totalBrl, Math.max(5, totalBrl * 0.02))) return bad("total em reais não fecha com a PTAX"); // prettier-ignore
    return {
      ok: true,
      snap: {
        asOf: new Date(at).toISOString(),
        fx: { ptax, date: raw.fx.date.slice(0, 10) },
        onshore: { total: onTotal, items },
        offshore: {
          totalUsd,
          investedUsd,
          cashUsd,
          totalBrl,
          positions: null,
          positionsStale: true,
        },
      },
    };
  }
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

/**
 * PTAX de venda do dia útil mais recente (Banco Central, sem chave). Uso na rotina:
 * `node btg-snapshot.mjs ptax` → {"ptax":5.33,"date":"2026-11-26"}. now = hoje (testes).
 */
export async function fetchPtax(now = new Date(), get = fetch) {
  for (let back = 0; back < 8; back++) {
    const d = new Date(now.getTime() - back * 86400000);
    const mdY = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`; // prettier-ignore
    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${mdY}'&$format=json`; // prettier-ignore
    const r = await get(url).catch(() => null);
    const v = r?.ok ? (await r.json().catch(() => null))?.value?.at(-1) : null;
    if (v?.cotacaoVenda > 0)
      return { ptax: v.cotacaoVenda, date: String(v.dataHoraCotacao).slice(0, 10) };
  }
  return null;
}

if (typeof process !== "undefined" && process.argv?.[2] === "ptax" && import.meta.url === `file://${process.argv[1]}`)
  fetchPtax().then((r) => console.log(JSON.stringify(r))); // prettier-ignore
