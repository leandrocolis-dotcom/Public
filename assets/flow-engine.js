// Motor do mapa de fluxo: funções puras (sem DOM). Fluxo inferido por preço e volume,
// não por captação real dos ETFs (que não tem fonte gratuita).
import { FLOW_ASSETS, FLOW_BY_SYM, FLOW_GROUPS, GROUP_BY_ID } from "./flow-universe.js";

export const HORIZONS = { "1d": 1, "5d": 5, "1m": 21, "3m": 63 };
const VOL_WIN = 60; // pregões para a volatilidade de referência
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Série na convenção de leitura: moedas em "moeda contra o US$" (inv) já invertidas. */
export function seriesOf(flow, a) {
  const raw = flow.close[a.sym];
  if (!raw) return null;
  return a.inv ? raw.map((v) => 1 / v) : raw;
}

/**
 * Métricas de um ativo num ponto do tempo.
 * @param end índice do último pregão considerado (replay usa índices anteriores)
 * @returns { value, unit, z, ... } — value em % (ou bps para taxas); z = movimento em desvios-padrão,
 *          já no sinal de "fluxo": positivo = dinheiro entrando (taxa caindo / VIX caindo também contam).
 */
export function assetFlow(s, a, h, end) {
  if (!s || end - h < 0 || end - VOL_WIN - 1 < 0) return null;
  let move;
  let daily = [];
  if (a.yld) {
    move = s[end] - s[end - h]; // pontos percentuais
    for (let i = end - VOL_WIN; i <= end; i++) daily.push(s[i] - s[i - 1]);
  } else {
    move = s[end] / s[end - h] - 1;
    for (let i = end - VOL_WIN; i <= end; i++) daily.push(s[i] / s[i - 1] - 1);
  }
  const sd = std(daily);
  let z = sd > 0 ? move / (sd * Math.sqrt(h)) : 0;
  if (a.yld || a.risk) z = -z; // taxa subindo ou VIX subindo = saída de risco/títulos
  return { value: a.yld ? move * 100 : move * 100, unit: a.yld ? "bps" : "%", z };
}

/** Volume relativo: hoje contra a média dos 20 pregões anteriores, ajustado pela fração do pregão. */
export function relVolume(vol, endFromLast = 0, sessionFrac = 1) {
  if (!vol || vol.length < 22) return null;
  const i = vol.length - 1 - endFromLast;
  const prev = vol.slice(i - 20, i).filter((v) => v > 0);
  if (prev.length < 10 || !(vol[i] > 0)) return null;
  const f = endFromLast === 0 ? Math.max(0.05, Math.min(1, sessionFrac)) : 1;
  return vol[i] / (mean(prev) * f);
}

/** Liquidez média em US$ (tamanho do bloco). Sem volume (moedas, índices) -> null. */
export function liquidity(flow, a) {
  const vol = flow.vol?.[a.sym];
  const s = flow.close[a.sym];
  if (!vol || !s) return null;
  const n = Math.min(20, vol.length);
  const dv = [];
  const inUsd = a.sym.endsWith("-USD"); // cripto: o Yahoo já informa o volume em US$
  for (let k = 1; k <= n; k++)
    dv.push(inUsd ? vol[vol.length - k] : vol[vol.length - k] * s[s.length - k]);
  const m = mean(dv.filter((x) => x > 0));
  return Number.isFinite(m) && m > 0 ? m : null;
}

/**
 * Métricas de todos os ativos.
 * @param opts { horizon: "1d"|"5d"|"1m"|"3m", back: pregões atrás (replay), sessionFrac, groups, uni }
 *        uni = universo (padrão: Offshore; o Onshore vem de br-flow.js). Grupo com noHeat fica fora do mapa.
 */
