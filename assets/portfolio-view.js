// Abas "Carteira" e "Sinais" e os cartões da visão geral. Recebe um contexto do app.js.
import { dismissible } from "./dismiss.js";
import { marketClock, marketClockText } from "./sessions.js";
import { hq } from "./help.js";
import { fmtStamp } from "./dash.js";
import { tickAttr } from "./flash.js";
import { num, pct, signed, cls, esc, fmtDT } from "./format.js";
import { RULES } from "./signals.js";
import { tradeLog } from "./notif-log.js";
import { assetPanelHtml, mountAssetPanel } from "./asset-pop.js";
import { thumbBtn, tradesCardHtml } from "./trades.js";
import { mountHoldingDecision } from "./analysis-view.js";
import { marketEdge } from "./signal-center.js";
import { shiftOf } from "./regime-watch.js";
import { REGIME_TIP } from "./regime-rules.js";
import { BIAS_LEVELS } from "./port-bias.js";
import { brazilTable, btgParts } from "./btg.js";
import { TREND_PT } from "./speed-live.js";

const WHEN = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
import { mountAbout } from "./analysis-context.js";

const share0 = (x) => (Number.isFinite(x) ? `${num(x * 100, 0)}%` : "–");
const share = (x) => (Number.isFinite(x) ? `${num(x * 100, 1)}%` : "–");
const usd = (x, d = 2) =>
  Number.isFinite(x) ? `${x < 0 ? "−" : ""}US$ ${num(Math.abs(x), d)}` : "–";
const usdSigned = (x) =>
  Number.isFinite(x) ? `${x > 0 ? "+" : x < 0 ? "−" : ""}US$ ${num(Math.abs(x), 2)}` : "–";
const KIND = {
  entry: { label: "Entrada", tone: "buy", icon: "▲" },
  exit: { label: "Saída", tone: "sell", icon: "▼" },
  risk: { label: "Risco", tone: "wait", icon: "⚠" },
};

// Pares de ETFs alavancados opostos: ter os dois anula a exposição e soma o custo/decaimento.
const OPPOSITE = [["FAS", "FAZ"], ["LABU", "LABD"], ["TQQQ", "SQQQ"], ["SOXL", "SOXS"], ["TMF", "TMV"], ["NUGT", "DUST"], ["SPXL", "SPXS"], ["TNA", "TZA"], ["UPRO", "SPXU"], ["TECL", "TECS"]]; // prettier-ignore

// ───────────── Carteira ─────────────

/** Quadro da nuvem: entrar/criar conta ou estado da sincronização. */
export function cloudBox(c = {}) {
  if (c.user)
    return `<div class="cloud on"><div><b>☁ Conectado</b> · ${esc(c.user.email ?? "")}<br><span class="muted">${
      c.busy
        ? "Sincronizando…"
        : c.error
          ? `<span class="neg">Falha na última sincronização: ${esc(c.error)}</span>`
          : `Sincronização automática ativa${c.syncedAt ? ` · última às ${esc(c.syncedAt)}` : ""}. Toda importação, restauração ou exclusão da carteira vai para a nuvem na hora.`
    }</span></div><p><button class="btn ghost" data-action="cloud-out">Sair</button></p></div>`;
  return `<div class="cloud">${c.expired ? `<p class="neg"><b>Sua sessão na nuvem expirou.</b> Enquanto não entrar de novo, a carteira é salva só neste aparelho.</p>` : ""}<p class="muted">Entre uma vez com seu e-mail e senha: a carteira passa a ser salva na nuvem automaticamente e aparece no celular, no Mac e em qualquer navegador. Sem conta, ela fica só neste aparelho.</p>
    <form class="cloud-form" data-cloud-form><input type="email" name="email" placeholder="e-mail" autocomplete="username" required aria-label="E-mail">
    <input type="password" name="password" placeholder="senha" autocomplete="current-password" minlength="6" required aria-label="Senha">
    <button class="btn primary" type="submit" ${c.busy ? "disabled" : ""}>Entrar</button> <button class="btn" type="submit" data-signup="1" ${c.busy ? "disabled" : ""}>Criar conta</button></form>
    ${c.error ? `<p class="neg">${esc(c.error)}</p>` : ""}${c.info ? `<p class="muted">${esc(c.info)}</p>` : ""}</div>`;
}

/** Importação do Investing + backup + apagar (usado em Configurações › Carteira). */
export function importBoxHtml(ctx) {
  const pf = ctx.portfolio;
  const draft = ctx.pfText ?? "";
  const where = ctx.cloud?.user
    ? "Ao salvar, a carteira vai <b>direto para a nuvem</b> e aparece em todos os seus aparelhos."
    : "Sem conta, a carteira fica <b>só neste aparelho</b>. Entre em Conta e sincronia para salvá-la na nuvem.";
  return `<p class="note">No Investing.com, abra o portfólio na aba <b>Holdings</b>, selecione a tabela inteira (com o cabeçalho Symbol, Amount, Avg Price…), copie e cole abaixo. ${where}</p>
    <textarea id="pfText" placeholder="Symbol&#9;Amount&#9;Avg Price&#9;Current Price&#9;Market Value…&#10;SPY&#9;10&#9;650.00&#9;670.00&#9;$6,700…" aria-label="Tabela copiada do Investing">${esc(draft)}</textarea>
    <p><button class="btn primary" data-action="pf-preview">Pré-visualizar</button></p>
    <div id="pfPreview">${ctx.pfParsed ? previewHTML(ctx.pfParsed) : ""}</div>
    <h3>Backup</h3>
    <p>${pf ? `<button class="btn" data-action="pf-export">Exportar backup (.json)</button> ` : ""}<label class="btn" style="display:inline-block">Restaurar backup<input type="file" id="pfFile" accept="application/json" hidden></label>
    ${pf ? ` <button class="btn danger" data-action="pf-clear">Apagar carteira</button>` : ""}</p>`;
}

