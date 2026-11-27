import { describe, expect, it } from "vitest";
import {
  detectPairs,
  levOf,
  pairState,
  pairVol,
  parseTargets,
  takePlan,
  targetOdds,
  targetsFor,
} from "../assets/pairs.js";

const EQ = 100_000;
// SOXL subiu de 30 para 33 (+10%), SOXS caiu de 60 para 54 (−10%)
const legs = [
  { sym: "SOXL", qty: 1000, avg: 25, price: 33, pc: 30, lev: 3 },
  { sym: "SOXS", qty: 500, avg: 70, price: 54, pc: 60, lev: -3 },
];

describe("pares long × short", () => {
  it("acha os pares conhecidos com as duas pontas na carteira", () => {
    expect(detectPairs(["SOXS", "AAPL", "SOXL", "SNDQ", "SNDU", "SVIX"])).toEqual([
      ["SOXL", "SOXS"],
      ["SNDU", "SNDQ"],
    ]);
  });
  it("alavancagem pela tabela ou pelo nome", () => {
    expect(levOf("SVIX")).toBe(-1);
    expect(levOf("XYZ", "Tradr 2X Short ABC Daily ETF")).toBe(-2);
    expect(levOf("XYZ", "Some Fund")).toBe(1);
  });
  it("lê os alvos em %", () => {
    expect(parseTargets("1, 2, 5")).toEqual([0.01, 0.02, 0.05]);
    expect(parseTargets("1,5; 3")).toEqual([0.015, 0.03]);
    expect(parseTargets("1,2,5")).toEqual([0.01, 0.02, 0.05]);
    expect(parseTargets("0 2 2 80")).toEqual([0.02]);
  });
  it("P&L do dia líquido do custo de zerar, em % da carteira", () => {
    const st = pairState(legs, { equity: EQ, fee: 0.01, base: "day" });
    // SOXL +3.000, SOXS −3.000 → bruto 0; zerar custa 1% de 33.000 + 27.000
    expect(st.gross).toBeCloseTo(0);
    expect(st.closeFee).toBeCloseTo(600);
    expect(st.grossPct).toBeCloseTo(0);
    expect(st.closeNet).toBeCloseTo(-600);
    expect(st.winner.sym).toBe("SOXL");
    // 33.000 × 3 − 27.000 × 3 = +18.000 de exposição comprada no ativo-base
    expect(st.expo).toBeCloseTo(18_000);
    expect(st.tilt).toBeCloseTo(0.1);
  });
  it("desde o preço médio", () => {
    const st = pairState(legs, { equity: EQ, fee: 0, base: "cost" });
    expect(st.gross).toBeCloseTo(8000 - 8000);
  });
  it("quantas cotas vender para embolsar o alvo já líquido do custo", () => {
    const leg = { sym: "SOXL", qty: 1000, price: 33, ref: 30, lev: 3 };
    // por cota: 3 − 0,33 = 2,67 → 1.000 / 2,67 = 374,5 → 375 cotas
    const p = takePlan(leg, 1000, 0.01);
    expect(p.ok).toBe(true);
    expect(p.shares).toBe(375);
    expect(p.realized).toBeGreaterThanOrEqual(1000);
    expect(p.cost).toBeCloseTo(375 * 33 * 0.01);
    expect(p.left).toBe(625);
  });
  it("não vende quando o ganho por cota não cobre o custo", () => {
    const p = takePlan({ sym: "X", qty: 100, price: 100, ref: 99.5, lev: 1 }, 50, 0.01);
    expect(p.ok).toBe(false);
  });
  it("cotas insuficientes: diz o máximo possível", () => {
    const p = takePlan({ sym: "X", qty: 10, price: 110, ref: 100, lev: 1 }, 1000, 0);
    expect(p.ok).toBe(false);
    expect(p.shares).toBe(10);
    expect(p.realized).toBeCloseTo(100);
  });
  it("alvos: o par inteiro paga a venda e ainda ganha o alvo", () => {
    const strong = [
      { sym: "SOXL", qty: 1000, avg: 25, price: 36, pc: 30, lev: 3 },
      { sym: "SOXS", qty: 500, avg: 70, price: 50, pc: 60, lev: -3 },
    ];
    const st = pairState(strong, { equity: EQ, fee: 0.01, base: "day" });
    // par: +6.000 − 5.000 = +1.000 (1% da carteira); SOXL rende 6 − 0,36 = 5,64 por cota vendida
    expect(st.grossPct).toBeCloseTo(0.01);
    const [half, one] = targetsFor(st, [0.005, 0.01], { equity: EQ, fee: 0.01 });
    // 0,5%: 89 cotas (custo 32,04) e o par fica com +967,96 ≥ 500
    expect(half.hit).toBe(true);
    expect(half.plan.sym).toBe("SOXL");
    expect(half.plan.shares).toBe(89);
    expect(half.plan.realized).toBeGreaterThanOrEqual(500);
    expect(half.expoAfter).toBeCloseTo((1000 - 89) * 36 * 3 - 500 * 50 * 3);
    // 1%: vender 178 cotas custa 64,08 e o par fica abaixo de 1.000 → falta o custo
    expect(one.hit).toBe(false);
    expect(one.plan).toBeNull();
    expect(one.gap).toBeCloseTo(64.08);
  });
  it("oscilação típica do par em % da carteira", () => {
    const a = Array.from({ length: 30 }, (_, i) => 100 * (1 + (i % 2 ? 0.02 : -0.02)));
    const b = Array.from({ length: 30 }, () => 50);
    const s = pairVol([a, b], [0.5, 0.5], 20);
    expect(s).toBeGreaterThan(0.01);
    expect(pairVol([a.slice(0, 5), b], [0.5, 0.5], 20)).toBeNull();
  });
  it("chance de o alvo caber num dia", () => {
    expect(targetOdds(0.01, 0.01).every).toBe(6); // 1σ ≈ 16%
    expect(targetOdds(0.02, 0.01).every).toBe(44); // 2σ ≈ 2,3%
    expect(targetOdds(0.01, null)).toBeNull();
  });
});
