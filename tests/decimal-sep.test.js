import { afterEach, describe, expect, it } from "vitest";
import { intTxt, num, pct, setDecimalSep, signed } from "../assets/format.js";
import { parseNum } from "../assets/motion.js";
import { px } from "../assets/dash.js";

describe("separador decimal", () => {
  afterEach(() => setDecimalSep(","));
  it("ponto: 1,234.56", () => {
    setDecimalSep(".");
    expect(num(1234.5, 2)).toBe("1,234.50");
    expect(pct(0.0123, 1)).toBe("+1.2%");
    expect(signed(-3.25, 1)).toBe("-3.3");
    expect(intTxt(1234567)).toBe("1,234,567");
    expect(px(1234.5)).toBe("1,235");
    expect(parseNum("+1,234.56%")).toMatchObject({ value: 1234.56, decimals: 2, suffix: "%" });
  });
  it("vírgula: 1.234,56", () => {
    setDecimalSep(",");
    expect(num(1234.5, 2)).toBe("1.234,50");
    expect(intTxt(1234567)).toBe("1.234.567");
    expect(parseNum("−2,1σ")).toMatchObject({ value: -2.1, decimals: 1 });
  });
});
