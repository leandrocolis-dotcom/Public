import { describe, it, expect } from "vitest";
import { ROT_WINDOWS, buildGrid, livePoint, rotationIntraday, windowStart, intradaySymbols, slotPicks, segIntensity, playTimeline, frameTail, resampleTail, fitAxis, followAxis, ROT_SPEEDS, rotSpeed, playStep, playStart, headSpeed, speedBoard, speedLevel } from "../assets/rot-intraday.js"; // prettier-ignore
import { quadrantOf } from "../assets/flow-engine.js";
import { parseSymbols, MAX_BATCH } from "../api/intraday.js";

// 2 pregões de barras de 5 min (4:00–20:00 em NY, gmt −5 h), preços sintéticos
const GMT = -5 * 3600;
const D0 = Date.UTC(2026, 10, 2) / 1000 - GMT; // meia-noite local de 02/11 em segundos UTC
function bars(drift, days = 2, from = 4 * 60, to = 20 * 60) {
  const t = [];
  const c = [];
  const s = [];
  let p = 100;
  for (let d = 0; d < days; d++)
    for (let m = from; m < to; m += 5) {
      t.push(D0 + d * 86400 + m * 60);
      p *= 1 + drift;
      c.push(p);
      s.push(m < 570 ? "pre" : m >= 960 ? "post" : "reg");
    }
  return { t, c, s, g: GMT };
}

const g = { id: "x", bench: "SPY" };
const members = [
  { sym: "UP", label: "Up", name: "Sobe" },
  { sym: "DN", label: "Dn", name: "Cai" },
  { sym: "SPY", label: "S&P", name: "S&P 500" },
];
const data = { series: { SPY: bars(0), UP: bars(0.0004), DN: bars(-0.0004) } };

describe("rotação intraday", () => {
  it("ativo que sobe mais que o benchmark fica à direita; o que cai, à esquerda", () => {
    for (const wk of Object.keys(ROT_WINDOWS).filter((k) => ROT_WINDOWS[k].intra)) {
      const r = rotationIntraday(data, g, members, wk, {}, quadrantOf);
      const up = r.find((d) => d.sym === "UP");
      const dn = r.find((d) => d.sym === "DN");
      expect(r.find((d) => d.sym === "SPY")).toBeUndefined(); // o benchmark não entra
      expect(up.tail.at(-1).x).toBeGreaterThan(100);
      expect(dn.tail.at(-1).x).toBeLessThan(100);
      // um ponto por fatia de `every` min alinhada ao relógio
      const every = ROT_WINDOWS[wk].every * 60;
      const ts = up.tail.map((p) => p.t);
      expect(new Set(ts).size).toBe(ts.length);
      for (const t of ts.slice(0, -1)) expect(t % every).toBe(0);
      expect(ts.at(-1)).toBeGreaterThan(ts.at(-2));
    }
  });

  it("janela de 1h só tem pontos da última hora; Hoje (Off) começa no pós da véspera", () => {
    const r = rotationIntraday(data, g, members, "1h", {}, quadrantOf);
    const tl = r[0].tail;
    expect(tl.at(-1).t - tl[0].t).toBeLessThanOrEqual(3600);
    const today = rotationIntraday(data, g, members, "today", {}, quadrantOf)[0].tail;
    expect(today[0].t).toBeGreaterThanOrEqual(D0 + 16 * 3600); // pós de ontem (16:00 NY)
    expect(today[0].t).toBeLessThan(D0 + 86400);
    expect(today[0].s).toBe("post");
    expect(today[0].label).toMatch(/^ontem .*\(pós\)$/);
    expect(today.some((p) => p.label.includes("(pré)"))).toBe(true);
  });

  it("Hoje (On) logo após a abertura completa com o fim do pregão anterior e tem velocidade", () => {
    // dia 1 inteiro + dia 2 até 9:40 de NY (pregão aberto há 10 min)
    const cut = (sr) => {
      const n = sr.t.findIndex((x) => x > D0 + 86400 + (9 * 60 + 40) * 60);
      return { ...sr, t: sr.t.slice(0, n), c: sr.c.slice(0, n), s: sr.s.slice(0, n) };
    };
    const early = { series: Object.fromEntries(Object.entries(data.series).map(([k, v]) => [k, cut(v)])) }; // prettier-ignore
    const r = rotationIntraday(early, g, members, "today", {}, quadrantOf, { ext: false });
    expect(r.length).toBe(2);
    const tl = r.find((d) => d.sym === "UP").tail;
    expect(tl.length).toBeGreaterThanOrEqual(3);
    expect(tl[0].label).toMatch(/^ontem /);
    expect(tl.every((p) => p.s === "reg")).toBe(true);
    expect(speedBoard(r).length).toBe(2);
  });

  it("preço ao vivo (pré/pós) mais novo vira o último ponto", () => {
    const last = data.series.UP.t.at(-1);
    const live = { UP: { p: 200, t: last - 100, xp: 300, xt: last + 600 } };
    expect(livePoint(live.UP)).toEqual({ p: 300, t: last + 600 });
    const r = rotationIntraday(data, g, members, "1h", live, quadrantOf);
    expect(r.find((d) => d.sym === "UP").tail.at(-1).t).toBeGreaterThan(last - 300);
  });

  it("grade tira horários em que quase ninguém negociou e repete o último preço", () => {
    const series = { A: { t: [0, 300, 600], c: [1, 2, 3] }, B: { t: [0, 600], c: [10, 30] }, C: { t: [0, 600, 99999], c: [5, 6, 7] } }; // prettier-ignore
    const gr = buildGrid(series, ["A", "B", "C"], 5);
    expect(gr.t).toEqual([0, 300, 600, 99900]); // 99900 tem 1 de 3 (≥30%): entra
    expect(gr.vals.B).toEqual([10, 10, 30, 30]);
  });

  it("windowStart e símbolos do lote", () => {
    expect(windowStart([0, 60, 3600, 7200], { min: 60 })).toBe(2);
    expect(intradaySymbols(g, members)).toEqual(["DN", "SPY", "UP"]);
    expect(parseSymbols("SPY, QQQ,SPY,<x>,EURUSD=X")).toEqual(["SPY", "QQQ", "EURUSD=X"]);
    expect(parseSymbols(Array.from({ length: 60 }, (_, i) => `A${i}`).join(",")).length).toBe(
      MAX_BATCH,
    );
  });

  it("sem dados ou janela diária: vazio", () => {
    expect(rotationIntraday(null, g, members, "1h", {}, quadrantOf)).toEqual([]);
    expect(rotationIntraday(data, g, members, "8w", {}, quadrantOf)).toEqual([]);
  });
});

