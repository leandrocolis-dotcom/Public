import { describe, it, expect } from "vitest";
import {
  verdictOf, buildPlan, analyzeDaily, prepareDaily, scoreDailyAt, backtestDaily, backtestText,
  nyParts, phaseAt, sessionInfo, splitSessions, analyzeIntraday, finalCall, VERDICTS,
} from "../assets/ta-signals.js"; // prettier-ignore
import { rng, walk } from "./helpers.js";

/** Barras diárias sintéticas a partir de um passeio aleatório. */
function ohlc(n, opts) {
  const c = walk(n, opts);
  const r = rng(99);
  const o = c.map((x, i) => (i ? c[i - 1] * (1 + (r() - 0.5) * 0.004) : x));
  const h = c.map((x, i) => Math.max(x, o[i]) * (1 + r() * 0.006));
  const l = c.map((x, i) => Math.min(x, o[i]) * (1 - r() * 0.006));
  const v = c.map(() => 1_000_000 + Math.floor(r() * 500_000));
  return { o, h, l, c, v };
}

describe("veredito", () => {
  it("faixas do placar", () => {
    expect(verdictOf(60).key).toBe("buy");
    expect(verdictOf(30).key).toBe("lean-buy");
    expect(verdictOf(0).key).toBe("wait");
    expect(verdictOf(-30).key).toBe("lean-sell");
    expect(verdictOf(-80).key).toBe("sell");
    expect(VERDICTS.map((v) => v.min)).toEqual(
      [...VERDICTS.map((v) => v.min)].sort((a, b) => a - b),
    );
  });
});

describe("plano", () => {
  const base = { price: 100, unit: 1, supports: [98, 95], resistances: [103, 108] };
  it("compra: stop abaixo do suporte, metas acima, risco limitado", () => {
    const p = buildPlan({ ...base, dir: 1 });
    expect(p.stop).toBeLessThan(100);
    expect(p.stop).toBeLessThanOrEqual(98 - 0.25 + 1e-9);
    expect(p.t1).toBeGreaterThan(100);
    expect(p.t2).toBeGreaterThan(p.t1);
    expect(p.rr).toBeGreaterThan(1);
    expect((100 - p.stop) / 1).toBeLessThanOrEqual(3);
  });
  it("venda: espelhado", () => {
    const p = buildPlan({ ...base, dir: -1 });
    expect(p.stop).toBeGreaterThan(100);
    expect(p.t1).toBeLessThan(100);
    expect(p.t2).toBeLessThan(p.t1);
  });
  it("sem níveis cai no stop por ATR e metas por múltiplos do risco", () => {
    const p = buildPlan({ dir: 1, price: 50, unit: 1, stopMin: 1.5, stopMax: 3 });
    expect(p.stop).toBeCloseTo(48, 9);
    expect(p.t1).toBeCloseTo(53, 9);
    expect(p.t1Structural).toBe(false);
  });
  it("teto/piso muito distante não vira meta: cai nos múltiplos do risco", () => {
    const p = buildPlan({
      dir: 1,
      price: 100,
      unit: 1,
      supports: [],
      resistances: [130],
      stopMin: 1,
      stopMax: 3,
    });
    expect(p.t1).toBeCloseTo(103, 9); // risco padrão 2 → 1,5x = 3
    expect(p.t1Structural).toBe(false);
    expect(p.rr).toBeCloseTo(1.5, 9);
  });
  it("entradas inválidas devolvem null", () => {
    expect(buildPlan({ dir: 1, price: 0, unit: 1 })).toBeNull();
    expect(buildPlan({ dir: 1, price: 10, unit: 0 })).toBeNull();
  });
});

