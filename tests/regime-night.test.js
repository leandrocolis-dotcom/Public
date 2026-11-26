import { describe, expect, it } from "vitest";
import { sinceNyClose } from "../assets/dash.js";
import { impliedByVixEtf, offQuote } from "../assets/offmarket.js";

describe("bolsa de fora medida desde o fechamento de NY", () => {
  // 23/11/2026: Kospi −4,7% na segunda depois de NY −3,6% na sexta (EWY −8,9% na sexta, Kospi −5,2%)
  const close = { "^KS11": [5067.44, 5137.89, 5137.89], EWY: [136.73, 134.59, 122.67] };
  it("tira o que NY já andou depois do fechamento local", () => {
    const m = sinceNyClose(4639.02 / 4869.96 - 1, close, "^KS11", 4869.96);
    expect(m).toBeCloseTo(4639.02 / (5137.89 * (122.67 / 134.59)) - 1, 6);
    expect(m).toBeGreaterThan(-0.015);
  });
  it("série com o próprio pc no fim usa o fechamento anterior a ele", () => {
    const c2 = { "^KS11": [5067.44, 5137.89, 4869.96], EWY: close.EWY };
    expect(sinceNyClose(-0.0474, c2, "^KS11", 4869.96)).toBeCloseTo(sinceNyClose(-0.0474, close, "^KS11", 4869.96), 9); // prettier-ignore
  });
  it("sem ETF do país ou histórico, não mexe", () => {
    expect(sinceNyClose(-0.02, close, "^TWII", 100)).toBe(-0.02);
    expect(sinceNyClose(-0.02, {}, "^KS11", 4869.96)).toBe(-0.02);
  });
});

describe("VIX fora do pregão", () => {
  const now = 1795400000;
  const vix = { p: 35.89, pc: 28.44, t: now - 3 * 86400, ms: "CLOSED" };
  it("usa o pré do VIXY (futuros de VIX) quando fresco", () => {
    const vixy = { p: 26.53, pc: 22.88, t: now - 3 * 86400, xp: 25.2, xt: now - 120, xk: "pre" };
    const r = impliedByVixEtf(vix, vixy, 2, now);
    expect(r.p).toBeCloseTo(35.89 * (1 + 2 * (25.2 / 26.53 - 1)), 6);
    const q = offQuote("^VIX", vix, { "^VIX": vix, VIXY: vixy }, now);
    expect(q.offFut).toBe("VIXY");
    expect(q.p).toBeCloseTo(r.p, 6);
  });
  it("sem pré/pós fresco do VIXY, cai no S&P (ES=F)", () => {
    const vixy = { p: 26.53, pc: 22.88, t: now - 3 * 86400, xp: 25.2, xt: now - 3 * 3600 };
    expect(impliedByVixEtf(vix, vixy, 2, now)).toBeNull();
    const es = { p: 7069.25, pc: 6935, t: now - 60 };
    const q = offQuote("^VIX", vix, { "^VIX": vix, VIXY: vixy, "ES=F": es }, now);
    expect(q.offFut).toBe("ES=F");
    expect(q.p).toBeLessThan(35.89);
  });
});

describe("pêndulo ao vivo", () => {
  it("VIX alto mas caindo forte deixa de travar a parte de volatilidade no mínimo", async () => {
    const { volScore } = await import("../assets/regime-strength.js");
    expect(volScore(36, 1.1)).toBeLessThan(-0.9);
    expect(volScore(36, 1.1, -2)).toBeGreaterThan(volScore(36, 1.1) + 0.8);
    expect(volScore(36, 1.1, null)).toBeCloseTo(volScore(36, 1.1), 9);
  });
  it("janela de 1 dia usa os pesos ao vivo (médias de 20/50 só como pano de fundo)", async () => {
    const { STRENGTH_W_LIVE, regimeStrength } = await import("../assets/regime-strength.js");
    expect(STRENGTH_W_LIVE.trend).toBe(0);
    const s = Array.from({ length: 80 }, (_, i) => 100 - i * 0.5); // tendência de baixa
    s.push(s.at(-1) * 1.03); // repique de +3% agora
    const items = [{ c: 0.03, s }];
    const live = regimeStrength(items, 1, { weights: STRENGTH_W_LIVE });
    const old = regimeStrength(items, 1);
    expect(live.score).toBeGreaterThan(old.score);
  });
  it("ETF do país no pregão de NY: referência é o fechamento de ontem (pc)", () => {
    // série com o pregão de hoje já sobreposto (overlay): ..., qui, sex, seg ao vivo
    const close = {
      "^KS11": [5067.44, 5137.89, 4869.96, 4639.02],
      EWY: [136.73, 134.59, 122.67, 124.1],
    };
    const etfQ = { p: 124.1, pc: 122.67, ms: "REGULAR" };
    const m = sinceNyClose(4639.02 / 4869.96 - 1, close, "^KS11", 4869.96, etfQ);
    expect(m).toBeCloseTo(4639.02 / (5137.89 * (122.67 / 134.59)) - 1, 6);
  });
  it("linha das fontes", async () => {
    const { feedLine } = await import("../assets/home-view.js");
    expect(
      feedLine({
        live: 11,
        n: 15,
        srcs: ["futuros", "pré-market"],
        vix: "VIX pelos futuros (VIXY)",
      }),
    ).toBe("11 de 15 razões ao vivo · futuros, pré-market · VIX pelos futuros (VIXY)");
    expect(feedLine(null)).toBe("");
  });
});

