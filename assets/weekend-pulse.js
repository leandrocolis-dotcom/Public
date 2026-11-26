// Pêndulo no fim de semana (puro, sem DOM). Do fechamento de sexta até o câmbio e os futuros reabrirem no
// domingo à noite (≈17h–18h de NY), nada do regime negocia: a nota ficaria parada no último dado de sexta.
// Nesse vão o pêndulo usa o que negocia 24/7: Bitcoin e Ether (spot; desde 29/05/2026 também os futuros de
// cripto da CME). Ver docs/PENDULO-FIM-DE-SEMANA.md e o estudo docs/ESTUDO-FIM-DE-SEMANA.md.
//
// Conta (calibrada continuamente com o próprio histórico do app, data/flow.json):
//  • variação de cada cripto desde sexta 16:00 de NY (barra de 30 min mais próxima antes do fechamento);
//  • z = variação ÷ (desvio diário dos últimos 90 pregões × √dias corridos desde sexta);
//  • z combinado (Bitcoin e Ether meio a meio; no estudo o Ether antecipou melhor) × correlação diária Bitcoin × SPY (90 pregões, mínimo 0);
//  • assimetria do estudo (Mourey, Shahrour e Șoiman, Finance Research Letters 2025): só a QUEDA do cripto no
//    fds antecipa a segunda; alta pesa UP_W;
//  • nota = 100·tanh(z): um sinal só, sem o termo de amplitude dos blocos (que exagera com uma razão).
// Domingo à noite em diante o pêndulo volta sozinho à prévia normal (futuros, câmbio, Ásia). Modo sombra;
// material educacional, não é recomendação.
import { weekendWindow } from "./weekend.js";

export const WK_SYMS = ["BTC-USD", "ETH-USD"];
const WK_W = { "BTC-USD": 0.5, "ETH-USD": 0.5 };
/** Queda forte do cripto (z combinado ≤ isto): no estudo de 2017–2026, a segunda abriu em média −1,0%. */
export const CRASH_Z = -1.5;
export const WK_LABEL = { "BTC-USD": "Bitcoin", "ETH-USD": "Ether" };
/** Peso da alta do cripto (a queda pesa 1): no estudo, só a queda antecipou a segunda-feira. */
export const UP_W = 0.25;
/** Mercados que reabrem antes de segunda (câmbio ~17h e futuros 18h de domingo, NY) ou o pós de sexta (SPY). */
export const GAP_SYMS = ["ES=F", "NQ=F", "AUDJPY=X", "JPY=X", "SPY", "QQQ"];
/** Sem cotação nova desses mercados há mais que isso (s): vão do fim de semana. */
export const GAP_STALE = 2 * 3600;

/** Estamos no vão do fim de semana (nada do regime negocia)? */
export function weekendGap(quotes, nowSec = Date.now() / 1000) {
  const w = weekendWindow(nowSec);
  if (!w.live) return false;
  let t = 0;
  for (const s of GAP_SYMS) t = Math.max(t, quotes?.[s]?.t ?? 0, quotes?.[s]?.xt ?? 0);
  return !(t > nowSec - GAP_STALE);
}

/** Último preço da série { t, c } até t (s), ou null. */
function priceAtOrBefore(ser, t) {
  if (!ser?.t?.length) return null;
  let r = null;
  for (let i = 0; i < ser.t.length; i++) {
    if (ser.t[i] > t) break;
    if (ser.c[i] > 0) r = ser.c[i];
  }
  return r;
}

/** Desvio diário do ativo e correlação com o SPY nos últimos n pregões de close { SÍMBOLO: [] }. */
export function dailyStats(close, sym, bench = "SPY", n = 90) {
  const a = close?.[sym];
  const b = close?.[bench];
  if (!a || !b) return null;
  const ra = [];
  const rb = [];
  for (let i = Math.max(1, a.length - n); i < a.length; i++) {
    if (a[i] > 0 && a[i - 1] > 0 && b[i] > 0 && b[i - 1] > 0) {
      ra.push(Math.log(a[i] / a[i - 1]));
      rb.push(Math.log(b[i] / b[i - 1]));
    }
  }
  if (ra.length < 30) return null;
  const m = (x) => x.reduce((t, v) => t + v, 0) / x.length;
  const ma = m(ra);
  const mb = m(rb);
  let va = 0;
  let vb = 0;
  let cv = 0;
  for (let i = 0; i < ra.length; i++) {
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
    cv += (ra[i] - ma) * (rb[i] - mb);
  }
  const sd = Math.sqrt(va / (ra.length - 1));
  const rho = va > 0 && vb > 0 ? cv / Math.sqrt(va * vb) : 0;
  return { sd, rho };
}

/** Nota (−100 a +100) de um z: 100·tanh(z). */
export const scoreOfZ = (z) => Math.max(-100, Math.min(100, Math.round(100 * Math.tanh(z))));

/**
 * Leitura do fim de semana: { score, z, rho, items, at, from } ou null sem dado.
 * quotes: cotações ao vivo; series: barras de 30 min { SÍMBOLO: { t, c } }; close: histórico diário.
 */
export function weekendPulse({ quotes, series, close, nowSec = Date.now() / 1000 }) {
  const w = weekendWindow(nowSec);
  if (!w.live) return null;
  const days = Math.max(0.25, (nowSec - w.from) / 86400);
  const items = [];
  let at = 0;
  for (const sym of WK_SYMS) {
    const ref = priceAtOrBefore(series?.[sym], w.from);
    const q = quotes?.[sym];
    const live = q?.p > 0 && q.t > w.from ? { p: q.p, t: q.t } : null;
    const last = series?.[sym]?.t?.length ? { p: series[sym].c.at(-1), t: series[sym].t.at(-1) } : null; // prettier-ignore
    const now = live ?? (last?.t > w.from ? last : null);
    const st = dailyStats(close, sym);
    if (!(ref > 0) || !now || !st?.sd) continue;
    const chg = now.p / ref - 1;
    // desvio por pregão → por dia corrido (ano de 252 pregões e 365 dias) × √dias desde sexta
    const z = Math.log(1 + chg) / (st.sd * Math.sqrt(252 / 365) * Math.sqrt(days));
    items.push({ sym, label: WK_LABEL[sym], chg, z, rho: st.rho });
    at = Math.max(at, now.t);
  }
  if (!items.length) return null;
  const wt = items.reduce((t, x) => t + WK_W[x.sym], 0);
  const z = items.reduce((t, x) => t + WK_W[x.sym] * x.z, 0) / wt;
  const btc = items.find((x) => x.sym === "BTC-USD") ?? items[0];
  const rho = Math.max(0, Math.min(1, btc.rho));
  const zEff = rho * z * (z < 0 ? 1 : UP_W);
  return { score: scoreOfZ(zEff), z, zEff, rho, items, at, from: w.from, crash: z <= CRASH_Z };
}