describe("análise diária", () => {
  it("tendência de alta firme dá placar positivo e cobre as cinco categorias", () => {
    const a = analyzeDaily(ohlc(400, { seed: 4, drift: 0.003, vol: 0.004 }));
    expect(a.score).toBeGreaterThan(20);
    expect(a.dir).toBe(1);
    expect(Object.keys(a.catScores).sort()).toEqual([
      "estrutura",
      "momentum",
      "tendencia",
      "volatilidade",
      "volume",
    ]);
    expect(a.votes.every((v) => v.text && v.title && v.dir >= -1 && v.dir <= 1)).toBe(true);
    expect(a.plan.stop).toBeLessThan(a.plan.entry);
  });
  it("tendência de queda firme dá placar negativo e plano espelhado", () => {
    const a = analyzeDaily(ohlc(400, { seed: 5, drift: -0.003, vol: 0.004 }));
    expect(a.score).toBeLessThan(-20);
    expect(a.plan.stop).toBeGreaterThan(a.plan.entry);
  });
  it("só fechamentos (sem máxima/mínima/volume) funciona e dispensa volume e candles", () => {
    const c = walk(300, { seed: 4, drift: 0.001 });
    const a = analyzeDaily({ o: c, h: c, l: c, c, v: c.map(() => 0), closeOnly: true });
    expect(a).not.toBeNull();
    expect(a.votes.some((v) => v.cat === "volume")).toBe(false);
    expect(a.votes.some((v) => v.id === "candle")).toBe(false);
  });
  it("histórico curto devolve null", () => {
    expect(analyzeDaily(ohlc(30, { seed: 1 }))).toBeNull();
  });
  it("placar fica entre -100 e +100 e é determinístico", () => {
    const b = ohlc(350, { seed: 8 });
    const a1 = analyzeDaily(b);
    const a2 = analyzeDaily(b);
    expect(a1.score).toBe(a2.score);
    expect(Math.abs(a1.score)).toBeLessThanOrEqual(100);
  });
  it("não olha o futuro: o placar do dia i não muda se acrescentarmos barras depois", () => {
    const b = ohlc(400, { seed: 12 });
    const cut = (n) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.slice(0, n)]));
    const a = scoreDailyAt(prepareDaily(cut(350)), 349);
    const z = scoreDailyAt(prepareDaily(b), 349);
    expect(z.score).toBe(a.score);
  });
  it("volume parcial do dia em curso não vira sinal", () => {
    const b = ohlc(300, { seed: 2 });
    b.v[299] = b.v[299] * 50; // dia em formação com volume absurdo
    const P = prepareDaily(b);
    const a = scoreDailyAt(P, 299, { partialLast: true });
    expect(a.votes.find((v) => v.id === "relvol")).toBeDefined();
  });
  it("backtest conta sinais sem sobreposição e gera texto honesto", () => {
    const P = prepareDaily(ohlc(500, { seed: 6, drift: 0.0008 }));
    const bt = backtestDaily(P, { h: 5 });
    expect(bt.days).toBeGreaterThan(200);
    expect(bt.buy.n + bt.sell.n).toBeGreaterThan(0);
    expect(bt.buy.hit === null || (bt.buy.hit >= 0 && bt.buy.hit <= 1)).toBe(true);
    expect(backtestText(bt, 1)).toMatch(/pregões/);
    expect(backtestText(bt, 0)).toBeNull();
  });
});

// ───────────── intradiário ─────────────

