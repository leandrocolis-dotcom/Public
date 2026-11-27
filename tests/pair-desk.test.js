import { describe, expect, it } from "vitest";
import { barScale, deskState, legOrders, parseSteps, tiltPlan } from "../assets/pair-desk.js";

// SOXL 100 a 37 (médio 28) × SOXS 10 a 50 (médio 65); fechamento anterior 35 e 52
const legs = () => [
  { sym: "SOXL", qty: 100, avg: 28, price: 37, pc: 35, lev: 3 },
  { sym: "SOXS", qty: 10, avg: 65, price: 50, pc: 52, lev: -3 },
];

describe("degraus da trava", () => {
  it("lê 50 70, 50;70, 50/70 e número; ordena, sem repetir, até 3", () => {
    expect(parseSteps("70 50")).toEqual([0.5, 0.7]);
    expect(parseSteps("50;70")).toEqual([0.5, 0.7]);
    expect(parseSteps("50,70")).toEqual([0.5, 0.7]);
    expect(parseSteps("50,5")).toEqual([0.505]);
    expect(parseSteps(0.5)).toEqual([0.5]);
    expect(parseSteps("30 50 70 90")).toEqual([0.3, 0.5, 0.7]);
    expect(parseSteps("abc")).toEqual([]);
  });
});

describe("ordens da ponta", () => {
  it("trava retém a fração do lucro: stop = médio + reter × (agora − médio)", () => {
    const o = legOrders({ qty: 100, avg: 100, price: 200 }, { keeps: [0.5], fee: 0 });
    expect(o.stops).toHaveLength(1);
    expect(o.stops[0]).toMatchObject({ price: 150, shares: 100, keeps: 5000 });
    expect(o.stops[0].dist).toBeCloseTo(-0.25);
  });
  it("escada: cotas divididas entre os degraus, o mais alto primeiro", () => {
    const o = legOrders({ qty: 101, avg: 100, price: 200 }, { keeps: [0.5, 0.7], fee: 0 });
    expect(o.stops.map((s) => s.price)).toEqual([170, 150]);
    expect(o.stops.map((s) => s.shares)).toEqual([50, 51]);
  });
  it("venda parcial em cotas inteiras; a escada cobre o resto", () => {
    const o = legOrders(
      { qty: 147.59, avg: 28, price: 37 },
      { sell: 0.3, keeps: [0.5], fee: 0.01 },
    );
    expect(o.sale.shares).toBe(44);
    expect(o.sale.realized).toBeCloseTo(44 * 9 - 44 * 37 * 0.01);
    expect(o.stops[0].shares).toBe(103);
  });
  it("ponta no prejuízo não tem venda nem trava", () => {
    const o = legOrders({ qty: 10, avg: 65, price: 50 }, { sell: 0.5, keeps: [0.5] });
    expect(o.sale).toBeNull();
    expect(o.stops).toEqual([]);
  });
});

describe("leme (postura-alvo)", () => {
  const rows = [
    { sym: "L", qty: 100, avg: 10, price: 10, lev: 2, expo: 2000 },
    { sym: "S", qty: 100, avg: 10, price: 10, lev: -2, expo: -2000 },
  ];
  it("de neutro a +50%: vender a ponta inversa ou comprar a comprada", () => {
    const p = tiltPlan(rows, 0.5, { fee: 0, cash: 10_000 });
    expect(p.now).toBe(0);
    const sell = p.options.find((o) => o.side === "sell");
    const buy = p.options.find((o) => o.side === "buy");
    // vender x: (0 + x) / (4000 − x) = 0,5 → x = 1333 de exposição = 67 cotas a 10 × 2
    expect(sell).toMatchObject({ sym: "S", shares: 67 });
    // comprar y: y / (4000 + y) = 0,5 → y = 4000 = 200 cotas
    expect(buy).toMatchObject({ sym: "L", shares: 200, fits: true });
  });
  it("para baixo vende a comprada ou compra a inversa; sem alvo, sem opções", () => {
    const p = tiltPlan(rows, -0.5, { fee: 0 });
    expect(p.options.map((o) => `${o.side}:${o.sym}`)).toEqual(["sell:L", "buy:S"]);
    expect(tiltPlan(rows, null).options).toEqual([]);
  });
});

describe("painel", () => {
  it("soma comprado, vendido, líquido, garantido e % sobre o investido", () => {
    const d = deskState([{ key: "SOXL-SOXS", legs: legs(), keeps: [0.5] }], { fee: 0, cash: 1000, account: 5200 }); // prettier-ignore
    const p = d.pairs[0];
    expect(p.long).toBe(3700);
    expect(p.short).toBe(500);
    expect(p.pl).toBe(900 - 150);
    expect(p.plPct).toBeCloseTo(750 / 3450);
    // trava SOXL a 32,5 retém 100 × 4,5 = 450; SOXS como está: −150
    expect(p.locked).toBeCloseTo(300);
    expect(d.total).toMatchObject({ long: 3700, short: 500, pl: 750, cash: 1000 });
    expect(d.total.expo).toBe(11100 - 1500);
    expect(d.total.expoPct).toBeCloseTo(9600 / 5200);
    expect(d.total.locked).toBeCloseTo(300);
  });
  it("base Hoje mede desde o fechamento anterior, mas a trava segue o médio", () => {
    const p = deskState([{ key: "x", legs: legs() }], { fee: 0, base: "day" }).pairs[0];
    expect(p.pl).toBe(100 * 2 + 10 * -2);
    expect(p.rows[0].orders.stops[0].price).toBe(32.5);
  });
});

describe("régua de preço", () => {
  it("posiciona médio, degraus e agora com folga nas pontas", () => {
    const s = barScale(100, 200, [150]);
    expect(s.avg).toBeGreaterThan(0);
    expect(s.price).toBeLessThan(100);
    expect(s.stops[0]).toBeCloseTo(50);
    expect(barScale(100, null)).toBeNull();
  });
});
