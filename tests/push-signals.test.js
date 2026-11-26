import { describe, it, expect } from "vitest";
import { signalAlerts, statLine, alertsFor } from "../scripts/lib/push-alerts.mjs";
import { withLive } from "../api/push-alerts.js";
import { signalsFor } from "../assets/signals.js";

// série sintética: tendência de alta longa e queda forte nos últimos dias (mínima de 10 dias com RSI baixo)
const up = Array.from({ length: 300 }, (_, i) => 100 * 1.002 ** i * (1 + 0.01 * Math.sin(i / 3)));
const series = [...up, ...[0.97, 0.96, 0.95, 0.94, 0.93, 0.92].map((f) => up.at(-1) * f)];
const dates = series.map((_, i) =>
  new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10),
);

describe("sinais da carteira no push", () => {
  it("a série de teste dispara a regra de fraqueza de curto prazo", () => {
    expect(signalsFor(series).map((s) => s.code)).toContain("pullback10");
  });
  it("cobre ativo fora do universo do mapa pela série ao vivo, com preço e histórico no texto", () => {
    const a = signalAlerts([{ sym: "NVDL" }], null, { live: { NVDL: { dates, close: series } } });
    const pb = a.find((x) => x.key.includes("pullback10"));
    expect(pb).toBeTruthy();
    expect(pb.key).toBe(`sig:NVDL:pullback10:${dates.at(-1)}`);
    expect(pb.title).toMatch(/^📈 SINAL DA CARTEIRA · ▲ Entrada · NVDL \d/);
    expect(pb.body).toMatch(/Não é recomendação/);
  });
  it("sem série em nenhuma fonte: nada", () => {
    expect(signalAlerts([{ sym: "XYZ" }], null, {})).toEqual([]);
  });
  it("o mesmo sinal não repete no mesmo dia", () => {
    const live = { NVDL: { dates, close: series } };
    const first = alertsFor({ holdings: [{ sym: "NVDL" }], live, news: [] }).send;
    const again = alertsFor({ holdings: [{ sym: "NVDL" }], live, news: [], sent: new Set(first.map((x) => x.key)) }).send; // prettier-ignore
    expect(first.length).toBeGreaterThan(0);
    expect(again).toEqual([]);
  });
  it("respeita sinais desligados", () => {
    const live = { NVDL: { dates, close: series } };
    expect(
      alertsFor({ holdings: [{ sym: "NVDL" }], live, news: [], prefs: { sig: false } }).send,
    ).toEqual([]);
  });
  it("statLine resume o backtest do ativo e do conjunto de referência", () => {
    const own = { rules: { pullback10: { n: 5, hitRate: 0.6, avgFwd: 0.012 } } };
    const glob = {
      base: { avgFwd: 0.003 },
      rules: { pullback10: { n: 2464, hitRate: 0.56, avgFwd: 0.0069 } },
    };
    const t = statLine("pullback10", "entry", own, glob);
    expect(t).toContain("subiu em 60% de 5 vezes (média +1,2% em 5 dias)");
    expect(t).toContain("2464 casos de referência, média +0,7% em 5 dias (base +0,3%)");
  });
  it("withLive acrescenta o pregão de hoje ou substitui o último", () => {
    const h = { A: { dates: ["2026-10-07"], close: [10] } };
    const t = Date.parse("2026-10-08T15:00:00Z") / 1000;
    expect(withLive(h, { A: { p: 11, t } }).A).toEqual({
      dates: ["2026-10-07", "2026-10-08"],
      close: [10, 11],
    });
    const t0 = Date.parse("2026-10-07T18:00:00Z") / 1000;
    expect(withLive(h, { A: { p: 12, t: t0 } }).A.close).toEqual([12]);
  });
});
