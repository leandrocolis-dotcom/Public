import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PORT_GROUP, withPortfolio } from "../assets/flow-portfolio.js";
import { flowSnapshot, rotation, OFF_UNI } from "../assets/flow-engine.js";

const flow = JSON.parse(readFileSync(new URL("../data/flow.json", import.meta.url)));

describe("carteira atual no fluxo", () => {
  it("sem carteira, nada muda", () => {
    const r = withPortfolio(flow, [], {});
    expect(r.flow).toBe(flow);
    expect(r.uni).toBe(OFF_UNI);
  });

  it("posição do universo reaproveita a série; posição de fora vem do histórico com p ÷ pc no fim", () => {
    const dates = flow.dates.slice(-120);
    const fake = { dates, close: dates.map((_, i) => 100 + i), vol: dates.map(() => 1000) };
    const t = Date.parse(`${dates.at(-1)}T18:00:00Z`) / 1000;
    const { flow: f, uni } = withPortfolio(
      flow,
      [
        { sym: "NVDA", qty: 3 },
        { sym: "ZZZT", qty: 1 },
        { sym: "OLD", qty: 0 },
      ],
      { ZZZT: fake },
      { ZZZT: { p: 250, pc: 219, t, v: 500 } },
    );
    expect(uni.groups[0]).toEqual(PORT_GROUP);
    expect(uni.assets.filter((a) => a.group === "port").map((a) => a.sym)).toEqual([
      "NVDA",
      "ZZZT",
    ]);
    expect(f.close.NVDA).toBe(flow.close.NVDA);
    expect(f.close.ZZZT.length).toBe(flow.dates.length);
    expect(f.close.ZZZT.at(-1)).toBe(250);
    expect(f.close.ZZZT.at(-2)).toBe(219);
    expect(f.vol.ZZZT.at(-1)).toBe(500);
    expect(flow.close.ZZZT).toBeUndefined(); // não altera a tabela original
  });

  it("aparece no mapa (grupo escolhido) e na rotação contra o S&P 500", () => {
    const { flow: f, uni } = withPortfolio(flow, [
      { sym: "NVDA", qty: 1 },
      { sym: "XLE", qty: 1 },
      { sym: "GLD", qty: 1 },
    ]);
    const snap = flowSnapshot(f, { horizon: "5d", groups: ["port"], uni });
    expect(snap.rows.map((r) => r.sym).sort()).toEqual(["GLD", "NVDA", "XLE"]);
    const rot = rotation(f, "port", { uni });
    expect(rot.map((r) => r.sym).sort()).toEqual(["GLD", "NVDA", "XLE"]);
    for (const r of rot)
      expect(r.tail.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
