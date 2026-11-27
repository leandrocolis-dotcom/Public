import { describe, expect, it } from "vitest";
import { cashState, deskState, legMove, targetTilt, tiltPlan } from "../assets/pair-desk.js";
import { pairState } from "../assets/pairs.js";

// dupla equilibrada: 1.000 SOXL a 30 (médio 25) × 500 SOXS a 60 (médio 70) → exposição 90.000 − 90.000 = 0
const legs = () => [
  { sym: "SOXL", qty: 1000, avg: 25, price: 30, pc: 30, lev: 3 },
  { sym: "SOXS", qty: 500, avg: 70, price: 60, pc: 60, lev: -3 },
];
const EQ = 100_000;

describe("inclinação pelo regime", () => {
  it("nota do pêndulo vira inclinação-alvo, com teto", () => {
    expect(targetTilt(100, 0.5)).toBe(0.5);
    expect(targetTilt(-40, 0.5)).toBeCloseTo(-0.2);
    expect(targetTilt(-300, 0.5)).toBe(-0.5);
    expect(targetTilt(null)).toBe(0);
  });
  it("reserva de caixa: livre só o que passa da reserva", () => {
    expect(cashState(15_000, 100_000, 0.1)).toMatchObject({ want: 10_000, free: 5_000, short: 0 });
    expect(cashState(4_000, 100_000, 0.1)).toMatchObject({ free: 0, short: 6_000 });
  });
  it("vender ponta realiza contra o médio e paga o custo; comprar consome caixa", () => {
    const st = pairState(legs(), { equity: EQ, fee: 0.01, base: "cost" });
    const [soxl, soxs] = st.rows;
    // precisa de −9.000 de exposição: vender 100 SOXL (9.000 ÷ 3 ÷ 30)
    const sell = legMove(soxl, -9000, 0.01);
    expect(sell).toMatchObject({ side: "sell", shares: 100 });
    expect(sell.realized).toBeCloseTo(100 * 5 - 30); // lucro 5/cota − 1% de 3.000
    // ou comprar 50 SOXS (9.000 ÷ 3 ÷ 60)
    const buy = legMove(soxs, -9000, 0.01);
    expect(buy).toMatchObject({ side: "buy", shares: 50 });
    expect(buy.cashDelta).toBeCloseTo(-(3000 + 30));
  });
  it("regime virando para baixa: prefere vender a ponta comprada que está no lucro", () => {
    const st = pairState(legs(), { equity: EQ, fee: 0.01, base: "cost" });
    const p = tiltPlan(st, {
      score: -40,
      maxTilt: 0.5,
      band: 0.1,
      fee: 0.01,
      cash: cashState(0, EQ),
    });
    expect(p.ok).toBe(false);
    expect(p.want).toBeCloseTo(-0.2);
    // alvo = −0,2 × 180.000 = −36.000 → vender 400 SOXL (lucro) ou comprar 200 SOXS (sem caixa)
    expect(p.pick).toMatchObject({ sym: "SOXL", side: "sell", shares: 400 });
    expect(p.why).toMatch(/lucro/);
  });
  it("sem lucro para realizar: compra a outra ponta se houver caixa livre", () => {
    const l = legs();
    l[0].avg = 40; // SOXL agora no prejuízo
    const st = pairState(l, { equity: EQ, fee: 0.01, base: "cost" });
    const rich = tiltPlan(st, { score: -40, cash: cashState(30_000, EQ, 0.1) });
    expect(rich.pick).toMatchObject({ sym: "SOXS", side: "buy" });
    const poor = tiltPlan(st, { score: -40, cash: cashState(5_000, EQ, 0.1) });
    expect(poor.pick).toMatchObject({ sym: "SOXL", side: "sell" });
    expect(poor.pick.realized).toBeLessThan(0);
  });
  it("dentro da folga não mexe", () => {
    const st = pairState(legs(), { equity: EQ, fee: 0.01, base: "cost" });
    const p = tiltPlan(st, { score: 10, maxTilt: 0.5, band: 0.1 });
    expect(p.ok).toBe(true);
    // mesmo dentro da folga, mostra quanto custaria chegar ao alvo exato (+5%)
    expect(p.options.length).toBeGreaterThan(0);
  });
  it("alvo manual da dupla vence o regime", () => {
    const st = pairState(legs(), { equity: EQ, fee: 0.01, base: "cost" });
    const p = tiltPlan(st, { score: 80, target: -0.3, cash: cashState(0, EQ) });
    expect(p.manual).toBe(true);
    expect(p.want).toBe(-0.3);
    expect(p.pick.side).toBe("sell");
  });
});

