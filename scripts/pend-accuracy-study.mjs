// Estudo de assertividade do pêndulo (docs/ESTUDO-ASSERTIVIDADE-PENDULO.md). Refaz a nota de 1 dia a cada 5 min com
// a MESMA regra da Início (regimeAt de assets/regime-history.js) a partir das barras de 5 min do Yahoo (com pré/pós
// e futuros) e compara com o SPY de fato: coerência, atraso, reação a choques, trocas de faixa e intensidade
// (assets/pend-accuracy.js). Guarda os pontos num diário que só cresce (data/pend-accuracy-journal.json): o Yahoo
// dá 60 dias de barras de 5 min; rodando todo dia, a amostra passa disso. Primeira vez: 60 dias; depois, 5 dias.
// Uso: node scripts/pend-accuracy-study.mjs [--full]. Cron diário em train-model.yml. Modo sombra: não mexe em
// pesos, avisos ou nota. Material educacional; não é recomendação de investimento.
import { readFile, writeFile } from "node:fs/promises";
import { fetchIntraday } from "../api/intraday.js";
import { REGIME_SYMS, lastLE, priceAt, regimeAt, usRefDate } from "../assets/regime-history.js";
import { futuresOpen, usSession } from "../assets/sessions.js";
import { ACC, accuracyReport } from "../assets/pend-accuracy.js";

const ROOT = new URL("../", import.meta.url);
const JOURNAL = new URL("data/pend-accuracy-journal.json", ROOT);
const OUT = new URL("data/pend-accuracy.json", ROOT);
const DOC = new URL("docs/ESTUDO-ASSERTIVIDADE-PENDULO.md", ROOT);

/** Sessão de NY em t (s): pre | reg | post | night (futuros) | null (tudo fechado). */
export function sesOf(t) {
  const s = usSession(t * 1000);
  if (s === "pre") return "pre";
  if (s === "open") return "reg";
  if (s === "post") return "post";
  return futuresOpen(t * 1000) ? "night" : null;
}

