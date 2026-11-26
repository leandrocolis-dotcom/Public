// Mercados › Onshore (Brasil): Macro, Agenda e Fluxo, as mesmas telas do lado Offshore com dados do Brasil.
// Visão geral fica em local-view.js e Notícias reaproveita news-view.js (região "br").
import { esc, num } from "./format.js";
import { IMPACT_PT } from "./calendar.js";
import { BR_KIND_PT, brKindOf } from "./macro-alerts.js";
import { BR_PILLARS, brFlow, tick } from "./br.js";
import { BR_UNI } from "./br-flow.js";
import { flowSnapshot } from "./flow-engine.js";
import { viewFlow } from "./flow-view.js";

const CLOCK = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
const DAY = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }); // prettier-ignore
const KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const clock = (t) => (t ? CLOCK.format(new Date(t * 1000)) : "–");
const whenOf = (e) => (e.t ? `${DAY.format(new Date(e.t * 1000))} ${clock(e.t)}` : e.date.split("-").reverse().join("/")); // prettier-ignore
const IMP_RANK = { holiday: 3, high: 3, medium: 2, low: 1 };
const numOf = (s) => {
  const m = String(s ?? "")
    .replace(/,/g, "")
    .match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const actualCls = (a, f) => {
  const x = numOf(a);
  const y = numOf(f);
  return x == null || y == null || x === y ? "" : x > y ? "pos" : "neg";
};
const seg = (key, cur, opts) =>
  `<span class="seg cal-seg" role="group">${opts.map(([v, l]) => `<button data-setpref="${key}" data-val="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</span>`;
const pctTxt = (c) =>
  Number.isFinite(c) ? `${c > 0 ? "+" : c < 0 ? "−" : ""}${num(Math.abs(c) * 100, 2)}%` : "–";
const tone = (x) => (!Number.isFinite(x) || Math.abs(x) < 1e-9 ? "" : x > 0 ? "pos" : "neg");

const mTone = (x) => (x == null ? "" : x > 0.25 ? "pos" : x < -0.25 ? "neg" : "muted");
const mSgn = (x, d = 2) => (x == null ? "–" : `${x > 0 ? "+" : ""}${num(x, d)}`);
const mBar = (x, max = 2.5) =>
  `<span class="mc-bar"><i style="left:50%;width:${Math.min(50, (Math.abs(x ?? 0) / max) * 50)}%;${(x ?? 0) < 0 ? "transform:translateX(-100%);background:var(--sell)" : "background:var(--buy)"}"></i></span>`; // prettier-ignore
const dBR = (d) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : (d ?? "")); // prettier-ignore

export function macroHtml(m, err) {
  if (!m?.indicators?.length)
    return `<section class="card" style="margin-top:12px"><h2>Macro Brasil</h2><p class="muted">${err ? `Banco Central indisponível agora (${esc(err)}).` : "Carregando dados do Banco Central (SGS e Focus)…"}</p></section>`; // prettier-ignore
  const cards = Object.entries(BR_PILLARS)
    .map(([k, label]) => {
      const inds = m.indicators.filter((x) => x.pillar === k);
      if (!inds.length) return "";
      const p = m.pillars?.[k]?.score ?? null;
      return `<details class="card mc-pil" open><summary><h3 style="display:inline">${esc(label)}</h3> <b class="${mTone(p)}">${mSgn(p)}</b> ${mBar(p)}</summary>
        <div class="tw" style="box-shadow:none"><table><tbody>${inds
          .map(
            (x) =>
              `<tr><td>${esc(x.label)}<div class="muted small">${esc(x.read)}${x.date ? ` · ${esc(dBR(x.date))}` : ""}</div></td><td class="num">${num(x.value, 2)} <span class="muted small">${esc(x.unit)}</span></td><td class="num ${mTone(x.score)}">${mSgn(x.score)}</td><td>${x.score == null ? "" : mBar(x.score)}</td></tr>`,
          )
          .join("")}</tbody></table></div></details>`;
    })
    .join("");
  const o = m.overall;
  return `<section class="card mc-head" style="margin-top:12px"><div class="mc-score"><span class="mc-n ${o > 15 ? "pos" : o < -15 ? "neg" : ""}">${o == null ? "–" : mSgn(o, 0)}</span><span class="muted small">nota macro Brasil<br>para a bolsa (−100 a +100)</span></div>
      <div><h2 style="margin:0">Macro Brasil</h2><p class="muted" style="margin:4px 0">Juros reais, inflação contra a meta de 3%, atividade, emprego e dívida, com as expectativas do Boletim Focus. Cada indicador vai de −2,5 a +2,5 (+ é bom para ações); a nota é a média dos pilares.</p></div></section>
    <div class="mc-grid">${cards}</div>
    <p class="note">Fontes: Banco Central (SGS: Selic, CDI, IPCA, IGP-M, IBC-Br, PNAD, dívida bruta; Focus: mediana do mercado). Atualizado ${esc(new Date(m.fetched_at).toLocaleString("pt-BR"))}.${m.errors?.length ? ` Falhas: ${esc(m.errors.join("; "))}.` : ""}</p>`;
}

