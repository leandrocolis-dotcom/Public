// Carteira › Performance (puro, testado): retorno do exterior ao longo do tempo, em janelas, com gráficos e
// métricas. Junta duas fontes numa série só, sempre sem aportes e saques (retorno ponderado no tempo):
//  • BTG (oficial): pendulo_offshore_perf — diário (retorno do dia) e mensal (acumulado desde a abertura);
//  • calculada pelo app: carteira de cada dia (fotos diárias pendulo_broker_daily) × fechamentos do Yahoo:
//    r(d) = Σ cotas(d−1) × (fechamento(d) − fechamento(d−1)) ÷ (Σ cotas(d−1) × fechamento(d−1) + caixa(d−1)).
//    Hoje: carteira atual a preço ao vivo contra o fechamento anterior. Compras e vendas no meio do dia não entram.
// Onde as duas existem vale o BTG. Material educacional; não é recomendação.

const num = (x) => (x == null || x === "" ? null : Number.isFinite(+x) ? +x : null);
export const TRADING_DAYS = 252;

/** Pontos do BTG: diários { day, r, bench } e mensais { day, r } (r em fração; mensal a partir do acumulado). */
export function btgPoints(rows = []) {
  const daily = rows
    .filter((x) => x.kind === "d" && num(x.r) != null && !(num(x.bal) === 0 && !num(x.r)))
    .map((x) => ({
      day: String(x.day).slice(0, 10),
      r: num(x.r) / 100,
      bal: num(x.bal),
      bench: num(x.bench?.Nasdaq?.r) != null ? num(x.bench.Nasdaq.r) / 100 : null,
      src: "btg",
      kind: "d",
    }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    // o BTG repete o último pregão em dias sem pregão (mesmo retorno e saldo): conta uma vez só
    .filter((p, i, a) => !(i > 0 && p.r === a[i - 1].r && p.bal === a[i - 1].bal));
  const months = rows
    .filter((x) => x.kind === "m" && num(x.acc) != null)
    .map((x) => ({
      day: String(x.day).slice(0, 10),
      acc: num(x.acc) / 100,
      b: num(x.bench?.Nasdaq?.acc),
    }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  const monthly = months.map((m, i) => {
    const prev = months[i - 1];
    const r = prev ? (1 + m.acc) / (1 + prev.acc) - 1 : m.acc;
    // 1º mês: o acumulado do índice no BTG não parte da abertura da conta, então fica sem referência
    const bench = m.b != null && prev?.b != null ? (1 + m.b / 100) / (1 + prev.b / 100) - 1 : null;
    return { day: m.day, r, bench, src: "btg", kind: "m" };
  });
  return { daily, monthly };
}

/**
 * Pontos calculados pelo app a partir das carteiras do dia. snaps: [{ day, positions: [{ sym, qty }], cash }]
 * em ordem; closes: { SYM: { dates, close } }; bench: símbolo de referência (QQQ).
 */
export function appPoints(snaps = [], closes = {}, bench = "QQQ") {
  const px = (sym, day) => {
    const s = closes[sym];
    if (!s?.dates) return null;
    let v = null;
    for (let i = 0; i < s.dates.length && s.dates[i] <= day; i++) v = s.close[i];
    return v;
  };
  const tradingDays = (closes[bench]?.dates ?? []).slice();
  const out = [];
  for (let k = 0; k < snaps.length; k++) {
    const s = snaps[k];
    const nextSnap = snaps[k + 1]?.day ?? "9999-12-31";
    // a carteira do dia s vale até a próxima foto: cada pregão nesse intervalo usa as cotas dela
    const days = tradingDays.filter((d) => d > s.day && d <= nextSnap);
    let prevDay = s.day;
    for (const d of days) {
      let v0 = num(s.cash) ?? 0;
      let pl = 0;
      let ok = true;
      for (const p of s.positions ?? []) {
        const a = px(p.sym, prevDay);
        const b = px(p.sym, d);
        if (!(a > 0 && b > 0)) {
          ok = false;
          break;
        }
        v0 += p.qty * a;
        pl += p.qty * (b - a);
      }
      const ba = px(bench, prevDay);
      const bb = px(bench, d);
      if (ok && v0 > 0) out.push({ day: d, r: pl / v0, bench: ba > 0 && bb > 0 ? bb / ba - 1 : null, src: "app", kind: "d" }); // prettier-ignore
      prevDay = d;
    }
  }
  return out;
}

/** Hoje, ao vivo: carteira atual { sym, qty, price, pc } + caixa; bench = { p, pc }. */
export function livePoint(day, holdings = [], cash = 0, bench = null) {
  let v0 = num(cash) ?? 0;
  let pl = 0;
  for (const h of holdings) {
    if (!(h.qty > 0 && h.price > 0 && h.pc > 0)) return null;
    v0 += h.qty * h.pc;
    pl += h.qty * (h.price - h.pc);
  }
  if (!(v0 > 0)) return null;
  return { day, r: pl / v0, pl, bench: bench?.p > 0 && bench?.pc > 0 ? bench.p / bench.pc - 1 : null, src: "live", kind: "d" }; // prettier-ignore
}

/**
 * Série única em ordem: mensal do BTG até o mês anterior ao 1º diário; depois diários (BTG vence o app no mesmo
 * dia; o ponto ao vivo de hoje entra por último). Devolve os pontos e as lacunas (dias úteis sem dado).
 */
export function buildSeries({ btg = { daily: [], monthly: [] }, app = [], live = null } = {}) {
  const byDay = new Map();
  for (const p of app) byDay.set(p.day, p);
  for (const p of btg.daily) byDay.set(p.day, p);
  if (live && !byDay.has(live.day)) byDay.set(live.day, live);
  const daily = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  const firstD = daily[0]?.day ?? "9999";
  const monthly = btg.monthly.filter((m) => m.day.slice(0, 7) < firstD.slice(0, 7));
  const points = [...monthly, ...daily];
  // lacunas: mais de 4 dias corridos entre dois pontos diários (fim de semana + feriado ainda cabe)
  const gaps = [];
  for (let i = 1; i < daily.length; i++) {
    const g = (Date.parse(daily[i].day) - Date.parse(daily[i - 1].day)) / 864e5;
    if (g > 4) gaps.push({ from: daily[i - 1].day, to: daily[i].day });
  }
  return { points, gaps };
}

const addDays = (day, n) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Data de início (exclusiva) de cada janela, contada a partir do último ponto. */
export function windowStart(key, asOf, points) {
  const y = asOf.slice(0, 4);
  const m = asOf.slice(0, 7);
  const daily = points.filter((p) => p.kind === "d");
  const nth = (n) => daily[daily.length - 1 - n]?.day ?? null;
  switch (key) {
    case "1D":
      return nth(1);
    case "5D":
      return nth(5);
    case "MTD":
      return addDays(`${m}-01`, -1);
    case "1M":
      return addDays(asOf, -30);
    case "3M":
      return addDays(asOf, -91);
    case "6M":
      return addDays(asOf, -182);
    case "YTD":
      return `${+y - 1}-12-31`;
    case "12M":
      return addDays(asOf, -365);
    default:
      return "0000-00-00";
  }
}
export const WINDOWS = ["1D", "5D", "MTD", "1M", "3M", "6M", "YTD", "12M", "ALL"];
export const WINDOW_LABEL = { "1D": "Dia", "5D": "Semana", MTD: "Mês", "1M": "1 mês", "3M": "3 meses", "6M": "6 meses", YTD: "Ano", "12M": "12 meses", ALL: "Início" }; // prettier-ignore

const stdev = (xs) => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Métricas de uma janela: retorno, anualizado, vol anualizada (só pontos diários), queda máxima, Sharpe (sem juro
 * livre de risco), melhor e pior dia, % de dias positivos, referência (Nasdaq/QQQ) e a curva base 100 + queda.
 * Mês do BTG que começa antes da janela entra inteiro (approx = true).
 */
export function windowStats(points, key) {
  if (!points.length) return null;
  const asOf = points.at(-1).day;
  const from = windowStart(key, asOf, points);
  if (from == null) return null;
  const pts = points.filter((p) => p.day > from);
  if (!pts.length) return null;
  let acc = 1;
  let bAcc = 1;
  let bOk = true;
  let bStarted = false;
  let peak = 1;
  let mdd = 0;
  const curve = [];
  for (const p of pts) {
    acc *= 1 + p.r;
    // referência: começa no 1º ponto que a tem; um buraco depois disso invalida a comparação
    if (p.bench != null) {
      bAcc *= 1 + p.bench;
      bStarted = true;
    } else if (bStarted) bOk = false;
    peak = Math.max(peak, acc);
    const dd = acc / peak - 1;
    mdd = Math.min(mdd, dd);
    curve.push({
      day: p.day,
      v: 100 * acc,
      b: bOk ? 100 * bAcc : null,
      dd,
      src: p.src,
      kind: p.kind,
    });
  }
  const daily = pts.filter((p) => p.kind === "d");
  const rs = daily.map((p) => p.r);
  const sd = stdev(rs);
  const vol = sd != null && rs.length >= 5 ? sd * Math.sqrt(TRADING_DAYS) : null;
  const firstDay = pts[0].kind === "m" ? `${pts[0].day.slice(0, 7)}-01` : pts[0].day;
  const span = Math.max(1, (Date.parse(asOf) - Date.parse(firstDay)) / 864e5 + 1);
  const ret = acc - 1;
  const ann = span >= 60 ? (1 + ret) ** (365 / span) - 1 : null;
  const best = daily.reduce((a, p) => (!a || p.r > a.r ? p : a), null);
  const worst = daily.reduce((a, p) => (!a || p.r < a.r ? p : a), null);
  return {
    key,
    from,
    to: asOf,
    ret,
    ann,
    vol,
    sharpe: ann != null && vol ? ann / vol : vol && rs.length ? ((rs.reduce((a, x) => a + x, 0) / rs.length) * TRADING_DAYS) / vol : null, // prettier-ignore
    mdd,
    best,
    worst,
    up: rs.length ? rs.filter((x) => x > 0).length / rs.length : null,
    days: rs.length,
    bench: bOk && bStarted ? bAcc - 1 : null,
    approx: pts[0].kind === "m" && key !== "ALL",
    srcs: [...new Set(pts.map((p) => p.src))],
    curve,
  };
}

/** Retorno de cada mês (ano × mês): mensal do BTG ou diários encadeados do mês. */
export function monthGrid(points) {
  const by = new Map();
  for (const p of points) {
    const k = p.day.slice(0, 7);
    by.set(k, (by.get(k) ?? 1) * (1 + p.r));
  }
  const years = [...new Set([...by.keys()].map((k) => k.slice(0, 4)))].sort().reverse();
  return years.map((y) => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const v = by.get(`${y}-${String(i + 1).padStart(2, "0")}`);
      return v == null ? null : v - 1;
    });
    const yr = months.reduce((a, r) => (r == null ? a : a * (1 + r)), 1) - 1;
    return { year: y, months, year_r: months.some((r) => r != null) ? yr : null };
  });
}

/** Fotos diárias (pendulo_broker_daily) → carteiras do dia { day, positions, cash } do exterior. */
export function snapsFrom(daily = []) {
  return daily
    .map((d) => ({
      day: String(d.day).slice(0, 10),
      positions: (d.summary?.offshore?.positions ?? [])
        .filter((p) => num(p.qty) > 0 && p.sym)
        .map((p) => ({ sym: p.sym, qty: num(p.qty) })),
      cash: num(d.summary?.offshore?.cashUsd) ?? 0,
    }))
    .filter((s) => s.positions.length)
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}
