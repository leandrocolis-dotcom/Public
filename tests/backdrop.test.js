import { describe, expect, it } from "vitest";
import { backdrop, backdropLine } from "../assets/backdrop.js";

const line = (n, f) => Array.from({ length: n }, (_, i) => f(i));

describe("backdrop", () => {
  it("null sem 200 pregões de SPY", () => {
    expect(backdrop({ SPY: line(150, () => 100) })).toBeNull();
    expect(backdrop(null)).toBeNull();
  });

  it("SPY acima da MM200 e crédito estreitando = favorável", () => {
    const b = backdrop({
      SPY: line(260, (i) => 100 + i * 0.2),
      HYG: line(260, (i) => 80 + i * 0.05),
      IEF: line(260, () => 95),
    });
    expect(b.above).toBe(true);
    expect(b.trend).toBeGreaterThan(0);
    expect(b.credit).toBeGreaterThan(0);
    expect(b.state).toBe("favorável");
    expect(b.tone).toBe("up");
  });

  it("abaixo da MM200 com crédito alargando = defesa", () => {
    const b = backdrop({
      SPY: line(260, (i) => 200 - i * 0.3),
      HYG: line(260, (i) => 80 - i * 0.05),
      IEF: line(260, () => 95),
    });
    expect(b.above).toBe(false);
    expect(b.state).toBe("defesa");
    expect(backdropLine(b)).toMatch(/abaixo da MM200.*alargando/);
  });

  it("só um lado contra = atenção; sem crédito conta só a tendência", () => {
    const spy = line(260, (i) => 200 - i * 0.3);
    expect(backdrop({ SPY: spy, HYG: line(260, (i) => 80 + i * 0.05), IEF: line(260, () => 95) }).state).toBe("atenção"); // prettier-ignore
    const b = backdrop({ SPY: spy });
    expect(b.credit).toBeNull();
    expect(b.state).toBe("atenção");
    expect(backdropLine(b)).toMatch(/crédito sem dados/);
  });

  it("histerese: um pregão do outro lado não troca o estado", () => {
    const spy = line(260, (i) => 100 + i * 0.2);
    const hyg = line(260, (i) => 80 + i * 0.05);
    const ief = line(260, () => 95);
    spy[259] = 100; // um fechamento só abaixo da MM200
    const b = backdrop({ SPY: spy, HYG: hyg, IEF: ief });
    expect(b.raw).toBe("atenção");
    expect(b.state).toBe("favorável");
    expect(b.days).toBe(1);
    spy[258] = 100; // dois seguidos: troca
    expect(backdrop({ SPY: spy, HYG: hyg, IEF: ief }).state).toBe("atenção");
  });
});
