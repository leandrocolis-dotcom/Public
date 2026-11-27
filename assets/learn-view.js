// Simulador → 🧠 Aprendizado: o que o modelo em treino (modo sombra) já aprendeu com o diário fora da amostra.
// Lê data/model.json (scripts/train-model.mjs). Só exibe; a aba Sinais de hoje segue com o modelo original.
import { DECISION, SUB_LABEL, SUB_W } from "./decision.js";
import { RULES as SIG_RULES } from "./signals.js";
import { RULES, STATUS, actionable } from "./learner.js";
import { TYPE_LABEL, levelLabel } from "./simulator.js";
import { dateBR, decSep, esc, intTxt } from "./format.js";

const share = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "–");
const toneCls = (t) => (t === "buy" ? "buy" : t === "sell" ? "sell" : "wait");

/** "sig:dip:buy" -> { type, label, tone } legíveis. */
export function logicLabel(key) {
  const [t, c, o] = key.split(":");
  const label =
    t === "dec"
      ? (DECISION.find((d) => d.key === c)?.label ?? c)
      : t === "sig"
        ? (SIG_RULES.find((r) => r.code === c)?.title ?? c)
        : levelLabel(c, o);
  return { type: TYPE_LABEL[t] ?? t, label, tone: o };
}

const ORDER = { approved: 0, eval: 1, eliminated: 2 };

const fR = (x, d = 2) =>
  Number.isFinite(x)
    ? `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d).replace(".", decSep())}R`
    : "–";
const rCls = (x) => (Number.isFinite(x) ? (x > 0 ? "pos" : "neg") : "");
/** Excesso em R (média por dia) com a faixa de 90% e os dias. */
const rCell = (x) =>
  x?.n
    ? `<b class="${rCls(x.mean)}">${fR(x.mean)}</b><div class="muted small">${fR(x.lower)} a ${fR(x.upper)} · ${x.n} d</div>`
    : "–";
const regCell = (bull, bear) =>
  `<span class="${rCls(bull?.mean)}">${bull?.n ? fR(bull.mean) : "–"}</span> / <span class="${rCls(bear?.mean)}">${bear?.n ? fR(bear.mean) : "–"}</span><div class="muted small">${bull?.n ?? 0} d / ${bear?.n ?? 0} d${(bear?.n ?? 0) < RULES.bearMinN ? " · baixa pouco testada" : ""}</div>`;

/** O filtro de vantagem (aba Quando entrar e Decisão do trader) separa bem as decisões? */
function edgeCard(ev, title, note) {
  if (!ev || !(ev.blocked?.n || ev.passed?.n)) return "";
  const g = ["A", "B", "C", "D"];
  const ok = ev.blocked?.n >= 10 && ev.passed?.n >= 10 ? ev.passed.mean > ev.blocked.mean : null;
  return `<section class="card" style="margin-top:12px"><h3>${title}</h3>
    <p>${ok == null ? "Ainda há poucos dias para comparar." : ok ? "✓ As decisões que o filtro <b>bloquearia</b> renderam menos que as liberadas: o filtro ajuda." : "✗ As decisões que o filtro <b>bloquearia</b> NÃO renderam menos que as liberadas: o filtro, como está, não ajudou neste período."}</p>
    <div class="tw" style="box-shadow:none"><table class="sim-tbl"><thead><tr><th>Grupo</th><th class="num">Excesso em R por dia</th></tr></thead><tbody>
    <tr><td>Bloqueadas pelo filtro</td><td class="num">${rCell(ev.blocked)}</td></tr><tr><td>Liberadas</td><td class="num">${rCell(ev.passed)}</td></tr>
    ${g.map((k) => `<tr><td>Nota ${k}</td><td class="num">${rCell(ev.grades?.[k])}</td></tr>`).join("")}</tbody></table></div>
    <p class="note">${note}</p></section>`;
}

