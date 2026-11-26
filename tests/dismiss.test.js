import { beforeAll, describe, expect, it } from "vitest";
import { dismiss, dismissible, isDismissed, noticeKey } from "../assets/dismiss.js";

beforeAll(() => {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
});

describe("avisos fecháveis", () => {
  it("a chave ignora números: mesmo aviso com atraso diferente é o mesmo", () => {
    expect(noticeKey("⏱ 3 ativo(s) com cotação atrasada: VOO (12 min).")).toBe(
      noticeKey("⏱ 5 ativo(s) com cotação atrasada: VOO (31 min)."),
    );
    expect(noticeKey("⏱ atrasada: VOO")).not.toBe(noticeKey("⏱ atrasada: QQQ"));
  });
  it("traz o ✕ e some depois de fechado", () => {
    const inner = "⏱ 2 ativo(s) com cotação atrasada: TESTE-X (12 min).";
    const html = dismissible("b-warn", inner);
    expect(html).toContain('data-dismiss="');
    expect(html).toContain("✕");
    dismiss(noticeKey(inner));
    expect(isDismissed(noticeKey(inner))).toBe(true);
    expect(dismissible("b-warn", inner)).toBe("");
  });
});
