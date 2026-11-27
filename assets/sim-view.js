// Aba "Simulador": tela e carga. A conta fica em simulator.js (pura); aqui escolhemos os ativos (as listas da aba
// Decisões), buscamos o histórico (api/analyze, o mesmo cache da Análise) e refazemos a simulação um ativo por vez,
// sem travar a tela. O resultado fica em memória até o histórico do ativo mudar.
import { speedLearnHtml } from "./speed-view.js";
import { an, ensureAnalysis, portfolioSyms } from "./analysis-data.js";
import { ALL, PF, lists } from "./desk.js";
import { HORIZON, OUTCOME, TYPE_LABEL, evalDiary, groupSummary, levelLabel, loadDiary, replayTicker, summarize } from "./simulator.js"; // prettier-ignore
import { cls, dateBR, esc, num, pct } from "./format.js";
import { hooks, state } from "./state.js";
import { finalBanner, learn, loadModel } from "./model-status.js";
import { viewLearn } from "./learn-view.js";
import { loadMomentum, mom, momStudyHtml } from "./momentum-study.js";
import { modelBacktestHtml, pillarStudyHtml, quantBacktestHtml } from "./pillar-view.js";

export const sim = { cache: {}, running: false, done: 0, total: 0, tried: {} };

/** Ativos da lista escolhida no Simulador (as mesmas listas da aba Sinais de hoje). */
export function simList() {
  const id = state.prefs.simList ?? ALL;
  if (id === PF) return { id, name: "Minha carteira", syms: portfolioSyms() };
  const l = lists().find((x) => x.id === id);
  if (l) return { id, name: l.name, syms: l.syms };
  const syms = [...new Set([...portfolioSyms(), ...lists().flatMap((x) => x.syms)])];
  return { id: ALL, name: "Todas as listas", syms };
}

const spyRef = () =>
  state.prices?.series?.SPY ? { dates: state.prices.dates, close: state.prices.series.SPY } : null;
const keyOf = (r, held) => `${r.bars?.dates?.at(-1)}:${r.bars?.c?.length}:${held}:${!!state.stats}`;
const tick = () => new Promise((ok) => setTimeout(ok, 0));

const RETRY = 10 * 60_000; // ticker sem histórico (sem rede ou código errado): tenta de novo a cada 10 min

/** Tickers sem histórico em memória que ainda podem ser buscados agora (marca a tentativa). */
function toFetch(syms, force = false) {
  const now = Date.now();
  const need = syms.filter((s) => !an.items[s] && (force || now - (sim.tried[s] ?? 0) > RETRY));
  need.forEach((s) => (sim.tried[s] = now));
  return need;
}

/** Busca o histórico que falta e simula os ativos ainda sem resultado (um por vez, cedendo a vez à tela). */
export async function runSim(force = false) {
  const { syms } = simList();
  if (!syms.length || sim.running) return;
  const held = new Set(portfolioSyms());
  const need = toFetch(syms, force);
  const stale = (s) => an.items[s] && sim.cache[s]?.key !== keyOf(an.items[s], held.has(s));
  if (!force && !need.length && !syms.some(stale)) return;
  sim.running = true;
  sim.done = 0;
  sim.total = syms.length;
  hooks.render();
  try {
    if (need.length) await ensureAnalysis(need);
    for (const s of syms) {
      const r = an.items[s];
      const k = r ? keyOf(r, held.has(s)) : null;
      if (r?.bars && (force || sim.cache[s]?.key !== k)) {
        const rows = replayTicker(r.bars, {
          sym: s, held: held.has(s), beta: r.fund?.beta, stats: state.stats, spy: spyRef(),
        }); // prettier-ignore
        sim.cache[s] = { key: k, rows };
        await tick();
      }
      sim.done++;
      if (sim.done % 4 === 0 && state.prefs.tab === "sim") hooks.render();
    }
  } finally {
    sim.running = false;
  }
  if (state.prefs.tab === "sim") hooks.render();
}

