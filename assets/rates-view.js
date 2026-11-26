// Mercados › Juros (Offshore e Onshore): curva de juros a mercado com todos os vértices, ao vivo, e curvas de datas
// passadas para comparar (atalhos ou data livre). Offshore: EUA (padrão), zona do euro, Reino Unido e Japão;
// Onshore: DI × pré da B3. EUA e Brasil também em juro real (TIPS / NTN-B) e inflação implícita (nominal × real). Contas e gráfico em rates.js (puro); dados em /api/yields?curve= (api/_curves.js).
import { CURVE_COLORS, DEFAULT_CMP, MAX_CMP, MODE_LABELS, RATE_CURVES, RATE_MODES, RATE_PRESETS, SIDE_CURVES, US_LIVE, beParts, breakeven, cmpDate, curveFor, focusCurve, inflationPremium, cmpLabel, curveSvg, interp, liveUs, normCmp, shapeOf, spreadsOf, tLabel, vertLabel } from "./rates.js"; // prettier-ignore
import { fetchJSON } from "./net.js";
import { viewFed } from "./fed-view.js";
import { fetchQuotes } from "./quote-hub.js";
import { quoteOf } from "./asset-pop.js";
import { nyDate } from "./live.js";
import { dateBR, esc, num } from "./format.js";
import { hooks, isOnshore, savePrefs, state } from "./state.js";
import { toast } from "./widgets.js";

const LIVE_TTL = 60_000;
const CLOSE_TTL = 15 * 60_000;
/** Memória das curvas buscadas: chave "curva|data|live" -> { d, err, at, p }. */
export const rc = new Map();
let timer = null;

const keyOf = (curve, date, live) => `${curve}|${date ?? ""}|${live ? 1 : 0}`;
const isTab = () => ["rates", "brrates"].includes(state.prefs.tab);

// Brasil: arquivos do robô diário (scripts/update-br-curve.mjs). data/br-curve.json = DI × pré por data (DI1 da B3 e,
// antes dele, Tesouro Prefixado); data/br-real.json = NTN-B (juro real) por data.
const brFiles = {};
const BR_SRC = {
  di1: "B3 (ajuste do DI1)",
  td: "Tesouro Prefixado (LTN/NTN-F), referência para o DI",
  ntnb: "Tesouro Direto (NTN-B, taxa de compra da manhã)",
};
function brFile(name) {
  const f = (brFiles[name] ??= { d: null, err: null, p: null, at: 0 });
  if (!f.d && !f.p && Date.now() - f.at > 30_000) {
    f.p = fetchJSON(`data/${name}.json?t=${Math.floor(Date.now() / 3600e3)}`)
      .then((d) => Object.assign(f, { d, err: null }))
      .catch((e) => (f.err = String(e?.message ?? e)))
      .finally(() => {
        f.p = null;
        f.at = Date.now();
        if (isTab()) hooks.render();
      });
  }
  return f;
}
/** Curva do Brasil guardada em `name` na data (ou o último dia ≤ data; sem data = a mais recente). */
function brPast(date, name = "br-curve") {
  const f = brFile(name);
  if (!f.d) return f.err ? { err: f.err } : null;
  const day = Object.keys(f.d.days ?? {}).filter((x) => !date || x <= date).sort().at(-1); // prettier-ignore
  const rec = day ? f.d.days[day] : null;
  if (!rec) return { err: name === "br-real" && !Object.keys(f.d.days ?? {}).length ? "curva real ainda não gravada pelo robô" : "sem curva guardada para essa data" }; // prettier-ignore
  const pts = Array.isArray(rec) ? rec : rec.p;
  const src = Array.isArray(rec) ? "ntnb" : rec.s;
  return { d: { date: day, source: BR_SRC[src] ?? src, points: pts.map(([t, y]) => ({ t, y, label: tLabel(t) })) } }; // prettier-ignore
}

