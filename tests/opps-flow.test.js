import { describe, it, expect } from "vitest";
import { cacheFor } from "../api/analyze.js";

describe("api/analyze: cache da borda", () => {
  it("bloco completo fica 1 h", () => {
    expect(cacheFor({ items: { A: { fund: {} } }, missing: [] })).toMatch(/s-maxage=3600/);
  });
  it("bloco parcial fica só 2 min", () => {
    expect(cacheFor({ items: { A: { fund: {} } }, missing: ["B"] })).toMatch(/s-maxage=120/);
    expect(cacheFor({ items: { A: { fund: null, fundError: "x" } }, missing: [] })).toMatch(
      /s-maxage=120/,
    );
  });
  it("vazio não guarda", () => {
    expect(cacheFor({ items: {}, missing: ["A"] })).toBe("no-store");
  });
});
