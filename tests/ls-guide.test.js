// Long & Short: o tour aponta para blocos que existem na tela e o exemplo gera exatamente o que os textos dizem.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MANUAL, TOUR, demoInput } from "../assets/ls-guide.js";
import { computeLs } from "../assets/ls-engine.js";
import { evaluateAlerts } from "../assets/ls-alerts.js";

describe("tour guiado", () => {
  it("cada passo aponta para uma âncora data-tour que a tela desenha", () => {
    const src = readFileSync(new URL("../assets/ls-view.js", import.meta.url), "utf8");
    const anchors = new Set([...src.matchAll(/T\("([a-z0-9]+)"\)/g)].map((m) => m[1]));
    for (const s of TOUR) expect(anchors.has(s.anchor), s.anchor).toBe(true);
    expect(TOUR).toHaveLength(11);
    for (const s of TOUR) expect(s.title && s.text && s.example).toBeTruthy();
  });
  it("o exemplo produz o que o tour descreve: VENDER 92 SQQQ, subir stop a 30,36 e aumento bloqueado", () => {
    const input = demoInput();
    const out = computeLs(input);
    const first = out.orders.find((o) => !o.blocked);
    expect(first).toMatchObject({
      side: "VENDER",
      qty: 92,
      sym: "SQQQ",
      reason: "P3",
      limit: 19.7,
    });
    expect(out.stopMoves[0]).toMatchObject({ sym: "SOXL", to: 30.36 });
    const blk = out.orders.find((o) => o.blocked);
    expect(blk).toMatchObject({ sym: "SOXL", purpose: "AUMENTAR", qty: 46 });
    expect(blk.blockers[0].why).toBe("aguarda reduzir a perdedora");
    expect(out.pairs[0].scenario).toBe(1);
    expect(out.legs.map((l) => l.pnlR)).toEqual([1.48, -0.66]);
    expect(evaluateAlerts(input, out).some((a) => a.id === "DEC-01")).toBe(true);
  });
  it("manual tem rotina, cores e regras", () => {
    expect(MANUAL.routine).toHaveLength(4);
    expect(MANUAL.colors.length).toBeGreaterThanOrEqual(4);
    expect(MANUAL.rules.length).toBeGreaterThanOrEqual(4);
  });
});