/** Divulgados do Brasil (projeção × resultado), do mais novo ao mais antigo, com filtro de tipo. */
function releasedHtml(
  list,
  kind = "all",
  { open = false, title = "Últimos dados divulgados do Brasil" } = {},
) {
  const rows = (list ?? []).filter((e) => kind === "all" || brKindOf(e.id) === kind);
  const body = rows
    .map(
      (e) => `<tr><td class="nowrap">${esc(whenOf(e))}</td><td>${esc(e.label)}${e.name && e.name !== e.label ? ` <span class="muted cal-orig">${esc(e.name)}</span>` : ""}</td><td class="num"><b class="${actualCls(e.actual, e.consensus)}">${esc(e.actual)}</b></td><td class="num">${esc(e.consensus ?? "–")}</td><td class="num">${esc(e.previous ?? "–")}</td></tr>`,
    )
    .join(""); // prettier-ignore
  return `<details class="card" ${open ? "open" : ""}><summary><h2 style="display:inline">${esc(title)}</h2> <span class="muted">(${(list ?? []).length})</span></summary>
    <div class="cal-filters"><span class="muted">Tipo</span>${seg("brCalKind", kind, [["all", "Todos"], ...Object.entries(BR_KIND_PT)])}</div>
    ${body ? `<div class="table-wrap"><table class="cal-table"><thead><tr><th>Quando</th><th>Indicador</th><th>Atual</th><th>Projeção</th><th>Anterior</th></tr></thead><tbody>${body}</tbody></table></div>` : `<p class="muted">Nenhum dado divulgado com esse filtro.</p>`}
    <p class="note">Horário de Brasília. Verde: acima da projeção; vermelho: abaixo (acima nem sempre é bom: inflação acima da projeção pesa na bolsa). Fonte: Nasdaq.</p>
  </details>`;
}

/**
 * Mercados › Onshore › Macro: nota macro do Brasil (BCB/SGS e Focus) + dados divulgados × projeção.
 * ctx: { macro, error, cal, kind }
 */
export function viewBrMacro(ctx) {
  const cal = ctx.cal;
  const rel = cal ? releasedHtml(cal.released, ctx.kind ?? "all", { open: true, title: "Agenda do Brasil: divulgados × projeção" }) : `<section class="card"><p class="muted">Carregando os dados divulgados do Brasil…</p></section>`; // prettier-ignore
  return `${macroHtml(ctx.macro, ctx.error)}${rel}<p class="note">Próximas divulgações em Mercados › Onshore › Agenda. <button class="linkish" data-tab="brcal">Abrir a agenda do Brasil</button></p>`;
}

/**
 * Mercados › Onshore › Agenda: indicadores do Brasil da semana (Copom, IPCA, PIB, emprego…) + resultados e
 * dividendos das ações da B3 + histórico dos divulgados. ctx: { cal, min, kind, now }
 */
