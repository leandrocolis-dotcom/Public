// Regras do vigia de regime da carteira (puras: o app e o push de fundo usam as mesmas).
// Piorou = decisão rebaixada, perdeu a média de 200 dias ou médio prazo virou desfavorável, comparando o estado do
// pregão anterior com o de agora. Leitura: pode ser hora de realizar parte do lucro ou proteger a posição.

export const RANK = { buy: 2, wait: 1, sell: 0 };
export const MT_BAD = -0.25;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/** Acima da média de 200 dias? (null sem 200 pregões). `close` termina no preço de referência. */
export function above200(close) {
  if (!close || close.length < 200) return null;
  return close.at(-1) > mean(close.slice(-200));
}

/** Motivos de piora entre dois estados { label, tone, up200, mt }. */
export function worsened(prev, cur) {
  if (!prev || !cur) return [];
  const why = [];
  if ((RANK[cur.tone] ?? 1) < (RANK[prev.tone] ?? 1))
    why.push(`decisão ${prev.label} → ${cur.label}`);
  if (prev.up200 === true && cur.up200 === false) why.push("perdeu a média de 200 dias");
  if (prev.mt > MT_BAD && cur.mt <= MT_BAD) why.push("médio prazo virou desfavorável");
  return why;
}

export const REGIME_TIP =
  "Pode ser hora de realizar parte do lucro ou proteger a posição (stop). Não é ordem.";
