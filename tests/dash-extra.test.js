import { describe, expect, it } from "vitest";
import { alignSeries, normalizeExtra, topHeadlines } from "../assets/dash-extra.js";

describe("normalizeExtra", () => {
  it("pares de moeda viram símbolo do Yahoo", () => {
    expect(normalizeExtra("fx", "usd/cny")).toEqual({ sym: "CNY=X", label: "USD/CNY" });
    expect(normalizeExtra("fx", "EUR/JPY")).toEqual({ sym: "EURJPY=X", label: "EUR/JPY" });
    expect(normalizeExtra("fx", "gbpusd")).toEqual({ sym: "GBPUSD=X", label: "GBP/USD" });
    expect(normalizeExtra("fx", "USD/USD")).toBeNull();
    expect(normalizeExtra("fx", "bitcoin")).toBeNull();
  });
  it("cripto ganha -USD; demais quadros aceitam símbolo do Yahoo", () => {
    expect(normalizeExtra("crypto", "ada")).toEqual({ sym: "ADA-USD", label: "ADA" });
    expect(normalizeExtra("eq", "^n225")).toEqual({ sym: "^N225", label: "^N225" });
    expect(normalizeExtra("eq", "cl=f")).toEqual({ sym: "CL=F", label: "CL=F" });
    expect(normalizeExtra("eq", "a b<c")).toBeNull();
  });
});

describe("alignSeries", () => {
  it("repete o último fechamento nas datas sem pregão", () => {
    const out = alignSeries(["2026-01-02", "2026-01-05", "2026-01-06"], {
      dates: ["2026-01-02", "2026-01-06"],
      close: [10, 12],
    });
    expect(out).toEqual([10, 10, 12]);
  });
});

describe("topHeadlines", () => {
  it("as 10 mais relevantes das últimas 24 h, sem opinião, da mais nova à mais antiga", () => {
    const now = 1_000_000;
    const items = Array.from({ length: 15 }, (_, i) => ({
      id: `n${i}`,
      title: i % 2 ? "Fed signals rate cut as inflation cools" : "Stocks rally on earnings",
      t: now - i * 600,
      tags: ["macro"],
      impact: true,
    }));
    items.push({ id: "old", title: "Fed hikes rates", t: now - 30 * 3600, tags: ["macro"] });
    items.push({ id: "op", title: "Why the Fed is wrong", t: now, tags: ["opinion"] });
    const top = topHeadlines(items, now);
    expect(top).toHaveLength(10);
    expect(top.some((x) => x.id === "old" || x.id === "op")).toBe(false);
    expect(top.map((x) => x.t)).toEqual([...top.map((x) => x.t)].sort((a, b) => b - a));
  });
});