/** Inflação implícita: curva real da data + nominal do MESMO dia da real (Brasil: Fisher). */
function beCurve(id, date) {
  const { nom, real } = beParts(id);
  const r = getCurve(real, date);
  if (!r?.d?.points?.length) return r;
  const n = getCurve(nom, r.d.date);
  if (!n?.d?.points?.length) return n;
  const points = breakeven(n.d.points, r.d.points, !!RATE_CURVES[id].fisher, RATE_CURVES[id].vert);
  if (points.length < 2) return { err: "sem vértices em comum entre nominal e real" };
  return { d: { date: r.d.date, points, source: `${n.d.source} × ${r.d.source}` } };
}

/** Qualquer curva (nominal, real ou implícita) numa data (null = a mais recente). */
function getCurve(id, date = null) {
  if (RATE_CURVES[id]?.be) return beCurve(id, date);
  if (id === "brr") return brPast(date, "br-real");
  return useCurve(id, date);
}

/** Busca (se preciso) uma curva; redesenha quando chega. Devolve o que já tem. */
function useCurve(curve, date = null, live = false) {
  if (curve === "br" && date) return brPast(date);
  const k = keyOf(curve, date, live);
  const hit = rc.get(k);
  const ttl = live ? LIVE_TTL : date ? Infinity : CLOSE_TTL;
  if (!hit?.p && (!hit || Date.now() - hit.at > (hit.err ? 30_000 : ttl))) {
    const q = `api/yields?curve=${curve}${date ? `&date=${date}` : ""}${live ? "&live=1" : ""}`;
    const p = fetchJSON(q, { bg: !!date })
      .then((d) => rc.set(k, { d, err: d?.error ?? null, at: Date.now() }))
      .catch((e) => rc.set(k, { d: hit?.d ?? null, err: String(e?.message ?? e), at: Date.now() }))
      .finally(() => isTab() && hooks.render());
    rc.set(k, { ...(hit ?? {}), p, at: hit?.at ?? 0 });
  }
  return rc.get(k);
}

/** Focus (IPCA esperado por ano) para comparar com a inflação implícita do Brasil. */
const focusMem = { d: null, err: null, p: null, at: 0 };
function useFocus() {
  if (
    !focusMem.p &&
    (!focusMem.d || Date.now() - focusMem.at > 6 * 3600e3) &&
    Date.now() - focusMem.at > (focusMem.err ? 60_000 : 0)
  ) {
    focusMem.p = fetchJSON("api/yields?focus=ipca", { bg: true })
      .then((d) => Object.assign(focusMem, { d: d?.years ? d : focusMem.d, err: d?.error ?? null }))
      .catch((e) => (focusMem.err = String(e?.message ?? e)))
      .finally(() => {
        focusMem.p = null;
        focusMem.at = Date.now();
        if (isTab()) hooks.render();
      });
  }
  return focusMem;
}

/** Quadro "prêmio de risco de inflação" (implícita − Focus), só no Brasil › Inflação implícita. */
function premiumCard(main, focusPts, f) {
  if (!focusPts.length) return `<div class="card"><h3>Implícita × Focus</h3><p class="muted small">${f.err ? `Focus indisponível agora (${esc(f.err)}).` : "Carregando o Focus…"}</p></div>`; // prettier-ignore
  const rows = inflationPremium(main.points, focusPts);
  const body = rows.length
    ? rows.map((r) => `<tr><td>${r.t} ${r.t === 1 ? "ano" : "anos"}</td><td class="num">${pctTxt(r.be)}</td><td class="num">${pctTxt(r.focus)}</td><td class="num ${tone(r.bp)}">${bp(r.bp)} bp</td></tr>`).join("") // prettier-ignore
    : `<tr><td colspan="4" class="muted small">A implícita começa no primeiro vencimento de NTN-B (~3 anos); sem prazo em comum com o Focus hoje.</td></tr>`; // prettier-ignore
  return `<div class="card"><h3>Implícita × Focus <span class="muted small">prêmio de risco de inflação</span></h3>
    <div class="tw" style="box-shadow:none"><table><thead><tr><th>Prazo</th><th class="num">Implícita</th><th class="num">Focus</th><th class="num">Prêmio</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="muted small">Focus = mediana do IPCA esperado ano a ano (Banco Central, ${esc(dateBR(f.d?.date ?? ""))}), média anualizada de hoje até o prazo. Prêmio = implícita − Focus: quanto o mercado cobra acima da inflação esperada pelo risco de ela surpreender para cima. Prêmio alto = NTN-B paga bem contra o prefixado se a inflação vier como o Focus; prêmio baixo ou negativo = prefixado mais protegido.</p></div>`; // prettier-ignore
}