const HHMM = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
const hhmm = (sec) => HHMM.format(new Date(sec * 1000));

// ───────────── Termômetro bull/bear ─────────────
const GX = 100;
const GY = 100;
const ang = (s) => Math.PI * (1 - (Math.max(-100, Math.min(100, s)) + 100) / 200);
const pt = (s, r) =>
  [GX + r * Math.cos(ang(s)), GY - r * Math.sin(ang(s))].map((x) => x.toFixed(1));
const arc = (a, b, r) => {
  const [x1, y1] = pt(a, r);
  const [x2, y2] = pt(b, r);
  return `M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}`;
};
const BAND_COLOR = { vbear: "var(--sell)", bear: "color-mix(in srgb, var(--sell) 50%, var(--surface-3))", flat: "var(--surface-3)", bull: "color-mix(in srgb, var(--buy) 50%, var(--surface-3))", vbull: "var(--buy)" }; // prettier-ignore
const sgn = (x) => (x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : "0");
const chip = (p) => `<span class="pb-chip" title="peso ${share(p.weight)} × beta ${num(p.beta, 2)}${p.est ? " (estimado pelo nome)" : ""}"><b>${esc(p.sym)}</b> ${sgn(Math.round(p.contrib * 50))}</span>`; // prettier-ignore

const qtyTxt = (q) => num(q, q % 1 ? 4 : 0);
/** "⚡ +1,2%/h · 15 min +0,3% · acelerando" (ao vivo, inclui pré/pós). */
function speedTxt(s) {
  if (!s) return `<span class="muted small">⚡ aguardando barras</span>`;
  const tone = s.rate > 0 ? "pos" : s.rate < 0 ? "neg" : "";
  return `<span class="pb-speed ${tone} ${s.trend}" title="Ritmo dos últimos 15 min projetado para 1 hora · 15 min ${pct(s.v15, 2)}${s.v60 != null ? ` · 1 h ${pct(s.v60, 2)}` : ""} · ${TREND_PT[s.trend]}">⚡ ${pct(s.rate, 1)}/h</span>`; // prettier-ignore
}
const pickBtn = (sym, picks) =>
  picks?.[sym] === "reduce"
    ? `<button class="pb-bell on" data-trim-pick="${esc(sym)}" data-trim-set="reduce" title="Vigiando alta: toque para parar" aria-label="Parar de vigiar ${esc(sym)}">🔔</button>`
    : `<button class="pb-bell" data-trim-pick="${esc(sym)}" data-trim-set="reduce" title="Avisar quando ganhar tração de alta (vender na força)" aria-label="Vigiar alta de ${esc(sym)}">🔕</button>`; // prettier-ignore

/** Painel recolhível com estado salvo (prefs.pfOpen): só o título e o resumo até abrir. */
function panel(id, title, summary, body, open) {
  return `<section class="pf-panel${open ? " open" : ""}"><button class="pf-ph" data-pf-open="${id}" aria-expanded="${open}"><b>${title}</b><span class="pf-sum">${summary}</span><i aria-hidden="true">›</i></button>${open ? `<div class="pf-pb">${body}</div>` : ""}</section>`; // prettier-ignore
}

/** Quanto vender de cada posição para a agulha voltar à faixa do cenário, com a menor perda realizada. */
function planPanel(b, open) {
  const p = b.plan;
  if (!p) return "";
  if (!p.legs.length)
    return panel("plan", `Plano de ajuste${hq("trimPlan")}`, "sem venda que ajude", `<p class="muted small">Todas as posições puxam para o mesmo lado: o ajuste pede comprar ativos ${p.dir > 0 ? "defensivos (beta baixo ou inverso)" : "de beta alto"}.</p>`, open); // prettier-ignore
  const rows = p.legs
    .map(
      (l) =>
        `<div class="pl-row"><div class="pl-a"><span class="tk">${esc(l.sym)}</span> ${speedTxt(b.speed?.[l.sym])}<small class="c2s">${qtyTxt(l.qty)} · ${share0(l.pctPos)} da posição</small></div><div class="pl-b num"><span${tickAttr(`${l.sym}:pb`, l.price)}>${num(l.price, 2)}</span><small class="${cls(l.pl)}"${tickAttr(`${l.sym}:pbpl`, l.pl)}>${usdSigned(l.pl)}</small></div>${pickBtn(l.sym, b.picks)}</div>`,
    ) // prettier-ignore
    .join("");
  const body = `${rows}<div class="pl-tot"><span>${usd(p.totalUsd)}</span><b class="${cls(p.totalPL)}">${usdSigned(p.totalPL)}</b></div>
    <p class="muted small">Agulha ${sgn(b.score)} → <b>${sgn(p.after)}</b> (alvo ${sgn(p.target)})${p.reached ? "" : " · só vendas não chegam ao cenário"}</p>`; // prettier-ignore
  return panel("plan", `Plano de ajuste${hq("trimPlan")}`, `${p.legs.length} ${p.legs.length === 1 ? "venda" : "vendas"} · <span class="${cls(p.totalPL)}">${usdSigned(p.totalPL)}</span>`, body, open); // prettier-ignore
}

