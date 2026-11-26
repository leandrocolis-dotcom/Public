// "Quando entrar": estado do módulo, busca de barras (diárias e de 5 min), análise com cache e registro dos ativos vigiados.
import { ASSETS } from "./universe.js";
import { loadMacro, macro, macroTilt } from "./macro.js";
import { nyDate } from "./live.js";
import * as S from "./ta-signals.js";
import { applyEdge, edgeOf, momentumRank, regimeOf } from "./edge.js";
import { leverageOf } from "./etf-fund.js";
import { barsKey, getBars, peekBars } from "./bars-hub.js";

const BARS_KEEP = 520;

/** Estado do módulo (não persiste; só preferências simples vão para ctx.prefs). */
export const ta = {
  ohlc: null, ohlcAt: 0, ohlcLoading: false, ohlcErr: null,
  intra: {}, cache: new Map(), bt: new Map(), timer: null, ctxGet: null,
}; // prettier-ignore

export async function ensureOhlc(ctx) {
  if (ta.ohlcLoading || Date.now() < ta.ohlcAt) return;
  ta.ohlcLoading = true;
  let changed = false;
  try {
    const r = await fetch("data/ohlc.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    changed = !ta.ohlc || ta.ohlc.dates.at(-1) !== j.dates.at(-1) || ta.ohlcErr;
    ta.ohlc = j;
    ta.ohlcErr = null;
    ta.ohlcAt = Date.now() + 30 * 60_000;
  } catch (e) {
    changed = ta.ohlcErr !== e.message;
    ta.ohlcErr = e.message;
    ta.ohlcAt = Date.now() + 5 * 60_000;
  } finally {
    ta.ohlcLoading = false;
  }
  if (changed) rerender(ctx);
}

/**
 * Separa a resposta de api/intraday?prepost=1: `reg` = só o pregão regular (mesmo formato de antes, para a
 * análise) e `ext` = barras de pré/pós { t, o, h, l, c, v, s } ("pre" | "post"). Sem campo s, tudo é regular.
 */
export function splitSessions(j) {
  const b = j?.bars ?? {};
  const keys = ["t", "o", "h", "l", "c", "v"];
  const pick = (want) => {
    const out = Object.fromEntries(keys.map((k) => [k, []]));
    if (want !== "reg") out.s = [];
    (b.t ?? []).forEach((_, i) => {
      const k = b.s?.[i] ?? "reg";
      if (want === "reg" ? k !== "reg" : k === "reg") return;
      for (const x of keys) out[x].push(b[x]?.[i] ?? (x === "v" ? 0 : null));
      if (want !== "reg") out.s.push(k);
    });
    return out;
  };
  return { reg: { ...j, bars: pick("reg") }, ext: pick("ext") };
}

/**
 * Barras de 5 min do ativo pela central de barras (mesma URL e cache do painel do ativo; revalida na virada da
 * barra; erro tenta de novo em 1 min). Devolve a promessa em andamento se já houver uma busca (quem espera recebe
 * dados novos).
 */
export function ensureIntraday(ctx, sym, force = false) {
  const e = (ta.intra[sym] ??= {});
  if (e.loading) return e.promise;
  const key = barsKey({ symbol: sym, prepost: true });
  const h = peekBars(key);
  if (!force && e.at && h && Date.now() < h.exp && (h.data === e.raw || h.err))
    return Promise.resolve();
  e.loading = true;
  e.promise = (async () => {
    try {
      // com pré/pós: a análise (VWAP, abertura, níveis) segue só com o pregão regular (e.data);
      // o gráfico desenha também o horário estendido (e.ext), como no Investing
      const j = await getBars(key, { force });
      if (!j?.bars) throw new Error(j?.error ?? "sem barras intraday");
      if (j !== e.raw) {
        e.raw = j; // resposta já vista: não refaz a separação (nem repete o erro) até a central renovar
        const sp = splitSessions(j);
        if (!sp.reg.bars.t.length) throw new Error("sem barras do pregão regular");
        e.data = sp.reg;
        e.ext = sp.ext;
      }
      e.err = null;
    } catch (err) {
      e.err = err.message;
    } finally {
      e.loading = false;
      e.at = Date.now();
    }
    if (ctx.prefs.tab === "entry" && ctx.prefs.taSel && ASSETS[ctx.prefs.taSel]?.yahoo === sym)
      rerender(ctx);
  })();
  return e.promise;
}

export function rerender(ctx) {
  if (ctx.prefs.tab !== "entry") return;
  const y = window.scrollY;
  ctx.render();
  window.scrollTo(0, y);
}

export const isOpenNow = (ctx, now = Date.now() / 1000) => {
  if (ctx.live?.market_state) return ctx.live.market_state === "REGULAR";
  const { date, min } = S.nyParts(now);
  const info = S.sessionInfo(date);
  return info.open && min >= 570 && min < info.closeMin;
};

/** Barras diárias do ativo: OHLC do arquivo (ou só fechamentos, se ainda não existir) + o dia de hoje. */
function dailyBars(ctx, code) {
  const o = ta.ohlc?.bars?.[code];
  let b;
  if (o && o.c.length >= 80) {
    b = {
      dates: [...ta.ohlc.dates],
      o: [...o.o],
      h: [...o.h],
      l: [...o.l],
      c: [...o.c],
      v: o.vk.map((x) => x * 1000),
      closeOnly: false,
    };
  } else {
    const s = ctx.prices?.series?.[code];
    if (!s) return null;
    const k = Math.min(BARS_KEEP, s.length);
    const c = s.slice(-k);
    b = {
      dates: ctx.prices.dates.slice(-k),
      o: c,
      h: c,
      l: c,
      c,
      v: c.map(() => 0),
      closeOnly: true,
    };
  }
  return b;
}

/** Acrescenta/atualiza o pregão de hoje com os dados do dia (5 min) ou com a cotação ao vivo. */
function withToday(ctx, code, b, ia) {
  const sym = ASSETS[code].yahoo;
  const open = isOpenNow(ctx);
  if (b.closeOnly) return { bars: b, partial: open };
  const out = {
    ...b,
    dates: [...b.dates],
    o: [...b.o],
    h: [...b.h],
    l: [...b.l],
    c: [...b.c],
    v: [...b.v],
  };
  const lastD = out.dates.at(-1);
  let day = null;
  if (ia)
    day = {
      date: ia.date,
      o: ia.levels.dayO,
      h: ia.levels.dayH,
      l: ia.levels.dayL,
      c: ia.price,
      v: ia.levels.dayV,
    };
  else {
    const q = ctx.live?.quotes?.[sym];
    if (q?.p > 0) {
      const date = nyDate(q.t);
      const base = date === lastD ? out.o.at(-1) : (q.pc ?? out.c.at(-1));
      day = { date, o: base, h: Math.max(base, q.p), l: Math.min(base, q.p), c: q.p, v: q.v ?? 0 };
    }
  }
  if (!day || day.date < lastD) return { bars: out, partial: false };
  if (day.date === lastD) {
    const i = out.c.length - 1;
    out.h[i] = Math.max(out.h[i], day.h);
    out.l[i] = Math.min(out.l[i], day.l);
    out.c[i] = day.c;
    if (day.v > 0) out.v[i] = day.v;
  } else {
    out.dates.push(day.date);
    out.o.push(day.o);
    out.h.push(day.h);
    out.l.push(day.l);
    out.c.push(day.c);
    out.v.push(day.v ?? 0);
  }
  return { bars: out, partial: open };
}

/** Análise diária (com cache por ativo + último dado). */
export function daily(ctx, code, ia = null) {
  const base = dailyBars(ctx, code);
  if (!base) return null;
  const { bars, partial } = withToday(ctx, code, base, ia);
  const key = `${code}|${bars.closeOnly}|${bars.dates.at(-1)}|${bars.c.at(-1)}|${bars.c.length}|${partial}`;
  let hit = ta.cache.get(key);
  if (!hit) {
    const P = S.prepareDaily(bars);
    const a = S.scoreDailyAt(P, P.n - 1, { partialLast: partial });
    hit = { P, a, bars, partial, key };
    if (ta.cache.size > 400) ta.cache.clear();
    ta.cache.set(key, hit);
  }
  return hit;
}

/** Pregão de hoje (5 min) só vale enquanto recente; mais velho que isso, a leitura usa só o quadro diário. */
export const INTRA_MAX_AGE = 10 * 60_000;

/**
 * Resposta ÚNICA de um ativo: lista (radar), detalhe e vigiados usam esta mesma função, com os mesmos insumos,
 * para nunca mostrarem status diferentes. { d (diário), ia (hoje ou null), call (resposta final) } ou null.
 */
export function assetCall(ctx, code, now = Date.now()) {
  const sym = ASSETS[code]?.yahoo;
  const e = sym ? ta.intra[sym] : null;
  const fresh = e?.data && e.at && now - e.at < INTRA_MAX_AGE ? e.data : null;
  const preIa = fresh ? S.analyzeIntraday(fresh.bars) : null;
  const d = daily(ctx, code, preIa);
  if (!d?.a) return null;
  const ia = fresh ? S.analyzeIntraday(fresh.bars, { now: now / 1000 }) : null;
  const call = S.finalCall(d.a, ia);
  const edge = edgeFor(ctx, code, d, callDir(call));
  return { d, ia, call: applyEdge(call, edge), edge };
}

/** Direção que a resposta final recomenda (1 comprar, -1 vender/reduzir, 0 aguardar). */
const callDir = (call) => (call.tone === "buy" ? 1 : call.tone === "sell" ? -1 : 0);

/** Histórico do sinal: muda só quando entra um pregão novo (a cotação ao vivo não refaz o teste). */
export function backtestFor(d) {
  const k = `${d.bars.dates.at(-1)}|${d.bars.closeOnly}|${d.bars.c.length}|${d.key.split("|")[0]}`;
  if (!ta.bt.has(k)) {
    if (ta.bt.size > 200) ta.bt.clear();
    ta.bt.set(k, S.backtestDaily(d.P));
  }
  return ta.bt.get(k);
}

/** Regime do mercado (S&P vs. MM200) e momentum 12-1 do universo: uma vez por pregão. O contexto macro (pilares,
 * regime do relógio do investimento e setores) vem de data/macro.json, atualizado todo pregão (macro.js). */
export function marketContext(ctx) {
  const day = ta.ohlc?.dates?.at(-1) ?? ctx.prices?.dates?.at(-1);
  if (ta.mkt?.day === day) return ta.mkt;
  const closes = (code) => ta.ohlc?.bars?.[code]?.c ?? ctx.prices?.series?.[code];
  const map = {};
  for (const [code, a] of Object.entries(ASSETS))
    if (a.group !== "Macro" && closes(code)) map[code] = closes(code);
  loadMacro();
  ta.mkt = { day, regime: regimeOf(closes("SPY")), mom: momentumRank(map), macro: macro.data };
  return ta.mkt;
}

const DECAY = new Set(["VIXY", "TBF"]);
/** Vantagem da decisão neste ativo (lições 13 a 16): histórico em R, regime, momentum e decaimento. */
export function edgeFor(ctx, code, d, dir) {
  if (!dir || d.bars.closeOnly) return null;
  const bt = backtestFor(d);
  const { regime, mom } = marketContext(ctx);
  const lev = leverageOf(code, ASSETS[code]?.name ?? "");
  return edgeOf({
    dir,
    stats: dir > 0 ? bt.buyR : bt.sellR,
    regime,
    mom: mom[code],
    group: ASSETS[code]?.group,
    decay: DECAY.has(code) || (lev && Math.abs(lev.lev) !== 1),
    macro: macroTilt(ASSETS[code]?.yahoo ?? code),
  });
}

export const WATCH_MAX = 5;
ta.watch = {};

/** Atualiza o pregão dos ativos vigiados e avisa quando a resposta de algum deles muda. */
export async function refreshWatch(ctx, announce = true) {
  if (ta.watchBusy) return;
  ta.watchBusy = true;
  try {
    for (const code of (ctx.prefs.taWatch ?? []).slice(0, WATCH_MAX)) {
      const sym = ASSETS[code]?.yahoo;
      if (!sym) continue;
      await ensureIntraday(ctx, sym);
      const r = assetCall(ctx, code);
      if (!r) continue;
      const { ia, call } = r;
      const prev = ta.watch[code];
      ta.watch[code] = {
        key: call.key,
        headline: call.headline,
        tone: call.tone,
        at: S.brtClock(Date.now() / 1000),
        live: !!ia?.live,
      };
      logChange(code, call, ia);
      if (announce && prev && prev.key !== call.key && ia?.live)
        ctx.toast?.(
          `${code}: ${call.headline}`,
          call.tone === "buy" ? "ok" : call.tone === "sell" ? "bad" : "warn",
          20000,
        );
    }
  } finally {
    ta.watchBusy = false;
  }
  if (ctx.prefs.tab === "entry" && !ctx.prefs.taSel) rerender(ctx);
}

const LOG_KEY = "pendulo.talog";

function readLog() {
  try {
    const j = JSON.parse(localStorage.getItem(LOG_KEY) ?? "null");
    return j?.date === S.nyParts(Date.now() / 1000).date
      ? j
      : { date: S.nyParts(Date.now() / 1000).date, items: {} };
  } catch {
    return { date: S.nyParts(Date.now() / 1000).date, items: {} };
  }
}

/** Anota quando a resposta do ativo muda durante o pregão (ex.: "Aguardar" virou "Comprar"). */
export function logChange(code, call, ia) {
  if (!ia?.live) return readLog().items[code] ?? [];
  const log = readLog();
  const list = (log.items[code] ??= []);
  if (list.at(-1)?.key !== call.key) {
    list.push({
      key: call.key,
      at: S.brtClock(Date.now() / 1000),
      headline: call.headline,
      price: ia.price,
    });
    if (list.length > 20) list.shift();
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(log));
    } catch {
      /* sem armazenamento: o aviso só não persiste */
    }
  }
  return list;
}
