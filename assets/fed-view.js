// Mercados › Offshore › Juros › 🏦 Fed: caminho do juro americano precificado nos futuros de Fed Funds, reunião a
// reunião do FOMC, com as curvas de datas passadas para comparar. Contas em fed.js (puro); dados em /api/yields?fed=1.
import { daysUntil, meetingPath, monthlyPath, pathSummary } from "./fed.js";
import { CURVE_COLORS, cmpDate, cmpLabel, curveSvg } from "./rates.js";
import { fetchJSON } from "./net.js";
import { dateBR, esc, num } from "./format.js";
import { hooks, state } from "./state.js";

const TTL = 5 * 60_000;
const mem = { d: null, err: null, p: null, at: 0 };
let timer = null;
const isTab = () => state.prefs.tab === "rates";

function useFed() {
  const age = Date.now() - mem.at;
  if (!mem.p && (!mem.d || age > TTL) && (!mem.err || age > 30_000)) {
    mem.p = fetchJSON("api/yields?fed=1")
      .then((d) =>
        Object.assign(mem, d?.contracts ? { d, err: null } : { err: d?.error ?? "resposta vazia" }),
      )
      .catch((e) => (mem.err = String(e?.message ?? e)))
      .finally(() => {
        mem.p = null;
        mem.at = Date.now();
        if (isTab()) hooks.render();
      });
  }
  if (!timer)
    timer = setTimeout(() => {
      timer = null;
      if (isTab() && !document.hidden) hooks.render();
    }, TTL + 1000);
  return mem;
}

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const ymLabel = (ym) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const pct = (y) => (Number.isFinite(y) ? `${num(y, 2)}%` : "–");
const bp = (x) => (x == null ? "–" : `${x > 0 ? "+" : ""}${Math.round(x)} bp`);
const tone = (x) => (x == null || Math.abs(x) < 1 ? "" : x > 0 ? "neg" : "pos"); // juro subir = ruim para ativos

/** "72% de corte de 25 bp", "corte de 25 bp certo + 30% de mais um", "manutenção". */
export function probText(m) {
  if (m.dir === "manter" || m.prob < 10) return "manutenção provável";
  const what = m.dir === "corte" ? "corte" : "alta";
  if (m.prob <= 100) return `${m.prob}% de ${what} de 25 bp`;
  return `${what} de 25 bp no preço + ${m.prob - 100}% de mais 25`;
}

function card(lab, val, sub, cls = "") {
  return `<div class="card kpi"><div class="lab">${esc(lab)}</div><div class="val ${cls}">${val}</div><div class="sub muted">${sub}</div></div>`; // prettier-ignore
}

