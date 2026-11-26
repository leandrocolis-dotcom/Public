// Modelos de rebalanceamento (puros): transformam os pesos-alvo estratégicos em alvos efetivos
// para o rebalance() de assets/rebalance.js. Cada modelo devolve { targets: [{ sym, w }], lines, warn }.
// Material educacional; não é recomendação de investimento.
import { decSep, intTxt } from "./format.js";

export const MODELS = [
  {
    id: "constant",
    label: "Mix constante",
    desc: "Volta todos os ativos aos pesos-alvo a cada rebalanceamento: vende o que subiu, compra o que caiu.",
    how: "Como interpretar: é o modelo de referência. A lista de operações mostra o necessário para zerar todos os desvios. Disciplina máxima (vende na alta, compra na baixa), mas gera mais negociações e custos.",
  },
  {
    id: "bands",
    label: "Bandas percentuais (tolerância)",
    desc: "Só age quando um ativo sai da banda de tolerância (ex.: regra 5/25: ±5 p.p. ou ±25% do próprio peso).",
    how: "Como interpretar: se nada aparece para negociar, todos os ativos estão dentro da tolerância e o modelo manda esperar. Bandas largas = menos operações e custo; bandas estreitas = carteira mais colada ao alvo.",
  },
  {
    id: "calendar",
    label: "Periódico (calendário)",
    desc: "Volta aos pesos-alvo em datas fixas (mensal, trimestral…), contadas a partir do último rebalanceamento aplicado.",
    how: "Como interpretar: fora da data marcada o modelo não mexe, mesmo com desvio grande. Mostra quando é o próximo rebalanceamento. Simples e previsível, mas ignora o que acontece entre as datas.",
  },
  {
    id: "contrib",
    label: "Só aportes (sem vender)",
    desc: "Usa o dinheiro novo para comprar o que está abaixo do alvo, sem vender nada. Num resgate, vende só o que está acima do alvo.",
    how: "Como interpretar: as compras somam o valor do aporte e nenhuma venda aparece. Aproxima a carteira do alvo sem realizar lucro (bom para impostos), mas pode não corrigir desvios grandes de uma vez.",
  },
  {
    id: "cppi",
    label: "CPPI (piso + multiplicador)",
    desc: "Constant Proportion Portfolio Insurance: exposição ao risco = multiplicador × (valor − piso). O resto vai para o ativo seguro.",
    how: "Como interpretar: o colchão é o valor acima do piso. Quanto maior o colchão, mais risco o modelo compra; perto do piso, quase tudo vai para o ativo seguro. Protege em quedas longas, mas compra na alta e vende na baixa (sofre em mercado lateral).",
  },
  {
    id: "tipp",
    label: "TIPP (piso móvel)",
    desc: "Como o CPPI, mas o piso sobe junto com o pico da carteira (ex.: 80% do maior valor já registrado) e nunca desce.",
    how: 'Como interpretar: mesma leitura do CPPI, mas o piso acompanha o pico registrado e trava ganhos. Depois de uma alta, a carteira fica mais defensiva mais cedo. Use "Zerar pico" para recomeçar a contagem.',
  },
];

export const FREQS = [
  [1, "Mensal"],
  [3, "Trimestral"],
  [6, "Semestral"],
  [12, "Anual"],
];
export const BAND_MODES = [
  ["all", "rebalancear a carteira toda"],
  ["only", "rebalancear só os ativos fora da banda"],
  ["edge", "levar só até a borda da banda"],
];

export const MODEL_DEFAULTS = {
  band: 5, // p.p.
  rel: 25, // % do peso-alvo (0 = desliga)
  bandMode: "all",
  freq: 3, // meses
  floor: "", // US$ (CPPI); vazio = floorPct do valor atual, fixado ao aplicar
  floorPct: 80,
  mult: 3,
  maxExp: 100, // % do valor
  safe: "", // ticker do ativo seguro; vazio = caixa
  lock: 80, // % do pico (TIPP)
  peak: 0, // pico registrado (TIPP)
};

export const modelLabel = (id) => MODELS.find((m) => m.id === id)?.label ?? MODELS[0].label;

const pos = (x, d) => (Number(x) > 0 ? Number(x) : d);
const pp = (x) => `${(x * 100).toFixed(1).replace(".", decSep())}`;
const usd = (x) => `US$ ${intTxt(x)}`;

