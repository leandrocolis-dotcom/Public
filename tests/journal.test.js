import { describe, expect, it } from "vitest";
import { closeAtr, closeEntry, evalEntry, makeEntry, priceOn, scoreboard, sizePosition, verdictText } from "../assets/journal.js"; // prettier-ignore

const dates = ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"];
const spy = { dates, close: [500, 505, 510, 515, 520] };

describe("📒 diário de operações", () => {
  it("valida a operação", () => {
    expect(makeEntry({ sym: "xlk", openDate: "2026-01-02", openPrice: "100", qty: 10 }).ok).toBe(
      true,
    );
    const bad = makeEntry({ sym: "", openDate: "x", openPrice: 0, qty: -1, stop: 200 });
    expect(bad.ok).toBe(false);
    expect(bad.errors.length).toBeGreaterThanOrEqual(4);
    expect(
      makeEntry({ sym: "SPY", openDate: "2026-01-02", openPrice: 100, qty: 1, stop: 101 }).ok,
    ).toBe(false);
    expect(
      makeEntry({ sym: "brk.b", openDate: "2026-01-02", openPrice: 100, qty: 1 }).entry.sym,
    ).toBe("BRK-B");
  });

  it("fecha a operação e não deixa sair antes de entrar", () => {
    const { entry } = makeEntry({ sym: "QQQ", openDate: "2026-01-05", openPrice: 100, qty: 10 });
    expect(closeEntry(entry, { closeDate: "2026-01-02", closePrice: 110 }).error).toMatch(/antes/);
    const c = closeEntry(entry, { closeDate: "2026-01-08", closePrice: 110, extraFees: 2 });
    expect(c.closePrice).toBe(110);
    expect(c.fees).toBe(2);
  });

  it("preço do dia ou do último pregão antes", () => {
    expect(priceOn(spy, "2026-01-05")).toBe(505);
    expect(priceOn(spy, "2026-01-04")).toBe(500); // fim de semana: sexta
    expect(priceOn(spy, "2025-12-31")).toBe(null);
    expect(priceOn(spy, "2026-02-01")).toBe(520);
  });

  it("resultado, R e contrafactual no SPY", () => {
    const { entry } = makeEntry({ sym: "XLK", openDate: "2026-01-02", openPrice: 100, qty: 10, stop: 95, fees: 1, closeDate: "2026-01-08", closePrice: 110 }); // prettier-ignore
    const ev = evalEntry(entry, { spy: { series: spy } });
    expect(ev.pnl).toBe(99); // 10 × 10 − 1
    expect(ev.r).toBeCloseTo(99 / 50);
    expect(ev.spyRet).toBeCloseTo(0.04);
    expect(ev.spyPnl).toBeCloseTo(40);
    expect(ev.alpha).toBeCloseTo(59);
    expect(ev.open).toBe(false);
  });

  it("aberta marca a mercado pelo preço atual", () => {
    const { entry } = makeEntry({ sym: "XLK", openDate: "2026-01-02", openPrice: 100, qty: 10 });
    const ev = evalEntry(entry, { last: 90, spy: { series: spy, last: 525 }, today: "2026-01-12" });
    expect(ev.open).toBe(true);
    expect(ev.pnl).toBe(-100);
    expect(ev.spyRet).toBeCloseTo(0.05);
    expect(ev.r).toBe(null);
    expect(ev.days).toBe(10);
    expect(evalEntry(entry, {}).pnl).toBe(null); // sem preço: não inventa
  });

  it("placar por motivo e mês, com aviso de amostra pequena", () => {
    const mk = (f) => makeEntry({ openDate: "2026-01-02", qty: 10, openPrice: 100, ...f }).entry;
    const rows = [
      mk({ sym: "A", reason: "flow", closeDate: "2026-01-08", closePrice: 110, stop: 90 }),
      mk({ sym: "B", reason: "flow", closeDate: "2026-01-08", closePrice: 95, stop: 90 }),
      mk({ sym: "C", reason: "gut", closeDate: "2026-01-07", closePrice: 90, stop: 90 }),
      mk({ sym: "D", reason: "gut" }),
    ].map((e) => ({ e, ev: evalEntry(e, { last: 100, spy: { series: spy, last: 520 } }) }));
    const sb = scoreboard(rows);
    expect(sb.closed.n).toBe(3);
    expect(sb.nOpen).toBe(1);
    expect(sb.closed.winRate).toBeCloseTo(1 / 3);
    expect(sb.closed.expR).toBeCloseTo((1 - 0.5 - 1) / 3);
    expect(sb.byReason.map((g) => g.k)).toEqual(["flow", "gut"]);
    expect(sb.byMonth[0].m).toBe("2026-01");
    expect(sb.small).toBe(true);
    expect(verdictText(sb)).toMatch(/a menos/);
    expect(verdictText(sb)).toMatch(/Amostra pequena/);
    expect(verdictText(scoreboard([]))).toMatch(/Nenhuma/);
  });

  it("tamanho da posição pelo risco, com teto por posição", () => {
    const s = sizePosition({ equity: 100_000, riskPct: 1, entry: 100, stop: 95 });
    expect(s.qty).toBe(200); // US$ 1.000 ÷ US$ 5
    expect(s.riskUsd).toBe(1000);
    expect(s.capped).toBe(false);
    const c = sizePosition({ equity: 100_000, riskPct: 1, entry: 100, stop: 99.5 });
    expect(c.capped).toBe(true);
    expect(c.qty).toBe(200); // 20% de 100 mil ÷ 100
    const a = sizePosition({ equity: 100_000, riskPct: 1, entry: 100, atr: 2 }); // stop 2,5 ATR = 95
    expect(a.stop).toBe(95);
    expect(sizePosition({ equity: 0, entry: 100, stop: 90 }).error).toBeTruthy();
    expect(sizePosition({ equity: 1000, entry: 100, stop: 110 }).error).toBeTruthy();
  });

  it("ATR de fechamentos", () => {
    expect(closeAtr([1, 2, 3], 14)).toBe(null);
    const c = Array.from({ length: 20 }, (_, i) => 100 + (i % 2 ? 2 : 0));
    expect(closeAtr(c, 14)).toBe(2);
  });
});
