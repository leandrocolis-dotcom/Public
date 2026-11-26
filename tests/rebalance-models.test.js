import { describe, expect, it } from "vitest";
import { addMonths, modelTargets } from "../assets/rebalance-models.js";
import { applyResult, rebalance } from "../assets/rebalance.js";

// atual: VOO 20 × 500 = 10.000 (76,9%) · GLD 15 × 200 = 3.000 (23,1%) · total 13.000
const current = { VOO: { qty: 20, price: 500 }, GLD: { qty: 15, price: 200 } };
const prices = { VOO: 500, GLD: 200, BIL: 100 };
const targets = [{ sym: "VOO", w: 70 }, { sym: "GLD", w: 30 }]; // prettier-ignore
const w = (r, s) => r.targets.find((t) => t.sym === s)?.w ?? 0;
const run = (args) => {
  const plan = modelTargets({ targets, current, prices, ...args });
  return { plan, res: rebalance({ total: args.total, targets: plan.targets, current, prices }) };
};
const row = (res, s) => res.rows.find((r) => r.sym === s);

describe("modelos de rebalanceamento", () => {
  it("mix constante: volta aos pesos-alvo", () => {
    const { res } = run({ model: "constant" });
    expect(row(res, "VOO").diff).toBeCloseTo(-900);
    expect(row(res, "GLD").diff).toBeCloseTo(900);
  });
  it("bandas: dentro da tolerância não negocia; fora, rebalanceia", () => {
    const dentro = run({ model: "bands", params: { band: 10, rel: 0 } });
    expect(dentro.plan.trade).toBe(false);
    expect(dentro.res.rows.every((r) => r.action === "hold")).toBe(true);
    const fora = run({ model: "bands", params: { band: 5, rel: 0 } });
    expect(fora.plan.trade).toBe(true);
    expect(row(fora.res, "GLD").diff).toBeCloseTo(900);
    // regra relativa: GLD 23,1% vs 30% = 23% do peso → fora com rel 20
    expect(run({ model: "bands", params: { band: 10, rel: 20 } }).plan.trade).toBe(true);
  });
  it("bandas até a borda: leva só até alvo − banda", () => {
    const { res } = run({ model: "bands", params: { band: 5, rel: 0, bandMode: "edge" } });
    // VOO 76,9% → borda 75% · GLD 23,1% → borda 25%
    expect(row(res, "VOO").targetValue).toBeCloseTo(9750);
    expect(row(res, "GLD").targetValue).toBeCloseTo(3250);
  });
  it("calendário: espera a próxima data", () => {
    const lastAt = "2026-08-01T12:00:00.000Z";
    const cedo = run({
      model: "calendar",
      params: { freq: 3 },
      lastAt,
      now: new Date("2026-09-15"),
    });
    expect(cedo.plan.trade).toBe(false);
    const hora = run({
      model: "calendar",
      params: { freq: 3 },
      lastAt,
      now: new Date("2026-11-02"),
    });
    expect(row(hora.res, "GLD").action).toBe("buy");
    expect(addMonths("2026-01-31T12:00:00Z", 1).getDate()).toBe(28);
  });
  it("só aportes: compra o que falta, nunca vende", () => {
    const { res } = run({ model: "contrib", total: 14000 });
    // alvo a 14.000: VOO 9.800 (sobra) · GLD 4.200 (falta 1.200) → aporte de 1.000 todo em GLD
    expect(row(res, "VOO").action).toBe("hold");
    expect(row(res, "GLD").diff).toBeCloseTo(1000);
    expect(res.sell).toBe(0);
    // aporte maior que a falta: o excedente segue os pesos
    const big = run({ model: "contrib", total: 20000 }).res;
    expect(big.rows.every((r) => r.action !== "sell")).toBe(true);
    expect(big.buy).toBeCloseTo(7000);
  });
  it("CPPI: exposição = multiplicador × colchão, resto no ativo seguro", () => {
    const { plan, res } = run({ model: "cppi", params: { floor: 10000, mult: 3, safe: "BIL" } });
    // colchão 3.000 × 3 = 9.000 em risco (VOO 70/GLD 30), 4.000 em BIL
    expect(w(plan, "VOO") + w(plan, "GLD")).toBeCloseTo((9000 / 13000) * 100);
    expect(row(res, "BIL").targetValue).toBeCloseTo(4000);
    expect(row(res, "VOO").targetValue).toBeCloseTo(6300);
    const piso = run({ model: "cppi", params: { floor: 14000, safe: "BIL" } });
    expect(piso.plan.warn).toMatch(/piso/);
    expect(row(piso.res, "BIL").targetValue).toBeCloseTo(13000);
  });
  it("TIPP: piso acompanha o pico", () => {
    const { plan } = run({ model: "tipp", params: { lock: 90, peak: 15000, mult: 2 } });
    expect(plan.floor).toBeCloseTo(13500);
    expect(plan.targets.every((t) => t.w === 0)).toBe(true); // abaixo do piso, sem ativo seguro = caixa
  });
  it("aplicar: carteira vai às quantidades finais e entra no histórico", () => {
    const c = { total: "", rows: targets, current: { ...current }, model: "cppi", mp: { floor: "", floorPct: 80, mult: 3, maxExp: 100, safe: "BIL" }, hist: [] }; // prettier-ignore
    const plan = modelTargets({
      model: c.model,
      params: c.mp,
      targets,
      current: c.current,
      prices,
    });
    applyResult(c, rebalance({ targets: plan.targets, current: c.current, prices }), plan, "2026-10-08T00:00:00Z"); // prettier-ignore
    expect(c.mp.floor).toBe(10400);
    expect(c.current.BIL.qty).toBeCloseTo((13000 - 3 * 2600) / 100);
    expect(c.hist[0].prev).toEqual(current);
    expect(c.hist[0].trades.length).toBe(3);
  });
});
