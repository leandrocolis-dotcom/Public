import { describe, it, expect } from "vitest";
import { histFile, mergeBars, parseCsv, toCsv, trimBars } from "../api/_hist.js";

const mk = (dates, c) => ({ dates, o: c, h: c, l: c, c, v: c.map(() => 100) });

describe("base histórica", () => {
  it("CSV ida e volta", () => {
    const b = mk(["2026-10-08", "2026-10-09"], [10.123456, 11]);
    const back = parseCsv(toCsv(b));
    expect(back.dates).toEqual(b.dates);
    expect(back.c).toEqual([10.1235, 11]);
  });
  it("anexa o dia novo e corrige o pregão em andamento", () => {
    const base = mk(["2026-10-07", "2026-10-08", "2026-10-09"], [10, 11, 12]);
    const fresh = mk(["2026-10-08", "2026-10-09", "2026-10-12"], [11, 12.5, 13]);
    const m = mergeBars(base, fresh);
    expect(m.dates).toEqual(["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"]);
    expect(m.c).toEqual([10, 11, 12.5, 13]);
  });
  it("desdobramento: dia fechado divergente devolve null (rebaixar tudo)", () => {
    const base = mk(["2026-10-07", "2026-10-08", "2026-10-09"], [100, 110, 120]);
    const fresh = mk(["2026-10-08", "2026-10-09"], [11, 12]);
    expect(mergeBars(base, fresh)).toBeNull();
  });
  it("corta para ~2 anos", () => {
    const b = mk(["2023-01-02", "2025-06-02", "2026-10-09"], [1, 2, 3]);
    expect(trimBars(b).dates).toEqual(["2025-06-02", "2026-10-09"]);
  });
  it("nome de arquivo seguro", () => {
    expect(histFile("^gspc")).toBe("_GSPC.csv");
  });
});
