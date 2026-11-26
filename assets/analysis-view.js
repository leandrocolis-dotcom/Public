// Aba "Análise": lista de tickers -> ranking com nota integrada (técnico, momentum, fundamentos, analistas) e detalhe.
import { dismissible } from "./dismiss.js";
import { lastImpact, mountContext, newsSub } from "./analysis-context.js";
import { PILLARS, WEIGHTS } from "./integrated.js";
import { SUB_LABEL, holdNow, traderDecision } from "./decision.js";
import { hq } from "./help.js";
import {
  an,
  ensureAnalysis,
  holdingDecision,
  parseList,
  portfolioSyms,
  runAnalysis,
} from "./analysis-data.js";
import { esc, num, pct } from "./format.js";
import { openDrawer } from "./charts.js";
import { livePrice } from "./market.js";
import { assetPanelHtml, mountAssetPanel, quoteFromBars } from "./asset-pop.js";
import { state } from "./state.js";
import { initQuant, quantCardHtml, quantDetailHtml, quantOf } from "./quant-view.js";

const TAG = { buy: "buy", sell: "sell", wait: "wait" };
const sc = (x) => (Number.isFinite(x) ? Math.round(x) : "–");
const bar = (x) =>
  `<div style="height:5px;border-radius:3px;background:var(--line);overflow:hidden;min-width:44px"><div style="height:100%;width:${Number.isFinite(x) ? x : 0}%;background:var(--${!Number.isFinite(x) ? "line" : x >= 60 ? "buy" : x < 40 ? "sell" : "wait"})"></div></div>`;
const scaleTag = (r) =>
  r.scale
    ? `<span class="tag ${TAG[r.scale.tone]}">${esc(r.scale.label)}</span>`
    : `<span class="tag wait">Sem nota</span>`;

