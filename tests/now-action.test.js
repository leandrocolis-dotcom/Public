import { describe, expect, it } from "vitest";
import { DECISION, holdNow, nowAction, priceLadder } from "../assets/decision.js";

const step = (k) => ({ step: DECISION.find((d) => d.key === k), conf: "Média" });
const levels = {
  supports: [{ price: 90 }, { price: 80 }],
  resistances: [{ price: 110 }, { price: 120 }],
};
const lad = (price, tone = "buy", k = null) => priceLadder({ price, levels, atr: 2, tone, step: k ? DECISION.find((d) => d.key === k) : null }); // prettier-ignore
const now = (k, price) => nowAction(step(k), lad(price, DECISION.find((d) => d.key === k).tone, k));

describe("nowAction: vocabulário fechado", () => {
  it("Comprar compra agora, posição inteira, com stop", () => {
    const n = now("buy", 100);
    expect([n.label, n.tone]).toEqual(["Comprar", "buy"]);
    expect(n.note).toMatch(/stop/);
  });
  it("Comprar em partes: metade agora e o resto na zona de compra", () => {
    const n = now("buy-part", 100);
    expect(n.label).toBe("Comprar em partes");
    expect(n.note).toMatch(/metade agora; o resto em 89,00 – 91,00/);
  });
  it("colado na resistência (até 1 ATR) espera o rompimento", () => {
    const n = now("buy", 108.5);
    expect([n.label, n.tone]).toEqual(["Esperar rompimento", "wait"]);
    expect(n.note).toMatch(/acima dela/);
  });
  it("aguardar vira ficar de fora; venda vira não comprar", () => {
    expect(now("wait", 100).label).toBe("Ficar de fora");
    expect(now("sell", 100).label).toBe("Não comprar");
  });
  it("com posição traduz para ampliar / manter / reduzir / vender", () => {
    expect(holdNow(now("buy", 100)).label).toBe("Ampliar");
    expect(holdNow(now("buy", 108.5)).label).toBe("Manter");
    expect(holdNow(now("reduce", 100)).label).toBe("Reduzir");
    expect(holdNow(now("sell", 100)).label).toBe("Vender");
  });
});

describe("levelsHtml: preço da ação de agora", async () => {
  const { levelsHtml } = await import("../assets/desk.js");
  const mk = (k, price) => {
    const ladder = lad(price, DECISION.find((d) => d.key === k).tone, k);
    return { price, dec: { ladder, now: nowAction(step(k), ladder, price) } };
  };
  it("comprar mostra o preço de agora, alvo e stop", () => {
    expect(levelsHtml(mk("buy", 100))).toMatch(/Comprar agora: 100,00.*alvo 110,00/);
  });
  it("em partes mostra o resto na zona", () => {
    expect(levelsHtml(mk("buy-part", 100))).toMatch(/Metade agora: 100,00.*resto em 89,00 – 91,00/);
  });
  it("rompimento mostra o preço de gatilho", () => {
    expect(levelsHtml(mk("buy", 108.5))).toMatch(/Comprar acima de 110,00/);
  });
  it("ficar de fora mostra o range", () => {
    expect(levelsHtml(mk("wait", 100))).toMatch(/Esperar: 91,00 – 110,00/);
  });
});

describe("varredura do mercado (data/market-scan.json)", async () => {
  const { decisionFromScan } = await import("../assets/decision.js");
  const { deskRowScan } = await import("../assets/desk.js");
  const row = { s: "X", n: "X Inc", d: "2026-10-12", p: 100, sc: 0.4, st: "buy", cf: "Média", sub: { tech: [0.5, "Alta"] }, lv: { s: [90, 80], r: [110, 120] }, atr: 2, mt: 0.3 }; // prettier-ignore
  it("refaz a escala e a ação com o preço ao vivo", () => {
    expect(decisionFromScan(row, 100).now.label).toBe("Comprar");
    expect(decisionFromScan(row, 108.5).now.label).toBe("Esperar rompimento");
    expect(decisionFromScan({ ...row, st: "xx" })).toBeNull();
  });
  it("linha da tabela com variação do dia, médio prazo e sinais do fechamento", () => {
    const r = deskRowScan("X", {
      row: { ...row, sig: [["entry", "Recuo"]] },
      quote: { p: 101, pc: 100 },
    });
    expect(r.price).toBe(101);
    expect(r.day).toBeCloseTo(0.01);
    expect(r.mt.label).toBe("médio prazo favorável");
    expect(r.sigs[0].title).toBe("Recuo");
    expect(r.scan).toBe("2026-10-12");
  });
});

describe("escala e ação de agora são a mesma coisa", () => {
  it("a zona onde o preço está tem o mesmo nome da ação mostrada na lista", () => {
    for (const k of ["buy", "buy-part", "wait", "reduce", "sell"])
      for (const p of [85, 89.5, 100, 108.5]) {
        const L = lad(p, DECISION.find((d) => d.key === k).tone, k);
        const n = nowAction(step(k), L);
        expect(L.find((z) => z.here).act).toBe(n.key);
      }
  });
});
