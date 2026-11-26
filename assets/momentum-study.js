// Estudo F35 (docs/ESTUDO-MOMENTUM-UNIVERSO.md): momentum 12-1 no Universo de Setores. Só exibição.
// Lê data/momentum-universe-study.json: o estudo de 10 anos (reprovado) e a foto de hoje, refeita todo pregão pelo
// cron (scripts/momentum-universe-study.mjs --today). Mostra quem passa na regra, nunca como ordem de compra.
import { cls, dateBR, decSep, esc, pct } from "./format.js";
import { fetchJSON } from "./net.js";
import { hq } from "./help.js";

const TTL = 30 * 60_000;
export const mom = { data: null, at: 0, loading: null, open: false };
// a tela é redesenhada a cada atualização de cotação: guarda se a lista "quem passa hoje" está aberta
if (typeof document !== "undefined")
  document.addEventListener("toggle", (e) => e.target.matches?.("[data-mom-details]") && (mom.open = e.target.open), true); // prettier-ignore
const GROUP_PT = { SINGLE: "ações", ETF: "ETFs" };
const WARN =
  "Estudo F35: em 10 anos, o 12-1 não escolheu melhor ativo nesta lista (ganho veio de mais risco, não de seleção). Informativo; não é recomendação.";

/** Busca o JSON (no máximo a cada 30 min). Devolve os dados ou null. */
export async function loadMomentum(force = false) {
  if (mom.loading) return mom.loading;
  if (!force && mom.data && Date.now() - mom.at < TTL) return mom.data;
  mom.loading = fetchJSON(`data/momentum-universe-study.json?t=${Date.now()}`)
    .then((d) => (mom.data = d))
    .catch(() => mom.data)
    .finally(() => {
      mom.at = Date.now();
      mom.loading = null;
    });
  return mom.loading;
}

const pctl = (p) => `${Math.round(p * 100)}º`;

/** Cartão da página do ativo: percentil do 12-1 no grupo e se passa na regra. Vazio se o ativo não está na lista. */
export function momLineHtml(sym, d = mom.data) {
  const x = d?.all?.[sym];
  if (!x) return "";
  const n = d.today?.[x.g]?.n ?? "?";
  const verdict = x.pass
    ? '<span class="tag buy">Passa na regra</span>'
    : `<span class="tag">${x.pct >= 0.8 ? "Top 20%, mas abaixo da MM200" : "Fora do top 20%"}</span>`;
  return `<div class="card" id="momLine"><h3>Momentum 12-1 <span class="muted small">foto de ${esc(dateBR(d.regimeToday?.date))}</span></h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <span>Percentil <b>${pctl(x.pct)}</b> entre ${n} ${GROUP_PT[x.g] ?? ""} da lista</span>
      <span>12 meses (sem o último): <b class="${cls(x.mom)}">${pct(x.mom, 1)}</b>${hq("mom12", { sym, mom: x.mom, pct: x.pct })}</span>
      <span>${x.above ? "Acima" : "Abaixo"} da MM200</span>${verdict}</div>
    <p class="note">${WARN} Detalhe no Simulador → 🧠 Aprendizado.</p></div>`;
}

const SINCE = (x) => (x.offHigh >= -0.05 ? "perto da máxima" : x.offHigh >= -0.2 ? "5–20% abaixo" : "> 20% abaixo"); // prettier-ignore

function passTable(g, rows) {
  if (!rows.length) return `<p class="muted">Nenhum ativo passa hoje.</p>`;
  const tr = rows
    .map(
      (
        x,
      ) => `<tr><td><span class="tk">${esc(x.s)}</span><div class="muted small">${esc(x.label)}</div></td>
      <td class="num">${pctl(x.pct)}</td><td class="num ${cls(x.mom)}">${pct(x.mom, 0)}</td>
      <td class="num ${cls(x.r1m)}">${pct(x.r1m, 1)}</td><td class="num">${pct(x.dist200, 1)}</td>
      <td class="num ${cls(x.offHigh)}">${pct(x.offHigh, 1)}</td><td class="num">${Math.round(x.rsi)}</td><td class="muted small">${SINCE(x)}</td></tr>`,
    )
    .join("");
  return `<div class="tw" style="box-shadow:none"><table class="desk-tbl"><thead><tr><th>${GROUP_PT[g]}</th><th class="num">Percentil</th><th class="num">12-1</th><th class="num">Último mês</th><th class="num">vs MM200</th><th class="num">vs máxima 52s</th><th class="num">RSI</th><th>Preço hoje</th></tr></thead><tbody>${tr}</tbody></table></div>`;
}