/** Diário: o histórico dos ativos (para avaliar) vem da mesma carga da Análise. */
function loadDiaryBars(syms) {
  const need = toFetch(syms);
  if (need.length)
    ensureAnalysis(need).then((x) => x.length && state.prefs.tab === "sim" && hooks.render());
}

/** Linhas da origem escolhida, com filtro de tipo; sempre da mais recente para a mais antiga. */
export function simRows(src, syms) {
  const set = new Set(syms);
  const rows =
    src === "diary"
      ? loadDiary()
          .filter((t) => set.has(t.sym))
          .map((t) => evalDiary(t, an.items[t.sym]?.bars, state.stats))
      : syms.flatMap((s) => sim.cache[s]?.rows ?? []);
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.sym.localeCompare(b.sym));
}

// ───────────── tela ─────────────

const usd = (x) =>
  Number.isFinite(x) ? `${x > 0 ? "+" : x < 0 ? "−" : ""}US$ ${num(Math.abs(x), 0)}` : "–";
const share = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "–");
const outTag = (o) => `<span class="tag ${OUTCOME[o].tone}">${OUTCOME[o].label}</span>`;
const seg = (pref, cur, opts) =>
  `<div class="seg" role="tablist">${opts.map(([v, l]) => `<button class="${v === cur ? "on" : ""}" data-sim-set="${pref}" data-v="${esc(v)}" aria-pressed="${v === cur}">${l}</button>`).join("")}</div>`; // prettier-ignore

const srcSeg = (src) => seg("simSrc", src, [["retro", "Retroativo (~1 ano)"], ["diary", "Diário (daqui pra frente)"], ["learn", "🧠 Aprendizado"]]); // prettier-ignore

function listSelect(cur) {
  const opts = [[ALL, "🌐 Todas as listas"], [PF, "💼 Minha carteira"], ...lists().map((l) => [l.id, l.name])]; // prettier-ignore
  return `<select data-sim-list aria-label="Lista">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`; // prettier-ignore
}

function balloons(s, cur) {
  const box = (f, v, l, c = "") => `<button type="button" class="desk-m ${c}${cur === f ? " on" : ""}" data-sim-out="${f}" aria-pressed="${cur === f}"><b>${v}</b><span>${l}</span></button>`; // prettier-ignore
  const info = (v, l, c = "") => `<div class="desk-m ${c}"><b>${v}</b><span>${l}</span></div>`;
  return `<div class="desk-ms sim-ms">
    ${box("hit", s.hit, `Atingiu${s.n ? ` · ${share(s.hit / s.n)}` : ""}`, "buy")}
    ${box("partial", s.partial, `Parcial${s.n ? ` · ${share(s.partial / s.n)}` : ""}`, "wait")}
    ${box("miss", s.miss, `Não atingiu${s.n ? ` · ${share(s.miss / s.n)}` : ""}`, "sell")}
    ${box("open", s.open, "Em andamento")}
    ${info(share(s.score), "Aproveitamento (Atingiu + ½ Parcial)")}
    ${info(usd(s.pnl), "Resultado com US$ 1.000 por gatilho", s.pnl > 0 ? "buy" : s.pnl < 0 ? "sell" : "")}
  </div>`;
}

function groupTable(title, groups, label) {
  if (!groups.length) return "";
  const body = groups
    .sort((a, b) => b.n - a.n)
    .map(
      (
        g,
      ) => `<tr><td>${label(g)}</td><td class="num">${g.n}${g.open ? `<span class="muted small"> +${g.open}</span>` : ""}</td>
      <td class="num pos">${g.hit}</td><td class="num amber">${g.partial}</td><td class="num neg">${g.miss}</td>
      <td class="num"><b>${share(g.score)}</b></td>
      <td class="num ${cls(g.avgDirRet ?? 0)}">${pct(g.avgDirRet, 2)}</td><td class="num muted">${pct(g.avgExpected, 2)}</td>
      <td class="num ${cls(g.pnl)}">${usd(g.pnl)}</td></tr>`,
    )
    .join("");
  return `<section class="card" style="margin-top:12px"><h3>${title}</h3><div class="tw" style="box-shadow:none"><table class="sim-tbl"><thead><tr>
    <th></th><th class="num">Vezes</th><th class="num">Atingiu</th><th class="num">Parcial</th><th class="num">Não</th><th class="num">Aproveit.</th>
    <th class="num" title="Retorno médio em ${HORIZON} pregões na direção sugerida (comprar: alta; reduzir: queda)">Obtido</th><th class="num">Esperado</th><th class="num">US$ 1.000/gatilho</th></tr></thead><tbody>${body}</tbody></table></div></section>`; // prettier-ignore
}

