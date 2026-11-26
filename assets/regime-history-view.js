// Gaveta "Como andou o regime" (botão embaixo do pêndulo da Início): a nota do pêndulo ao longo de 1h, 5h, 24h,
// 48h, 1 semana e 1 mês, com os 3 blocos, a tendência (intensificando, perdendo força, virou, estável) e a
// permanência (quanto do tempo do mesmo lado de agora). Cálculo em assets/regime-history.js.
import { esc } from "./format.js";
import { openDrawer } from "./charts.js";
import { barsKey, getBars, peekBars } from "./bars-hub.js";
import { regime } from "./dash.js";
import { PEND_ZONES } from "./regime-zones.js";
import { REG_WINDOWS, REGIME_SYMS, historySummary, regimeHistory } from "./regime-history.js";
import { usSession } from "./sessions.js";
import { savePrefs, state } from "./state.js";

const BLOCK_LINES = [
  ["eq", "Bolsas", "var(--accent)"],
  ["cls", "Classes de ativos", "var(--wait)"],
  ["vol", "VIX e vol", "var(--text-3)"],
];
const zoneOf = (s) => PEND_ZONES.find((z) => s < z.max || z.key === "rkx");
const sgn = (x) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x))}`;
const toneOf = (s) => (s > 0 ? "up" : s < 0 ? "dn" : "mid");
const TREND_ICO = {
  intensificando: "↗",
  "perdendo força": "↘",
  "virou de lado": "⇄",
  estável: "→",
};

/** Nota de agora: a mesma do pêndulo da Início. */
function liveNow() {
  const flow = state.flow;
  if (!flow?.close) return null;
  const q = state.live?.quotes ?? null;
  try {
    const rg = regime(flow.close, 1, usSession() !== "open" ? q : null, { world: q });
    if (!rg?.strength) return null;
    return {
      score: rg.strength.score,
      blocks: Object.fromEntries((rg.blocks ?? []).map((b) => [b.id, b.score])),
    };
  } catch {
    return null;
  }
}

const HHMM = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
const DDMM = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }); // prettier-ignore
const DDH = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", hour: "2-digit" }); // prettier-ignore

/** Gráfico da nota no tempo, com as 5 faixas ao fundo e as linhas finas dos blocos. */
export function historyChart(pts, winId) {
  if (!pts?.length) return `<p class="muted">Sem pontos nesta janela.</p>`;
  const W = 640;
  const H = 230;
  const L = 34;
  const R = 8;
  const T = 8;
  const B = 22;
  const t0 = pts[0].t;
  const t1 = pts.at(-1).t;
  const X = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const Y = (s) => T + ((100 - s) / 200) * (H - T - B);
  const bands = PEND_ZONES.map(
    (z) =>
      `<rect x="${L}" y="${Y(z.max).toFixed(1)}" width="${W - L - R}" height="${(Y(z.min) - Y(z.max)).toFixed(1)}" class="rh-band ${z.tone}${Math.abs(z.min + z.max) > 100 ? " strong" : ""}"/><text x="${W - R - 4}" y="${(Y(z.max) + 11).toFixed(1)}" text-anchor="end" class="rh-bl">${esc(z.label)}</text>`,
  ).join("");
  const yt = [-100, -60, -20, 20, 60, 100]
    .map(
      (v) =>
        `<text x="${L - 5}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" class="rh-ax">${sgn(v)}</text>`,
    ) // prettier-ignore
    .join("");
  const fmt = winId === "1m" ? DDMM : winId === "1w" || winId === "48h" ? DDH : HHMM;
  const xt = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const t = t0 + f * (t1 - t0);
      return `<text x="${X(t).toFixed(1)}" y="${H - 6}" text-anchor="${f === 0 ? "start" : f === 1 ? "end" : "middle"}" class="rh-ax">${esc(fmt.format(new Date(t * 1000)))}${winId === "1w" || winId === "48h" ? "h" : ""}</text>`;
    })
    .join("");
  const path = (get) =>
    pts
      .map((p) => [p.t, get(p)])
      .filter(([, v]) => Number.isFinite(v))
      .map(([t, v], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${Y(v).toFixed(1)}`)
      .join("");
  const blocks = BLOCK_LINES.map(
    ([id, , color]) => `<path d="${path((p) => p.blocks?.[id])}" class="rh-blk" style="stroke:${color}"/>`, // prettier-ignore
  ).join("");
  const last = pts.at(-1);
  return `<svg class="rh-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Nota do regime no tempo">
    ${bands}<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" class="rh-zero"/>${yt}${xt}
    ${blocks}<path d="${path((p) => p.score)}" class="rh-line ${toneOf(last.score)}"/>
    <circle cx="${X(last.t).toFixed(1)}" cy="${Y(last.score).toFixed(1)}" r="4" class="rh-dot ${toneOf(last.score)}"/>
  </svg>
  <p class="rh-legend"><span><i class="rh-k main ${toneOf(last.score)}"></i>Nota do pêndulo</span>${BLOCK_LINES.map(([, l, c]) => `<span><i class="rh-k" style="background:${c}"></i>${esc(l)}</span>`).join("")}</p>`; // prettier-ignore
}

