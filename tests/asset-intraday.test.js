import { describe, it, expect } from "vitest";
import { intradaySeries } from "../assets/asset-pop.js";

// dois pregões (NY, gmtoffset -4h): 3 barras ontem, 2 hoje
const D1 = Date.parse("2026-10-08T13:30:00Z") / 1000;
const D2 = Date.parse("2026-10-09T13:30:00Z") / 1000;
const J = {
  gmtoffset: -14400,
  prev_close: 99,
  bars: { t: [D1, D1 + 300, D1 + 600, D2, D2 + 300], c: [100, 101, 102, 103, 104] },
};

describe("janelas 1D/5D do gráfico", () => {
  it("1D: só o pregão de hoje, referência = fechamento de ontem, rótulo em hora", () => {
    const s = intradaySeries(J, 1, null, D2 + 300);
    expect(s.close).toEqual([103, 104]);
    expect(s.ref).toBe(102);
    expect(s.labels[0]).toBe("09:30");
  });
  it("5D: todos os pregões disponíveis", () => {
    const s = intradaySeries(J, 5, null, D2 + 300);
    expect(s.close).toHaveLength(5);
    expect(s.days).toBe(2);
    expect(s.labels[0]).toBe("08/10 09:30");
  });
  it("dia ao vivo: acrescenta o preço atual se mais novo que a última barra", () => {
    const s = intradaySeries(J, 1, { p: 105 }, D2 + 900);
    expect(s.close).toEqual([103, 104, 105]);
    expect(s.live).toBe(true);
    expect(intradaySeries(J, 1, { p: 105 }, D2 + 330).live).toBe(false);
  });
  it("sem barras -> null", () => {
    expect(intradaySeries({ bars: { t: [], c: [] } }, 1)).toBe(null);
  });
});

describe("pré e pós-mercado no gráfico 1D/5D", () => {
  const P = Date.parse("2026-10-09T12:00:00Z") / 1000; // 8:00 NY (pré)
  const Q = Date.parse("2026-10-08T20:30:00Z") / 1000; // 16:30 NY de ontem (pós)
  const JX = {
    gmtoffset: -14400,
    bars: {
      t: [D1, Q, P, D2],
      c: [100, 101, 102, 103],
      s: ["reg", "post", "pre", "reg"],
    },
  };
  it("mantém a sessão de cada ponto e usa o último fechamento regular como referência", () => {
    const s = intradaySeries(JX, 1, null, D2 + 60);
    // 1D: pós de ontem + pré + pregão de hoje (como no Investing); referência = fechamento regular de ontem
    expect(s.close).toEqual([101, 102, 103]);
    expect(s.sess).toEqual(["post", "pre", "reg"]);
    expect(s.ref).toBe(100);
    expect(intradaySeries(JX, 5, null, D2 + 60).close).toEqual([100, 101, 102, 103]);
  });
  it("sessionOf classifica pelo horário da bolsa", async () => {
    const { sessionOf } = await import("../api/intraday.js");
    expect(sessionOf(P, -14400)).toBe("pre");
    expect(sessionOf(Q, -14400)).toBe("post");
    expect(sessionOf(D2, -14400)).toBe("reg");
  });
});
