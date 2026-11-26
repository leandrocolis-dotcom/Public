import { describe, expect, it } from "vitest";
import { proSeries, setUserLevels, userLevels } from "../assets/pro-chart.js";

const daily = (n) => {
  const dates = Array.from({ length: n }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
  const c = dates.map((_, i) => 100 + i);
  return {
    bars: { dates, o: c.map((x) => x - 1), h: c.map((x) => x + 2), l: c.map((x) => x - 2), c, v: c.map(() => 1000) },
    P: { sma50: c.map(() => null), sma200: c.map(() => null), bb: { up: c.map((x) => x + 3), lo: c.map((x) => x - 3) } },
    a: { struct: { levels: { resistances: [{ price: 130 }], supports: [{ price: 101 }] } }, plan: { stop: 99, t1: 135, t2: 140 } },
  };
}; // prettier-ignore

describe("gráfico pro: adaptação dos dados", () => {
  it("diário: velas com data ISO, volume e níveis", () => {
    const d = daily(20);
    const s = proSeries(d, null, "swing", d.a);
    expect(s.intraday).toBe(false);
    expect(s.candles).toHaveLength(20);
    expect(s.candles[0]).toEqual({ time: "2026-01-01", open: 99, high: 102, low: 98, close: 100 });
    expect(s.volume[0]).toMatchObject({ value: 1000, up: true });
    expect(s.levels.map((l) => l.label)).toEqual(["Teto", "Piso", "Stop", "Meta 1", "Meta 2"]);
    expect(s.visible).toBe(20);
  });
  it("descarta pontos nulos das linhas", () => {
    const s = proSeries(daily(5), null, "swing", null);
    expect(s.lines.find((l) => l.name === "Média 50").data).toEqual([]);
    expect(s.lines.find((l) => l.name === "Banda sup.").data).toHaveLength(5);
  });
  it("intradiário: tempo em segundos e níveis do pregão", () => {
    const src = {
      t: [100, 400, 700],
      o: [1, 2, 3],
      h: [2, 3, 4],
      l: [0, 1, 2],
      c: [2, 1, 4],
      v: [5, 6, 7],
    };
    const ia = {
      src,
      series: {
        idx: [0, 1, 2],
        vwap: [1, 1.5, 2],
        vwapUp: [null, 2, 3],
        vwapLo: [null, 1, 1],
        ema21: [1, 1, 1],
      },
      levels: { orH: 4, orL: 0, prevH: null, prevL: 1 },
      plan: null,
    };
    const s = proSeries(null, ia, "today", ia);
    expect(s.intraday).toBe(true);
    expect(s.candles[1]).toEqual({ time: 400, open: 2, high: 3, low: 1, close: 1 });
    expect(s.volume[1].up).toBe(false);
    expect(s.lines[1].data).toHaveLength(2);
    expect(s.levels.map((l) => l.label)).toEqual(["Abertura máx", "Abertura mín", "Mín ontem"]);
  });
  it("linhas do usuário: grava, filtra inválidos e limita a 10", () => {
    const mem = {};
    globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = v) };
    setUserLevels("SPY", [1, NaN, ...Array.from({ length: 12 }, (_, i) => i + 2)]);
    expect(userLevels("SPY")).toHaveLength(10);
    expect(userLevels("QQQ")).toEqual([]);
  });
});

describe("pré e pós-mercado no gráfico Hoje", () => {
  const H = 3600;
  const open = Date.parse("2026-10-30T13:30:00Z") / 1000; // 9:30 NY
  const src = {
    t: [open, open + 300],
    o: [10, 11],
    h: [11, 12],
    l: [9, 10],
    c: [11, 12],
    v: [5, 6],
  };
  const ia = {
    src,
    series: {
      idx: [0, 1],
      vwap: [10, 11],
      vwapUp: [null, null],
      vwapLo: [null, null],
      ema21: [10, 10],
    },
    levels: {},
    plan: null,
  };
  const ext = {
    t: [open - 16 * H, open - 2 * H, open - 50 * H, open + 7 * H],
    o: [9, 9.5, 1, 12], h: [9, 9.6, 1, 12], l: [9, 9.4, 1, 12], c: [9.2, 9.5, 1, 12.1], v: [1, 2, 3, 4],
    s: ["post", "pre", "post", "post"],
  }; // prettier-ignore
  it("acrescenta o pós da véspera, o pré e o pós do dia, marcados e em ordem; descarta os antigos", () => {
    const s = proSeries(null, ia, "today", ia, ext);
    expect(s.ext).toBe(true);
    expect(s.candles.map((b) => b.ext ?? "reg")).toEqual(["post", "pre", "reg", "reg", "post"]);
    expect(s.volume.map((v) => v.ext ?? "reg")).toEqual(["post", "pre", "reg", "reg", "post"]);
    expect(s.lines[0].data).toHaveLength(2); // VWAP só no pregão regular
  });
  it("sem estendido, igual a antes", () => {
    const s = proSeries(null, ia, "today", ia);
    expect(s.ext).toBe(false);
    expect(s.candles).toHaveLength(2);
  });
  it("splitSessions separa o regular (análise) do estendido (gráfico)", async () => {
    const { splitSessions } = await import("../assets/ta-data.js");
    const j = { gmtoffset: -14400, bars: { t: [1, 2, 3], o: [1, 2, 3], h: [1, 2, 3], l: [1, 2, 3], c: [1, 2, 3], v: [1, 2, 3], s: ["pre", "reg", "post"] } }; // prettier-ignore
    const sp = splitSessions(j);
    expect(sp.reg.bars.t).toEqual([2]);
    expect(sp.reg.bars.s).toBeUndefined();
    expect(sp.reg.gmtoffset).toBe(-14400);
    expect(sp.ext.t).toEqual([1, 3]);
    expect(sp.ext.s).toEqual(["pre", "post"]);
    expect(
      splitSessions({ bars: { t: [5], o: [1], h: [1], l: [1], c: [1], v: [1] } }).reg.bars.t,
    ).toEqual([5]);
  });
});