describe("painel das duplas", () => {
  it("junta alvo de saída, inclinação, caixa e virada do regime", () => {
    const d = deskState([{ key: "SOXL-SOXS", legs: legs(), goal: 0.005 }], {
      account: EQ,
      cash: 12_000,
      score: -50,
      move: -15,
      cfg: { reserve: 0.1, maxTilt: 0.5, fee: 0.01, base: "cost" },
    });
    const [p] = d.pairs;
    // resultado desde o médio: +5.000 − 5.000 = 0 → alvo de 0,5% não batido
    expect(p.exit.hit).toBe(false);
    expect(p.tilt.pick.side).toBe("sell");
    expect(d.money).toMatchObject({ want: 10_000, free: 2_000 });
    expect(d.turning).toBe(0); // dupla neutra: andar 15 pontos para baixa não é "contra" a inclinação
    // fotografia: 90.000 comprado × 90.000 vendido no ativo-base = 50% / 50%
    expect(p.mix).toMatchObject({ longPct: 0.5, shortPct: 0.5 });
    expect(d.total).toMatchObject({ long: 90000, short: 90000, net: 0, tilt: 0 });
  });
});

describe("preços de alvo e de trava da dupla", async () => {
  const { exitLevels, guardLevels } = await import("../assets/pair-desk.js");
  // dupla inclinada para alta: 1.000 SOXL a 30 (médio 25) × 300 SOXS a 60 (médio 70); sem custo para a conta fechar
  const st = pairState(
    [
      { sym: "SOXL", qty: 1000, avg: 25, price: 30, lev: 3 },
      { sym: "SOXS", qty: 300, avg: 70, price: 60, lev: -3 },
    ],
    { equity: EQ, fee: 0, base: "cost" },
  );
  it("resolve o movimento do ativo-base e o preço de cada ponta", () => {
    // agora: +5.000 − 3.000 = +2.000; B = 30.000×3 − 18.000×3 = 36.000 por 1 de movimento
    const t = exitLevels(st, 5600, 0);
    expect(t.now).toBeCloseTo(2000);
    expect(t.u).toBeCloseTo(0.1); // 3.600 a mais ÷ 36.000
    const [soxl, soxs] = t.legs;
    expect(soxl.at).toBeCloseTo(39); // 30 × (1 + 0,3)
    expect(soxl.order).toBe("limit");
    expect(soxs.at).toBeCloseTo(42); // 60 × (1 − 0,3)
    expect(soxs.order).toBe("stop");
  });
  it("trava de metade do alvo: preços abaixo do de agora, armada só se o par já ganha mais que ela", () => {
    const g = guardLevels(st, { goalUsd: 3000, lock: 0.5, fee: 0 });
    expect(g.lockUsd).toBe(1500);
    expect(g.armed).toBe(true); // ganha 2.000 > 1.500
    expect(g.guard.legs[0].order).toBe("stop"); // SOXL caindo até o preço da trava
    expect(g.guard.legs[0].at).toBeLessThan(30);
    expect(guardLevels(st, { goalUsd: 6000, lock: 0.5, fee: 0 }).armed).toBe(false); // trava de 3.000 > 2.000
  });
  it("dupla neutra: preço não muda o resultado", () => {
    const flat = pairState(legs(), { equity: EQ, fee: 0, base: "cost" });
    expect(exitLevels(flat, 1000, 0).flat).toBe(true);
  });
});
