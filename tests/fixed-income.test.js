import { describe, expect, it } from "vitest";
import {
  cdbEquivalent,
  compare,
  grossUp,
  iofRate,
  irRate,
  simulate,
} from "../assets/fixed-income.js";

const m = { cdi: 15, selic: 15, ipca: 4, tr: 0 };

describe("renda fixa BR", () => {
  it("tabela regressiva do IR e IOF", () => {
    expect([irRate(180), irRate(181), irRate(360), irRate(720), irRate(721)]).toEqual([0.225, 0.2, 0.2, 0.175, 0.15]); // prettier-ignore
    expect(iofRate(1)).toBe(0.96);
    expect(iofRate(29)).toBe(0.03);
    expect(iofRate(30)).toBe(0);
  });
  it("CDB 100% do CDI em 1 ano (365 d) ≈ CDI bruto e 17,5% de IR", () => {
    const r = simulate({ kind: "cdb", idx: "cdi", rate: 100 }, 100000, 365, m);
    expect(r.grossPct).toBeCloseTo(0.15, 3);
    expect(r.ir).toBeCloseTo(r.grossGain * 0.175, 6);
    expect(r.netPct).toBeCloseTo(0.12375, 3);
  });
  it("LCI é isenta e o CDB equivalente bate com o gross-up", () => {
    const r = simulate({ kind: "lci", idx: "cdi", rate: 90 }, 100000, 400, m);
    expect(r.ir).toBe(0);
    expect(r.net).toBeCloseTo(r.gross, 6);
    const eq = cdbEquivalent(r.net, 100000, 400, m);
    expect(eq).toBeGreaterThan(105);
    expect(eq).toBeLessThan(112);
    expect(grossUp(90, 400)).toBeCloseTo(90 / 0.825, 6);
  });
  it("IOF corta o rendimento antes de 30 dias", () => {
    const r = simulate({ kind: "cdb", idx: "cdi", rate: 100 }, 10000, 10, m);
    expect(r.iof).toBeCloseTo(r.grossGain * 0.66, 6);
  });
  it("fundo DI paga come-cotas e rende menos que o CDB à mesma taxa", () => {
    const f = simulate({ kind: "fundo", idx: "cdi", rate: 100 }, 100000, 730, m);
    const c = simulate({ kind: "cdb", idx: "cdi", rate: 100 }, 100000, 730, m);
    expect(f.other).toBeGreaterThan(0);
    expect(f.net).toBeLessThan(c.net);
    expect(f.net).toBeGreaterThan(c.net * 0.99);
  });
  it("Tesouro cobra custódia; Tesouro Selic até R$ 10 mil não", () => {
    expect(simulate({ kind: "tpre", idx: "pre", rate: 13 }, 50000, 365, m).other).toBeGreaterThan(
      0,
    );
    expect(simulate({ kind: "tselic", idx: "selic", rate: 0 }, 10000, 365, m).other).toBe(0);
  });
  it("compare ordena pelo líquido", () => {
    const rows = compare([{ kind: "cdb", idx: "cdi", rate: 100 }, { kind: "lca", idx: "cdi", rate: 95 }, { kind: "poup", idx: "poup" }], 1000, 365, m); // prettier-ignore
    expect(rows.map((r) => r.kind)).toEqual(["lca", "cdb", "poup"]);
    expect(rows[0].cdbEq).toBeGreaterThan(110);
  });
});