const toneCls = (t) => (t === "buy" ? "buy" : t === "sell" ? "sell" : "wait");
const trigLabel = ({ sample: r }) =>
  `<span class="muted small">${TYPE_LABEL[r.type]}</span><div><span class="tag ${toneCls(r.tone)}">${esc(r.type === "level" ? levelLabel(r.code, r.tone) : r.title)}</span></div>`;

function eventRow(r) {
  const tone = r.tone === "buy" ? "buy" : r.tone === "sell" ? "sell" : "wait";
  return `<tr class="desk-row" data-an-sym="${esc(r.sym)}" tabindex="0">
    <td class="nowrap">${dateBR(r.date)}</td><td><span class="tk">${esc(r.sym)}</span></td>
    <td><span class="muted small">${TYPE_LABEL[r.type]}</span><div>${esc(r.title)}</div></td>
    <td><span class="tag ${tone}">${esc(r.action)}</span></td>
    <td class="num">${num(r.price, 2)}</td>
    <td class="num ${cls(r.ret ?? 0)}">${pct(r.ret, 1)}${r.done ? "" : `<div class="muted small">até agora</div>`}</td>
    <td class="num muted">${r.dir ? `${r.dir > 0 ? "≥ +" : "≤ −"}${pct(r.expected, 1).replace(/^[+−-]/, "")}` : `≤ +${pct(0.5 * (r.vol5 ?? 0.02), 1).replace(/^\+/, "")}`}</td>
    <td>${outTag(r.outcome)}</td></tr>`;
}

