import { describe, expect, it } from "vitest";
import { liveChanged, mergeLive } from "../assets/live-feed.js";

const prev = { fetched_at: "2026-11-20T15:00:00Z", count: 2, quotes: { SPY: { p: 600, pc: 598, t: 100 }, QQQ: { p: 500, pc: 499, t: 100 } } }; // prettier-ignore

describe("liveChanged", () => {
  it("pacote com hora nova e mesmos preços não conta mudança", () => {
    const msg = {
      fetched_at: "2026-11-20T15:00:15Z",
      count: 1,
      quotes: { SPY: { p: 600, t: 100 } },
    };
    expect(liveChanged(prev, mergeLive(prev, msg), msg)).toBe(0);
  });
  it("preço, hora da cotação ou pré/pós diferente conta", () => {
    const msg = { fetched_at: "2026-11-20T15:00:15Z", count: 2, quotes: { SPY: { p: 601, t: 115 }, QQQ: { xp: 501, xt: 120 } } }; // prettier-ignore
    expect(liveChanged(prev, mergeLive(prev, msg), msg)).toBe(2);
  });
  it("ativo novo conta", () => {
    const msg = {
      fetched_at: "2026-11-20T15:00:15Z",
      count: 1,
      quotes: { IWM: { p: 220, t: 115 } },
    };
    expect(liveChanged(prev, mergeLive(prev, msg), msg)).toBe(1);
  });
  it("sem cotações anteriores tudo é novo", () => {
    const msg = {
      fetched_at: "2026-11-20T15:00:15Z",
      count: 1,
      quotes: { SPY: { p: 600, t: 100 } },
    };
    expect(liveChanged(null, mergeLive(null, msg), msg)).toBe(1);
  });
});
