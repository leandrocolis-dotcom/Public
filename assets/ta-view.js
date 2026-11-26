// Aba "Quando entrar": radar de sinais, tela de detalhe, plano e explicações simples.
// Os cálculos ficam em ta.js e ta-signals.js; dados em ta-data.js; configuração dos gráficos em ta-chart.js.
import { dismissible } from "./dismiss.js";
import { ASSETS } from "./universe.js";
import { tickAttr } from "./flash.js";
import { dateBR, esc, num, pct, pctU, signed } from "./format.js";
import { GLOSSARY, LESSONS, SOURCES } from "./ta-glossary.js";
import {
  assetCall,
  WATCH_MAX,
  backtestFor,
  daily,
  ensureIntraday,
  ensureOhlc,
  isOpenNow,
  logChange,
  refreshWatch,
  rerender,
  ta,
} from "./ta-data.js";
import { DAILY_VISIBLE, mainConfig, subConfig } from "./ta-chart.js";
import { ensurePro, mountPro, proSeries } from "./pro-chart.js";
import { attachCompare } from "./chart-compare.js";
import { eventRiskHtml } from "./calendar-view.js";
import { state } from "./state.js";
import * as S from "./ta-signals.js";
import { GRADE_TXT, fmtR, kellyQuarter } from "./edge.js";
import * as T from "./ta.js";

const CLASS_LIST = [
  "Todas",
  "Ações EUA",
  "Ações Globais",
  "Setores",
  "Renda Fixa",
  "Commodities",
  "Moedas",
  "Volatilidade",
];

const RADAR_CODES = Object.values(ASSETS)
  .filter((a) => a.group !== "Macro")
  .map((a) => a.code);

const FILTERS = [
  ["all", "Todos"],
  ["buy", "Comprar"],
  ["wait", "Aguardar"],
  ["sell", "Vender"],
];

const SORTS = [
  ["best", "Melhor para comprar"],
  ["worst", "Melhor para vender/reduzir"],
  ["code", "Ordem alfabética"],
];

function watchCard(ctx) {
  const list = (ctx.prefs.taWatch ?? []).filter((c) => ASSETS[c]);
  if (!list.length)
    return `<div class="card ta-watch"><h2>Ativos vigiados</h2><p class="muted ta-small" data-keep>Nenhum ativo vigiado. Abra um ativo e toque em <b>☆ Vigiar</b>: com o pregão aberto, a página confere o ativo a cada minuto e avisa quando a resposta mudar (ex.: de "Aguardar" para "Comprar"). Até ${WATCH_MAX} ativos.</p></div>`;
  const rows = list
    .map((c) => {
      const w = ta.watch[c];
      const now = assetCall(ctx, c)?.call; // mesma resposta do radar e do detalhe
      return `<button class="ta-row ${now?.tone ?? "wait"}" data-ta-open="${c}"><div class="ta-id"><span class="tk">${c}</span><span class="nm">${esc(ASSETS[c].name)}</span></div><div class="ta-vd"><b>${esc(now?.headline ?? "carregando…")}</b></div><div class="ta-mt muted">${w ? `às ${w.at}${w.live ? "" : " (última sessão)"}` : ""}</div><div class="ta-why"></div></button>`;
    })
    .join("");
  return `<div class="card ta-watch"><h2>Ativos vigiados</h2><div class="ta-rows">${rows}</div><p class="muted ta-small">Atualiza a cada minuto com o pregão aberto e avisa na tela quando a resposta mudar.</p></div>`;
}

function changesCard(list) {
  if (list.length < 2) return "";
  return `<div class="card"><h2>O que mudou hoje neste ativo</h2><ul class="ta-list-simple">${[
    ...list,
  ]
    .reverse()
    .map(
      (x) => `<li><b>${esc(x.at)}</b> (Brasília), preço ${num(x.price)}: ${esc(x.headline)}</li>`,
    )
    .join(
      "",
    )}</ul><p class="muted ta-small">Registrado enquanto esta página está aberta.</p></div>`;
}

const dpct = (x, base) => pct(x / base - 1);

function gauge(score, { small = false } = {}) {
  const left = Math.max(0, Math.min(100, (score + 100) / 2));
  return `<div class="ta-gauge ${small ? "sm" : ""}" role="img" aria-label="Placar ${signed(score, 0)} numa escala de -100 a +100"><i style="left:${left}%"></i></div>`;
}

const verdictTag = (v) => `<span class="tag ${v.tone}">${esc(v.label)}</span>`;

function glossary(tip) {
  const g = GLOSSARY[tip];
  if (!g) return "";
  return `<details class="ta-gl"><summary>O que é isso?</summary><div><b>${esc(g.name)}.</b> ${esc(g.what)}<ul>${g.read.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="muted"><b>Limite:</b> ${esc(g.limit)}</p></div></details>`;
}

