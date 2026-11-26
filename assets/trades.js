// 👍 Meus trades: o usuário marca a oportunidade em que entrou; o app acompanha o ativo depois (como um backtest
// ao vivo, fora da amostra) e critica o modelo: cada regra acertou nos trades reais o que prometia no histórico?
// Fica neste aparelho e, com login, na nuvem (tabela pendulo_trades), onde o treino diário também lê os ativos.
import { esc, num, pct } from "./format.js";
import { fetchJSON } from "./net.js";
import { hooks, state, store } from "./state.js";
import { FLOW_ASSETS } from "./flow-universe.js";
import * as cloud from "./cloud.js";

const KEY = "pendulo.trades";
export const HORIZONS = [1, 5, 10, 21]; // pregões depois da entrada
export const VERDICT_H = 5; // mesma janela do "histórico da regra" (acerto = subiu em 5 pregões)
const INV = new Set(FLOW_ASSETS.filter((a) => a.inv).map((a) => a.sym));

export const loadTrades = () => {
  const l = store.get(KEY, []);
  return Array.isArray(l) ? l : [];
};
const saveTrades = (l) => store.set(KEY, l);

/** Id do trade: ativo + regra + dia. O mesmo sinal no mesmo dia é um trade só (o 👍 liga e desliga). */
export const tradeId = (sym, code, day) => `${sym}|${code}|${day}`;

/** Registro a partir do sinal na tela (só o que é preciso para acompanhar e criticar depois). Puro. */
export function tradeFromSignal(sg, { day, stats = null, at = new Date().toISOString() } = {}) {
  const st = stats?.rules?.[sg.code];
  const inv = INV.has(sg.sym);
  // o sinal das séries invertidas é calculado em 1/preço: guarda o preço de mercado
  const price = sg.ind?.price > 0 ? (inv ? 1 / sg.ind.price : sg.ind.price) : null;
  return {
    id: tradeId(sg.sym, sg.code, day),
    sym: sg.sym,
    label: sg.label,
    code: sg.code,
    kind: sg.kind,
    title: sg.title,
    scope: sg.scope,
    day,
    at,
    // séries invertidas (moedas cotadas ao contrário): o sinal e o acompanhamento usam 1/preço
    inv: inv || undefined,
    price,
    strength: sg.strength ?? null,
    flags: {
      noEdge: !!sg.noEdge,
      veto: !!sg.veto?.length,
      againstRegime: !!sg.againstRegime,
      momStrong: sg.mom ? sg.mom.m12Pct >= 0.7 : null,
      provisional: !!sg.provisional,
    },
    promise: st?.n ? { hitRate: st.hitRate, avgFwd: st.avgFwd, n: st.n } : null,
  };
}

/**
 * Como o ativo andou depois da entrada. series = { dates, close } (fechamentos), bench = SPY na mesma base.
 * Retorno em h pregões = fechamento h pregões depois do dia da entrada ÷ preço da entrada − 1. Puro.
 */
export function evalTrade(t, series, bench = null) {
  if (!series?.dates?.length) return null;
  const tr = (x) => (t.inv ? 1 / x : x);
  const i0 = series.dates.indexOf(t.day);
  if (i0 < 0) return null;
  const c = series.close;
  const entry = t.price > 0 ? tr(t.price) : tr(c[i0]);
  const last = c.length - 1;
  const ret = (i) => (i <= last && c[i] > 0 ? tr(c[i]) / entry - 1 : null);
  const bi = bench?.dates ? bench.dates.indexOf(t.day) : -1;
  const bret = (h) =>
    bi >= 0 && bi + h < bench.close.length && bench.close[bi] > 0
      ? bench.close[bi + h] / bench.close[bi] - 1
      : null;
  const at = {};
  for (const h of HORIZONS) {
    const r = ret(i0 + h);
    at[h] = r === null ? null : { r, ex: bret(h) === null ? null : r - bret(h) };
  }
  let peak = entry;
  let mdd = 0;
  for (let i = i0 + 1; i <= last; i++) {
    const v = tr(c[i]);
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
  }
  const sessions = last - i0;
  const v = at[VERDICT_H];
  // entrada: acerto = subiu; saída/risco: acerto = caiu (mesma régua do histórico de cada regra)
  const hit = v ? (t.kind === "entry" ? v.r > 0 : v.r < 0) : null;
  return { sessions, now: ret(last), at, mdd, hit, beatSpy: v?.ex == null ? null : v.ex > 0 };
}