/** Lado aberto ("off"/"on"), curva escolhida e comparações salvas. */
function sideState(p = state.prefs) {
  const side = isOnshore(p.tab) ? "on" : "off";
  const curves = SIDE_CURVES[side];
  const curve = curves.includes(p.rateCurve?.[side]) ? p.rateCurve[side] : curves[0];
  const cmp = normCmp(p.rateCmp?.[side] ?? DEFAULT_CMP);
  const mode = RATE_MODES[curve] && ["real", "be"].includes(p.rateMode?.[side]) ? p.rateMode[side] : "nom"; // prettier-ignore
  return { side, curve, curves, cmp, mode, id: curveFor(curve, mode) };
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const bp = (x) => (x == null ? "–" : `${x > 0 ? "+" : ""}${Math.round(x)}`);
const tone = (x) => (x == null || Math.abs(x) < 0.5 ? "" : x > 0 ? "pos" : "neg");
const pctTxt = (y) => (Number.isFinite(y) ? `${num(y, 2)}%` : "–");

/** Curva "agora" do lado: EUA = fechamento + Yahoo do dia; Brasil = DI1 ao vivo; demais = último fechamento. */
function nowCurve(curve, close) {
  if (curve === "us" && close?.points) {
    const syms = US_LIVE.map(([, s]) => s);
    fetchQuotes(syms, { id: "rates" }).then((r) => r.fetched && isTab() && hooks.render());
    const quotes = Object.fromEntries(syms.map((s) => [s, quoteOf(s)]));
    const tq = quotes["^TNX"];
    const live = tq?.t ? liveUs(close, quotes, nyDate(tq.t)) : null;
    return live ? { ...live, name: "Agora (ao vivo)", src: "fechamento oficial + variação do dia no Yahoo" } : null; // prettier-ignore
  }
  if (curve === "br") {
    const l = useCurve("br", null, true);
    return l?.d?.points?.length ? { ...l.d, name: "Agora (DI1 ao vivo)", src: l.d.source } : null;
  }
  return null;
}

function scheduleRefresh() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (isTab() && !document.hidden) hooks.render();
  }, LIVE_TTL + 1000);
}

function kpis(curve, main, prev) {
  const keys = { us: [0.25, 2, 10, 30], eu: [2, 10, 30], gb: [0, 5, 10], jp: [2, 10, 30], br: [1, 2, 5, 10], usr: [5, 10, 30], usb: [5, 10, 30], brr: [3, 5, 10, 20], brb: [3, 5, 10] }[curve]; // prettier-ignore
  const card = (lab, v, d, sub) =>
    `<div class="card kpi"><div class="lab">${esc(lab)}</div><div class="val">${v}</div><div class="sub"><span class="${tone(d)}">${d == null ? "" : `${bp(d)} bp`}</span> <span class="muted">${esc(sub)}</span></div></div>`; // prettier-ignore
  const items = keys.map((t) => {
    const y = interp(main.points, t);
    const y0 = prev ? interp(prev.points, t) : null;
    return card(vertLabel(t, curve), pctTxt(y), y != null && y0 != null ? (y - y0) * 100 : null, prev ? `vs ${prev.short}` : ""); // prettier-ignore
  });
  const sp = spreadsOf(main.points, curve)[0];
  const sp0 = prev ? spreadsOf(prev.points, curve)[0] : null;
  const shp = shapeOf(main.points, curve);
  items.push(card(sp.label, sp.bp == null ? "–" : `${bp(sp.bp)} bp`, sp.bp != null && sp0?.bp != null ? sp.bp - sp0.bp : null, shp ? shp.label : RATE_CURVES[curve]?.be ? "inclinação" : "")); // prettier-ignore
  return `<div class="grid g4 rc-kpis">${items.join("")}</div>`;
}