const SIDE_TXT = { reduce: "▼ reduzir", add: "▲ aumentar" };
/** Posições marcadas para reduzir/aumentar e a tração de agora (o mesmo teste do aviso push). */
function watchPanel(b, open) {
  const list = b.watch ?? [];
  if (!list.length) return "";
  const marked = list.filter((w) => w.side);
  const hot = marked.filter((w) => w.tr?.kind);
  const chips = list
    .map((w) => {
      const tr = w.tr;
      const info = w.side && tr?.day != null ? ` <span class="muted">${pct(tr.day, 1)}/${w.side === "add" ? "−" : "+"}${num(tr.thr * 100, 1)}%</span>` : ""; // prettier-ignore
      const sp = w.side ? `<span class="pk-sp">${speedTxt(b.speed?.[w.sym])}</span>` : "";
      return `<button class="pb-pick ${w.side ?? ""}${tr?.kind ? " hot" : ""}" data-trim-pick="${esc(w.sym)}" title="Toque: reduzir → aumentar → nada"><b>${esc(w.sym)}</b> ${w.side ? SIDE_TXT[w.side] : ""}${info}${tr?.kind ? ` <b class="pb-hot">tração</b>` : ""}${sp}</button>`; // prettier-ignore
    })
    .join("");
  const sum = marked.length ? `${marked.length} ${marked.length === 1 ? "marcada" : "marcadas"}${hot.length ? ` · <b class="pb-hot">${hot.map((w) => esc(w.sym)).join(", ")} com tração</b>` : ` · ${marked.map((w) => esc(w.sym)).join(", ")}`}` : "nenhuma marcada"; // prettier-ignore
  return panel(
    "watch",
    `Vigiar${hq("trimWatch")}`,
    sum,
    `<div class="pb-picks">${chips}</div>`,
    open,
  );
}

/** Cabeça do termômetro: mostrador pequeno, nota, aderência e quem mais puxa. */
function biasHead(b) {
  if (!b) return "";
  if (!b.ok)
    return `<div class="pf-bias"><div class="pb-read"><b>Termômetro</b><span class="muted small">aguardando histórico${b.missing?.length ? ` (${esc(b.missing.join(", "))})` : ""}</span></div></div>`; // prettier-ignore
  const edges = [100, 60, 25, -25, -60, -100];
  const bands = [...BIAS_LEVELS].map((l, i) => `<path d="${arc(edges[i + 1], edges[i], 80)}" stroke="${BAND_COLOR[l.key]}" stroke-width="16" fill="none"/>`).join(""); // prettier-ignore
  const [nx, ny] = pt(b.score, 64);
  const fit = b.fit;
  let marker = "";
  if (fit) {
    const a = ang(fit.market);
    const tip = pt(fit.market, 90);
    const l = [GX + 102 * Math.cos(a - 0.08), GY - 102 * Math.sin(a - 0.08)];
    const r = [GX + 102 * Math.cos(a + 0.08), GY - 102 * Math.sin(a + 0.08)];
    marker = `<polygon class="pb-mkt" points="${tip.join(" ")} ${l.map((x) => x.toFixed(1)).join(" ")} ${r.map((x) => x.toFixed(1)).join(" ")}"><title>Cenário: ${sgn(fit.market)} (${esc(fit.marketLevel)})</title></polygon>`; // prettier-ignore
  }
  const svg = `<svg class="pb-gauge" viewBox="0 -6 200 112" role="img" aria-label="Carteira ${sgn(b.score)} (${esc(b.level)})${fit ? `, cenário ${sgn(fit.market)}` : ""}">${bands}${marker}<line class="pb-needle" x1="${GX}" y1="${GY}" x2="${nx}" y2="${ny}"/><circle class="pb-hub" cx="${GX}" cy="${GY}" r="6"/></svg>`; // prettier-ignore
  const pulls = [...b.bull, ...b.bear].slice(0, 4).map(chip).join("");
  return `<div class="pf-bias">${svg}<div class="pb-read">
      <div class="pb-score ${b.key}">${sgn(b.score)} <span>${esc(b.level)}</span>${hq("bias")}</div>
      ${fit ? `<div class="pb-fit ${fit.key}">${esc(fit.label.replace(" que o cenário", ""))} <span class="muted">· cenário ${sgn(fit.market)}</span></div>` : `<div class="pb-fit muted">cenário indisponível</div>`}
      <div class="pb-row"><span class="muted small">beta ${num(b.netBeta, 2)}</span>${pulls}</div>
    </div></div>`; // prettier-ignore
}

/** Colunas que o usuário escolhe ver (prefs.pfHide guarda as escondidas). Ativo sempre aparece. */
export const PF_COLS = [["qty", "Qtd · PM"], ["px", "Preço"], ["val", "Valor · peso"], ["day", "Dia"], ["tot", "Total"], ["sig", "Sinais"]]; // prettier-ignore
const SIG_ICON = Object.fromEntries(Object.entries(KIND).map(([k, x]) => [k, x.icon]));

/** Sinais em ícones (▲ entrada, ▼ saída, ⚠ risco, com contagem; ↘ laranja = regime piorou); o toque abre o texto num balão. */
function sigCell(sym, list, open, sh = null) {
  if (!list.length && !sh) return "";
  const by = {};
  for (const sg of list) (by[sg.kind] ??= []).push(sg);
  const icons = ["entry", "exit", "risk"]
    .filter((k) => by[k])
    .map((k) => `<span class="pf-si ${KIND[k].tone}">${SIG_ICON[k]}${by[k].length > 1 ? by[k].length : ""}</span>`)
    .join(""); // prettier-ignore
  const rsIcon = sh ? `<span class="pf-si rs" aria-label="Regime piorou">↘</span>` : "";
  const rsTip = sh ? [`Regime piorou: ${sh.from?.label ?? "?"} → ${sh.to?.label ?? "?"}`] : [];
  const tip = [...rsTip, ...list.map((sg) => `${KIND[sg.kind].label}: ${sg.title}`)].join(" · ");
  const rsPop = sh ? `<div class="pf-sp rs"><b>↘ Regime piorou: ${esc(sh.from?.label ?? "?")} → ${esc(sh.to?.label ?? "?")}${sh.to?.day != null ? ` · hoje ${pct(sh.to.day, 1)}` : ""}</b><small>${esc(sh.why.join(" · "))}. Comparado ao pregão anterior. ${esc(REGIME_TIP)}</small></div>` : ""; // prettier-ignore
  const pop = open ? `<div class="pf-sigpop" role="dialog" aria-label="Sinais de ${esc(sym)}">${rsPop}${list.map((sg) => `<div class="pf-sp ${KIND[sg.kind].tone}"><b>${SIG_ICON[sg.kind]} ${esc(sg.title)}</b><small>${esc(sg.desc ?? "")}</small></div>`).join("")}</div>` : ""; // prettier-ignore
  return `<button class="pf-sigb${open ? " on" : ""}" data-pf-sig="${esc(sym)}" title="${esc(tip)}" aria-expanded="${open}">${rsIcon}${icons}</button>${pop}`; // prettier-ignore
}

