// Depois de um deploy de produção com mudança no app: pede à Edge Function push (modo ?release) o aviso
// "Pêndulo atualizado" para todos os aparelhos inscritos. A função confere o commit no GitHub e monta o texto;
// aqui só filtramos antes, com a mesma regra, para não chamar à toa. Uso: COMMIT_SHA e COMMIT_MESSAGE no ambiente.
import { releaseNotice } from "./lib/release-notice.mjs";

const FN = "https://iufliktjawnfawerwvtg.supabase.co/functions/v1/push?release";
const sha = process.env.COMMIT_SHA ?? "";

if (!releaseNotice(process.env.COMMIT_MESSAGE).notify) {
  console.log("Commit sem mudança visível: sem push.");
  process.exit(0);
}
if (!sha) {
  console.error("Falta COMMIT_SHA.");
  process.exit(1);
}
const r = await fetch(FN, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sha }),
  signal: AbortSignal.timeout(60000),
});
const out = await r.text();
console.log(`HTTP ${r.status} ${out.slice(0, 300)}`);
if (!r.ok) process.exit(1);
