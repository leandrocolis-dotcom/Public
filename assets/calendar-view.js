// Aba Agenda: eventos econômicos da semana + resultados e dividendos da carteira e das listas.
import { esc } from "./format.js";
import { CC_PT, IMPACT_PT, eventRisk, filterEvents, groupByDay } from "./calendar.js";
import { KIND_PT, REGION_PT, kindOf, num } from "./macro-alerts.js";
import { viewEarnings } from "./earnings-view.js";

const CLOCK = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
const DAY = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }); // prettier-ignore
const dayKey = (t) => KEY.format(new Date(t * 1000));
const KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const clock = (t) => CLOCK.format(new Date(t * 1000));
const actualCls = (e) => {
  const a = num(e.actual);
  const f = num(e.forecast);
  return a == null || f == null || a === f ? "" : a > f ? "pos" : "neg";
};
const HIST_CC = [["all", "Todos"], ["USD", "EUA"], ["EUR", "Zona do euro"], ["DE", "Alemanha"], ["GBP", "Reino Unido"], ["JPY", "Japão"], ["CNY", "China"]]; // prettier-ignore

/** Histórico recolhível dos últimos 50 dados divulgados, com filtro de país e de tipo. */
export function releasedHtml(list, { cc = "all", kind = "all", now = Date.now() / 1000 } = {}) {
  // alto impacto de hoje fica na agenda (com o valor); passa para o histórico a partir de amanhã
  const today = dayKey(now);
  const rows = (list ?? []).filter((e) => !(e.impact === "high" && e.t && dayKey(e.t) === today) && (cc === "all" || (e.sub ?? e.cc) === cc) && (kind === "all" || kindOf(e.id) === kind)); // prettier-ignore
  const when = (e) => (e.t ? `${DAY.format(new Date(e.t * 1000))} ${clock(e.t)}` : e.date.split("-").reverse().join("/")); // prettier-ignore
  const where = (e) => (REGION_PT[e.sub ?? e.cc] ?? "").replace(/^(nos|na|no) /, "");
  const body = rows
    .map(
      (e) => `<li class="cal-rel"><div class="cal-rel-t">${esc(e.label)}${e.name && !e.label.includes(e.name) ? ` <span class="muted cal-orig">${esc(e.name)}</span>` : ""}</div>
      <div class="cal-rel-v"><span class="muted">${when(e)} · ${esc(where(e))}</span> <span>Atual <b class="${actualCls({ actual: e.actual, forecast: e.consensus })}">${esc(e.actual)}</b></span> <span class="muted">Proj. ${esc(e.consensus ?? "–")} · Ant. ${esc(e.previous ?? "–")}</span></div></li>`,
    )
    .join(""); // prettier-ignore
  return `<details class="card" id="cal-released"><summary><h2 style="display:inline">Últimos dados divulgados</h2> <span class="muted">(${rows.length})</span></summary>
    <div class="cal-filters">
      <span class="muted">País</span>${seg("calHistCc", cc, HIST_CC)}
      <span class="muted">Tipo</span>${seg("calHistKind", kind, [["all", "Todos"], ...Object.entries(KIND_PT)])}
    </div>
    ${body ? `<ul class="cal-rel-list">${body}</ul>` : `<p class="muted">Nenhum dado divulgado com esse filtro.</p>`}
    <p class="note">Horário de Brasília. Verde: acima da projeção; vermelho: abaixo. Fonte: Nasdaq (projeção) e Yahoo Finance (valor no minuto da divulgação).</p>
  </details>`;
}
const CCS = ["USD", "EUR", "GBP", "JPY", "CNY", "CAD"];

const seg = (key, cur, opts) =>
  `<span class="seg cal-seg" role="group">${opts.map(([v, l]) => `<button data-setpref="${key}" data-val="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</span>`;

/** Aviso de evento próximo (usado também na aba Quando entrar). */
export function eventRiskHtml(events, now = Date.now() / 1000) {
  const r = eventRisk(events ?? [], now);
  if (!r.length) return "";
  const e = r[0];
  const when = e.inMin > 0 ? `em ${e.inMin} min (${clock(e.t)})` : e.inMin === 0 ? "agora" : `há ${-e.inMin} min`; // prettier-ignore
  return `<div class="card cal-risk" role="status"><b>⚠ Evento de alto impacto ${when}:</b> ${esc(e.titlePT)} (${esc(CC_PT[e.cc] ?? e.cc)})${r.length > 1 ? ` e mais ${r.length - 1}` : ""}. Perto da divulgação o preço pode saltar e furar stops; sinais intradiários ficam menos confiáveis. <button class="btn ghost" data-tab="calendar">Ver agenda</button></div>`; // prettier-ignore
}

/** Alternância da Agenda Offshore: agenda econômica × balanços de tecnologia por subtema. */
const viewSwitch = (cur) =>
  `<div class="cal-filters cal-view-switch">${seg("calView", cur, [
    ["eco", "📅 Agenda econômica"],
    ["earn", "💻 Balanços tech"],
  ])}</div>`;

