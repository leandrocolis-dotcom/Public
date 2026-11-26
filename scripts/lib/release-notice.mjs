// Aviso "Pêndulo atualizado" por push. Função pura (testável): decide se o commit do deploy merece aviso
// e monta o texto a partir da mensagem do commit. Usada por scripts/release-push.mjs (manual desde 26/11/2026).

/** Commits sem efeito visível para quem usa o app (dados, docs, testes, CI): não geram push. */
const SILENT_TYPES = new Set(["docs", "test", "tests", "chore", "ci", "build", "style"]);
const SKIP_MARKERS = /\[(skip push|no push|skip ci)\]/i;
const MAX_BODY = 140;

/** `feat(fluxo): velocidade do fluxo` → { notify: true, body: "Novidade: Velocidade do fluxo" }. */
export function releaseNotice(commitMessage) {
  const title = "Pêndulo atualizado";
  const msg = String(commitMessage ?? "");
  if (SKIP_MARKERS.test(msg)) return { notify: false, title, body: "" };
  const firstLine = msg.split("\n")[0].trim();
  const m = firstLine.match(/^(\w+)(\([^)]*\))?!?:\s*(.+)$/);
  const type = m?.[1].toLowerCase();
  if (type && SILENT_TYPES.has(type)) return { notify: false, title, body: "" };

  let summary = (m ? m[3] : firstLine).replace(/\s*\(#\d+\)\s*$/, "").trim();
  if (!summary)
    return { notify: true, title, body: "Uma versão nova já está disponível. Toque para abrir." };
  summary = summary.charAt(0).toUpperCase() + summary.slice(1);
  const prefix = type === "fix" ? "Correção" : type === "perf" ? "Mais rápido" : "Novidade";
  let body = `${prefix}: ${summary}`;
  if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY - 1).trimEnd() + "…";
  return { notify: true, title, body };
}
