import { describe, expect, it } from "vitest";
import { MESA_DEFAULT, mesaPanels, viewMesa } from "../assets/mesa-view.js";

describe("mesa", () => {
  it("normaliza a escolha salva", () => {
    expect(mesaPanels(null)).toEqual(MESA_DEFAULT);
    expect(mesaPanels(["news", "flow", "entry", "risk", "calendar", "checks"])).toEqual([
      "news",
      "risk",
      "calendar",
      "checks",
    ]);
  });
  it("renderiza cada painel e isola erro", () => {
    const html = viewMesa(["news", "risk"], (id) => {
      if (id === "risk") throw new Error("x");
      return `<p>${id}-ok</p>`;
    });
    expect(html).toContain("news-ok");
    expect(html).toContain("Painel indisponível");
    expect(html).toContain('class="mesa-grid n2"');
  });
});