describe("símbolos buscáveis", () => {
  it("cestas calculadas no app (S:xxx) ficam de fora; sem membros buscáveis não pede o benchmark", () => {
    expect(intradaySymbols({ bench: "^BVSP" }, [{ sym: "S:oil" }, { sym: "S:fin" }])).toEqual([]);
    expect(intradaySymbols({ bench: "^BVSP" }, [{ sym: "PETR4.SA" }, { sym: "S:fin" }])).toEqual(["PETR4.SA", "^BVSP"]); // prettier-ignore
  });
});

describe("animação da rotação", () => {
  it("Hoje: um ponto a cada meia hora (fim de cada meia hora) e o último é o preço de agora", () => {
    const today = rotationIntraday(data, g, members, "today", {}, quadrantOf)[0].tail;
    const last = data.series.UP.t.at(-1);
    expect(today.at(-1).t).toBe(last + 300); // fim da barra mais nova (5 min)
    // todos menos o último marcam o fim de uma meia hora (:00 ou :30)
    for (const p of today.slice(0, -1)) expect(p.t % 1800).toBe(0);
    expect(today.at(-2).label).toMatch(/:(00|30)/);
    expect(today.length).toBe(40); // pós da véspera (8) + 4:00–20:00 de hoje (32)
  });

  it("slotPicks fica com o último índice de cada fatia", () => {
    expect(slotPicks([0, 300, 1500, 1800, 2100, 3700], 0, 30)).toEqual([2, 4, 5]);
    expect(slotPicks([0, 300, 1500, 1800], 1, 30)).toEqual([2, 3]);
  });

  it("segIntensity: trecho mais longo = mais forte, de 0 a 1", () => {
    const d = [
      {
        tail: [
          { x: 100, y: 100 },
          { x: 100.1, y: 100 },
          { x: 101, y: 100 },
        ],
      },
    ];
    const [w] = segIntensity(d);
    expect(w).toHaveLength(2);
    expect(w[1]).toBe(1);
    expect(w[0]).toBeCloseTo(0.1 / 0.9, 5);
    expect(segIntensity([{ tail: [{ x: 1, y: 1 }] }])).toEqual([[]]);
  });

  it("play: a cabeça desliza em linha reta entre dois pontos", () => {
    const d = [
      {
        tail: [
          { t: 1, x: 100, y: 100 },
          { t: 2, x: 102, y: 98 },
          { t: 3, x: 103, y: 99 },
        ],
      },
      {
        tail: [
          { t: 2, x: 99, y: 101 },
          { t: 3, x: 98, y: 102 },
        ],
      },
    ];
    const tl = playTimeline(d);
    expect(tl).toEqual([1, 2, 3]);
    expect(frameTail(d[0].tail, tl, 0)).toHaveLength(1);
    expect(frameTail(d[1].tail, tl, 0)).toEqual([]); // ainda não tinha ponto
    const mid = frameTail(d[0].tail, tl, 0.5);
    expect(mid).toHaveLength(2);
    expect(mid[1]).toMatchObject({ x: 101, y: 99, partial: true });
    expect(frameTail(d[0].tail, tl, 2)).toEqual(d[0].tail);
    expect(frameTail(d[0].tail, tl, null)).toEqual(d[0].tail);
    expect(frameTail(d[0].tail, tl, 2, 2)).toEqual(d[0].tail.slice(-2)); // rastro curto
    expect(playTimeline([{ tail: [{ date: "2026-11-02" }, { date: "2026-10-30" }] }])).toEqual(["2026-10-30", "2026-11-02"]); // prettier-ignore
  });

  it("resampleTail mantém as pontas e interpola no meio", () => {
    const r = resampleTail(
      [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
      ],
      3,
    );
    expect(r).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 10 },
      { x: 10, y: 20 },
    ]);
    expect(resampleTail([{ x: 1, y: 2 }], 2)).toEqual([
      { x: 1, y: 2 },
      { x: 1, y: 2 },
    ]);
    expect(resampleTail([], 3)).toEqual([]);
  });
});

