// Comparador de renda fixa brasileira (Carteira › Renda fixa BR). Puro, sem DOM: a tela fica em fixed-income-view.js.
// Mesmo valor e prazo para todos; bruto, impostos pela lei vigente (pessoa física) e líquido em R$ e em %.
//
// Regras (pessoa física, novembro de 2026; a MP 1.303/2025, que unificava o IR em 17,5% e tributava LCI/LCA,
// perdeu a validade em 08/10/2025 sem virar lei):
// - IR regressivo (Lei 11.033/2004): até 180 dias 22,5%; 181 a 360 20%; 361 a 720 17,5%; acima de 720 15%.
//   Vale para CDB, LC, RDB, Tesouro Direto, debêntures comuns e fundos.
// - IOF regressivo (Decreto 6.306/2007) sobre o rendimento no resgate antes de 30 dias (96% no 1º dia a 0% no 30º).
// - Isentos de IR para PF: LCI, LCA, CRI, CRA, debênture incentivada (Lei 12.431/2011) e poupança.
// - Fundo DI de longo prazo: come-cotas de 15% em maio e novembro (aqui: a cada 6 meses) e complemento no resgate.
// - Tesouro Direto: custódia da B3 de 0,20% a.a. (Tesouro Selic isento até R$ 10 mil).
// - Poupança (Selic > 8,5%): 0,5% ao mês + TR.
// Material educacional; não é recomendação de investimento.

/** Tabela regressiva do IR: alíquota pelo prazo em dias corridos. */
export function irRate(days) {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

const IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3]; // prettier-ignore
/** IOF sobre o rendimento: fração (0,96 no 1º dia; 0 a partir do 30º). */
export const iofRate = (days) => (days >= 30 || days < 1 ? 0 : IOF[Math.floor(days) - 1] / 100);

/** Dias úteis aproximados de um prazo em dias corridos (252 por 365). */
export const businessDays = (days) => Math.max(0, Math.round((days * 252) / 365));

/** Produtos: tributação e como a taxa é cotada. */
export const KINDS = {
  cdb: { label: "CDB", tax: "ir", fgc: true },
  lc: { label: "LC / RDB", tax: "ir", fgc: true },
  lci: { label: "LCI", tax: "free", fgc: true, minDays: 270 },
  lca: { label: "LCA", tax: "free", fgc: true, minDays: 270 },
  cri: { label: "CRI", tax: "free" },
  cra: { label: "CRA", tax: "free" },
  debi: { label: "Debênture incentivada", tax: "free" },
  deb: { label: "Debênture comum", tax: "ir" },
  tselic: { label: "Tesouro Selic", tax: "ir", custody: true, selicFree: true, idx: "selic" },
  tpre: { label: "Tesouro Prefixado", tax: "ir", custody: true, idx: "pre" },
  tipca: { label: "Tesouro IPCA+", tax: "ir", custody: true, idx: "ipca" },
  fundo: { label: "Fundo DI", tax: "fund" },
  poup: { label: "Poupança", tax: "free", fgc: true, idx: "poup" },
};

/** Indexadores aceitos por produto (o primeiro é o padrão). */
export const IDX = {
  cdi: "% do CDI",
  cdis: "CDI + % a.a.",
  pre: "Pré % a.a.",
  ipca: "IPCA + % a.a.",
  selic: "Selic + % a.a.",
  poup: "Poupança",
};
export const idxFor = (kind) => {
  const k = KINDS[kind];
  if (k?.idx) return [k.idx];
  if (kind === "fundo") return ["cdi"];
  return ["cdi", "cdis", "pre", "ipca"];
};

/** Fator bruto de um indexador no prazo (macro em % a.a.: cdi, selic, ipca, tr). */
export function grossFactor({ idx, rate }, days, m) {
  const du = businessDays(days);
  const r = (Number(rate) || 0) / 100;
  const cdi = (m.cdi ?? 0) / 100;
  if (idx === "cdi") return (1 + ((1 + cdi) ** (1 / 252) - 1) * r) ** du;
  if (idx === "cdis") return ((1 + cdi) * (1 + r)) ** (du / 252);
  if (idx === "pre") return (1 + r) ** (du / 252);
  if (idx === "ipca") return ((1 + (m.ipca ?? 0) / 100) * (1 + r)) ** (du / 252);
  if (idx === "selic") return ((1 + (m.selic ?? m.cdi ?? 0) / 100) * (1 + r)) ** (du / 252);
  if (idx === "poup") return (1.005 ** 12 * (1 + (m.tr ?? 0) / 100)) ** (days / 365);
  return 1;
}

/**
 * Simula um produto: { kind, idx, rate, fee? } com valor `amount` e prazo `days` (dias corridos).
 * Devolve bruto, IR, IOF, custódia/come-cotas e líquido, em R$ e em %.
 */
