// Agenda › 💻 Balanços tech: próximos balanços das empresas de tecnologia por subtema, com o consenso do mercado,
// o histórico de surpresas e o comportamento do preço antes/depois de cada divulgação. Material educacional.
import { decSep, esc } from "./format.js";
import { SORTS, daysUntil, earningsView, setupOf } from "./earnings.js";

const DAYF = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }); // prettier-ignore
const day = (iso) => DAYF.format(new Date(`${iso}T12:00:00Z`));
const TIME_PT = {
  pre: "antes da abertura",
  post: "depois do fechamento",
  na: "horário a confirmar",
};
const SETUP_PT = { forte: "Histórico forte", neutro: "Neutro", fraco: "Histórico fraco" };

const pct = (x, d = 1) => (x == null ? "–" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(d).replace(".", decSep())}%`); // prettier-ignore
const cls = (x) => (x == null || x === 0 ? "" : x > 0 ? "pos" : "neg");
const eps = (x) => (x == null ? "–" : `US$ ${x.toFixed(2).replace(".", decSep())}`);
const cap = (x) => (x == null ? "–" : x >= 1e12 ? `US$ ${(x / 1e12).toFixed(1).replace(".", decSep())} tri` : `US$ ${Math.round(x / 1e9)} bi`); // prettier-ignore

const seg = (key, cur, opts) =>
  `<span class="seg cal-seg" role="group">${opts.map(([v, l]) => `<button data-setpref="${key}" data-val="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</span>`; // prettier-ignore

const until = (iso, today) => {
  const n = daysUntil(iso, today);
  return n === 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`;
};

const revisions = (n) => {
  const net = (n?.up ?? 0) - (n?.down ?? 0);
  if (!n?.up && !n?.down) return `<span class="muted">sem revisão</span>`;
  return `<span class="${cls(net)}">↑${n.up} ↓${n.down}</span>`;
};

const beats = (s) => (s.n ? `${s.beats}/${s.n}${s.avgSurprise != null ? ` <span class="muted">(${s.avgSurprise > 0 ? "+" : ""}${s.avgSurprise.toFixed(1).replace(".", decSep())}%)</span>` : ""}` : "–"); // prettier-ignore
const runTxt = (s) => (s.nRun ? `<span class="${cls(s.avgRun)}">${pct(s.avgRun)}</span> <span class="muted">${s.runUp}/${s.nRun} subiram</span>` : "–"); // prettier-ignore

const themeChips = (c) => c.themes.map((t) => `<span class="earn-chip">${esc(t)}</span>`).join("");
const tick = (c) =>
  `<button class="linklike" data-sym="${esc(c.sym)}"><b>${esc(c.sym)}</b></button>`;
const badge = (c) => {
  const s = setupOf(c);
  return `<span class="earn-setup ${s}" title="Combina revisões das últimas 4 semanas, surpresas e corrida antes dos últimos balanços">${SETUP_PT[s]}</span>`; // prettier-ignore
};

/** Cartão de destaque (próximos 7 dias). */
function card(c, today) {
  const n = c.next;
  return `<article class="earn-card">
    <header><div>${tick(c)} <span class="muted">${esc(c.name ?? "")}</span></div>${badge(c)}</header>
    <p class="earn-when"><b>${day(n.date)}</b> · ${until(n.date, today)} · ${TIME_PT[n.time] ?? TIME_PT.na}${n.estimated ? ` <span class="muted">(data estimada)</span>` : ""}</p>
    <div class="earn-chips">${themeChips(c)}</div>
    <dl class="earn-kv">
      <div><dt>Consenso LPA${n.fiscal ? ` (${esc(n.fiscal)})` : ""}</dt><dd>${eps(n.eps)}${n.low != null && n.high != null ? ` <span class="muted earn-sub">faixa ${(n.low ?? 0).toFixed(2).replace(".", decSep())} a ${(n.high ?? 0).toFixed(2).replace(".", decSep())}</span>` : ""}</dd></div>
      <div><dt>vs. ano anterior</dt><dd class="${cls(n.yoy)}">${pct(n.yoy, 0)}</dd></div>
      <div><dt>Revisões 4 sem.${n.ests ? ` · ${n.ests} analistas` : ""}</dt><dd>${revisions(n)}</dd></div>
      <div><dt>Bateu o consenso</dt><dd>${beats(c.stats)}</dd></div>
      <div><dt>Corrida 10 pregões antes</dt><dd>${runTxt(c.stats)}</dd></div>
      <div><dt>Reação média</dt><dd class="${cls(c.stats.avgReact)}">${pct(c.stats.avgReact)}</dd></div>
    </dl>
  </article>`;
}

function upcomingTable(list, today) {
  const rows = list
    .map((c) => {
      const n = c.next;
      return `<tr>
        <td class="num">${day(n.date)}<span class="muted earn-sub">${until(n.date, today)}${n.estimated ? " · estimada" : ""}</span></td>
        <td>${tick(c)}<span class="muted earn-sub">${esc(c.name ?? "")}${c.mcap ? ` · ${cap(c.mcap)}` : ""}</span></td>
        <td>${themeChips(c)}</td>
        <td class="num">${eps(n.eps)}<span class="muted earn-sub">${n.fiscal ? esc(n.fiscal) : ""}</span></td>
        <td class="num ${cls(n.yoy)}">${pct(n.yoy, 0)}</td>
        <td class="num">${revisions(n)}</td>
        <td class="num">${beats(c.stats)}</td>
        <td class="num">${runTxt(c.stats)}</td>
        <td class="num ${cls(c.stats.avgReact)}">${pct(c.stats.avgReact)}</td>
        <td>${badge(c)}</td></tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table class="cal-table earn-table"><thead><tr><th>Data</th><th>Empresa</th><th>Subtema</th><th>Consenso LPA</th><th>vs. ano ant.</th><th>Revisões</th><th>Bateu</th><th>Corrida pré</th><th>Reação</th><th>Leitura</th></tr></thead><tbody>${rows}</tbody></table></div>`; // prettier-ignore
}

function pastTable(list) {
  const rows = list
    .map(
      (p) => `<tr>
        <td class="num">${day(p.date)}</td>
        <td>${tick(p)}<span class="muted earn-sub">${esc(p.name ?? "")}</span></td>
        <td class="muted">${esc(p.fiscal ?? "")}</td>
        <td class="num">${p.pending ? `<span class="muted">a confirmar</span>` : eps(p.eps)}</td>
        <td class="num">${eps(p.consensus)}</td>
        <td class="num ${cls(p.surprisePct)}">${p.surprisePct == null ? "–" : `${p.surprisePct > 0 ? "+" : ""}${p.surprisePct.toFixed(1).replace(".", decSep())}%`}</td>
        <td class="num ${cls(p.run)}">${pct(p.run)}</td>
        <td class="num ${cls(p.react)}">${pct(p.react)}</td></tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table class="cal-table earn-table"><thead><tr><th>Divulgado</th><th>Empresa</th><th>Trimestre</th><th>LPA</th><th>Consenso</th><th>Surpresa</th><th>Corrida pré</th><th>Reação</th></tr></thead><tbody>${rows}</tbody></table></div>`; // prettier-ignore
}

/** ctx: { data, prefs, held: Set, today } */
export function viewEarnings(ctx) {
  const { data, prefs = {} } = ctx;
  if (!data) return `<div class="card empty">Carregando os balanços…</div>`;
  const today = ctx.today ?? new Date().toISOString().slice(0, 10);
  const o = {
    theme: prefs.earnTheme ?? "all",
    win: prefs.earnWin ?? "30",
    sort: prefs.earnSort ?? "date",
    setup: prefs.earnSetup ?? "all",
    only: prefs.earnOnly ?? "all",
  };
  const v = earningsView(data.companies ?? [], { ...o, today, held: ctx.held ?? new Set() });
  const themes = data.themes ?? [];
  const filters = `<div class="cal-filters">
    <label class="muted" for="earnTheme">Subtema</label>
    <select id="earnTheme" data-setpref-sel="earnTheme"><option value="all">Todos</option>${themes.map((t) => `<option value="${esc(t)}"${t === o.theme ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
    <span class="muted">Janela</span>${seg("earnWin", o.win, [["7", "7 dias"], ["14", "14 dias"], ["30", "30 dias"], ["90", "90 dias"], ["all", "Todas"]])}
  </div>
  <div class="cal-filters">
    <span class="muted">Ordenar</span>${seg("earnSort", o.sort, Object.entries(SORTS).map(([k, s]) => [k, s.label]))}
  </div>
  <div class="cal-filters">
    <span class="muted">Leitura</span>${seg("earnSetup", o.setup, [["all", "Todas"], ["forte", "Só histórico forte"]])}
    <span class="muted">Ativos</span>${seg("earnOnly", o.only, [["all", "Todos"], ["held", "Só da carteira"]])}
  </div>`; // prettier-ignore
  const updated = data.generated_at ? new Date(data.generated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null; // prettier-ignore
  return `<section class="card"><h2>💻 Balanços de tecnologia por subtema</h2>
    <p class="muted">Quem divulga em breve, o que o mercado espera e como a ação costuma se comportar. Subtemas = linhas de "IA: subtemas" do Fluxo + Big Tech. Toque no ticker para abrir o ativo.</p>
    ${filters}
  </section>
  <section class="card earn-soon"><h2>🔥 Próximos 7 dias <span class="muted">(${v.soon.length})</span></h2>
    ${v.soon.length ? `<div class="earn-grid">${v.soon.map((c) => card(c, today)).join("")}</div>` : `<p class="muted">Nenhum balanço nos próximos 7 dias com esse filtro.</p>`}
  </section>
  <section class="card"><h2>Próximas divulgações <span class="muted">(${v.upcoming.length})</span></h2>
    ${v.upcoming.length ? upcomingTable(v.upcoming, today) : `<p class="muted">Nada mais na janela escolhida. Aumente a janela para ver as próximas datas.</p>`}
  </section>
  <section class="card"><h2>Últimos resultados <span class="muted">(45 dias, em ordem cronológica)</span></h2>
    ${v.past.length ? pastTable(v.past) : `<p class="muted">Nenhum resultado divulgado nos últimos 45 dias com esse filtro.</p>`}
  </section>
  <p class="note">Como ler: <b>Consenso LPA</b> = lucro por ação médio esperado pelos analistas (faixa mínima–máxima); <b>Revisões</b> = analistas que subiram (↑) ou cortaram (↓) a estimativa nas últimas 4 semanas; <b>Bateu</b> = quantas das últimas divulgações vieram acima do consenso (surpresa média); <b>Corrida pré</b> = variação média da ação nos 10 pregões antes do balanço (o ganho de quem antecipa); <b>Reação</b> = variação do último fechamento antes da divulgação ao primeiro depois. <b>Leitura</b> combina revisões, surpresas e corrida; não é recomendação. Data "estimada" = última divulgação + 91 dias, até a empresa confirmar. Bater o consenso não garante alta: a reação depende também da projeção (guidance). Fonte: Nasdaq; preços da base do app.${updated ? ` Atualizado em ${updated}.` : ""} Material educacional; não é recomendação de investimento.</p>`; // prettier-ignore
}