/** Célula de dois andares: valor principal em cima, detalhe embaixo. */
const two = (top, bottom, tone = "") =>
  `<span class="c2 ${tone}">${top}</span><small class="c2s ${tone}">${bottom}</small>`;

/** Sessão estendida: pré (4h–9h30), pós (16h–20h) e noite (20h–4h, corretoras 24h), horário de NY. */
const EXT_LAB = { pre: "Pré", post: "Pós", night: "Noite" };

export function viewPortfolio(ctx) {
  const pf = ctx.portfolio;
  const toSettings = `<button class="btn" data-tab="settings" data-sub="carteira">Importar</button>`;
  if (!pf)
    return `<div class="card empty"><h2>Nenhuma carteira importada</h2><p class="muted">Copie a tabela Holdings do Investing e cole em Configurações › Carteira. Com login, ela fica salva na nuvem e aparece em todos os seus aparelhos.</p><p>${toSettings}</p></div>`;
  const v = ctx.valuation;
  if (!v) return `<div class="card empty">Calculando a carteira com as cotações…</div>`;
  const open = ctx.open ?? {};
  const now = ctx.now ?? Date.now();
  const syms = new Set(pf.holdings.map((h) => h.sym));
  const opposites = OPPOSITE.filter(([a, b]) => syms.has(a) && syms.has(b));
  const pfSigs = ctx.signals.filter((x) => x.scope === "portfolio");
  const sigBySym = {};
  for (const sg of pfSigs) (sigBySym[sg.sym] ??= []).push(sg);
  const alerts = [];
  if (v.leveragedWeight > 0.5)
    alerts.push(`<b>${share(v.leveragedWeight)} em alavancados/inversos</b>: perdem valor em mercado lateral; pedem acompanhamento diário.`); // prettier-ignore
  for (const [a, b] of opposites)
    alerts.push(`<b>${a} e ${b} são apostas opostas</b>: uma anula a outra. Hedge intencional?`);
  if (v.missingQuotes.length)
    alerts.push(`Sem cotação ao vivo: ${v.missingQuotes.join(", ")} (usando o ${ctx.broker?.summary ? "preço da foto do BTG" : "preço colado"}).`); // prettier-ignore
  const kpi = (lab, val, sub, tone = "") =>
    `<div class="pf-k"><span class="lab">${lab}</span><b class="${tone}">${val}</b><small>${sub}</small></div>`;
  const clockKpi = kpi("Pregão NY", esc(marketClockText(now)), marketClock(now).open ? "aberto até o fechamento" : "até a abertura (9h30 de NY)"); // prettier-ignore
  const extKpi = v.extPL != null ? kpi(EXT_LAB[v.extKind] ?? "Pré", pct(v.extPL / v.total, 2), `${usdSigned(v.extPL)} · ${v.extCount}/${v.rows.length}${v.extTime ? ` · ${hhmm(v.extTime)}` : ""}`, cls(v.extPL)) : ""; // prettier-ignore
  // com conta BTG, ela é a carteira: cartões, pesos e caixa vêm da foto; se a leitura falhar, ✎ ajusta à mão
  // por cima da foto (some sozinho na próxima leitura boa do BTG)
  const btg = btgParts(ctx.broker, now, {
    live: Object.fromEntries(v.rows.filter((r) => r.live).map((r) => [r.sym, r])),
    hist: ctx.brokerHist ?? [],
    fx: ctx.brokerFx,
    sync: ctx.btgSync,
    // faixa "Exterior hoje": pré/pós como célula; o relógio do pregão é legenda, não métrica
    sessionCells: v.extPL != null ? `<div class="pf-sc"><small>${EXT_LAB[v.extKind] ?? "Pré"}${v.extTime ? ` · ${hhmm(v.extTime)}` : ""}</small><b class="${cls(v.extPL)}">${pct(v.extPL / v.total, 2)}</b><small>${usdSigned(v.extPL)} · ${v.extCount}/${v.rows.length}</small></div>` : "", // prettier-ignore
    sessionClock: esc(marketClockText(now)),
    marketOpen: marketClock(now).open,
  });
  const acct = btg?.v.offLiveUsd > 0 ? btg.v.offLiveUsd : null;
  const kpis = btg ? btg.kpis : `<div class="pf-kpis">
      ${kpi("Valor", usd(v.total, 0), `custo ${usd(v.cost, 0)}`)}
      ${kpi("Dia", v.dayPLPct == null ? "–" : pct(v.dayPLPct, 2), usdSigned(v.dayPL), cls(v.dayPL))}
      ${clockKpi}
      ${kpi("Total", v.netPLPct == null ? "–" : pct(v.netPLPct, 2), usdSigned(v.netPL), cls(v.netPL))}
      ${extKpi || kpi("Sinais", String(pfSigs.length), "entrada, saída, risco")}
    </div>`; // prettier-ignore
  const approx = (r) =>
    r.src === "fut" || r.src === "fut~"
      ? ` <span class="pf-approx" title="${r.src === "fut" ? "Fora do pregão: preço implícito pelo futuro equivalente" : "Fora do pregão e sem pré/pós: estimado pelo futuro × beta"}">≈</span>`
      : r.live
        ? ""
        : ` <span class="muted" title="Sem cotação ao vivo: ${btg ? "preço da foto do BTG" : "preço colado do Investing"}">*</span>`; // prettier-ignore
  const rows = v.rows
    .map((r) => {
      const sg = sigBySym[r.sym] ?? [];
      const sh = shiftOf(r.sym);
      const ext = r.xk ? `${(EXT_LAB[r.xk] ?? "Pré").toLowerCase()} <span class="${cls(r.xc)}"${tickAttr(`${r.sym}:x`, r.xp)}>${num(r.xp, 2)}</span>` : r.quoteTime ? fmtStamp(r.quoteTime) : ""; // prettier-ignore
      return `<tr class="click${sh ? " regime-shift" : ""}" data-hold="${esc(r.sym)}" tabindex="0" ${sh ? `title="Regime piorou: ${esc(sh.why.join("; "))}"` : ""}>
        <td class="c-sym"><span class="tk">${esc(r.sym)}</span>${r.leveraged ? ` <span class="pf-lev" title="ETF alavancado ou inverso">alav</span>` : ""} <button class="pf-edit" data-action="hold-edit" data-hold-sym="${esc(r.sym)}" title="Editar posição" aria-label="Editar posição de ${esc(r.sym)}">✎</button><small class="c2s nm">${esc(r.name ?? "")}</small><small class="c2s m-px"><span${tickAttr(`${r.sym}:m`, r.price)}>${num(r.price, 2)}</span>${approx(r)}</small></td>
        <td class="num c-qty">${two(qtyTxt(r.qty), num(r.avg, 2))}</td>
        <td class="num c-px">${two(`<span${tickAttr(r.sym, r.price)}>${num(r.price, 2)}</span>${approx(r)}`, ext)}</td>
        <td class="num c-val">${two(usd(r.value, 0), share(acct ? r.value / acct : r.weight))}</td>
        <td class="num c-day">${two(usdSigned(r.dayPL), pct(r.dayPLPct, 2), cls(r.dayPLPct))}</td>
        <td class="num c-tot">${two(usdSigned(r.netPL), pct(r.netPLPct, 1), cls(r.netPLPct))}</td>
        <td class="c-sig">${sigCell(r.sym, sg, !!ctx.sigOpen?.[r.sym], sh)}</td></tr>`;
    })
    .join("");
  const hide = new Set(ctx.hide ?? []);
  const hideCls = [...hide].map((k) => ` hide-${k}`).join("");
  // celular: ativo + colunas de número visíveis + sinais, numa grade única (cabeçalho e linhas alinhados)
  const mCols = ["val", "day", "tot"].filter((k) => !hide.has(k)).length;
  const mGrid = `minmax(0, 1fr)${" minmax(max-content, 1fr)".repeat(mCols)}${hide.has("sig") ? "" : " 28px"}`;
  const colMenu = open.cols
    ? `<div class="pf-cols" role="group" aria-label="Colunas visíveis">${PF_COLS.map(([k, l]) => `<button class="pf-col" data-pf-col="${k}" aria-pressed="${!hide.has(k)}">${hide.has(k) ? "○" : "●"} ${l}</button>`).join("")}</div>`
    : ""; // prettier-ignore
  const b = ctx.bias;
  const side = b ? `${b.ok ? planPanel(b, !!open.plan) : ""}${watchPanel(b, !!open.watch)}` : "";
  return `<div class="pf-top">${kpis}${biasHead(b)}</div>
    ${btg?.card ?? ""}
    ${alerts.length ? dismissible("card alert-box pf-alerts", alerts.map((a) => `<p>⚠ ${a}</p>`).join("")) : ""}
    ${side ? `<div class="pf-side">${side}</div>` : ""}
    <div class="pf-grid solo">
      <div class="pf-main">
        <div class="pf-sec">
        <div class="pf-bar"><span class="lab">${btg ? "🌎 Internacional" : "Posições"} · ${v.rows.length}</span><span class="pf-acts"><button class="btn small${open.cols ? " on" : ""}" data-pf-open="cols" aria-expanded="${!!open.cols}">Colunas</button><button class="btn small" data-action="hold-add">+ Ativo</button><button class="btn small" data-an-act="analyze-portfolio">Analisar</button><button class="btn small" data-tab="rebal">Rebalancear</button>${btg ? "" : toSettings.replace('class="btn"', 'class="btn small"')}</span></div>
        ${colMenu}
        <div class="tw pf-tw2"><table class="pf-t${hideCls}" data-sortable="pf2" data-tt-filter style="--pf-gc: ${mGrid}"><thead><tr><th class="c-sym">Ativo<span class="pf-mo"> · preço</span></th><th class="num c-qty">Qtd · PM</th><th class="num c-px">Preço</th><th class="num c-val">Valor<span class="pf-dk"> · peso${hq("weight")}</span></th><th class="num c-day">Dia</th><th class="num c-tot">Total</th><th class="c-sig">Sinais${hq("sigs")}</th></tr></thead><tbody>${rows}</tbody>
        <tfoot>${btg ? `<tr><td class="c-sym" title="Caixa disponível para investir">Caixa <button class="pf-edit" data-action="btg-cash-edit" title="Editar caixa" aria-label="Editar caixa em dólar">✎</button></td><td class="c-qty"></td><td class="c-px"></td><td class="num c-val">${two(usd(btg.v.cashUsd, 0), share(acct ? btg.v.cashUsd / acct : NaN))}</td><td class="num c-day"></td><td class="num c-tot"></td><td class="c-sig"></td></tr>` : ""}<tr><td class="c-sym"><b>Total</b></td><td class="c-qty"></td><td class="c-px"></td><td class="num c-val">${two(`<b>${usd(acct ?? v.total, 0)}</b>`, "100%")}</td><td class="num c-day">${two(usdSigned(v.dayPL), pct(v.dayPLPct, 2), cls(v.dayPL))}</td><td class="num c-tot">${two(usdSigned(v.netPL), pct(v.netPLPct, 1), cls(v.netPL))}</td><td class="c-sig"></td></tr></tfoot></table></div>
        <p class="pf-note">${btg ? "Quantidades da foto do BTG × preço ao vivo (* = preço da foto)" : `Importada em ${fmtDT(new Date(pf.importedAt))}`} · toque num ativo para detalhes · ✎ edita${btg ? " (ajuste manual, se a leitura do BTG falhar)" : ""} · ≈ estimado fora do pregão${hq("pfHelp")}</p>
        </div>
        ${
          btg
            ? `<div class="pf-sec"><div class="pf-bar"><span class="lab">🇧🇷 Brasil · ${btg.v.items.length}</span><span class="pf-acts"><button class="btn small" data-action="btg-item-add">+ Produto</button></span></div>${brazilTable(
                btg.v,
                [...hide].filter((k) => k !== "day" && k !== "sig"),
              )}<p class="pf-note">Valores brutos da foto do BTG; renda fixa e fundos têm preço uma vez por dia · ✎ ajusta à mão se a leitura falhar · não é recomendação.</p></div>`
            : ""
        }
      </div>
    </div>`;
}