export function flowSnapshot(flow, opts = {}) {
  const U = opts.uni ?? OFF_UNI;
  const h = HORIZONS[opts.horizon ?? "1d"];
  const back = opts.back ?? 0;
  const groups = opts.groups ?? null;
  const n = flow.dates.length;
  const end = n - 1 - back;
  const rows = [];
  for (const a of U.assets) {
    if (groups && !groups.includes(a.group)) continue;
    if (U.byId[a.group]?.noHeat) continue;
    const s = seriesOf(flow, a);
    const m = assetFlow(s, a, h, end);
    if (!m) continue;
    rows.push({
      ...a,
      ...m,
      price: flow.close[a.sym][end],
      relVol: relVolume(flow.vol?.[a.sym], back, opts.sessionFrac ?? 1),
      liq: liquidity(flow, a),
      lastReal: flow.last_real?.[a.sym] ?? null,
    });
  }
  return { date: flow.dates[end], horizon: opts.horizon ?? "1d", rows };
}

/** Agregado por grupo: média do z (peso igual), amplitude (% positivos) e destaques. */
export function groupFlows(rows, uni = OFF_UNI) {
  const by = {};
  for (const r of rows) (by[r.group] ??= []).push(r);
  return uni.groups
    .filter((g) => by[g.id])
    .map((g) => {
      const m = by[g.id];
      const sorted = [...m].sort((x, y) => y.z - x.z);
      return {
        id: g.id,
        label: g.label,
        n: m.length,
        z: mean(m.map((r) => r.z)),
        breadth: m.filter((r) => r.z > 0).length / m.length,
        top: sorted.slice(0, 3),
        bottom: sorted.slice(-3).reverse(),
      };
    })
    .sort((a, b) => b.z - a.z);
}

/** Frase-resumo "saindo de X → entrando em Y" a partir dos grupos. */
export function flowHeadline(groups, k = 3) {
  const into = groups.filter((g) => g.z > 0.25).slice(0, k);
  const out = groups
    .filter((g) => g.z < -0.25)
    .slice(-k)
    .reverse();
  return { into, out };
}

// ───────────── narrativa do dia: o que ganha/perde força em cada sessão ─────────────

const STRONG = 0.5; // grupo: |z médio| a partir do qual "ganha" ou "perde" força
const PICK = 1; // ativo: |z| a partir do qual entra como candidato / fraco
// Grupos que não se compram direto (índices à vista, taxas, volatilidade, câmbio à vista): contam para o tom, não para candidatos.
const NOT_TRADABLE = new Set(["idx_us", "idx_gl", "rates", "vol", "fx"]);
const TONE_GROUPS = ["idx_fut", "us_style", "vol", "crypto", "em"]; // z já vem no sinal de "fluxo" (VIX caindo = positivo)

const PHASES = {
  pre: {
    title: "Pré-mercado (4:00–9:30 em Nova York)",
    text: "O fluxo vem dos futuros e do pré-mercado dos ETFs. O volume é baixo e o movimento pode se desfazer: use como pauta para a abertura, não como sinal.",
  },
  post: {
    title: "Pós-mercado (16:00–20:00 em Nova York)",
    text: "Reação a balanços e notícias depois do fechamento. O que ganha força aqui costuma abrir o próximo pregão em destaque, mas com pouco volume.",
  },
  closed: {
    title: "Mercado fechado",
    text: "Fluxo do último pregão. Os futuros seguem negociando e antecipam a abertura.",
  },
  replay: {
    title: "Replay",
    text: "Fluxo do pregão escolhido na barra do replay.",
  },
};

/** Fase do dia com texto próprio para cada janela do pregão regular. */
export function flowPhase(session, sessionFrac = 1) {
  if (session !== "open") return { id: session, ...(PHASES[session] ?? PHASES.closed) };
  if (sessionFrac < 0.15)
    return {
      id: "open1",
      title: "Abertura do pregão (primeira hora)",
      text: "Começo mais volátil: o fluxo ainda se acomoda e falsas partidas são comuns. Vale esperar o ativo sustentar o movimento e o volume acima da média.",
    };
  if (sessionFrac > 0.85)
    return {
      id: "open3",
      title: "Última hora do pregão",
      text: "O fluxo que sobrevive até o fechamento é o mais confiável do dia. Movimentos tardios com volume mostram quem está levando posição para a noite.",
    };
  return {
    id: "open2",
    title: "Meio do pregão",
    text: "O fluxo já tem direção. Procure ativos fortes em grupos que também ganham força, com volume acima da média.",
  };
}

