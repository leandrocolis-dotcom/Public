import { describe, it, expect } from "vitest";
import {
  percentile, interp, capeCard, etfValuation, checkFundamentals, linreg, label, asOf, equityCard, creditCard, treasuryCard, goldCard, valueCards,
} from "../assets/fa.js"; // prettier-ignore

const weeks = (n, start = "2020-01-03") =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(start) + i * 7 * 864e5).toISOString().slice(0, 10),
  );

describe("fa: utilitários", () => {
  it("percentile conta valores <= x", () => {
    expect(percentile([1, 2, 3, 4], 3)).toBe(0.75);
    expect(percentile([], 1)).toBeNull();
  });
  it("interp satura nas pontas e interpola no meio", () => {
    const pts = [[1, 15], [2, 35], [4, 85]]; // prettier-ignore
    expect(interp(pts, 0)).toBe(15);
    expect(interp(pts, 3)).toBe(60);
    expect(interp(pts, 9)).toBe(85);
  });
  it("linreg recupera reta exata", () => {
    const { a, b } = linreg([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(a).toBeCloseTo(1);
    expect(b).toBeCloseTo(2);
  });
  it("label por faixas", () => {
    expect(label(80)).toBe("Barato");
    expect(label(50)).toBe("Neutro");
    expect(label(10)).toBe("Caro");
    expect(label(null)).toBe("Sem dado");
  });
  it("asOf pega a última data anterior", () => {
    expect(asOf(["2020-01-01", "2020-01-08"], [1, 2], "2020-01-05")).toBe(1);
    expect(asOf(["2020-01-01"], [1], "2019-12-31")).toBeNull();
  });
});

describe("fa: cards", () => {
  it("bolsa: ERP = 1/PL − juro real, por faixas com pouco histórico", () => {
    const c = equityCard(
      { dates: ["2026-10-07"], pe: [25] },
      { dates: ["2026-10-07"], values: [2] },
    );
    expect(c.ey).toBeCloseTo(4);
    expect(c.erp).toBeCloseTo(2);
    expect(c.score).toBeCloseTo(35);
    expect(c.method).toBe("faixas");
  });
  it("crédito: spread no topo do histórico = barato", () => {
    const c = creditCard("HYG", { dates: weeks(5), values: [3, 4, 5, 6, 9] });
    expect(c.score).toBe(100);
  });
  it("treasuries combinam juro real e curva", () => {
    const real = { dates: weeks(4), values: [0, 1, 2, 3] };
    const c = treasuryCard(real, [4, 4, 4, 5], [5, 5, 5, 4]);
    expect(c.slope).toBe(1);
    expect(c.score).toBe(100);
  });
  it("ouro: preço acima do explicado pelo juro real = caro", () => {
    const ds = weeks(60);
    const real = { dates: ds, values: ds.map((_, i) => (i % 10) / 5) };
    const gld = real.values.map(
      (r, i) => Math.exp(5 - 0.3 * r) * (i === 59 ? 1.3 : 1 + 0.01 * ((i % 3) - 1)),
    );
    const c = goldCard(real, ds, gld);
    expect(c.beta).toBeLessThan(0);
    expect(c.score).toBeLessThan(30);
  });
  it("ouro: relação positiva com o juro real marca modelo quebrado", () => {
    const ds = weeks(60);
    const real = { dates: ds, values: ds.map((_, i) => i / 10) };
    const c = goldCard(
      real,
      ds,
      real.values.map((r) => Math.exp(5 + 0.2 * r)),
    );
    expect(c.broken).toBe(true);
    expect(c.score).toBeNull();
  });
  it("CAPE: ECY no topo do histórico = barato; retorno esperado = 1/CAPE", () => {
    const n = 200;
    const cape = {
      dates: Array.from(
        { length: n },
        (_, i) => `${1900 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
      ),
      values: Array.from({ length: n }, (_, i) => (i === n - 1 ? 10 : 20 + (i % 7))),
      ecy: Array.from({ length: n }, (_, i) => (i === n - 1 ? 9 : i % 5)),
    };
    const c = capeCard(cape, { dates: ["2026-10-01"], values: [2] });
    expect(c.r10).toBeCloseTo(10);
    expect(c.ecyNow).toBeCloseTo(8);
    expect(c.score).toBe(100);
    expect(c.since).toBe("1900");
    expect(
      equityCard({ dates: ["x"], pe: [25] }, { dates: ["x"], values: [2] }, c.score).method,
    ).toBe("CAPE");
  });
  it("valueCards devolve 6 cards e tolera dados ausentes", () => {
    const cards = valueCards(null, null);
    expect(cards).toHaveLength(6);
    expect(cards.every((c) => c.label === "Sem dado")).toBe(true);
  });
});

describe("fa: valuation por ETF", () => {
  const h = (pe, n = 1) => ({
    dates: Array(n).fill("2026-10-07"),
    pe: Array(n).fill(pe),
    dy: Array(n).fill(1),
    pb: Array(n).fill(null),
  });
  const grp = () => "EUA";
  it("sem histórico: posição entre os pares (P/L baixo = barato)", () => {
    const rows = etfValuation({ SPY: h(25), XLK: h(33), XLF: h(15), XLE: h(18) }, grp);
    const by = Object.fromEntries(rows.map((r) => [r.sym, r]));
    expect(by.XLF.score).toBe(100);
    expect(by.XLK.score).toBe(0);
    expect(by.XLF.base).toBe("pares");
    expect(by.XLK.vsSpy).toBeCloseTo(33 / 25 - 1);
    expect(by.XLE.cyclical).toBe(true);
    expect(rows[0].sym).toBe("XLF");
  });
  it("com histórico longo: percentil do próprio rendimento do lucro", () => {
    const x = h(20, 300);
    x.pe[299] = 10;
    const [r] = etfValuation({ XLF: x }, grp);
    expect(r.base).toBe("histórico");
    expect(r.score).toBe(100);
  });
  it("P/L ausente vira sem dado", () => {
    const [r] = etfValuation({ XLF: { dates: ["x"], pe: [null], dy: [2], pb: [null] } }, grp);
    expect(r.score).toBeNull();
    expect(r.label).toBe("Sem dado");
  });
});

describe("fa: validação do arquivo", () => {
  it("aceita arquivo bom e alerta arquivo velho ou quebrado", () => {
    const ok = {
      meta: { updated_at: "2026-10-07" },
      fred: { A: { dates: ["2020-01-01", "2020-01-08"], values: [1, 2] } },
      etf: { SPY: { dates: ["x"], pe: [25], dy: [1] } },
    };
    expect(checkFundamentals(ok, "2026-10-08").every((i) => i.level === "ok")).toBe(true);
    const bad = {
      meta: { updated_at: "2026-09-01" },
      fred: { A: { dates: ["2020-01-08", "2020-01-01"], values: [1, 2] } },
    };
    expect(checkFundamentals(bad, "2026-10-08").filter((i) => i.level === "warn")).toHaveLength(3);
  });
});
