// Regra de sessão única (assets/sessions.js): app e robô de cotações usam a mesma.
import { describe, expect, it } from "vitest";
import {
  b3Open,
  feedSession,
  futuresOpen,
  fxOpen,
  sessionInfo,
  symClass,
  symOpen,
  usSession,
} from "../assets/sessions.js";

// Nova York: UTC-4 até 1/nov/2026, UTC-5 depois (horário de verão termina no 1º domingo de novembro)
const edt = (day, hhmm) => Date.parse(`${day}T${hhmm}:00-04:00`);
const est = (day, hhmm) => Date.parse(`${day}T${hhmm}:00-05:00`);

describe("sessions: bolsa dos EUA", () => {
  it("pré, pregão, pós e fechado num dia útil", () => {
    expect(usSession(edt("2026-10-07", "05:00"))).toBe("pre");
    expect(usSession(edt("2026-10-07", "09:30"))).toBe("open");
    expect(usSession(edt("2026-10-07", "16:00"))).toBe("post");
    expect(usSession(edt("2026-10-07", "20:00"))).toBe("closed");
    expect(usSession(edt("2026-10-07", "03:59"))).toBe("closed");
  });
  it("feriado da NYSE e fim de semana = fechado o dia todo", () => {
    expect(usSession(est("2026-11-26", "10:00"))).toBe("closed"); // Ação de Graças
    expect(sessionInfo("2026-11-26").reason).toMatch(/Ação de Graças/);
    expect(usSession(edt("2026-10-10", "10:00"))).toBe("closed"); // sábado
  });
  it("pregão encurtado: pregão até 13:00 e pós até 17:00 (sexta depois da Ação de Graças)", () => {
    expect(sessionInfo("2026-11-27")).toMatchObject({ open: true, closeMin: 780, postEnd: 1020 });
    expect(usSession(est("2026-11-27", "12:59"))).toBe("open");
    expect(usSession(est("2026-11-27", "13:00"))).toBe("post");
    expect(usSession(est("2026-11-27", "16:30"))).toBe("post");
    expect(usSession(est("2026-11-27", "17:00"))).toBe("closed");
    // véspera da Ação de Graças é pregão normal na NYSE (até 16:00, pós até 20:00)
    expect(usSession(est("2026-11-25", "15:59"))).toBe("open");
    expect(usSession(est("2026-11-25", "19:59"))).toBe("post");
    expect(usSession(est("2026-12-24", "13:00"))).toBe("post");
  });
  it("futuros da CME nos feriados: param às 13:00 na Ação de Graças, fecham 13:15 no encurtado, Natal fechado", () => {
    expect(futuresOpen(est("2026-11-26", "12:59"))).toBe(true);
    expect(futuresOpen(est("2026-11-26", "13:00"))).toBe(false);
    expect(futuresOpen(est("2026-11-26", "18:00"))).toBe(true);
    expect(futuresOpen(est("2026-11-27", "13:14"))).toBe(true);
    expect(futuresOpen(est("2026-11-27", "13:15"))).toBe(false);
    expect(futuresOpen(est("2026-11-29", "18:00"))).toBe(true);
    expect(futuresOpen(est("2026-12-24", "19:00"))).toBe(false); // véspera do Natal: sem reabertura
    expect(futuresOpen(est("2026-12-25", "10:00"))).toBe(false);
    expect(futuresOpen(est("2026-12-31", "18:30"))).toBe(false); // véspera do Ano Novo
    expect(futuresOpen(est("2026-12-28", "10:00"))).toBe(true);
  });
  it("horário de verão: 9:30 de NY é 14:30 UTC depois de 1/nov", () => {
    expect(usSession(Date.parse("2026-11-04T14:30:00Z"))).toBe("open");
    expect(usSession(Date.parse("2026-11-04T14:29:00Z"))).toBe("pre");
  });
});

describe("sessions: futuros, moedas, B3 e canal", () => {
  it("futuros: domingo 18:00 a sexta 17:00, com pausa diária 17:00–18:00", () => {
    expect(futuresOpen(edt("2026-10-11", "17:59"))).toBe(false); // domingo
    expect(futuresOpen(edt("2026-10-11", "18:00"))).toBe(true);
    expect(futuresOpen(edt("2026-10-07", "17:30"))).toBe(false); // pausa
    expect(futuresOpen(edt("2026-10-07", "18:30"))).toBe(true);
    expect(futuresOpen(edt("2026-10-09", "16:59"))).toBe(true); // sexta
    expect(futuresOpen(edt("2026-10-09", "21:00"))).toBe(false); // sexta à noite
    expect(futuresOpen(edt("2026-10-10", "12:00"))).toBe(false); // sábado
  });
  it("moedas abrem domingo 17:00; B3 só em dia útil no horário de São Paulo", () => {
    expect(fxOpen(edt("2026-10-11", "17:00"))).toBe(true);
    expect(fxOpen(edt("2026-10-11", "16:00"))).toBe(false);
    expect(b3Open(Date.parse("2026-10-07T10:00:00-03:00"))).toBe(true);
    expect(b3Open(Date.parse("2026-10-07T09:00:00-03:00"))).toBe(false);
    expect(b3Open(Date.parse("2026-10-07T19:00:00-03:00"))).toBe(false);
    expect(b3Open(Date.parse("2026-10-10T12:00:00-03:00"))).toBe(false); // sábado
  });
  it("canal: noite de futuros, feriado com futuros, domingo 18 h; nada no sábado", () => {
    expect(feedSession(edt("2026-10-07", "22:00"))).toBe("night");
    expect(feedSession(edt("2026-10-11", "18:00"))).toBe("night");
    expect(feedSession(est("2026-11-26", "10:00"))).toBe("night"); // feriado: só futuros
    expect(feedSession(edt("2026-10-10", "12:00"))).toBeNull();
    expect(feedSession(edt("2026-10-09", "21:00"))).toBeNull(); // sexta à noite
  });
  it("classe e mercado aberto por símbolo", () => {
    expect(symClass("SPY")).toBe("us");
    expect(symClass("^VIX")).toBe("us");
    expect(symClass("PETR4.SA")).toBe("b3");
    expect(symClass("^BVSP")).toBe("b3");
    expect(symClass("ES=F")).toBe("fut");
    expect(symClass("DX-Y.NYB")).toBe("fut");
    expect(symClass("BRL=X")).toBe("fx");
    expect(symClass("BTC-USD")).toBe("crypto");
    expect(symClass("^N225")).toBe("world");
    expect(symClass("FTSEMIB.MI")).toBe("world");
    const night = edt("2026-10-07", "22:00");
    expect(symOpen("SPY", night)).toBe(false);
    expect(symOpen("ES=F", night)).toBe(true);
    expect(symOpen("PETR4.SA", night)).toBe(false);
    expect(symOpen("BTC-USD", edt("2026-10-10", "12:00"))).toBe(true);
  });
});