describe("variação da nota em 1h, 3h e 5h", () => {
  it("chips com seta e pontos; sem dado vira traço", async () => {
    const { movesHtml } = await import("../assets/home-view.js");
    const h = movesHtml({ 1: 4.4, 3: -2, 5: null });
    expect(h).toContain("1h</small> ▲ 4");
    expect(h).toContain("3h</small> ▼ 2");
    expect(h).toContain("5h</small> —");
    expect(movesHtml({ 1: null, 3: null, 5: null })).toBe("");
  });
  it("janelas curtas: 15/30/45 min na de 1h", async () => {
    const { movesHtml } = await import("../assets/home-view.js");
    const h = movesHtml({ 0.25: 3, 0.5: -1, 0.75: 0 }, [0.25, 0.5, 0.75]);
    expect(h).toContain("15 min</small> ▲ 3");
    expect(h).toContain("30 min</small> ▼ 1");
    expect(h).toContain("45 min</small> = 0");
    expect(h).toContain("desde 15 min, 30 min e 45 min atrás");
  });
});

describe("pêndulo das últimas horas (1h/3h/5h)", () => {
  it("desvio escala com √(horas ÷ 6,5) e para em 1 dia", async () => {
    const { hourScale } = await import("../assets/regime-history.js");
    expect(hourScale(6.5)).toBe(1);
    expect(hourScale(24)).toBe(1);
    expect(hourScale(1)).toBeCloseTo(Math.sqrt(1 / 6.5), 9);
  });
  it("alta só dos ativos de risco na última hora dá nota positiva; nada mexendo, ~0", async () => {
    const { regimeOver, REGIME_SYMS } = await import("../assets/regime-history.js");
    const dates = [];
    const d0 = Date.parse("2026-08-03T00:00:00Z");
    for (let i = 0; dates.length < 70; i++) {
      const d = new Date(d0 + i * 86400e3);
      if (d.getUTCDay() % 6) dates.push(d.toISOString().slice(0, 10));
    }
    const close = {};
    for (const s of REGIME_SYMS)
      close[s] = dates.map((_, i) => 100 * (1 + 0.01 * Math.sin(i * 1.7 + s.length)));
    const now = Date.parse(`${dates.at(-1)}T23:00:00Z`) / 1000 + 86400; // dia seguinte, depois do último fechamento
    const flat = {};
    const up = {};
    const risk = new Set(["SPY", "QQQ", "HYG", "XLY", "IWM", "RSP", "EEM", "^STOXX50E", "^N225", "^HSI", "^KS11", "HG=F", "AUDJPY=X", "EMB"]); // prettier-ignore
    for (const s of REGIME_SYMS) {
      const t = [now - 3 * 3600, now - 3600, now - 60];
      const p0 = close[s].at(-1);
      flat[s] = { t, c: [p0, p0, p0] };
      up[s] = { t, c: [p0, p0, risk.has(s) ? p0 * 1.006 : p0] };
    }
    const daily = { dates, close };
    const f = regimeOver({ daily, series: flat, nowSec: now, hours: 1 });
    const u = regimeOver({ daily, series: up, nowSec: now, hours: 1 });
    expect(Math.abs(f.strength.score)).toBeLessThan(15);
    expect(u.strength.score).toBeGreaterThan(f.strength.score + 20);
  });
  it("chips da janela de 1h: nota do dia em 5/15/30/45 min, a mesma trilha da velocidade do humor", async () => {
    const { regimeMoves, moodSpeed, OVER_STEPS, REGIME_SYMS } =
      await import("../assets/regime-history.js");
    expect(OVER_STEPS).toEqual({ 1: [5 / 60, 0.25, 0.5, 0.75], 3: [1, 2, 3], 5: [1, 3, 5] });
    const dates = [];
    const d0 = Date.parse("2026-08-03T00:00:00Z");
    for (let i = 0; dates.length < 70; i++) {
      const d = new Date(d0 + i * 86400e3);
      if (d.getUTCDay() % 6) dates.push(d.toISOString().slice(0, 10));
    }
    const close = {};
    for (const s of REGIME_SYMS)
      close[s] = dates.map((_, i) => 100 * (1 + 0.01 * Math.sin(i * 1.7 + s.length)));
    const now = Date.parse(`${dates.at(-1)}T23:00:00Z`) / 1000 + 86400;
    const risk = new Set(["SPY", "QQQ", "HYG", "XLY", "IWM", "RSP", "EEM", "^STOXX50E", "^N225", "^HSI", "^KS11", "HG=F", "AUDJPY=X", "EMB"]); // prettier-ignore
    const series = {};
    for (const s of REGIME_SYMS) {
      const t = [];
      const c = [];
      const p0 = close[s].at(-1);
      for (let x = now - 2 * 3600; x <= now; x += 300) {
        t.push(x);
        c.push(risk.has(s) && x > now - 600 ? p0 * 1.006 : p0);
      }
      series[s] = { t, c };
    }
    const daily = { dates, close };
    const m = regimeMoves({ daily, series, nowSec: now, hours: OVER_STEPS[1] });
    const sp = moodSpeed({ daily, series, nowSec: now });
    expect(m[0.25]).toBeGreaterThan(15);
    // os chips e a velocidade saem da MESMA trilha
    for (const [h, min] of [[5 / 60, 5], [0.25, 15]]) expect(m[h]).toBe(sp.pts[0] - sp.pts[min]); // prettier-ignore
  });
});