function rows(list) {
  return list
    .map((s) => an.items[s])
    .filter(Boolean)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

export function viewAnalysis() {
  const list = parseList(state.prefs.anList ?? "");
  const held = portfolioSyms();
  const rs = rows(list);
  const body = rs
    .map(
      (r) => `<tr class="click" data-an-sym="${esc(r.sym)}" tabindex="0">
        <td><b>${esc(r.sym)}</b> <span class="muted">${esc((r.name ?? "").slice(0, 28))}</span>${held.includes(r.sym) ? ' <span class="tag neutral">carteira</span>' : ""}</td>
        <td class="num"><b>${sc(r.score)}</b></td><td>${scaleTag(r)}</td>
        ${["tech", "mom", "fund", "analyst"].map((k) => `<td class="num">${sc(r.pillars[k].score)}${bar(r.pillars[k].score)}</td>`).join("")}
        <td>${esc(r.confidence ?? "–")}${r.conflict ? ' <span class="tag wait" title="Técnico e fundamentos discordam muito">conflito</span>' : ""}</td>
        <td class="muted">${r.risk.warn.length ? `⚠ ${r.risk.warn.length}` : "–"}</td></tr>`,
    )
    .join("");
  const status = an.loading
    ? `<span class="muted">Analisando… (até ~10 s por lote de 15)</span>`
    : an.missing?.length
      ? `<span class="muted">Sem dados: ${esc(an.missing.join(", "))}</span>`
      : "";
  return `<div class="card">
      <h3>Análise integrada por ativo</h3>
      <p class="muted" style="margin:4px 0 10px">Cole tickers separados por vírgula (ações e ETFs dos EUA; Brasil com <b>.SA</b>, ex.: PETR4.SA) ou use a sua carteira. Até 45 por vez.</p>
      <textarea id="anInput" rows="2" style="width:100%;height:64px;min-height:0;resize:vertical;font:inherit;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:inherit" placeholder="AAPL, MSFT, VOO, PETR4.SA">${esc(state.prefs.anList ?? "")}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn" data-an-act="run">Analisar</button>
        <button class="btn ghost" data-an-act="portfolio" ${held.length ? "" : "disabled title='Importe a carteira na aba Carteira'"}>Usar carteira (${held.length})</button>
        <button class="btn ghost" data-an-act="refresh">Atualizar dados</button>
        <button class="btn ghost" data-an-act="clear">Limpar</button>
        ${status}
      </div></div>
    ${
      rs.length
        ? `<div class="tw" style="margin-top:var(--gap)"><table data-sortable="an"><thead><tr><th>Ativo</th><th class="num">Nota${hq("score")}</th><th>Escala</th>${Object.entries(
            PILLARS,
          )
            .map(
              ([k, l]) => `<th class="num" title="Peso ${Math.round(WEIGHTS[k] * 100)}%">${l}</th>`,
            )
            .join(
              "",
            )}<th>Confiança${hq("conf")}</th><th>Riscos</th></tr></thead><tbody>${body}</tbody></table></div>`
        : list.length && !an.loading
          ? `<div class="card empty" style="margin-top:var(--gap)">Clique em <b>Analisar</b>.</div>`
          : ""
    }
    ${an.errors.length ? `<p class="note">Avisos: ${esc(an.errors.slice(0, 4).join(" · "))}</p>` : ""}
    <p class="note">Nota 0–100 = média ponderada dos pilares disponíveis: técnico ${WEIGHTS.tech * 100}%, momentum ${WEIGHTS.mom * 100}%, fundamentos ${WEIGHTS.fund * 100}%, analistas ${WEIGHTS.analyst * 100}%. Escala: ≥ 75 compra forte · 60–75 compra · 40–60 neutro/manter · 25–40 reduzir · &lt; 25 venda. Técnico e momentum pesam no curto prazo; fundamentos no longo. Clique na linha para ver os motivos e o plano de entrada e saída. Dados do Yahoo Finance (gratuito, sem garantia), atualizados no máximo a cada 10 minutos. Material educacional; não é recomendação de investimento.</p>
    ${quantCardHtml()}`;
}

function planCard(r) {
  const pl = r.pillars.tech.plan;
  if (!pl)
    return `<div class="card"><h3>Níveis do gráfico (só o técnico)</h3><p class="muted">Placar gráfico neutro: sem plano de entrada ou saída agora.</p></div>`;
  const k = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
  return `<div class="card"><h3>Níveis do gráfico (só o técnico)</h3><div class="kv">${k("Entrada", num(pl.entry))}${k("Stop", num(pl.stop))}${k("Alvo 1", num(pl.t1))}${k("Alvo 2", num(pl.t2))}${k("Risco até o stop", pct(pl.riskPct))}${k("Retorno/risco (alvo 1)", num(pl.rr, 1))}</div><p class="note">Leitura só do gráfico (${pl.dir > 0 ? "viés técnico de alta" : "viés técnico de baixa"}), por suportes, resistências e ATR. O que fazer agora é a Decisão do trader acima, que junta todas as análises; o stop dela é este mesmo. Não é ordem.</p></div>`;
}

const TONE = (d) => (d >= 0.12 ? "buy" : d <= -0.12 ? "sell" : "wait");

/** Aviso de nível (ativo da carteira): ação, tipo (ampliar/reduzir, parcial/total) e o porquê. */
export function alertBox(a) {
  return dismissible("card alert-box", `<b>${esc(a.headline)}</b> · <span class="tag ${a.tone}">${esc(a.action)}</span>${a.trigger ? `<div><b>Gatilho:</b> ${esc(a.trigger)}</div>` : ""}<p class="muted" style="margin:6px 0 0">${esc(a.why)}</p>`, 'style="margin:6px 0 10px"'); // prettier-ignore
}

/** Vantagem medida (mesma régua da aba Quando entrar): nota, motivos e o efeito na decisão. */
function edgeHtml(dec) {
  const e = dec.edge;
  if (!e?.grade) return "";
  const ic = (ok) => (ok === true ? "✓" : ok === false ? "✗" : "?");
  const gated = dec.final.gated
    ? `<p><b>A combinação das análises dava "${esc(dec.final.rawStep.label)}", mas o sinal técnico deste ativo teve expectativa negativa no passado: a decisão disciplinada é aguardar.</b></p>`
    : e.sizeMult < 1
      ? `<p><b>Use metade do tamanho normal (0,5% de risco por operação).</b></p>`
      : "";
  return `<div class="ta-edge g${e.grade}"><div class="ta-edge-h"><b class="ta-grade">${e.grade}</b><span>${esc(dec.edgeText)}</span></div>${gated}
    <ul>${e.flags.map((f) => `<li class="${f.ok === true ? "ok" : f.ok === false ? "no" : "ask"}"><span aria-hidden="true">${ic(f.ok)}</span>${esc(f.text)}.</li>`).join("")}</ul></div>`;
}

/** Decisão do trader: as quatro sub-análises com confiança, a escala final e os níveis de preço. */
export function decisionCard(r, alert = null) {
  // mesmo preço da lista (ao vivo quando houver): decisão e escala iguais em toda tela
  const live = livePrice(r.sym, state); // mesma cotação da lista de Sinais de hoje
  const dec0 = traderDecision(live > 0 ? { ...r, price: live } : r, { regime: state.snap?.regime, spy: state.prices?.series?.SPY, quantOf }, { gate: true }); // prettier-ignore
  // com posição, os mesmos verbos da lista (Ampliar / Manter / Reduzir / Vender)
  const held = (state.portfolio?.holdings ?? []).some((h) => h.sym === r.sym && h.qty > 0);
  const dec = dec0 && held ? { ...dec0, now: holdNow(dec0.now) } : dec0;
  if (!dec?.final)
    return `<div class="card"><h3>Decisão do trader</h3><p class="muted">Dados insuficientes para combinar as análises.</p></div>`;
  const f = dec.final;
  const meter = Math.round((f.score + 1) * 50);
  const subs = Object.entries(dec.subs)
    .map(([k, s]) =>
      s
        ? `<div class="dec-sub"><div class="dec-sub-h"><b>${SUB_LABEL[k]}</b><span class="tag ${TONE(s.dir)}">${esc(dec.dirLabel(s.dir))}</span><span class="muted">confiança <b>${esc(s.conf)}</b></span></div><p class="muted">${esc(s.text)}</p></div>`
        : `<div class="dec-sub"><div class="dec-sub-h"><b>${SUB_LABEL[k]}</b><span class="tag neutral">Sem dados</span></div><p class="muted">Não entra na decisão.</p></div>`,
    )
    .join("");
  const ns = newsSub(lastImpact.get(r.sym));
  const newsLine = ns
    ? `<div class="dec-sub"><div class="dec-sub-h"><b>Notícias</b><span class="tag ${TONE(ns.dir)}">${esc(dec.dirLabel(ns.dir))}</span><span class="tag neutral">modo sombra</span>${hq("newsImpact", { sym: r.sym, balance: Math.round(ns.dir * 10), n: lastImpact.get(r.sym)?.n })}</div><p class="muted">${esc(ns.text)}. Aparece, mas não entra na nota até o diário medir se acerta.</p></div>` // prettier-ignore
    : `<div class="dec-sub"><div class="dec-sub-h"><b>Notícias</b><span class="tag neutral">modo sombra</span></div><p class="muted">Abra o ativo pela lupa para ler e pontuar as notícias.</p></div>`; // prettier-ignore
  const fmt = (x) => (Number.isFinite(x) ? num(x) : "");
  const ladder = dec.ladder
    .map(
      (z) =>
        `<tr class="${z.here ? "dec-here" : ""}"><td><span class="tag ${z.kind === "stop" ? "sell" : z.kind}">${esc(z.label)}</span>${z.here ? " <b>← preço agora</b>" : ""}</td><td class="num">${z.from === null ? `abaixo de ${fmt(z.to)}` : z.to === null ? `acima de ${fmt(z.from)}` : `${fmt(z.from)} – ${fmt(z.to)}`}</td><td class="muted">${esc(z.note)}</td></tr>`,
    )
    .join("");
  return `<div class="card dec">
    <h3>Decisão do trader</h3>
    <div data-lead>${alert ? alertBox(alert) : ""}
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="tag ${dec.now.tone}" style="font-size:1rem">${esc(dec.now.label)}</span>${dec.now.label !== f.step.label ? `<span class="muted">análises: <b>${esc(f.step.label)}</b></span>` : ""}<span class="muted">Confiança <b>${esc(f.conf)}</b>${f.conflict ? " · as análises discordam: reduza o tamanho ou espere" : ""}</span></div>
    ${dec.now.note ? `<p class="small" style="margin:6px 0 0">${esc(dec.now.note)}.</p>` : ""}
    ${bar(meter)}
    ${f.partGated ? `<p class="small warn-txt">⚠ As análises davam "${esc(f.rawStep.label)}", mas, em ETFs e fundos, essa decisão foi a pior no estudo de 10 anos (rendeu abaixo da média dos ativos na alta e na baixa). Em ações individuais ela funcionou e segue valendo. Decisão: aguardar um sinal mais forte.</p>` : ""}
    ${edgeHtml(dec)}</div>
    <div class="dec-subs">${subs}${newsLine}</div>
    <h3 style="margin-top:14px">Escala de preço</h3>
    <div class="tw"><table><tbody>${ladder}</tbody></table></div>
    <p class="note">Como o trader decide: cada sub-análise vota de −1 (vender) a +1 (comprar), com peso técnico 35%, fundamentos 25%, mercado 20% e situações parecidas 20%, mais o Quant Aberto com peso 15% nas ações do S&P 500 (os pesos são relativos: com o Quant presente, cada parte é dividida pela soma) (o momentum de 12 meses aparece só como informação), multiplicado pela confiança (alta 1, média 0,6, baixa 0,3). Discordância forte entre elas rebaixa a confiança final. Em ETFs e fundos, "Comprar em partes" vira "Ficar de fora" (pior decisão no estudo de 10 anos); em ações individuais segue valendo. Níveis por suportes, resistências e ATR do gráfico diário. Situações parecidas = dias do próprio ativo com a mesma posição frente às médias, RSI e retorno de 20 dias semelhantes; o passado não garante o futuro. Material educacional; não é recomendação de investimento.</p>
  </div>`;
}

/** Números do ativo em grupos: avaliação, qualidade do negócio e risco (antes era uma lista só). */
function numbersCard(r) {
  const f = r.fund ?? {};
  const k = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
  const pctv = (x, d = 1) => (Number.isFinite(x) ? pct(x, d) : "–");
  const grp = (t, items) =>
    `<div class="lab" style="margin:10px 0 4px">${t}</div><div class="kv">${items.join("")}</div>`;
  return `<div class="card"><h3>Números</h3>
    ${grp("Avaliação", [k("P/L", num(f.pe, 1)), k("P/L futuro", num(f.fpe, 1)), k("PEG", num(f.peg, 2)), k("P/VP", num(f.pb, 1)), k("EV/EBITDA", num(f.evEbitda, 1)), k("Dividend yield", pctv(f.dy))])}
    ${grp("Qualidade", [k("ROE", pctv(f.roe, 0)), k("Margem líquida", pctv(f.margin, 0)), k("Cresc. receita", pctv(f.revGrowth, 0)), k("Dívida/PL", Number.isFinite(f.debtEq) ? `${Math.round(f.debtEq)}%` : "–")])}
    ${grp("Risco e retorno", [k("Retorno 12m", pctv(r.pillars.mom.m?.r12, 0)), k("Volatilidade 1a", pctv(r.risk.vol, 0)), k("Do topo de 1a", pctv(r.risk.dd, 0)), k("Beta", num(f.beta, 2))])}
  </div>`; // prettier-ignore
}

/** Os quatro pilares da nota lado a lado, num só cartão. */
function pillarsCard(r) {
  return `<div class="card"><h3>Por que essa nota</h3><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">${Object.keys(PILLARS)
    .map((p) => {
      const x = r.pillars[p];
      return `<div><div class="lab">${PILLARS[p]} <span class="muted">(peso ${Math.round(WEIGHTS[p] * 100)}%)</span> · <b>${sc(x.score)}</b></div>${bar(x.score)}<ul style="margin:8px 0 0;padding-left:18px">${x.reasons.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
    })
    .join("")}</div></div>`; // prettier-ignore
}

/**
 * Detalhe do ativo, de cima para baixo: quem é (nota) → mercado agora (faixas, liquidez, gráfico) → o que fazer
 * (decisão e plano) → por quê (pilares, riscos) → números → contexto (empresa, analistas, financeiros, manchetes).
 */
export function openAnalysis(sym) {
  const r = an.items[sym];
  if (!r) {
    // ativo da varredura do mercado (🌐 Todas) ainda sem análise no app: carrega e abre
    openDrawer(`<h2 style="padding-right:30px">${esc(sym)}</h2><div class="card"><p class="muted">Carregando a análise completa de ${esc(sym)}…</p></div>`); // prettier-ignore
    const token = (openAnalysis.token = {});
    ensureAnalysis([sym]).then(() => {
      if (openAnalysis.token !== token || document.getElementById("drawer").hidden) return;
      if (an.items[sym]) openAnalysis(sym);
      else openDrawer(`<h2>${esc(sym)}</h2><div class="card"><p class="muted">Não foi possível carregar a análise de ${esc(sym)} agora. Tente de novo em instantes.</p></div>`); // prettier-ignore
    });
    return;
  }
  openAnalysis.token = null;
  const k = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
  const html = `<h2 style="padding-right:30px">${esc(r.sym)} <span class="muted" style="font-size:.9rem">${esc(r.name ?? "")}</span></h2>
    ${assetPanelHtml(
      r.sym,
      r.series,
      quoteFromBars(r.bars, r.fund?.marketCap),
      `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="font-size:2rem;font-weight:700;font-family:var(--mono)">${sc(r.score)}</span>${scaleTag(r)}<span class="muted">Confiança ${esc(r.confidence ?? "–")}${r.conflict ? " · técnico e fundamentos em conflito" : ""}</span></div>
      <div class="kv" style="margin-top:8px">${k("Preço", `${num(r.price)} ${esc(r.currency ?? "")}`)}${k("Tipo", esc(r.type ?? "–"))}${k("Setor/categoria", esc(r.sector ?? "–"))}</div>`,
    )}
    ${decisionCard(r, portfolioSyms().includes(r.sym) ? holdingDecision(r.sym)?.alert : null)}
    ${planCard(r)}
    ${pillarsCard(r)}
    ${quantDetailHtml(r.sym)}
    ${r.risk.warn.length ? dismissible("card alert-box", `<h3>Riscos</h3>${r.risk.warn.map((w) => `<p>${esc(w)}</p>`).join("")}`) : ""}
    ${numbersCard(r)}
    <div id="anCtx" data-sym="${esc(r.sym)}"><div class="card"><p class="muted">Carregando resumo, analistas, financeiros e manchetes…</p></div></div>
    <p class="note">Material educacional; não é recomendação de investimento.</p>`;
  openDrawer(html, () => {
    mountAssetPanel(r.sym, r.series);
    mountContext(r.sym, r.price, r.name);
  });
}

/** Cliques e Enter da aba (ligados uma vez). */
export function initAnalysis() {
  const input = () => document.getElementById("anInput")?.value ?? "";
  // ação do Quant Aberto: entra na lista, é analisada e abre o detalhe
  initQuant(async (sym) => {
    if (an.items[sym]) return openAnalysis(sym);
    await runAnalysis([...new Set([...parseList(input()), sym])]);
    openAnalysis(sym);
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-an-act],[data-an-sym]");
    if (!t) return;
    const { anAct, anSym } = t.dataset;
    if (anSym) return openAnalysis(anSym);
    if (anAct === "run") runAnalysis(parseList(input()));
    else if (anAct === "refresh") runAnalysis(parseList(input()), { force: true });
    else if (anAct === "analyze-portfolio") {
      state.prefs.tab = "analysis";
      runAnalysis(portfolioSyms());
    } else if (anAct === "portfolio") {
      const syms = [...new Set([...portfolioSyms(), ...parseList(input())])];
      runAnalysis(syms);
    } else if (anAct === "clear") {
      state.prefs.anList = "";
      an.missing = [];
      runAnalysis([]);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.id === "anInput" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runAnalysis(parseList(input()));
    } else if (e.key === "Enter" && e.target.dataset?.anSym) openAnalysis(e.target.dataset.anSym);
  });
}

/** Card "Decisão do trader" no detalhe de um ativo (carrega a análise se faltar; não desiste na primeira falha). */
export async function mountHoldingDecision(sym, attempt = 0) {
  const box = () => document.querySelector(`#holdDec[data-sym="${CSS.escape(sym)}"]`);
  if (!box()) return;
  await ensureAnalysis([sym], { force: attempt > 0 });
  const el = box();
  if (!el) return;
  const hd = holdingDecision(sym);
  if (hd) {
    el.innerHTML = decisionCard(hd.r, hd.alert);
    return;
  }
  const why = an.fail[sym] ? ` Motivo: ${esc(an.fail[sym])}.` : "";
  if (attempt < 2) {
    el.innerHTML = `<div class="card"><h3>Decisão do trader</h3><p class="muted">Buscando a análise de ${esc(sym)} de novo…${why}</p></div>`;
    setTimeout(() => mountHoldingDecision(sym, attempt + 1), 3000 * (attempt + 1));
    return;
  }
  el.innerHTML = `<div class="card"><h3>Decisão do trader</h3><p class="muted">Não consegui a análise de ${esc(sym)} agora.${why}</p><button class="btn small" data-hold-retry>Tentar de novo</button></div>`;
  el.querySelector("[data-hold-retry]")?.addEventListener("click", () =>
    mountHoldingDecision(sym, 1),
  );
}
