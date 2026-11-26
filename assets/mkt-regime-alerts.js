// Avisos de mudança do regime do mercado (puro, sem DOM): o pêndulo da Início trocou de faixa ou está ganhando
// tração rumo à fronteira. Usado pelo push com o app fechado (api/push-alerts.js, a cada minuto) e pelo aviso
// com o app aberto. A nota de agora e a de 60 min atrás saem da MESMA conta (regimeAt de regime-history.js),
// para a diferença não vir de método.
//
// • Mudou de faixa: a faixa de agora é outra que a de 60 min atrás, a nota já entrou ≥ HYST pontos na nova e
//   andou ≥ MIN_SWING pontos (sem aviso de vai e volta em cima da linha: 20/11/2026, −61 → −57 virou "Defesa
//   forte → Defesa"). Um aviso por troca (de → para) por dia de NY.
// • Perto da fronteira: a nota andou ≥ TRACTION pontos em 60 min e está a ≤ NEAR pontos da próxima fronteira
//   no sentido do movimento. Um aviso por fronteira e sentido a cada 3 h.
// Leitura em modo sombra; material educacional, não é recomendação de investimento.
import { PEND_ZONES } from "./regime-zones.js";
import { nyClock } from "./sessions.js";

export const BOUNDS = [-60, -20, 20, 60];
export const HYST = 5;
/** Troca de faixa só conta com um movimento de verdade (não um pulo de 4 pontos em cima da linha). */
export const MIN_SWING = 8;
export const NEAR = 6;
export const TRACTION = 10;

const zoneOf = (s) => PEND_ZONES.find((z) => s < z.max || z.key === "rkx");
const sgn = (x) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x))}`;
const BLOCK_PT = { eq: "Bolsas", cls: "Classes", vol: "VIX e vol" };

function blocksLine(blocks) {
  const parts = Object.entries(blocks ?? {})
    .filter(([, v]) => Number.isFinite(v))
    .map(([k, v]) => `${BLOCK_PT[k] ?? k} ${sgn(v)}`);
  return parts.length ? ` ${parts.join(" · ")}.` : "";
}

/** Próxima fronteira no sentido d (+1 rumo ao risco, −1 rumo à defesa), ou null. */
export function nextBound(score, d) {
  const ahead = BOUNDS.filter((b) => (b - score) * d > 0);
  if (!ahead.length) return null;
  return d > 0 ? Math.min(...ahead) : Math.max(...ahead);
}

/**
 * now/past = { t, score, blocks } (nota agora e há ~60 min). Devolve avisos { key, title, body, tag, url, kind }.
 * O título já vem sem o marcador de tema (quem envia põe "🧭 REGIME DO MERCADO").
 */
export function mktRegimeAlerts(now, past, { nowSec = Date.now() / 1000 } = {}) {
  if (!Number.isFinite(now?.score) || !Number.isFinite(past?.score)) return [];
  const day = nyClock(nowSec * 1000).date;
  const zNow = zoneOf(now.score);
  const zPast = zoneOf(past.score);
  const move = now.score - past.score;
  const d = Math.sign(move);
  const mins = Math.max(1, Math.round((now.t - past.t) / 60));
  const out = [];
  const actionFor = (dest) =>
    d > 0
      ? dest.tone === "dn"
        ? "A defesa está perdendo força: revisar se ainda cabe tanta proteção."
        : "Hora de revisar entradas táticas a favor do risco."
      : dest.tone === "up"
        ? "O apetite por risco está perdendo força: revisar ganhos a proteger."
        : "Hora de revisar proteções e reduzir risco nas posições mais expostas.";
  let edge = null; // fronteira cruzada sem folga: vira aviso de "perto da fronteira"
  if (zNow.key !== zPast.key) {
    const crossed = d > 0 ? zNow.min : zNow.max;
    if (Math.abs(now.score - crossed) >= HYST && Math.abs(move) >= MIN_SWING) {
      out.push({
        kind: "zone",
        key: `mkt:zone:${day}:${zPast.key}>${zNow.key}`,
        title: `Regime mudou: ${zPast.label} → ${zNow.label}`,
        body: `Nota ${sgn(past.score)} → ${sgn(now.score)} em ${mins} min.${blocksLine(now.blocks)} ${actionFor(zNow)}`,
        tag: "mkt-regime",
        url: "./?tab=home&reghist=1",
      });
    } else edge = crossed;
  }
  if (!out.length && Math.abs(move) >= TRACTION) {
    const b = edge ?? nextBound(now.score, d);
    if (b != null && Math.abs(b - now.score) <= NEAR) {
      const zFrom = zoneOf(b - d);
      const zNext = zoneOf(b + d);
      const bucket = Math.floor(nowSec / (3 * 3600));
      const where =
        edge != null
          ? `acabou de cruzar a fronteira ${sgn(b)} (${zFrom.label} → ${zNext.label}), ainda sem folga`
          : `a ${Math.abs(Math.round(b - now.score))} pontos da fronteira ${sgn(b)} (${zFrom.label} → ${zNext.label})`;
      out.push({
        kind: "near",
        key: `mkt:near:${day}:${b}:${d > 0 ? "up" : "dn"}:${bucket}`,
        title: `Regime ganhando tração rumo a ${zNext.label}`,
        body: `Nota ${sgn(past.score)} → ${sgn(now.score)} em ${mins} min, ${where}.${blocksLine(now.blocks)} ${actionFor(zNext)}`,
        tag: "mkt-regime",
        url: "./?tab=home&reghist=1",
      });
    }
  }
  return out;
}
