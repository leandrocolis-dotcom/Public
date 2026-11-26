// Contexto do ativo no detalhe da aba "Análise": resumo da empresa, manchetes, analistas e últimos financeiros.
// Busca api/profile sob demanda (1 ativo por vez) e guarda na memória da sessão.
import { ptTitle } from "./translate.js";
import { esc, num, pct } from "./format.js";
import { fetchJSON } from "./net.js";
import { leverageOf } from "./etf-fund.js";
import { assetExposure, newsSub, rankImpact } from "./news-impact.js";
import { KIND_OF } from "./champions.js";
import { hq } from "./help.js";
import { state } from "./state.js";

const cache = new Map(); // sym -> Promise<json>

export const REC_PT = { strong_buy: "Compra forte", buy: "Compra", hold: "Manter", underperform: "Abaixo da média", sell: "Venda", none: "–" }; // prettier-ignore
const ACT_PT = {
  up: "eleva",
  down: "rebaixa",
  main: "mantém",
  reit: "reitera",
  init: "inicia",
  target: "alvo",
};

const big = (x) =>
  !Number.isFinite(x)
    ? "–"
    : Math.abs(x) >= 1e12
      ? `${num(x / 1e12, 2)} tri`
      : Math.abs(x) >= 1e9
        ? `${num(x / 1e9, 1)} bi`
        : Math.abs(x) >= 1e6
          ? `${num(x / 1e6, 0)} mi`
          : num(x, 0);

const when = (t) => {
  if (!t) return "";
  const h = (Date.now() / 1000 - t) / 3600;
  return h < 24 ? `há ${Math.max(1, Math.round(h))} h` : `há ${Math.round(h / 24)} d`;
};
const fmtDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "–");

/** Variação contra o mesmo período do ano anterior (trimestral: 4 atrás) ou o anterior (anual). */
export function growth(rows, key, lag) {
  const a = rows.at(-1)?.[key];
  const b = rows.at(-1 - lag)?.[key];
  return Number.isFinite(a) && Number.isFinite(b) && b !== 0
    ? a / Math.abs(b) - (b < 0 ? -1 : 1)
    : null;
}

function summaryCard(p) {
  const pr = p.profile ?? {};
  if (!pr.summary && !pr.sector && !p.fund?.family) return "";
  const k = (l, v) => (v ? `<div><span>${l}</span><b>${v}</b></div>` : "");
  const text = pr.summaryPt ?? pr.summary ?? "";
  const short = text.length > 600 ? `${esc(text.slice(0, 600).replace(/\s\S*$/, ""))}… <details style="display:inline"><summary class="muted" style="display:inline;cursor:pointer">ler tudo</summary>${esc(text.slice(600))}</details>` : esc(text); // prettier-ignore
  return `<div class="card ap-about-src"><h3>Sobre ${p.fund ? "o fundo" : "a empresa"}</h3>
    <div class="kv kv-text">${k("Setor", esc(pr.sector ?? ""))}${k("Indústria", esc(pr.industry ?? ""))}${k("Sede", esc([pr.city, pr.country].filter(Boolean).join(", ")))}${k("Funcionários", pr.employees ? num(pr.employees, 0) : "")}${k("Gestora", esc(p.fund?.family ?? ""))}${k("Categoria", esc(p.fund?.category ?? ""))}${pr.officers?.[0] ? k(esc(pr.officers[0].title ?? "CEO"), esc(pr.officers[0].name)) : ""}</div>
    ${text ? `<p style="margin-top:8px;line-height:1.5">${p.fund ? "<b>Estratégia:</b> " : "<b>Atividades:</b> "}${short}</p><p class="note">${pr.summaryPt ? "Descrição do Yahoo Finance, traduzida automaticamente." : "Descrição em inglês, do Yahoo Finance."}${pr.website ? ` Site: <a href="${esc(pr.website)}" target="_blank" rel="noopener">${esc(pr.website.replace(/^https?:\/\//, ""))}</a>` : ""}</p>` : ""}</div>`;
}

