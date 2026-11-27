import { describe, expect, it } from "vitest";
import { leverFilter, protectRows, reboundRows, scoreOf } from "../assets/triggers.js";

const ramp = (n, f) => Array.from({ length: n }, (_, i) => f(i));

describe("gatilhos › agora", () => {
  it("filtro de alavancagem: alta calma = 2x, alta nervosa = 1x, abaixo da MM200 = caixa", () => {
    expect(leverFilter(ramp(250, (i) => 100 + i * 0.1)).level).toBe(2);
    expect(leverFilter(ramp(250, (i) => 100 + i * 0.3 + (i % 2 ? 4 : -4))).level).toBe(1);
    expect(leverFilter(ramp(250, (i) => 200 - i * 0.2)).level).toBe(0);
    expect(leverFilter([1, 2, 3])).toBeNull();
  });
  it("proteção: só quem tem alerta, posição primeiro", () => {
    const rows = protectRows([
      { sym: "AAA", held: false, lev: false, dec: "reduce", codes: [] },
      { sym: "BBB", held: true, lev: true, dec: "wait", codes: ["lost200"] },
      { sym: "CCC", held: true, lev: false, dec: "buy", codes: ["dip"] },
    ]);
    expect(rows.map((r) => r.sym)).toEqual(["BBB", "AAA"]);
    expect(rows[0].hits).toEqual(["lost200"]);
  });
  it("placar lê o modelo certo", () => {
    const model = {
      logics: { a: { status: "eval", rx: { n: 5, mean: 0.1, lower: -0.1, upper: 0.3 } } },
    };
    const speed = { logics: { b: { status: "eval", x: { n: 0 } } } };
    expect(scoreOf("model", "a", { model })).toMatchObject({ n: 5, mean: 0.1 });
    expect(scoreOf("speed", "b", { speed })).toMatchObject({ n: 0, mean: null });
    expect(scoreOf("model", null, { model })).toBeNull();
  });
  it("repique: variação desde o gatilho", () => {
    const r = reboundRows([{ s: "X", d: "2026-11-20", p: 10, g: 0, rel: 4 }], () => 11);
    expect(r[0]).toMatchObject({ sym: "X", bull: false });
    expect(r[0].move).toBeCloseTo(0.1);
  });
});