describe("velocidade do humor (nota do dia em minutos)", () => {
  it("leitura pura: ritmo, aceleração, virada e concordância (pts/min)", async () => {
    const { speedFrom } = await import("../assets/regime-history.js");
    // nota subiu 5 em 5 min, 3 só no último minuto: acelerando
    const a = speedFrom({ 0: 5, 1: 2, 3: 1, 5: 0, 10: -0.5, 15: -1 });
    expect(a.pace).toBe(1);
    expect(a.fast).toBe(3);
    expect(a.slow).toBe(0.5);
    expect(a.side).toBe(1);
    expect(a.state).toBe("acelerando");
    expect(a.agree).toBe(5);
    expect(a.conf).toBe("alta");
    expect(a.coarse).toBe(false);
    // subiu nos 5 min e o último minuto devolve: virando
    expect(speedFrom({ 0: 4, 1: 5, 3: 3, 5: 0, 10: 0, 15: 0 }).state).toBe("virando");
    // subida forte entre 5 e 1 min, parada no último minuto: freando
    expect(speedFrom({ 0: 6, 1: 6, 3: 4, 5: 0, 10: 0, 15: 0 }).state).toBe("freando");
    // ruído: parado, sem concordância
    const p = speedFrom({ 0: 0.5, 1: 0.2, 3: 0.6, 5: 0, 10: 0.4, 15: 0 });
    expect(p.state).toBe("parado");
    expect(p.agree).toBeNull();
    // sem o ponto de 1 min (trilha curta): usa 0–5 × 5–15 e marca "medindo"
    const c = speedFrom({ 0: 5, 1: null, 3: null, 5: 0, 10: 0, 15: 0 });
    expect(c.coarse).toBe(true);
    expect(c.state).toBe("acelerando");
    // sem 5 min, ou sem 1 e sem 15: sem leitura
    expect(speedFrom({ 0: 5, 1: 4, 5: null })).toBeNull();
    expect(speedFrom({ 0: 5, 5: 0, 15: null })).toBeNull();
  });
  it("trilha: guarda 20 min e casa o ponto mais perto dentro da folga", async () => {
    const { pushTrail, trailAt } = await import("../assets/regime-history.js");
    let t = [];
    for (let x = 0; x <= 1500; x += 15) t = pushTrail(t, x, x / 100);
    expect(t[0].t).toBeGreaterThan(1500 - 1200);
    expect(trailAt(t, 1440, 25)).toBe(14.4);
    expect(trailAt(t, 1446, 10)).toBe(14.4);
    expect(trailAt(t, 1447, 5)).toBeNull();
    expect(trailAt(t, 100, 25)).toBeNull();
    expect(pushTrail(t, NaN, 1)).toBe(t);
  });
  it("trilha de 1 e 3 min entra na conta; sem ela, só barras (medindo)", async () => {
    const { moodSpeed, REGIME_SYMS } = await import("../assets/regime-history.js");
    const dates = [];
    const d0 = Date.parse("2026-08-03T00:00:00Z");
    for (let i = 0; dates.length < 70; i++) {
      const d = new Date(d0 + i * 86400e3);
      if (d.getUTCDay() % 6) dates.push(d.toISOString().slice(0, 10));
    }
    const close = {};
    for (const s of REGIME_SYMS)
      close[s] = dates.map((_, i) => 100 * (1 + 0.01 * Math.sin(i * 1.7 + s.length)));
    const now = Date.parse(`${dates.at(-1)}T23:00:00Z`) / 1000 + 86400;
    const series = {};
    for (const s of REGIME_SYMS) {
      const t = [];
      const c = [];
      for (let x = now - 2 * 3600; x <= now; x += 300) {
        t.push(x);
        c.push(close[s].at(-1));
      }
      series[s] = { t, c };
    }
    const daily = { dates, close };
    const bare = moodSpeed({ daily, series, nowSec: now });
    expect(bare.coarse).toBe(true);
    const s0 = bare.now;
    // a nota esteve 3 pontos abaixo há 1 min e 4 abaixo há 3 min: o último minuto anda rumo ao risco
    const trail = [
      { t: now - 180, s: s0 - 4 },
      { t: now - 60, s: s0 - 3 },
    ];
    const sp = moodSpeed({ daily, series, nowSec: now, trail });
    expect(sp.coarse).toBe(false);
    expect(sp.pts[1]).toBe(s0 - 3);
    expect(sp.fast).toBeCloseTo(3, 6);
  });
  it("trilha real: alta dos ativos de risco nos últimos 5 min = acelerando rumo ao risco; nada mexendo = parado", async () => {
    const { moodSpeed, REGIME_SYMS } = await import("../assets/regime-history.js");
    const dates = [];
    const d0 = Date.parse("2026-08-03T00:00:00Z");
    for (let i = 0; dates.length < 70; i++) {
      const d = new Date(d0 + i * 86400e3);
      if (d.getUTCDay() % 6) dates.push(d.toISOString().slice(0, 10));
    }
    const close = {};
    for (const s of REGIME_SYMS)
      close[s] = dates.map((_, i) => 100 * (1 + 0.01 * Math.sin(i * 1.7 + s.length)));
    const now = Date.parse(`${dates.at(-1)}T23:00:00Z`) / 1000 + 86400;
    const risk = new Set(["SPY", "QQQ", "HYG", "XLY", "IWM", "RSP", "EEM", "^STOXX50E", "^N225", "^HSI", "^KS11", "HG=F", "AUDJPY=X", "EMB"]); // prettier-ignore
    const mk = (move) => {
      const series = {};
      for (const s of REGIME_SYMS) {
        const t = [];
        const c = [];
        const p0 = close[s].at(-1);
        for (let x = now - 2 * 3600; x <= now; x += 300) {
          t.push(x);
          c.push(risk.has(s) && x > now - 300 ? p0 * move : p0);
        }
        series[s] = { t, c };
      }
      return series;
    };
    const up = moodSpeed({ daily: { dates, close }, series: mk(1.004), nowSec: now });
    expect(up.side).toBe(1);
    expect(up.state).toBe("acelerando");
    expect(up.pts[0]).toBeGreaterThan(up.pts[5]);
    const flat = moodSpeed({ daily: { dates, close }, series: mk(1), nowSec: now });
    expect(flat.state).toBe("parado");
  });
  it("faixa na tela", async () => {
    const { speedHtml, movesHtml } = await import("../assets/home-view.js");
    const h = speedHtml({ pace: 1.24, fast: 3, slow: 0.5, side: 1, state: "acelerando", agree: 5, n: 5, conf: "alta", seg: [], coarse: false }); // prettier-ignore
    expect(h).toMatch(/▲ 1[.,]2 pts\/min/);
    expect(h).toContain("acelerando");
    expect(h).toContain("5 de 5 trechos");
    expect(speedHtml({ pace: -30, fast: 20, slow: -50, side: -1, state: "virando", agree: 3, n: 5, conf: "média", seg: [] })).toContain("virando para o risco"); // prettier-ignore
    expect(movesHtml({ [5 / 60]: 2 }, [5 / 60, 0.25])).toContain("5 min</small> ▲ 2");
  });
});
