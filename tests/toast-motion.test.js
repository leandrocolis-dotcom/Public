import { describe, expect, it } from "vitest";
import { swipeFling } from "../assets/widgets.js";

describe("aviso: deslizar para fechar", () => {
  it("toque ou arrasto curto e lento volta ao centro", () => {
    expect(swipeFling(3, 2, 100)).toBeNull();
    expect(swipeFling(40, 10, 400, 360)).toBeNull();
  });
  it("sai para o lado do gesto em qualquer direção", () => {
    for (const [dx, dy] of [
      [130, 0],
      [-130, 0],
      [0, 90],
      [0, -90],
      [70, 70],
    ]) {
      const f = swipeFling(dx, dy, 300, 360);
      expect(f).not.toBeNull();
      expect(Math.sign(f.x)).toBe(Math.sign(dx));
      expect(Math.sign(f.y)).toBe(Math.sign(dy));
      expect(Math.hypot(f.x, f.y)).toBeGreaterThan(600);
    }
  });
  it("gesto rápido e curto (≥ 0,5 px/ms) também fecha", () => {
    expect(swipeFling(40, 0, 50, 360)).not.toBeNull();
  });
});
