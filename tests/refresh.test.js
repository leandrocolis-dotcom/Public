import { describe, expect, it } from "vitest";
import { STEPS, nextAuto, nextPreOpen, usSession } from "../assets/refresh.js";

// 7/out/2026 é quarta; Nova York em UTC-4 (horário de verão)
const at = (hhmm, day = "2026-10-07") => Date.parse(`${day}T${hhmm}:00-04:00`);

describe("ritmo automático", () => {
  it("classifica a sessão americana", () => {
    expect(usSession(at("03:59"))).toBe("closed");
    expect(usSession(at("04:00"))).toBe("pre");
    expect(usSession(at("09:30"))).toBe("open");
    expect(usSession(at("15:59"))).toBe("open");
    expect(usSession(at("16:00"))).toBe("post");
    expect(usSession(at("20:00"))).toBe("closed");
    expect(usSession(at("11:00", "2026-10-10"))).toBe("closed"); // sábado
    expect(usSession(at("11:00", "2026-11-26"))).toBe("closed"); // Ação de Graças
  });
  it("reserva com o canal fora: 2 min no pregão, 5 no pré/pós, antecipa na troca de sessão", () => {
    expect(nextAuto(at("10:00")) - at("10:00")).toBe(120000);
    expect(nextAuto(at("05:00")) - at("05:00")).toBe(300000);
    expect(nextAuto(at("09:28"))).toBe(at("09:30"));
    expect(nextAuto(at("19:00")) - at("19:00")).toBe(300000);
    expect(nextAuto(at("03:30"))).toBe(at("04:00"));
  });
  it("canal no ar: a busca vira reserva de 10 min (nada de minuto a minuto)", () => {
    expect(nextAuto(at("10:00"), STEPS.live) - at("10:00")).toBe(600000);
    expect(nextAuto(at("05:00"), STEPS.live) - at("05:00")).toBe(600000);
    expect(nextAuto(at("09:25"), STEPS.live)).toBe(at("09:30"));
  });
  it("fechado: nada até o próximo pré-mercado", () => {
    expect(nextAuto(at("22:00"))).toBe(at("04:00", "2026-10-08")); // quarta à noite -> quinta 4:00
    expect(nextAuto(at("20:30", "2026-10-09"))).toBe(at("04:00", "2026-10-12")); // sexta -> segunda
    expect(nextAuto(at("12:00", "2026-10-10"))).toBe(at("04:00", "2026-10-12")); // sábado -> segunda
    expect(nextPreOpen(Date.parse("2026-11-25T21:00:00-05:00"))).toBe(
      Date.parse("2026-11-27T04:00:00-05:00"),
    ); // pula o feriado
  });
});
