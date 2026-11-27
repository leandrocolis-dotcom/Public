// Long & Short, Fase 2: sessão, marcos, troca de horário de verão, feriado e pregão encurtado.
import { describe, expect, it } from "vitest";
import { calendarStatus, clocks, dayMarks, leftText, lsSession, markMin, nextMark, refPrice, tradingDay } from "../assets/ls-clock.js"; // prettier-ignore

const at = (iso) => Date.parse(iso);

describe("ls-clock", () => {
  it("sessões num dia normal (inverno: ET = UTC−5)", () => {
    expect(lsSession(at("2026-12-01T08:59:00Z"))).toBe("FECHADO"); // 3:59
    expect(lsSession(at("2026-12-01T09:00:00Z"))).toBe("PRE"); // 4:00
    expect(lsSession(at("2026-12-01T14:30:00Z"))).toBe("REGULAR"); // 9:30
    expect(lsSession(at("2026-12-01T21:00:00Z"))).toBe("POS"); // 16:00
    expect(lsSession(at("2026-12-02T01:00:00Z"))).toBe("FECHADO"); // 20:00
  });

  it("troca de horário: 14/mar/2027 o pré abre às 5:00 de Brasília (antes, 6:00)", () => {
    expect(clocks(at("2027-03-15T08:00:00Z"))).toEqual({ et: "04:00", br: "05:00" });
    expect(lsSession(at("2027-03-15T08:00:00Z"))).toBe("PRE");
    expect(clocks(at("2027-03-12T09:00:00Z"))).toEqual({ et: "04:00", br: "06:00" });
    expect(lsSession(at("2027-03-12T09:00:00Z"))).toBe("PRE");
  });

  it("fim do horário de verão: 1/nov/2026 e 7/nov/2027", () => {
    // sexta antes (verão, UTC−4) e segunda depois (inverno, UTC−5): pregão sempre às 9:30 ET
    expect(lsSession(at("2026-10-30T13:30:00Z"))).toBe("REGULAR");
    expect(lsSession(at("2026-11-02T13:30:00Z"))).toBe("PRE");
    expect(lsSession(at("2026-11-02T14:30:00Z"))).toBe("REGULAR");
    expect(clocks(at("2027-11-08T14:30:00Z"))).toEqual({ et: "09:30", br: "11:30" });
    expect(clocks(at("2027-11-05T13:30:00Z"))).toEqual({ et: "09:30", br: "10:30" });
  });

  it("feriado (Ação de Graças 2026): fechado o dia todo e CAL-01", () => {
    expect(lsSession(at("2026-11-26T15:00:00Z"))).toBe("FECHADO");
    expect(dayMarks("2026-11-26")).toEqual([]);
    expect(calendarStatus("2026-11-26")).toMatchObject({ special: true, blocks: true });
  });

  it("pregão encurtado às 13:00: aumentos até 12:00, checagem às 12:45, pós até 17:00", () => {
    const m = Object.fromEntries(dayMarks("2026-11-27").map((x) => [x.id, x.min]));
    expect(m).toMatchObject({
      cut: 720,
      eod: 765,
      close: 780,
      posteod: 1005,
      postEnd: 1020,
      or: 585,
    });
    expect(lsSession(at("2026-11-27T18:30:00Z"))).toBe("POS"); // 13:30
    expect(lsSession(at("2026-11-27T22:00:00Z"))).toBe("FECHADO"); // 17:00
    expect(calendarStatus("2026-11-27").blocks).toBe(true);
    expect(calendarStatus("2026-11-27", "2026-11-27").blocks).toBe(false);
    expect(calendarStatus("2026-12-01")).toMatchObject({ special: false, blocks: false });
    expect(calendarStatus("2028-03-01")).toMatchObject({ validated: false, blocks: true });
  });

  it("dia normal: marcos 9:45, 15:00, 15:45, 16:00, 19:45, 20:00 e próximo marco com contagem", () => {
    const ms = at("2026-12-01T15:15:00Z"); // 10:15 ET
    expect(markMin(ms, "cut")).toBe(900);
    const n = nextMark(ms);
    expect(n).toMatchObject({ id: "cut", left: 285 });
    expect(leftText(n.left)).toBe("4h45");
    expect(leftText(12)).toBe("12 min");
    expect(nextMark(at("2026-12-02T01:30:00Z"))).toBeNull(); // 20:30
  });

  it("dia de trading: reset às 4:00 ET", () => {
    expect(tradingDay(at("2026-12-02T08:30:00Z"))).toBe("2026-12-01"); // 3:30 ET
    expect(tradingDay(at("2026-12-02T09:00:00Z"))).toBe("2026-12-02");
  });

  it("referência do dia = último preço do pós anterior; sem barras, o fechamento anterior", () => {
    const t = (iso) => at(iso) / 1000;
    const bars = { t: [t("2026-12-01T20:55:00Z"), t("2026-12-02T00:55:00Z"), t("2026-12-02T09:05:00Z")], c: [30, 30.4, 30.9] }; // prettier-ignore
    expect(refPrice(bars, at("2026-12-02T15:00:00Z"))).toBe(30.4);
    expect(refPrice({ t: [], c: [] }, at("2026-12-02T15:00:00Z"), { pc: 29.5 })).toBe(29.5);
    expect(refPrice(null, at("2026-12-02T15:00:00Z"))).toBeNull();
  });
});