export function viewFed(cmp, today) {
  const f = useFed();
  if (!f.d) {
    const msg = f.err ? `Caminho do Fed indisponível agora (${esc(f.err)}). Tenta de novo em instantes.` : "Carregando os futuros de Fed Funds…"; // prettier-ignore
    return `<div class="card empty">${msg}</div>`;
  }
  const d = f.d;
  const day = d.today ?? today;
  const effr = d.effr?.rate ?? monthlyPath(d.contracts, day)[0]?.y;
  const path = monthlyPath(d.contracts, day).map((p) => ({ ...p, label: ymLabel(p.ym) }));
  const mp = meetingPath(path, d.meetings, effr, day);
  const sum = pathSummary(mp, day);
  const y0 = Number(day.slice(0, 4));

  const band = d.effr?.lo != null ? `banda ${num(d.effr.lo, 2)}–${num(d.effr.hi, 2)}%` : "";
  const nx = sum?.next;
  const kpi = [
    card(
      "EFFR (juro efetivo)",
      pct(effr),
      `${esc(band)}${d.effr?.date ? ` · ${dateBR(d.effr.date)}` : ""}`,
    ),
    nx
      ? card(`Próxima reunião · ${dateBR(nx.date)}`, bp(nx.move), `${esc(probText(nx))} · em ${daysUntil(nx.date, day)} dias`, tone(nx.move)) // prettier-ignore
      : card("Próxima reunião", "–", "sem contrato para o mês"),
    sum?.endYear && sum.endYear.date.startsWith(String(y0))
      ? card(`Até o fim de ${y0}`, bp(sum.endYear.cum), `${num(Math.abs(sum.endYear.cuts), 1)} ${sum.endYear.cum <= 0 ? "corte(s)" : "alta(s)"} de 25 bp`, tone(sum.endYear.cum)) // prettier-ignore
      : "",
    sum?.endNext
      ? card(`Até ${dateBR(sum.endNext.date)}`, bp(sum.endNext.cum), `juro esperado ${pct(sum.endNext.after)} · ${num(Math.abs(sum.endNext.cuts), 1)} ${sum.endNext.cum <= 0 ? "corte(s)" : "alta(s)"}`, tone(sum.endNext.cum)) // prettier-ignore
      : "",
  ].join("");

  // curva mês a mês: agora + datas de comparação (mesmo mês do calendário no eixo)
  const series = [{ name: "Agora", date: day, points: path, color: CURVE_COLORS[0] }];
  const pending = [];
  cmp.forEach((c, i) => {
    const date = cmpDate(c, day);
    const pts = date ? monthlyPath(d.contracts, day, date).map((p) => ({ ...p, label: ymLabel(p.ym) })) : []; // prettier-ignore
    if (pts.length >= 2)
      series.push({ name: cmpLabel(c), date, points: pts, color: CURVE_COLORS[(i + 2) % CURVE_COLORS.length], width: 1.6 }); // prettier-ignore
    else pending.push(`${cmpLabel(c)}: sem preço guardado (até 6 meses)`);
  });
  const ticks = [0, 0.25, 0.5, 0.75, 1, 1.25].filter((t) => t <= (path.at(-1)?.t ?? 1) + 0.01);
  const svg = curveSvg(series, { ticks, curve: "fed" }).replace(/>Overnight</g, ">Hoje<");
  const legend = series
    .map(
      (s) =>
        `<span class="rc-leg"><i class="rc-sw" style="background:${s.color}"></i>${esc(s.name)} <span class="muted">${dateBR(s.date)}</span></span>`,
    ) // prettier-ignore
    .join("");

  const rows = mp
    .map(
      (m) =>
        `<tr><td class="nowrap">${dateBR(m.date)} <span class="muted small">${daysUntil(m.date, day)} d</span></td><td class="num">${pct(m.after)}</td><td class="num ${tone(m.move)}">${bp(m.move)}</td><td class="small">${esc(probText(m))}</td><td class="num ${tone(m.cum)}">${bp(m.cum)}</td><td class="num">${num(Math.abs(m.cuts), 1)}</td></tr>`,
    ) // prettier-ignore
    .join("");
  const monthRows = path
    .map(
      (p) =>
        `<tr><td>${esc(p.label)}</td><td class="num">${pct(p.y)}</td>${series
          .slice(1)
          .map((s) => {
            const q = s.points.find((x) => x.ym === p.ym);
            return `<td class="num ${tone(q ? (p.y - q.y) * 100 : null)}">${q ? bp((p.y - q.y) * 100) : "–"}</td>`;
          })
          .join("")}</tr>`,
    ) // prettier-ignore
    .join("");

  return `<div class="grid g4 rc-kpis">${kpi}</div>
    <div class="card rc-chart"><h3>Juro esperado mês a mês · 🏦 Fed Funds</h3>
      <div class="rc-legend">${legend}</div>
      <div class="rc-plot">${svg}</div>
      ${pending.length ? `<p class="muted small">${esc(pending.join(" · "))}</p>` : ""}
      <p class="muted small">Juro médio de cada mês = 100 − preço do futuro de Fed Funds. Curva descendo = mercado espera cortes; subindo = altas.</p></div>
    <div class="card"><h3>Reunião a reunião <span class="muted small">FOMC; + = alta, − = corte</span></h3>
      <div class="tw" style="box-shadow:none"><table><thead><tr><th>Decisão</th><th class="num">Juro depois</th><th class="num">Movimento</th><th>Precificado</th><th class="num">Acumulado</th><th class="num">N.º de 25 bp</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted small">Sem reuniões cobertas pelos contratos.</td></tr>'}</tbody></table></div></div>
    <div class="card"><h3>Mês a mês <span class="muted small">juro implícito e variação contra cada data (bp)</span></h3>
      <div class="tw" style="box-shadow:none"><table><thead><tr><th>Mês</th><th class="num">Agora</th>${series.slice(1).map((s) => `<th class="num">vs ${esc(s.name)}</th>`).join("")}</tr></thead><tbody>${monthRows}</tbody></table></div></div>
    <p class="note">Método do CME FedWatch simplificado: o juro depois de cada reunião sai do mês seguinte sem reunião ou da média do mês ponderada pelos dias antes e depois da decisão; a chance é a de um movimento de 25 bp (não separa cenários de 0 e 50 bp). O futuro paga a EFFR, que fica uns bp abaixo do meio da banda. Fonte: ${esc(d.source)}; preços do Yahoo com ~10 min de atraso.${d.missing?.length ? ` Meses sem cotação: ${esc(d.missing.map(ymLabel).join(", "))}.` : ""}${d.errors?.length ? ` Avisos: ${esc(d.errors.join("; "))}.` : ""} Material educacional; não é recomendação de investimento.</p>`; // prettier-ignore
}
