// Backtest do pêndulo sobre o diário de assertividade (data/pend-accuracy-journal.json, sem baixar preço):
// HW pesos dos blocos e HR radar de virada × troca de faixa (regras em assets/pend-backtest.js, registradas em
// 26/11/2026 antes de rodar). → data/pend-backtest.json + docs/ESTUDO-PESOS-PENDULO.md. Cron diário em
// train-model.yml, depois do estudo de assertividade. Modo sombra: aprovar NÃO muda a nota; mudar pesos só por
// ordem do usuário. Material educacional; não é recomendação de investimento.
import { readFile, writeFile } from "node:fs/promises";
import { decorate, unpackJournal } from "./pend-accuracy-study.mjs";
import { CURRENT, priceMomentum, radarStudy, weightStudy } from "../assets/pend-backtest.js";

const ROOT = new URL("../", import.meta.url);
const f = (x, suf = "") => (x == null ? "—" : `${x}${suf}`);
const wTxt = (w) =>
  `${Math.round(w.eq * 100)}/${Math.round(w.cls * 100)}/${Math.round(w.vol * 100)}`;
const ok = (b) => (b ? "sim" : "não");
const NAME = { eq: "Só Bolsas", cls: "Só Classes", vol: "Só VIX e vol" };

export function renderDoc(W, R, mom, meta) {
  const row = (label, x) =>
    `| ${label} | ${f(x.hit60, "%")} | ${f(x.rho)} | ${x.bandN} | ${f(x.confirm30, "%")} | ${f(x.late, " min")} | ${f(x.left, "%")} |`;
  const ev = (label, x) =>
    `| ${label} | ${x.n} | ${f(x.confirm30, "%")} | ${f(x.confirm60, "%")} | ${f(x.meanFwd30)} | ${f(x.whipsawPct, "%")} | ${f(x.medLateMin, " min")} | ${f(x.medLeftPct, "%")} |`;
  return [
    "# Estudo: pesos do pêndulo e radar de virada (backtest no diário de assertividade)",
    "",
    `> \`node scripts/pend-backtest-study.mjs\` → \`data/pend-backtest.json\` (cron diário, depois de \`pend-accuracy-study.mjs\`). Gerado em ${meta.generated}.`,
    `> Amostra: ${meta.n} pontos de 5 min, ${W.days} pregões de referência; treino até ${W.cut} (exclusive, ${W.trainN} pontos), teste depois (${W.testN} pontos).`,
    "> Regras registradas em 26/11/2026, antes de rodar (cabeçalho de `assets/pend-backtest.js`). Modo sombra: aprovar não muda a nota; mudar pesos só por ordem do usuário.",
    "> Material educacional; não é recomendação de investimento.",
    "",
    `## HW: pesos dos blocos (Bolsas/Classes/VIX e vol) — **${W.approved ? "aprovada" : "reprovada"}**`,
    "",
    `Atual ${wTxt(CURRENT)}. Melhor do treino (acerto 60 min): **${wTxt(W.best.w)}**. ${W.variants} combinações testadas (contam para superajuste).`,
    "",
    `- (a) ganho no teste ≥ 2 p.p.: **${ok(W.rules.a)}** (${f(W.gain, " p.p.")})`,
    `- (b) bootstrap por pregão p < 0,05: **${ok(W.rules.b)}** (p = ${f(W.p)})`,
    `- (c) coerência no teste sem piorar > 0,05: **${ok(W.rules.c)}**`,
    `- (d) confirmação das trocas de faixa no teste sem piorar: **${ok(W.rules.d)}**`,
    "",
    "| Pesos (teste) | Acerto 60 min | ρ nota × SPY | Trocas de faixa | Confirma 30 min | Tarde à virada | Sobrava |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    row(`Atual ${wTxt(CURRENT)}`, W.current.test),
    row(`Melhor do treino ${wTxt(W.best.w)}`, W.best.test),
    ...W.single.map((x) => row(NAME[x.id], x)),
    "",
    `Referência "só o preço" (lado do SPY nos 30 min anteriores → 60 min seguintes, amostra toda): ${f(mom.hitPct, "%")} em ${mom.n} pontos.`,
    "",
    "Dez melhores no treino:",
    "",
    "| Pesos | Acerto 60 min (treino) | ρ | Confirma 30 min |",
    "| --- | ---: | ---: | ---: |",
    ...W.top.map((g) => `| ${wTxt(g.w)} | ${f(g.train.hit60, "%")} | ${f(g.train.rho)} | ${f(g.train.confirm30, "%")} |`), // prettier-ignore
    "",
    `## HR: radar de virada × troca de faixa — **${R.approved ? "aprovada" : "reprovada"}**`,
    "",
    `- (a) radar confirmado chega ≥ 15 min antes à virada do mercado: **${ok(R.rules.a)}**`,
    `- (b) sobra ≥ 10 p.p. a mais do movimento: **${ok(R.rules.b)}**`,
    `- (c) confirma em 30 min em ≥ 55%, com ≥ 20 eventos: **${ok(R.rules.c)}**`,
    "",
    "| Gatilho | Eventos | Confirma 30 min | Confirma 60 min | SPY 30 min no sentido (z médio) | Vai e volta | Tarde à virada | Sobrava |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ev("Troca de faixa", R.band),
    ev("Radar ⚠ tendência", R.watch),
    ev("Radar ‼ confirmada", R.confirmed),
    "",
    "## Como ler",
    "",
    "- Pontos vizinhos se sobrepõem; o bootstrap sorteia pregões inteiros para não contar o mesmo movimento várias vezes. Com poucas semanas, a tendência é reprovar: o diário cresce todo dia e o estudo se refaz sozinho.",
    "- Radar no diário: trilha de 3 h dentro do mesmo pregão de referência (no app a referência fica fixa na de agora; perto das 16h os dois diferem) e preço do SPY aproximado (pesa 10% na força, fora das regras de confirmação).",
    "- Aprovar não muda nada sozinho. Próximo passo, se aprovar com amostra maior: o usuário decide trocar os pesos de `STRENGTH_W_LIVE`/módulos ou passar a avisar pelo radar.",
    "",
  ].join("\n");
}

async function main() {
  const j = JSON.parse(await readFile(new URL("data/pend-accuracy-journal.json", ROOT), "utf8"));
  const pts = decorate(unpackJournal(j)).filter((p) => p.ses);
  const W = weightStudy(pts);
  const R = radarStudy(pts);
  const mom = priceMomentum(pts);
  const meta = { generated: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", n: pts.length }; // prettier-ignore
  await writeFile(new URL("data/pend-backtest.json", ROOT), JSON.stringify({ meta, weights: W, radar: R, priceMomentum: mom }, null, 1) + "\n"); // prettier-ignore
  await writeFile(new URL("docs/ESTUDO-PESOS-PENDULO.md", ROOT), renderDoc(W, R, mom, meta));
  console.log(`HW ${W.approved ? "aprovada" : "reprovada"}: melhor ${wTxt(W.best.w)} ganho ${W.gain} p.p. p=${W.p} | HR ${R.approved ? "aprovada" : "reprovada"}: radar ${R.confirmed.n} eventos, confirma ${R.confirmed.confirm30}%, tarde ${R.confirmed.medLateMin} min × faixa ${R.band.medLateMin} min`); // prettier-ignore
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
