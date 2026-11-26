// Medo & Ganância da CNN (0 = medo extremo, 100 = ganância extrema): leitura e bloco da Início. Puro, para testar.
// Dados: GET /api/yields?fg=1 (api/_feargreed.js, endpoint público da CNN, grátis). NÃO entra na nota do pêndulo:
// no estudo (docs/ESTUDO-FEAR-GREED.md, 2021–2026) o "alívio" não bateu dias ao acaso e anda junto com o VIX
// (corr. −0,62 nas variações); só o medo profundo (< 15) teve 20 pregões fortes, com poucos casos. Modo sombra.

export const FG_RATING_PT = { "extreme fear": "Medo extremo", fear: "Medo", neutral: "Neutro", greed: "Ganância", "extreme greed": "Ganância extrema" }; // prettier-ignore
export const FG_PARTS_PT = {
  market_momentum_sp500: "Momento (S&P 500 × média de 125 dias)",
  stock_price_strength: "Força (máximas × mínimas de 52 sem.)",
  stock_price_breadth: "Amplitude (volume em alta × em queda)",
  put_call_options: "Opções (put/call)",
  market_volatility_vix: "Volatilidade (VIX × média de 50 dias)",
  junk_bond_demand: "Demanda por high yield",
  safe_haven_demand: "Porto seguro (ações × Treasuries)",
};

/** Faixa pela nota (as da CNN): 0–25 medo extremo, 25–45 medo, 45–55 neutro, 55–75 ganância, 75–100 extrema. */
export const fgRating = (s) => (s < 25 ? "extreme fear" : s < 45 ? "fear" : s <= 55 ? "neutral" : s <= 75 ? "greed" : "extreme greed"); // prettier-ignore
/** Tom (uma cor = um sentido): medo = defesa (dn), ganância = risco (up). */
export const fgTone = (s) => (s < 45 ? "dn" : s > 55 ? "up" : "mid");

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

/** Resposta da CNN -> { score, rating, at, prev: { close, week, month, year }, parts, hist (últimos 90 dias) }. */
export function parseCnn(j) {
  const fg = j?.fear_and_greed;
  if (!Number.isFinite(fg?.score)) return null;
  const parts = Object.keys(FG_PARTS_PT)
    .filter((k) => Number.isFinite(j[k]?.score))
    .map((k) => ({ key: k, label: FG_PARTS_PT[k], score: r1(j[k].score), rating: j[k].rating ?? fgRating(j[k].score) })); // prettier-ignore
  const hist = (j.fear_and_greed_historical?.data ?? [])
    .slice(-90)
    .map((p) => [new Date(p.x).toISOString().slice(0, 10), r1(p.y)]);
  return {
    score: r1(fg.score),
    rating: fg.rating ?? fgRating(fg.score),
    at: fg.timestamp ?? null,
    prev: { close: r1(fg.previous_close), week: r1(fg.previous_1_week), month: r1(fg.previous_1_month), year: r1(fg.previous_1_year) }, // prettier-ignore
    parts,
    hist,
  };
}

/** Leitura do estudo para o nível de hoje (modo sombra): só o medo profundo (< 15) se destacou. */
export function fgSignal(fg) {
  if (!fg || !Number.isFinite(fg.score)) return null;
  if (fg.score < 15)
    return { key: "deep", text: "Medo profundo (< 15): no estudo 2021–2026, o S&P 500 subiu em média 3,5% nos 20 pregões seguintes (acerto de 83%), contra 1,1% de um dia qualquer. Só 12 casos completos e 9 hipóteses testadas: em observação, não é gatilho." }; // prettier-ignore
  return null;
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); // prettier-ignore
const n0 = (x) => (Number.isFinite(x) ? String(Math.round(x)) : "–");
const dlt = (now, then) => {
  if (!Number.isFinite(then)) return "–";
  const d = Math.round(now - then);
  return `${n0(then)} <i class="${d > 0 ? "up" : d < 0 ? "dn" : "mid"}">${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}</i>`;
};

/** Hora da nota: a CNN recalcula a cada poucos minutos no pregão (`at`); "ao vivo" se tem até 20 min. */
export function fgWhen(at, now = Date.now()) {
  const t = Date.parse(at ?? "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (now - t <= 20 * 60_000) return `ao vivo ${hm}`;
  const day = new Date(now).toDateString() === d.toDateString() ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} `; // prettier-ignore
  return `${day}${hm}`;
}

/** Bloco da Início (embaixo do pêndulo): nota, faixa, hora, comparação e o sinal do estudo. */
export function fgHtml(fg, { err = null, now = Date.now() } = {}) {
  if (!fg) return err ? `<div class="hm-fg idle"><small class="muted">Medo & Ganância (CNN): indisponível agora</small></div>` : ""; // prettier-ignore
  const t = fgTone(fg.score);
  const sig = fgSignal(fg);
  const parts = fg.parts.map((p) => `${esc(p.label)}: ${n0(p.score)} (${esc(FG_RATING_PT[p.rating] ?? p.rating)})`).join("\n"); // prettier-ignore
  return `<div class="hm-fg" title="Medo & Ganância da CNN (0 a 100), 7 componentes:\n${parts}\n\nFica fora da nota do pêndulo: no estudo (2021–2026) anda junto com o VIX, que o pêndulo já usa. Leitura em modo sombra.">
    <span class="hm-fgl">Medo & Ganância <small>CNN${fg.at ? ` · ${esc(fgWhen(fg.at, now))}` : ""}</small></span>
    <b class="hm-fgs ${t}">${n0(fg.score)}</b><span class="hm-fgr ${t}">${esc(FG_RATING_PT[fg.rating] ?? fg.rating)}</span>
    <i class="hm-fgbar" aria-hidden="true"><i style="left:${Math.max(0, Math.min(100, fg.score)).toFixed(1)}%"></i></i>
    <small class="hm-fgc">ontem ${dlt(fg.score, fg.prev.close)} · 1 sem ${dlt(fg.score, fg.prev.week)} · 1 mês ${dlt(fg.score, fg.prev.month)}</small>
    ${sig ? `<small class="hm-fgsig">📍 ${esc(sig.text)}</small>` : ""}
  </div>`;
}