/** Estudo retroativo (scripts/retro-study.mjs): o que as regras novas e antigas teriam decidido no passado. */
function retroCard(r) {
  if (!r?.logics?.length) return "";
  const st = (s) =>
    `<span class="tag ${STATUS[s]?.tone ?? "neutral"}">${STATUS[s]?.label ?? s}</span>`;
  const rows = r.logics
    .filter((l) => l.n >= 10)
    .map((l) => ({ ...l, ...logicLabel(l.key) }))
    .map(
      (
        l,
      ) => `<tr><td><span class="muted small">${esc(l.type)}${l.act ? "" : " · não opera"}</span><div><span class="tag ${toneCls(l.tone)}">${esc(l.label)}</span></div></td>
      <td class="num">${share(l.score)}</td><td class="num">${l.act ? rCell(l.x) : "–"}</td><td class="num">${l.act ? regCell(l.bull, l.bear) : "–"}</td><td>${st(l.v1)}</td><td>${st(l.v2)}${l.bh ? ' <span class="small pos">✓ testes múltiplos</span>' : ""}</td></tr>`,
    )
    .join("");
  const ic = r.weightsIC?.ic ?? {};
  return `<section class="card" style="margin-top:12px"><h3>Estudo retroativo <span class="muted small">prévia · não aprova nada no modelo</span></h3>
    <div class="kv"><div><span>Período</span><b>${dateBR(r.from)} a ${dateBR(r.to)}</b></div><div><span>Ativos</span><b>${r.assets}</b></div>
    <div><span>Pregões</span><b>${r.days}</b></div><div><span>Gatilhos encerrados</span><b>${intTxt(r.closed)}</b></div>
    <div><span>Dias em regime de baixa</span><b>${r.bearDays}</b></div><div><span>Gerado em</span><b>${dateBR(r.generatedAt?.slice(0, 10))}</b></div></div>
    <p class="muted small">Refaz, pregão a pregão e só com os dados de cada data, os gatilhos que o diário gravaria (incluindo os ativos da sua carteira: ${esc((r.held ?? []).join(", ") || "–")}). Decisão do trader sem fundamentos (não existem no passado). É otimista: as regras foram escolhidas olhando esses anos.</p>
    <div class="tw" style="box-shadow:none"><table class="sim-tbl"><thead><tr><th>Lógica</th><th class="num">Acerto</th><th class="num">Excesso em R</th><th class="num">Alta / baixa</th><th>Regra antiga</th><th>Regra nova</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h4 style="margin:12px 0 4px">Correlação de cada parte da decisão com o excesso (20 pregões)</h4>
    <p class="muted small">${Object.keys(SUB_W)
      .map(
        (k) =>
          `${esc(SUB_LABEL[k])}: <b>${ic[k]?.ic == null ? "–" : ic[k].ic.toFixed(3).replace(".", decSep())}</b>${ic[k]?.n ? ` (${ic[k].n})` : ""}`,
      )
      .join(" · ")}. Perto de zero = a opinião quase não ordena o retorno.</p></section>
    ${edgeCard(r.edge, "O filtro de vantagem funcionou no passado?", "Mesma régua do filtro de vantagem da Decisão do trader (expectativa do placar técnico no próprio ativo, regime, decaimento), calculada em cada data só com as operações já encerradas. Notas: A = vantagem medida e contexto a favor; B = vantagem medida; C = pouca amostra; D = expectativa negativa (bloqueia).")}`;
}

