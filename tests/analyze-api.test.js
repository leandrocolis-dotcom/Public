import { describe, it, expect } from "vitest";
import { parseDaily, parseSummary, parseSymbols } from "../api/analyze.js";

describe("api/analyze", () => {
  it("parseSymbols: valida, remove duplicados e limita a 15", () => {
    expect(parseSymbols("aapl, msft;AAPL petr4.sa bad$")).toEqual(["AAPL", "MSFT", "PETR4.SA"]);
    expect(parseSymbols(Array.from({ length: 20 }, (_, i) => `T${i}`).join(","))).toHaveLength(15);
  });
  it("parseDaily descarta barras sem preço", () => {
    const j = {
      chart: {
        result: [
          {
            meta: { exchangeTimezoneName: "America/New_York", currency: "USD" },
            timestamp: [1759500000, 1759586400],
            indicators: {
              quote: [
                { open: [1, null], high: [2, 2], low: [1, 1], close: [1.5, 1.6], volume: [10, 20] },
              ],
            },
          },
        ],
      },
    };
    const b = parseDaily(j);
    expect(b.c).toEqual([1.5]);
    expect(b.currency).toBe("USD");
  });
  it("parseSummary lê números crus e tolera módulos ausentes", () => {
    const j = {
      quoteSummary: {
        result: [
          {
            quoteType: { quoteType: "EQUITY" },
            price: { longName: "X", regularMarketPrice: { raw: 10 } },
            summaryDetail: { trailingPE: { raw: 20 } },
            financialData: { targetMeanPrice: { raw: 12 } },
          },
        ],
      },
    };
    const f = parseSummary(j);
    expect(f).toMatchObject({
      type: "EQUITY",
      name: "X",
      price: 10,
      pe: 20,
      target: 12,
      roe: null,
    });
    expect(parseSummary({})).toBeNull();
  });
});