function voteItem(v) {
  const s = v.dir > 0.15 ? "up" : v.dir < -0.15 ? "down" : "flat";
  const icon = s === "up" ? "▲" : s === "down" ? "▼" : "•";
  return `<li class="ta-vote ${s}"><div class="ta-vh"><span class="ta-ic" aria-hidden="true">${icon}</span><b>${esc(v.title)}</b></div><p>${esc(v.text)}</p>${glossary(v.tip)}</li>`;
}

function votesCard(title, a, intro) {
  if (!a) return "";
  const rank = (x) => Math.abs(x.dir) * x.w;
  const ups = a.votes.filter((v) => v.dir > 0.15).sort((x, y) => rank(y) - rank(x));
  const downs = a.votes.filter((v) => v.dir < -0.15).sort((x, y) => rank(y) - rank(x));
  const flats = a.votes.filter((v) => Math.abs(v.dir) <= 0.15);
  const col = (h, list, tone) =>
    list.length
      ? `<div class="ta-col ${tone}"><h4>${h} <span class="muted">(${list.length})</span></h4><ul>${list.map(voteItem).join("")}</ul></div>`
      : "";
  const bars = Object.entries(a.catScores)
    .map(
      ([k, x]) =>
        `<div class="ta-cat"><span>${esc(S.CATS[k] ?? k)}</span>${gauge(Math.round(x * 100), { small: true })}<b class="${x > 0.12 ? "pos" : x < -0.12 ? "neg" : ""}">${signed(Math.round(x * 100), 0)}</b></div>`,
    )
    .join("");
  return `<div class="card"><h2>${esc(title)}</h2><p class="muted">${esc(intro)}</p><div class="ta-cats">${bars}</div>
    <div class="ta-cols">${col("Sinais de alta", ups, "up")}${col("Sinais de baixa", downs, "down")}</div>
    ${flats.length ? `<details class="ta-flat"><summary>${flats.length} sinais neutros (sem direção)</summary><ul>${flats.map(voteItem).join("")}</ul></details>` : ""}</div>`;
}

function planCard(title, a, edge = null) {
  if (!a?.plan) {
    return `<div class="card"><h2>${esc(title)}</h2><p>O placar está equilibrado, então não há uma entrada com vantagem clara. <b>Esperar também é uma decisão.</b> Quando o placar passar de +20 (compra) ou de −20 (venda), o plano aparece aqui.</p></div>`;
  }
  const p = a.plan;
  const long = p.dir > 0;
  const wait = a.timing.status === "wait";
  const zone =
    wait && a.timing.zone
      ? `${num(Math.min(...a.timing.zone))} a ${num(Math.max(...a.timing.zone))}`
      : null;
  const mult = edge?.sizeMult ?? 1;
  const maxPos = Math.min(100, ((0.01 * mult) / p.riskPct) * 100);
  const kelly = kellyQuarter(edge?.stats);
  const row = (k, v, cls = "") => `<div><span>${k}</span><b class="${cls}">${v}</b></div>`;
  return `<div class="card"><h2>${esc(title)}</h2>
    <div class="ta-status ${a.timing.status}">${esc(a.timing.text)}</div>
    <div class="ta-plan">
      ${row(long ? "Entrada" : "Se já tem: reduza perto de", zone ? `esperar ${zone}` : `~${num(p.entry)}`)}
      ${row(long ? "Saída se errar (stop)" : "Ideia falha se passar de", `${num(p.stop)} <small>(${pctU(p.stop / p.entry - 1)} ${long ? "abaixo" : "acima"})</small>`, "neg")}
      ${row(long ? "Meta 1" : "Meta de queda 1", `${num(p.t1)} <small>(${dpct(p.t1, p.entry)})</small>`, "pos")}
      ${row(long ? "Meta 2" : "Meta de queda 2", `${num(p.t2)} <small>(${dpct(p.t2, p.entry)})</small>`, "pos")}
      ${row("Ganho / risco", `${num(p.rr, 1)} : 1`)}
      ${row("Acerto para empatar", `${num(100 / (1 + p.rr), 0)}%`)}
      ${edge?.stats?.n ? row("Expectativa medida", `${fmtR(edge.stats.expectancy)} <small>(${edge.stats.n} operações)</small>`, edge.stats.expectancy > 0 ? "pos" : "neg") : ""}
      ${row("Tamanho máximo", `${num(maxPos, 0)}% do capital${mult < 1 ? " <small>(metade: contexto contra)</small>" : ""}`)}
      ${kelly ? row("Teto por Kelly (¼)", `${num(kelly * 100, 0)}% do capital`) : ""}
    </div>
    <p class="muted ta-small">${long ? "Compre" : "Reduza"} só se aceitar perder até o stop. Regra prática: arrisque no máximo ${mult < 1 ? "0,5%" : "1%"} do seu capital por operação${mult < 1 ? " (metade do normal, pelo contexto)" : ""}. Com o stop a ${pctU(p.riskPct)} da entrada, isso permite aplicar até ${num(maxPos, 0)}% do capital nesta operação. ${p.t1Structural ? "A meta 1 está num piso/teto real do gráfico." : "Sem piso/teto próximo: a meta 1 é 1,5× o risco."}</p>
    ${checklist(a, p, wait, edge)}</div>`;
}

