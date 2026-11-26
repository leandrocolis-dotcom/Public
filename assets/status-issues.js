// Problemas de rotina do dado (puro): poucos ativos com preço defasado, atrasados ou sem cotação ao vivo.
// Viram um contador âmbar no selo de frescor em vez da faixa vermelha do topo (docs/PLANO-OTIMIZACAO.md U3).
// O atraso da MAIORIA das cotações e a falha do ao vivo continuam na faixa (afetam decisão).

/** { count, text }: ativos únicos com algum problema de rotina e a descrição para a dica/toque. */
export function routineIssues({ staleCodes = [], late = [], liveCount = 0, missing = [] } = {}) {
  const lateMinor = late.length && late.length < Math.max(1, liveCount ?? 1) / 2 ? late : [];
  const parts = [];
  if (staleCodes?.length) parts.push(`Preço defasado (pares suprimidos): ${staleCodes.join(", ")}`);
  if (lateMinor.length)
    parts.push(
      `Cotação atrasada: ${lateMinor.map((l) => `${l.sym} (${l.lagMin} min)`).join(", ")}`,
    );
  if (missing?.length) parts.push(`Sem cotação ao vivo: ${missing.join(", ")}`);
  const syms = new Set([...(staleCodes ?? []), ...lateMinor.map((l) => l.sym), ...(missing ?? [])]);
  return { count: syms.size, text: parts.join(". ") + (parts.length ? "." : "") };
}

const SESSION_LABEL = { pre: "Pré-mercado", post: "Pós-mercado", closed: "Mercado fechado" };

/**
 * Selo único do topo (U1): sessão + frescor num rótulo só. A cor vem do frescor (f.level), nunca da sessão.
 * Dado com problema (warn/bad) mantém o rótulo do problema; dado em dia mostra a sessão de Nova York:
 * no pregão "Ao vivo"/"Intradiário"; fora dele "Pré-mercado", "Pós-mercado" ou "Mercado fechado"
 * (com "· ao vivo" quando os preços fora do pregão estão chegando, modo Off).
 */
export function sealLabel(f, session, { mode = "on", live = false } = {}) {
  if (!f) return "";
  if (f.level !== "ok" || session === "open" || !SESSION_LABEL[session]) return f.label;
  const ext = live && mode === "off" && session !== "closed";
  return SESSION_LABEL[session] + (ext ? " · ao vivo" : "");
}
