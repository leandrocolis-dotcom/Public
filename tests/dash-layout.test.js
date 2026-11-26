import { describe, expect, it } from "vitest";
import { applyOrder, panelId } from "../assets/dash-layout.js";

describe("panelId", () => {
  it("vira identificador sem acento", () => {
    expect(panelId("Bolsas Ásia-Pacífico")).toBe("bolsas-asia-pacifico");
    expect(panelId("Crédito e renda fixa")).toBe("credito-e-renda-fixa");
  });
});

describe("applyOrder", () => {
  const items = ["a", "b", "c", "d"].map((id) => ({ id }));
  it("segue a ordem salva", () => {
    expect(applyOrder(items, ["d", "c", "b", "a"]).map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
  it("quadro novo fica na posição padrão e ids velhos são ignorados", () => {
    expect(applyOrder(items, ["c", "x", "a", "d"]).map((x) => x.id)).toEqual(["c", "b", "a", "d"]);
  });
  it("sem ordem salva mantém o padrão", () => {
    expect(applyOrder(items).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("layout por tela", () => {
  it("cada tela guarda a própria ordem e os recolhidos", async () => {
    const mem = new Map();
    globalThis.localStorage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => mem.set(k, v),
    };
    const { layoutPanels } = await import("../assets/dash-layout.js");
    mem.set("localLayout", JSON.stringify({ order: ["b", "a"], min: ["a"] }));
    const items = [
      { id: "a", html: `<section class="dp"><h3>A</h3></section>` },
      { id: "b", html: `<section class="dp"><h3>B</h3></section>` },
    ];
    const local = layoutPanels(items, "localLayout");
    expect(local.indexOf('data-dp="b"')).toBeLessThan(local.indexOf('data-dp="a"'));
    expect(local).toContain('data-dp="a" class="dp dp-folded"');
    const dash = layoutPanels(items);
    expect(dash.indexOf('data-dp="a"')).toBeLessThan(dash.indexOf('data-dp="b"'));
    delete globalThis.localStorage;
  });
});