/** Checklist antes de operar (lição 17): o que o site já sabe vem marcado; o resto é com você. */
function checklist(a, p, wait, edge) {
  const item = (ok, txt) =>
    `<li class="${ok === true ? "ok" : ok === false ? "no" : "ask"}"><span aria-hidden="true">${ok === true ? "✓" : ok === false ? "✗" : "?"}</span>${txt}</li>`;
  const sameSide = Math.sign(a.score) === p.dir;
  return `<details class="ta-check"><summary>Checklist antes de entrar</summary><ul>
    ${item(sameSide && a.confidence !== "baixa", `Sinais a favor com confiança ${esc(a.confidence ?? "–")}`)}
    ${item(!wait, wait ? "Momento: esticado, melhor esperar o recuo" : "Momento de entrada sem esticamento")}
    ${item(true, "Stop definido antes de entrar, num nível que invalida a ideia")}
    ${item(p.rr >= 2 ? true : p.rr >= 1.5 ? null : false, `Ganho/risco de ${num(p.rr, 1)} (ideal ≥ 2 em operação de tendência)`)}
    ${edge ? item(edge.stats?.n >= 10 ? edge.stats.expectancy > 0 : null, edge.stats?.n >= 10 ? `Expectativa medida ${edge.stats.expectancy > 0 ? "positiva" : "negativa"} neste ativo (${fmtR(edge.stats.expectancy)})` : "Expectativa ainda sem amostra suficiente neste ativo") : ""}
    ${edge?.flags.some((f) => /regime/i.test(f.text)) ? item(edge.sizeMult === 1 || !edge.flags.some((f) => /regime de baixa/i.test(f.text)), edge.flags.find((f) => /regime/i.test(f.text)).text) : ""}
    ${item(null, `Tamanho calculado para arriscar até ${edge?.sizeMult < 1 ? "0,5%" : "1%"} do capital`)}
    ${item(null, "Risco total aberto até 6% e sem concentrar num só setor")}
    ${item(null, "Sem balanço, FOMC ou CPI nos próximos dias")}
    ${item(null, "Vai registrar no diário (setup, R planejado e realizado)")}
  </ul><p class="muted ta-small">✓ o site confirmou · ✗ não atende · ? confira você. Ver lição 17 em "Aprenda".</p></details>`;
}

function levelsCard(d, ia, mode, sym = "") {
  const a = d.a;
  const c = a.price;
  const dist = (x) => pct(x / c - 1, 1);
  const li = (kind, label, x, extra = "") =>
    `<li class="${kind}"><span>${esc(label)}</span><b>${num(x)}</b> <small>${dist(x)}${extra}</small></li>`;
  const sup = a.struct.levels.supports
    .slice(0, 3)
    .map((z) => li("sup", "Piso", z.price, ` · tocou ${z.touches}x`));
  const res = a.struct.levels.resistances
    .slice(0, 3)
    .map((z) => li("res", "Teto", z.price, ` · tocou ${z.touches}x`));
  const f = a.struct.fib;
  const fib = f
    ? `<p class="muted ta-small">Última ${f.dir === "up" ? "alta" : "queda"}: de ${num(f.dir === "up" ? f.low : f.high)} a ${num(f.dir === "up" ? f.high : f.low)}. Já devolveu ${num(f.retr * 100, 0)}%. Zona clássica (Fibonacci): ${num(f.levels.find((x) => x.r === 0.382).price)} (38%), ${num(f.levels.find((x) => x.r === 0.5).price)} (50%), ${num(f.levels.find((x) => x.r === 0.618).price)} (62%).</p>`
    : "";
  let intra = "";
  if (mode === "today" && ia) {
    const L = ia.levels;
    const it = [
      li("neutral", "VWAP (preço médio de hoje)", L.vwap),
      L.orH != null ? li("res", "Faixa de abertura: máxima", L.orH) : "",
      L.orL != null ? li("sup", "Faixa de abertura: mínima", L.orL) : "",
      L.prevH != null ? li("res", "Máxima de ontem", L.prevH) : "",
      L.prevL != null ? li("sup", "Mínima de ontem", L.prevL) : "",
    ].join("");
    intra = `<h3>Referências de hoje</h3><ul class="ta-lv">${it}</ul>`;
  }
  return `<div class="card"><h2>Pisos e tetos</h2><div class="ta-lvwrap"><ul class="ta-lv">${res.reverse().join("") || `<li class="muted">Sem tetos claros acima do preço.</li>`}<li class="now"><span>Preço agora</span><b${tickAttr(sym, c)}>${num(c)}</b></li>${sup.join("") || `<li class="muted">Sem pisos claros abaixo do preço.</li>`}</ul></div>${fib}${intra}</div>`;
}

