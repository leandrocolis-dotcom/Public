import { describe, expect, it } from "vitest";
import { appPoints, btgPoints, buildSeries, livePoint, monthGrid, snapsFrom, windowStats } from "../assets/perf.js"; // prettier-ignore

describe("fontes da performance", () => {
  it("BTG: diário em fração e mensal pelo acumulado", () => {
    const b = btgPoints([
      { kind: "m", day: "2026-09-30", acc: 10, bench: { Nasdaq: { acc: 5 } } },
      { kind: "m", day: "2026-10-31", acc: 21, bench: { Nasdaq: { acc: 15.5 } } },
      { kind: "d", day: "2026-11-03", r: 1, bal: 100, bench: { Nasdaq: { r: 0.5 } } },
      { kind: "d", day: "2026-11-01", r: 0, bal: 0 },
    ]);
    expect(b.daily).toEqual([
      expect.objectContaining({ day: "2026-11-03", r: 0.01, bench: 0.005 }),
    ]);
    expect(b.monthly[1].r).toBeCloseTo(1.21 / 1.1 - 1);
    expect(b.monthly[1].bench).toBeCloseTo(1.155 / 1.05 - 1);
  });
  it("app: carteira do dia × fechamentos, caixa no denominador, vale até a próxima foto", () => {
    const closes = {
      QQQ: { dates: ["2026-11-24", "2026-11-25", "2026-11-26"], close: [100, 101, 102] },
      A: { dates: ["2026-11-24", "2026-11-25", "2026-11-26"], close: [10, 11, 11] },
    };
    const pts = appPoints(
      [{ day: "2026-11-24", positions: [{ sym: "A", qty: 10 }], cash: 100 }],
      closes,
    );
    expect(pts.map((p) => p.day)).toEqual(["2026-11-25", "2026-11-26"]);
    expect(pts[0].r).toBeCloseTo(10 / 200);
    expect(pts[1].r).toBe(0);
    expect(pts[0].bench).toBeCloseTo(0.01);
  });
  it("ao vivo: contra o fechamento anterior", () => {
    const p = livePoint("2026-11-27", [{ qty: 10, price: 12, pc: 10 }], 100, { p: 99, pc: 100 });
    expect(p.r).toBeCloseTo(20 / 200);
    expect(p.bench).toBeCloseTo(-0.01);
    expect(livePoint("x", [{ qty: 1, price: 1, pc: null }])).toBeNull();
  });
  it("fotos diárias → carteiras do dia", () => {
    const s = snapsFrom([{ day: "2026-11-25", summary: { offshore: { positions: [{ sym: "A", qty: 2 }], cashUsd: 5 } } }]); // prettier-ignore
    expect(s).toEqual([{ day: "2026-11-25", positions: [{ sym: "A", qty: 2 }], cash: 5 }]);
  });
});

describe("série e janelas", () => {
  const btg = {
    monthly: [
      { day: "2026-09-30", r: 0.1, bench: 0.05, src: "btg", kind: "m" },
      { day: "2026-10-31", r: -0.05, bench: 0.02, src: "btg", kind: "m" },
    ],
    daily: [{ day: "2026-11-03", r: 0.02, bench: 0.01, src: "btg", kind: "d" }],
  };
  const app = [
    { day: "2026-11-03", r: 0.5, bench: 0, src: "app", kind: "d" },
    { day: "2026-11-25", r: -0.01, bench: 0, src: "app", kind: "d" },
  ];
  const { points, gaps } = buildSeries({ btg, app, live: { day: "2026-11-27", r: 0.03, bench: 0.01, src: "live", kind: "d" } }); // prettier-ignore
  it("BTG vence o app no mesmo dia; mensal só antes do 1º diário; lacunas marcadas", () => {
    expect(points.map((p) => `${p.day}:${p.src}`)).toEqual(["2026-09-30:btg", "2026-10-31:btg", "2026-11-03:btg", "2026-11-25:app", "2026-11-27:live"]); // prettier-ignore
    expect(gaps).toEqual([{ from: "2026-11-03", to: "2026-11-25" }]);
  });
  it("retorno encadeado, queda máxima e referência", () => {
    const all = windowStats(points, "ALL");
    expect(all.ret).toBeCloseTo(1.1 * 0.95 * 1.02 * 0.99 * 1.03 - 1);
    expect(all.mdd).toBeCloseTo(-0.05);
    expect(all.bench).toBeCloseTo(1.05 * 1.02 * 1.01 * 1 * 1.01 - 1);
    const mtd = windowStats(points, "MTD");
    expect(mtd.ret).toBeCloseTo(1.02 * 0.99 * 1.03 - 1);
    expect(windowStats(points, "1D").ret).toBeCloseTo(0.03);
  });
  it("mapa mês a mês", () => {
    const g = monthGrid(points);
    expect(g[0].year).toBe("2026");
    expect(g[0].months[8]).toBeCloseTo(0.1);
    expect(g[0].months[10]).toBeCloseTo(1.02 * 0.99 * 1.03 - 1);
  });
});

describe("BTG repetido", () => {
  it("dia sem pregão com o mesmo retorno e saldo do anterior conta uma vez", () => {
    const b = btgPoints([
      { kind: "d", day: "2026-11-05", r: -1.289, bal: 4679 },
      { kind: "d", day: "2026-11-06", r: -1.289, bal: 4679 },
      { kind: "d", day: "2026-11-08", r: 11.76, bal: 5229 },
    ]);
    expect(b.daily.map((p) => p.day)).toEqual(["2026-11-05", "2026-11-08"]);
  });
});
