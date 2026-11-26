// Rentabilidade real do exterior (puro, testado): get_offshore_performance do BTG gravado em pendulo_offshore_perf.
// kind 'd' = um ponto por pregão (retorno do dia em %, sem aportes e saques); kind 'm' = fim de cada mês desde a
// abertura da conta, com o acumulado em % (retorno ponderado no tempo: aporte e saque não contam como ganho).
// Ver docs/BTG-PONTE.md. Não é recomendação.
import { cls, num } from "./format.js";

const fin = (x) => (Number.isFinite(+x) && x !== null && x !== "" ? +x : null);
export const BENCHES = ["Nasdaq", "MSCI World"];

/** Linhas da tabela → { daily, monthly } ordenadas por data, números já convertidos. */
export function perfRows(rows = []) {
  const norm = (r) => ({
    day: String(r.day).slice(0, 10),
    bal: fin(r.bal),
    r: fin(r.r),
    acc: fin(r.acc),
    pl: fin(r.pl),
    accPl: fin(r.acc_pl ?? r.accPl),
    flowIn: fin(r.flow_in ?? r.flowIn) ?? 0,
    flowOut: fin(r.flow_out ?? r.flowOut) ?? 0,
    bench: r.bench ?? {},
  });
  const by = (k) =>
    (rows ?? [])
      .filter((r) => r.kind === k)
      .map(norm)
      .sort((a, b) => (a.day < b.day ? -1 : 1));
  // o BTG abre cada consulta com um ponto zerado (saldo, retorno e resultado 0): não é um dia real
  const real = (x) => !(x.bal === 0 && !x.r && !x.pl);
  return { daily: by("d").filter(real), monthly: by("m") };
}

const ratio = (a, b) => (a != null && b != null && 1 + b / 100 > 0 ? (1 + a / 100) / (1 + b / 100) - 1 : null); // prettier-ignore
const benchAcc = (row, name) => fin(row?.bench?.[name]?.acc);

/** Último ponto mensal com data ≤ day (o mensal acumula desde a abertura da conta). */
const monthAt = (monthly, day) => monthly.filter((m) => m.day <= day).at(-1) ?? null;

/**
 * Rentabilidade real por janela (Mês, Ano, 12 meses, Desde o início): carteira em %, resultado em US$ e os índices.
 * Usa o acumulado mensal (base = fim do mês anterior à janela); o mês corrente vem dos pontos diários encadeados.
 */
export function perfSummary({ daily, monthly }) {
  const last = monthly.at(-1);
  if (!last) return null;
  const asOf = [last.day, daily.at(-1)?.day].filter(Boolean).sort().at(-1);
  const y = asOf.slice(0, 4);
  const mo = asOf.slice(0, 7);
  const minus12 = `${+y - 1}${asOf.slice(4)}`;
  const win = (label, base, from) => {
    const b = base ?? null;
    const out = {
      label,
      from,
      r: b ? ratio(last.acc, b.acc) : last.acc != null ? last.acc / 100 : null,
      pl: b ? (last.accPl ?? 0) - (b.accPl ?? 0) : last.accPl,
      bench: {},
    };
    for (const n of BENCHES) {
      const now = benchAcc(last, n);
      out.bench[n] = b ? ratio(now, benchAcc(b, n)) : now != null ? now / 100 : null;
    }
    return out;
  };
  const before = (d) => monthly.filter((m) => m.day < d).at(-1) ?? null;
  // mês corrente: pontos diários do mês encadeados (mais fiel que o mensal, que só traz o último dia)
  const days = daily.filter((x) => x.day.startsWith(mo));
  const chain = (f) => days.reduce((a, x) => (f(x) != null ? a * (1 + f(x) / 100) : a), 1) - 1;
  const month = days.length
    ? {
        label: "Mês",
        from: `${mo}-01`,
        r: chain((x) => x.r),
        pl: days.reduce((a, x) => a + (x.pl ?? 0), 0),
        flowIn: days.reduce((a, x) => a + x.flowIn, 0),
        flowOut: days.reduce((a, x) => a + x.flowOut, 0),
        bench: Object.fromEntries(BENCHES.map((n) => [n, chain((x) => fin(x.bench?.[n]?.r))])),
      }
    : win("Mês", before(`${mo}-01`), `${mo}-01`);
  const first = monthly.find((m) => m.bal > 0 || m.acc) ?? monthly[0];
  return {
    asOf,
    start: monthly[0].day,
    firstDay: first.day,
    windows: [
      month,
      win("Ano", before(`${y}-01-01`), `${y}-01-01`),
      win("12 meses", monthAt(monthly, minus12), minus12),
      win("Desde o início", null, monthly[0].day),
    ],
    balance: daily.at(-1)?.bal ?? last.bal,
  };
}

/** Série em base 100 desde a abertura (carteira e índices), para o gráfico. */
export function perfSeries({ monthly }) {
  const pts = monthly.filter((m) => m.acc != null);
  return pts.map((m) => ({
    day: m.day,
    pf: 100 * (1 + m.acc / 100),
    ...Object.fromEntries(BENCHES.map((n) => [n, benchAcc(m, n) != null ? 100 * (1 + benchAcc(m, n) / 100) : null])), // prettier-ignore
  }));
}

