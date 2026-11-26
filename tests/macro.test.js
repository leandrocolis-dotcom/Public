import { describe, expect, it } from "vitest";
import { macroTilt } from "../assets/macro.js";
import { edgeOf } from "../assets/edge.js";

const d = {
  overall: -10,
  regime: { id: "desac", label: "Desaceleração" },
  tilts: [{ sym: "XLE", name: "Energia", score: 0.8 }, { sym: "TLT", name: "Treasuries longas", score: -0.9 }], // prettier-ignore
};

describe("contexto macro", () => {
  it("liga o ativo ao setor (inclusive por representante)", () => {
    expect(macroTilt("XLE", d).score).toBe(0.8);
    expect(macroTilt("XOP", d).sym).toBe("XLE");
    expect(macroTilt("ZZZ", d)).toBeNull();
  });
  it("entra na decisão só como aviso em modo sombra (não muda a nota)", () => {
    const stats = { n: 50, expectancy: 0.3 };
    const base = edgeOf({ dir: 1, stats });
    const withM = edgeOf({ dir: 1, stats, macro: macroTilt("TLT", d) });
    expect(withM.grade).toBe(base.grade);
    expect(withM.sizeMult).toBe(base.sizeMult);
    const f = withM.flags.find((x) => x.shadow);
    expect(f.text).toMatch(/pesa contra/);
  });
});