function fundCard(f) {
  if (!f || (!f.holdings.length && !f.sectors.length)) return "";
  const rows = (l) => l.map(([a, b, t]) => `<tr><td title="${esc(t ?? "")}">${a}</td><td class="num">${b}</td></tr>`).join(""); // prettier-ignore
  const w = (x, d = 1) => pct(x, d).replace(/^\+/, ""); // peso, não variação: sem "+"
  return `<div class="card"><h3>Composição do fundo</h3><div class="grid fund-comp">
    ${f.holdings.length ? `<div><div class="lab">10 maiores posições</div><table class="tbl"><tbody>${rows(f.holdings.map((h) => [`<b>${esc(h.sym ?? "")}</b> <span class="muted">${esc(h.name ?? "")}</span>`, w(h.w), `${h.sym ?? ""} ${h.name ?? ""}`]))}</tbody></table></div>` : ""}
    ${f.sectors.length ? `<div><div class="lab">Setores</div><table class="tbl"><tbody>${rows(f.sectors.map((s) => [esc(s.k.replace(/_/g, " ")), w(s.w)]))}</tbody></table></div>` : ""}
    </div>${Number.isFinite(f.stock) ? `<p class="note">Ações ${w(f.stock, 0)} · títulos ${w(f.bond ?? 0, 0)} · caixa ${w(f.cash ?? 0, 0)}.</p>` : ""}</div>`;
}

function newsCard(news) {
  if (!news?.length)
    return `<div class="card"><h3>Últimas manchetes</h3><p class="muted">Sem manchetes recentes encontradas.</p></div>`;
  return `<div class="card"><h3>Últimas manchetes</h3><ul style="margin:0;padding-left:18px">${news
    .map((n) => `<li style="margin:4px 0"><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(ptTitle(n))}</a> <span class="muted" style="font-size:.8rem">${when(n.t)}</span></li>`)
    .join("")}</ul><p class="note">Yahoo Finance, traduzido automaticamente. Abre no site da fonte.</p></div>`; // prettier-ignore
}

function analystCard(a, price) {
  const t = a?.trend;
  const tot = t ? t.sb + t.b + t.h + t.s + t.ss : 0;
  if (!tot && !a?.target?.mean && !a?.changes?.length) return "";
  const seg = (n, c, l) => (n ? `<div title="${l}: ${n}" style="flex:${n};background:var(--${c});color:#fff;font-size:.75rem;text-align:center;padding:2px 0">${n}</div>` : ""); // prettier-ignore
  const tg = a.target ?? {};
  const up = Number.isFinite(tg.mean) && price > 0 ? tg.mean / price - 1 : null;
  const k = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
  return `<div class="card"><h3>Opinião dos analistas</h3>
    ${tot ? `<div style="display:flex;border-radius:6px;overflow:hidden;margin:6px 0">${seg(t.sb, "buy", "Compra forte").replace("background:", "filter:brightness(.75);background:")}${seg(t.b, "buy", "Compra")}${seg(t.h, "wait", "Manter")}${seg(t.s, "sell", "Venda")}${seg(t.ss, "sell", "Venda forte")}</div>
      <div class="muted" style="font-size:.8rem">Compra forte ${t.sb} · compra ${t.b} · manter ${t.h} · venda ${t.s} · venda forte ${t.ss} (${tot} analistas, mês atual)</div>` : ""}
    <div class="kv" style="margin-top:8px">${k("Consenso", `${esc(REC_PT[a.recKey] ?? a.recKey ?? "–")}${Number.isFinite(a.recMean) ? ` (${num(a.recMean, 1)} de 1 a 5)` : ""}`)}${k("Preço-alvo médio", num(tg.mean))}${k("Potencial", up === null ? "–" : `<span class="${up >= 0 ? "pos" : "neg"}">${pct(up)}</span>`)}${k("Alvo mín – máx", Number.isFinite(tg.low) ? `${num(tg.low)} – ${num(tg.high)}` : "–")}</div>
    ${a.changes?.length ? `<div class="lab" style="margin-top:10px">Mudanças recentes</div><div class="tw"><table class="tbl"><tbody>${a.changes
      .map((c) => `<tr><td class="muted">${fmtDate(c.date)}</td><td>${esc(c.firm)}</td><td>${esc(ACT_PT[c.action] ?? c.action ?? "")} ${c.from && c.from !== c.to ? `${esc(c.from)} → ` : ""}<b>${esc(c.to ?? "")}</b></td><td class="num">${c.pt ? `alvo ${num(c.pt)}${c.ptPrior && c.ptPrior !== c.pt ? ` <span class="muted">(${num(c.ptPrior)})</span>` : ""}` : ""}</td></tr>`)
      .join("")}</tbody></table></div>` : ""}
    <p class="note">Consenso de sell-side via Yahoo Finance. Analistas erram e costumam ser otimistas: use como termômetro, não como decisão.</p></div>`; // prettier-ignore
}