const utc = (date, h, m) =>
  Date.parse(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`) / 1000;
/** Sessão regular de 5 min (13:30-20:00 UTC no horário de verão dos EUA); `f(k)` = preço da barra k. */
function session(date, f, { from = 0, count = 78, vol = 1000 } = {}) {
  const out = { t: [], o: [], h: [], l: [], c: [], v: [] };
  for (let k = from; k < from + count; k++) {
    const t = utc(date, 13, 30) + k * 300;
    const o = f(k - 1 < 0 ? 0 : k - 1);
    const c = f(k);
    out.t.push(t);
    out.o.push(o);
    out.c.push(c);
    out.h.push(Math.max(o, c) + 0.05);
    out.l.push(Math.min(o, c) - 0.05);
    out.v.push(vol);
  }
  return out;
}
const join = (...ss) =>
  Object.fromEntries(["t", "o", "h", "l", "c", "v"].map((k) => [k, ss.flatMap((s) => s[k])]));

describe("relógio do pregão", () => {
  it("nyParts converte para Nova York (horário de verão, UTC-4)", () => {
    expect(nyParts(utc("2026-10-05", 13, 30))).toEqual({ date: "2026-10-05", min: 9 * 60 + 30 });
    expect(nyParts(utc("2026-10-05", 3, 0)).date).toBe("2026-10-04");
  });
  it("fases", () => {
    expect(phaseAt(9 * 60 + 35).id).toBe("open");
    expect(phaseAt(10 * 60 + 30).id).toBe("morning");
    expect(phaseAt(12 * 60).id).toBe("lunch");
    expect(phaseAt(15 * 60 + 45).id).toBe("close");
    expect(phaseAt(17 * 60).id).toBe("post");
  });
  it("calendário da NYSE: fim de semana, feriado e pregão encurtado", () => {
    expect(sessionInfo("2026-10-06")).toEqual({ open: true, closeMin: 960, postEnd: 1200, early: false, reason: null }); // prettier-ignore
    expect(sessionInfo("2026-10-10").open).toBe(false);
    expect(sessionInfo("2026-11-26")).toMatchObject({
      open: false,
      reason: expect.stringMatching(/Ação de Graças/),
    });
    expect(sessionInfo("2026-07-03").open).toBe(false); // 4 de julho cai num sábado: observado na sexta
    expect(sessionInfo("2026-11-27")).toMatchObject({ open: true, closeMin: 780 });
  });
  it("pregão encurtado: a janela de fechamento sobe para 12:30 e acaba às 13:00", () => {
    expect(phaseAt(12 * 60 + 40, 780).id).toBe("close");
    expect(phaseAt(12 * 60 + 40).id).toBe("lunch");
    expect(phaseAt(13 * 60 + 5, 780).id).toBe("post");
  });
  it("splitSessions descarta pré e pós-mercado", () => {
    const s = session("2026-10-05", () => 100, { from: -6, count: 90 }); // começa 6 barras antes e passa do fim
    const sess = splitSessions(s);
    expect(sess).toHaveLength(1);
    expect(sess[0].idx).toHaveLength(78);
  });
});

describe("análise do dia", () => {
  const prev1 = session("2026-10-01", (k) => 100 + Math.sin(k / 6));
  const prev2 = session("2026-10-02", (k) => 100 + Math.sin(k / 6));
  it("dia de alta firme: acima da VWAP, rompe a faixa de abertura, placar positivo", () => {
    const today = session("2026-10-05", (k) => 100 + k * 0.04, { count: 40 });
    const bars = join(prev1, prev2, today);
    const a = analyzeIntraday(bars, { now: today.t.at(-1) + 60 });
    expect(a.live).toBe(true);
    expect(a.score).toBeGreaterThan(20);
    expect(a.votes.find((v) => v.id === "vwap").dir).toBeGreaterThan(0);
    expect(a.votes.find((v) => v.id === "orb").dir).toBeGreaterThan(0);
    expect(a.levels.orH).toBeGreaterThan(a.levels.orL);
    expect(a.levels.prevClose).toBeCloseTo(prev2.c.at(-1), 9);
  });
  it("dia de queda: placar negativo", () => {
    const today = session("2026-10-05", (k) => 100 - k * 0.04, { count: 40 });
    const a = analyzeIntraday(join(prev1, prev2, today), { now: today.t.at(-1) + 60 });
    expect(a.score).toBeLessThan(-20);
    expect(a.plan.stop).toBeGreaterThan(a.plan.entry);
  });
  it("nos primeiros minutos manda esperar a abertura", () => {
    const today = session("2026-10-05", (k) => 100 + k * 0.1, { count: 4 });
    const a = analyzeIntraday(join(prev1, prev2, today), { now: today.t.at(-1) + 60 });
    expect(a.phase.id).toBe("open");
    expect(a.votes.find((v) => v.id === "orb").title).toMatch(/ainda se formando/);
    if (a.dir !== 0) expect(a.timing.status).toBe("wait");
  });
  it("o texto da faixa de abertura usa o horário de Brasília da própria data (verão: 11:00)", () => {
    const today = session("2026-10-05", (k) => 100 + k * 0.1, { count: 3 });
    const a = analyzeIntraday(join(prev1, prev2, today), { now: today.t.at(-1) + 60 });
    expect(a.votes.find((v) => v.id === "orb").text).toMatch(/até as 11:00 de Brasília/);
    const winter = session("2026-12-07", (k) => 100 + k * 0.1, { count: 3 });
    // inverno dos EUA: abertura 14:30 UTC (09:30 NY = 11:30 Brasília)
    const w = { ...winter, t: winter.t.map((t) => t + 3600) };
    const b = analyzeIntraday(join(w), { now: w.t.at(-1) + 60 });
    expect(b.votes.find((v) => v.id === "orb").text).toMatch(/até as 12:00 de Brasília/);
  });
  it("fora do pregão usa a última sessão e marca como não-ao-vivo", () => {
    const today = session("2026-10-05", (k) => 100 + k * 0.01);
    const a = analyzeIntraday(join(prev1, prev2, today), { now: utc("2026-10-05", 23, 0) });
    expect(a.live).toBe(false);
    expect(a.phase.id).toBe("post");
    expect(a.date).toBe("2026-10-05");
  });
  it("volume relativo compara com as sessões anteriores no mesmo horário", () => {
    const today = session("2026-10-05", (k) => 100 + k * 0.01, { count: 20, vol: 3000 });
    const a = analyzeIntraday(join(prev1, prev2, today), { now: today.t.at(-1) + 60 });
    expect(a.relVol).toBeCloseTo(3, 6);
  });
  it("sem dados suficientes devolve null", () => {
    expect(analyzeIntraday({ t: [], o: [], h: [], l: [], c: [], v: [] })).toBeNull();
  });
});

describe("resposta final", () => {
  const D = (dir, status = "enter") => ({
    dir,
    verdict: { label: dir > 0 ? "COMPRAR" : "VENDER" },
    timing: { status, text: "t" },
  });
  const I = (dir, status = "enter") => ({ dir, timing: { status, text: "i" } });
  it("combina diário e dia", () => {
    expect(finalCall(D(1), I(1)).key).toBe("buy-now");
    expect(finalCall(D(1, "wait"), I(1)).key).toBe("buy-wait");
    expect(finalCall(D(1), I(-1)).key).toBe("buy-dip");
    expect(finalCall(D(-1), I(-1)).key).toBe("sell-now");
    expect(finalCall(D(-1), I(1)).key).toBe("sell-bounce");
    expect(finalCall(D(0), I(1)).key).toBe("intra-buy");
    expect(finalCall(D(0), I(0)).key).toBe("wait");
  });
  it("sem dados do dia usa só o diário; sem nada, avisa", () => {
    expect(finalCall(D(1), null).tone).toBe("buy");
    expect(finalCall(null, null).key).toBe("none");
  });
});

describe("texto sem sinal", () => {
  it("pctU nunca traz + ou - e trata inválidos", async () => {
    const { pctU } = await import("../assets/format.js");
    expect(pctU(-0.0213)).toBe("2,1%");
    expect(pctU(0.5, 0)).toBe("50%");
    expect(pctU(NaN)).toBe("–");
  });
  it("votos de variação não carregam '+' dentro de frases de queda", () => {
    const a = analyzeDaily(ohlc(400, { seed: 5, drift: -0.003, vol: 0.004 }));
    const roc = a.votes.find((v) => v.id === "roc");
    expect(roc.title).toMatch(/^Caiu \d/);
  });
});