/**
 * Narrativa do fluxo a partir do snapshot (1 dia) e dos grupos.
 * - tone: apetite a risco (média de futuros de índices, estilos EUA, VIX invertido, cripto e emergentes)
 * - markets: cada grupo com estado (ganha/perde/neutro) e ativos de exemplo
 * - candidates: ativos fortes (≥1σ), de preferência com volume e em grupo forte — pauta de entrada, não recomendação
 * - weak: ativos fracos (≤−1σ) — onde evitar entrada / rever posição
 */
export function flowNarrative(
  rows,
  groups,
  { session = "open", sessionFrac = 1, uni = OFF_UNI } = {},
) {
  const gById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const toneZs = uni.tone.map((id) => gById[id]?.z).filter((z) => Number.isFinite(z));
  const toneZ = toneZs.length ? mean(toneZs) : 0;
  const tone = {
    z: toneZ,
    id: toneZ > 0.4 ? "risk_on" : toneZ < -0.4 ? "risk_off" : "mixed",
    label: toneZ > 0.4 ? "Apetite a risco" : toneZ < -0.4 ? "Aversão a risco" : "Tom misto",
  };
  const markets = groups.map((g) => ({
    id: g.id,
    label: g.label,
    z: g.z,
    breadth: g.breadth,
    n: g.n,
    state: g.z >= STRONG ? "up" : g.z <= -STRONG ? "down" : "flat",
    up: g.top.filter((r) => r.z > 0).slice(0, 2),
    down: g.bottom.filter((r) => r.z < 0).slice(0, 2),
  }));
  const useVol = session === "open"; // fora do pregão o volume relativo não é comparável
  const tradable = rows.filter((r) => !uni.notTradable.has(r.group) && !r.nt);
  const volOk = (r) => useVol && r.relVol >= 1.5;
  const candidates = tradable
    .filter((r) => r.z >= PICK)
    .map((r) => {
      const gs = gById[r.group]?.z ?? 0;
      return {
        ...r,
        hot: volOk(r),
        groupStrong: gs >= STRONG,
        score: r.z + (volOk(r) ? 0.5 : 0) + (gs >= STRONG ? 0.3 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const weak = tradable
    .filter((r) => r.z <= -PICK)
    .map((r) => ({ ...r, hot: volOk(r), groupWeak: (gById[r.group]?.z ?? 0) <= -STRONG }))
    .sort((a, b) => a.z - b.z)
    .slice(0, 5);
  return { phase: uni.phase(session, sessionFrac), tone, markets, candidates, weak };
}

/** Mudanças entre duas narrativas (para o registro do dia): grupo que mudou de estado, tom e candidatos novos. */
export function narrativeChanges(prev, next) {
  if (!prev) return [];
  const out = [];
  if (prev.phase.id !== next.phase.id) out.push({ kind: "phase", text: next.phase.title });
  if (prev.tone.id !== next.tone.id)
    out.push({ kind: "tone", text: `${next.tone.label} (era: ${prev.tone.label.toLowerCase()})` });
  const was = Object.fromEntries(prev.markets.map((m) => [m.id, m.state]));
  for (const m of next.markets) {
    if (!was[m.id] || was[m.id] === m.state) continue;
    const verb =
      m.state === "up"
        ? "passou a ganhar força"
        : m.state === "down"
          ? "passou a perder força"
          : "voltou ao neutro";
    out.push({ kind: m.state, text: `${m.label} ${verb}`, z: m.z });
  }
  const had = new Set(prev.candidates.map((c) => c.sym));
  for (const c of next.candidates)
    if (!had.has(c.sym))
      out.push({ kind: "cand", text: `${c.label} entrou na lista de fortes`, z: c.z, sym: c.sym });
  return out; // prettier-ignore
}

/** Universo Offshore (padrão de todas as funções acima): ativos, grupos, tom de risco, o que não se compra e as fases. */
export const OFF_UNI = {
  id: "off",
  assets: FLOW_ASSETS,
  groups: FLOW_GROUPS,
  byId: GROUP_BY_ID,
  bySym: FLOW_BY_SYM,
  tone: TONE_GROUPS,
  notTradable: NOT_TRADABLE,
  phase: flowPhase,
  rotDefault: "regions",
};

const sma = (xs, i, w) => (i - w + 1 < 0 ? null : mean(xs.slice(i - w + 1, i + 1)));

/**
 * Rotação relativa (inspirada em RRG): força relativa contra um benchmark e o momento dessa força.
 * rsRatio = 100 × MM10(RS)/MM50(RS); rsMom = 100 × rsRatio(t)/rsRatio(t−10). Cauda: 1 ponto a cada `step`.
 * Sem benchmark próprio, usa a média (peso igual) do grupo, normalizada.
 */
export function rotation(flow, groupId, { points = 8, step = 5, uni = OFF_UNI } = {}) {
  const g = uni.byId[groupId];
  if (!g || g.noRotation) return [];
  const members = uni.assets.filter((a) => a.group === groupId && flow.close[a.sym]);
  const n = flow.dates.length;
  let bench;
  if (g.bench && flow.close[g.bench]) bench = flow.close[g.bench];
  else {
    const norm = members.map((a) => {
      const s = seriesOf(flow, a);
      return s.map((v) => v / s[0]);
    });
    bench = Array.from({ length: n }, (_, i) => mean(norm.map((s) => s[i])));
  }
  const out = [];
  for (const a of members) {
    if (a.sym === g.bench) continue;
    const s = seriesOf(flow, a);
    const rs = s.map((v, i) => (100 * v) / bench[i]);
    const ratio = rs.map((_, i) => {
      const f = sma(rs, i, 10);
      const sl = sma(rs, i, 50);
      return f && sl ? (100 * f) / sl : null;
    });
    const tail = [];
    for (let k = points - 1; k >= 0; k--) {
      const i = n - 1 - k * step;
      if (i - 10 < 0 || ratio[i] == null || ratio[i - 10] == null) continue;
      tail.push({ x: ratio[i], y: (100 * ratio[i]) / ratio[i - 10], date: flow.dates[i] });
    }
    if (tail.length)
      out.push({
        sym: a.sym,
        label: a.label,
        name: a.name,
        tail,
        quadrant: quadrantOf(tail.at(-1)),
      });
  }
  return out;
}

export function quadrantOf({ x, y }) {
  if (x >= 100 && y >= 100) return "Liderando";
  if (x >= 100) return "Perdendo força";
  if (y < 100) return "Atrasado";
  return "Ganhando força";
}

/** Treemap "squarified" (Bruls et al.). items: [{size,...}] -> [{x,y,w,h,item}] dentro de rect. */
export function squarify(items, rect) {
  const total = items.reduce((a, b) => a + b.size, 0);
  if (!total || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const nodes = items
    .map((it) => ({ it, area: it.size * scale }))
    .filter((d) => d.area > 0)
    .sort((a, b) => b.area - a.area);
  const out = [];
  let { x, y, w, h } = rect;
  let row = [];
  const worst = (r, side) => {
    const s = r.reduce((a, b) => a + b.area, 0);
    const mx = Math.max(...r.map((d) => d.area));
    const mn = Math.min(...r.map((d) => d.area));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const layout = (r) => {
    const s = r.reduce((a, b) => a + b.area, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const d of r) {
        const ch = d.area / cw;
        out.push({ x, y: cy, w: cw, h: ch, item: d.it });
        cy += ch;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const d of r) {
        const cw = d.area / rh;
        out.push({ x: cx, y, w: cw, h: rh, item: d.it });
        cx += cw;
      }
      y += rh;
      h -= rh;
    }
  };
  for (const d of nodes) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, d], side) <= worst(row, side)) row.push(d);
    else {
      layout(row);
      row = [d];
    }
  }
  if (row.length) layout(row);
  return out;
}

const NY_HM = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
}); // prettier-ignore
/** Fração decorrida do pregão regular de NY (9h30-16h) para um instante. */
export function sessionFraction(now = new Date()) {
  const parts = NY_HM.formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  if (["Sat", "Sun"].includes(get("weekday"))) return 1;
  const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute")) - (9 * 60 + 30);
  return Math.max(0, Math.min(1, mins / 390));
}
