import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { computeGolden } from "./golden-lib.js";

const golden = JSON.parse(readFileSync(new URL("./fixtures/golden.json", import.meta.url), "utf8"));
const now = computeGolden();

describe("gabarito numérico (dados reais congelados)", () => {
  it("o gabarito não está vazio", () => {
    expect(Object.keys(golden.snapshot.assets).length).toBeGreaterThan(30);
    expect(golden.snapshot.regime).toBeTruthy();
    expect(Object.keys(golden.ta).length).toBeGreaterThanOrEqual(8);
    expect(golden.flow["1d|0"].rows.length).toBeGreaterThan(100);
    expect(golden.portfolio.valued).toBeTruthy();
  });
  for (const key of Object.keys(golden)) {
    it(`${key} idêntico ao gabarito`, () => {
      expect(now[key]).toEqual(golden[key]);
    });
  }
});
