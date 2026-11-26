// Radar de virada na tela: cartão na Início (logo abaixo do pêndulo), faixa de alerta no topo de todas as abas e
// selo no pêndulo flutuante. A conta é a de assets/regime-reversal.js (a mesma do push), com as barras de 5 min da
// central (mesma URL do pêndulo e do histórico) completadas com o preço ao vivo.
import { decSep, esc } from "./format.js";
import { hooks, store } from "./state.js";
import { barsKey, useBars } from "./bars-hub.js";
import { REGIME_SYMS } from "./regime-history.js";
import { REV, hm, regimeReversal, reversalText } from "./regime-reversal.js";

let memo = { bars: null, quotes: null, flow: null, min: null, val: null };

/** Radar de agora (memo por barras, cotações e minuto). null sem barras ou sem histórico. */
export function liveReversal(flow, quotes, nowMs = Date.now()) {
  if (!flow?.close) return null;
  const e = useBars(barsKey({ symbols: REGIME_SYMS, win: "short" }), { bg: true, onUpdate: () => hooks.render() }); // prettier-ignore
  const bars = e?.data?.series;
  if (!bars) return null;
  const min = Math.floor(nowMs / 60000);
  if (memo.bars !== bars || memo.quotes !== quotes || memo.flow !== flow || memo.min !== min) {
    let val = null;
    try {
      val = regimeReversal({ daily: { dates: flow.dates, close: flow.close }, series: bars, quotes, nowSec: nowMs / 1000 }); // prettier-ignore
    } catch {
      val = null;
    }
    memo = { bars, quotes, flow, min, val };
  }
  return memo.val;
}

/** Linha da nota nas últimas 3 h, com o extremo da perna marcado (puro). */
export function revSpark(r, w = 300, h = 56) {
  const pts = r?.pts ?? [];
  if (pts.length < 2) return "";
  const t0 = pts[0].t;
  const t1 = pts.at(-1).t;
  const ys = pts.map((p) => p.score);
  const lo = Math.min(...ys, -5);
  const hi = Math.max(...ys, 5);
  const X = (t) => ((t - t0) / Math.max(1, t1 - t0)) * (w - 8) + 4;
  const Y = (v) => h - 4 - ((v - lo) / Math.max(1, hi - lo)) * (h - 8);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.score).toFixed(1)}`).join(""); // prettier-ignore
  const zero = lo < 0 && hi > 0 ? `<line x1="0" x2="${w}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="rv-zero"/>` : ""; // prettier-ignore
  const ext =
    r.stage !== "none" && r.tExt
      ? `<circle cx="${X(r.tExt).toFixed(1)}" cy="${Y(r.extScore).toFixed(1)}" r="4" class="rv-ext"/>`
      : "";
  return `<svg class="rv-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Nota do pêndulo nas últimas 3 horas">${zero}<path d="${d}" class="rv-line"/>${ext}<circle cx="${X(t1).toFixed(1)}" cy="${Y(ys.at(-1)).toFixed(1)}" r="3.5" class="rv-now"/></svg>`; // prettier-ignore
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");

/** Chave da perna (o mesmo radar não volta a abrir a faixa depois de fechada). */
const legKey = (r) => `${r.stage}:${r.dir}:${Math.floor((r.stage === "failed" ? r.failed.tExt : r.tExt) / 2700)}`; // prettier-ignore
const DISMISS = "pendulo.revDismiss";

/** HTML da faixa de alerta (puro): só tendência e confirmada. */
export function revBannerHtml(r) {
  if (!r || (r.stage !== "watch" && r.stage !== "confirmed")) return "";
  const tx = reversalText(r);
  const conf = r.stage === "confirmed";
  return `<span class="rvb-ic" aria-hidden="true">${conf ? (r.dir > 0 ? "▲" : "▼") : "⚠"}</span><span class="rvb-tx"><b>${esc(tx.badge)}</b> · ${esc(cap(r.session))} · força ${r.strength}/100<small>${esc(tx.act)}</small></span><button type="button" class="rvb-x" aria-label="Fechar o alerta">×</button>`; // prettier-ignore
}