/** Soma n meses a uma data ISO (dia limitado ao fim do mês). */
export function addMonths(iso, n) {
  const d = new Date(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

/**
 * Alvos efetivos do modelo escolhido.
 * model: id · params: MODEL_DEFAULTS parciais · targets: [{ sym, w }] (w em %) · current: { SYM: { qty, price? } }
 * prices: { SYM: preço } · total: US$ (opcional) · lastAt: ISO do último rebalanceamento aplicado · now: Date.
 */
export function modelTargets({
  model = "constant",
  params = {},
  targets = [],
  current = {},
  prices = {},
  total = null,
  lastAt = null,
  now = new Date(),
} = {}) {
  const p = { ...MODEL_DEFAULTS, ...params };
  const px = (s) => (prices[s] > 0 ? prices[s] : current[s]?.price > 0 ? current[s].price : null);
  const tw = {};
  for (const t of targets) if (t.sym) tw[t.sym] = (tw[t.sym] ?? 0) + (Number(t.w) || 0) / 100;
  const syms = [...new Set([...Object.keys(tw), ...Object.keys(current)])];
  const val = {};
  for (const s of syms) {
    const q = current[s]?.qty ?? 0;
    val[s] = q > 0 && px(s) ? q * px(s) : 0;
  }
  const cur = Object.values(val).reduce((a, b) => a + b, 0);
  const T = total > 0 ? total : cur;
  const W = (s) => tw[s] ?? 0;
  const out = (fn) => syms.map((s) => ({ sym: s, w: T > 0 ? (fn(s) / T) * 100 : 0 }));
  const keep = () => out((s) => val[s]); // mantém tudo como está
  const strategic = () => syms.map((s) => ({ sym: s, w: W(s) * 100 }));
  const base = { lines: [], warn: null, trade: true };

  if (model === "bands") {
    if (!(cur > 0)) return { ...base, targets: strategic(), lines: ["Sem carteira atual: compra direto nos pesos-alvo."] }; // prettier-ignore
    const band = pos(p.band, 5) / 100;
    const rel = Math.max(0, Number(p.rel) || 0) / 100;
    const out1 = syms.filter((s) => {
      const d = Math.abs(val[s] / cur - W(s));
      if (W(s) === 0) return val[s] > 0;
      return d > band || (rel > 0 && d / W(s) > rel);
    });
    const desc = out1.map((s) => `${s} ${pp(val[s] / cur)}% (alvo ${pp(W(s))}%)`);
    if (!out1.length) {
      const lines = [`Todos os ativos dentro da banda (±${pp(band)} p.p.${rel > 0 ? ` ou ±${pp(rel)}% do peso` : ""}): nada a fazer.`]; // prettier-ignore
      if (Math.abs(T - cur) > 1) lines.push("A diferença entre o valor total e o atual fica em caixa; para alocá-la, use o modelo Só aportes."); // prettier-ignore
      return { ...base, targets: keep(), lines, trade: false };
    }
    const lines = [`Fora da banda: ${desc.join(" · ")}.`];
    if (p.bandMode === "only") return { ...base, targets: out((s) => (out1.includes(s) ? T * W(s) : val[s])), lines }; // prettier-ignore
    if (p.bandMode === "edge") {
      const edge = (s) => {
        if (W(s) === 0) return 0;
        const w = val[s] / cur;
        const b = rel > 0 ? Math.min(band, rel * W(s)) : band;
        return T * Math.min(Math.max(w, W(s) - b), W(s) + b);
      };
      return { ...base, targets: out((s) => (out1.includes(s) ? edge(s) : val[s])), lines }; // prettier-ignore
    }
    return { ...base, targets: strategic(), lines: [...lines, "Rebalanceando a carteira toda."] };
  }

  if (model === "calendar") {
    const months = pos(p.freq, 3);
    if (!lastAt || !(cur > 0)) return { ...base, targets: strategic(), lines: ["Nenhum rebalanceamento aplicado ainda: vale como o primeiro do calendário."] }; // prettier-ignore
    const next = addMonths(lastAt, months);
    const nextTxt = next.toLocaleDateString("pt-BR");
    if (now < next) {
      const days = Math.ceil((next - now) / 86_400_000);
      return { ...base, targets: keep(), trade: false, lines: [`Próximo rebalanceamento em ${nextTxt} (faltam ${days} dias). Até lá, manter.`] }; // prettier-ignore
    }
    return { ...base, targets: strategic(), lines: [`Data atingida (${nextTxt}): voltar aos pesos-alvo.`] }; // prettier-ignore
  }

  if (model === "contrib") {
    const C = T - cur;
    if (Math.abs(C) < 1) return { ...base, targets: keep(), trade: false, lines: ["Sem aporte nem resgate: informe um valor total maior (aporte) ou menor (resgate) que o atual."] }; // prettier-ignore
    const gap = {};
    for (const s of syms) {
      const g = C > 0 ? T * W(s) - val[s] : val[s] - T * W(s);
      gap[s] = g > 0 && (C < 0 || px(s)) ? g : 0;
    }
    const sum = Object.values(gap).reduce((a, b) => a + b, 0);
    const A = Math.abs(C);
    const alloc = {};
    for (const s of syms) alloc[s] = sum > 0 ? (Math.min(A, sum) * gap[s]) / sum : 0;
    let rest = A - Math.min(A, sum);
    if (rest > 1 && C > 0) {
      const ws = syms.filter((s) => W(s) > 0 && px(s));
      const tot = ws.reduce((a, s) => a + W(s), 0);
      for (const s of ws) alloc[s] += (rest * W(s)) / tot;
      if (tot > 0) rest = 0;
    }
    const lines = [
      C > 0
        ? `Aporte de ${usd(A)} vai para os ativos abaixo do alvo, na proporção do que falta a cada um. Nada é vendido.`
        : `Resgate de ${usd(A)} sai dos ativos acima do alvo, na proporção do excesso de cada um.`,
    ];
    if (rest > 1 && C < 0) lines.push(`${usd(rest)} não cabem só nos ativos acima do alvo: o resto do resgate fica pendente.`); // prettier-ignore
    return { ...base, targets: out((s) => val[s] + (C > 0 ? alloc[s] : -alloc[s])), lines };
  }

  if (model === "cppi" || model === "tipp") {
    const m = pos(p.mult, 3);
    const maxE = pos(p.maxExp, 100) / 100;
    const safe = p.safe && p.safe !== "CAIXA" ? p.safe : "";
    let F;
    let peak = 0;
    if (model === "tipp") {
      peak = Math.max(Number(p.peak) || 0, T);
      F = (pos(p.lock, 80) / 100) * peak;
    } else F = Number(p.floor) > 0 ? Number(p.floor) : (pos(p.floorPct, 80) / 100) * T;
    const risky = syms.filter((s) => s !== safe && W(s) > 0);
    const rsum = risky.reduce((a, s) => a + W(s), 0);
    if (!(T > 0)) return { ...base, targets: strategic(), lines: [], warn: "Informe o valor total ou a carteira atual." }; // prettier-ignore
    if (!rsum) return { ...base, targets: strategic(), lines: [], warn: "Inclua ao menos um ativo de risco nos pesos-alvo (além do ativo seguro)." }; // prettier-ignore
    const cushion = Math.max(0, T - F);
    const E = Math.min(maxE * T, m * cushion);
    const tg = {};
    for (const s of syms) tg[s] = 0;
    for (const s of risky) tg[s] = (E * W(s)) / rsum;
    if (safe) tg[safe] = T - E;
    const res = syms.map((s) => ({ sym: s, w: (tg[s] / T) * 100 }));
    if (safe && !syms.includes(safe)) res.push({ sym: safe, w: ((T - E) / T) * 100 });
    const lines = [
      model === "tipp"
        ? `Pico ${usd(peak)} × ${pos(p.lock, 80)}% = piso ${usd(F)} (só sobe).`
        : `Piso ${usd(F)}${Number(p.floor) > 0 ? "" : ` (${pos(p.floorPct, 80)}% do valor atual; fica fixo ao aplicar)`}.`,
      `Colchão = valor − piso = ${usd(cushion)} · exposição = ${m} × colchão${m * cushion > maxE * T ? ` (limitada a ${pp(maxE)}% do valor)` : ""} = ${usd(E)} (${pp(E / T)}%).`,
      `Ativos de risco recebem ${usd(E)} na proporção dos pesos-alvo; ${safe ? `${safe} (seguro)` : "o caixa"} fica com ${usd(T - E)}.`,
    ];
    return {
      ...base,
      targets: res,
      lines,
      warn: cushion <= 0 ? "Carteira no piso ou abaixo dele: nenhuma exposição ao risco." : null,
      floor: F,
      peak,
    };
  }

  return { ...base, targets: strategic(), lines: ["Todos os ativos voltam aos pesos-alvo."] };
}