export function viewBrCalendar(ctx) {
  const { cal, min = "medium" } = ctx;
  const now = ctx.now ?? Date.now() / 1000;
  if (!cal) return `<div class="card empty">Carregando a agenda do Brasil…</div>`;
  const today = KEY.format(new Date(now * 1000));
  const floor = IMP_RANK[min] ?? 0;
  const ev = (cal.events ?? []).filter(
    (e) => (IMP_RANK[e.impact] ?? 1) >= floor && (e.t == null || e.t >= now || KEY.format(new Date(e.t * 1000)) === today),
  ); // prettier-ignore
  const next = ev.find((e) => e.t >= now);
  const days = [];
  for (const e of ev) {
    const key = e.t ? KEY.format(new Date(e.t * 1000)) : e.date;
    let g = days.at(-1);
    if (!g || g.key !== key) days.push((g = { key, label: e.t ? DAY.format(new Date(e.t * 1000)) : e.date.split("-").reverse().join("/"), items: [] })); // prettier-ignore
    g.items.push(e);
  }
  const rows = days
    .map(
      (g) => `<tr class="cal-day"><th colspan="6">${esc(g.label)}</th></tr>${g.items
        .map(
          (e) => `<tr class="cal-ev ${e.t && e.t < now ? "past" : ""} ${e === next ? "next" : ""}">
          <td class="num">${clock(e.t)}</td>
          <td><span class="cal-imp ${e.impact}" title="Impacto ${IMPACT_PT[e.impact]}">${IMPACT_PT[e.impact]}</span></td>
          <td>${esc(e.label)}${e.name !== e.label ? `<span class="muted cal-orig"> ${esc(e.name)}</span>` : ""}</td>
          <td class="num">${e.actual ? `<b class="${actualCls(e.actual, e.consensus)}">${esc(e.actual)}</b>` : "–"}</td><td class="num">${esc(e.consensus ?? "–")}</td><td class="num">${esc(e.previous ?? "–")}</td></tr>`,
        )
        .join("")}`,
    )
    .join(""); // prettier-ignore
  const corp = (cal.corporate ?? [])
    .map(
      (c) => `<tr><td class="num">${DAY.format(new Date(c.t * 1000))}</td><td><button class="linklike" data-sym="${esc(c.sym)}">${esc(tick(c.sym))}</button></td>
        <td>${c.kind === "earnings" ? `Resultado${c.estimated ? ' <span class="muted">(data estimada)</span>' : ""}` : "Pagamento de dividendo"}</td><td class="muted">${esc(c.name ?? "")}</td></tr>`,
    )
    .join(""); // prettier-ignore
  const risk = next && next.impact === "high" && next.t - now < 3 * 3600 ? `<div class="card cal-risk" role="status"><b>⚠ ${esc(next.label)} às ${clock(next.t)}</b>: perto da divulgação, Ibovespa, dólar e juros futuros podem saltar.</div>` : ""; // prettier-ignore
  return `${risk}<section class="card"><h2>Agenda econômica do Brasil</h2>
    <p class="muted">Horário de Brasília. Daqui para a frente, mais o que já saiu hoje. Fonte: Nasdaq (projeção e valor divulgado); a Forex Factory, usada na agenda Offshore, não cobre o Brasil. Copom, IPCA e PIB têm impacto alto.</p>
    <div class="cal-filters"><span class="muted">Impacto</span>${seg("brCalMin", min, [
      ["high", "Alto"],
      ["medium", "Médio+"],
      ["all", "Todos"],
    ])}</div>
    ${ev.length ? `<div class="table-wrap"><table class="cal-table"><thead><tr><th>Hora</th><th>Impacto</th><th>Evento</th><th>Atual</th><th>Projeção</th><th>Anterior</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="muted">Nenhum evento do Brasil com esse filtro nos próximos dias.</p>`}
    ${cal.errors?.length ? `<p class="note">Fonte com falha: ${esc(cal.errors.join(" · "))}</p>` : ""}
  </section>
  <section class="card"><h2>Resultados e dividendos (ações da B3)</h2>
    ${corp ? `<div class="table-wrap"><table class="cal-table"><thead><tr><th>Data</th><th>Ativo</th><th>Evento</th><th></th></tr></thead><tbody>${corp}</tbody></table></div>` : `<p class="muted">Nenhum resultado ou dividendo nos próximos 60 dias para as ações acompanhadas e as da sua carteira.</p>`}
    <p class="note">Datas do Yahoo Finance; "estimada" quando a empresa ainda não confirmou.</p>
  </section>
  ${releasedHtml(cal.released, ctx.kind ?? "all")}`;
}

