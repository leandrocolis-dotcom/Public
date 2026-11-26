// Aba "Mapa de fluxo": mapa de calor (treemap), fluxo por grupo, rotação relativa e replay.
// Recebe um contexto do app.js; os cálculos ficam em flow-engine.js. O mesmo desenho serve o Fluxo Onshore
// (B3): ctx.uni traz o universo (padrão: Offshore) e ctx.rotKey a preferência do grupo da rotação.
import { FLOW_BY_SYM, GROUP_BY_ID } from "./flow-universe.js";
import { tickAttr } from "./flash.js";
import {
  flowSnapshot,
  groupFlows,
  flowHeadline,
  rotation,
  quadrantOf,
  squarify,
  flowNarrative,
  narrativeChanges,
  HORIZONS,
  OFF_UNI,
} from "./flow-engine.js";
import { dateBR, decSep, esc, num, signed } from "./format.js";
import { assetPanelHtml, mountAssetPanel } from "./asset-pop.js";
import { pal, cssVar, hexToRgb, readableOn } from "./theme.js";
import { barsKey, useBars } from "./bars-hub.js";
import { drawLeaders, drawNames } from "./leaders-view.js";
import { ROT_DEFAULT, ROT_WINDOWS, intradaySymbols, rotWindow, rotationIntraday, segIntensity, playTimeline, frameTail, resampleTail, TRAIL, fitAxis, followAxis, ROT_SPEEDS, rotSpeed, playStep, playStart, speedBoard, SPEED_LEVELS } from "./rot-intraday.js"; // prettier-ignore

export const REPLAY_DAYS = 20;
const HORIZON_LABEL = { "1d": "Hoje", "5d": "5 dias", "1m": "1 mês", "3m": "3 meses" };
const Z_CLIP = 2.5;

// ───────────── cores: divergente (vende/compra do tema) com neutro do tema; o valor com sinal vai no bloco ─────────────
function zColor(z) {
  const t = Math.min(Math.abs(z) / Z_CLIP, 1) ** 0.85;
  const neu = hexToRgb(cssVar("--tile-neutral"));
  const end = hexToRgb(cssVar(z >= 0 ? "--buy" : "--sell"));
  const c = neu.map((n, i) => Math.round(n + (end[i] - n) * t));
  return { bg: `rgb(${c.join(",")})`, fg: readableOn(c, "#000000", "#ffffff") };
}
const fmtVal = (r) =>
  r.unit === "bps"
    ? `${signed(r.value, 0)} bps`
    : `${signed(r.value, r.unit === "%" && Math.abs(r.value) < 100 ? 1 : 0)}%`; // 1 casa até 100%: igual aos botões de janela do painel
const fmtZ = (z) => `${signed(z, 1)}σ`;
const uniOf = (ctx) => ctx.uni ?? OFF_UNI;

function snapshotFor(ctx) {
  // "Todos" fica só com o mercado: a carteira (grupo "port") aparece ao escolhê-la, sem duplicar ativos no mapa
  const U = uniOf(ctx);
  const groups =
    ctx.prefs.flowGroup === "all"
      ? U.byId.port
        ? U.groups.filter((g) => g.id !== "port").map((g) => g.id)
        : null
      : [ctx.prefs.flowGroup];
  return flowSnapshot(ctx.flow, {
    horizon: ctx.prefs.flowHorizon,
    back: ctx.back,
    sessionFrac: ctx.sessionFrac,
    groups,
    uni: uniOf(ctx),
  });
}

// ───────────── HTML da aba ─────────────

export function viewFlow(ctx) {
  const p = ctx.prefs;
  const U = uniOf(ctx);
  const seg = (attr, cur, opts) =>
    `<span class="seg">${opts.map(([v, l]) => `<button data-${attr}="${v}" aria-pressed="${v === cur}">${l}</button>`).join("")}</span>`;
  const groupOpts = [
    ["all", "Todos os grupos"],
    ...U.groups.filter((g) => !g.noHeat).map((g) => [g.id, g.label]),
  ]
    .map(
      ([v, l]) => `<option value="${v}" ${v === p.flowGroup ? "selected" : ""}>${esc(l)}</option>`,
    )
    .join("");
  const rotOpts = U.groups
    .filter((g) => !g.noRotation)
    .map(
      (g) =>
        `<option value="${g.id}" ${g.id === p.rotGroup ? "selected" : ""}>${esc(g.label)}</option>`,
    )
    .join("");
  const n = ctx.flow.dates.length;
  const wk = p.rotWin in ROT_WINDOWS ? p.rotWin : ROT_DEFAULT;
  const winSeg = (intra, lab) =>
    `<span class="seg rot-win" role="group" aria-label="Janela ${lab.toLowerCase()}"><span class="seg-lab">${lab}</span>${Object.entries(
      ROT_WINDOWS,
    )
      .filter(([, w]) => !!w.intra === intra)
      .map(([k, w]) => `<button data-setpref="${ctx.rotWinKey ?? "rotWin"}" data-val="${k}" aria-pressed="${k === wk}">${w.label}</button>`)
      .join("")}</span>`; // prettier-ignore
  // cada bloco da aba abre e fecha (o estado fica salvo por lado: Offshore/Onshore, pref flowOpen)
  const opened = p.flowOpen ?? {};
  const isOpen = (id) => opened[`${U.id}.${id}`] ?? flowFoldDefault(`${U.id}.${id}`);
  const fold = (id, title, inner, { cls = "card", style = "" } = {}) =>
    `<details class="${cls} ffold" data-flow-fold="${U.id}.${id}"${style ? ` style="${style}"` : ""}${isOpen(id) ? " open" : ""}><summary class="ffold-h">${title}</summary>${inner}</details>`; // prettier-ignore
  const allIds = ["head", "story", "groups", "heat", "rot", "rotChart", "speed", "leaders", "chips", "names", "rotHelp", "table"]; // prettier-ignore
  const anyOpen = allIds.some((id) => isOpen(id));
  return `<div class="ffold-bar"><button class="btn small ghost" data-flow-fold-all="${anyOpen ? "close" : "open"}" data-flow-uni="${U.id}" title="Abre ou recolhe todos os blocos. Toque no título de um bloco para abrir ou recolher só ele; a escolha fica salva.">${anyOpen ? "⊟ Recolher tudo" : "⊞ Expandir tudo"}</button></div>
    ${fold("head", "<h2>Entrando e saindo</h2>", `<div class="flow-head" id="flowHeadline"></div>`)}
    ${fold("story", "<h2>Narrativa do fluxo</h2>", `<section class="flow-story" id="flowStory" aria-live="polite"></section>`)}
    <div class="toolbar">
      ${seg(
        "fh",
        p.flowHorizon,
        Object.keys(HORIZONS).map((k) => [k, HORIZON_LABEL[k]]),
      )}
      <select data-pref="flowGroup" aria-label="Grupo">${groupOpts}</select>
      ${seg("fsize", p.flowSize, [
        ["liq", "Tamanho: liquidez"],
        ["eq", "Tamanho: igual"],
      ])}
      <span class="replay">
        <button class="btn small" data-action="replay" aria-label="Replay dos últimos ${REPLAY_DAYS} pregões">${ctx.playing ? "⏸ Pausar" : "▶ Replay"}</button>
        <input type="range" id="flowBack" min="0" max="${REPLAY_DAYS - 1}" value="${REPLAY_DAYS - 1 - ctx.back}" aria-label="Pregão do mapa" />
        <span id="flowDate" class="muted">${dateBR(ctx.flow.dates[n - 1 - ctx.back])}${ctx.back === 0 ? " (hoje)" : ""}</span>
      </span>
    </div>
    <div class="flow-grid">
      ${fold(
        "groups",
        "<h2>Para onde vai o dinheiro, por grupo</h2>",
        `<div id="groupBars"></div>
        <p class="note">Média do movimento dos ativos do grupo, em desvios-padrão (σ) da própria volatilidade de 60 pregões, para comparar moedas, juros e ações na mesma régua. % = parcela do grupo em alta. Clique em um grupo para filtrar o mapa.</p>`,
      )}
      ${fold(
        "heat",
        "<h2>Mapa de calor</h2>",
        `<div class="tm-bar">
        ${p.flowGroup !== "all" ? `<button class="btn small ghost" data-group="${p.flowGroup}" title="Voltar a todos os grupos">← Todos</button>` : ""}
        <input id="flowFind" type="search" placeholder="Destacar ativo…" value="${esc(find)}" aria-label="Destacar ativo no mapa" autocomplete="off" />
        <button class="btn small" data-action="flow-strong" aria-pressed="${!!p.flowStrong}" title="Apaga os ativos com movimento menor que 1σ">Só fortes (≥1σ)</button></div>
        <div id="treemap" class="treemap" role="img" aria-label="Mapa de calor do fluxo por ativo"></div>
        <div class="legend-z"><span>Saindo</span><span class="ramp"></span><span>Entrando</span><span class="muted">cor = movimento em σ (±${Z_CLIP}σ satura) · ◆ = volume acima de 1,5x a média · borda tracejada = cotação atrasada · clique no nome do grupo para ampliar</span></div>`,
      )}
    </div>
    ${fold(
      "rot",
      "<h2>Rotação relativa</h2>",
      `
      <div class="toolbar"><select data-pref="${ctx.rotKey ?? "rotGroup"}" aria-label="Grupo da rotação">${rotOpts}</select>${winSeg(true, "Intraday")}${winSeg(false, "Diário")}</div>
      <div class="muted rot-meta"><span id="rotBench"></span> <span id="rotStatus"></span></div>
      <div class="rot-play"><button class="btn small" id="rotPlay" aria-label="Animar a rotação ao longo da janela">▶ Play</button><input type="range" id="rotScrub" min="0" max="1000" value="1000" aria-label="Momento da rotação" /><span id="rotTime" class="muted"></span><span class="seg rot-speed" role="group" aria-label="Velocidade do play">${ROT_SPEEDS.map((v) => `<button data-setpref="rotSpeed" data-val="${v}" aria-pressed="${v === rotSpeed(p.rotSpeed)}" title="${v < 0 ? "De trás para frente: do agora ao começo da janela" : `Velocidade ${String(v).replace(".", decSep())}x`}">${v < 0 ? "−1x" : `${String(v).replace(".", decSep())}x`}</button>`).join("")}</span><button class="btn small ghost" data-setpref="rotTrail" data-val="${p.rotTrail === "full" ? "short" : "full"}" aria-pressed="${p.rotTrail === "full"}" title="Rastro curto (últimos ${TRAIL} pontos) ou a cauda inteira da janela">Cauda completa</button></div>
      ${fold("rotChart", "Gráfico", `<div class="chart-box rot-box"><canvas id="rotChart"></canvas></div>`, { cls: "rot-sub" })}
      ${fold("speed", 'Velocidade do fluxo <span class="dim">(intensidade, não só direção)</span>', `<div id="rotSpeed" class="rspd"></div>`, { cls: "rot-sub" })}
      ${U.id === "off" ? fold("leaders", "Candidatos a liderança", `<section class="rot-leaders" id="rotLeaders" aria-live="polite"></section>`, { cls: "rot-sub" }) : ""}
      ${fold("chips", 'Ativos por quadrante <span class="dim">(toque para focar)</span>', `<div class="rot-chips" id="rotChips"></div>`, { cls: "rot-sub" })}
      ${fold("names", 'Nomes puros por linha <span class="dim">(ETFs e ações dos EUA)</span>', `<div id="rotNames"></div>`, { cls: "rot-sub rot-names" })}
      ${fold("rotHelp", "Como ler o gráfico", `<p class="note">Eixo horizontal: força relativa contra o benchmark (acima de 100 = melhor que ele). Eixo vertical: aceleração dessa força. A rotação típica é no sentido horário: Ganhando força → Liderando → Perdendo força → Atrasado. <span id="rotNote"></span> Espessura da linha = força do movimento (quanto o ativo andou no gráfico entre dois pontos: grossa = rotação rápida); seta = direção; anel em volta da cabeça = giro rápido (1 anel ≥ 1,5x o ritmo típico do grupo, 2 anéis ≥ 3x; o número ao lado do nome é esse múltiplo, ver "Velocidade do fluxo"); trecho mais claro = mais antigo. ▶ Play anima a janela do começo até agora. Toque num ativo (no gráfico ou na lista) para focar; vários podem ser comparados. Método inspirado em RRG, aproximado.</p>`, { cls: "rot-sub" })}`,
      { style: "margin-top:12px" },
    )}
    ${fold("table", "<h2>Ver em tabela</h2>", `<div id="flowTable" class="tw" style="margin-top:8px;box-shadow:none"></div>`, { style: "margin-top:12px" })}
    <div id="tip" class="tip" hidden></div>`;
}