/**
 * Crítica do modelo: por regra, quanto os seus trades acertaram (em 5 pregões) contra o prometido no histórico,
 * e se as marcas de vantagem (momentum, regime, regra sem vantagem) separaram trades bons de ruins. Puro.
 */
export function critique(rows) {
  const done = rows.filter((x) => x.ev?.hit !== null && x.ev?.hit !== undefined);
  const avg = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
  const byRule = {};
  for (const x of done) {
    const g = (byRule[x.t.code] ??= { code: x.t.code, title: x.t.title, n: 0, hits: 0, rs: [], promise: x.t.promise }); // prettier-ignore
    g.n++;
    if (x.ev.hit) g.hits++;
    g.rs.push(x.ev.at[VERDICT_H].r);
  }
  const rules = Object.values(byRule).map((g) => {
    const hitRate = g.hits / g.n;
    const avgR = avg(g.rs);
    const exp = g.promise?.hitRate ?? null;
    const small = g.n < 10;
    const verdict =
      exp === null
        ? "sem histórico para comparar"
        : hitRate >= exp
          ? "entregou o prometido"
          : hitRate >= exp - 0.15
            ? "um pouco abaixo do prometido"
            : "bem abaixo do prometido";
    return { ...g, hitRate, avgR, exp, small, verdict };
  });
  const split = (pred, yes, no) => {
    const a = done.filter((x) => pred(x.t.flags));
    const b = done.filter((x) => !pred(x.t.flags));
    if (!a.length || !b.length) return null;
    const ra = avg(a.map((x) => x.ev.at[VERDICT_H].r));
    const rb = avg(b.map((x) => x.ev.at[VERDICT_H].r));
    return { yes, no, na: a.length, nb: b.length, ra, rb, helps: ra > rb };
  };
  const flags = [
    split((f) => f.momStrong === true, "momentum forte", "demais"),
    split((f) => f.againstRegime, "contra o regime", "a favor do regime"),
    split((f) => f.noEdge, "regra sem vantagem", "regra com vantagem"),
    split((f) => f.veto, "veto do modelo", "aprovados pelo modelo"),
  ].filter(Boolean);
  const all = done.length
    ? {
        n: done.length,
        hits: done.filter((x) => x.ev.hit).length,
        avgR: avg(done.map((x) => x.ev.at[VERDICT_H].r)),
        beat: done.filter((x) => x.ev.beatSpy).length,
      }
    : null;
  return { all, rules, flags, open: rows.length - done.length };
}

// ───────── séries para acompanhar (fluxo → histórico da carteira → busca sob demanda) ─────────
const fetched = new Map(); // sym -> { dates, close } | Promise

function seriesOf(sym) {
  if (state.flow?.close?.[sym]) return { dates: state.flow.dates, close: state.flow.close[sym] };
  const h = state.history?.[sym];
  if (h?.close?.length) return h;
  const f = fetched.get(sym);
  if (f && !(f instanceof Promise)) return f;
  if (!f)
    fetched.set(
      sym,
      fetchJSON(`api/history?symbols=${encodeURIComponent(sym)}&range=1y`)
        .then((j) => {
          fetched.set(sym, j.series?.[sym] ?? null);
          if (state.prefs.tab === "signals") hooks.render();
        })
        .catch(() => fetched.set(sym, null)),
    );
  return null;
}

/** Trades com o acompanhamento de cada um, mais novos primeiro. */
export function tradeRows() {
  const bench = state.flow?.close?.SPY ? { dates: state.flow.dates, close: state.flow.close.SPY } : null; // prettier-ignore
  return loadTrades()
    .map((t) => ({ t, ev: evalTrade(t, seriesOf(t.sym), bench) }))
    .sort((a, b) => b.t.at.localeCompare(a.t.at));
}

