// Pano de fundo de longo prazo do pêndulo (puro; docs/PLANO-PENDULO.md J2). Igual em qualquer janela do pêndulo.
// O estudo P1 (docs/ESTUDO-PENDULO.md) mostrou que, para prever queda > 10% em 3 meses, a MM200 do SPY e o crédito
// (HYG/IEF) têm mais poder que o regime de curto prazo. Modo sombra: só leitura, não gera aviso nem mexe na carteira.
// Material educacional; não é recomendação de investimento.

import { decSep } from "./format.js";
const fin = Number.isFinite;

/** Média móvel simples dos últimos n pontos até o índice end (exclusivo); null se faltar ponto. */
function smaAt(s, n, end) {
  if (end < n) return null;
  let sum = 0;
  for (let i = end - n; i < end; i++) {
    if (!fin(s[i])) return null;
    sum += s[i];
  }
  return sum / n;
}

/** Lado de um pregão: +1 favorável, −1 contra, ou null. */
function sidesAt(spy, hyg, ief, i) {
  const m = smaAt(spy, 200, i + 1);
  const t = m && fin(spy[i]) ? spy[i] / m - 1 : null;
  const a = hyg && ief && i >= 60 ? hyg[i] / ief[i] : null;
  const b = hyg && ief && i >= 60 ? hyg[i - 60] / ief[i - 60] : null;
  const c = fin(a) && fin(b) && b > 0 ? a / b - 1 : null;
  return { trend: t, credit: c };
}

const stateOf = (s) => {
  if (!fin(s.trend)) return null;
  const bad = (s.trend < 0 ? 1 : 0) + (fin(s.credit) && s.credit < 0 ? 1 : 0);
  return bad === 2 ? "defesa" : bad === 1 ? "atenção" : "favorável";
};

export const BACKDROP_STATES = {
  favorável: { tone: "up", text: "favorável" },
  atenção: { tone: "mid", text: "atenção" },
  defesa: { tone: "dn", text: "defesa" },
};

/**
 * Pano de fundo a partir das séries de fechamento (`flow.close`: SPY, HYG, IEF).
 * Devolve { trend (SPY ÷ MM200 − 1), above, days (pregões desde o último cruzamento da MM200), credit (variação de
 * 60 pregões de HYG/IEF), state (favorável | atenção | defesa, com histerese de 2 pregões), raw (estado sem
 * histerese), tone, text } ou null sem 200 pregões de SPY.
 */
export function backdrop(close) {
  const spy = close?.SPY;
  if (!spy || spy.length < 200) return null;
  const hyg = close.HYG ?? null;
  const ief = close.IEF ?? null;
  const last = spy.length - 1;
  const now = sidesAt(spy, hyg, ief, last);
  if (!fin(now.trend)) return null;
  // histerese: o estado só muda quando os 2 últimos pregões concordam; senão vale o estado anterior estável
  const states = [];
  for (let i = Math.max(199, last - 40); i <= last; i++)
    states.push(stateOf(sidesAt(spy, hyg, ief, i)));
  let state = null;
  for (let k = 0; k < states.length; k++) {
    if (!states[k]) continue;
    if (state === null) state = states[k];
    else if (k > 0 && states[k] === states[k - 1] && states[k] !== state) state = states[k];
  }
  let days = 0;
  const above = now.trend >= 0;
  for (let i = last - 1; i >= 199; i--) {
    const t = sidesAt(spy, null, null, i).trend;
    if (!fin(t) || t >= 0 !== above) break;
    days++;
  }
  const st = BACKDROP_STATES[state] ?? BACKDROP_STATES.atenção;
  return {
    trend: now.trend,
    above,
    days: days + 1,
    credit: now.credit,
    state,
    raw: stateOf(now),
    tone: st.tone,
    text: st.text,
  };
}

const pctTxt = (x) =>
  `${x >= 0 ? "+" : "−"}${(Math.abs(x) * 100).toFixed(1).replace(".", decSep())}%`;

/** Frase curta do pano de fundo. */
export function backdropLine(b) {
  if (!b) return "";
  const t = `SPY ${pctTxt(b.trend).replace(/^[+−]/, "")} ${b.above ? "acima" : "abaixo"} da MM200 (${b.days} ${b.days === 1 ? "pregão" : "pregões"})`;
  const c = fin(b.credit)
    ? `crédito ${pctTxt(b.credit)} em 60 pregões (${b.credit >= 0 ? "estreitando" : "alargando"})`
    : "crédito sem dados";
  return `${t} · ${c}`;
}
