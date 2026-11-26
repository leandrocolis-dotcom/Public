import { describe, expect, it } from "vitest";
import { perfCard, perfOnDay, perfRows, perfSeries, perfSummary } from "../assets/offshore-perf.js";
import { historyCard } from "../assets/pf-history.js";

const b = (n, w) => ({ Nasdaq: { r: n[0], acc: n[1] }, "MSCI World": { r: w[0], acc: w[1] } });
const rows = [
  { kind: "m", day: "2024-07-31", bal: 499.31, r: 0.09, acc: -4.8825, pl: 0.45, acc_pl: -25.63, bench: b([2.6, 62.8183], [1.6, 32.7705]) }, // prettier-ignore
  { kind: "m", day: "2025-12-31", bal: 2456.16, r: -0.19, acc: -2.9565, pl: -4.56, acc_pl: 15.15, bench: b([-0.8, 115.0198], [-0.6, 64.6957]) }, // prettier-ignore
  { kind: "m", day: "2026-10-30", bal: 5934.32, r: -4.8, acc: -46.2414, pl: -300, acc_pl: -4069.98, bench: b([-2.9, 135.3267], [-1.5, 80.7547]) }, // prettier-ignore
  { kind: "m", day: "2026-11-10", bal: 5159.05, r: -1.34, acc: -53.2645, pl: -70.29, acc_pl: -4845.25, bench: b([-0.7, 131.8933], [-0.2, 79.7745]) }, // prettier-ignore
  { kind: "d", day: "2026-11-02", bal: 5733.52, r: -3.3837, acc: -3.3837, pl: -200.8, flow_in: 0, flow_out: 0, bench: b([-1.0718, -1.0718], [-0.374, -0.374]) }, // prettier-ignore
  { kind: "d", day: "2026-11-03", bal: 5358.47, r: -6.5414, acc: -9.7037, pl: -375.05, flow_in: 0, flow_out: 0, bench: b([0.8252, -0.2555], [0.1205, -0.2539]) }, // prettier-ignore
];

describe("rentabilidade real do exterior", () => {
  const pr = perfRows(rows);
  it("ignora o ponto zerado que abre a consulta do BTG", () => {
    const z = perfRows([...rows, { kind: "d", day: "2026-11-01", bal: 0, r: 0, pl: 0, bench: {} }]);
    expect(z.daily[0].day).toBe("2026-11-02");
  });
  it("separa diário e mensal", () => {
    expect(pr.daily).toHaveLength(2);
    expect(pr.monthly).toHaveLength(4);
  });
  it("mês = diários encadeados; ano e início pelo acumulado mensal", () => {
    const s = perfSummary(pr);
    const [mes, ano, , ini] = s.windows;
    expect(s.asOf).toBe("2026-11-10");
    expect(mes.r).toBeCloseTo(-0.097037, 4);
    expect(mes.pl).toBeCloseTo(-575.85, 2);
    expect(mes.bench.Nasdaq).toBeCloseTo(-0.002555, 4);
    expect(ano.r).toBeCloseTo((1 - 0.532645) / (1 - 0.029565) - 1, 6);
    expect(ano.pl).toBeCloseTo(-4845.25 - 15.15, 2);
    expect(ini.r).toBeCloseTo(-0.532645, 6);
    expect(ini.bench.Nasdaq).toBeCloseTo(1.318933, 6);
  });
  it("dia exato traz retorno sem aportes; sem ponto, o último saldo", () => {
    expect(perfOnDay(pr, "2026-11-03")).toMatchObject({ exact: true, bal: 5358.47 });
    expect(perfOnDay(pr, "2026-11-03").r).toBeCloseTo(-0.065414, 6);
    expect(perfOnDay(pr, "2026-01-15")).toMatchObject({ exact: false, day: "2025-12-31", bal: 2456.16 }); // prettier-ignore
    expect(perfOnDay(pr, "2024-01-01")).toBeNull();
  });
  it("série base 100, cartão e dia antigo no Histórico", () => {
    expect(perfSeries(pr)[0].pf).toBeCloseTo(95.1175, 3);
    const html = perfCard(pr);
    expect(html).toContain("Desde o início");
    expect(html).toContain("<svg");
    const day = historyCard([], "2026-11-03", "2026-11-25", pr);
    expect(day).toContain("Exterior no dia");
    expect(day).toContain('min="2024-07-31"');
  });
});
