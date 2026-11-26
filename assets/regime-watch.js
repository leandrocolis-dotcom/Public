// Vigia de regime da CARTEIRA (Oportunidades ↔ Carteira): para cada ativo que o usuário tem, compara o estado de agora
// com o do pregão anterior. Se piorou (decisão rebaixada, perdeu a média de 200 dias, médio prazo virou contra), o
// ativo ganha destaque laranja, vai para o topo das listas e gera um aviso (1 por ativo por dia). Leitura: pode ser
// hora de realizar parte do lucro ou proteger a posição. Material educacional; não é ordem.
import { an, holdingDecision } from "./analysis-data.js";
import { holdNow } from "./decision.js";
import { mediumTerm } from "./level-alerts.js";
import { nyDate } from "./live.js";
import { store, state } from "./state.js";
import { esc, pct } from "./format.js";
import { REGIME_TIP, above200, worsened } from "./regime-rules.js";

export { worsened };
const KEY = "pendulo.regimeWatch";

/** Estado de um ativo em carteira: ação com posição, tom, acima da MM200 e médio prazo. */
export function holdingState(sym) {
  const h = holdingDecision(sym);
  if (!h?.dec?.now) return null;
  const now = holdNow(h.dec.now);
  const c = h.r.series?.close ?? [];
  const row = state.valuation?.rows?.find((x) => x.sym === sym);
  const price = row?.price ?? c.at(-1);
  return {
    label: now.label,
    tone: now.tone,
    up200: above200([...c.slice(0, -1), price]),
    mt: +mediumTerm(h.dec).dir.toFixed(3),
    price,
    day: row?.dayPLPct ?? null,
    gain: row?.totalPLPct ?? row?.plPct ?? null,
  };
}

/** Atualiza a memória (último estado de ontem × agora) e devolve os ativos que pioraram. */
export function regimeShifts(now = Date.now()) {
  const syms = (state.portfolio?.holdings ?? []).filter((h) => h.qty > 0).map((h) => h.sym);
  if (!syms.length) return [];
  const today = nyDate(now / 1000);
  const mem = store.get(KEY, {});
  const out = [];
  let dirty = false;
  for (const sym of syms) {
    if (!an.items[sym]) continue;
    const cur = holdingState(sym);
    if (!cur) continue;
    const rec = mem[sym] ?? {};
    if (rec.d !== today) {
      // virou o dia: o último estado visto no pregão anterior é a referência de hoje
      if (rec.cur) rec.prev = rec.cur;
      rec.d = today;
      rec.notified = false;
    }
    rec.cur = cur;
    mem[sym] = rec;
    dirty = true;
    const why = worsened(rec.prev, cur);
    if (why.length)
      out.push({ sym, name: an.items[sym]?.name ?? sym, from: rec.prev, to: cur, why, rec });
  }
  if (dirty) store.set(KEY, mem);
  return out;
}

/** Ativos que pioraram hoje (consulta rápida para destacar linhas). */
let last = { at: 0, list: [] };
export function shiftsNow() {
  if (Date.now() - last.at > 5_000) last = { at: Date.now(), list: regimeShifts() };
  return last.list;
}
export const shiftOf = (sym) => shiftsNow().find((x) => x.sym === sym) ?? null;

/** Avisa (tela + celular) 1 vez por ativo por dia. notify(title, body, url). */
export function notifyShifts(notify) {
  const mem = store.get(KEY, {});
  for (const s of shiftsNow()) {
    if (mem[s.sym]?.notified) continue;
    notify(`⚠ ${s.sym}: o regime piorou`, `${s.why.join("; ")}. ${REGIME_TIP}`, `./?tab=portfolio&hold=${encodeURIComponent(s.sym)}`); // prettier-ignore
    mem[s.sym] = { ...mem[s.sym], notified: true };
  }
  store.set(KEY, mem);
}

/** Faixa de destaque (Sinais de hoje e Carteira). */
export function regimeBannerHtml() {
  const list = shiftsNow();
  if (!list.length) return "";
  const chips = list
    .map(
      (s) =>
        `<button class="rs-chip" data-hold="${esc(s.sym)}"><b>${esc(s.sym)}</b> <span>${esc(s.from.label)} → ${esc(s.to.label)}</span>${s.to.day != null ? ` <span class="muted">hoje ${pct(s.to.day, 1)}</span>` : ""}<small>${esc(s.why.join(" · "))}</small></button>`,
    ) // prettier-ignore
    .join("");
  return `<section class="card regime-alert"><h2>⚠ ${list.length === 1 ? "1 ativo da sua carteira mudou" : `${list.length} ativos da sua carteira mudaram`} de regime para pior</h2>
    <p class="small">Comparado ao pregão anterior: decisão rebaixada, perda da média de 200 dias ou médio prazo virando contra. Pode ser uma boa hora para realizar parte do lucro ou subir o stop antes de uma queda. Toque para ver o ativo. Material educacional; não é ordem.</p>
    <div class="rs-chips">${chips}</div></section>`;
}