function tables(curve, series) {
  const meta = RATE_CURVES[curve];
  const vs = meta.vert;
  const head = `<th>Curva</th>${vs.map((t) => `<th class="num">${vertLabel(t, curve)}</th>`).join("")}`;
  const lvl = series
    .map(
      (s) =>
        `<tr><td class="nowrap"><i class="rc-sw" style="background:${s.color}"></i>${esc(s.name)} <span class="muted small">${dateBR(s.date)}</span></td>${vs.map((t) => `<td class="num">${pctTxt(interp(s.points, t))}</td>`).join("")}</tr>`,
    ) // prettier-ignore
    .join("");
  const main = series[0];
  const chg = series
    .slice(1)
    .map(
      (s) =>
        `<tr><td class="nowrap"><i class="rc-sw" style="background:${s.color}"></i>desde ${esc(s.short)} <span class="muted small">${dateBR(s.date)}</span></td>${vs
          .map((t) => {
            const a = interp(main.points, t);
            const b = interp(s.points, t);
            const d = a != null && b != null ? (a - b) * 100 : null;
            return `<td class="num ${tone(d)}">${bp(d)}</td>`;
          })
          .join("")}</tr>`,
    ) // prettier-ignore
    .join("");
  const spH = meta.spreads.map(([, , l]) => `<th class="num">${esc(l)}</th>`).join("");
  const spR = series
    .map(
      (s) =>
        `<tr><td class="nowrap"><i class="rc-sw" style="background:${s.color}"></i>${esc(s.name)}</td>${spreadsOf(
          s.points,
          curve,
        )
          .map(
            (x) =>
              `<td class="num ${x.bp != null && x.bp < 0 ? "neg" : ""}">${x.bp == null ? "–" : `${bp(x.bp)} bp`}</td>`,
          )
          .join(
            "",
          )}<td class="muted small">${esc(shapeOf(s.points, curve)?.label ?? "–")}</td></tr>`,
    ) // prettier-ignore
    .join("");
  return `<div class="card"><h3>Taxas por vértice <span class="muted small">% a.a.</span></h3>
      <div class="tw" style="box-shadow:none"><table><thead><tr>${head}</tr></thead><tbody>${lvl}</tbody></table></div>
      ${chg ? `<h3 style="margin-top:14px">Variação até agora <span class="muted small">pontos-base (bp); + = juro subiu</span></h3><div class="tw" style="box-shadow:none"><table><thead><tr>${head}</tr></thead><tbody>${chg}</tbody></table></div>` : ""}
    </div>
    <div class="card"><h3>Inclinação da curva <span class="muted small">longo − curto, em bp</span></h3>
      <div class="tw" style="box-shadow:none"><table><thead><tr><th>Curva</th>${spH}<th>Formato</th></tr></thead><tbody>${spR}</tbody></table></div></div>`; // prettier-ignore
}