function financialsCard(p) {
  const q = p.financials?.quarterly ?? [];
  const y = p.financials?.annual ?? [];
  const e = p.earnings ?? {};
  if (!q.length && !y.length && !e.history?.length) return "";
  const keys = [["TotalRevenue", "Receita"], ["OperatingIncome", "Lucro operacional"], ["NetIncome", "Lucro líquido"], ["DilutedEPS", "LPA diluído"], ["FreeCashFlow", "Fluxo de caixa livre"]]; // prettier-ignore
  const table = (rows, lab) => {
    if (!rows.length) return "";
    const ks = keys.filter(([kk]) => rows.some((r) => Number.isFinite(r[kk])));
    const lag = lab === "tri" ? 4 : 1;
    return `<table class="tbl" style="margin-top:6px"><thead><tr><th></th>${rows.map((r) => `<th class="num">${lab === "tri" ? fmtDate(r.date).slice(3) : r.date.slice(0, 4)}</th>`).join("")}<th class="num">${lab === "tri" ? "a/a" : "ano"}</th></tr></thead><tbody>
      ${ks.map(([kk, l]) => {
        const gr = growth(rows, kk, lag);
        return `<tr><td>${l}</td>${rows.map((r) => `<td class="num">${kk === "DilutedEPS" ? num(r[kk], 2) : big(r[kk])}</td>`).join("")}<td class="num ${gr === null ? "" : gr >= 0 ? "pos" : "neg"}">${gr === null ? "–" : pct(gr, 0)}</td></tr>`;
      }).join("")}
      ${ks.some(([kk]) => kk === "NetIncome") && ks.some(([kk]) => kk === "TotalRevenue") ? `<tr><td class="muted">Margem líquida</td>${rows.map((r) => `<td class="num muted">${r.TotalRevenue > 0 && Number.isFinite(r.NetIncome) ? `${num((r.NetIncome / r.TotalRevenue) * 100, 0)}%` : "–"}</td>`).join("")}<td></td></tr>` : ""}
      </tbody></table>`;
  }; // prettier-ignore
  const beats = (e.history ?? []).filter(
    (h) => Number.isFinite(h.actual) && Number.isFinite(h.est),
  );
  return `<div class="card"><h3>Últimos dados financeiros</h3>
    ${e.next ? `<p>Próximo balanço: <b>${fmtDate(e.next)}</b>${Number.isFinite(e.epsEst) ? ` · LPA esperado ${num(e.epsEst, 2)}` : ""}${Number.isFinite(e.revEst) ? ` · receita esperada ${big(e.revEst)}` : ""}</p>` : ""}
    ${q.length ? `<div class="lab">Trimestral</div><div style="overflow-x:auto">${table(q, "tri")}</div>` : ""}
    ${y.length ? `<div class="lab" style="margin-top:10px">Anual</div><div style="overflow-x:auto">${table(y, "ano")}</div>` : ""}
    ${beats.length ? `<div class="lab" style="margin-top:10px">LPA: realizado vs. esperado</div><div class="kv">${beats.map((h) => `<div><span>${esc(h.q)}</span><b class="${h.actual >= h.est ? "pos" : "neg"}">${num(h.actual, 2)} <span class="muted">vs ${num(h.est, 2)}</span></b></div>`).join("")}</div>` : ""}
    <p class="note">Valores na moeda do balanço. a/a = trimestre contra o mesmo trimestre do ano anterior. Fonte: Yahoo Finance.</p></div>`; // prettier-ignore
}

