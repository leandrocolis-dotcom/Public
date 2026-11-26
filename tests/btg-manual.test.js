import { describe, expect, it } from "vitest";
import { brokerView, manualActive, nextManual, withManual } from "../assets/btg.js";

const row = {
  asOf: "2026-11-20T21:00:00Z",
  summary: {
    asOf: "2026-11-20T21:00:00Z",
    fx: { ptax: 5 },
    onshore: { total: 300, items: [{ name: "CDB X", value: 200, cost: 150 }, { name: "Saldo", value: 100 }] },
    offshore: {
      totalUsd: 1100, totalBrl: 5500, cashUsd: 100, investedUsd: 1000,
      positions: [{ sym: "SPY", qty: 2, avg: 400, price: 500, value: 1000 }],
    },
  },
}; // prettier-ignore
const holdings = [{ sym: "SPY", qty: 2, avg: 400, invPrice: 500 }];

describe("ajuste manual da conta BTG", () => {
  it("sem ajuste devolve a foto", () => {
    expect(withManual(row, holdings, null)).toBe(row);
  });
  it("ativo até chegar foto mais nova", () => {
    const m = { baseAsOf: row.asOf };
    expect(manualActive(row, m)).toBe(true);
    expect(manualActive({ ...row, asOf: "2026-11-21T21:00:00Z" }, m)).toBe(false);
  });
  it("Brasil e caixa ajustados recalculam os totais", () => {
    const m = nextManual(row, null, {
      items: [{ name: "CDB X", value: 250, cost: 150 }],
      cashUsd: 50,
    });
    const h = [...holdings, { sym: "QQQ", qty: 1, avg: 300, manual: true }];
    const r = withManual(row, h, m);
    expect(r.summary.onshore.total).toBe(250);
    expect(r.summary.offshore.totalUsd).toBe(1000 + 300 + 50);
    expect(r.summary.offshore.totalBrl).toBe(1350 * 5);
    const v = brokerView(r, Date.parse(row.asOf));
    expect(v.manual.baseAsOf).toBe(row.asOf);
    expect(v.items).toHaveLength(1);
    expect(v.positions.map((p) => p.sym).sort()).toEqual(["QQQ", "SPY"]);
  });
  it("posição removida da carteira sai da conta; foto nova ignora o ajuste", () => {
    const m = nextManual(row, null, {});
    expect(withManual(row, [], m).summary.offshore.positions).toEqual([]);
    const newer = { ...row, asOf: "2026-11-22T21:00:00Z" };
    expect(withManual(newer, [], m)).toBe(newer);
  });
});
