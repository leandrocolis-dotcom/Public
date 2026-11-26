// Posição histórica da Carteira (puro, testado). Fotos diárias completas em pendulo_broker_daily (uma por
// dia de Brasília: a última leitura do BTG do dia; dia sem leitura leva a foto anterior às 23h59, "carried")
// + totais antigos de pendulo_broker_hist para os dias anteriores à foto completa. Ver docs/BTG-PONTE.md.
import { brokerView } from "./btg.js";
import { cls, esc, fmtDT, num } from "./format.js";
import { perfCard, perfOnDay, perfRows } from "./offshore-perf.js";

const fin = (x) => (Number.isFinite(+x) && x !== null && x !== "" ? +x : null);

/** Data de Brasília (AAAA-MM-DD) de um instante. */
export function brDay(t) {
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Soma dias a AAAA-MM-DD. */
export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Índice dos dias com dado, do mais antigo ao mais novo: { day, row, total, carried, asOf }.
 * row = foto completa (formato de pendulo_broker); dias só com total (hist) têm row null.
 */
export function historyIndex(daily = [], hist = []) {
  const by = new Map();
  for (const h of hist ?? []) {
    const at = Date.parse(h.as_of ?? h.asOf);
    const brl = fin(h.total_brl ?? h.totalBrl);
    const day = brDay(at);
    if (!day || brl == null) continue;
    const cur = by.get(day);
    if (!cur || at >= cur.at) by.set(day, { day, row: null, total: brl, carried: false, at });
  }
  for (const r of daily ?? []) {
    const day = r.day ?? brDay(r.as_of ?? r.asOf);
    const at = Date.parse(r.as_of ?? r.asOf);
    if (!day || !r.summary) continue;
    const row = { asOf: r.as_of ?? r.asOf, summary: r.summary, status: "ok" };
    const v = brokerView(row, at);
    by.set(day, { day, row, total: v?.totalBrl ?? null, carried: !!r.carried, at });
  }
  return [...by.values()]
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map(({ day, row, total, carried, at }) => ({ day, row, total, carried, asOf: Number.isFinite(at) ? new Date(at) : null })); // prettier-ignore
}

/**
 * Relatório do dia escolhido. Sem dado no dia, vale a última foto antes dele (como o extrato: a posição
 * de sábado é a de sexta). Devolve null se não há nada até aquela data.
 */
export function dayReport(index, day) {
  if (!index?.length || !day) return null;
  let k = -1;
  for (let i = 0; i < index.length; i++) if (index[i].day <= day) k = i;
  if (k < 0) return null;
  const e = index[k];
  const prev = k > 0 ? index[k - 1] : null;
  const v = e.row ? brokerView(e.row, e.asOf?.getTime() ?? Date.now()) : null;
  const d = e.total != null && prev?.total != null ? e.total - prev.total : null;
  // preço de cada ativo do exterior contra a foto completa anterior (variação de preço, sem fluxo)
  const prevFull = index
    .slice(0, k)
    .reverse()
    .find((x) => x.row);
  const prevPx = new Map((prevFull?.row?.summary?.offshore?.positions ?? []).map((p) => [p.sym, fin(p.price)])); // prettier-ignore
  if (v)
    for (const p of v.positions) {
      const pp = prevPx.get(p.sym);
      p.chg = pp > 0 && p.price != null ? p.price / pp - 1 : null;
    }
  return {
    day,
    shown: e.day,
    exact: e.day === day,
    entry: e,
    v,
    total: e.total,
    prev,
    prevFullDay: prevFull?.day ?? null,
    d,
    pct: d != null && prev.total > 0 ? d / prev.total : null,
    first: index[0].day,
    last: index.at(-1).day,
  };
}

const brl = (x, d = 2) => (x == null ? "–" : `${x < 0 ? "−" : ""}R$ ${num(Math.abs(x), d)}`);
const usd = (x, d = 2) => (x == null ? "–" : `${x < 0 ? "−" : ""}US$ ${num(Math.abs(x), d)}`);
const sgn = (x, f) => (x == null ? "–" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${f(Math.abs(x))}`);
const sPct = (x, d = 2) => sgn(x, (a) => `${num(a * 100, d)}%`);
const pctTxt = (x, d = 1) => (x == null ? "–" : `${num(x * 100, d)}%`);
const brDate = (day) => (day ? day.split("-").reverse().join("/") : "–");
const weekday = (day) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" });
const two = (top, bottom, tone = "") =>
  `<span class="c2 ${tone}">${top}</span><small class="c2s ${tone}">${bottom}</small>`;

/**
 * Cartão "Posição histórica": barra de data (◀ data ▶, Hoje) e, com um dia escolhido, patrimônio,
 * variação contra o dia anterior, resultado e as posições daquela foto (preços da foto, sem ao vivo).
 * sel: AAAA-MM-DD ou null (= hoje). today: AAAA-MM-DD de Brasília.
 */
export function historyCard(index, sel, today, perf = null) {
  const n = index?.length ?? 0;
  const full = (index ?? []).filter((x) => x.row).length;
  const perfMin = perf?.monthly?.[0]?.day ?? perf?.daily?.[0]?.day ?? null;
  const min = [n ? index[0].day : today, perfMin].filter(Boolean).sort()[0];
  const day = sel ?? today;
  const bar = `<div class="pf-hist-bar">
    <span class="lab">📅 Posição histórica</span>
    <span class="pf-hist-nav">
      <button class="btn small" data-action="pf-day" data-step="-1" aria-label="Dia anterior" ${day <= min ? "disabled" : ""}>◀</button>
      <input type="date" id="pfDay" value="${day}" min="${min}" max="${today}" aria-label="Escolher a data da posição">
      <button class="btn small" data-action="pf-day" data-step="1" aria-label="Dia seguinte" ${day >= today ? "disabled" : ""}>▶</button>
      ${day !== today ? `<button class="btn small" data-action="pf-day" data-step="0">Hoje</button>` : ""}
    </span>
  </div>`; // prettier-ignore
  const note = `<small class="muted">${n ? `${n} dia${n > 1 ? "s" : ""} guardado${n > 1 ? "s" : ""} desde ${brDate(min)} (${full} com posições; os demais só com o total)` : "Nenhuma foto guardada ainda"} · uma foto por dia, a última leitura do BTG; às 23h59 o dia fecha com a foto vigente.</small>`; // prettier-ignore
  const r = dayReport(index, day);
  // exterior pelo desempenho do BTG (pendulo_offshore_perf): retorno do dia sem aportes, ou o último saldo até a data
  const pd = perf ? perfOnDay(perf, day) : null;
  const perfDay = pd
    ? pd.exact
      ? `<p class="pf-hist-perf">🌎 <b>Exterior no dia</b> (BTG, sem aportes e saques): <b class="${cls(pd.r)}">${sPct(pd.r)}</b> · ${sgn(pd.pl, (a) => `US$ ${num(a, 0)}`)}${pd.bench.Nasdaq != null ? ` · Nasdaq ${sPct(pd.bench.Nasdaq)}` : ""} · saldo ${usd(pd.bal, 0)}${pd.flowIn || pd.flowOut ? ` · aportes US$ ${num(pd.flowIn, 0)}, saques US$ ${num(pd.flowOut, 0)}` : ""}</p>`
      : `<p class="pf-hist-perf">🌎 <b>Exterior</b>: saldo ${usd(pd.bal, 0)} em ${brDate(pd.day)} (último dado do BTG até esta data).</p>`
    : ""; // prettier-ignore
  if (!r)
    return `<section class="card pf-hist" aria-label="Posição histórica">${bar}<p class="pf-hist-when"><b>${weekday(day)} ${brDate(day)}</b></p>${perfDay}<p class="muted">Sem foto das posições até ${brDate(day)}: elas são guardadas desde ${brDate(index?.[0]?.day ?? today)}.</p>${note}</section>`; // prettier-ignore
  const v = r.v;
  const head = `<p class="pf-hist-when"><b>${weekday(r.day)} ${brDate(r.day)}</b>${r.exact ? "" : ` · sem leitura neste dia: vale a foto de ${brDate(r.shown)}`}${r.entry.carried ? " · dia sem leitura (foto anterior mantida)" : ""}${r.entry.asOf ? ` · foto do BTG de ${fmtDT(r.entry.asOf)}` : ""}</p>`; // prettier-ignore
  const chg = r.d != null
    ? `<small><b class="${cls(r.d)}">${sPct(r.pct)}</b> · ${sgn(r.d, (a) => `R$ ${num(a, 0)}`)} desde ${brDate(r.prev.day)}</small>`
    : `<small class="muted">sem dia anterior guardado</small>`; // prettier-ignore
  const k = (lab, val, sub, tone = "") =>
    `<div class="pf-k"><span class="lab">${lab}</span><b class="${tone}">${val}</b>${sub}</div>`;
  const kpis = `<div class="pf-hist-kpis">
    ${k("Patrimônio", brl(r.total, 0), chg)}
    ${v ? k("🇧🇷 Brasil", brl(v.onshore, 0), v.onPL != null ? `<small><span class="${cls(v.onPL)}">${sgn(v.onPL, (a) => `R$ ${num(a, 0)}`)}</span> rendimento · ${sPct(v.onPLPct)}</small>` : `<small>${v.items.length} produtos</small>`) : ""}
    ${v ? k("🌎 Exterior", usd(v.offLiveUsd, 0), `<small>${v.offPLPct != null ? `<span class="${cls(v.offPL)}">${sPct(v.offPLPct)}</span> s/ custo · ` : ""}dólar ${num(v.fx, 4)}</small>`) : ""}
  </div>`; // prettier-ignore
  if (!v)
    return `<section class="card pf-hist" aria-label="Posição histórica">${bar}${head}${kpis}${perfDay}<p class="muted">Neste dia só o total foi guardado (antes da foto diária completa, criada em 25/11/2026).</p>${note}</section>`; // prettier-ignore
  const offRows = v.positions
    .map((p) => `<tr><td class="c-sym"><span class="tk">${esc(p.sym)}</span></td>
      <td class="num">${two(num(p.qty, 4), num(p.avg, 2))}</td>
      <td class="num">${two(num(p.price, 2), p.chg != null ? `<span class="${cls(p.chg)}">${sPct(p.chg)}</span>` : "–")}</td>
      <td class="num">${two(usd(p.value, 0), pctTxt(v.offLiveUsd > 0 && p.value != null ? p.value / v.offLiveUsd : null))}</td>
      <td class="num">${two(sgn(p.pl, (a) => `US$ ${num(a, 0)}`), sPct(p.plPct, 1), cls(p.pl))}</td></tr>`)
    .join(""); // prettier-ignore
  const onRows = v.items
    .map((i) => `<tr><td class="c-sym"><span class="tk pf-prod">${esc(i.name)}</span><small class="c2s nm">${esc(i.kind)}${i.due ? ` · vence ${esc(i.due)}` : ""}</small></td>
      <td class="num">${i.cost != null ? brl(i.cost, 0) : "–"}</td>
      <td class="num">${two(brl(i.value, 0), pctTxt(i.wLocal))}</td>
      <td class="num">${i.pl != null ? two(sgn(i.pl, (a) => `R$ ${num(a, 0)}`), sPct(i.plPct, 1), cls(i.pl)) : "–"}</td></tr>`)
    .join(""); // prettier-ignore
  const tables = `<div class="tw"><table class="pf-hist-t"><thead><tr><th>🌎 Ativo</th><th class="num">Qtd · PM</th><th class="num">Preço · ${r.prevFullDay ? `vs ${brDate(r.prevFullDay).slice(0, 5)}` : "dia"}</th><th class="num">Valor · peso</th><th class="num">Resultado</th></tr></thead><tbody>${offRows}
      <tr><td>Caixa</td><td></td><td></td><td class="num">${usd(v.cashUsd, 0)}</td><td></td></tr></tbody>
      <tfoot><tr><td><b>Total</b></td><td></td><td></td><td class="num"><b>${usd(v.offLiveUsd, 0)}</b></td><td class="num">${two(sgn(v.offPL, (a) => `US$ ${num(a, 0)}`), sPct(v.offPLPct, 1), cls(v.offPL))}</td></tr></tfoot></table></div>
    <div class="tw"><table class="pf-hist-t"><thead><tr><th>🇧🇷 Produto</th><th class="num">Aplicado</th><th class="num">Valor · peso</th><th class="num">Rendimento</th></tr></thead><tbody>${onRows}</tbody>
      <tfoot><tr><td><b>Total</b></td><td></td><td class="num"><b>${brl(v.onshore, 0)}</b></td><td class="num">${v.onPL != null ? two(sgn(v.onPL, (a) => `R$ ${num(a, 0)}`), sPct(v.onPLPct, 1), cls(v.onPL)) : ""}</td></tr></tfoot></table></div>`; // prettier-ignore
  return `<section class="card pf-hist" aria-label="Posição histórica">${bar}${head}${kpis}${perfDay}${tables}<p class="pf-note">Valores da foto do BTG daquele dia (sem preço ao vivo). Variação do patrimônio inclui aportes, resgates e câmbio · não é recomendação.</p>${note}</section>`; // prettier-ignore
}

/** Carteira › Histórico: a posição do dia escolhido (hoje por padrão). */
export function viewPortfolioHistory({
  daily = [],
  hist = [],
  hasBroker = false,
  day = null,
  perf = [],
  now = Date.now(),
} = {}) {
  const ix = historyIndex(daily, hist);
  const pr = perfRows(perf);
  const hasPerf = pr.monthly.length > 0 || pr.daily.length > 0;
  if (!hasBroker && !ix.length && !hasPerf)
    return `<div class="card empty"><h2>Sem histórico ainda</h2><p class="muted">A posição histórica usa as fotos da conta BTG (uma por dia). Entre na nuvem em Configurações › Conta e atualize o BTG na aba Posições.</p></div>`; // prettier-ignore
  return historyCard(ix, day, brDay(now), hasPerf ? pr : null) + (hasPerf ? perfCard(pr) : "");
}