export const isTaken = (sym, code) => {
  const day = state.flow?.dates?.at(-1);
  return loadTrades().some((t) => t.id === tradeId(sym, code, day));
};

/** Liga/desliga o 👍 do sinal (o mesmo sinal no mesmo dia). */
export function toggleTrade(sg) {
  const day = state.flow?.dates?.at(-1) ?? new Date().toISOString().slice(0, 10);
  const l = loadTrades();
  const id = tradeId(sg.sym, sg.code, day);
  const next = l.some((t) => t.id === id)
    ? l.filter((t) => t.id !== id)
    : [...l, tradeFromSignal(sg, { day, stats: state.stats })];
  saveTrades(next);
  pushTrades(next);
  return next.some((t) => t.id === id);
}

export function removeTrade(id) {
  const next = loadTrades().filter((t) => t.id !== id);
  saveTrades(next);
  pushTrades(next);
}

// ───────── nuvem: uma linha por usuário; junta por id (a remoção vale pela lista mais nova) ─────────
async function pushTrades(list) {
  if (!cloud.cloudUser()) return;
  try {
    await cloud.pushTrades(list);
    store.set(`${KEY}.syncedAt`, new Date().toISOString());
  } catch {
    /* tenta de novo na próxima sincronização */
  }
}

export async function syncTrades() {
  if (!cloud.cloudUser()) return false;
  try {
    const r = await cloud.pullTrades();
    const localAt = store.get(`${KEY}.syncedAt`, null);
    const local = loadTrades();
    if (r && Date.parse(r.updatedAt) > Date.parse(localAt ?? 0)) {
      saveTrades(r.trades ?? []);
      store.set(`${KEY}.syncedAt`, r.updatedAt);
      return JSON.stringify(r.trades) !== JSON.stringify(local);
    }
    if (local.length && (!r || JSON.stringify(r.trades) !== JSON.stringify(local))) await pushTrades(local); // prettier-ignore
  } catch {
    /* sem rede: fica a cópia local */
  }
  return false;
}

// ───────── tela ─────────
const p1 = (x) => (x === null || x === undefined ? "–" : pct(x, 1));
const cls = (x) => (x === null || x === undefined ? "" : x >= 0 ? "pos" : "neg");

/** Botão 👍 da linha de oportunidade. */
export function thumbBtn(sg) {
  const on = isTaken(sg.sym, sg.code);
  return `<button type="button" class="thumb" data-trade="${esc(sg.sym)}" data-trade-code="${esc(sg.code)}" aria-pressed="${on}" title="${on ? "Você marcou que fez este trade (toque para desmarcar)" : "Fiz este trade: o app acompanha e avalia o modelo"}">👍${on ? " Fiz" : ""}</button>`;
}

function verdictTag(x) {
  if (!x.ev) return `<span class="tag neutral">aguardando dados</span>`;
  if (x.ev.hit === null)
    return `<span class="tag neutral">${x.ev.sessions}/${VERDICT_H} pregões</span>`;
  return x.ev.hit ? `<span class="tag buy">acertou</span>` : `<span class="tag sell">errou</span>`;
}