describe("escala que cobre todas as caudas (fitAxis)", () => {
  it("nenhum ponto fica fora: o mais distante também cabe", () => {
    const vals = [99.8, 99.9, 100, 100.1, 100.2, 100.3, 100.4, 100.6, 101, 102, 103.9, 98];
    const [lo, hi] = fitAxis(vals, 0.2);
    expect(lo).toBeLessThan(98);
    expect(hi).toBeGreaterThan(103.9);
  });
  it("tudo de um lado: 100 continua dentro, com folga", () => {
    const [lo, hi] = fitAxis([101, 101.2, 101.5], 0.2);
    expect(lo).toBeLessThan(100);
    expect(hi).toBeGreaterThan(101.5);
  });
  it("amplitude mínima e lista vazia", () => {
    const [lo, hi] = fitAxis([100, 100.01], 0.2);
    expect(hi - lo).toBeGreaterThanOrEqual(0.2);
    expect(fitAxis([], 3)).toEqual([98.5, 101.5]);
  });
});

describe("zoom que acompanha o play (followAxis)", () => {
  it("abre na hora quando o ponto ia sair", () => {
    expect(followAxis([99, 101], [98, 102])).toEqual([98, 102]);
  });
  it("fecha aos poucos quando sobra espaço (nunca corta)", () => {
    const [lo, hi] = followAxis([98, 102], [99, 101], 0.1);
    expect(lo).toBeCloseTo(98.1);
    expect(hi).toBeCloseTo(101.9);
    expect(lo).toBeLessThan(99);
    expect(hi).toBeGreaterThan(101);
  });
  it("sem escala anterior: usa a nova", () => {
    expect(followAxis(null, [99, 101])).toEqual([99, 101]);
  });
});

describe("switch On/Off market", () => {
  it("On: só o pregão regular (9:30–16:00), sem pré, pós nem pós da véspera", () => {
    const r = rotationIntraday(data, g, members, "today", {}, quadrantOf, { ext: false });
    const tl = r.find((d) => d.sym === "UP").tail;
    expect(tl.every((p) => p.s === "reg")).toBe(true);
    expect(tl[0].t).toBeGreaterThanOrEqual(D0 + 86400 + 9.5 * 3600);
    expect(tl.at(-1).t).toBeLessThanOrEqual(D0 + 86400 + 16 * 3600);
    expect(tl.some((p) => /pré|pós/.test(p.label))).toBe(false);
  });
  it("On com a bolsa fechada: o negócio das 16:00 vira o fim do pregão, não um ponto do pós", () => {
    const close = D0 + 86400 + 16 * 3600;
    const live = { UP: { p: 999, t: close + 2 }, SPY: { p: 100, t: close + 2 } };
    const tl = rotationIntraday(data, g, members, "today", live, quadrantOf, { ext: false }).find((d) => d.sym === "UP").tail; // prettier-ignore
    expect(tl.at(-1).t).toBe(close);
    expect(tl.at(-1).s).toBe("reg");
  });
  it("Off: pré e pós entram e ficam marcados", () => {
    const tl = rotationIntraday(data, g, members, "today", {}, quadrantOf, { ext: true }).find((d) => d.sym === "UP").tail; // prettier-ignore
    expect(tl.some((p) => p.s === "pre")).toBe(true);
    expect(tl.some((p) => p.s === "post")).toBe(true);
  });
  it("livePoint: On ignora o pré/pós; Off usa o pré/pós real, nunca o preço implícito pelo futuro", () => {
    const q = { p: 501, t: 200, regP: 500, regT: 100, xp: 505, xt: 150 }; // p/t = implícito do futuro (modo Off)
    expect(livePoint(q, true)).toEqual({ p: 505, t: 150 });
    expect(livePoint(q, false)).toEqual({ p: 500, t: 100 });
    expect(livePoint({ p: 10, t: 5 }, true)).toEqual({ p: 10, t: 5 });
  });
  it("sem sessões marcadas (B3): nada é filtrado nem rotulado", () => {
    const r = rotationIntraday(data, g, members, "today", {}, quadrantOf, {
      ext: false,
      sessions: false,
    });
    const tl = r.find((d) => d.sym === "UP").tail;
    expect(tl.length).toBe(32);
    expect(tl.some((p) => /pré|pós/.test(p.label))).toBe(false);
  });
});