/** ctx: { cal, min, ccs, now, view, earnings: { data, prefs, held } } */
export function viewCalendar(ctx) {
  if (ctx.view === "earn") return viewSwitch("earn") + viewEarnings(ctx.earnings ?? {});
  return viewSwitch("eco") + viewEconomic(ctx);
}

function viewEconomic(ctx) {
  const { cal, min = "medium", ccs = "USD,EUR,GBP,JPY,CNY" } = ctx;
  const now = ctx.now ?? Date.now() / 1000;
  if (!cal) return `<div class="card empty">Carregando a agenda…</div>`;
  const ccList = ccs === "all" ? null : ccs.split(",");
  // já passou: o que é de hoje fica na lista (com o valor divulgado ou "aguardando" enquanto a fonte não publica);
  // dias anteriores vão para "Últimos dados divulgados"
  const today = dayKey(now);
  const ev = filterEvents(cal.events ?? [], { ccs: ccList, min }).filter(
    (e) => e.t >= now || dayKey(e.t) === today,
  );
  const days = groupByDay(ev);
  const nextIdx = ev.findIndex((e) => e.t >= now);
  const next = nextIdx >= 0 ? ev[nextIdx] : null;
  const filters = `<div class="cal-filters">
    <span class="muted">Impacto</span>${seg("calMin", min, [["high", "Alto"], ["medium", "Médio+"], ["all", "Todos"]])}
    <span class="muted">Países</span>${seg("calCc2", ccs, [["USD", "EUA"], ["USD,EUR,GBP,JPY,CNY", "Principais"], ["all", "Todos"]])}
  </div>`; // prettier-ignore
  const rows = days
    .map(
      (g) => `<tr class="cal-day"><th colspan="7">${esc(g.label)}</th></tr>${g.items
        .map(
          (e) => `<tr class="cal-ev ${e.t < now ? "past" : ""} ${e === next ? "next" : ""}">
          <td class="num">${clock(e.t)}</td><td><span class="cal-cc">${esc(e.cc)}</span></td>
          <td><span class="cal-imp ${e.impact}" title="Impacto ${IMPACT_PT[e.impact]}">${IMPACT_PT[e.impact]}</span></td>
          <td>${esc(e.titlePT)}${e.titlePT !== e.title ? `<span class="muted cal-orig"> ${esc(e.title)}</span>` : ""}</td>
          <td class="num">${e.actual ? `<b class="${actualCls(e)}">${esc(e.actual)}</b>` : e.t < now ? `<span class="muted" title="Já saiu; o valor aparece assim que a fonte publica">aguardando</span>` : "–"}</td><td class="num">${esc(e.forecast ?? "–")}</td><td class="num">${esc(e.previous ?? "–")}</td></tr>`,
        )
        .join("")}`,
    )
    .join(""); // prettier-ignore
  const corp = (cal.corporate ?? [])
    .map(
      (c) => `<tr><td class="num">${DAY.format(new Date(c.t * 1000))}</td><td><button class="linklike" data-sym="${esc(c.sym)}">${esc(c.sym)}</button></td>
        <td>${c.kind === "earnings" ? `Resultado${c.estimated ? " <span class=\"muted\">(data estimada)</span>" : ""}` : "Pagamento de dividendo"}</td><td class="muted">${esc(c.name ?? "")}</td></tr>`,
    )
    .join(""); // prettier-ignore
  return `${eventRiskHtml(cal.events, now)}
  <section class="card"><h2>Agenda econômica</h2>
    <p class="muted">Horário de Brasília. Daqui para a frente, mais o que já saiu hoje (com o valor divulgado); dias anteriores ficam em "Últimos dados divulgados", no fim da página. Fonte: Forex Factory (faireconomy); valor divulgado (Atual) da Nasdaq, em verde acima e em vermelho abaixo da projeção. Ligue "Calendário macro" em Configurações → Avisos para receber o dado no celular assim que sair.</p>
    ${filters}
    ${ev.length ? `<div class="table-wrap"><table class="cal-table"><thead><tr><th>Hora</th><th>País</th><th>Impacto</th><th>Evento</th><th>Atual</th><th>Projeção</th><th>Anterior</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="muted">Nenhum evento com esse filtro.</p>`}
    ${cal.errors?.length ? `<p class="note">Fonte com falha: ${esc(cal.errors.join(" · "))}</p>` : ""}
  </section>
  <section class="card"><h2>Resultados e dividendos (carteira e listas)</h2>
    ${corp ? `<div class="table-wrap"><table class="cal-table"><thead><tr><th>Data</th><th>Ativo</th><th>Evento</th><th></th></tr></thead><tbody>${corp}</tbody></table></div>` : `<p class="muted">Nenhum resultado ou dividendo nos próximos 60 dias para os ativos da carteira e das listas.</p>`}
    <p class="note">Datas do Yahoo Finance; "estimada" quando a empresa ainda não confirmou. ETFs não divulgam resultado.</p>
  </section>
  ${releasedHtml(cal.released, { cc: ctx.histCc, kind: ctx.histKind, now })}`;
}

export { CCS };
