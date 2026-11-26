// Candidatos a liderança: temas da Rotação relativa (janela Hoje) que ganham tração e momento, com a confiança
// calibrada pelo regime do dia e pela confirmação dos nomes puros (assets/theme-names.js). Puro (sem DOM): roda no
// app e no servidor (api/_leaders.js, push). Material educacional: pauta de estudo, não recomendação.
import { decSep } from "./format.js";
import { segIntensity, livePoint } from "./rot-intraday.js";
import { namesOf, profileOf } from "./theme-names.js";

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export const STALE = 90 * 60; // cabeça mais de 90 min atrás da varredura = mercado parado
export const MIN_PACE = 0.3; // ritmo mínimo (média dos 2 últimos trechos, 0–1) para contar como tração
const LEADING = new Set(["Liderando", "Ganhando força"]);

/**
 * Pré-candidatos de um grupo a partir da rotação de Hoje (saída de rotationIntraday).
 * Critérios: cabeça em Ganhando força ou Liderando, momento acima de 100, força subindo nos 2 últimos
 * intervalos e ritmo (espessura) ≥ MIN_PACE. Pontuação = força e momento padronizados no grupo + ritmo + virada.
 * @returns [{ sym, label, group, quadrant, x, y, pace, turn, at, score }]
 */
export function preCandidates(rot, groupId, quadrantOf, { minT = -Infinity } = {}) {
  if (!rot?.length) return [];
  const inten = segIntensity(rot);
  const heads = rot.map((r) => r.tail.at(-1));
  const sx = sd(heads.map((h) => h.x)) || 1e-6;
  const sy = sd(heads.map((h) => h.y)) || 1e-6;
  const out = [];
  rot.forEach((r, i) => {
    const t = r.tail;
    if (t.length < 3) return;
    const h = t.at(-1);
    if (h.t != null && h.t < minT) return; // posição velha (mercado do ativo parado): não é tração de agora
    const q = quadrantOf(h);
    if (!LEADING.has(q) || h.y <= 100 || h.x <= t.at(-3).x) return;
    const pace = mean((inten[i] ?? []).slice(-2));
    if (pace < MIN_PACE) return;
    const before = t.slice(-4, -1).map(quadrantOf);
    const turn =
      q === "Liderando" && before.includes("Ganhando força")
        ? "virou Liderando"
        : q === "Ganhando força" && before.includes("Atrasado")
          ? "saiu de Atrasado"
          : null;
    out.push({
      sym: r.sym,
      label: r.label,
      group: groupId,
      quadrant: q,
      x: h.x,
      y: h.y,
      pace,
      turn,
      at: h.label,
      score: (h.x - 100) / sx + (h.y - 100) / sy + pace + (turn ? 0.5 : 0),
    });
  });
  return out.sort((a, b) => b.score - a.score);
}

/** Variação do dia contra o fechamento anterior; ext = vale o pré/pós real (modo Off). */
export function dayChange(q, ext = true) {
  const lp = livePoint(q, ext);
  return lp && q?.pc > 0 ? lp.p / q.pc - 1 : null;
}

/**
 * Confirmação pelos nomes puros: quantos andam melhor que o benchmark do grupo no dia (o inverso conta ao
 * contrário). Confirma com ≥ 60% dos nomes com cotação (2 de 3, 3 de 4) e pelo menos 2 nomes.
 */
export function namesConfirm(sym, quotes, benchChg = 0, ext = true) {
  const rows = namesOf(sym).map(({ sym: s, inv }) => {
    const chg = dayChange(quotes?.[s], ext);
    const rel = chg == null ? null : (inv ? -chg : chg) - (benchChg ?? 0);
    return { sym: s, inv, chg, rel };
  });
  const have = rows.filter((r) => r.rel != null);
  const up = have.filter((r) => r.rel > 0).length;
  const need = Math.max(2, Math.ceil(have.length * 0.6));
  return { rows, up, n: have.length, ok: have.length >= 2 && up >= need };
}

const DIR = (verdict) => (/^Risk-on/.test(verdict ?? "") ? 1 : /^Risk-off|^Estresse/.test(verdict ?? "") ? -1 : 0); // prettier-ignore

/**
 * Encaixe do tema no regime do dia: +1 (a favor e regime moderado ou mais forte), 0,5 (a favor, regime fraco),
 * 0 (regime misto ou tema neutro), −1 (contra o regime).
 */
export function regimeFit(profile, rg) {
  const dir = DIR(rg?.verdict);
  if (!dir || profile === "neutral") return { fit: 0, text: dir ? "tema neutro ao regime" : "regime misto" }; // prettier-ignore
  const aligned = (profile === "risk" && dir > 0) || (profile === "def" && dir < 0);
  if (!aligned) return { fit: -1, text: `contra o regime (${rg.verdict})` };
  const weak = (rg?.strength?.intensity ?? 50) < 40;
  return weak
    ? { fit: 0.5, text: `a favor do regime, mas ${String(rg.strength.level).toLowerCase()}` }
    : { fit: 1, text: `a favor do regime (${rg.verdict}${rg?.strength ? ` ${String(rg.strength.level).toLowerCase()}` : ""})` }; // prettier-ignore
}

/** Confiança: alta = regime a favor (moderado+) E nomes confirmam; média = um dos dois; baixa = o resto. */
export function confidenceOf(fit, namesOk) {
  if (fit >= 1 && namesOk) return "alta";
  if ((fit >= 0.5 && namesOk) || fit >= 1 || (fit === 0 && namesOk)) return "media";
  return "baixa";
}

/**
 * Candidatos completos (pré-candidatos de todos os grupos + nomes + regime), ordenados pela confiança e pontuação.
 * pre: saída de preCandidates (vários grupos); benchChg: { groupId: variação do benchmark no dia }.
 */
export function rateCandidates(pre, { quotes, regime, benchChg = {}, groupOf = () => null, ext = true, max = 12 }) {
  const rank = { alta: 0, media: 1, baixa: 2 };
  return pre
    .map((c) => {
      const names = namesConfirm(c.sym, quotes, benchChg[c.group] ?? 0, ext);
      const fit = regimeFit(profileOf(c.sym, c.group), regime);
      return { ...c, names, fit, profile: profileOf(c.sym, c.group), conf: confidenceOf(fit.fit, names.ok), groupLabel: groupOf(c.group) }; // prettier-ignore
    })
    .sort((a, b) => rank[a.conf] - rank[b.conf] || b.score - a.score)
    .slice(0, max);
} // prettier-ignore

/** Nomes a buscar para confirmar os pré-candidatos (sem repetir). */
export const namesToQuote = (pre) => [
  ...new Set(pre.flatMap((c) => namesOf(c.sym).map((n) => n.sym))),
];

/** Texto do aviso (push e notificação com o app aberto). */
export function leaderAlertText(c) {
  const pct = (x) =>
    `${x >= 0 ? "+" : "−"}${Math.abs(x * 100)
      .toFixed(1)
      .replace(".", decSep())}%`;
  const names = c.names.rows
    .filter((r) => r.chg != null)
    .map((r) => `${r.sym}${r.inv ? " (contra)" : ""} ${pct(r.chg)}`)
    .join(", ");
  return {
    title: `${c.label}${c.groupLabel ? ` (${c.groupLabel})` : ""}: ${c.turn ?? c.quadrant.toLowerCase()}`,
    body: `${c.at ? `${c.at} · ` : ""}${c.names.up}/${c.names.n} nomes confirmam · ${c.fit.text}. ${names}. Pauta de estudo, não recomendação.`, // prettier-ignore
  };
}
