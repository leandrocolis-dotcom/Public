import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { flowSummary, flowPanelHtml, flowBarItem } from "../assets/flow-summary.js";

const flow = JSON.parse(readFileSync(new URL("./fixtures/flow.json", import.meta.url)));

describe("resumo do fluxo na Visão geral", () => {
  it("sem dados devolve null e o quadro avisa", () => {
    expect(flowSummary(null)).toBeNull();
    expect(flowSummary({ dates: [], close: {} })).toBeNull();
    expect(flowPanelHtml(null)).toContain("indisponível");
    expect(flowBarItem(null)).toBe("");
  });

  it("monta tom, saindo/entrando e listas no horizonte pedido", () => {
    for (const horizon of ["1d", "5d", "1m", "3m"]) {
      const s = flowSummary(flow, { horizon, session: "closed" });
      expect(s).not.toBeNull();
      expect(s.horizon).toBe(horizon);
      expect(["risk_on", "risk_off", "mixed"]).toContain(s.tone.id);
      expect(s.into.every((g) => g.z > 0.25)).toBe(true);
      expect(s.out.every((g) => g.z < -0.25)).toBe(true);
      expect(s.candidates.length).toBeLessThanOrEqual(4);
      expect(s.weak.every((r) => r.z <= -1)).toBe(true);
      const html = flowPanelHtml(s);
      expect(html).toMatch(/^<section class="dp dp-flow">/);
      expect(html).toContain(`data-fh="${horizon}"`);
      expect(flowBarItem(s)).toContain('data-tab="flow"');
    }
  });

  it("horizonte desconhecido cai no 1D", () => {
    expect(flowSummary(flow, { horizon: "xx" }).horizon).toBe("1d");
  });
});

describe("Fluxo: blocos recolhidos por padrão no celular (Fase 5.6)", () => {
  it("celular abre só Entrando e saindo e a rotação; desktop abre tudo menos a tabela", async () => {
    const { flowFoldDefault } = await import("../assets/flow-view.js");
    expect(flowFoldDefault("off.head", true)).toBe(true);
    expect(flowFoldDefault("on.rot", true)).toBe(true);
    expect(flowFoldDefault("off.heat", true)).toBe(false);
    expect(flowFoldDefault("off.names", true)).toBe(false);
    expect(flowFoldDefault("off.heat", false)).toBe(true);
    expect(flowFoldDefault("off.table", false)).toBe(false);
  });
});
