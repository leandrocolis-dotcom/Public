import { describe, expect, it } from "vitest";
import { modelVeto } from "../assets/signal-center.js";

const sg = (price, ma200) => ({ kind: "entry", code: "pullback10", ind: { price, ma200 } });

describe("veto do modelo nas entradas", () => {
  it("aprova só com técnica, S&P, macro e crédito a favor", () => {
    expect(modelVeto(sg(110, 100), { bull: true, tilt: 0.4, hy1m: 0.1 })).toEqual([]);
  });
  it("veta e diz o motivo", () => {
    const w = modelVeto(sg(90, 100), { bull: false, tilt: -0.2, hy1m: 0.5 });
    expect(w).toEqual(["preço abaixo da MM200", "S&P abaixo da MM200", "setor desfavorecido no regime macro", "crédito em estresse"]); // prettier-ignore
  });
  it("sem dado macro não veta por macro; saídas nunca são vetadas", () => {
    expect(modelVeto(sg(110, 100), { bull: true })).toEqual([]);
    expect(modelVeto({ kind: "exit", ind: { price: 1, ma200: 2 } }, { bull: false })).toEqual([]);
  });
});