export function viewSim() {
  const p = state.prefs;
  loadModel();
  if (p.simSrc === "learn") {
    if (!mom.data)
      loadMomentum().then((d) => d && state.prefs.simSrc === "learn" && hooks.render());
    return `<section class="desk">${finalBanner()}<div class="desk-head"><h2>Simulador</h2></div>
    <div class="desk-acts" style="margin:6px 0">${srcSeg("learn")}</div>${viewLearn(learn)}${speedLearnHtml(learn)}${momStudyHtml()}${modelBacktestHtml()}${quantBacktestHtml()}${pillarStudyHtml()}</section>`;
  }
  const l = simList();
  const src = p.simSrc === "diary" ? "diary" : "retro";
  const type = TYPE_LABEL[p.simType] ? p.simType : "all";
  const out = OUTCOME[state.simOut] ? state.simOut : null;
  if (l.syms.length && src === "retro") runSim();
  else if (l.syms.length) loadDiaryBars(l.syms);
  const all = simRows(src, l.syms).filter((r) => type === "all" || r.type === type);
  const s = summarize(all);
  const shown = out ? all.filter((r) => r.outcome === out) : all;
  const progress = sim.running
    ? `<p class="muted">Simulando ${sim.done} de ${sim.total} ativos…</p>`
    : "";
  const head = `${finalBanner()}<div class="desk-head"><h2>Simulador <span class="muted small">${esc(l.name)} · ${l.syms.length} ativo(s)</span></h2>
    <span class="desk-acts">${listSelect(l.id)}${src === "retro" ? `<button class="btn" data-sim-refresh>${sim.running ? "Simulando…" : "Recalcular"}</button>` : ""}</span></div>
    <div class="desk-acts" style="margin:6px 0">${srcSeg(src)}
    ${seg("simType", type, [["all", "Todos"], ["dec", "Decisão"], ["level", "Níveis"], ["sig", "Sinais"]])}</div>`; // prettier-ignore
  if (!l.syms.length)
    return `<section class="desk">${head}<div class="card empty"><p>Nenhum ativo para simular. Adicione ativos na Carteira ou crie uma watchlist em Mercados › Watchlist.</p><div class="empty-cta"><button class="btn" data-tab="portfolio">Ir para a Carteira</button><button class="btn ghost" data-tab="watch">Abrir Watchlist</button></div></div></section>`;
  const intro =
    src === "retro"
      ? `<p class="muted small">E se você tivesse seguido a Decisão do trader? Refazemos, em cada pregão do último ano, as mesmas contas (com os dados que existiam naquela data) e medimos o que aconteceu ${HORIZON} pregões depois.</p>`
      : `<p class="muted small">Cada gatilho que a Decisão do trader mostrou (decisão, nível e sinais) é gravado neste aparelho com a data e o preço da tela, e avaliado ${HORIZON} pregões depois. O diário é alimentado pela Watchlist e pela página do ativo.</p>`;
  const empty =
    src === "diary"
      ? `<div class="card empty">O diário ainda está vazio. Ele começa a encher quando você abre a Watchlist ou a página de um ativo; os primeiros resultados aparecem ${HORIZON} pregões depois.</div>`
      : sim.running
        ? ""
        : `<div class="card empty">Sem histórico suficiente para simular (precisa de ~1 ano de pregões).</div>`;
  if (!all.length) return `<section class="desk">${head}${intro}${progress}${empty}</section>`;
  const byTrig = groupSummary(all, (r) => `${r.type}:${r.code}:${r.tone}`);
  const bySym = groupSummary(all, (r) => r.sym);
  const lim = 120;
  return `<section class="desk">${head}${intro}${progress}
    ${balloons(s, out)}
    ${groupTable("Como cada gatilho se saiu", byTrig, trigLabel)}
    ${groupTable("Por ativo", bySym, (g) => `<span class="tk">${esc(g.key)}</span>`)}
    <section class="card" style="margin-top:12px"><h3>Gatilhos ${out ? `· ${OUTCOME[out].label}` : ""} <span class="muted small">(${shown.length}${shown.length > lim ? `, mostrando ${lim}` : ""})</span></h3>
      <div class="tw" style="box-shadow:none"><table class="desk-tbl sim-tbl"><thead><tr><th>Data</th><th>Ativo</th><th>Gatilho</th><th>Ação sugerida</th><th class="num">Preço</th><th class="num">Em ${HORIZON} pregões</th><th class="num">Esperado</th><th>Resultado</th></tr></thead>
      <tbody>${shown.slice(0, lim).map(eventRow).join("") || `<tr><td colspan="8" class="muted">Nenhum gatilho neste filtro. Toque no balão de novo para ver todos.</td></tr>`}</tbody></table></div></section>
    <p class="note"><b>Como lemos o resultado</b> (${HORIZON} pregões depois do gatilho, entrada no fechamento do dia): <b>comprar/ampliar</b> espera alta; <b>reduzir/vender/realizar</b> espera queda (o ganho é a perda evitada). <b>Atingiu</b> = andou a favor pelo menos o esperado; <b>Parcial</b> = andou a favor, mas menos; <b>Não atingiu</b> = foi contra. Esperado: nos sinais, a média histórica da regra (47 ativos, ~4 anos; mínimo 0,3%); na decisão e nos níveis, ¼ da oscilação normal de ${HORIZON} pregões do ativo (mínimo 0,3%). <b>Aguardar/esperar</b>: Atingiu se não subiu mais que ½ oscilação normal (esperar não custou), Parcial até 1 oscilação, Não atingiu se a alta passou disso. Aproveitamento = (Atingiu + ½ Parcial) ÷ encerrados; "Em andamento" ainda não completou ${HORIZON} pregões. No retroativo, a Decisão usa técnica, mercado (S&P 500) e situações parecidas, sem fundamentos (não há histórico deles) e sem o regime do dia; um mesmo gatilho ativo por vários dias conta uma vez a cada ${HORIZON} pregões. Sem custos, impostos nem deslizamento. Material educacional; não é recomendação de investimento.</p>
  </section>`;
}
