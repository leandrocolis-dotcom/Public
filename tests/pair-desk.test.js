import { describe, expect, it } from "vitest";
import { barScale, deskState, legOrders } from "../assets/pair-desk.js";

// SOXL 100 a 37 (médio 28) × SOXS 10 a 50 (médio 65); fechamento anterior 35 e 52
const legs = () => [
  { sym: "SOXL", qty: 100, avg: 28, price: 37, pc: 35, lev: 3 },
  { sym: "SOXS", qty: 10, avg: 65, price: 50, pc: 52, lev: -3 },
];

describe("ordens da ponta", () => {
  it("trava retém a fração do lucro: stop = médio + reter × (agora − médio)", () => {
    const o = legOrders({ qty: 100, avg: 100, price: 200 }, { sell: 0, keep: 0.5, fee: 0 });
    expect(o.stop.price).toBe(150); // lucro 100 → reter 50
    expect(o.stop.shares).toBe(100);
    expect(o.stop.keeps).toBe(5000);
    expect(o.stop.dist).toBeCloseTo(-0.25);
    expect(o.sale).toBeNull();
  });
  it("venda parcial em cotas inteiras realiza contra o médio, líquida do custo; trava cobre o resto", () => {
    const o = legOrders({ qty: 147.59, avg: 28, price: 37 }, { sell: 0.3, keep: 0.5, fee: 0.01 });
    expect(o.sale.shares).toBe(44);
    expect(o.sale.notional).toBeCloseTo(44 * 37);
    expect(o.sale.realized).toBeCloseTo(44 * 9 - 44 * 37 * 0.01);
    expect(o.stop.shares).toBe(103); // 147,59 − 44 = 103,59 → 103 inteiras
    expect(o.stop.price).toBeCloseTo(32.5);
  });
  it("ponta no prejuízo não tem venda nem trava", () => {
    const o = legOrders({ qty: 10, avg: 65, price: 50 }, { sell: 0.5, keep: 0.5 });
    expect(o.sale).toBeNull();
    expect(o.stop).toBeNull();
  });
  it("vender 100% não deixa trava", () => {
    const o = legOrders({ qty: 10, avg: 10, price: 12 }, { sell: 1, keep: 0.5, fee: 0 });
    expect(o.sale.shares).toBe(10);
    expect(o.stop).toBeNull();
  });
});

describe("painel", () => {
  it("comprado/vendido pelo sinal da alavancagem, resultado e % sobre o investido", () => {
    const d = deskState([{ key: "SOXL-SOXS", legs: legs(), sell: 0, keep: 0.5 }], { fee: 0 });
    const p = d.pairs[0];
    expect(p.long).toBe(3700);
    expect(p.short).toBe(500);
    expect(p.pl).toBe(900 - 150);
    expect(p.inv).toBe(2800 + 650);
    expect(p.plPct).toBeCloseTo(750 / 3450);
    expect(p.rows[0].side).toBe("long");
    expect(p.rows[1].side).toBe("short");
    expect(p.rows[0].day).toBeCloseTo(37 / 35 - 1);
    expect(p.rows[0].orders.stop.price).toBe(32.5);
    expect(d.total).toMatchObject({ long: 3700, short: 500, pl: 750 });
  });
  it("base Hoje mede desde o fechamento anterior, mas a trava segue o médio", () => {
    const d = deskState([{ key: "x", legs: legs() }], { fee: 0, base: "day" });
    const p = d.pairs[0];
    expect(p.pl).toBe(100 * 2 + 10 * -2);
    expect(p.inv).toBe(3500 + 520);
    expect(p.rows[0].orders.stop.price).toBe(32.5);
  });
});

describe("régua de preço", () => {
  it("posiciona médio, trava e agora com folga nas pontas", () => {
    const s = barScale(100, 200, 150);
    expect(s.avg).toBeGreaterThan(0);
    expect(s.price).toBeLessThan(100);
    expect(s.stop).toBeCloseTo(50);
    expect(barScale(100, null)).toBeNull();
  });
});
