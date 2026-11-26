import { describe, expect, it } from "vitest";
import { taxOf } from "../assets/taxonomy.js";
import { qv } from "../assets/quant-view.js";

describe("taxonomia de setor/tema", () => {
  it("treasuries e alavancados de juros são Juros", () => {
    expect(taxOf("TLT").theme).toBe("Juros");
    expect(taxOf("TMF")).toMatchObject({ theme: "Juros", kind: "Alavancado" });
    expect(taxOf("TMV")).toMatchObject({ theme: "Juros", kind: "Inverso" });
  });
  it("tecnologia tem subtemas e o rótulo específico vence o amplo", () => {
    expect(taxOf("NVDA")).toMatchObject({ theme: "Tecnologia", sub: "Semicondutores" });
    expect(taxOf("CRWD").sub).toBe("Cibersegurança");
    expect(taxOf("XLK").sub).toBe("Tecnologia (amplo)");
    expect(taxOf("CEG").theme).toBe("Energia");
  });
  it("ações do S&P 500 fora dos rótulos usam a GICS traduzida e alinhada", () => {
    qv.data = {
      rows: [{ sym: "ZZZ", sector: "Information Technology", sub: "Application Software" }],
    };
    expect(taxOf("ZZZ")).toEqual({ theme: "Tecnologia", sub: "Software", kind: "Ação" });
    qv.data = null;
  });
  it("fora de tudo cai em Outros", () => {
    expect(taxOf("QQQQQ").theme).toBe("Outros");
  });
});