function backtestCard(d, a) {
  const bt = backtestFor(d);
  const row = (name, s, side) =>
    `<tr><td>${name}</td><td>${s.n}</td><td>${s.n ? pctU(s.hit, 0) : "–"}</td><td>${s.n ? pct(s.avg) : "–"}</td><td>${side}</td></tr>`;
  return `<div class="card"><h2>Esse sinal já funcionou neste ativo?</h2>
    <p>${esc(S.backtestText(bt, a.dir) ?? "Hoje o placar está equilibrado; veja abaixo como os sinais passados se comportaram.")}</p>
    <div class="tw"><table class="ta-bt"><thead><tr><th>Sinal</th><th>Vezes</th><th>Acertou</th><th>Variação média em ${bt.h} pregões</th><th>Comparação</th></tr></thead><tbody>
      ${row("Compra (placar ≥ +20)", bt.buy, `dia qualquer: ${pct(bt.base)}`)}${row("Venda (placar ≤ −20)", bt.sell, `dia qualquer: ${pct(bt.base)}`)}
    </tbody></table></div>
    <h3>Como operações reais teriam saído (em R)</h3>
    <div class="tw"><table class="ta-bt"><thead><tr><th>Sinal</th><th>Operações</th><th>Acerto</th><th>Para empatar</th><th>Expectativa</th><th>Profit factor</th><th>Pior sequência</th></tr></thead><tbody>
      ${rRow("Compra", bt.buyR)}${rRow("Venda", bt.sellR)}
    </tbody></table></div>
    <p class="muted ta-small">Primeira tabela: teste simples, sem custos e sem sobreposição. Segunda: cada sinal vira uma operação (entra na abertura seguinte, stop a 2,5 ATR, sai em 20 pregões), com 0,05% de custo por perna. R = quanto se arriscou; expectativa acima de +0,2R é boa. Com menos de 10 operações o número não decide nada. É o passado deste ativo: não garante o futuro.</p></div>`;
}

function rRow(name, r) {
  if (!r?.n)
    return `<tr><td>${name}</td><td>0</td><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td></tr>`;
  const pf =
    r.profitFactor == null ? "–" : Number.isFinite(r.profitFactor) ? num(r.profitFactor, 2) : "∞";
  return `<tr><td>${name}</td><td>${r.n}</td><td>${pctU(r.winRate, 0)}</td><td>${r.breakeven == null ? "–" : pctU(r.breakeven, 0)}</td><td class="${r.expectancy > 0 ? "pos" : "neg"}"><b>${fmtR(r.expectancy)}</b></td><td>${pf}</td><td>${fmtR(-r.maxDD)}</td></tr>`;
}

function candlesCard(a) {
  const p = a.patterns;
  if (!p.length) return "";
  return `<div class="card"><h2>Candles recentes</h2><ul class="ta-list-simple">${p.map((x) => `<li><b>${esc(x.name)}</b> ${x.ago ? "(ontem)" : "(hoje)"}: sugere ${x.dir > 0 ? "virada para cima" : "virada para baixo"}.</li>`).join("")}</ul>${glossary("candle")}</div>`;
}

function clockBar(ctx) {
  const now = Date.now() / 1000;
  const open = isOpenNow(ctx, now);
  const { date, min } = S.nyParts(now);
  const info = S.sessionInfo(date);
  const ph = S.phaseAt(min, info.closeMin);
  const brt = S.brtClock(now);
  const note = info.reason && info.open ? ` · <b>${esc(info.reason)}</b>` : "";
  const txt = open
    ? `<b>Pregão aberto</b> · agora ${brt} (Brasília) · <b>${esc(ph.name)}</b>: ${esc(ph.tip)}${note}`
    : `<b>Pregão fechado</b>${info.reason ? ` (${esc(info.reason)})` : ""} · agora ${brt} (Brasília). Os sinais de "hoje" usam a última sessão.`;
  return `<div class="ta-clock ${open ? (ph.good ? "good" : "mid") : "off"}" role="status">${txt}</div>`;
}

function radarRows(ctx) {
  const rows = [];
  for (const code of RADAR_CODES) {
    const r = assetCall(ctx, code);
    if (!r) continue;
    rows.push({ code, a: r.d.a, call: r.call, ia: r.ia, closeOnly: r.d.bars.closeOnly });
  }
  return rows;
}

/** Direção da resposta final (a mesma do detalhe): 1 comprar, −1 vender/reduzir, 0 aguardar. */
const callDir = (call) => (call.tone === "buy" ? 1 : call.tone === "sell" ? -1 : 0);

/** Resumo de uma linha: os dois motivos mais fortes de categorias diferentes, no lado do veredito. */
function topReason(a) {
  const rank = (x) => Math.abs(x.dir) * x.w;
  const pool = a.votes.filter((x) => (a.dir >= 0 ? x.dir > 0.15 : x.dir < -0.15));
  const list = (pool.length ? pool : a.votes).sort((x, y) => rank(y) - rank(x));
  const first = list[0];
  const second = list.find((x) => x.cat !== first?.cat);
  return [first, second]
    .filter(Boolean)
    .map((x) => x.title)
    .join(" · ");
}