export function viewRates(p = state.prefs) {
  const { side, curve: base, curves, cmp, mode, id: curve } = sideState(p);
  const meta = RATE_CURVES[curve];
  const close = curve === "fed" ? null : getCurve(curve);
  const picker =
    curves.length > 1
      ? `<span class="seg" role="group" aria-label="Curva">${curves.map((c) => `<button data-rate-curve="${c}" aria-pressed="${c === curve}" class="${c === curve ? "on" : ""}">${RATE_CURVES[c].flag} ${esc(RATE_CURVES[c].label)}</button>`).join("")}</span>` // prettier-ignore
      : `<b>${RATE_CURVES[base].flag} ${esc(RATE_CURVES[base].label)}</b>`;
  const modeSeg = RATE_MODES[base]
    ? ` <span class="seg" role="group" aria-label="Tipo de juro">${MODE_LABELS.map(([m, l]) => `<button data-rate-mode="${m}" aria-pressed="${m === mode}" class="${m === mode ? "on" : ""}">${esc(l)}</button>`).join("")}</span>` // prettier-ignore
    : "";
  const today = todayIso();
  const chips = cmp
    .map(
      (c, i) =>
        `<button class="chip on rc-chip" data-rate-del="${esc(c)}" title="Tirar a comparação"><i class="rc-sw" style="background:${CURVE_COLORS[(i + 2) % CURVE_COLORS.length]}"></i>${esc(cmpLabel(c))} ✕</button>`,
    ) // prettier-ignore
    .join("");
  const adds = RATE_PRESETS.filter(([k]) => !cmp.includes(k))
    .map(([k, l]) => `<button class="chip" data-rate-add="${k}">+ ${esc(l)}</button>`)
    .join("");
  const bar = `<div class="toolbar rc-bar">${picker}${modeSeg}</div>
    <div class="card rc-cmp"><div class="rc-row"><span class="lab muted">Comparar com</span> ${chips || '<span class="muted small">nenhuma data</span>'}</div>
      <div class="rc-row">${cmp.length < MAX_CMP ? `${adds} <label class="rc-date">Data: <input type="date" data-rate-date max="${today}" min="2000-01-01" aria-label="Adicionar data de comparação"/></label>` : `<span class="muted small">Até ${MAX_CMP} comparações; tire uma para pôr outra.</span>`}</div></div>`; // prettier-ignore

  if (curve === "fed") return bar + viewFed(cmp, today);
  if (!close?.d?.points?.length) {
    const msg = close?.err
      ? `Curva indisponível agora (${esc(close.err)}). Tenta de novo em instantes.`
      : "Carregando a curva de juros…";
    return `${bar}<div class="card empty">${msg}</div>`;
  }
  const last = { ...close.d, name: "Último fechamento", short: "o fechamento" };
  const live = mode === "nom" ? nowCurve(curve, close.d) : null; // real e implícita: só fechamento
  if (live || curve === "br") scheduleRefresh();
  const main = live ? { ...live, short: "agora" } : last;
  const series = [{ ...main, color: CURVE_COLORS[0] }];
  if (live) series.push({ ...last, color: CURVE_COLORS[1], dash: "5 4" });
  const pending = [];
  cmp.forEach((c, i) => {
    const date = cmpDate(c, today);
    const r = date ? getCurve(curve, date) : null;
    if (r?.d?.points?.length)
      series.push({ ...r.d, name: `${cmpLabel(c)}${/Tesouro Prefixado/.test(r.d.source ?? "") ? " (Tesouro Prefixado)" : ""}`, short: cmpLabel(c), color: CURVE_COLORS[(i + 2) % CURVE_COLORS.length], width: 1.6 }); // prettier-ignore
    else pending.push(`${cmpLabel(c)}: ${r?.err ? `indisponível (${r.err})` : "carregando…"}`);
  });
  // Brasil › Inflação implícita: linha do Focus (IPCA esperado) para ver o prêmio de risco
  const focus = curve === "brb" ? useFocus() : null;
  const focusPts = focus?.d ? focusCurve(focus.d.years, today) : [];
  const prev = series[1] ?? null;
  const plot = [...series];
  if (focusPts.length) plot.push({ name: "Focus (IPCA esperado)", date: focus.d.date, points: focusPts.map((x) => ({ ...x, label: tLabel(x.t) })), color: "#ef4444", dash: "2 3", width: 1.6 }); // prettier-ignore
  const legend = plot
    .map(
      (s, i) =>
        `<span class="rc-leg"><i class="rc-sw${s.dash ? " dash" : ""}" style="background:${s.color}"></i>${esc(s.name)} <span class="muted">${dateBR(s.date)}${i === 0 && s.at ? ` ${esc(String(s.at).slice(11, 16))}` : ""}</span></span>`,
    ) // prettier-ignore
    .join("");
  const ticks = { us: [1 / 12, 0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30], eu: [0.25, 1, 2, 3, 5, 7, 10, 15, 20, 30], gb: [0, 5, 10, 20], jp: [1, 2, 3, 5, 7, 10, 20, 30, 40], br: [0.25, 0.5, 1, 2, 3, 5, 7, 10], usr: [5, 7, 10, 20, 30], usb: [5, 7, 10, 20, 30], brr: [3, 5, 10, 20, 30], brb: [3, 5, 7, 10] }[curve]; // prettier-ignore
  const shp = shapeOf(main.points, curve);
  const svg = curveSvg(plot, { ticks, curve });
  return `${bar}${kpis(curve, main, prev)}
    <div class="card rc-chart"><h3>Curva de juros · ${meta.flag} ${esc(meta.label)} ${shp ? `<span class="tag neutral" title="${esc(shp.hint)}">${esc(shp.label)}</span>` : ""}</h3>
      <div class="rc-legend">${legend}</div>
      <div class="rc-plot">${svg}</div>
      ${pending.length ? `<p class="muted small">${esc(pending.join(" · "))}</p>` : ""}
      <p class="muted small">${esc(meta.note)} Eixo do prazo em escala de raiz (abre os vértices curtos). Toque num ponto para ver a taxa.</p></div>
    ${curve === "brb" ? premiumCard(main, focusPts, focus) : ""}
    ${tables(curve, series)}
    <p class="note">Fonte: ${esc(main.src ?? main.source ?? "")}${live ? ` · fechamento: ${esc(last.source)}` : ""}. Datas de comparação sem curva (feriado, fim de semana) usam o último dia útil anterior. ${{ brr: "Juro real (acima do IPCA), base 252.", brb: "Inflação implícita em % a.a. (IPCA)." , usr: "Juro real (acima do CPI), % a.a.", usb: "Inflação implícita em % a.a. (CPI)." }[curve] ?? (side === "on" ? "Taxas DI × pré na base 252." : "Taxas em % a.a.")} Material educacional; não é recomendação de investimento.</p>`; // prettier-ignore
}