export function tradesCardHtml() {
  const rows = tradeRows();
  if (!rows.length)
    return `<section class="card trades-card"><h2>👍 Meus trades</h2><p class="muted">Toque em <b>👍</b> numa oportunidade quando fizer o trade. O app acompanha o ativo nos pregões seguintes, como um backtest ao vivo, e mostra aqui se cada regra entregou o que promete no histórico.</p></section>`;
  const c = critique(rows);
  const head = c.all
    ? `<div class="kv">
        <div><span>Avaliados (${VERDICT_H} pregões)</span><b>${c.all.n}</b></div>
        <div><span>Acerto</span><b>${pct(c.all.hits / c.all.n, 0).replace("+", "")}</b></div>
        <div><span>Média em ${VERDICT_H} pregões</span><b class="${cls(c.all.avgR)}">${p1(c.all.avgR)}</b></div>
        <div><span>Bateram o S&P</span><b>${c.all.beat} de ${c.all.n}</b></div>
        <div><span>Em andamento</span><b>${c.open}</b></div></div>`
    : `<p class="muted">${c.open} trade(s) em andamento. O veredito sai depois de ${VERDICT_H} pregões (a mesma janela do histórico das regras).</p>`;
  const rules = c.rules.length
    ? `<h3>O modelo cumpriu o que prometeu?</h3><ul class="trades-crit">${c.rules
        .map(
          (g) =>
            `<li><b>${esc(g.title)}</b>: acertou ${g.hits} de ${g.n} (${pct(g.hitRate, 0).replace("+", "")})${g.exp !== null ? ` contra ${pct(g.exp, 0).replace("+", "")} no histórico` : ""}, média ${p1(g.avgR)} em ${VERDICT_H} pregões. <span class="${g.verdict.startsWith("entregou") ? "pos" : g.verdict.startsWith("sem") ? "muted" : "neg"}">${esc(g.verdict)}</span>${g.small ? ' <span class="muted small">(amostra pequena: menos de 10 trades)</span>' : ""}.</li>`,
        )
        .join("")}</ul>`
    : "";
  const flags = c.flags.length
    ? `<h3>As marcas do modelo ajudaram?</h3><ul class="trades-crit">${c.flags
        .map(
          (f) =>
            `<li>Trades com <b>${esc(f.yes)}</b> renderam ${p1(f.ra)} (${f.na}) contra ${p1(f.rb)} (${f.nb}) nos ${esc(f.no)}: ${f.helps ? "essa marca separou trades melhores" : "essa marca não ajudou nos seus trades"}.</li>`,
        )
        .join("")}</ul>`
    : "";
  const list = rows
    .slice(0, 40)
    .map((x) => {
      const a = x.ev?.at ?? {};
      return `<tr data-sym="${esc(x.t.sym)}"><td><b>${esc(x.t.sym)}</b><div class="muted small">${esc(x.t.title)}</div></td>
        <td class="nowrap">${x.t.day.split("-").reverse().join("/")}<div class="muted small">${num(x.t.price, 2)}</div></td>
        ${HORIZONS.map((h) => `<td class="num ${cls(a[h]?.r)}">${p1(a[h]?.r)}</td>`).join("")}
        <td class="num ${cls(x.ev?.now)}">${p1(x.ev?.now)}</td><td class="num neg">${x.ev ? p1(x.ev.mdd) : "–"}</td>
        <td>${verdictTag(x)}</td><td><button type="button" class="btn ghost" data-trade-del="${esc(x.t.id)}" title="Remover este trade">✕</button></td></tr>`;
    })
    .join("");
  return `<section class="card trades-card"><h2>👍 Meus trades <span class="muted small">(${rows.length})</span></h2>
    ${head}${rules}${flags}
    <div class="tw" style="box-shadow:none;margin-top:10px"><table><thead><tr><th>Ativo / regra</th><th>Entrada</th>${HORIZONS.map((h) => `<th class="num">${h}d</th>`).join("")}<th class="num">Hoje</th><th class="num">Pior queda</th><th>Veredito</th><th></th></tr></thead><tbody>${list}</tbody></table></div>
    <p class="note">Retorno desde o preço do momento do 👍 até o fechamento de 1, 5, 10 e 21 pregões depois (sem custos nem impostos). Veredito em ${VERDICT_H} pregões, a mesma régua do histórico de cada regra: entrada acerta se subiu. "Bateram o S&P" compara com o SPY no mesmo período. Os ativos marcados entram no treino diário do modelo (modo sombra). Material educacional; não é recomendação de investimento.</p></section>`;
}

// 👍 e ✕ na fase de captura: não abrem o ativo da linha de baixo
if (typeof document !== "undefined")
  document.addEventListener(
    "click",
    (e) => {
      const del = e.target.closest("[data-trade-del]");
      const b = e.target.closest("[data-trade]");
      if (!del && !b) return;
      e.stopPropagation();
      e.preventDefault();
      if (del) removeTrade(del.dataset.tradeDel);
      else {
        const sg = state.signals.find(
          (s) => s.sym === b.dataset.trade && s.code === b.dataset.tradeCode,
        );
        if (sg) toggleTrade(sg);
      }
      hooks.render();
    },
    true,
  );