export function simulate(p, amount, days, m) {
  const k = KINDS[p.kind] ?? KINDS.cdb;
  const idx = idxFor(p.kind).includes(p.idx) ? p.idx : idxFor(p.kind)[0];
  const P = Number(amount) || 0;
  const gross = P * grossFactor({ idx, rate: p.rate }, days, m);
  const gain = gross - P;
  let iof = 0;
  let ir = 0;
  let other = 0; // custódia (Tesouro) ou come-cotas (fundo)
  let otherLabel = null;
  if (k.tax === "ir" || k.tax === "fund") iof = Math.max(0, gain) * iofRate(days);
  if (k.tax === "ir") ir = Math.max(0, gain - iof) * irRate(days);
  if (k.tax === "fund") {
    // come-cotas de 15% a cada 6 meses sobre o ganho do semestre; o que sai deixa de render
    const steps = Math.floor(days / 182);
    let bal = P;
    let paid = 0;
    let done = 0;
    for (let i = 0; i < steps; i++) {
      const f = grossFactor({ idx, rate: p.rate }, 182, m);
      const g = bal * (f - 1);
      const t = Math.max(0, g) * 0.15;
      bal = bal + g - t;
      paid += t;
      done += 182;
    }
    const rest = days - done;
    const end = bal * grossFactor({ idx, rate: p.rate }, rest, m);
    const totGain = end + paid - P;
    const iofF = Math.max(0, end - bal) * iofRate(days);
    const due = Math.max(0, (totGain - iofF) * irRate(days) - paid);
    iof = iofF;
    ir = due;
    other = paid;
    otherLabel = paid > 0 ? "come-cotas" : null;
    const net = end - iofF - due;
    return pack({ p, k, idx, P, gross: end + paid, gain: end + paid - P, ir, iof, other, otherLabel, net, days, m }); // prettier-ignore
  }
  if (k.custody && !(k.selicFree && P <= 10000)) {
    other = (1.002 ** (days / 365) - 1) * ((P + gross) / 2); // 0,20% a.a. sobre o saldo médio
    otherLabel = "custódia B3";
  }
  const net = gross - iof - ir - other;
  return pack({ p, k, idx, P, gross, gain, ir, iof, other, otherLabel, net, days, m });
}

function pack({ p, k, idx, P, gross, gain, ir, iof, other, otherLabel, net, days, m }) {
  const netGain = net - P;
  const yrs = days / 365;
  const netPct = P > 0 ? netGain / P : null;
  const netAA = P > 0 && yrs > 0 ? (net / P) ** (1 / yrs) - 1 : null;
  const cdiPeriod = grossFactor({ idx: "cdi", rate: 100 }, days, m) - 1;
  return {
    id: p.id,
    kind: p.kind,
    label: p.name?.trim() || k.label,
    kindLabel: k.label,
    idx,
    rate: Number(p.rate) || 0,
    tax: k.tax,
    fgc: !!k.fgc,
    amount: P,
    gross,
    grossGain: gain,
    grossPct: P > 0 ? gain / P : null,
    irRate: k.tax === "free" ? 0 : irRate(days),
    ir,
    iof,
    other,
    otherLabel,
    net,
    netGain,
    netPct,
    netAA,
    // rendimento líquido em % do CDI bruto do mesmo prazo (régua comum do mercado)
    netPctCdi: cdiPeriod > 0 && netPct !== null ? netPct / cdiPeriod : null,
    shortWarn: k.minDays && days < k.minDays ? `${k.label} tem prazo mínimo de carência (CMN); prazo curto pode não existir no mercado.` : null, // prettier-ignore
  };
}

/** Taxa (% do CDI) que um CDB precisa pagar para empatar, no líquido, com o produto isento dado. */
export function cdbEquivalent(net, amount, days, m) {
  if (!(amount > 0) || !(net > 0)) return null;
  let lo = 0;
  let hi = 400;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const v = simulate({ kind: "cdb", idx: "cdi", rate: mid }, amount, days, m).net;
    if (v < net) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Atalho do mercado: isento a X% do CDI equivale a CDB a X ÷ (1 − IR) (sem IOF, sem capitalização). */
export const grossUp = (pctCdi, days) => pctCdi / (1 - irRate(days));

/** Compara uma lista de produtos: resultados ordenados pelo líquido, com o CDB equivalente dos isentos. */
export function compare(products, amount, days, m) {
  const rows = (products ?? [])
    .filter((p) => KINDS[p.kind])
    .map((p) => {
      const r = simulate(p, amount, days, m);
      return { ...r, cdbEq: r.tax === "free" ? cdbEquivalent(r.net, amount, days, m) : null };
    })
    .sort((a, b) => b.net - a.net);
  const best = rows[0]?.net ?? null;
  return rows.map((r, i) => ({ ...r, rank: i + 1, vsBest: best !== null ? r.net - best : null }));
}

/** Carteira de exemplo (taxas editáveis; não são ofertas reais). */
export const DEFAULT_PRODUCTS = [
  { id: "a", kind: "cdb", idx: "cdi", rate: 100 },
  { id: "b", kind: "cdb", idx: "cdi", rate: 110 },
  { id: "c", kind: "lci", idx: "cdi", rate: 90 },
  { id: "d", kind: "lca", idx: "cdi", rate: 92 },
  { id: "e", kind: "tselic", idx: "selic", rate: 0.05 },
  { id: "f", kind: "tpre", idx: "pre", rate: 13.5 },
  { id: "g", kind: "tipca", idx: "ipca", rate: 7.5 },
  { id: "h", kind: "cra", idx: "ipca", rate: 7 },
  { id: "i", kind: "debi", idx: "ipca", rate: 7.2 },
  { id: "j", kind: "fundo", idx: "cdi", rate: 98 },
  { id: "k", kind: "poup", idx: "poup", rate: 0 },
];

export const TERMS = [
  [90, "3 meses"],
  [180, "6 meses"],
  [365, "1 ano"],
  [730, "2 anos"],
  [1095, "3 anos"],
  [1825, "5 anos"],
];
