import { describe, it, expect } from "vitest";
import { cleanSym, compareLine, toggleCompare, MAX_COMPARE } from "../assets/chart-compare.js";

describe("comparação de ativos no gráfico", () => {
  it("normaliza o ticker digitado", () => {
    expect(cleanSym(" spy ")).toBe("SPY");
    expect(cleanSym("BRK-B Berkshire")).toBe("BRK-B");
    expect(cleanSym("^GSPC")).toBe("^GSPC");
    expect(cleanSym("")).toBeNull();
    expect(cleanSym("<x>")).toBeNull();
  });
  it("alinha o histórico às datas do gráfico principal", () => {
    const pts = compareLine(["2026-01-02", "2026-01-05", "2026-01-06"], {
      dates: ["2026-01-02", "2026-01-06", "2026-01-07"],
      close: [10, 11, 12],
    });
    expect(pts).toEqual([
      { time: "2026-01-02", value: 10 },
      { time: "2026-01-06", value: 11 },
    ]);
    expect(compareLine(["2026-01-02"], null)).toEqual([]);
  });
  it("adiciona, remove, ignora o próprio ativo e limita a quantidade", () => {
    expect(toggleCompare([], "SPY", "QQQ")).toEqual(["SPY"]);
    expect(toggleCompare(["SPY"], "SPY", "QQQ")).toEqual([]);
    expect(toggleCompare([], "QQQ", "QQQ")).toEqual([]);
    const full = ["A", "B", "C", "D", "E"].slice(0, MAX_COMPARE);
    expect(toggleCompare(full, "Z", "QQQ")).toEqual(full);
  });
});
