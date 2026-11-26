import { describe, expect, it } from "vitest";
import { currentWeights, fromPasted, money, rebalance } from "../assets/rebalance.js";

describe("rebalanceamento", () => {
  it("do zero: valor total × peso, cotas pelo preço", () => {
    const r = rebalance({ total: 10000, targets: [{ sym: "VOO", w: 60 }, { sym: "GLD", w: 40 }], prices: { VOO: 500, GLD: 200 } }); // prettier-ignore
    const voo = r.rows.find((x) => x.sym === "VOO");
    expect(voo.action).toBe("buy");
    expect(voo.diff).toBeCloseTo(6000);
    expect(voo.tradeQty).toBeCloseTo(12);
    expect(r.rows.find((x) => x.sym === "GLD").tradeQty).toBeCloseTo(20);
    expect(r.buy).toBeCloseTo(10000);
    expect(r.sumW).toBeCloseTo(1);
  });
  it("com carteira atual: vende o que passou do alvo, compra o que falta, zera o que saiu", () => {
    const current = { VOO: { qty: 20, price: 500 }, GLD: { qty: 10, price: 200 }, TQQQ: { qty: 10, price: 100 } }; // prettier-ignore
    // atual: VOO 10.000, GLD 2.000, TQQQ 1.000 = 13.000
    const r = rebalance({ targets: [{ sym: "VOO", w: 50 }, { sym: "GLD", w: 50 }], current, prices: { VOO: 500, GLD: 200, TQQQ: 100 } }); // prettier-ignore
    expect(r.total).toBeCloseTo(13000);
    const by = Object.fromEntries(r.rows.map((x) => [x.sym, x]));
    expect(by.VOO.action).toBe("sell");
    expect(by.VOO.diff).toBeCloseTo(-3500);
    expect(by.GLD.action).toBe("buy");
    expect(by.GLD.diff).toBeCloseTo(4500);
    expect(by.TQQQ.action).toBe("sell");
    expect(by.TQQQ.tradeQty).toBeCloseTo(-10);
    expect(r.buy - r.sell).toBeCloseTo(0);
  });
  it("aporte: total maior que o atual", () => {
    const r = rebalance({ total: 2000, targets: [{ sym: "VOO", w: 100 }], current: { VOO: { qty: 2, price: 500 } }, prices: {} }); // prettier-ignore
    expect(r.rows[0].diff).toBeCloseTo(1000);
    expect(r.rows[0].newQty).toBeCloseTo(4);
  });
  it("sem preço não inventa a compra", () => {
    const r = rebalance({ total: 1000, targets: [{ sym: "XYZ", w: 100 }] });
    expect(r.rows[0].action).toBe("noprice");
  });
  it("lê a carteira colada do Investing e parte dos pesos atuais", () => {
    const text = "Symbol\tAmount\tAvg Price\tCurrent Price\nVOO\t10\t400\t500\nGLD\t25\t180\t200";
    const r = fromPasted(text);
    expect(r.current.VOO).toEqual({ qty: 10, price: 500 });
    expect(r.targets).toEqual([
      { sym: "VOO", w: 50 },
      { sym: "GLD", w: 50 },
    ]);
    expect(currentWeights(r.current, { VOO: 1000 })[0].w).toBeCloseTo(66.7);
  });
  it("valor digitado em formato brasileiro ou americano", () => {
    expect(money("50.000")).toBe(50000);
    expect(money("50.000,50")).toBe(50000.5);
    expect(money("50,000.50")).toBe(50000.5);
    expect(money("12500")).toBe(12500);
  });
});