export function previewHTML(parsed) {
  const { holdings, warnings, ignored } = parsed;
  return `<div class="tw" style="margin-top:8px"><table><thead><tr><th>Símbolo</th><th class="num">Quantidade</th><th class="num">Preço médio</th><th class="num">Preço (Investing)</th><th class="num">Valor (Investing)</th></tr></thead><tbody>${holdings
    .map(
      (h) =>
        `<tr><td class="tk">${esc(h.sym)}</td><td class="num">${num(h.qty, 4)}</td><td class="num">${num(h.avg, 2)}</td><td class="num">${num(h.invPrice, 2)}</td><td class="num">${usd(h.invValue)}</td></tr>`,
    )
    .join("")}</tbody></table></div>
    ${warnings.length ? `<div class="note amber">${warnings.map((w) => `<div>⚠ ${esc(w)}</div>`).join("")}</div>` : ""}
    ${ignored.length ? `<div class="note">Linhas ignoradas: ${ignored.map((l) => `<code>${esc(l.slice(0, 60))}</code>`).join(" · ")}</div>` : ""}
    ${holdings.length ? `<p><button class="btn primary" data-action="pf-save">Salvar ${holdings.length} posições (substitui a carteira atual)</button> <button class="btn" data-action="pf-cancel">Cancelar</button></p>` : ""}`;
}

