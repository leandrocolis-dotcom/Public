import { describe, expect, it } from "vitest";
import { GROUPS, TABS, TAB_INFO, groupOf } from "../assets/state.js";
import { firstSteps } from "../assets/home-view.js";

describe("navegação em seções", () => {
  it("cada aba (menos Configurações e Verificação) está em exatamente uma seção e tem explicação", () => {
    for (const [id] of TABS) {
      if (id === "settings" || id === "checks") {
        expect(groupOf(id)).toBeNull();
        continue;
      }
      expect(GROUPS.filter((g) => g.tabs.includes(id))).toHaveLength(1);
      expect(TAB_INFO[id]).toBeTruthy();
    }
  });
  it("cabe no dock do celular (até 5 seções)", () => expect(GROUPS.length).toBeLessThanOrEqual(5));
});

describe("primeiros passos", () => {
  it("marca o que já foi feito", () => {
    const s = firstSteps({ hasPortfolio: true, pushState: "off", seenSignals: false });
    expect(s.map((x) => x.done)).toEqual([true, false, false]);
  });
});

describe("Gatilhos › Arquivo (telas congeladas)", async () => {
  const { ARCHIVE, GROUPS, TABS, TAB_INFO, visibleTabs } = await import("../assets/state.js");
  const { subNavHtml } = await import("../assets/ui.js");
  const { viewArchive } = await import("../assets/views.js");
  it("toda tela do Arquivo existe e continua numa seção (título, ?tab= e atalhos seguem valendo)", () => {
    for (const id of ARCHIVE) {
      expect(
        TABS.some(([t]) => t === id),
        id,
      ).toBe(true);
      expect(
        GROUPS.some((g) => g.tabs.includes(id)),
        id,
      ).toBe(true);
    }
    expect(ARCHIVE).not.toContain("local"); // monitor do IBOV fica à vista
  });
  it("some das sub-abas, salvo quando está aberta", () => {
    expect(visibleTabs(["dash", "rates", "news"])).toEqual(["dash", "news"]);
    expect(visibleTabs(["dash", "rates"], "rates")).toEqual(["dash", "rates"]);
    expect(subNavHtml(GROUPS, TABS, TAB_INFO, "dash")).not.toContain('data-tab="rates"');
    expect(subNavHtml(GROUPS, TABS, TAB_INFO, "rates")).toContain(
      'data-tab="rates" aria-selected="true"',
    );
    expect(subNavHtml(GROUPS, TABS, TAB_INFO, "sim")).toContain('data-tab="archive"');
    expect(subNavHtml(GROUPS, TABS, TAB_INFO, "sim")).not.toContain('data-tab="mesa"');
  });
  it("a tela do Arquivo leva a cada uma", () => {
    const h = viewArchive();
    for (const id of ARCHIVE) expect(h).toContain(`data-tab="${id}"`);
    expect(h).toContain("Onshore › Macro");
  });
});