/** Cliques da aba Juros: trocar curva, pôr/tirar comparação. true se tratou. */
export function ratesClick(e) {
  const b = e.target.closest("[data-rate-curve],[data-rate-mode],[data-rate-add],[data-rate-del]");
  if (!b) return false;
  const p = state.prefs;
  const { side, cmp } = sideState(p);
  if (b.dataset.rateMode) p.rateMode = { ...(p.rateMode ?? {}), [side]: b.dataset.rateMode };
  else if (b.dataset.rateCurve)
    p.rateCurve = { ...(p.rateCurve ?? {}), [side]: b.dataset.rateCurve };
  else if (b.dataset.rateAdd)
    p.rateCmp = { ...(p.rateCmp ?? {}), [side]: normCmp([...cmp, b.dataset.rateAdd]) }; // prettier-ignore
  else p.rateCmp = { ...(p.rateCmp ?? {}), [side]: cmp.filter((c) => c !== b.dataset.rateDel) };
  savePrefs();
  hooks.render();
  return true;
}

/** Data livre escolhida no campo: entra como comparação. */
export function ratesChange(e) {
  const el = e.target.closest?.("[data-rate-date]");
  if (!el) return false;
  const v = el.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
  if (v > todayIso()) return (void toast("Escolha uma data passada.", "warn"), true);
  const p = state.prefs;
  const { side, cmp } = sideState(p);
  if (cmp.includes(v)) return (void toast("Essa data já está na comparação.", "warn"), true);
  p.rateCmp = { ...(p.rateCmp ?? {}), [side]: normCmp([...cmp, v]) };
  savePrefs();
  hooks.render();
  return true;
}