/** Frase do resumo da janela. */
export function summaryText(s, label) {
  if (!s) return "";
  const z = zoneOf(s.last);
  const side = s.last > 0 ? "do risco" : s.last < 0 ? "da defesa" : "neutro";
  const perm =
    s.same == null ? "" : ` Ficou ${Math.round(s.same * 100)}% do tempo do lado ${side}.`;
  const verb = {
    intensificando: `${s.last >= 0 ? "o apetite por risco" : "a defesa"} se intensificou`,
    "perdendo força": `${s.last >= 0 ? "o apetite por risco" : "a defesa"} perdeu força`,
    "virou de lado": `o regime virou para o lado ${side}`,
    estável: "o regime ficou estável",
  }[s.trend];
  return `Em ${label}, ${verb}: a nota média foi de ${sgn(s.first)} no começo da janela a ${sgn(s.end)} no fim; agora está em ${sgn(s.last)} (${z.label.toLowerCase()}), e oscilou entre ${sgn(s.min)} e ${sgn(s.max)}.${perm}`;
}

function bodyHtml(sel, data) {
  const tabs = REG_WINDOWS.map(([id, label]) => {
    const s = data[id]?.sum;
    const badge = s
      ? `<em class="${toneOf(s.delta) === "up" ? "up" : toneOf(s.delta) === "dn" ? "dn" : ""}">${TREND_ICO[s.trend]} ${sgn(s.delta)}</em>`
      : data[id]?.loading
        ? "<em>…</em>"
        : "<em>–</em>";
    return `<button class="rh-tab${id === sel ? " on" : ""}" data-reg-win="${id}" aria-pressed="${id === sel}"><b>${esc(label)}</b>${badge}</button>`;
  }).join("");
  const cur = data[sel];
  const label = REG_WINDOWS.find((w) => w[0] === sel)?.[1] ?? sel;
  const s = cur?.sum;
  const cards = s
    ? `<div class="rh-cards">
        <div><span>Agora</span><b class="${toneOf(s.last)}">${sgn(s.last)}</b><small>${esc(zoneOf(s.last).label)}</small></div>
        <div><span>Começo → fim (média)</span><b><span class="${toneOf(s.first)}">${sgn(s.first)}</span> → <span class="${toneOf(s.end)}">${sgn(s.end)}</span></b><small>1º e último quarto da janela</small></div>
        <div><span>Tendência</span><b>${TREND_ICO[s.trend]} ${esc(s.trend)}</b><small>média ${sgn(s.delta)} pontos</small></div>
        <div><span>Permanência</span><b>${s.same == null ? "–" : `${Math.round(s.same * 100)}%`}</b><small>do tempo do lado de agora</small></div>
      </div><p class="rh-sum">${esc(summaryText(s, label))}</p>`
    : "";
  const chart = cur?.loading
    ? `<p class="muted">Buscando as barras…</p>`
    : cur?.err
      ? `<p class="muted">Não deu para buscar as barras agora (${esc(cur.err)}). Tente de novo em instantes.</p>`
      : historyChart(cur?.pts, sel);
  return `<div class="rh">
    <h2>Como andou o regime</h2>
    <p class="muted small">A nota do pêndulo (−100 a +100) em cada momento, com a mesma regra da tela: variação desde o último fechamento de NY, bolsa aberta ou, fechada, o futuro dela (sem futuro, o ETF do país em NY). Serve para ver se o regime se intensifica, perde força ou vira, e quanto tempo dura.</p>
    <div class="rh-tabs" role="group" aria-label="Janela">${tabs}</div>
    ${cards}
    ${chart}
    <p class="dn-note">Tendência: compara a nota média do primeiro quarto da janela com a do último (a nota de 1 dia oscila muito de um ponto para o outro); intensificando ou perdendo força = a média se afastou ou se aproximou do zero em 10 pontos ou mais; virou = as médias estão em lados opostos. Permanência = parte dos pontos da janela do mesmo lado de agora. 1h a 24h em barras de 5 min, 48h e 1 semana em barras de 30 min, 1 mês nos fechamentos. Leitura em modo sombra; material educacional, não é recomendação.</p>
  </div>`;
}

let openSel = null;

/** Calcula as janelas que já têm barras; devolve { id: { pts, sum, loading, err } }. */
function compute(live) {
  const daily = state.flow ? { dates: state.flow.dates, close: state.flow.close } : null;
  const now = Date.now() / 1000;
  const out = {};
  for (const [id, , src] of REG_WINDOWS) {
    if (!daily) {
      out[id] = { loading: true };
      continue;
    }
    if (src === "daily") {
      const pts = regimeHistory(id, { daily, now, live });
      out[id] = { pts, sum: historySummary(pts) };
      continue;
    }
    const e = peekBars(barsKey({ symbols: REGIME_SYMS, win: src }));
    if (e?.data?.series) {
      const pts = regimeHistory(id, { daily, series: e.data.series, now, live });
      out[id] = { pts, sum: historySummary(pts) };
    } else out[id] = e?.err && !e.loading ? { err: e.err } : { loading: true };
  }
  return out;
}

function paint() {
  const box = document.querySelector("#drawerBody .rh");
  if (!box || !openSel) return;
  box.outerHTML = bodyHtml(openSel, compute(liveNow()));
}

/** Abre a gaveta na janela salva (24h por padrão) e busca as barras de 5 e de 30 min. */
export function openRegimeHistory(sel = state.prefs.regHistWin ?? "24h") {
  openSel = REG_WINDOWS.some((w) => w[0] === sel) ? sel : "24h";
  openDrawer(bodyHtml(openSel, compute(liveNow())));
  for (const win of ["short", "long"])
    getBars(barsKey({ symbols: REGIME_SYMS, win }))
      .catch(() => null)
      .then(paint);
}

/** Pacote novo do canal: com a gaveta aberta, refaz as janelas (o ponto de agora é a nota ao vivo). */
export function refreshRegimeHistory() {
  if (document.querySelector("#drawerBody .rh")) paint();
}

/** Troca a janela com a gaveta aberta. */
export function selectRegimeWindow(id) {
  openSel = id;
  state.prefs.regHistWin = id;
  savePrefs();
  paint();
}
