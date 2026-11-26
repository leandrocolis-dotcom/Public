import { describe, expect, it, vi } from "vitest";
import { memo, memoClear } from "../api/_http.js";
import { stableLots } from "../assets/net.js";
import { parseExtra } from "../api/quotes.js";

describe("memo (instância quente da função)", () => {
  it("junta chamadas simultâneas e reaproveita dentro do prazo", async () => {
    memoClear();
    const fn = vi.fn(async () => 42);
    const [a, b] = await Promise.all([memo("k", 1000, fn), memo("k", 1000, fn)]);
    expect([a, b]).toEqual([42, 42]);
    await memo("k", 1000, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("não guarda falhas", async () => {
    memoClear();
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(1);
    await expect(memo("e", 1000, fn)).rejects.toThrow("x");
    expect(await memo("e", 1000, fn)).toBe(1);
  });
});

describe("stableLots (cache da borda)", () => {
  it("corta sempre do mesmo jeito, qualquer que seja a ordem, e só pede blocos com faltantes", () => {
    const all = ["D", "A", "C", "B", "E"];
    expect(stableLots(all, ["E"], 2)).toEqual([["E"]]);
    expect(stableLots([...all].reverse(), ["A", "D"], 2)).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });
});

describe("api/quotes ?only=1", () => {
  it("aceita até 180 extras e não descarta os do universo", () => {
    const many = Array.from({ length: 200 }, (_, i) => `T${i}`).join(",");
    expect(parseExtra(many, { only: true })).toHaveLength(180);
    expect(parseExtra(many)).toHaveLength(60);
    expect(parseExtra("SPY", { only: true })).toEqual(["SPY"]);
  });
});