const pBar = (x, max) =>
  `<span class="mc-bar"><i style="left:50%;width:${Math.min(50, (Math.abs(x ?? 0) / (max || 1)) * 50)}%;${(x ?? 0) < 0 ? "transform:translateX(-100%);background:var(--sell)" : "background:var(--buy)"}"></i></span>`; // prettier-ignore
const rvTxt = (rv) => (rv == null ? "–" : `${num(rv, 1)}×`);

/** Linha de um ponto do estudo: média em bps e acerto. */
const bps = (x) =>
  x == null ? "–" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${num(Math.abs(x), 0)} bps`;
const hit = (x) => (x == null ? "–" : `${num(x * 100, 0)}%`);

/** Ponto do estudo mais perto da hora do pregão (fora do pregão: o fechamento, que mede o dia seguinte). */
export function studyPoint(study, frac, open) {
  const cps = study?.checkpoints ?? [];
  if (!cps.length) return null;
  const f = open ? frac : 1;
  return cps.reduce((a, b) => (Math.abs(b.frac - f) < Math.abs(a.frac - f) ? b : a));
}

/**
 * Veredito automático do estudo, sem exagero: só chama de vantagem o que tem t ≥ 2 (o resto é ruído com ~60 pregões).
 * Lê o dia (o estado do setor se mantém até o fechamento) × gatilho (fortes rendem mais / fracos rendem menos depois).
 */
export function studyVerdict(cp) {
  if (!cp) return "";
  const out = [];
  const up = cp.sectors?.up;
  const dn = cp.sectors?.down;
  if (cp.frac < 1 && up?.n >= 20 && dn?.n >= 20 && up.cont >= 0.7 && dn.cont >= 0.7)
    out.push(
      "Serve para ler o dia: o estado dos setores a esta hora costuma se manter até o fechamento",
    );
  const sig = (x, k) => x?.n >= 30 && Math.abs(x[k] ?? 0) >= 2;
  const edges = [];
  if (cp.frac < 1 && sig(cp.cand, "restT"))
    edges.push(
      cp.cand.restBps > 0
        ? "fortes seguem rendendo mais até o fechamento"
        : "fortes devolvem até o fechamento",
    );
  if (sig(cp.cand, "nextT"))
    edges.push(
      cp.cand.nextBps > 0
        ? "fortes rendem mais no dia seguinte"
        : "fortes devolvem no dia seguinte",
    );
  if (cp.frac < 1 && sig(cp.weak, "restT"))
    edges.push(
      cp.weak.restBps < 0
        ? "fracos seguem caindo até o fechamento"
        : "fracos repicam até o fechamento",
    );
  if (sig(cp.weak, "nextT"))
    edges.push(
      cp.weak.nextBps < 0
        ? "fracos seguem perdendo no dia seguinte"
        : "fracos repicam no dia seguinte",
    );
  if (edges.length) out.push(`Com significância (t ≥ 2): ${edges.join("; ")}`);
  else {
    const rebound = (cp.weak?.nextBps ?? 0) > 0 && (cp.weak?.nextT ?? 0) >= 1;
    out.push(`Como gatilho de entrada ainda não há vantagem comprovada (nenhuma diferença com t ≥ 2)${rebound ? "; os fracos tenderam a repicar no dia seguinte, então vender só porque está fraco não se pagou" : ""}`); // prettier-ignore
  }
  return `${out.join(". ")}.`;
}

/** Uma frase com o que o estudo mediu para a fase atual (vai dentro do "Fluxo agora"). */
export function studyLine(study, frac, open) {
  const cp = studyPoint(study, frac, open);
  if (!cp) return "";
  const up = cp.sectors?.up;
  const c = cp.cand;
  const w = cp.weak;
  const bits = [];
  if (cp.frac < 1 && up?.n)
    bits.push(
      `setores ganhando força terminaram o dia acima do Ibovespa em ${hit(up.cont)} das vezes`,
    );
  if (c?.n)
    bits.push(
      cp.frac < 1
        ? `ações fortes renderam ${bps(c.restBps)} além do Ibovespa até o fechamento (acerto ${hit(c.restHit)}) e ${bps(c.nextBps)} no dia seguinte`
        : `ações fortes no fechamento renderam ${bps(c.nextBps)} além do Ibovespa no dia seguinte (acerto ${hit(c.nextHit)})`,
    );
  if (w?.n) bits.push(`as fracas, ${bps(cp.frac < 1 ? w.restBps : w.nextBps)}`);
  if (!bits.length) return "";
  return `<p class="note"><b>Medido em ${num(study.days, 0)} pregões reais da B3 (${esc(cp.label)}):</b> ${esc(bits.join("; "))}. ${esc(studyVerdict(cp))} <a href="#brFlowStudy">Ver o estudo</a></p>`; // prettier-ignore
}

/** Cartão com a assertividade medida do Fluxo agora em cada hora do pregão (data/br-flow-study.json). */
function studyCard(study) {
  if (!study?.checkpoints?.length) return "";
  const rows = study.checkpoints
    .map((cp) => {
      const mid = cp.frac < 1;
      const s = cp.sectors ?? {};
      return `<tr><td>${esc(cp.label)}</td>
        <td class="num">${mid ? `${hit(s.up?.cont)} <span class="muted small">(${s.up?.n ?? 0})</span>` : "–"}</td>
        <td class="num">${mid ? `${hit(s.down?.cont)} <span class="muted small">(${s.down?.n ?? 0})</span>` : "–"}</td>
        <td class="num ${tone(cp.cand?.restBps)}">${mid ? bps(cp.cand?.restBps) : "–"}</td>
        <td class="num ${tone(cp.cand?.nextBps)}">${bps(cp.cand?.nextBps)} <span class="muted small">${hit(cp.cand?.nextHit)} · ${cp.cand?.n ?? 0}</span></td>
        <td class="num ${tone(cp.weak?.restBps)}">${mid ? bps(cp.weak?.restBps) : "–"}</td>
        <td class="num ${tone(cp.weak?.nextBps)}">${bps(cp.weak?.nextBps)} <span class="muted small">${hit(cp.weak?.nextHit)} · ${cp.weak?.n ?? 0}</span></td></tr>`;
    })
    .join("");
  return `<details class="card" id="brFlowStudy" style="margin-top:12px"><summary><h2 style="display:inline">Assertividade do Fluxo agora (dados reais da B3)</h2> <span class="muted">${num(study.days, 0)} pregões · ${esc(dBR(study.from))} a ${esc(dBR(study.to))}</span></summary>
    ${(() => {
      const m = studyPoint(study, 0.5, true);
      return m ? `<p><b>Leitura (meio do pregão):</b> ${esc(studyVerdict(m))}</p>` : "";
    })()}
    <div class="tw" style="box-shadow:none"><table><thead><tr><th>Hora do pregão</th><th class="num">Setor ganhando força fecha acima do Ibov</th><th class="num">Setor perdendo força fecha abaixo</th><th class="num">Fortes: resto do dia</th><th class="num">Fortes: dia seguinte</th><th class="num">Fracos: resto do dia</th><th class="num">Fracos: dia seguinte</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Refaz, com barras de 5 minutos do Yahoo, a leitura desta tela em cada hora de cada pregão (mesmo motor: σ de 60 pregões, volume relativo pela curva de volume do dia) e mede o que veio depois, sempre em excesso sobre o Ibovespa. "Fortes" e "fracos" são as listas de observar entrada e de evitar; bps = centésimos de ponto percentual, médias por ação; % = acerto (fortes acima do Ibovespa, fracos abaixo); entre parênteses e depois do acerto, quantos casos. Só conta como vantagem o que tem t ≥ 2. ${study.base ? `Referência (todas as ações): resto do dia ${bps(study.base.restBps)}, dia seguinte ${bps(study.base.nextBps)}.` : ""} Estudo semanal (scripts/br-flow-study.mjs); passado não garante o futuro.</p>
  </details>`;
}

/**
 * Mercados › Onshore › Fluxo: o mesmo Fluxo do Offshore com a B3 (para onde vai o dinheiro, Fluxo agora com a fase
 * do pregão, mapa de calor, rotação relativa e replay; desenho em flow-view.js), mais o canal do estrangeiro (EWZ e
 * fluxo cambial do BCB) e a pressão por setor. ctx: contexto do fluxo (contexts.js brFlowCtx) + { br, cal, study }
 */
export function viewBrFlow(ctx) {
  const br = ctx.br ?? {};
  if (!ctx.flow) return `<div class="card empty">${br.errors?.hist ? `B3 indisponível agora: ${esc(br.errors.hist)}.` : "Carregando a B3…"}</div>`; // prettier-ignore
  const Q = ctx.quotes ?? {};
  const rows = flowSnapshot(ctx.flow, { horizon: "1d", sessionFrac: ctx.sessionFrac, uni: BR_UNI }).rows; // prettier-ignore
  const rv = Object.fromEntries(rows.filter((r) => r.relVol != null).map((r) => [r.sym, r.relVol]));
  const f = brFlow(ctx.flow.close, Q, { rv, share: ctx.sessionFrac });
  const max = Math.max(...f.sectors.map((s) => Math.abs(s.p)), 1e-9);
  const secRows = f.sectors
    .map(
      (s) => `<tr><td>${esc(s.label)}<div class="muted small">${s.lead ? `puxado por ${esc(tick(s.lead))}` : ""}</div></td><td class="num ${tone(s.c)}">${pctTxt(s.c)}</td><td class="num">${rvTxt(s.rv)}</td><td>${pBar(s.p, max)}</td><td class="num ${tone(s.rs1)}">${pctTxt(s.rs1)}</td><td class="num ${tone(s.rs5)}">${pctTxt(s.rs5)}</td><td class="num ${tone(s.rs20)}">${pctTxt(s.rs20)}</td></tr>`,
    )
    .join(""); // prettier-ignore
  const stockRow = (x) =>
    `<tr data-sr-open="${esc(x.sym)}" tabindex="0"><td>${esc(tick(x.sym))}</td><td class="num">${num(x.price, 2)}</td><td class="num ${tone(x.c)}">${pctTxt(x.c)}</td><td class="num">${rvTxt(x.rv)}</td></tr>`;
  const list = (arr, empty) =>
    arr.length ? `<div class="tw" style="box-shadow:none"><table><thead><tr><th>Ação</th><th class="num">Preço</th><th class="num">Dia</th><th class="num">Vol. rel.</th></tr></thead><tbody>${arr.map(stockRow).join("")}</tbody></table></div>` : `<p class="muted">${empty}</p>`; // prettier-ignore
  const top = f.sectors[0];
  const bot = f.sectors.at(-1);
  const gr = f.ewz;
  const grTxt =
    gr.c == null
      ? "–"
      : gr.c > 0 && (gr.rv ?? 1) >= 1
        ? "Entrando"
        : gr.c < 0 && (gr.rv ?? 1) >= 1
          ? "Saindo"
          : "Morno";
  const bar = `<div class="dash-bar">
    <div class="sb-item"><span class="l">Dinheiro entrando</span><b class="up">${top && top.p > 0 ? esc(top.label) : "–"}</b><span class="dim">${top ? `${pctTxt(top.c)} · vol. ${rvTxt(top.rv)}` : ""}</span></div>
    <div class="sb-item"><span class="l">Dinheiro saindo</span><b class="dn">${bot && bot.p < 0 ? esc(bot.label) : "–"}</b><span class="dim">${bot ? `${pctTxt(bot.c)} · vol. ${rvTxt(bot.rv)}` : ""}</span></div>
    <div class="sb-item"><span class="l">Volume da B3 hoje</span><b>${f.volDay == null ? "–" : `${num(f.volDay * 100, 0)}%`}</b><span class="dim">da média de 10 pregões até esta hora (${f.nVol} ações)</span></div>
    <button class="sb-item" data-sr-open="EWZ"><span class="l">Estrangeiro (EWZ em NY)</span><b class="${tone(gr.c) === "pos" ? "up" : tone(gr.c) === "neg" ? "dn" : ""}">${grTxt}</b><span class="dim">${pctTxt(gr.c)} · vol. ${rvTxt(gr.rv)}</span></button>
    <div class="sb-item"><span class="l">Ibovespa</span><b class="${tone(f.ibov) === "pos" ? "up" : tone(f.ibov) === "neg" ? "dn" : ""}">${pctTxt(f.ibov)}</b><span class="dim">no dia</span></div>
  </div>`;
  // fluxo cambial semanal do BCB e posição especulativa em real (CFTC): dinheiro de fora entrando ou saindo do país
  const lastOf = (base) =>
    (ctx.cal?.released ?? []).find((e) => String(e.id).split(":")[1] === base);
  const fx = lastOf("fx");
  const cftc = lastOf("cftc");
  const sideCard = (e, label, read) => {
    if (!e) return "";
    const a = numOf(e.actual);
    return `<div class="sb-item"><span class="l">${esc(label)}</span><b class="${a > 0 ? "up" : a < 0 ? "dn" : ""}">${esc(e.actual)}</b><span class="dim">${esc(read(a))} · anterior ${esc(e.previous ?? "–")} · ${esc(whenOf(e))}</span></div>`;
  }; // prettier-ignore
  const ext =
    fx || cftc
      ? `<section class="card"><h2>Dinheiro de fora (oficial)</h2><div class="dash-bar">${sideCard(fx, "Fluxo cambial (BCB, US$)", (a) => (a > 0 ? "entrada líquida de dólares" : a < 0 ? "saída líquida de dólares" : "estável"))}${sideCard(cftc, "Especuladores em real (CFTC)", (a) => (a > 0 ? "apostando no real" : a < 0 ? "apostando contra o real" : "neutros"))}</div><p class="note">Fluxo cambial: saldo semanal de dólares que entram e saem do Brasil (comercial + financeiro), do Banco Central. CFTC: contratos líquidos de fundos especulativos no futuro de real em Chicago. Fonte: Nasdaq. Detalhes em Agenda.</p></section>` // prettier-ignore
      : "";
  return `<div class="dash">${bar}
    ${ext}
    ${viewFlow(ctx)}
    ${studyCard(ctx.study)}
    <section class="card" style="margin-top:12px"><h2>Setores da B3: pressão de compra e venda</h2>
      ${secRows ? `<div class="tw" style="box-shadow:none"><table><thead><tr><th>Setor</th><th class="num">Dia</th><th class="num">Vol. rel.</th><th>Pressão</th><th class="num">× Ibov 1D</th><th class="num">× Ibov 5D</th><th class="num">× Ibov 20D</th></tr></thead><tbody>${secRows}</tbody></table></div>` : `<p class="muted">Sem dados dos setores ainda.</p>`}
      <p class="note">Pressão = variação do dia × volume relativo (até 3×): alta com volume é dinheiro entrando; queda com volume, saindo. "× Ibov" = quanto o setor andou acima ou abaixo do Ibovespa (rotação). Volume relativo = volume de hoje ÷ média de 20 pregões, contando só a parcela do volume que costuma sair até esta hora do pregão (o mesmo número do mapa de calor).</p>
    </section>
    <div class="home-grid2">
      <section class="card"><h2>Mais compradas (preço × volume)</h2>${list(f.inflow, "Nenhuma ação com pressão de compra agora.")}</section>
      <section class="card"><h2>Mais vendidas (preço × volume)</h2>${list(f.outflow, "Nenhuma ação com pressão de venda agora.")}</section>
    </div>
    <section class="card"><h2>Volume fora do normal (1,5× a média ou mais)</h2>${list(f.unusual, "Nenhuma ação com volume fora do normal agora.")}</section>
    <p class="note">Entre ${f.n} ações acompanhadas (as maiores de cada setor). Inferido por preço e volume do Yahoo (B3 com ~15 min de atraso); não é o fluxo oficial por tipo de investidor da B3. Material educacional; não é recomendação de investimento.</p>
  </div>`;
}