export function viewLearn({ model: m, error, loading, retro = null }) {
  if (!m)
    return `<div class="card empty">${loading ? "Carregando o modelo…" : error ? `Modelo ainda não publicado (${esc(error)}). O primeiro treino roda depois do fechamento do próximo pregão.` : "Carregando o modelo…"}</div>`; // prettier-ignore
  const c = m.criteria?.items ?? [];
  const last = m.versions?.at(-1);
  const u = m.universe ?? {};
  const cmp = m.compare ?? {};
  const head = `<section class="card"><h3>${m.final ? "✅ Modelo final" : "🧠 Modelo em treino"} <span class="muted small">modo sombra: só observa; os gatilhos não mudam</span></h3>
    <div class="kv"><div><span>Início do diário</span><b>${dateBR(m.startDate)}</b></div><div><span>Último treino</span><b>${dateBR(m.lastRun)}</b></div>
    <div><span>Pregões de diário</span><b>${m.sessions} de ${RULES.finalSessions}</b></div><div><span>Retreino (versão)</span><b>${last ? `v${last.n} · ${dateBR(last.date)}` : "–"}</b></div>
    <div><span>Ativos no treino</span><b>${u.n ?? "–"}</b></div><div><span>Da sua carteira / listas</span><b>${u.note ? "–" : `${u.held ?? 0} / ${u.lists ?? 0}`}</b></div></div>
    ${u.note ? `<p class="muted small">⚠ ${esc(u.note)}.</p>` : ""}
    ${m.backfill ? `<p class="small warn-txt">⚠ Os pregões de ${dateBR(m.backfill.from)} a ${dateBR(m.backfill.to)} (${m.backfill.days}) foram <b>reconstruídos</b> com dados históricos, um por um e sem olhar o futuro, para o modelo não começar do zero. Ressalvas: sem fundamentos antigos e com regras criadas depois desse período. O diário ao vivo começou em ${dateBR(m.backfill.realStart)}. Relatório em docs/APRENDIZADO-BACKFILL.md.</p>` : ""}
    <h4 style="margin:12px 0 4px">Critérios do modelo final</h4>
    <ul class="learn-crit">${c.map((x) => `<li class="${x.ok ? "pos" : "muted"}">${x.ok ? "✓" : "○"} ${esc(x.text)}</li>`).join("")}</ul>
    <div class="desk-ms learn-ms"><div class="desk-m"><b>${share(cmp.current?.score)}</b><span>Modelo atual (tudo, pesos originais) · ${cmp.current?.n ?? 0} dias</span></div>
    <div class="desk-m ${cmp.learned?.score >= RULES.threshold ? "buy" : ""}"><b>${share(cmp.learned?.score)}</b><span>Modelo em treino (sem as eliminadas, pesos novos)</span></div></div></section>`; // prettier-ignore

  const rows = Object.entries(m.logics ?? {})
    .map(([k, l]) => ({ k, l, ...logicLabel(k), pv: m.preview?.[k] }))
    .sort((a, b) => ORDER[a.l.status] - ORDER[b.l.status] || (b.l.n ?? 0) - (a.l.n ?? 0) || (b.pv?.n ?? 0) - (a.pv?.n ?? 0)); // prettier-ignore
  const logicTbl = `<section class="card" style="margin-top:12px"><h3>Lógicas <span class="muted small">(${rows.length})</span></h3>
    <div class="tw" style="box-shadow:none"><table class="sim-tbl"><thead><tr><th>Lógica</th><th>Status</th><th class="num" title="Dias distintos com gatilho encerrado / total de gatilhos">Dias / gatilhos</th><th class="num">Aproveit.</th><th class="num" title="Intervalo de 90%: pessimista – otimista">Faixa 90%</th><th class="num" title="Excesso em R por dia (com stop de 2,5 ATR e custos, menos a média do universo no mesmo dia), faixa de 90%">Excesso em R</th><th class="num" title="Excesso em R no regime de alta / de baixa (S&P × média de 200 dias)">Alta / baixa</th><th class="num" title="Backtest do último ano: só referência, não decide">Prévia backtest</th></tr></thead><tbody>
    ${rows.map(({ k, l, type, label, tone, pv }) => `<tr><td><span class="muted small">${esc(type)}${actionable(k) ? "" : " · não opera"}</span><div><span class="tag ${toneCls(tone)}">${esc(label)}</span></div></td>
      <td><span class="tag ${STATUS[l.status].tone}">${STATUS[l.status].label}</span>${l.since ? `<div class="muted small">desde ${dateBR(l.since)}</div>` : ""}</td>
      <td class="num">${l.n ?? 0} / ${l.raw ?? 0}<div class="muted small">${l.n >= RULES.minN ? "amostra ok" : `faltam ${RULES.minN - (l.n ?? 0)} dias`}</div></td>
      <td class="num"><b class="${l.score >= RULES.threshold ? "pos" : l.score != null ? "neg" : ""}">${share(l.score)}</b></td>
      <td class="num muted">${l.n ? `${share(l.lower)} – ${share(l.upper)}` : "–"}</td>
      <td class="num">${actionable(k) ? rCell(l.rx) : '<span class="muted small">pelo acerto</span>'}${l.bh ? '<div class="small pos">✓ testes múltiplos</div>' : ""}</td>
      <td class="num">${actionable(k) ? regCell(l.rbull, l.rbear) : "–"}</td>
      <td class="num muted">${pv?.n ? `${share(pv.score)} <span class="small">(${pv.n} dias)</span>` : "–"}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">Nenhum gatilho gravado ainda.</td></tr>`}
    </tbody></table></div></section>`; // prettier-ignore

  const acc = m.weightAcc ?? {};
  const wTbl = `<section class="card" style="margin-top:12px"><h3>Pesos da Decisão do trader</h3>
    <div class="tw" style="box-shadow:none"><table class="sim-tbl"><thead><tr><th>Parte</th><th class="num">Original</th><th class="num">Em treino</th><th class="num" title="Quantas vezes a parte, sozinha, acertou a direção em 5 pregões">Acerto de direção</th><th class="num" title="Correlação de postos entre a opinião da parte e o excesso de retorno em 20 pregões (método novo)">Correlação</th></tr></thead><tbody>
    ${Object.keys(SUB_W).map((k) => `<tr><td>${esc(SUB_LABEL[k])}</td><td class="num">${share(SUB_W[k])}</td><td class="num"><b>${share(m.weights?.[k])}</b></td><td class="num muted">${acc[k]?.n ? `${share(acc[k].acc)} <span class="small">(${acc[k].n})</span>` : "–"}${acc[k]?.n && acc[k].n < RULES.weightMinN ? `<div class="small">peso só muda com ${RULES.weightMinN}+</div>` : ""}</td><td class="num muted">${m.weightIc?.[k]?.ic != null ? `${m.weightIc[k].ic.toFixed(3).replace(".", decSep())} <span class="small">(${m.weightIc[k].n})</span>` : "–"}</td></tr>`).join("")}
    </tbody></table></div><p class="muted small">Método atual: <b>${esc(m.weightMethod ?? "acerto")}</b>. Com ${RULES.weightMinN}+ decisões com excesso em 20 pregões, o peso passa a seguir a correlação (0 = peso original; cada +0,05 = +20%).</p></section>`; // prettier-ignore

  const vs = (m.versions ?? []).slice(-8).reverse();
  const vTbl = vs.length
    ? `<section class="card" style="margin-top:12px"><h3>Retreinos <span class="muted small">(${m.versions.length})</span></h3>
    <div class="tw" style="box-shadow:none"><table class="sim-tbl"><thead><tr><th>Versão</th><th>Data</th><th class="num">Aprovadas</th><th class="num">Eliminadas</th><th>Pesos (téc · fund · merc · hist)</th></tr></thead><tbody>
    ${vs.map((v) => `<tr><td>v${v.n}</td><td>${dateBR(v.date)}</td><td class="num">${v.approved.length}</td><td class="num">${v.eliminated.length}</td><td class="muted">${Object.keys(SUB_W).map((k) => share(v.weights[k])).join(" · ")}</td></tr>`).join("")}
    </tbody></table></div></section>` // prettier-ignore
    : "";

  return `${head}${logicTbl}${edgeCard(m.edge, "O filtro de vantagem funciona? (diário real)", "Compara o excesso em R das decisões que o filtro de vantagem bloquearia com as liberadas, e por nota (A a D). Responde, com dados fora da amostra, se o filtro de vantagem da Decisão do trader ajuda.")}${wTbl}${vTbl}${retroCard(retro)}
    <p class="note"><b>Versão 2 (autorizada em 09/10/2026).</b> Cada gatilho também é medido <b>em R</b> (stop de ${RULES.stopAtr} ATR, ${(RULES.cost * 100).toFixed(2).replace(".", decSep())}% de custo por perna) no horizonte da lógica (decisões ${RULES.horizon.dec} pregões; sinais e níveis ${RULES.horizon.sig}), em <b>excesso sobre a média do universo</b> no mesmo dia (tira a maré do mercado) e separado por <b>regime</b>. Lógicas que mandam operar são aprovadas pela expectativa em excesso, com ${RULES.minN}+ dias e correção de Benjamini-Hochberg (no máximo ${share(RULES.fdr)} de aprovações falsas esperadas); eliminadas com excesso ≤ 0. "Esperar" segue pelo aproveitamento. O modelo final também exige que nenhuma aprovada falhe no regime de baixa. Os pesos passam a seguir a correlação com o excesso.</p>
    <p class="note"><b>Como o modelo aprende (regra de aproveitamento).</b> Todo pregão, depois do fechamento, o servidor grava os gatilhos que a Decisão do trader daria em cada ativo (os ${u.n ?? "–"} do treino) e, ${5} pregões depois, o resultado: Atingiu, Parcial ou Não atingiu. Só esse diário <b>fora da amostra</b> decide; o backtest é prévia. Como os ativos andam juntos, cada <b>dia</b> conta como uma observação. Com ${RULES.minN}+ dias, lógica com aproveitamento abaixo de ${share(RULES.threshold)} é <b>eliminada</b> (antes, se nem o limite otimista chega a ${share(RULES.threshold)} com ${RULES.earlyN}+ dias); para voltar precisa de ${share(RULES.revive)}. A cada ${RULES.retrainEvery} pregões um <b>retreino</b> ajusta os pesos da decisão um quarto do caminho rumo ao acerto de cada parte (entre 0,5× e 1,5× do original). <b>Modelo final</b>: ${RULES.finalSessions}+ pregões, ${RULES.finalApproved}+ lógicas aprovadas (${RULES.finalActionable}+ mandando comprar ou vender), todas com ${RULES.minN}+ dias, ≥ ${share(RULES.threshold)} e limite pessimista ≥ ${share(RULES.finalLower)}, e ${RULES.finalStableVersions} retreinos seguidos sem mudar. Aí ele congela e o aviso aparece aqui. Material educacional; não é recomendação de investimento.</p>`; // prettier-ignore
}