// ───────────── Sinais ─────────────

function signalRow(sg, ctx) {
  const st = ctx.stats?.rules?.[sg.code];
  const hist = st?.n
    ? `${sg.kind === "entry" ? "subiu" : "caiu"} em ${share0(st.hitRate)} das ${st.n} vezes · média em 5 dias ${pct(st.avgFwd, 2)}`
    : "";
  const x = sg.ind ?? {};
  const facts = `preço ${num(x.price, 2)} · 1d ${pct(x.r1)} · 5d ${pct(x.r5)} (${signed(x.z5, 1)}σ) · RSI ${num(x.rsi, 0)}`;
  return `<div class="sig ${KIND[sg.kind].tone}" ${sg.scope === "portfolio" ? `data-hold="${esc(sg.sym)}"` : `data-sym="${esc(sg.sym)}"`} tabindex="0">
    <div class="sig-head">${sg.veto?.length ? `<span class="tag neutral" title="O modelo vetou esta entrada">⛔ Vetado</span>` : `<span class="tag ${KIND[sg.kind].tone}">${KIND[sg.kind].icon} ${KIND[sg.kind].label}</span>`} <b>${esc(sg.label)}</b> <span class="tk muted">${esc(sg.sym)}</span>
      ${sg.group ? `<span class="muted small">· ${esc(sg.group)}</span>` : ""}<span class="sig-str" title="Força do sinal"><i style="width:${Math.round(sg.strength * 100)}%"></i></span>${sg.kind === "entry" ? thumbBtn(sg) : ""}</div>
    <div><b>${esc(sg.title)}.</b> <span class="muted">${esc(facts)}</span></div>
    ${sg.context ? `<div class="small warn-txt">⚠ ${esc(sg.context)}</div>` : ""}
    ${sg.veto?.length ? `<div class="small neg">⛔ Vetado pelo modelo: ${esc(sg.veto.join(", "))}. No backtest, entradas assim perderam para o SPY; só observe.</div>` : sg.kind === "entry" ? `<div class="small pos">✓ Aprovado pelo modelo (técnica, S&P, macro e crédito a favor)</div>` : ""}
    ${edgeTags(sg)}
    ${sg.provisional ? `<div class="muted small">Provisório: calculado com o preço de agora; só se confirma no fechamento do pregão.</div>` : ""}
    ${hist ? `<div class="muted small">Histórico da regra (47 ativos, ~4 anos): ${hist}${ctx.stats?.base ? ` · base: ${pct(ctx.stats.base.avgFwd, 2)}` : ""}.</div>` : ""}
  </div>`;
}