describe("velocidade do play", () => {
  it("escala crescente e valor inválido vira 1x", () => {
    expect(ROT_SPEEDS).toEqual([-1, 0.5, 1, 2]);
    expect(rotSpeed("2")).toBe(2);
    expect(rotSpeed("-1")).toBe(-1);
    expect(rotSpeed("3")).toBe(1);
    expect(rotSpeed(undefined)).toBe(1);
  });
  it("2x anda o dobro de 1x; 0,5x a metade", () => {
    const one = playStep(2, 21, 1, 1).f - 2;
    expect(playStep(2, 21, 1, 2).f - 2).toBeCloseTo(2 * one);
    expect(playStep(2, 21, 1, 0.5).f - 2).toBeCloseTo(one / 2);
  });
  it("para frente termina no agora; para trás (−1x) volta e para no começo", () => {
    expect(playStep(19.9, 21, 1, 1)).toEqual({ f: null, playing: false });
    const back = playStep(10, 21, 1, -1);
    expect(back.f).toBeLessThan(10);
    expect(back.playing).toBe(true);
    expect(playStep(0.1, 21, 1, -1)).toEqual({ f: 0, playing: false });
  });
  it("ponto de partida conforme o sentido", () => {
    expect(playStart(null, 21, 1)).toBe(0);
    expect(playStart(5, 21, 1)).toBe(5);
    expect(playStart(null, 21, -1)).toBe(20);
    expect(playStart(0, 21, -1)).toBe(20);
    expect(playStart(7, 21, -1)).toBe(7);
  });
});

describe("velocidade do fluxo", () => {
  const H = 3600;
  const mk = (sym, pts) => ({ sym, label: sym, tail: pts });
  it("intraday: pontos de força por hora, com sinal e intensidade", () => {
    const tail = [
      { x: 100, y: 100, t: 0 },
      { x: 100.5, y: 100.2, t: H / 2 },
      { x: 101, y: 100.4, t: H },
    ];
    const s = headSpeed(tail);
    expect(s.vx).toBeCloseTo(1); // +1 ponto de força por hora
    expect(s.vy).toBeCloseTo(0.4);
    expect(s.v).toBeCloseTo(Math.hypot(1, 0.4));
    expect(headSpeed([{ x: 100, y: 100, t: 0 }])).toBeNull();
  });
  it("diário: por pregão (step pregões entre os pontos)", () => {
    const tail = [
      { x: 100, y: 100 },
      { x: 99, y: 100 },
      { x: 98, y: 100 },
    ];
    expect(headSpeed(tail, { step: 5 }).vx).toBeCloseTo(-0.2); // −2 pontos em 10 pregões
  });
  it("ignora a cabeça deslizante do play (partial)", () => {
    const tail = [
      { x: 100, y: 100, t: 0 },
      { x: 101, y: 100, t: H },
      { x: 150, y: 100, t: H + 10, partial: true },
    ];
    expect(headSpeed(tail).vx).toBeCloseTo(1);
  });
  it("quadro: rel = múltiplo do ritmo típico do grupo; ordenado do mais rápido", () => {
    const slow = mk("A", [{ x: 100, y: 100, t: 0 }, { x: 100.1, y: 100, t: H }, { x: 100.2, y: 100, t: 2 * H }]); // prettier-ignore
    const mid = mk("B", [{ x: 100, y: 100, t: 0 }, { x: 100.1, y: 100, t: H }, { x: 100.2, y: 100, t: 2 * H }]); // prettier-ignore
    const fast = mk("C", [{ x: 100, y: 100, t: 0 }, { x: 100.4, y: 100, t: H }, { x: 100.8, y: 100, t: 2 * H }]); // prettier-ignore
    const b = speedBoard([slow, mid, fast]);
    expect(b[0].sym).toBe("C");
    expect(b[0].rel).toBeCloseTo(4);
    expect(b[0].level.id).toBe("vfast");
    expect(b.at(-1).level.id).toBe("normal");
    expect(speedLevel(0.2).id).toBe("slow");
    expect(speedLevel(2).id).toBe("fast");
  });
});