/** Desvio-padrão dos retornos diários do SPY nos 250 pregões até idx. */
export function spySigma(close, idx, n = 250) {
  const r = [];
  for (let i = Math.max(1, idx - n + 1); i <= idx; i++) r.push(close[i] / close[i - 1] - 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
}

/** Pontos { t, s, z, b } a cada 5 min onde há fechamento de referência no histórico diário. */
export function buildPoints(daily, series, step = ACC.step) {
  const spy = series.SPY?.t;
  if (!spy?.length) return [];
  const out = [];
  const sig = new Map();
  for (let t = Math.ceil(spy[0] / step) * step; t <= spy.at(-1); t += step) {
    if (!sesOf(t)) continue;
    const ref = usRefDate(t);
    const idx = lastLE(daily.dates, ref);
    if (idx < 260 || daily.dates[idx] !== ref) continue; // sem o fechamento de referência: não dá para medir
    const p = priceAt("SPY", t, series);
    const rg = regimeAt(t, daily, series);
    if (!p?.p || !rg) continue;
    if (!sig.has(idx)) sig.set(idx, spySigma(daily.close.SPY, idx));
    const z = (p.p / daily.close.SPY[idx] - 1) / sig.get(idx);
    out.push({ t, s: rg.score, z: Math.round(z * 1000) / 1000, b: rg.blocks });
  }
  return out;
}

/** Diário colunar (enxuto) ⇄ pontos. */
export function packJournal(pts) {
  const ids = [...new Set(pts.flatMap((p) => Object.keys(p.b ?? {})))].sort();
  return {
    v: 1,
    step: ACC.step,
    updated: new Date().toISOString(),
    t: pts.map((p) => p.t),
    s: pts.map((p) => p.s),
    z: pts.map((p) => Math.round(p.z * 1000)),
    b: Object.fromEntries(ids.map((id) => [id, pts.map((p) => p.b?.[id] ?? null)])),
  };
}
export function unpackJournal(j) {
  if (!j?.t?.length) return [];
  return j.t.map((t, i) => ({
    t,
    s: j.s[i],
    z: j.z[i] / 1000,
    b: Object.fromEntries(Object.entries(j.b ?? {}).map(([k, a]) => [k, a[i]]).filter(([, v]) => v != null)), // prettier-ignore
  }));
}
/** Junta o diário com os pontos novos (o novo vence no mesmo instante), em ordem de tempo. */
export function mergePoints(old, fresh) {
  const m = new Map(old.map((p) => [p.t, p]));
  for (const p of fresh) m.set(p.t, p);
  return [...m.values()].sort((a, b) => a.t - b.t);
}
/** Acrescenta dia de referência e sessão (derivados do instante; não vão para o diário). */
export const decorate = (pts) => pts.map((p) => ({ ...p, day: usRefDate(p.t), ses: sesOf(p.t) }));

// ---------- texto do estudo ----------
const SES = {
  pre: "Pré (4h–9h30)",
  reg: "Pregão",
  post: "Pós (16h–20h)",
  night: "Noite (futuros)",
};
const f = (x, suf = "") => (x == null ? "—" : `${x}${suf}`);
const nyTime = (t) =>
  new Date(t * 1000).toLocaleString("pt-BR", { timeZone: "America/New_York", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
const ZN = ["Def. forte", "Defesa", "Neutro", "Risco", "Risco forte"];

export function renderDoc(rep, meta) {
  const c = rep.coherence;
  const L = rep.lag;
  const R = rep.reaction;
  const B = rep.bands;
  const I = rep.intensity;
  const F = rep.forward;
  const lines = [
    "# Estudo: assertividade do pêndulo (nota de 1 dia × SPY de fato)",
    "",
    `> \`node scripts/pend-accuracy-study.mjs\` → \`data/pend-accuracy.json\` + diário \`data/pend-accuracy-journal.json\` (cron diário, \`train-model.yml\`). Gerado em ${meta.generated}.`,
    `> Amostra: ${meta.from} a ${meta.to} (horário de NY), ${c.n} pontos de 5 min, ${meta.days} pregões de referência.`,
    "> Nota refeita com a mesma regra da Início (`regimeAt`); mercado de fato = SPY (ES=F fora do pregão) desde o fechamento de referência, em desvios de um dia (z).",
    "> Modo sombra: nada aqui muda pesos, avisos ou a nota. Material educacional; não é recomendação de investimento.",
    "",
    "## Resumo",
    "",
    "| Pergunta | Métrica | Valor | Leitura boa |",
    "| --- | --- | ---: | --- |",
    `| Mostra o lado certo? | Coerência (nota fora do neutro × lado do SPY) | ${f(c.hitPct, "%")} | ≥ 80% |`,
    `| Acompanha o tamanho? | Spearman nota × z | ${f(c.rho)} | ≥ 0,7 |`,
    `| Tem atraso? | Pico da correlação Δnota × ΔSPY | ${f(L.lagMin, " min")} (r ${f(L.peakR)}) | 0 min |`,
    `| Atraso espalhado? | Parte da resposta depois do mesmo passo | ${f(L.spread == null ? null : Math.round(L.spread * 100), "%")} | < 30% |`,
    `| Reage a choques? | Choques de ${ACC.shockZ}σ em 30 min com reação de ${ACC.reactPts} pts | ${f(R.reactedPct, "%")} de ${R.n} | ≥ 80% |`,
    `| Quanto atrasa no choque? | Mediana (reação da nota − metade do choque no SPY) | ${f(R.medLagMin, " min")} | ≤ 5 min |`,
    `| Troca de faixa confirma? | SPY segue o sentido em 30 / 60 min | ${f(B.confirm30, "%")} / ${f(B.confirm60, "%")} de ${B.n} | > 55% |`,
    `| Vai e volta? | Faixa desfeita em até 30 min | ${f(B.whipsawPct, "%")} | < 25% |`,
    `| Chega tarde à virada? | Mediana de minutos desde o extremo do SPY | ${f(B.medLateMin, " min")} | ≤ 15 min |`,
    `| Ainda vale entrar? | Mediana do movimento que sobrava ao trocar de faixa | ${f(B.medLeftPct, "%")} | ≥ 40% |`,
    `| Intensidade em ordem? | Escada por faixa (Spearman) / por z | ${f(I.monoZone)} / ${f(I.monoZ)} | 1 / 1 |`,
    `| Calibração | Pontos de nota por desvio do SPY · R² | ${f(I.slope)} · ${f(I.r2)} | R² ≥ 0,5 |`,
    `| Prevê os próximos 30 min? | Acerto do lado (base: SPY sobe ${f(F[30]?.baseUpPct, "%")}) | ${f(F[30]?.hitPct, "%")} | > 52% |`,
    `| Prevê os próximos 60 min? | Acerto do lado (base: SPY sobe ${f(F[60]?.baseUpPct, "%")}) | ${f(F[60]?.hitPct, "%")} | > 52% |`,
    "",
    'Os limiares de "leitura boa" são referência de trabalho, fixados antes de olhar o resultado (26/11/2026); não são teste de significância.',
    "",
    "## Por sessão",
    "",
    "| Sessão | Pontos | Coerência | ρ | Atraso (pico) | Atraso no choque | Reagiu | Trocas | Confirma 30 min | Vai e volta | Tarde à virada | À frente 30 min |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(rep.bySession).map(
      ([k, s]) =>
        `| ${SES[k]} | ${s.n} | ${f(s.coherence, "%")} | ${f(s.rho)} | ${f(s.lagMin, " min")} | ${f(s.reactLag, " min")} | ${f(s.reacted, "%")} | ${s.bandN} | ${f(s.confirm30, "%")} | ${f(s.whipsaw, "%")} | ${f(s.lateMin, " min")} | ${f(s.fwd30, "%")} |`,
    ),
    "",
    "## Intensidade",
    "",
    "| Faixa da nota | Pontos | z médio do SPY | Mediana de \\|z\\| |",
    "| --- | ---: | ---: | ---: |",
    ...I.byZone.map((b) => `| ${b.zone} | ${b.n} | ${f(b.meanZ)} | ${f(b.medAbsZ)} |`),
    "",
    "| SPY desde o fechamento (z) | Pontos | Nota média |",
    "| --- | ---: | ---: |",
    ...I.byZ.map((b) => `| ${Number.isFinite(b.lo) ? b.lo : "−∞"} a ${Number.isFinite(b.hi) ? b.hi : "+∞"} | ${b.n} | ${f(b.meanS)} |`), // prettier-ignore
    "",
    "## Atraso: correlação Δnota (agora) × ΔSPY (k passos antes)",
    "",
    "k > 0 = a nota anda depois do mercado; k < 0 = antes.",
    "",
    "| k (min) | " +
      L.profile
        .filter((p) => Math.abs(p.k) <= 6)
        .map((p) => p.min)
        .join(" | ") +
      " |",
    "| --- | " +
      L.profile
        .filter((p) => Math.abs(p.k) <= 6)
        .map(() => "---:")
        .join(" | ") +
      " |",
    "| r | " +
      L.profile
        .filter((p) => Math.abs(p.k) <= 6)
        .map((p) => f(p.r))
        .join(" | ") +
      " |",
    "",
    "## Por bloco (insumo para os pesos)",
    "",
    "| Bloco | Pontos | ρ com o SPY | Atraso (pico) | r no pico | À frente 30 min | À frente 60 min |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rep.blocks.map(
      (b) =>
        `| ${{ eq: "Bolsas", cls: "Classes", vol: "VIX e vol" }[b.id] ?? b.id} | ${b.n} | ${f(b.rho)} | ${f(b.lagMin, " min")} | ${f(b.peakR)} | ${f(b.fwdHit[30], "%")} | ${f(b.fwdHit[60], "%")} |`,
    ),
    "",
    "## Últimas trocas de faixa",
    "",
    "| Quando (NY) | Sessão | De → para | SPY 30 min (z, no sentido) | Vai e volta | Minutos desde a virada | Sobrava |",
    "| --- | --- | --- | ---: | --- | ---: | ---: |",
    ...B.changes
      .slice(-15)
      .map(
        (x) =>
          `| ${nyTime(x.t)} | ${SES[x.ses] ?? x.ses} | ${ZN[x.from]} → ${ZN[x.to]} | ${f(x.fwd[6] == null ? null : Math.round(x.fwd[6] * 100) / 100)} | ${x.whipsaw ? "sim" : "não"} | ${x.lateMin} | ${f(x.leftPct, "%")} |`,
      ),
    "",
    "## Como ler e o que vem depois",
    "",
    "- **Coerência e intensidade** dizem se o pêndulo mostra o que o mercado já fez. Como a nota é feita dos próprios preços, coerência alta é o mínimo esperado; o valor está em onde ela falha (sessão, faixa, bloco).",
    "- **Atraso** aqui é o atraso do MODELO (ativos parados, bolsas de fora fechadas, substitutos). O atraso da entrega na tela soma ~15 s do robô de cotações + até 60 s de cache da borda e não aparece nesta conta.",
    "- **Resolução**: passos de 5 min; atraso menor que 5 min aparece como 0. Pontos vizinhos se sobrepõem (as janelas de 30/60 min andam juntas), então o número efetivo de casos independentes é bem menor que o de pontos: acerto à frente de 53–55% ainda não é prova de vantagem.",
    '- **Trocas de faixa**: "tarde à virada" e "sobrava" medem se a troca chega a tempo de servir para entrar/sair; confirmação acima de 55% com vai e volta abaixo de 25% é o que se espera de um gatilho útil.',
    "- **Por bloco**: bloco com ρ baixo, atraso maior ou acerto à frente pior que os outros é candidato a peso menor. Próxima etapa (backtest): testar pesos alternativos neste mesmo diário, com regra registrada antes e correção para múltiplos testes, sem mudar a nota oficial sem ordem do usuário.",
    "",
  ];
  return lines.join("\n");
}

// ---------- execução ----------
async function main() {
  const full = process.argv.includes("--full");
  const flow = JSON.parse(await readFile(new URL("data/flow.json", ROOT), "utf8"));
  const daily = { dates: flow.dates, close: flow.close };
  let old = [];
  try {
    old = unpackJournal(JSON.parse(await readFile(JOURNAL, "utf8")));
  } catch {
    old = [];
  }
  const range = full || !old.length ? "60d" : "5d";
  const series = {};
  const missing = [];
  await Promise.all(
    REGIME_SYMS.map(async (sym) => {
      try {
        const o = await fetchIntraday(sym, true, range, "5m", { timeout: 20000 });
        series[sym] = { t: o.bars.t, c: o.bars.c, s: o.bars.s };
      } catch {
        missing.push(sym);
      }
    }),
  );
  if (!series.SPY) throw new Error("sem barras do SPY");
  const fresh = buildPoints(daily, series);
  const pts = mergePoints(old, fresh);
  await writeFile(JOURNAL, JSON.stringify(packJournal(pts)) + "\n");
  const dec = decorate(pts).filter((p) => p.ses);
  const rep = accuracyReport(dec);
  const meta = {
    generated: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    from: nyTime(dec[0].t),
    to: nyTime(dec.at(-1).t),
    days: new Set(dec.map((p) => p.day)).size,
    range,
    fresh: fresh.length,
    missing,
  };
  const slim = {
    ...rep,
    reaction: { ...rep.reaction, events: rep.reaction.events.slice(-50) },
    bands: { ...rep.bands, changes: rep.bands.changes.slice(-50) },
  };
  await writeFile(OUT, JSON.stringify({ meta, params: ACC, report: slim }, null, 1) + "\n");
  await writeFile(DOC, renderDoc(rep, meta));
  console.log(`pêndulo × SPY: ${dec.length} pontos (${fresh.length} novos, ${range}), sem barras: ${missing.join(", ") || "nenhum"}`); // prettier-ignore
  console.log(`coerência ${rep.coherence.hitPct}% · ρ ${rep.coherence.rho} · atraso ${rep.lag.lagMin} min · trocas ${rep.bands.n} (confirma 30 min ${rep.bands.confirm30}%)`); // prettier-ignore
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
