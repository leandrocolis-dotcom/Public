import { describe, it, expect, vi, afterEach } from "vitest";
import { batches, parseGtx, translateItems, ptTitle } from "../assets/translate.js";

afterEach(() => vi.unstubAllGlobals());

describe("tradução", () => {
  it("lê a resposta e agrupa em lotes", () => {
    expect(
      parseGtx([
        [
          ["Olá\n", "Hi\n"],
          ["mundo", "world"],
        ],
      ]),
    ).toBe("Olá\nmundo");
    expect(parseGtx(null)).toBeNull();
    expect(batches(["aaaa", "bbbb", "cc"], 10)).toEqual([[0, 1], [2]]);
  });
  it("traduz manchetes internacionais e mantém o original", async () => {
    vi.stubGlobal("fetch", async (_u, opt) => {
      const q = decodeURIComponent(opt.body.slice(2)).split("\n");
      return new Response(
        JSON.stringify([q.map((l, i) => [`PT:${l}${i < q.length - 1 ? "\n" : ""}`, l])]),
      );
    });
    const out = await translateItems([
      { title: "Oil jumps", d: "Crude rose", region: "int" },
      { title: "Ibovespa sobe", region: "br" },
    ]);
    expect(out[0]).toMatchObject({
      title: "Oil jumps",
      titlePt: "PT:Oil jumps",
      dPt: "PT:Crude rose",
    });
    expect(out[1].titlePt).toBeUndefined();
    expect(ptTitle(out[0])).toBe("PT:Oil jumps");
    expect(ptTitle(out[1])).toBe("Ibovespa sobe");
  });
});

describe("português do Brasil", () => {
  it("troca construções de Portugal", async () => {
    const { ptBR } = await import("../assets/translate.js");
    expect(ptBR("A UE está a adoptar uma posição")).toBe("A UE está adotando uma posição");
    expect(ptBR("As acções estão a subir no sector")).toBe("As ações estão subindo no setor");
    expect(ptBR("O facto actual")).toBe("O fato atual");
  });
});