/** HTML de todo o contexto (puro, testável). */
export function contextHtml(p, price, { noNews = false } = {}) {
  if (!p) return "";
  return (
    summaryCard(p) +
    fundCard(p.fund) +
    analystCard(p.analysts, price) +
    financialsCard(p) +
    (noNews ? "" : newsCard(p.news))
  );
}

const SCORE_CLS = (s) => (s >= 3 ? "buy" : s <= -3 ? "sell" : "wait");
const signed = (s) => `${s > 0 ? "+" : s < 0 ? "−" : ""}${Math.abs(s)}`;
const balWord = (b) => (b >= 5 ? "muito positivo" : b >= 2 ? "positivo" : b <= -5 ? "muito negativo" : b <= -2 ? "negativo" : "neutro"); // prettier-ignore

/** Cartão "Notícias e impacto": saldo, radar geopolítico e ranking de −10 a +10 (puro, testável). */
export function impactCardHtml(sym, rk, { loadingMarket = false } = {}) {
  if (!rk) return "";
  const row = (x) => `<li class="ni-row"><span class="tag ${SCORE_CLS(x.score)} ni-score" title="Nota de impacto no ativo">${signed(x.score)}</span><div><a href="${esc(x.link ?? "#")}" target="_blank" rel="noopener">${esc(ptTitle(x))}</a><div class="muted small">${esc(x.tier)} · ${esc(x.why)} · ${esc(x.source ?? "")} ${when(x.t)}</div></div></li>`; // prettier-ignore
  const top = rk.items.slice(0, 12);
  const rest = rk.items.slice(12);
  const geo = rk.geo.length
    ? `<p class="small"><b>Radar geopolítico</b>${hq("geo")}: ${rk.geo.map((g) => `<span class="tag ${SCORE_CLS(g.avg)}" title="${g.n} manchete(s); efeito médio neste ativo">${esc(g.label)} ${signed(g.avg)}</span>`).join(" ")}</p>` // prettier-ignore
    : `<p class="small muted">Radar geopolítico: nenhum tema geopolítico com efeito neste ativo nas manchetes recentes.</p>`;
  return `<div class="card" id="newsImpact" data-sym="${esc(sym)}"><h3>Notícias e impacto no ativo${hq("newsImpact", { sym, balance: rk.balance, n: rk.n })}</h3>
    <p><span class="tag ${SCORE_CLS(rk.balance)}" style="font-size:1rem">Saldo ${signed(rk.balance)}</span> <b>${balWord(rk.balance)}</b> <span class="muted small">em ${rk.n} notícia(s) com efeito, últimos 7 dias (as mais novas pesam mais) · confiança ${esc(rk.conf.toLowerCase())}</span></p>
    ${geo}
    ${top.length ? `<ol class="ni-list">${top.map(row).join("")}</ol>` : `<p class="muted">Nenhuma manchete recente ligada a ${esc(sym)}, ao setor, à região ou à geopolítica.</p>`}
    ${rest.length ? `<details><summary class="small">Mais ${rest.length} manchete(s)</summary><ol class="ni-list">${rest.map(row).join("")}</ol></details>` : ""}
    ${loadingMarket ? `<p class="muted small">Carregando as manchetes de mercado e geopolítica…</p>` : ""}
    <p class="note">Nota de −10 a +10 pelo impacto provável <b>neste ativo</b>: relevância (cita a empresa, uma posição do fundo, o setor, a região, ou é macro/geopolítica) × tom da manchete × exposição do ativo ao tema (ex.: petróleo subindo é bom para energia e ruim para aéreas). Motor de regras sobre o título, sem IA por enquanto: pode errar ironia e contexto. Na Decisão do trader, as notícias entram em <b>modo sombra</b>: aparecem, mas não pesam até o diário medir se acertam. Material educacional; não é recomendação de investimento.</p></div>`;
}

