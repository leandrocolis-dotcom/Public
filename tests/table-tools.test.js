import { describe, it, expect } from "vitest";
import { cellNumber, compareCells, rowMatches } from "../assets/table-tools.js";

describe("tabelas: ordenação e filtro", () => {
  it("lê números em pt-BR", () => {
    expect(cellNumber("1.234,5%")).toBe(1234.5);
    expect(cellNumber("+3,2 p.p.")).toBe(3.2);
    expect(cellNumber("−5,0%")).toBe(-5);
    expect(cellNumber("US$ 1,2 bi")).toBe(1.2e9);
    expect(cellNumber("–")).toBeNull();
    expect(cellNumber("AAPL Apple")).toBeNull();
  });
  it("compara números, texto e deixa vazio no fim", () => {
    expect(compareCells("10", "2", 1)).toBeLessThan(0); // maior primeiro
    expect(compareCells("10", "2", -1)).toBeGreaterThan(0);
    expect(compareCells("–", "5", 1)).toBeGreaterThan(0);
    expect(compareCells("5", "–", -1)).toBeLessThan(0);
    expect(compareCells("Ação", "Banco", 1)).toBeLessThan(0); // texto: primeiro clique = A→Z
  });
  it("filtro ignora acento e caixa e exige todas as palavras", () => {
    expect(rowMatches("PETR4.SA Petróleo Brasileiro Compra", "petroleo compra")).toBe(true);
    expect(rowMatches("AAPL Apple Venda", "apple compra")).toBe(false);
    expect(rowMatches("qualquer", "")).toBe(true);
  });
});

describe("cellNumber: sinal antes da moeda", () => {
  it("lê -US$ e −R$ como negativos e ordena pelo valor com sinal", () => {
    expect(cellNumber("▾-US$ 96,42")).toBe(-96.42);
    expect(cellNumber("▴+US$ 125,50")).toBe(125.5);
    expect(cellNumber("−R$ 5")).toBe(-5);
    expect(cellNumber("US$ 721,22")).toBe(721.22);
    expect(cellNumber("▾-11,79%")).toBe(-11.79);
  });
});
