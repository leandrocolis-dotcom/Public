import { describe, expect, it } from "vitest";
import { HAND, PHYS, REACH, angleTo, atRest, step } from "../assets/pend-touch.js";

describe("pêndulo que aceita a mão (Repouso Perturbado)", () => {
  const run = (s, target, secs) => {
    let x = s;
    let t = 0;
    let settledAt = null;
    for (let i = 0; i < secs * 240; i++) {
      x = step(x, target, 1 / 240);
      t += 1 / 240;
      if (settledAt == null && atRest(x, target)) settledAt = t;
      if (settledAt != null && !atRest(x, target)) settledAt = null;
    }
    return { x, settledAt };
  };

  it("solto, oscila amortecido e assenta no alvo novo (não no antigo)", () => {
    const { x, settledAt } = run({ th: 15, om: 0 }, -11, 6);
    expect(x.th).toBeCloseTo(-11, 1);
    expect(settledAt).toBeGreaterThan(1.5);
    expect(settledAt).toBeLessThan(4.5);
  });

  it("passa do ponto uma vez e volta (ζ = 0,25): sobressinal perto de 44%", () => {
    let s = { th: 0, om: 0 };
    let min = 0;
    for (let i = 0; i < 240 * 2; i++) {
      s = step(s, -10, 1 / 240);
      min = Math.min(min, s.th);
    }
    const zeta = PHYS.c / (2 * Math.sqrt(PHYS.k));
    const over = Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta ** 2));
    expect(zeta).toBeCloseTo(0.25, 2);
    expect(-min - 10).toBeCloseTo(10 * over, 0); // segunda rota: fórmula do sobressinal
  });

  it("ponteiro → ângulo do peso (pivô em 120,14; esquerda = positivo), com limite", () => {
    expect(angleTo(120, 130)).toBeCloseTo(0, 9);
    expect(angleTo(60, 74)).toBeCloseTo(45 > REACH ? REACH : 45, 6);
    expect(angleTo(200, 94)).toBeCloseTo(-REACH, 6);
    expect(angleTo(100, 130)).toBeGreaterThan(0);
  });

  it("na mão a mola é firme: acompanha o ponteiro com pouco rebote (ζ ≈ 0,7)", () => {
    const zeta = HAND.c / (2 * Math.sqrt(HAND.k));
    expect(zeta).toBeGreaterThan(0.65);
    let s = { th: 0, om: 0 };
    let min = 0;
    for (let i = 0; i < 240; i++) {
      s = step(s, -30, 1 / 240, HAND);
      min = Math.min(min, s.th);
    }
    expect(-min - 30).toBeLessThan(2); // passa menos de 2° do ponteiro
    expect(s.th).toBeCloseTo(-30, 0);
  });
});
