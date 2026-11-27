import { describe, expect, it } from "vitest";
import { brFxOpen, usdBrl } from "../assets/fx-rate.js";

const daily = { dates: ["2026-11-24", "2026-11-25", "2026-11-26"], close: [5.9, 5.8, 5.82] };
const at = (iso) => Date.parse(iso);
const q = (p, iso) => ({ p, t: at(iso) / 1000 });

describe("dólar da Carteira", () => {
  it("câmbio do Brasil: dias úteis 9h–18h de Brasília", () => {
    expect(brFxOpen(at("2026-11-26T12:00:00-03:00"))).toBe(true);
    expect(brFxOpen(at("2026-11-26T08:59:00-03:00"))).toBe(false);
    expect(brFxOpen(at("2026-11-26T18:00:00-03:00"))).toBe(false);
    expect(brFxOpen(at("2026-11-28T12:00:00-03:00"))).toBe(false); // sábado
  });
  it("aberto: preço ao vivo", () => {
    const r = usdBrl({ quote: q(5.75, "2026-11-26T11:58:00-03:00"), daily, nowMs: at("2026-11-26T12:00:00-03:00") }); // prettier-ignore
    expect(r).toMatchObject({ rate: 5.75, src: "live" });
  });
  it("depois das 18h: fechamento do próprio dia, ignorando o tique da noite", () => {
    const r = usdBrl({ quote: q(5.65, "2026-11-26T19:32:00-03:00"), daily, nowMs: at("2026-11-26T23:00:00-03:00") }); // prettier-ignore
    expect(r).toEqual({ rate: 5.82, src: "close", date: "2026-11-26" });
  });
  it("antes da abertura: fechamento do dia anterior, mesmo com barra de hoje", () => {
    const d = { dates: [...daily.dates, "2026-11-27"], close: [...daily.close, 5.7] };
    const r = usdBrl({ quote: q(5.7, "2026-11-27T08:30:00-03:00"), daily: d, nowMs: at("2026-11-27T08:45:00-03:00") }); // prettier-ignore
    expect(r).toEqual({ rate: 5.82, src: "close", date: "2026-11-26" });
  });
  it("aberto mas com cotação parada há mais de 30 min: fechamento anterior", () => {
    const r = usdBrl({ quote: q(5.75, "2026-11-27T09:01:00-03:00"), daily, nowMs: at("2026-11-27T10:00:00-03:00") }); // prettier-ignore
    expect(r).toMatchObject({ rate: 5.82, src: "close", date: "2026-11-26" });
  });
  it("fim de semana: fechamento de sexta", () => {
    const d = { dates: ["2026-11-26", "2026-11-27"], close: [5.82, 5.7] };
    expect(usdBrl({ daily: d, nowMs: at("2026-11-29T12:00:00-03:00") })).toMatchObject({ rate: 5.7, date: "2026-11-27" }); // prettier-ignore
  });
  it("sem dados: null", () => {
    expect(usdBrl({ nowMs: at("2026-11-26T23:00:00-03:00") })).toBeNull();
  });
});
