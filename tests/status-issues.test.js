// Contador âmbar de problemas de rotina (assets/status-issues.js), U3 do plano de otimização.
import { describe, expect, it } from "vitest";
import { routineIssues, sealLabel } from "../assets/status-issues.js";

describe("routineIssues", () => {
  it("junta defasados, poucos atrasados e sem cotação, sem contar o mesmo ativo duas vezes", () => {
    const r = routineIssues({
      staleCodes: ["EWW", "BWX"],
      late: [{ sym: "EWW", lagMin: 20 }],
      liveCount: 300,
      missing: ["XYZ"],
    });
    expect(r.count).toBe(3);
    expect(r.text).toMatch(/defasado.*EWW, BWX/);
    expect(r.text).toMatch(/EWW \(20 min\)/);
    expect(r.text).toMatch(/Sem cotação ao vivo: XYZ/);
  });
  it("atraso da MAIORIA não é rotina (fica na faixa)", () => {
    const late = Array.from({ length: 6 }, (_, i) => ({ sym: `S${i}`, lagMin: 15 }));
    expect(routineIssues({ late, liveCount: 10 }).count).toBe(0);
  });
  it("nada a mostrar", () => {
    expect(routineIssues()).toEqual({ count: 0, text: "" });
  });
});

describe("sealLabel", () => {
  const ok = { level: "ok", label: "Fechamento" };
  it("fora do pregão mostra a sessão, não 'Fechamento'", () => {
    expect(sealLabel(ok, "pre", { mode: "off", live: true })).toBe("Pré-mercado · ao vivo");
    expect(sealLabel(ok, "post", { mode: "on", live: true })).toBe("Pós-mercado");
    expect(sealLabel(ok, "closed", { mode: "off", live: true })).toBe("Mercado fechado");
  });
  it("no pregão e com problema mantém o rótulo do frescor", () => {
    expect(sealLabel({ level: "ok", label: "Ao vivo" }, "open")).toBe("Ao vivo");
    expect(sealLabel({ level: "bad", label: "Defasado" }, "pre")).toBe("Defasado");
    expect(sealLabel(null, "pre")).toBe("");
  });
});