/** Marcas de vantagem (lições 9 a 17): momentum relativo, regime do mercado e regra sem vantagem histórica. */
function edgeTags(sg) {
  const t = [];
  if (sg.mom) {
    const p = sg.mom.m12Pct;
    if (p >= 0.7)
      t.push(["ok", `Momentum forte: top ${Math.max(1, Math.round((1 - p) * 100))}% em 12 meses`]);
    else if (p <= 0.3) t.push(["no", "Momentum fraco: entre os piores em 12 meses"]);
  }
  if (sg.againstRegime) t.push(["no", "Contra o regime: S&P abaixo da MM200 (metade do tamanho)"]);
  if (sg.noEdge)
    t.push(["no", "Esta regra não bateu um dia qualquer no histórico: sem vantagem medida"]);
  return t.length
    ? `<div class="sig-edge">${t.map(([k, x]) => `<span class="${k}">${k === "ok" ? "✓" : "✗"} ${esc(x)}</span>`).join("")}</div>`
    : "";
}

/** Regime do mercado e rotação setorial (sistema-semente da lição 17). */
function regimeCard() {
  const m = marketEdge();
  if (!m?.regime) return "";
  const r = m.regime;
  const rot = m.rotation;
  const top = rot.ranked.slice(0, 5);
  return `<section class="card regime-card ${r.bull ? "bull" : "bear"}" style="margin-top:12px">
    <h2>Tendência do S&amp;P 500: ${esc(r.label)}</h2>
    <p>Vol. 20 dias <b>${num(r.vol * 100, 0)}%</b> a.a. (mediana ${num(r.volMed * 100, 0)}%)${r.calm ? "" : " · mercado agitado: stops mais largos e tamanho menor"}.</p>
    <p class="note">${esc(r.text)}</p>
    <h3>Força relativa dos setores (6 meses)</h3>
    ${rot.cash ? "" : `<p>Mais fortes: <b>${rot.picks.map(esc).join(", ")}</b></p>`}
    <p class="note">${rot.cash ? "S&P abaixo da média de 200 dias. " : ""}Use como leitura de onde está a força, <b>não como estratégia</b>: a rotação "top 3 em 6 meses + filtro MM200" rendeu 7,9% ao ano de 2009 a 2026, contra 14,8% do S&P comprado e parado (teste com custos).</p>
    <div class="rot-rank">${top.map((x, i) => `<span class="${rot.picks.includes(x.sym) ? "on" : ""}" data-sym="${esc(x.sym)}">${i + 1}. ${esc(x.sym)} <b class="${x.m6 >= 0 ? "pos" : "neg"}">${pct(x.m6)}</b></span>`).join("")}</div>
    <p class="note">O regime (S&P × MM200) serve para calibrar o tamanho das compras de ações (metade do tamanho em regime de baixa). Como regra de entrar e sair do mercado, o filtro perdeu para o comprar e segurar no teste de 2009 a 2026. Veja "Aprenda", lição 17, na aba Quando entrar, e docs/ESTUDO-SETORIAL.md. Material educacional, não é recomendação.</p></section>`;
}

export function viewSignals(ctx) {
  const statsRows = RULES.map((r) => {
    const st = ctx.stats?.rules?.[r.code];
    return `<tr><td>${KIND[r.kind].icon} ${KIND[r.kind].label}</td><td>${esc(r.title)}</td><td class="num">${st?.n ?? "–"}</td>
      <td class="num">${st?.n ? share0(st.hitRate) : "–"}</td><td class="num">${st?.n ? pct(st.avgFwd, 2) : "–"}</td></tr>`;
  }).join("");
  const log = tradeLog();
  const when = (t) => WHEN.format(new Date(t)); // formatador único (até 300 linhas por desenho)
  const hist = `<details class="card" id="notifLog" style="margin-top:12px" ${ctx.openLog ? "open" : ""}><summary><h2 style="display:inline">Histórico de avisos <span class="muted small">(${log.length})</span></h2></summary>
    ${log.length ? `<div class="tw" style="box-shadow:none"><table><tbody>${log.map((n) => `<tr data-notif-url="${esc(n.url ?? "./?tab=signals")}" style="cursor:pointer"><td class="muted nowrap">${when(n.at)}</td><td><b>${esc(n.title)}</b><div class="muted small">${esc(n.body ?? "")}</div></td></tr>`).join("")}</tbody></table></div><p class="note">Só avisos de trading (sinais e níveis da carteira), inclusive os push recebidos com o app fechado. Toque numa linha para abrir o ativo. Os sinais acima mostram só o que vale <b>agora</b>; um aviso de horas atrás pode já ter saído da lista. <button class="btn" data-action="clear-notif-log">Limpar histórico</button></p>` : `<div class="muted">Nenhum aviso de trading registrado ainda.</div>`}</details>`; // prettier-ignore
  return `${regimeCard()}${tradesCardHtml()}${hist}
    <section class="card" style="margin-top:12px"><h2>Como cada regra se comportou</h2>
      <div class="tw" style="box-shadow:none"><table><thead><tr><th>Tipo</th><th>Regra</th><th class="num">Vezes</th><th class="num">Acerto</th><th class="num">Média 5 dias</th></tr></thead><tbody>${statsRows}
      <tr><td colspan="2" class="muted">Base: comprar em qualquer dia</td><td class="num">${ctx.stats?.base?.n ?? "–"}</td><td class="num">${ctx.stats ? share0(ctx.stats.base.upRate) : "–"}</td><td class="num">${ctx.stats ? pct(ctx.stats.base.avgFwd, 2) : "–"}</td></tr></tbody></table></div>
      <p class="note">Medido nos 47 ativos do Pêndulo em ~4 anos (2022-2026), 5 pregões depois do sinal. Entrada: acerto = subiu. Saída e risco: acerto = caiu. Os alertas de risco (perdeu a MM200, queda além do ruído) <b>não anteciparam queda</b> nesse período de alta: servem como limite de perda, não como previsão. A amostra quase não tem mercado de baixa prolongado. Regras técnicas, material educacional, não é recomendação.</p></section>`;
}

