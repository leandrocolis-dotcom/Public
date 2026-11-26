import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PEND_WIN, pendWin, viewHome } from "../assets/home-view.js";
import { regime } from "../assets/dash.js";

const flow = JSON.parse(readFileSync(new URL("../data/flow.json", import.meta.url), "utf8"));
const now = Date.UTC(2026, 10, 19, 16); // 11h de NY, pregão

describe("Início: janela do pêndulo", () => {
  it("janela inválida volta ao 1D (regime do dia)", () => {
    expect(pendWin(undefined)).toBe("1d");
    expect(pendWin("6m")).toBe("1d");
    expect(pendWin("3m")).toBe("3m");
    expect(Object.keys(PEND_WIN)).toEqual(["1h", "3h", "5h", "1d", "5d", "1m", "3m"]);
    expect(pendWin("1h")).toBe("1h");
  });

  it("os 300 pregões de flow.json dão nota em todas as janelas", () => {
    for (const h of [1, 5, 21, 63]) {
      const rg = regime(flow.close, h);
      expect(Number.isFinite(rg?.strength?.score)).toBe(true);
    }
  });

  it("cada janela mostra o seletor marcado e a nota da própria janela", () => {
    for (const [k, h] of [
      ["1d", 1],
      ["3m", 63],
    ]) {
      const html = viewHome({ flow, now, pendH: k });
      expect(html).toContain(`data-pend-h="${k}" aria-pressed="true"`);
      const score = regime(flow.close, h).strength.score;
      expect(html).toContain(`${score > 0 ? "+" : score < 0 ? "−" : ""}${Math.abs(score)}</b>`);
    }
    expect(viewHome({ flow, now, pendH: "3m" })).toContain("Últimos 3 meses · fechamentos");
  });

  it("abertura: manchete antes do pêndulo e sem o cartão de longo prazo", () => {
    const html = viewHome({ flow, now, pendH: "1d" });
    expect(html.indexOf("hm-head")).toBeLessThan(html.indexOf("hm-hero-g"));
    expect(html).not.toContain("hm-verdict");
    expect(html).not.toContain("Longo prazo · MM200");
  });
});