// ───────────── narrativa do dia (acompanha a sessão: pré, pregão, pós) ─────────────

const STATE_LABEL = { up: "Ganhando força", down: "Perdendo força" };
const stories = {}; // por universo: registro do dia, o que mudou a cada atualização

const hhmm = () =>
  new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

function sample(r) {
  return `<span class="${r.z >= 0 ? "pos" : "neg"}">${esc(r.label)} ${fmtVal(r)}</span>`;
}

function marketRow(m) {
  const ex = (m.state === "up" ? m.up : m.down).map(sample).join(" · ");
  return `<button class="smk ${m.state}" data-group="${m.id}" title="Filtrar o mapa neste grupo">
    <b>${esc(m.label)}</b> <span class="muted">${fmtZ(m.z)} · ${Math.round(m.breadth * 100)}%↑</span>
    <span class="smk-ex">${ex}</span></button>`;
}

function candRow(r, weak, U) {
  const bits = [
    `${fmtZ(r.z)}`,
    r.hot ? `volume ${num(r.relVol, 1)}x` : null,
    (weak ? r.groupWeak : r.groupStrong) ? `${esc(U.byId[r.group].label)} também ${weak ? "fraco" : "forte"}` : null,
  ].filter(Boolean); // prettier-ignore
  return `<li><button class="link" data-sym="${esc(r.sym)}"><b>${esc(r.label)}</b></button> <span class="${r.z >= 0 ? "pos" : "neg"}">${fmtVal(r)}</span> <span class="muted">${bits.join(" · ")}</span></li>`;
}

function drawStory(ctx) {
  const el = shown("flowStory");
  if (!el) return;
  const U = uniOf(ctx);
  const snap = flowSnapshot(ctx.flow, {
    horizon: "1d",
    back: ctx.back,
    sessionFrac: ctx.sessionFrac,
    uni: U,
  });
  const session = ctx.back === 0 ? (ctx.session ?? "open") : "replay";
  const nar = flowNarrative(snap.rows, groupFlows(snap.rows, U), {
    session,
    sessionFrac: ctx.phaseFrac ?? ctx.sessionFrac,
    uni: U,
  });
  let story = (stories[U.id] ??= { date: null, prev: null, log: [] });
  if (ctx.back === 0) {
    if (story.date !== snap.date) story = stories[U.id] = { date: snap.date, prev: null, log: [] };
    const ch = narrativeChanges(story.prev, nar);
    if (ch.length)
      story.log = [...ch.map((c) => ({ ...c, at: hhmm() })), ...story.log].slice(0, 14);
    story.prev = nar;
  }
  const ups = nar.markets.filter((m) => m.state === "up").slice(0, 6);
  const downs = nar.markets
    .filter((m) => m.state === "down")
    .slice(-6)
    .reverse();
  const live = ctx.back === 0 && ctx.live;
  const list = (rows, weak, empty) =>
    rows.length
      ? `<ul class="slist">${rows.map((r) => candRow(r, weak, U)).join("")}</ul>`
      : `<p class="muted">${empty}</p>`;
  el.innerHTML = `<div class="story-top"><h2>Fluxo agora: ${esc(nar.phase.title)}</h2>
      <span class="tone ${nar.tone.id}">${esc(nar.tone.label)} <b>${fmtZ(nar.tone.z)}</b></span></div>
    <p class="note">${esc(nar.phase.text)}${live ? " Atualiza a cada cotação recebida." : ""}</p>
    ${ctx.storyExtra ?? ""}
    <div class="story-cols">
      <div><h3 class="pos">Mercados ganhando força</h3>${ups.map(marketRow).join("") || `<p class="muted">Nenhum grupo com força relevante.</p>`}</div>
      <div><h3 class="neg">Mercados perdendo força</h3>${downs.map(marketRow).join("") || `<p class="muted">Nenhum grupo com perda relevante.</p>`}</div>
    </div>
    <div class="story-cols">
      <div><h3 class="pos">Para observar entrada</h3>${list(nar.candidates, false, "Nenhum ativo com movimento forte (≥1σ) ainda.")}</div>
      <div><h3 class="neg">Fracos: evitar entrada / rever posição</h3>${list(nar.weak, true, "Nenhum ativo fraco (≤−1σ) ainda.")}</div>
    </div>
    ${
      ctx.back === 0 && story.log.length
        ? `<details class="story-log" open><summary>O que mudou hoje (${story.log.length})</summary><ul class="slist">${story.log
            .map(
              (c) =>
                `<li><span class="muted">${c.at}</span> <span class="${c.kind === "up" || c.kind === "cand" ? "pos" : c.kind === "down" ? "neg" : ""}">${esc(c.text)}</span>${c.z != null ? ` <span class="muted">${fmtZ(c.z)}</span>` : ""}</li>`,
            )
            .join("")}</ul></details>`
        : ""
    }
    <p class="note">Leitura de preço e volume de hoje em σ (desvios da volatilidade própria de cada ativo): ${esc(STATE_LABEL.up.toLowerCase())} = média do grupo ≥ +0,5σ. É uma lista de pauta para estudar a entrada, não recomendação de investimento: ${esc(ctx.confirmNote ?? "confirme com o gatilho da aba Sinais de hoje e use stop.")}</p>`;
}