// ───────────── Visão geral ─────────────

/** Formulário de ajuste manual de uma posição (h = null: incluir ativo novo). */
export function holdingForm(h = null) {
  const val = (x, d) => (x == null ? "" : String(+x.toFixed(d)));
  return `<form class="card hold-form" data-hold-form ${h ? `data-from="${esc(h.sym)}"` : ""}>
    <h3>${h ? "Editar posição" : "Incluir ativo"}</h3>
    <div class="hf-row">
      <label>Símbolo<input name="sym" value="${esc(h?.sym ?? "")}" autocapitalize="characters" autocomplete="off" spellcheck="false" required></label>
      <label>Quantidade<input name="qty" inputmode="decimal" value="${val(h?.qty, 6)}" autocomplete="off" required></label>
      <label>Preço médio<input name="avg" inputmode="decimal" value="${val(h?.avg, 4)}" autocomplete="off" required></label>
    </div>
    <p class="hf-msg neg" hidden></p>
    <p><button class="btn primary" type="submit">Salvar</button>${h ? ` <button class="btn danger" type="button" data-action="hold-remove" data-hold-sym="${esc(h.sym)}">Remover da carteira</button>` : ""}</p>
    <p class="muted small">Ajuste para corrigir pequenas diferenças em relação à corretora. Vale também na nuvem. Aceita vírgula ou ponto decimal.</p>
  </form>`;
}

/** Produto do Brasil digitado à mão (ajuste sobre a foto do BTG). i = null: incluir. */
export function btgItemForm(i = null) {
  const val = (x) => (x == null ? "" : String(+(+x).toFixed(2)));
  return `<form class="card hold-form" data-btg-item-form ${i ? `data-idx="${i.idx}"` : ""}>
    <h3>${i ? "Editar produto" : "Incluir produto"}</h3>
    <div class="hf-row">
      <label>Produto<input name="name" value="${esc(i?.name ?? "")}" autocomplete="off" required></label>
      <label>Valor bruto (R$)<input name="value" inputmode="decimal" value="${val(i?.value)}" autocomplete="off" required></label>
      <label>Aplicado (R$)<input name="cost" inputmode="decimal" value="${val(i?.cost)}" autocomplete="off" placeholder="opcional"></label>
    </div>
    <p class="hf-msg neg" hidden></p>
    <p><button class="btn primary" type="submit">Salvar</button>${i ? ` <button class="btn danger" type="button" data-action="btg-item-remove" data-idx="${i.idx}">Remover</button>` : ""}</p>
    <p class="muted small">Ajuste manual por cima da foto do BTG, para quando a leitura falhar. Vale também na nuvem e some sozinho na próxima leitura boa do BTG. Vencimento no nome (AAAA-MM-DD) aparece na coluna. Aceita vírgula ou ponto decimal.</p>
  </form>`;
}

/** Caixa em dólar da conta internacional (ajuste manual). */
export function btgCashForm(cashUsd) {
  return `<form class="card hold-form" data-btg-cash-form>
    <h3>Caixa em dólar</h3>
    <div class="hf-row"><label>Caixa (US$)<input name="cash" inputmode="decimal" value="${cashUsd == null ? "" : String(+(+cashUsd).toFixed(2))}" autocomplete="off" required></label></div>
    <p class="hf-msg neg" hidden></p>
    <p><button class="btn primary" type="submit">Salvar</button></p>
    <p class="muted small">Ajuste manual por cima da foto do BTG; some sozinho na próxima leitura boa.</p>
  </form>`;
}

/** Painel para incluir um ativo novo na carteira. */
export function openAddHolding(ctx) {
  ctx.openDrawer(`<h2 style="padding-right:30px">Incluir ativo na carteira</h2>${holdingForm()}`);
}

/** Painel para editar quantidade e preço médio de uma posição (lápis na linha da carteira). */
export function openEditHolding(ctx, sym) {
  const r = ctx.valuation?.rows.find((x) => x.sym === sym);
  if (!r) return;
  ctx.openDrawer(
    `<h2 style="padding-right:30px">Editar <span class="tk">${esc(sym)}</span></h2>${holdingForm(r)}`,
  );
}

export function openHolding(ctx, sym) {
  const r = ctx.valuation?.rows.find((x) => x.sym === sym);
  const h = ctx.history?.[sym];
  const sigs = ctx.signals.filter((s) => s.scope === "portfolio" && s.sym === sym);
  ctx.openDrawer(
    `<h2 style="padding-right:30px"><span class="tk">${esc(sym)}</span> ${esc(r?.name ?? h?.name ?? "")}</h2>
    ${assetPanelHtml(sym, h)}
    <div id="apAbout" data-sym="${esc(sym)}"><div class="card"><h3>Sobre</h3><p class="muted">Carregando resumo…</p></div></div>
    <div id="holdDec" data-sym="${esc(sym)}"><div class="card"><h3>Decisão do trader</h3><p class="muted">Carregando análise técnica, fundamentos, mercado e backtest…</p></div></div>
    <div class="card"><h3>Sinais</h3>${sigs.length ? sigs.map((s) => signalRow(s, ctx)).join("") : `<div class="muted">Nenhum sinal ativo.</div>`}</div>`,
    () => {
      mountAssetPanel(sym, h, { avg: r?.avg });
      mountAbout(sym);
      mountHoldingDecision(sym);
    },
  );
}
