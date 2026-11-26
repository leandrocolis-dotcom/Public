import { describe, expect, it } from "vitest";
import { SECTOR_BLOCKS, SECTOR_BY_ID, SECTORS, sectorKind } from "../assets/sectors.js";

const RE = /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/; // mesmo filtro de parseList

describe("taxonomia de setores", () => {
  it("todo rótulo tem bloco conhecido, tickers válidos e cabe numa lista (até 45)", () => {
    const blocks = new Set(SECTOR_BLOCKS.map(([b]) => b));
    for (const s of SECTORS) {
      expect(blocks.has(s.block), s.id).toBe(true);
      expect(s.syms.length, s.id).toBeGreaterThan(0);
      expect(s.syms.length, s.id).toBeLessThanOrEqual(45);
      s.syms.forEach((x) => expect(x, s.id).toMatch(RE));
    }
  });
  it("rótulos são únicos", () => {
    expect(Object.keys(SECTOR_BY_ID).length).toBe(SECTORS.length);
  });
  it("classifica o tipo do ticker no rótulo", () => {
    expect(sectorKind("AI.SEMI.COMPUTE", "NVDA")).toBe("SINGLE");
    expect(sectorKind("AI.SEMI.COMPUTE", "SMH")).toBe("ETF");
    expect(sectorKind("AI.SEMI.COMPUTE", "SOXL")).toBe("LEV");
    expect(sectorKind("AI.SEMI.COMPUTE", "SOXS")).toBe("INV");
    expect(sectorKind("NADA", "SPY")).toBe(null);
  });
});