/** Exterior num dia: ponto diário exato ou, sem ele, o último dado do BTG até a data (fim de mês). */
export function perfOnDay({ daily, monthly }, day) {
  const d = daily.find((x) => x.day === day);
  if (d) return { exact: true, day: d.day, bal: d.bal, r: d.r != null ? d.r / 100 : null, pl: d.pl, flowIn: d.flowIn, flowOut: d.flowOut, bench: Object.fromEntries(BENCHES.map((n) => [n, fin(d.bench?.[n]?.r) != null ? d.bench[n].r / 100 : null])) }; // prettier-ignore
  const prevD = daily.filter((x) => x.day < day).at(-1);
  const m = monthAt(monthly, day);
  const p = [prevD, m]
    .filter(Boolean)
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .at(-1);
  return p ? { exact: false, day: p.day, bal: p.bal } : null;
}

const sgn = (x, f) => (x == null ? "–" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${f(Math.abs(x))}`);
const sPct = (x, d = 1) => sgn(x, (a) => `${num(a * 100, d)}%`);
const sUsd = (x) => sgn(x, (a) => `US$ ${num(a, 0)}`);
const brDate = (day) => (day ? day.split("-").reverse().join("/") : "–");
const monYr = (day) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }); // prettier-ignore

/** Gráfico de linhas em SVG (base 100): carteira em destaque, índices finos. */
export function perfChart(series, w = 640, h = 180) {
  if (series.length < 2) return "";
  const keys = ["pf", ...BENCHES];
  const vals = series.flatMap((p) => keys.map((k) => p[k]).filter((v) => v != null));
  const lo = Math.min(...vals, 100);
  const hi = Math.max(...vals, 100);
  const pad = 8;
  const x = (i) => pad + (i * (w - 2 * pad)) / (series.length - 1);
  const yv = (v) => pad + ((hi - v) * (h - 2 * pad)) / (hi - lo || 1);
  const line = (k) =>
    series
      .map((p, i) => (p[k] == null ? null : `${x(i).toFixed(1)},${yv(p[k]).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  const cssK = { pf: "op-pf", Nasdaq: "op-b1", "MSCI World": "op-b2" };
  const lab = { pf: "Sua carteira", Nasdaq: "Nasdaq", "MSCI World": "MSCI World" };
  const lastOf = (k) => [...series].reverse().find((p) => p[k] != null)?.[k];
  const legend = keys
    .map((k) => `<li class="${cssK[k]}"><i></i>${lab[k]} <b>${sPct(lastOf(k) != null ? lastOf(k) / 100 - 1 : null)}</b></li>`)
    .join(""); // prettier-ignore
  const label = keys.map((k) => `${lab[k]} ${sPct(lastOf(k) / 100 - 1)}`).join(", ");
  return `<figure class="op-chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Rentabilidade acumulada desde ${monYr(series[0].day)}: ${label}">
    <line class="op-base" x1="${pad}" x2="${w - pad}" y1="${yv(100).toFixed(1)}" y2="${yv(100).toFixed(1)}"/>
    ${BENCHES.map((k) => `<polyline class="${cssK[k]}" points="${line(k)}"/>`).join("")}
    <polyline class="op-pf" points="${line("pf")}"/>
  </svg><figcaption><span>${monYr(series[0].day)}</span><span>${monYr(series.at(-1).day)}</span></figcaption><ul class="op-leg">${legend}</ul></figure>`; // prettier-ignore
}

/** Cartão "Exterior: rentabilidade real" (Carteira › Histórico). */
export function perfCard(rows) {
  const s = perfSummary(rows);
  if (!s) return "";
  const td = (x) => `<td class="num ${cls(x)}">${sPct(x)}</td>`;
  const body = s.windows
    .map((w) => {
      const vsN = w.r != null && w.bench.Nasdaq != null ? w.r - w.bench.Nasdaq : null;
      return `<tr><th scope="row">${w.label}</th>${td(w.r)}<td class="num ${cls(w.pl)}">${sUsd(w.pl)}</td>${td(w.bench.Nasdaq)}${td(w.bench["MSCI World"])}<td class="num ${cls(vsN)}">${vsN == null ? "–" : `${sgn(vsN, (a) => num(a * 100, 1))} p.p.`}</td></tr>`;
    })
    .join(""); // prettier-ignore
  const flows = s.windows[0].flowIn || s.windows[0].flowOut ? ` · no mês: aportes US$ ${num(s.windows[0].flowIn, 0)}, saques US$ ${num(s.windows[0].flowOut, 0)}` : ""; // prettier-ignore
  return `<section class="card op-card" aria-label="Exterior: rentabilidade real">
    <div class="pf-hist-bar"><span class="lab">🌎 Exterior · rentabilidade real</span><small class="muted">sem aportes e saques · dados do BTG até ${brDate(s.asOf)}</small></div>
    <div class="tw"><table class="op-t"><thead><tr><th>Período</th><th class="num">Carteira</th><th class="num">Resultado</th><th class="num">Nasdaq</th><th class="num">MSCI World</th><th class="num">vs Nasdaq</th></tr></thead><tbody>${body}</tbody></table></div>
    ${perfChart(perfSeries(rows))}
    <p class="pf-note">Retorno ponderado no tempo calculado pelo BTG: dinheiro que entra ou sai não conta como ganho ou perda. Resultado em US$ já desconta impostos e taxas${flows}. "Desde o início" = desde ${monYr(s.start)}. Não é recomendação.</p>
  </section>`; // prettier-ignore
}