/** Painel do Simulador → 🧠 Aprendizado: veredito do estudo e quem passa na regra hoje. */
export function momStudyHtml(d = mom.data) {
  if (!d?.groups) return "";
  const s = d.groups.SINGLE;
  const e = d.groups.ETF;
  const r = d.regimeToday ?? {};
  const pass = (g) => (d.today?.[g]?.top ?? []).filter((x) => x.dist200 > 0);
  const out = (g) => (d.today?.[g]?.top ?? []).filter((x) => x.dist200 <= 0).map((x) => x.s);
  const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace(".", decSep()) : "–");
  const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3).replace(".", decSep()) : "–");
  const row = (lab, a, b) =>
    `<tr><td>${lab}</td><td class="num">${a}</td><td class="num">${b}</td></tr>`;
  const ps = pass("SINGLE");
  const pe = pass("ETF");
  return `<section class="card" style="margin-top:12px" id="momStudy"><h3>Momentum 12-1 no Universo de Setores <span class="tag sell">Reprovado</span></h3>
    <p class="muted small">Estudo F35, ${esc(dateBR(s.from))} a ${esc(dateBR(s.to))}, ${s.universe} ações e ${e.universe} ETFs da sua lista. Regra: no fim do mês, os 20% com maior retorno de 12 meses (pulando o último) dentro do grupo, só acima da própria MM200.</p>
    <div class="tw" style="box-shadow:none"><table class="desk-tbl"><thead><tr><th>Teste</th><th class="num">Ações</th><th class="num">ETFs</th></tr></thead><tbody>
      ${row("Correlação 12-1 × mês seguinte (t)", `${f3(s.ic.mean)} (${f2(s.ic.t)})`, `${f3(e.ic.mean)} (${f2(e.ic.t)})`)}
      ${row("Mais fortes − mais fracos, por mês (t)", `${pct(s.spread.mean, 2)} (${f2(s.spread.t)})`, `${pct(e.spread.mean, 2)} (${f2(e.spread.t)})`)}
      ${row("Risco do top 20% (beta)", f2(s.beta), f2(e.beta))}
      ${row("Ganho extra sem o risco, por mês (t)", `${pct(s.alpha.monthly, 2)} (${f2(s.alpha.t)})`, `${pct(e.alpha.monthly, 2)} (${f2(e.alpha.t)})`)}
      ${row("Esticados − não esticados no top 20% (t)", `${pct(s.extension.mean, 2)} (${f2(s.extension.t)})`, `${pct(e.extension.mean, 2)} (${f2(e.extension.t)})`)}
    </tbody></table></div>
    <p class="note"><b>Leitura:</b> o 12-1 não ordenou as ações e foi fraco nos ETFs (t abaixo de 2). O top 20% rendeu mais por ter beta ~1,2: comprou os mais voláteis num mercado de alta. Esperar recuo não ajudou (nas ações, os esticados renderam mais). Por isso <b>não há alerta nem decisão</b> baseados nesta regra.</p>
    <details data-mom-details ${mom.open ? "open" : ""}><summary>Quem passa na regra hoje (${ps.length} ações, ${pe.length} ETFs) · foto de ${esc(dateBR(r.date))} · regime ${r.on ? "LIGADO" : "DESLIGADO"}</summary>
      <p class="muted small">Lista informativa, refeita todo pregão. A regra avalia no fim do mês. Não é lista de compras: o teste acima mostra que ela não deu vantagem.${r.on ? "" : " Com o regime DESLIGADO, a regra não abriria posição nova."}</p>
      ${passTable("SINGLE", ps)}
      ${out("SINGLE").length ? `<p class="muted small">Top 20% abaixo da MM200 (fora): ${out("SINGLE").map(esc).join(", ")}</p>` : ""}
      ${passTable("ETF", pe)}
      ${out("ETF").length ? `<p class="muted small">Top 20% abaixo da MM200 (fora): ${out("ETF").map(esc).join(", ")}</p>` : ""}
    </details>
    <p class="note">Detalhes e limites (lista com viés de sobrevivência, só 20 meses de baixa): docs/ESTUDO-MOMENTUM-UNIVERSO.md. Material educacional; não é recomendação de investimento.</p></section>`;
}
