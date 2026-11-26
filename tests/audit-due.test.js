import { describe, expect, it } from "vitest";
import { AUDIT_EVERY, auditDue } from "../assets/checks-center.js";

describe("verificação no caminho lento (Fase 3)", () => {
  it("1ª vez, depois de AUDIT_EVERY e sempre na aba Verificação", () => {
    expect(auditDue(undefined, 0, "dash")).toBe(true);
    expect(auditDue(1000, 1000 + AUDIT_EVERY - 1, "dash")).toBe(false);
    expect(auditDue(1000, 1000 + AUDIT_EVERY, "dash")).toBe(true);
    expect(auditDue(1000, 1001, "checks")).toBe(true);
  });
});