/** Ranking para o ativo com as manchetes do Yahoo (ativo) + feed de mercado (setor, região, macro, geopolítica). */
export const lastImpact = new Map(); // sym -> ranking mais recente (lido pela Decisão do trader, modo sombra)
export function impactFor(sym, p, name = "", u = null) {
  const lv = leverageOf(sym, name);
  const meta = KIND_OF[sym] ?? {};
  const base = lv ? u : p;
  if (!base && !state.news?.items) return null;
  const ax = assetExposure(lv ? lv.under : sym, base ?? {}, {
    ...meta,
    kind: lv?.lev < 0 ? "INV" : meta.kind,
  });
  const own = (base?.news ?? []).map((n) => ({ ...n, own: true }));
  const rk = rankImpact([...own, ...(state.news?.items ?? [])], ax);
  lastImpact.set(sym, rk);
  return rk;
}
export { newsSub };

/** Contexto do ativo de referência de um alavancado/inverso: manchetes e analistas de quem move o preço. */
export function underlyingHtml(sym, lv, p) {
  if (!p) return "";
  return `<h3 style="margin:14px 0 6px">Ativo de referência: ${esc(lv.under)} (${lv.lev > 0 ? "" : "inverso, "}${Math.abs(lv.lev)}x)</h3><p class="note">${esc(sym)} replica ${Math.abs(lv.lev)}x a variação diária de ${esc(lv.under)}${lv.lev < 0 ? ", no sentido contrário" : ""}: as notícias acima e as perspectivas abaixo são as de ${esc(lv.under)}.</p>${analystCard(p.analysts, p.price)}${fundCard(p.fund)}`; // prettier-ignore
}

export const load = (sym) => {
  if (!cache.has(sym))
    cache.set(
      sym,
      fetchJSON(`api/profile?symbol=${encodeURIComponent(sym)}`).catch((e) => {
        cache.delete(sym);
        throw e;
      }),
    );
  return cache.get(sym);
};

/** Resumo curto do ativo (empresa: setor, indústria e atividades; ETF: gestora, estratégia e maiores posições). */
export function aboutHtml(p) {
  if (!p) return "";
  return summaryCard(p) + (p.fund ? fundCard(p.fund) : "");
}

/** Busca e preenche o contêiner #apAbout do detalhe de um ativo da carteira. */
export async function mountAbout(sym) {
  const box = () => document.querySelector(`#apAbout[data-sym="${CSS.escape(sym)}"]`);
  try {
    const p = await load(sym);
    if (box())
      box().innerHTML =
        aboutHtml(p) ||
        `<div class="card"><p class="muted">Sem descrição disponível para ${esc(sym)}.</p></div>`;
  } catch {
    if (box())
      box().innerHTML = `<div class="card"><p class="muted">Não foi possível carregar o resumo de ${esc(sym)} agora.</p></div>`;
  }
}

/** Busca e preenche o contêiner #anCtx do detalhe aberto. */
export async function mountContext(sym, price, name = "") {
  const lv = leverageOf(sym, name);
  try {
    const [p, u] = await Promise.all([
      load(sym).catch((e) => {
        if (!lv) throw e;
        return null;
      }),
      lv ? load(lv.under).catch(() => null) : null,
    ]);
    const box = document.querySelector(`#anCtx[data-sym="${CSS.escape(sym)}"]`);
    const needMarket = !state.news?.items;
    if (box)
      box.innerHTML =
        impactCardHtml(sym, impactFor(sym, p, name, u), { loadingMarket: needMarket }) +
          contextHtml(p, price, { noNews: true }) +
          (lv ? underlyingHtml(sym, lv, u) : "") ||
        `<p class="muted">Sem contexto disponível para ${esc(sym)}.</p>`;
    // manchetes de mercado (setor, região, geopolítica) ainda não carregadas: busca e redesenha só o cartão
    if (needMarket)
      import("./feeds.js")
        .then((m) => m.loadNews())
        .finally(() => {
          const card = document.querySelector(`#newsImpact[data-sym="${CSS.escape(sym)}"]`);
          if (card) card.outerHTML = impactCardHtml(sym, impactFor(sym, p, name, u));
        });
  } catch {
    const box = document.querySelector(`#anCtx[data-sym="${CSS.escape(sym)}"]`);
    if (box)
      box.innerHTML = `<div class="card"><p class="muted">Não foi possível carregar o contexto de ${esc(sym)} agora. Abra de novo em instantes.</p></div>`;
  }
}