let bar = null;
/** Desenha a faixa no topo (todas as abas). onOpen leva à Início. */
export function paintRevBanner(r, { onOpen } = {}) {
  const html = revBannerHtml(r);
  const key = html ? legKey(r) : null;
  const closed = key && store.get(DISMISS, []).includes(key);
  if (!html || closed) {
    if (bar) bar.hidden = true;
    return;
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "revBanner";
    bar.setAttribute("role", "alert");
    document.body.appendChild(bar);
    bar.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target.closest(".rvb-x")) {
        store.set(DISMISS, [...store.get(DISMISS, []), bar.dataset.key].slice(-30));
        bar.hidden = true;
      } else bar._open?.();
    });
  }
  bar._open = onOpen;
  bar.dataset.key = key;
  bar.className = `rvb ${r.stage === "confirmed" ? (r.dir > 0 ? "up" : "dn") : "warn"}`;
  if (bar.dataset.html !== html) {
    bar.innerHTML = html;
    bar.dataset.html = html;
  }
  bar.hidden = false;
}

/* ── Leitura integrada no pêndulo da Início ─────────────────────────────────────────────────────────── */

const toneOf = (r) =>
  r.stage === "confirmed" ? (r.dir > 0 ? "up" : "dn") : r.stage === "watch" ? "warn" : "mid";
const clampScore = (x) => Math.max(-100, Math.min(100, x));

/**
 * Desenho da virada sobre o pêndulo (puro), em pontos da nota: perna anterior (base → extremo) e volta
 * (extremo → agora). A trilha do radar e a agulha podem diferir alguns pontos (a agulha usa a cotação de agora
 * pela conta do pêndulo), então a perna é deslocada para terminar exatamente na agulha. null sem virada.
 */
export function revOverlay(r, shown) {
  if (!r || !Number.isFinite(shown) || !["watch", "confirmed", "failed"].includes(r.stage))
    return null;
  const leg = r.stage === "failed" ? r.failed : r;
  const off = shown - r.score;
  return {
    stage: r.stage,
    tone: toneOf(r),
    dir: leg.dir,
    base: clampScore(leg.baseScore + off),
    ext: clampScore(leg.extScore + off),
    now: shown,
    label: `${leg.dir < 0 ? "topo" : "fundo"} ${hm(leg.tExt)}`,
  };
}

/** Faixa do radar embaixo da nota do pêndulo (puro): estágio, força e o que fazer. */
export function revStripHtml(r) {
  if (!r) return "";
  const tx = reversalText(r);
  const tone = toneOf(r);
  const pct = Math.max(0, Math.min(100, r.strength));
  const meter = `<i class="rvs-m" aria-hidden="true"><i class="${tone}" style="width:${pct}%"></i><b style="left:${REV.WATCH}%"></b><b style="left:${REV.CONF}%"></b></i>`; // prettier-ignore
  if (r.stage === "none")
    return `<a class="rvs quiet" href="#hm-rv" title="Radar de virada (força ${r.strength}/100): avisa ⚠ quando o pêndulo começa a voltar de um movimento e ‼ quando a volta se confirma."><span>Radar de virada: sem sinal</span>${meter}</a>`; // prettier-ignore
  return `<a class="rvs ${tone} ${r.stage}" href="#hm-rv"><b>${esc(tx.badge)}</b>${meter}<em>${r.strength}/100</em><small>${esc(tx.act)}${r.stage === "failed" ? "" : ` · desde ${hm(r.since ?? r.t)}`}</small></a>`; // prettier-ignore
}

/** Bloco do radar no detalhe do pêndulo (puro): linha das últimas 3 h e critérios. */
export function revDetailHtml(r) {
  if (!r) return "";
  const tx = reversalText(r);
  const checks = (r.checks ?? [])
    .map(
      (c) =>
        `<li class="${c.ok ? "ok" : c.half ? "half" : "no"}"><i aria-hidden="true">${c.ok ? "✓" : c.half ? "◐" : "·"}</i>${esc(c.label)}</li>`,
    ) // prettier-ignore
    .join("");
  return `<div class="hm-dg rv-dg" id="hm-rv"><span class="hm-dgh">Radar de virada · ${esc(cap(r.session))} · força ${r.strength}/100</span>
    ${r.stage === "none" ? `<p class="rv-body muted">Nenhuma volta em formação nas últimas 3 h.</p>` : `<p class="rv-body">${esc(tx.body)}</p>`}
    ${r.stage === "none" && /fechad/i.test(r.session ?? "") ? "" : revSpark(r)}
    <details class="rv-why"${r.stage === "none" ? "" : " open"}><summary>Critérios (ruído: ${r.sigma.toFixed(1).replace(".", decSep())} ponto por 5 min)</summary><ul class="rv-checks">${checks}</ul></details>
    <small class="rv-foot">⚠ tendência: devolveu ≥ 25% da perna com velocidade · ‼ confirmada: ≥ 50%, médias 15/60 min cruzadas, blocos e SPY juntos. Modo sombra, sem estudo fora da amostra; não é recomendação.</small>
  </div>`;
}