// ───────────── partes dinâmicas (repintadas no replay) ─────────────

/** Elemento do bloco, só se o bloco estiver aberto: bloco recolhido não é desenhado (menos DOM e CPU). */
export function shown(id) {
  const el = document.getElementById(id);
  return el && !el.closest("details:not([open])") ? el : null;
}

/** Celular: só "Entrando e saindo" e a rotação abertos por padrão (a aba tinha ~18 telas de rolagem). */
const MOBILE_OPEN = new Set(["head", "rot", "rotChart"]);
export const isNarrow = () => !!globalThis.matchMedia?.("(max-width: 760px)").matches;
/** Padrão de um bloco sem escolha salva. `key` = "<lado>.<bloco>". */
export function flowFoldDefault(key, narrow = isNarrow()) {
  const id = String(key).split(".").pop();
  if (id === "table") return false;
  return narrow ? MOBILE_OPEN.has(id) : true;
}

export function drawFlowDynamic(ctx) {
  const U = uniOf(ctx);
  const snap = snapshotFor(ctx);
  const all =
    ctx.prefs.flowGroup === "all"
      ? snap
      : flowSnapshot(ctx.flow, {
          horizon: ctx.prefs.flowHorizon,
          back: ctx.back,
          sessionFrac: ctx.sessionFrac,
          uni: U,
        });
  const groups = groupFlows(all.rows, U);
  ctx.rowsBySym = Object.fromEntries(snap.rows.map((r) => [r.sym, r]));

  const { into, out } = flowHeadline(groups);
  const chip = (g) =>
    `<button class="gchip ${g.z >= 0 ? "pos" : "neg"}" data-group="${g.id}">${esc(g.label)} <b>${fmtZ(g.z)}</b></button>`;
  const hl = document.getElementById("flowHeadline");
  if (hl)
    hl.innerHTML = `<div class="hl-row"><span class="hl-lab neg">Saindo de</span>${out.map(chip).join("") || `<span class="muted">nenhum grupo com saída relevante</span>`}</div>
      <div class="hl-arrow" aria-hidden="true">→</div>
      <div class="hl-row"><span class="hl-lab pos">Entrando em</span>${into.map(chip).join("") || `<span class="muted">nenhum grupo com entrada relevante</span>`}</div>
      <div class="muted hl-meta">${HORIZON_LABEL[ctx.prefs.flowHorizon]} · pregão de ${dateBR(snap.date)}${ctx.back === 0 && ctx.live ? " · com cotações ao vivo" : ""} · fluxo inferido por preço e volume, não por captação</div>`;

  const gb = shown("groupBars");
  if (gb)
    gb.innerHTML = groups
      .map((g) => {
        const w = (Math.min(Math.abs(g.z), 2) / 2) * 50;
        const tip = `Mais fortes: ${g.top.map((r) => r.label).join(", ")} · Mais fracos: ${g.bottom.map((r) => r.label).join(", ")}`;
        return `<button class="gbar ${ctx.prefs.flowGroup === g.id ? "sel" : ""}" data-group="${g.id}" title="${esc(tip)}">
          <span class="gl">${esc(g.label)}</span>
          <span class="gtrack"><span class="gmid"></span><span class="gfill ${g.z >= 0 ? "pos" : "neg"}" style="${g.z >= 0 ? "left:50%" : `left:${50 - w}%`};width:${w}%"></span></span>
          <span class="gv"><b class="${g.z >= 0 ? "pos" : "neg"}">${fmtZ(g.z)}</b> · ${Math.round(g.breadth * 100)}%↑</span></button>`;
      })
      .join("");

  drawStory(ctx);
  drawTreemap(ctx, snap.rows);

  const tb = shown("flowTable");
  if (tb) {
    const rows = [...snap.rows].sort((a, b) => b.z - a.z);
    tb.innerHTML = `<table><thead><tr><th>Ativo</th><th>Grupo</th><th class="num">Variação</th><th class="num">σ</th><th class="num">Vol. relativo</th><th class="num">Preço</th></tr></thead><tbody>${rows
      .map(
        (r) =>
          `<tr class="click" data-sym="${esc(r.sym)}"><td>${esc(r.name)} <span class="tk muted">${esc(r.sym)}</span></td><td>${esc(U.byId[r.group].label)}</td><td class="num ${r.z >= 0 ? "pos" : "neg"}">${fmtVal(r)}</td><td class="num">${fmtZ(r.z)}</td><td class="num">${r.relVol ? `${num(r.relVol, 1)}x` : "–"}</td><td class="num"${tickAttr(r.sym, r.price)}>${num(r.price, r.price < 10 ? 4 : 2)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  }
  const fd = document.getElementById("flowDate");
  if (fd) fd.textContent = `${dateBR(snap.date)}${ctx.back === 0 ? " (hoje)" : ""}`;
}

function tileSize(r, mode, fallback) {
  if (mode === "eq") return 1;
  return r.liq ? Math.max(0.6, Math.log10(r.liq) - 5) : fallback;
}

let find = "";
const prevBoxes = {}; // por universo: posição/cor de cada bloco no desenho anterior (para animar a transição)

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Texto do bloco com fonte proporcional ao tamanho: blocos grandes leem de longe, pequenos mostram só o código. */
function tileBody(r, w, h, hot) {
  const lab = r.label;
  const fs = Math.max(9, Math.min(20, h * 0.3, (w - 6) / (Math.max(lab.length, 3) * 0.62)));
  if (fs < 9.5 && (w < 22 || h < 12)) return { fs, html: "" };
  const val = fmtVal(r);
  const vfs = Math.max(9, fs * 0.82);
  const showVal = h > fs + vfs + 6 && w > val.length * vfs * 0.58 + 4;
  const showHot = hot && h > fs + vfs * 2 + 10;
  return {
    fs,
    html: `<b>${esc(lab)}</b>${showVal ? `<span>${val}</span>` : ""}${showHot ? `<i>◆ ${num(r.relVol, 1)}x</i>` : ""}`,
  };
}

function matches(r, q) {
  return (
    r.sym.toLowerCase().includes(q) ||
    r.label.toLowerCase().includes(q) ||
    (r.name ?? "").toLowerCase().includes(q)
  );
}

/** Apaga o que não bate com a busca / com "só fortes" (sem redesenhar). */
function applyTreemapFocus(ctx) {
  const el = document.getElementById("treemap");
  if (!el) return;
  const q = find.trim().toLowerCase();
  const strong = !!ctx.prefs.flowStrong;
  let hits = 0;
  for (const t of el.querySelectorAll(".tile")) {
    const r = ctx.rowsBySym?.[t.dataset.sym];
    if (!r) continue;
    const hit = q ? matches(r, q) : true;
    const dim = (q && !hit) || (strong && Math.abs(r.z) < 1);
    t.classList.toggle("dim", dim);
    t.classList.toggle("found", !!q && hit);
    if (q && hit) hits++;
  }
  el.classList.toggle("searching", !!q);
  const f = document.getElementById("flowFind");
  if (f) f.classList.toggle("nohit", !!q && hits === 0);
}

function drawTreemap(ctx, rows) {
  const el = shown("treemap");
  if (!el) return;
  const U = uniOf(ctx);
  const prevBox = prevBoxes[U.id] ?? new Map();
  const W = el.clientWidth;
  // No celular, com todos os grupos, cada grupo vira uma faixa própria (empilhadas): 274 blocos num só retângulo de 390px ficam ilegíveis.
  const stacked = W < 640 && ctx.prefs.flowGroup === "all";
  let H = W < 640 ? 980 : Math.max(560, Math.min(900, Math.round(W * 0.62)));
  const sized = rows.filter((r) => r.liq).map((r) => Math.max(0.6, Math.log10(r.liq) - 5));
  const fallback = sized.length
    ? sized.sort((a, b) => a - b)[Math.floor(sized.length / 2)] * 0.8
    : 1;
  const byGroup = {};
  for (const r of rows)
    (byGroup[r.group] ??= []).push({ ...r, size: tileSize(r, ctx.prefs.flowSize, fallback) });
  const gItems = U.groups
    .filter((g) => byGroup[g.id])
    .map((g) => ({
      g,
      members: byGroup[g.id],
      size: byGroup[g.id].reduce((a, b) => a + b.size, 0),
    }));
  const GAP = 2;
  const HEAD = 18;
  const zoomed = ctx.prefs.flowGroup !== "all";
  let html = "";
  const boxes = new Map();
  let layout;
  if (stacked) {
    let y = 0;
    const perRow = Math.max(3, Math.floor(W / 92));
    layout = gItems.map((item) => {
      const h = HEAD + 6 + Math.ceil(item.members.length / perRow) * 54;
      const r = { item, x: 0, y, w: W, h };
      y += h;
      return r;
    });
    H = y;
  } else layout = squarify(gItems, { x: 0, y: 0, w: W, h: H });
  el.style.height = `${H}px`;
  for (const gr of layout) {
    const { g, members } = gr.item;
    const showHead = gr.h > 44 && gr.w > 60;
    const gw = gr.w - GAP;
    const gh = gr.h - GAP;
    html += `<div class="tm-group" style="left:${gr.x}px;top:${gr.y}px;width:${gw}px;height:${gh}px">${showHead ? `<button class="tm-head" data-group="${g.id}" title="${zoomed ? "Voltar a todos os grupos" : `Ampliar ${esc(g.label)}`}">${esc(g.label)} <span>${members.length}</span></button>` : ""}</div>`;
    const inner = {
      x: gr.x + 1,
      y: gr.y + (showHead ? HEAD : 1),
      w: gr.w - GAP - 2,
      h: gr.h - GAP - (showHead ? HEAD : 1) - 1,
    };
    for (const t of squarify(members, inner)) {
      const r = t.item;
      const { bg, fg } = zColor(r.z);
      const w = Math.max(0, t.w - GAP);
      const h = Math.max(0, t.h - GAP);
      const late = ctx.late?.has(r.sym);
      const hot = r.relVol >= 1.5;
      const { fs, html: body } = tileBody(r, w, h, hot);
      boxes.set(r.sym, { x: t.x, y: t.y, w, h, bg });
      html += `<div class="tile ${late ? "late" : ""} ${hot ? "hot" : ""}" data-sym="${esc(r.sym)}" tabindex="0" style="left:${t.x}px;top:${t.y}px;width:${w}px;height:${h}px;background:${bg};color:${fg};--tfs:${fs.toFixed(1)}px" aria-label="${esc(r.name)} ${fmtVal(r)}">${body}</div>`;
    }
  }
  el.innerHTML = html;
  // FLIP: cada bloco nasce onde estava no desenho anterior e desliza até a nova posição/cor.
  if (prevBox.size && !reducedMotion()) {
    const moved = [];
    for (const t of el.querySelectorAll(".tile")) {
      const a = prevBox.get(t.dataset.sym);
      const b = boxes.get(t.dataset.sym);
      if (!a || !b) {
        t.classList.add("pop");
        continue;
      }
      if (a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.bg === b.bg) continue;
      t.style.transition = "none";
      t.style.transform = `translate(${a.x - b.x}px,${a.y - b.y}px) scale(${b.w ? a.w / b.w : 1},${b.h ? a.h / b.h : 1})`;
      t.style.transformOrigin = "0 0";
      t.style.background = a.bg;
      moved.push([t, b.bg]);
    }
    if (moved.length) {
      void el.offsetWidth;
      requestAnimationFrame(() => {
        for (const [t, bg] of moved) {
          t.style.transition = "";
          t.style.transform = "";
          t.style.background = bg;
        }
      });
    }
  }
  prevBoxes[U.id] = boxes;
  applyTreemapFocus(ctx);
  const f = document.getElementById("flowFind");
  if (f)
    f.oninput = () => {
      find = f.value;
      applyTreemapFocus(ctx);
    };
}

/** Tooltip do mapa (posicionado no mouse). */
export function flowTooltip(ctx, e) {
  const tip = document.getElementById("tip");
  if (!tip) return;
  const tile = e.target.closest?.(".tile");
  if (!tile) return void (tip.hidden = true);
  const r = ctx.rowsBySym?.[tile.dataset.sym];
  if (!r) return void (tip.hidden = true);
  const lateInfo = ctx.lateMap?.[r.sym];
  tip.innerHTML = `<b>${esc(r.name)}</b> <span class="muted">${esc(r.sym)}</span><br>${esc(uniOf(ctx).byId[r.group].label)}<br>
    ${HORIZON_LABEL[ctx.prefs.flowHorizon]}: <b>${fmtVal(r)}</b> (${fmtZ(r.z)})<br>
    Preço: ${num(r.price, r.price < 10 ? 4 : 2)}${r.relVol ? ` · volume ${num(r.relVol, 1)}x a média` : ""}
    ${lateInfo ? `<br><span class="amber">Cotação atrasada ${lateInfo} min</span>` : ""}`;
  tip.hidden = false;
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  const y =
    e.clientY + 16 + tip.offsetHeight > window.innerHeight
      ? e.clientY - tip.offsetHeight - 10
      : e.clientY + 16;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

// ───────────── rotação relativa (Chart.js) ─────────────

export const quadColor = (q) => {
  const p = pal();
  return { Liderando: p.buy, "Perdendo força": p.wait, Atrasado: p.sell, "Ganhando força": p.info }[
    q
  ];
};
const quadBg = (q) => `${quadColor(q)}18`; // mesma cor com ~9% de opacidade

// animação: play (quadro f na linha do tempo; null = completo) e transição entre janelas
const rotAnim = { key: null, f: null, playing: false, last: 0, raf: 0 };
/** ▶ Play da rotação em curso (o redesenho por cotação nova espera o play terminar). */
export const rotPlaying = () => rotAnim.playing;
let rotCur = null; // gráfico atual: { chart, apply, timeline }
let rotPrev = null; // último desenho com dados: { gid, wk, tails, sc } (ponto de partida da transição)
let rotTween = 0;
const lerp = (a, b, e) => a + (b - a) * e;
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const alphaHex = (a) => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0"); // prettier-ignore

function playLoop(now) {
  rotAnim.raf = 0;
  if (!rotAnim.playing || !rotCur) return;
  if (!rotCur.chart.ctx || !document.getElementById("rotChart")) {
    rotAnim.playing = false; // saiu da aba: o gráfico já não existe
    return;
  }
  const L = rotCur.timeline.length;
  // velocidade do player (−1x volta no tempo; 0,5x, 1x, 2x para frente)
  const st = playStep(rotAnim.f, L, (now - rotAnim.last) / 1000, rotAnim.speed ?? 1);
  rotAnim.last = now;
  rotAnim.f = st.f;
  rotAnim.playing = st.playing;
  rotCur.apply(rotAnim.f);
  if (rotAnim.playing) rotAnim.raf = requestAnimationFrame(playLoop);
}

let rotSel = new Set(); // ativos em foco na rotação
let rotFocusNext = null; // tema a focar no próximo desenho (candidato a liderança tocado)
let rotGroupSeen = null;
let rotHover = null;

const QUAD_ORDER = ["Liderando", "Ganhando força", "Perdendo força", "Atrasado"];

/** Rótulos sem sobreposição: os em foco primeiro; um rótulo que bateria em outro tenta 4 posições e, se não couber, some. */
function placeLabels(c, items, area, dots = []) {
  const boxes = dots.map(({ x, y }) => ({ x: x - 4, y: y - 4, w: 8, h: 8 }));
  const hit = (b) =>
    boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
  for (const it of items) {
    const w = c.measureText(it.text).width + 4;
    const h = 13;
    const tries = [
      [it.x + 8, it.y - h - 2],
      [it.x - w - 8, it.y - h - 2],
      [it.x + 8, it.y + 3],
      [it.x - w - 8, it.y + 3],
    ];
    for (const [x, y] of tries) {
      const b = { x, y, w, h };
      if (x < area.left || x + w > area.right || y < area.top || y + h > area.bottom) continue;
      if (hit(b)) continue;
      boxes.push(b);
      it.at = b;
      break;
    }
  }
}

// barras intraday do grupo (api/intraday?symbols=) pela central de barras: revalida na virada da barra
// (5 ou 30 min, alinhada ao relógio); entre uma busca e outra, o preço ao vivo completa a última barra
let lastRotCtx = null;
const redrawRot = () => {
  if (lastRotCtx && document.getElementById("rotChart")) drawRotation(lastRotCtx);
};
const intraData = (g, members, win) =>
  useBars(barsKey({ symbols: intradaySymbols(g, members), win: win.src }), { onUpdate: redrawRot });

export function drawRotation(ctx) {
  const el = document.getElementById("rotChart");
  if (!el) return;
  const U = uniOf(ctx);
  const g0 = U.byId[ctx.prefs.rotGroup];
  const g = g0 && !g0.noRotation ? g0 : U.byId[U.rotDefault];
  if (rotGroupSeen !== g.id) {
    rotSel = new Set();
    rotGroupSeen = g.id;
  }
  // veio de um candidato a liderança (toque no quadro ou link do aviso): o tema já abre em foco
  const fx = rotFocusNext ?? ctx.takeRotFocus?.();
  if (fx) {
    rotSel = new Set([fx]);
    rotFocusNext = null;
  }
  lastRotCtx = ctx;
  rotAnim.speed = rotSpeed(ctx.prefs.rotSpeed);
  const wk = ctx.prefs.rotWin in ROT_WINDOWS ? ctx.prefs.rotWin : ROT_DEFAULT;
  const win = rotWindow(wk);
  const status = document.getElementById("rotStatus");
  const note = document.getElementById("rotNote");
  let data;
  if (win.intra) {
    const members = U.assets.filter((a) => a.group === g.id);
    const none = !intradaySymbols(g, members).filter((x) => x !== g.bench).length;
    const c = none ? { err: "grupo de cestas calculadas no app: use as janelas diárias" } : intraData(g, members, win); // prettier-ignore
    // switch On/Off market do topo: Off = pré e pós entram (e o pós da véspera no "Hoje"); On = só o pregão.
    // Onshore (B3) não tem pré/pós: tudo é pregão.
    const usSess = U.id === "off";
    const ext = usSess && ctx.mode === "off";
    data = c?.data ? rotationIntraday(c.data, g, members, wk, ctx.quotes ?? {}, quadrantOf, { ext, sessions: usSess }) : []; // prettier-ignore
    const sessNote = !usSess ? "" : ext ? " · modo Off: com pré e pós-mercado (tracejado)" : " · modo On: só o pregão regular (toque em Off no topo para ver pré e pós)"; // prettier-ignore
    const at = c?.data?.fetched_at ? new Date(c.data.fetched_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null; // prettier-ignore
    if (status)
      status.textContent = !c?.data
        ? c?.err
          ? none
            ? `· Intraday indisponível: ${c.err}.`
            : `· Sem barras intraday agora (${c.err}). Tenta de novo em 1 min.`
          : "· Carregando barras intraday…"
        : `· barras de ${win.src === "short" ? "5" : "30"} min (Yahoo, de ${at}) + preço ao vivo${sessNote}${c.data.missing?.length ? ` · sem barras: ${c.data.missing.join(", ")}` : ""}${c.loading ? " · atualizando…" : ""}`;
    if (note)
      note.textContent = `Janela ${win.label.toLowerCase()}: um ponto a cada ${win.every >= 60 ? `${win.every / 60} h` : `${win.every} min`} (fim de cada intervalo, horários de Brasília), ligados em linha reta; o último é o preço de agora. (pré)/(pós) = fora do pregão regular, com pouco volume, em trecho tracejado; seguem o switch On/Off market do topo (Off = com pré, pós e o pós da véspera no "Hoje"; On = só o pregão). Força suavizada por médias móveis exponenciais de 5 e 20 barras de ${win.bar} min; momento = força agora ÷ força de 5 barras atrás. Ruído intraday é alto: use como leitura da sessão, não como gatilho.`;
  } else {
    data = rotation(ctx.flow, g.id, { uni: U, points: win.points, step: win.step });
    if (status) status.textContent = "";
    if (note)
      note.textContent = `Cauda = ${win.label} (um ponto a cada ${win.step} pregões; o último é o preço de agora).`;
  }
  const bench = document.getElementById("rotBench");
  if (bench)
    bench.textContent = g.bench
      ? `Benchmark: ${U.bySym[g.bench]?.name ?? g.bench}`
      : "Benchmark: média do próprio grupo (peso igual)";
  const box = el.parentElement;
  if (box)
    box.style.height = `${Math.max(420, Math.min(640, Math.round((box.clientWidth || 800) * 0.6)))}px`;
  const floor = win.intra ? 0.2 : 3; // amplitude mínima do eixo (intraday anda décimos)
  // escala (fitAxis) = exatamente os pontos desenhados no quadro (rastro curto, cauda completa ou ativo em foco):
  // todas as caudas ficam inteiras na tela. No play, o zoom acompanha (followAxis): abre na hora, fecha devagar.
  const fitOf = (pts) => ({ x: fitAxis(pts.map((p) => p.x), floor), y: fitAxis(pts.map((p) => p.y), floor) }); // prettier-ignore
  const many = data.length > 10;
  const inten = segIntensity(data); // 0–1 por trecho: espessura da linha
  const trailFull = ctx.prefs.rotTrail === "full";
  let sc = { x: [99, 101], y: [99, 101] }; // definida logo abaixo, quando a linha do tempo existe
  // rede de segurança: cabeça que ainda escape (zoom em transição) é desenhada logo dentro da moldura,
  // com o valor real guardado (rx/ry) para a dica
  const clampPt = (p) => {
    const ix = (sc.x[1] - sc.x[0]) * 0.015;
    const iy = (sc.y[1] - sc.y[0]) * 0.02;
    const x = Math.min(sc.x[1] - ix, Math.max(sc.x[0] + ix, p.x));
    const y = Math.min(sc.y[1] - iy, Math.max(sc.y[0] + iy, p.y));
    return x === p.x && y === p.y ? p : { ...p, x, y, rx: p.x, ry: p.y, out: true };
  };
  const clampHead = (vis) => (vis.length ? [...vis.slice(0, -1), clampPt(vis.at(-1))] : vis);

  const offs = data.map(() => 0); // pontos escondidos no começo de cada cauda (rastro curto)
  // pontos mostrados no quadro f (null = agora): rastro curto, salvo cauda completa ou ativo em foco
  const visOf = (i, f) => {
    const all = f == null ? data[i].tail : frameTail(data[i].tail, timeline, f);
    // cauda inteira: "Cauda completa" ou ativo selecionado (passar o mouse só destaca: não muda o zoom)
    const n = trailFull || rotSel.has(data[i].sym) ? all.length : Math.min(all.length, TRAIL);
    offs[i] = all.length - n;
    return all.slice(all.length - n);
  };
  const timeline = playTimeline(data);
  const spStep = win.intra ? 1 : win.step; // velocidade: por hora (intraday) ou por pregão (diário)
  let speedNow = {}; // sym → { rel, level, vx, vy } da cabeça no quadro mostrado
  const visAll = (f) => data.map((_, i) => visOf(i, f));
  const scaleFor = (f) => fitOf(visAll(f).flat());
  sc = scaleFor(rotAnim.f);
  const quadNow = data.map((d) => d.quadrant); // quadrante da cabeça no quadro mostrado (muda no play)
  const animKey = `${U.id}:${g.id}:${wk}`;
  if (rotAnim.key !== animKey) Object.assign(rotAnim, { key: animKey, f: null, playing: false });
  const segW = (i, k) => {
    const f = focusOf(i);
    const base = f === 2 ? 1.5 : f === 1 ? (many ? 0.7 : 1) : 0.45;
    return base * (1 + 5 * (inten[i]?.[offs[i] + k] ?? 0));
  };
  const segC = (i, k, n) => {
    const f = focusOf(i);
    const a = f === 2 ? 0.9 : f === 1 ? (many ? 0.35 : 0.65) : 0.1;
    const age = n > 2 ? 0.3 + (0.7 * (k + 1)) / (n - 1) : 1; // mais antigo = mais claro
    return `${quadColor(quadNow[i])}${alphaHex(a * age)}`;
  };
  const focusOf = (i) => {
    const sym = data[i]?.sym;
    if (rotHover != null) return i === rotHover || rotSel.has(sym) ? 2 : 0;
    if (rotSel.size) return rotSel.has(sym) ? 2 : 0;
    return 1; // nada em foco: todos iguais
  };
  const style = (chart) => {
    chart.data.datasets.forEach((ds, i) => {
      const f = focusOf(i);
      const col = quadColor(quadNow[i]);
      const n = ds.data.length;
      const headA = f === 0 ? "40" : "";
      ds.borderColor = `${col}${f === 2 ? "cc" : "55"}`;
      ds.borderWidth = segW(i, n - 2);
      ds.pointRadius = ds.data.map((p, k) =>
        k === n - 1
          ? f === 2
            ? 7
            : f === 1
              ? 5
              : 3.5
          : p.partial
            ? 0
            : f === 2
              ? 2.5
              : f === 1 && !many
                ? 1.6
                : 0,
      );
      ds.pointBackgroundColor = ds.data.map((_, k) =>
        k === n - 1 ? `${col}${headA}` : `${col}${f === 2 ? "99" : "55"}`,
      );
      ds.pointBorderWidth = ds.data.map((_, k) => (k === n - 1 && f > 0 ? 2 : 0));
      ds.order = 3 - f; // em foco por cima
    });
  };
  // "· 2,3x" ao lado do nome de quem gira rápido (≥ 1,5x o ritmo típico do grupo)
  const spdTag = (i) => {
    const sp = speedNow[data[i]?.sym];
    return sp && (sp.level.id === "fast" || sp.level.id === "vfast") ? ` ${num(sp.rel, 1)}x` : "";
  };
  // dica na cabeça: velocidade agora (intensidade e força por hora/pregão)
  const spdTip = (it) => {
    const sp = speedNow[data[it.datasetIndex]?.sym];
    if (!sp || it.dataIndex !== it.dataset.data.length - 1) return "";
    return ` · velocidade ${num(sp.rel, 1)}x (${sp.level.label}), força ${signed(sp.vx, 2)}/${win.intra ? "h" : "pregão"}`;
  };
  const quadPlugin = {
    id: "quads",
    beforeDatasetsDraw(chart) {
      const { ctx: c, chartArea: a, scales } = chart;
      const cx = scales.x.getPixelForValue(100);
      const cy = scales.y.getPixelForValue(100);
      const rects = [
        ["Liderando", cx, a.top, a.right - cx, cy - a.top],
        ["Perdendo força", cx, cy, a.right - cx, a.bottom - cy],
        ["Atrasado", a.left, cy, cx - a.left, a.bottom - cy],
        ["Ganhando força", a.left, a.top, cx - a.left, cy - a.top],
      ];
      c.save();
      for (const [q, x, y, w, h] of rects) {
        c.fillStyle = quadBg(q);
        c.fillRect(x, y, w, h);
        c.fillStyle = quadColor(q);
        c.font = `600 ${a.right - a.left < 420 ? 10 : 12}px ${pal().ui}`;
        c.textAlign = x === cx ? "right" : "left";
        c.textBaseline = y === a.top ? "top" : "bottom";
        const cnt = quadNow.filter((x, i) => x === q && chart.data.datasets[i]?.data.length).length;
        c.fillText(
          `${q.toUpperCase()} · ${cnt}`,
          x === cx ? a.right - 6 : a.left + 6,
          y === a.top ? a.top + 6 : a.bottom - 6,
        );
      }
      c.restore();
    },
    afterDatasetsDraw(chart) {
      const { ctx: c, chartArea } = chart;
      c.save();
      // anel de velocidade na cabeça (rápido = 1 anel, muito rápido = 2): quanto maior, mais rápido o giro
      chart.data.datasets.forEach((ds, i) => {
        const sp = speedNow[data[i]?.sym];
        const f = focusOf(i);
        const pts = chart.getDatasetMeta(i).data;
        if (!sp || f === 0 || !pts.length || (sp.level.id !== "fast" && sp.level.id !== "vfast"))
          return;
        const h = pts.at(-1);
        const r0 = f === 2 ? 7 : 5;
        const col = quadColor(quadNow[i]);
        const rings = sp.level.id === "vfast" ? 2 : 1;
        c.lineWidth = f === 2 ? 2 : 1.5;
        for (let k = 0; k < rings; k++) {
          c.strokeStyle = `${col}${k ? "55" : f === 2 ? "cc" : "99"}`;
          c.beginPath();
          c.arc(h.x, h.y, r0 + 4 + Math.min(10, 2.2 * sp.rel) + k * 5, 0, Math.PI * 2);
          c.stroke();
        }
      });
      // seta na cabeça: direção do último trecho, tamanho pela força dele
      chart.data.datasets.forEach((ds, i) => {
        const f = focusOf(i);
        const pts = chart.getDatasetMeta(i).data;
        if (f === 0 || pts.length < 2) return;
        const h = pts.at(-1);
        const b = pts.at(-2);
        const ang = Math.atan2(h.y - b.y, h.x - b.x);
        if (!Number.isFinite(ang) || Math.hypot(h.x - b.x, h.y - b.y) < 2) return;
        const sz =
          (f === 2 ? 9 : many ? 6 : 7.5) *
          (1 + 0.6 * (inten[i]?.[offs[i] + ds.data.length - 2] ?? 0));
        const r = f === 2 ? 7 : 5; // sai da borda do ponto da cabeça
        const tx = h.x + Math.cos(ang) * (r + sz);
        const ty = h.y + Math.sin(ang) * (r + sz);
        c.fillStyle = `${quadColor(quadNow[i])}${f === 2 ? "" : many ? "99" : "cc"}`;
        c.beginPath();
        c.moveTo(tx, ty);
        c.lineTo(tx - Math.cos(ang - 0.45) * sz, ty - Math.sin(ang - 0.45) * sz);
        c.lineTo(tx - Math.cos(ang + 0.45) * sz, ty - Math.sin(ang + 0.45) * sz);
        c.closePath();
        c.fill();
      });
      c.font = `600 11px ${pal().mono}`;
      c.textBaseline = "top";
      const items = chart.data.datasets
        .map((ds, i) => {
          const meta = chart.getDatasetMeta(i);
          const head = meta.data[meta.data.length - 1];
          return head && !meta.hidden
            ? {
                text: `${ds.label}${spdTag(i)}${ds.data.at(-1)?.out ? " ›" : ""}`,
                x: head.x,
                y: head.y,
                f: focusOf(i),
              }
            : null;
        })
        .filter(Boolean);
      const dots = items.filter((it) => it.f > 0);
      const labeled = dots.slice().sort((a, b) => b.f - a.f);
      placeLabels(c, labeled, chartArea, dots);
      const p = pal();
      c.lineJoin = "round";
      c.lineWidth = 3;
      c.strokeStyle = p.surface;
      for (const it of labeled) {
        if (!it.at) continue;
        c.strokeText(it.text, it.at.x + 2, it.at.y + 1);
        c.fillStyle = it.f === 2 ? p.text : p.text2;
        c.fillText(it.text, it.at.x + 2, it.at.y + 1);
      }
      c.restore();
    },
  };
  globalThis.Chart?.getChart?.(el)?.destroy(); // redesenho fora do render (chegaram as barras intraday)
  const chart = ctx.mkChart(el, {
    type: "scatter",
    data: {
      datasets: data.map((d) => ({
        label: d.label,
        data: d.tail,
        showLine: true,
        tension: 0,
        borderCapStyle: "round",
        segment: {
          // trecho que chega num ponto de pré/pós-mercado: tracejado (pouco volume)
          borderDash: (sc) => {
            const s = sc.chart.data.datasets[sc.datasetIndex].data[sc.p1DataIndex]?.s;
            return s === "pre" || s === "post" ? [5, 4] : undefined;
          },
          borderWidth: (sc) => segW(sc.datasetIndex, sc.p0DataIndex),
          borderColor: (sc) =>
            segC(
              sc.datasetIndex,
              sc.p0DataIndex,
              sc.chart.data.datasets[sc.datasetIndex].data.length,
            ),
        },
        pointHoverRadius: 8,
        pointBorderColor: pal().surface,
        meta: d,
      })),
    },
    options: {
      animation: false,
      onHover: (e, els) => {
        const i = els[0]?.datasetIndex ?? null;
        if (i === rotHover) return;
        rotHover = i;
        e.native.target.style.cursor = i == null ? "" : "pointer";
        apply(rotAnim.f); // foco muda o rastro mostrado
        syncChips();
      },
      onClick: (e, els) => {
        const i = els[0]?.datasetIndex;
        if (i == null) return;
        toggle(data[i].sym);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (it) => focusOf(it.datasetIndex) > 0,
          callbacks: {
            label: (it) => {
              const d = it.dataset.meta;
              const dd = win.intra ? 2 : 1;
              const w =
                inten[it.datasetIndex]?.[offs[it.datasetIndex] + Math.max(0, it.dataIndex - 1)];
              return `${d.name} · ${quadNow[it.datasetIndex]} · ${it.raw.label ?? dateBR(it.raw.date)} · força ${num(it.raw.rx ?? it.raw.x, dd)} / momento ${num(it.raw.ry ?? it.raw.y, dd)}${it.raw.out ? " (fora da escala, preso na borda)" : ""}${it.dataIndex > 0 && w != null ? ` · ritmo ${Math.round(w * 100)}%` : ""}${spdTip(it)}`;
            },
          },
        },
      },
      scales: {
        x: {
          min: sc.x[0],
          max: sc.x[1],
          title: { display: true, text: "Força relativa (100 = em linha com o benchmark)" },
          grid: { color: (c) => (c.tick.value === 100 ? pal().text3 : pal().line) },
        },
        y: {
          min: sc.y[0],
          max: sc.y[1],
          title: { display: true, text: "Momento da força relativa" },
          grid: { color: (c) => (c.tick.value === 100 ? pal().text3 : pal().line) },
        },
      },
    },
    plugins: [quadPlugin],
  });
  if (!chart) return;
  const keys = new Map(data.flatMap((d) => d.tail.map((p) => [p.t ?? p.date, p.label ?? dateBR(p.date)]))); // prettier-ignore
  const btn = document.getElementById("rotPlay");
  const scrub = document.getElementById("rotScrub");
  const time = document.getElementById("rotTime");
  const L = timeline.length;
  const syncPlay = (f) => {
    if (btn) {
      const ic = (rotAnim.speed ?? 1) < 0 ? "◀" : "▶"; // −1x toca de trás para frente
      btn.textContent = rotAnim.playing ? "⏸ Pausar" : f == null ? `${ic} Play` : `${ic} Continuar`;
      btn.disabled = L < 2;
    }
    if (scrub) scrub.value = String(f == null || L < 2 ? 1000 : Math.round((f / (L - 1)) * 1000));
    if (time)
      time.textContent = !L
        ? ""
        : f == null
          ? `Agora · ${keys.get(timeline.at(-1)) ?? ""}`
          : `${keys.get(timeline[Math.min(L - 1, Math.round(f))]) ?? ""} · ${Math.round(f) + 1}/${L}`;
  };
  // troca de escala (play começa/termina, cauda completa): os eixos deslizam até a nova escala
  let scaleTok = 0;
  const setScale = (to) => {
    const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
    if (same(to.x, sc.x) && same(to.y, sc.y)) return;
    const from = { x: [chart.options.scales.x.min, chart.options.scales.x.max], y: [chart.options.scales.y.min, chart.options.scales.y.max] }; // prettier-ignore
    sc = to;
    const tok = ++scaleTok;
    const t0 = performance.now();
    const ms = reducedMotion() ? 0 : 400;
    const step = (now) => {
      if (tok !== scaleTok || !chart.ctx) return;
      const e = ms ? ease(Math.min(1, (now - t0) / ms)) : 1;
      const sx = chart.options.scales;
      [sx.x.min, sx.x.max] = [lerp(from.x[0], to.x[0], e), lerp(from.x[1], to.x[1], e)];
      [sx.y.min, sx.y.max] = [lerp(from.y[0], to.y[0], e), lerp(from.y[1], to.y[1], e)];
      chart.update("none");
      if (e < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  // play: o zoom segue o quadro sem animação própria (abre na hora quando um ponto ia sair, fecha devagar)
  const followScale = (to) => {
    ++scaleTok; // cancela um deslize em curso
    const sx = chart.options.scales;
    const cx = followAxis([sx.x.min, sx.x.max], to.x);
    const cy = followAxis([sx.y.min, sx.y.max], to.y);
    [sx.x.min, sx.x.max] = cx;
    [sx.y.min, sx.y.max] = cy;
    sc = { x: cx, y: cy };
  };
  const apply = (f) => {
    const vis0 = visAll(f);
    const to = fitOf(vis0.flat());
    if (rotAnim.playing && f != null) followScale(to);
    else setScale(to);
    data.forEach((d, i) => {
      const vis = vis0[i];
      chart.data.datasets[i].data = clampHead(vis);
      quadNow[i] = vis.length ? quadrantOf(vis.at(-1)) : d.quadrant;
    });
    // velocidade da cabeça no quadro mostrado: anel e "2,3x" no gráfico + quadro abaixo
    speedNow = Object.fromEntries(speedBoard(data.map((d, i) => ({ ...d, tail: vis0[i] })), data, { step: spStep }).map((r) => [r.sym, r])); // prettier-ignore
    style(chart);
    chart.update("none");
    syncPlay(f);
    drawSpeed(f);
  };
  // quadro de velocidade: acompanha o quadro mostrado (no play, refeito só quando o ponto muda)
  let speedKey = null;
  function drawSpeed(f) {
    const box = shown("rotSpeed");
    if (!box) return;
    const key = `${f == null ? "now" : Math.floor(f)}|${[...rotSel].join(",")}`;
    if (key === speedKey) return;
    speedKey = key;
    const unit = win.intra ? "h" : "pregão";
    const board = Object.values(speedNow).sort((a, b) => b.rel - a.rel);
    if (!board.length) {
      box.innerHTML = `<p class="dim">Sem pontos suficientes para medir a velocidade.</p>`;
      return;
    }
    const qOf = Object.fromEntries(data.map((d, i) => [d.sym, quadNow[i]]));
    const dd = 2;
    const max = Math.max(3, ...board.map((r) => r.rel));
    box.innerHTML = `<table class="rspd-t"><thead><tr><th>Ativo</th><th>Intensidade <span class="dim">(× ritmo típico)</span></th><th class="num">Força /${unit}</th><th class="num">Momento /${unit}</th></tr></thead><tbody>${board
      .map((r) => {
        const col = quadColor(qOf[r.sym]);
        return `<tr class="click${rotSel.has(r.sym) ? " sel" : ""}" data-rspd="${esc(r.sym)}" title="${esc(`${r.label}: ${qOf[r.sym]} · ${r.level.label}`)}">
          <td><span class="rspd-dot" style="--q:${col}"></span>${esc(r.label)}</td>
          <td><span class="rspd-bar"><span class="rspd-fill lv-${r.level.id}" style="width:${Math.min(100, (r.rel / max) * 100).toFixed(1)}%;--q:${col}"></span></span> <b>${num(r.rel, 1)}x</b> <span class="rspd-lv lv-${r.level.id}">${r.level.label}</span></td>
          <td class="num ${r.vx >= 0 ? "pos" : "neg"}">${signed(r.vx, dd)}</td>
          <td class="num ${r.vy >= 0 ? "pos" : "neg"}">${signed(r.vy, dd)}</td></tr>`;
      })
      .join("")}</tbody></table>
      <p class="note">Velocidade medida no próprio gráfico, nos 2 últimos trechos: <b>força /${unit}</b> = pontos de força relativa ganhos ou perdidos por ${win.intra ? "hora" : "pregão"} (1 ponto ≈ 1% de desempenho contra o benchmark, suavizado; ▲ ganhando, ▼ perdendo); <b>momento /${unit}</b> = aceleração (▲) ou freio (▼). <b>Intensidade</b> = distância percorrida no gráfico ÷ ritmo típico do grupo nesta janela (mediana de todos os trechos): ${SPEED_LEVELS.slice()
        .reverse()
        .map((l) => `${l.label} ${l.min ? `≥ ${num(l.min, 1)}x` : "< 0,5x"}`)
        .join(
          " · ",
        )}. Não é preço por minuto: preço em dólares não se compara entre ativos; força relativa sim (ações, moedas e juros na mesma régua). Toque numa linha para focar.</p>`;
    box.onclick = (e) => {
      const tr = e.target.closest("[data-rspd]");
      if (tr) toggle(tr.dataset.rspd);
    };
  }
  rotCur = { chart, apply, timeline };
  const token = ++rotTween;
  const tweenFrom =
    rotAnim.f == null && rotPrev && rotPrev.gid === g.id && rotPrev.wk !== wk && data.length && !reducedMotion() // prettier-ignore
      ? rotPrev
      : null;
  if (tweenFrom) {
    // transição entre janelas: cada cauda sai do desenho anterior (reamostrado) e vai para o novo
    const to = data.map((_, i) => clampHead(visOf(i, null)));
    const from = to.map((tl, i) => resampleTail(tweenFrom.tails[data[i].sym], tl.length));
    const t0 = performance.now();
    const step = (now) => {
      if (token !== rotTween || !chart.ctx) return;
      const e = ease(Math.min(1, (now - t0) / 700));
      to.forEach((tl, i) => {
        chart.data.datasets[i].data = from[i].length
          ? tl.map((p, k) => ({
              ...p,
              x: lerp(from[i][k].x, p.x, e),
              y: lerp(from[i][k].y, p.y, e),
            }))
          : tl;
      });
      const sx = chart.options.scales;
      [sx.x.min, sx.x.max] = [
        lerp(tweenFrom.sc.x[0], sc.x[0], e),
        lerp(tweenFrom.sc.x[1], sc.x[1], e),
      ];
      [sx.y.min, sx.y.max] = [
        lerp(tweenFrom.sc.y[0], sc.y[0], e),
        lerp(tweenFrom.sc.y[1], sc.y[1], e),
      ];
      style(chart);
      chart.update("none");
      if (e < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    syncPlay(null);
  } else apply(rotAnim.f);
  if (data.length) rotPrev = { gid: g.id, wk, sc, tails: Object.fromEntries(data.map((d, i) => [d.sym, visOf(i, rotAnim.f)])) }; // prettier-ignore
  if (btn)
    btn.onclick = () => {
      if (rotAnim.playing) {
        rotAnim.playing = false;
        syncPlay(rotAnim.f);
        return;
      }
      if (L < 2) return;
      rotAnim.f = playStart(rotAnim.f, L, rotAnim.speed ?? 1);
      rotAnim.playing = true;
      rotAnim.last = performance.now();
      rotCur.apply(rotAnim.f);
      if (!rotAnim.raf) rotAnim.raf = requestAnimationFrame(playLoop);
    };
  if (scrub)
    scrub.oninput = () => {
      rotAnim.playing = false;
      const v = Number(scrub.value);
      rotAnim.f = v >= 1000 || L < 2 ? null : (v / 1000) * (L - 1);
      rotCur.apply(rotAnim.f);
    };
  // tocando e o gráfico foi refeito (cotação nova): o mesmo laço segue no gráfico novo
  if (rotAnim.playing && !rotAnim.raf) {
    rotAnim.last = performance.now();
    rotAnim.raf = requestAnimationFrame(playLoop);
  }
  el.onmouseleave = () => {
    if (rotHover == null) return;
    rotHover = null;
    apply(rotAnim.f); // foco muda o rastro mostrado
    syncChips();
  };

  // abaixo do gráfico: candidatos a liderança (todos os grupos, janela Hoje) e nomes puros do grupo aberto
  if (U.id === "off")
    drawLeaders(ctx, (gid, sym) => {
      rotFocusNext = sym;
      ctx.setPrefs?.({ [ctx.rotKey ?? "rotGroup"]: gid, [ctx.rotWinKey ?? "rotWin"]: "today" });
    });
  drawNames(ctx, g, U.assets.filter((a) => a.group === g.id), Object.fromEntries(data.map((d, i) => [d.sym, quadNow[i]])), quadColor); // prettier-ignore

  // lista de ativos agrupada por quadrante: tocar = focar (vários ao mesmo tempo)
  const chips = shown("rotChips");
  function syncChips() {
    if (!chips) return;
    for (const b of chips.querySelectorAll("[data-rot]"))
      b.setAttribute("aria-pressed", String(rotSel.has(b.dataset.rot)));
    const clr = chips.querySelector("[data-rot-clear]");
    if (clr) clr.hidden = rotSel.size === 0;
  }
  function toggle(sym) {
    rotSel.has(sym) ? rotSel.delete(sym) : rotSel.add(sym);
    apply(rotAnim.f); // foco muda o rastro mostrado
    syncChips();
  }
  if (chips) {
    chips.innerHTML =
      QUAD_ORDER.map((q) => {
        const ds = data
          .filter((d) => d.quadrant === q)
          .sort((a, b) => b.tail.at(-1).x - a.tail.at(-1).x);
        if (!ds.length) return "";
        return `<div class="rq"><span class="rq-lab" style="--q:${quadColor(q)}">${q}</span>${ds
          .map(
            (d) =>
              `<button class="rchip" data-rot="${esc(d.sym)}" style="--q:${quadColor(q)}" title="${esc(d.name)}" aria-pressed="false">${esc(d.label)}</button>`,
          )
          .join("")}</div>`;
      }).join("") + `<button class="btn small ghost" data-rot-clear hidden>Limpar foco</button>`;
    chips.onclick = (e) => {
      const b = e.target.closest("[data-rot],[data-rot-clear]");
      if (!b) return;
      if (b.dataset.rot) toggle(b.dataset.rot);
      else {
        rotSel.clear();
        apply(rotAnim.f); // foco muda o rastro mostrado
        syncChips();
      }
    };
    chips.onmouseover = (e) => {
      const b = e.target.closest("[data-rot]");
      const i = b ? data.findIndex((d) => d.sym === b.dataset.rot) : null;
      if (i === rotHover) return;
      rotHover = i;
      apply(rotAnim.f); // foco muda o rastro mostrado
    };
    chips.onmouseleave = () => {
      rotHover = null;
      apply(rotAnim.f); // foco muda o rastro mostrado
    };
    syncChips();
  }
}

// ───────────── visão geral e painel do ativo ─────────────

export function openFlowAsset(ctx, sym) {
  const a = FLOW_BY_SYM[sym];
  if (!a) return;
  const rows = Object.keys(HORIZONS).map((h) => {
    const r = flowSnapshot(ctx.flow, {
      horizon: h,
      sessionFrac: ctx.sessionFrac,
      groups: [a.group],
    }).rows.find((x) => x.sym === sym);
    return [h, r];
  });
  const r1 = rows[0][1];
  const kv = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  ctx.openDrawer(
    `<h2 style="padding-right:30px">${esc(a.name)} <span class="tk muted">${esc(sym)}</span></h2>
    <div class="card"><div class="kv">${kv("Grupo", esc(GROUP_BY_ID[a.group].label))}${kv(a.yld ? "Taxa" : a.inv ? "Cotação (moeda por US$)" : "Preço", num(ctx.flow.close[sym].at(-1), ctx.flow.close[sym].at(-1) < 10 ? 4 : 2))}
      ${rows.map(([h, r]) => kv(HORIZON_LABEL[h], r ? `${fmtVal(r)} · ${fmtZ(r.z)}` : "–")).join("")}
      ${kv("Volume relativo", r1?.relVol ? `${num(r1.relVol, 1)}x` : "–")}${kv("Último preço real", dateBR(ctx.flow.last_real?.[sym]))}</div>
      ${a.inv ? `<p class="note">Moeda mostrada contra o dólar: positivo = ${esc(a.name)} se valorizando.</p>` : ""}${a.yld ? `<p class="note">Taxa subindo = saída de títulos (vermelho no mapa).</p>` : ""}</div>
    ${assetPanelHtml(sym, { dates: ctx.flow.dates, close: ctx.flow.close[sym] })}`,
    () => mountAssetPanel(sym, { dates: ctx.flow.dates, close: ctx.flow.close[sym] }),
  );
}
