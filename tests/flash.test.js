import { describe, expect, it } from "vitest";
import { flashTicks, tickAttr } from "../assets/flash.js";

const el = (k, v) => ({ dataset: { tick: k, tv: String(v) }, cls: [], classList: { add(c) { this.o.cls.push(c); } } }); // prettier-ignore
const root = (els) => {
  els.forEach((e) => (e.classList.o = e));
  return { querySelectorAll: () => els };
};

describe("piscar de preço", () => {
  it("marca só valores finitos", () => {
    expect(tickAttr("SPY", 500.5)).toBe(' data-tick="SPY" data-tv="500.5"');
    expect(tickAttr("SPY", NaN)).toBe("");
  });
  it("verde ao subir, vermelho ao cair, nada na primeira vez ou sem mudança", () => {
    const seen = new Map();
    const a = [el("SPY", 500), el("QQQ", 400)];
    expect(flashTicks(root(a), seen)).toEqual({ up: 0, dn: 0 });
    const b = [el("SPY", 501), el("QQQ", 399), el("IWM", 200)];
    expect(flashTicks(root(b), seen)).toEqual({ up: 1, dn: 1 });
    expect(b.map((x) => x.cls[0])).toEqual(["tick-up", "tick-dn", undefined]);
    const c = [el("SPY", 501)];
    expect(flashTicks(root(c), seen)).toEqual({ up: 0, dn: 0 });
  });
});
