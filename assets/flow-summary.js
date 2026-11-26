// Resumo do fluxo para a Visão geral: mesmo motor da aba Fluxo (flow-engine.js), em formato de quadro.
// Puro (sem DOM): recebe a tabela do fluxo e devolve dados + HTML. Clicar num grupo abre a aba Fluxo filtrada.
import { flowSnapshot, groupFlows, flowHeadline, flowNarrative, HORIZONS, OFF_UNI } from "./flow-engine.js"; // prettier-ignore
import { esc, signed } from "./format.js";
import { hq } from "./help.js";

const fmtZ = (z) => `${signed(z, 1)}σ`;
const fmtVal = (r) =>
  r.unit === "bps"
    ? `${signed(r.value, 0)} bps`
    : `${signed(r.value, r.unit === "%" && Math.abs(r.value) < 100 ? 1 : 0)}%`;

/**
 * Resumo do fluxo no horizonte da Visão geral.
 * @param flow tabela do fluxo (state.flow, já com cotações ao vivo)
 * @param opts { horizon: "1d"|"5d"|"1m"|"3m", session: "pre"|"open"|"post"|"closed", sessionFrac, uni }
 * @returns null sem dados; senão { horizon, date, tone, into, out, groups, candidates, weak, phase }
 */
export function flowSummary(flow, opts = {}) {
  if (!flow?.dates?.length || !flow.close) return null;
  const U = opts.uni ?? OFF_UNI;
  const horizon = opts.horizon in HORIZONS ? opts.horizon : "1d";
  const sessionFrac = opts.sessionFrac ?? 1;
  const snap = flowSnapshot(flow, { horizon, sessionFrac, uni: U });
  if (!snap.rows.length) return null;
  const groups = groupFlows(snap.rows, U);
  const { into, out } = flowHeadline(groups);
  // volume relativo só compara bem no pregão e no horizonte de 1 dia
  const session = horizon === "1d" ? (opts.session ?? "open") : "closed";
  const nar = flowNarrative(snap.rows, groups, { session, sessionFrac, uni: U });
  return {
    horizon,
    date: snap.date,
    tone: nar.tone,
    phase: nar.phase,
    into,
    out,
    groups,
    candidates: nar.candidates.slice(0, 4),
    weak: nar.weak.slice(0, 4),
  };
}

const TONE_CLS = { risk_on: "up", risk_off: "dn", mixed: "mid" };

/** Item da barra do topo (tom + para onde o dinheiro vai). */
export function flowBarItem(sum) {
  if (!sum) return "";
  const lead = sum.into[0] ?? sum.out[0];
  const sub = lead
    ? `${sum.into[0] ? "entrando em" : "saindo de"} ${lead.label} ${fmtZ(lead.z)}`
    : "sem grupo com fluxo relevante";
  return `<button class="sb-item flow-sb ${TONE_CLS[sum.tone.id]}" data-tab="flow" title="Abrir a aba Fluxo"><span class="l">Fluxo ${sum.horizon.toUpperCase()} ${hq("sigma")}</span><b>${esc(sum.tone.label)} ${fmtZ(sum.tone.z)}</b><span class="dim">${esc(sub)}</span></button>`;
}

/** Quadro "Fluxo" da grade: saindo → entrando, barras dos grupos e ativos fortes/fracos. */
export function flowPanelHtml(sum) {
  if (!sum) return `<section class="dp dp-flow"><h3>Fluxo</h3><p class="dn-note">Fluxo indisponível.</p></section>`; // prettier-ignore
  const hk = sum.horizon;
  const chip = (g) =>
    `<button class="gchip ${g.z >= 0 ? "pos" : "neg"}" data-group="${esc(g.id)}" data-fh="${hk}" title="Abrir ${esc(g.label)} na aba Fluxo">${esc(g.label)} <b>${fmtZ(g.z)}</b></button>`;
  const row = (lab, cls, gs, empty) =>
    `<div class="fs-row"><span class="fs-lab ${cls}">${lab}</span>${gs.map(chip).join("") || `<span class="dim">${empty}</span>`}</div>`;
  const top = [...sum.groups]
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 6)
    .sort((a, b) => b.z - a.z)
    .map((g) => {
      const w = (Math.min(Math.abs(g.z), 2) / 2) * 50;
      return `<tr data-group="${esc(g.id)}" data-fh="${hk}" tabindex="0"><td class="n">${esc(g.label)}</td><td class="fs-bar"><span class="gtrack"><span class="gmid"></span><span class="gfill ${g.z >= 0 ? "pos" : "neg"}" style="left:${g.z >= 0 ? 50 : 50 - w}%;width:${w}%"></span></span></td><td class="c ${g.z >= 0 ? "up" : "dn"}">${fmtZ(g.z)}</td><td class="v dim">${Math.round(g.breadth * 100)}%↑</td></tr>`;
    })
    .join("");
  const assets = (rows, cls) =>
    rows.length
      ? rows
          .map(
            (r) =>
              `<button class="fs-a" data-sym="${esc(r.sym)}" title="${esc(r.name ?? r.label)}"><b>${esc(r.label)}</b> <span class="${cls}">${fmtVal(r)}</span> <span class="dim">${fmtZ(r.z)}${r.hot ? " ◆" : ""}</span></button>`,
          )
          .join("")
      : `<span class="dim">nenhum (|σ| ≥ 1)</span>`;
  return `<section class="dp dp-flow"><h3><span>Fluxo (${esc(hk.toUpperCase())})</span><button class="fs-open" data-tab="flow" title="Abrir a aba Fluxo">abrir ›</button></h3>
    <div class="fs-tone ${TONE_CLS[sum.tone.id]}"><b>${esc(sum.tone.label)}</b> <span>${fmtZ(sum.tone.z)}</span> <span class="dim">${esc(sum.phase.title)}</span></div>
    ${row("Saindo de", "dn", sum.out, "nenhuma saída relevante")}
    ${row("Entrando em", "up", sum.into, "nenhuma entrada relevante")}
    <table class="fs-groups">${top}</table>
    <div class="fs-list"><span class="fs-lab up">Fortes</span>${assets(sum.candidates, "up")}</div>
    <div class="fs-list"><span class="fs-lab dn">Fracos</span>${assets(sum.weak, "dn")}</div>
    <p class="dn-note">Grupos em σ da volatilidade de 60 pregões; % = parcela em alta; ◆ = volume acima de 1,5x. Fluxo inferido por preço e volume, não por captação. Pauta de estudo, não recomendação.</p></section>`;
}
