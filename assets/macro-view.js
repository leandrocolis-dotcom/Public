// Mercado › Macro: nota do contexto macro, regime (relógio do investimento), pilares com cada indicador, setores
// favorecidos pela história e pelas notícias, e a agenda dos EUA com projeção × resultado. Dados: data/macro.json.
import { esc, num, pct } from "./format.js";
import { loadMacro, macro } from "./macro.js";

const tone = (x) => (x == null ? "" : x > 0.25 ? "pos" : x < -0.25 ? "neg" : "muted");
const sgn = (x, d = 1) => (x == null ? "–" : `${x > 0 ? "+" : ""}${num(x, d)}`);
const bar = (x, max = 2.5) =>
  `<span class="mc-bar"><i style="left:50%;width:${Math.min(50, (Math.abs(x ?? 0) / max) * 50)}%;${(x ?? 0) < 0 ? "transform:translateX(-100%);background:var(--sell)" : "background:var(--buy)"}"></i></span>`; // prettier-ignore

function releasesHtml(rel) {
  const ev = Object.values(rel?.events ?? {}).sort((a, b) => b.date.localeCompare(a.date));
  if (!ev.length) return `<p class="muted">Sem divulgações registradas ainda.</p>`;
  const now = Date.now();
  const rows = ev
    .slice(0, 60)
    .map((e) => {
      const past = Date.parse(e.date) <= now;
      const when = new Date(e.date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
      const res =
        e.actual != null
          ? `<b>${num(e.actual, 2)}</b>`
          : past
            ? `<span class="muted">aguardando FRED</span>`
            : `<span class="muted">a divulgar</span>`;
      const sur =
        e.surprise != null
          ? `<span class="${e.good > 0 ? "pos" : e.good < 0 ? "neg" : "muted"}">${sgn(e.surprise, 2)} ${e.good > 0 ? "▲ bom p/ ações" : e.good < 0 ? "▼ ruim p/ ações" : ""}</span>`
          : "–";
      return `<tr class="${past ? "" : "mc-future"}"><td class="nowrap">${esc(when)}</td><td>${esc(e.title)} ${e.impact === "High" ? '<span class="tag sell">alto</span>' : ""}</td><td class="num">${esc(e.forecast ?? "–")}</td><td class="num">${esc(e.previous ?? "–")}</td><td class="num">${res}</td><td>${sur}</td></tr>`;
    })
    .join("");
  return `<div class="tw" style="box-shadow:none"><table><thead><tr><th>Quando (Brasília)</th><th>Indicador (EUA)</th><th class="num">Projeção</th><th class="num">Anterior</th><th class="num">Resultado</th><th>Surpresa</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function viewMacro() {
  loadMacro();
  const d = macro.data;
  if (!d) return `<div class="card"><h2>Contexto macro</h2><p class="muted">Carregando dados macroeconômicos…</p></div>`; // prettier-ignore
  const r = d.regime;
  const probs = Object.entries(r.probs)
    .sort((a, b) => b[1] - a[1])
    .map(([k, p]) => `<span class="${k === r.id ? "on" : ""}">${esc(d.history.regimes[k].label)} ${pct(p, 0).replace("+", "")}</span>`)
    .join(""); // prettier-ignore
  const card = (label, score, inds) =>
    `<details class="card mc-pil" open><summary><h3 style="display:inline">${esc(label)}</h3> <b class="${tone(score)}">${sgn(score, 2)}</b> ${bar(score)}</summary>
        <div class="tw" style="box-shadow:none"><table><tbody>${inds
          .map(
            (x) =>
              `<tr><td>${esc(x.label)}<div class="muted small">${esc(x.read)}${x.date ? ` · ${esc(x.date)}` : ""}</div></td><td class="num">${num(x.value, 2)} <span class="muted small">${esc(x.unit)}</span></td><td class="num ${tone(x.score)}">${sgn(x.score, 2)}</td><td>${bar(x.score)}</td></tr>`,
          )
          .join("")}</tbody></table></div></details>`;
  const world = d.world
    ? Object.entries(d.world.regions)
        .map(([k, r]) =>
          card(
            r.label,
            r.score,
            d.world.indicators.filter((x) => x.region === k),
          ),
        )
        .join("")
    : "";
  const pillars = Object.entries(d.pillars)
    .filter(([k]) => k !== "global")
    .map(([k, p]) => {
      const inds = d.indicators.filter((x) => x.pillar === k);
      return `<details class="card mc-pil" open><summary><h3 style="display:inline">${esc(p.label)}</h3> <b class="${tone(p.score)}">${sgn(p.score, 2)}</b> ${bar(p.score)}</summary>
        <div class="tw" style="box-shadow:none"><table><tbody>${inds
          .map(
            (x) =>
              `<tr><td>${esc(x.label)}<div class="muted small">${esc(x.read)}${x.date ? ` · ${esc(x.date)}` : ""}</div></td><td class="num">${num(x.value, 2)} <span class="muted small">${esc(x.unit)}</span></td><td class="num ${tone(x.score)}">${sgn(x.score, 2)}</td><td>${bar(x.score)}</td></tr>`,
          )
          .join("")}</tbody></table></div></details>`;
    })
    .join("");
  const reg = d.history.regimes;
  const tilts = d.tilts
    .map((t) => {
      const h = t.histRegime;
      return `<tr data-sym="${esc(t.sym)}"><td><b>${esc(t.sym)}</b> <span class="muted">${esc(t.name)}</span></td><td class="num ${tone(t.score)}"><b>${sgn(t.score, 2)}</b></td><td class="num">${h ? `${pct(h.avg, 2)}/mês` : "–"}</td><td class="num">${h ? `${pct(h.hit, 0).replace("+", "")} (${h.n})` : "–"}</td><td class="num">${h ? num(h.t, 1) : "–"}</td><td class="num ${tone(t.news)}">${sgn(t.news, 2)}</td></tr>`;
    })
    .join("");
  const themes = d.news.themes.length
    ? d.news.themes.map((t) => `<span class="tag ${t.geo ? "sell" : "neutral"}">${esc(t.label)} · ${t.n}</span>`).join(" ") // prettier-ignore
    : `<span class="muted">nenhum tema macro forte</span>`;
  return `<section class="card mc-head"><div class="mc-score"><span class="mc-n ${d.overall > 15 ? "pos" : d.overall < -15 ? "neg" : ""}">${sgn(d.overall, 0)}</span><span class="muted small">nota macro para ações<br>(−100 a +100)</span></div>
      <div><h2 style="margin:0">Ciclo econômico: ${esc(r.label)}</h2><p class="muted" style="margin:4px 0">${esc(r.text)} (dado de ${esc(r.month)}: produção industrial e CPI, variação do ritmo em 3 meses)</p>
      <div class="mc-probs">${probs}</div>
      <p class="small" style="margin:8px 0 0">Surpresas da agenda (30 dias): <b class="${tone(d.surprises.index)}">${sgn(d.surprises.index, 2)}</b> em ${d.surprises.n} divulgações · Temas nas manchetes (3 dias, ${d.news.n}): ${themes}</p></div></section>
    <h2 class="home-h">Pilares <span class="muted small">(EUA; cada indicador: −2,5 a +2,5; + é bom para ações)</span></h2>
    <div class="mc-grid">${pillars}</div>
    ${world ? `<h2 class="home-h">Mundo <span class="muted small">(${d.pillars.global ? `nota ${sgn(d.pillars.global.score, 2)}, 15% da nota macro` : ""}; bancos centrais, inflação, emprego, comércio, moeda e bolsa)</span></h2><div class="mc-grid">${world}</div>` : ""}
    <section class="card" style="margin-top:12px"><h2>Setores no regime atual</h2>
      <p class="muted small">Inclinação = retorno médio do setor <b>acima do S&P</b> no mês seguinte, em cada regime desde ${esc(d.history.since)} (ponderado pela chance de cada regime e encolhido quando a amostra é pequena) + efeito dos temas das notícias de hoje. Toque no código para abrir o ativo.</p>
      <div class="tw" style="box-shadow:none"><table><thead><tr><th>Setor</th><th class="num">Inclinação</th><th class="num">Média em ${esc(reg[r.id].label)}</th><th class="num">Meses acima do S&P</th><th class="num">t</th><th class="num">Notícias</th></tr></thead><tbody>${tilts}</tbody></table></div></section>
    <section class="card" style="margin-top:12px"><h2>Agenda dos EUA: projeção × resultado</h2>
      <p class="muted small">Projeção do Forex Factory guardada antes da divulgação; resultado oficial do FRED (Federal Reserve de St. Louis) assim que publicado. Surpresa = resultado − projeção; inflação e desemprego acima do esperado contam como ruins para ações.</p>
      ${releasesHtml(macro.rel)}</section>
    <p class="note">Atualizado todo pregão (${esc(new Date(d.updated_at).toLocaleString("pt-BR"))}). Mundo: FRED (BCE, HICP, Bund, BoJ, JGB, desemprego do Japão, exportações da China, câmbio), Eurostat e bolsas; inflação de Japão e China e produção industrial sem fonte gratuita atualizada (o mercado entra como termômetro). Teoria: relógio do investimento (ciclo de crescimento × inflação), regra de Sahm, curva de juros, spreads de crédito. Na Decisão o macro entra em <b>modo sombra</b> (aparece, não muda a nota) até o diário medir se acerta. Fontes: FRED, Forex Factory, Yahoo e manchetes do app. Material educacional; não é recomendação de investimento.${d.errors?.length ? ` Falhas na última carga: ${esc(d.errors.join("; "))}.` : ""}</p>`;
}