function viewRadar(ctx) {
  const p = ctx.prefs;
  const all = radarRows(ctx);
  const fl = p.taFilter ?? "all";
  const rows = all
    .filter((r) => p.taClass === "Todas" || ASSETS[r.code].group === p.taClass)
    .filter(
      (r) =>
        fl === "all" ||
        (fl === "buy"
          ? callDir(r.call) > 0
          : fl === "sell"
            ? callDir(r.call) < 0
            : callDir(r.call) === 0),
    );
  const sort = p.taSort ?? "best";
  rows.sort((x, y) =>
    sort === "code"
      ? x.code.localeCompare(y.code)
      : sort === "worst"
        ? x.a.score - y.a.score
        : y.a.score - x.a.score,
  );
  const counts = all.reduce(
    (m, r) => ((m[callDir(r.call)] = (m[callDir(r.call)] ?? 0) + 1), m),
    {},
  );
  const opt = (arr, cur) =>
    arr
      .map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`)
      .join("");
  const closeOnly = rows.some((r) => r.closeOnly);
  const list = rows
    .map((r) => {
      const a = r.a;
      return `<button class="ta-row ${r.call.tone}" data-ta-open="${r.code}" aria-label="${esc(ASSETS[r.code].name)}: ${esc(r.call.headline)}">
        <div class="ta-id"><span class="tk">${r.code}</span><span class="nm">${esc(ASSETS[r.code].name)}</span></div>
        <div class="ta-vd"><span class="tag ${r.call.tone}">${esc(r.call.headline)}</span>${r.ia ? ` <small class="muted">com o pregão de hoje</small>` : ""}</div>
        <div class="ta-mt">${gauge(a.score, { small: true })}<b class="${a.score > 19 ? "pos" : a.score < -19 ? "neg" : ""}">${signed(a.score, 0)}</b></div>
        <div class="ta-why muted">${esc(topReason(a))}</div></button>`;
    })
    .join("");
  const intro = `<details class="card ta-intro" ${p.taIntroClosed ? "" : "open"}><summary>Como usar esta aba (3 passos)</summary>
    <ol>
      <li><b>Veja o radar.</b> Verde = os sinais favorecem <b>comprar</b>; vermelho = favorecem <b>vender ou reduzir</b>; amarelo = <b>aguardar</b>. O número (−100 a +100) mostra quantos sinais independentes concordam.</li>
      <li><b>Abra um ativo.</b> No topo vem a resposta numa frase e o <b>motivo</b>. Cada motivo tem um botão "O que é isso?" que explica a ferramenta sem jargão.</li>
      <li><b>Confira o momento (hoje).</b> Um ativo pode ser bom e o <i>momento</i> ruim (esticado, abertura, almoço). O plano mostra <b>onde entrar, onde sair se errar (stop) e as metas</b>.</li>
    </ol>
    <p class="muted ta-small">É um placar de sinais, não uma previsão. Mostramos quanto cada sinal acertou no passado de cada ativo; quando não foi melhor do que um dia qualquer, o site diz. Material educacional, não é recomendação de investimento.</p></details>`;
  return `${clockBar(ctx)}${watchCard(ctx)}${intro}
    ${ta.ohlcErr ? dismissible("card ta-warn", `Histórico completo (máxima, mínima e volume) indisponível (${esc(ta.ohlcErr)}). Usando só fechamentos: o placar fica um pouco menos preciso e os padrões de candle e o volume ficam de fora.`) : closeOnly && !ta.ohlc ? `<div class="card ta-warn">Carregando o histórico completo…</div>` : closeOnly ? dismissible("card ta-warn", "O histórico completo com máxima, mínima e volume ainda não foi gerado para alguns ativos (aparece na próxima atualização automática). Por enquanto, a leitura usa só fechamentos.") : ""}
    <div class="toolbar"><select data-ta-pref="taClass" aria-label="Classe">${opt(
      CLASS_LIST.map((x) => [x, x]),
      p.taClass,
    )}</select>
      <span class="seg" role="group" aria-label="Filtrar por sinal">${FILTERS.map(([k, l]) => `<button class="${fl === k ? "on" : ""}" data-ta-filter="${k}" aria-pressed="${fl === k}">${l}${k === "buy" ? ` (${counts[1] ?? 0})` : k === "sell" ? ` (${counts[-1] ?? 0})` : k === "wait" ? ` (${counts[0] ?? 0})` : ""}</button>`).join("")}</span>
      <select data-ta-pref="taSort" aria-label="Ordenar">${opt(SORTS, sort)}</select><span class="muted">${rows.length} ativos</span></div>
    <div class="ta-rows">${list || `<div class="card empty">Nenhum ativo com esse filtro.</div>`}</div>
    <p class="muted ta-small">A resposta de cada linha é a mesma do detalhe do ativo. O número é o placar do quadro diário (tendência dos últimos meses); "com o pregão de hoje" indica que o movimento do dia (gráfico de 5 min, até 10 min de idade) já entrou na resposta. Abra um ativo para carregar o dia.</p>
    ${viewLearn()}`;
}

function viewLearn() {
  return `<div class="card ta-learn"><h2>Aprenda: análise gráfica e como traders ganham dinheiro</h2><p class="muted ta-small">Do básico (lições 1 a 8) ao que a pesquisa mostra sobre quem lucra, gestão de risco e como testar um sistema (9 a 18).</p>${LESSONS.map((l, i) => `<details ${i === 0 ? "open" : ""}><summary>${esc(l.title)}</summary><div>${l.html}</div></details>`).join("")}
    <h3>Fontes e leituras</h3><ul class="ta-src">${SOURCES.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join("")}<li>Para ir além: Andreas Clenow, <i>Following the Trend</i> e <i>Stocks on the Move</i>; Van Tharp, <i>Trade Your Way to Financial Freedom</i>; David Aronson, <i>Evidence-Based Technical Analysis</i>; Mark Minervini, <i>Trade Like a Stock Market Wizard</i>.</li><li>Livros clássicos: Edwards e Magee, <i>Technical Analysis of Stock Trends</i>; John Murphy, <i>Technical Analysis of the Financial Markets</i>; J. Welles Wilder, <i>New Concepts in Technical Trading Systems</i>; John Bollinger, <i>Bollinger on Bollinger Bands</i>; Steve Nison, <i>Japanese Candlestick Charting Techniques</i>.</li></ul></div>`;
}

function callCard(code, d, ia, call, mode) {
  const a = d.a;
  const price = a.price;
  const prevClose = d.bars.c.at(-2);
  const chg = prevClose ? price / prevClose - 1 : null;
  const chip = (label, an, extra = "") =>
    an
      ? `<div class="ta-chip"><span>${label}</span><div>${verdictTag(an.verdict)} <b class="${an.score > 19 ? "pos" : an.score < -19 ? "neg" : ""}">${signed(an.score, 0)}</b></div>${gauge(an.score, { small: true })}<small class="muted">${extra}</small></div>`
      : `<div class="ta-chip off"><span>${label}</span><small class="muted">${extra}</small></div>`;
  return `<div class="card ta-call ${call.tone}">
      <div class="ta-top"><div><span class="tk">${code}</span> <span class="ta-nm">${esc(ASSETS[code].name)}</span></div>
        <div class="ta-px"><b>${num(price)}</b> <span class="${chg > 0 ? "pos" : chg < 0 ? "neg" : ""}">${chg == null ? "" : pct(chg)}</span> <small class="muted">${esc(ASSETS[code].unit)}${d.partial ? " · ao vivo" : ""}</small></div></div>
      <div class="ta-head">${esc(call.headline)}</div>
      <p class="ta-why2">${esc(call.why)}</p>
      <p class="ta-act"><b>O que fazer:</b> ${esc(call.action)}</p>
      ${edgeBlock(call.edge)}
      <div class="ta-chips">
        ${chip("Tendência dos últimos meses", a, `confiança ${a.confidence}`)}
        ${chip("Hoje no pregão", ia, ia ? `confiança ${ia.confidence}${ia.live ? "" : " · última sessão"}` : mode === "today" ? "carregando ou indisponível" : "indisponível")}
      </div></div>`;
}

/** Vantagem medida (lições 13 a 16): nota A–D e os motivos, cada um marcado a favor (✓) ou contra (✗). */
function edgeBlock(edge) {
  if (!edge?.grade) return "";
  const ic = (ok) => (ok === true ? "✓" : ok === false ? "✗" : "?");
  return `<div class="ta-edge g${edge.grade}"><div class="ta-edge-h"><b class="ta-grade">${edge.grade}</b><span>${esc(GRADE_TXT[edge.grade])}</span></div>
    <ul>${edge.flags.map((f) => `<li class="${f.ok === true ? "ok" : f.ok === false ? "no" : "ask"}"><span aria-hidden="true">${ic(f.ok)}</span>${esc(f.text)}.</li>`).join("")}</ul></div>`;
}

function subOptions(d, mode) {
  const vol = !d.bars.closeOnly && T.hasVolume(d.bars.v);
  return mode === "today"
    ? [vol ? ["volume", "Volume"] : null, ["rsi", "RSI"]].filter(Boolean)
    : [
        vol ? ["volume", "Volume"] : null,
        ["rsi", "RSI"],
        ["macd", "MACD"],
        ["stoch", "Estocástico"],
        vol ? ["obv", "OBV"] : null,
      ].filter(Boolean);
}

function chartCard(ctx, d, ia, mode, code) {
  const opts = subOptions(d, mode);
  const sub =
    ctx.prefs.taSub?.[mode] && opts.some((o) => o[0] === ctx.prefs.taSub[mode])
      ? ctx.prefs.taSub[mode]
      : opts[0][0];
  const legend =
    mode === "today"
      ? `<span class="lg vw">VWAP (preço médio do dia)</span><span class="lg e21">Média rápida (21)</span><span class="lg or">Faixa de abertura</span><span class="lg pd">Máx/mín de ontem</span>`
      : `<span class="lg m50">Média 50 dias</span><span class="lg m200">Média 200 dias</span><span class="lg bb">Bandas de Bollinger</span><span class="lg sr">Pisos e tetos</span>`;
  const title =
    mode === "today"
      ? `Hoje, a cada 5 minutos (horário de Brasília)${ia && !ia.live ? ` · sessão de ${dateBR(ia.date)}` : ""}`
      : `Últimos ${DAILY_VISIBLE} pregões`;
  const note =
    d.bars.closeOnly && mode === "swing"
      ? `<p class="muted ta-small">Mostrando só o fechamento (a vela completa aparece quando o histórico com máxima e mínima estiver disponível).</p>`
      : "";
  return `<div class="card"><h2>${title}</h2><div class="ta-legend">${legend}</div>
    <div class="chart-box ta-main" id="taMainBox"><canvas id="taMain" role="img" aria-label="Gráfico de preço de ${esc(ASSETS[code].name)}"></canvas></div>
    <div class="ta-subbar"><span class="seg" role="group" aria-label="Indicador abaixo do gráfico">${opts.map(([k, l]) => `<button class="${sub === k ? "on" : ""}" data-ta-sub="${k}" aria-pressed="${sub === k}">${l}</button>`).join("")}</span></div>
    <div class="chart-box ta-sub"><canvas id="taSub"></canvas></div>${note}</div>`;
}

function viewDetail(ctx, code) {
  const sym = ASSETS[code].yahoo;
  const e = (ta.intra[sym] ??= {});
  const r = assetCall(ctx, code);
  if (!r)
    return `<div class="card empty">Sem dados suficientes para analisar ${esc(code)}.<p><button class="btn" data-ta-back>Voltar ao radar</button></p></div>`;
  const { d, ia, call } = r;
  const changes = logChange(code, call, ia);
  const eff = ctx.prefs.taMode === "swing" ? "swing" : "today";
  const sel = RADAR_CODES.map(
    (c) =>
      `<option value="${c}" ${c === code ? "selected" : ""}>${c} · ${esc(ASSETS[c].name)}</option>`,
  ).join("");
  const planA = eff === "today" && ia ? ia : d.a;
  const intraMsg =
    eff === "today" && !ia
      ? e.loading || !e.at
        ? `<div class="card ta-warn">Carregando os dados do pregão de hoje…</div>`
        : dismissible(
            "card ta-warn",
            `Dados do pregão de hoje indisponíveis (${esc(e.err ?? "sem barras")}). Mostrando só o quadro diário. <button class="btn small" data-ta-retry>Tentar de novo</button>`,
          )
      : "";
  return `<div class="ta-bar"><button class="btn" data-ta-back>← Radar</button>
      <select data-ta-code aria-label="Trocar de ativo">${sel}</select>
      <button class="btn" data-ta-watch="${code}" aria-pressed="${(ctx.prefs.taWatch ?? []).includes(code)}">${(ctx.prefs.taWatch ?? []).includes(code) ? "★ Vigiando" : "☆ Vigiar"}</button>
      <span class="seg" role="group" aria-label="Visão"><button class="${eff === "today" ? "on" : ""}" data-ta-mode="today" aria-pressed="${eff === "today"}">Hoje (pregão)</button><button class="${eff === "swing" ? "on" : ""}" data-ta-mode="swing" aria-pressed="${eff === "swing"}">Próximos dias</button></span></div>
    ${clockBar(ctx)}
    ${eventRiskHtml(state.cal?.events)}
    ${callCard(code, d, ia, call, eff)}
    ${intraMsg}
    <div class="ta-grid">
      <div>${planCard(eff === "today" && ia ? "Plano para hoje (operação curta)" : "Plano para os próximos dias", planA, r.edge)}${levelsCard(d, eff === "today" ? ia : null, eff, sym)}</div>
      <div>${chartCard(ctx, d, ia, eff === "today" && ia ? "today" : "swing", code)}</div>
    </div>
    ${changesCard(changes)}
    ${eff === "today" && ia ? votesCard("Por que, hoje?", ia, "Sinais do movimento de hoje (gráfico de 5 minutos). Cada linha é um motivo, em ordem de importância.") : ""}
    ${votesCard("Por que, na tendência dos últimos meses?", d.a, "Sinais do gráfico diário. Quanto mais categorias concordam, mais confiável é o quadro.")}
    ${d.bars.closeOnly ? "" : candlesCard(d.a)}
    ${backtestCard(d, d.a)}
    <div class="card ta-disc"><b>Leia isto:</b> o placar conta quantos sinais concordam; não é probabilidade de lucro. Análise gráfica erra com frequência, principalmente em dias de notícia. Use sempre o stop, não aplique dinheiro que não pode perder e lembre que ETFs alavancados, inversos e de VIX têm riscos extras. Material educacional, não é recomendação de investimento.</div>
    `;
}

export function viewEntry(ctx) {
  const code = ctx.prefs.taSel;
  if (code && ASSETS[code]) return viewDetail(ctx, code);
  return viewRadar(ctx);
}

/** Depois de o HTML entrar na página: desenha os gráficos e dispara os carregamentos de dados. */
export function afterEntry(ctx) {
  ensureOhlc(ctx);
  if (!ta.watchInit && ctx.prices) {
    ta.watchInit = true;
    refreshWatch(ctx, false);
  }
  const code = ctx.prefs.taSel;
  if (!code || !ASSETS[code]) return;
  const sym = ASSETS[code].yahoo;
  ensureIntraday(ctx, sym);
  const e = ta.intra[sym];
  const ia = e?.data ? S.analyzeIntraday(e.data.bars, { now: Date.now() / 1000 }) : null;
  const d = daily(ctx, code, e?.data ? S.analyzeIntraday(e.data.bars) : null);
  if (!d?.a) return;
  const eff = ctx.prefs.taMode !== "swing" && ia ? "today" : "swing";
  const planA = eff === "today" ? ia : d.a;
  const opts = subOptions(d, eff);
  const sub =
    ctx.prefs.taSub?.[eff] && opts.some((o) => o[0] === ctx.prefs.taSub[eff])
      ? ctx.prefs.taSub[eff]
      : opts[0][0];
  const box = document.getElementById("taMainBox");
  const key = `${sym}:${eff}`;
  if (ctx.prefs.proChart !== "off" && box)
    ensurePro().then((ok) => {
      if (!box.isConnected) return; // a tela mudou enquanto carregava
      if (!ok) return ctx.mkChart(document.getElementById("taMain"), mainConfig(d, ia, eff, planA));
      const draw = () => {
        const data = proSeries(d, ia, eff, planA, e?.ext);
        const h = mountPro(box, data, key);
        attachCompare(box, h, data, sym, () => {
          h.destroy();
          state.charts = state.charts.filter((x) => x !== h);
          draw();
        });
      };
      draw();
    });
  else ctx.mkChart(document.getElementById("taMain"), mainConfig(d, ia, eff, planA));
  ctx.mkChart(document.getElementById("taSub"), subConfig(d, ia, eff, sub));
}

/** Instala os cliques/seleções da aba uma única vez. `get` devolve o contexto atual do app. */
export function initEntry(get) {
  ta.ctxGet = get;
  // A cada minuto, com a página visível: atualiza o ativo aberto e os vigiados (só com o pregão aberto).
  ta.timer = setInterval(() => {
    const c = get();
    if (document.hidden || !c.prices) return;
    if (c.prefs.tab === "entry" && ASSETS[c.prefs.taSel])
      ensureIntraday(c, ASSETS[c.prefs.taSel].yahoo);
    if (isOpenNow(c) && c.prefs.taWatch?.length) refreshWatch(c);
  }, 60_000);
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest(
      "[data-ta-open],[data-ta-back],[data-ta-mode],[data-ta-sub],[data-ta-filter],[data-ta-retry],[data-ta-watch]",
    );
    if (!el) return;
    const ctx = get();
    const p = ctx.prefs;
    const d = el.dataset;
    if (d.taOpen) {
      p.taSel = d.taOpen;
      window.scrollTo(0, 0);
    } else if (el.hasAttribute("data-ta-back")) {
      p.taSel = null;
      window.scrollTo(0, 0);
    } else if (d.taMode) p.taMode = d.taMode;
    else if (d.taSub) {
      const eff =
        p.taMode !== "swing" && ta.intra[ASSETS[p.taSel]?.yahoo]?.data ? "today" : "swing";
      p.taSub = { ...(p.taSub ?? {}), [eff]: d.taSub };
    } else if (d.taWatch) {
      const w = p.taWatch ?? [];
      if (w.includes(d.taWatch)) p.taWatch = w.filter((c) => c !== d.taWatch);
      else if (w.length >= WATCH_MAX)
        ctx.toast?.(
          `Você já vigia ${WATCH_MAX} ativos. Remova um antes de adicionar outro.`,
          "warn",
        );
      else {
        p.taWatch = [...w, d.taWatch];
        refreshWatch(ctx, false);
      }
    } else if (d.taFilter) p.taFilter = d.taFilter;
    else if (el.hasAttribute("data-ta-retry")) ensureIntraday(ctx, ASSETS[p.taSel].yahoo, true);
    ctx.savePrefs();
    if (!el.hasAttribute("data-ta-retry")) rerender(ctx);
  });
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    const ctx = get();
    if (el.dataset?.taPref) {
      ctx.prefs[el.dataset.taPref] = el.value;
      ctx.savePrefs();
      rerender(ctx);
    } else if (el.dataset?.taCode !== undefined) {
      ctx.prefs.taSel = el.value;
      ctx.savePrefs();
      rerender(ctx);
    }
  });
  document.addEventListener("toggle", (ev) => {
    if (ev.target.matches?.(".ta-intro")) {
      const ctx = get();
      ctx.prefs.taIntroClosed = !ev.target.open;
      ctx.savePrefs();
    }
  }, true); // prettier-ignore
}
