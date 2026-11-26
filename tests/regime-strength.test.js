import { describe, expect, it } from "vitest";
import { levelOf, regimeStrength, trendOf, volScore } from "../assets/regime-strength.js";
import { regime } from "../assets/dash.js";

// série com tendência e um pouco de ruído (determinístico)
const walk = (n, drift) =>
  Array.from({ length: n }, (_, i) => 100 * (1 + drift) ** i * (1 + 0.004 * Math.sin(i * 1.7)));

describe("intensidade do regime", () => {
  it("escala de 5 níveis", () => {
    expect(levelOf(85).label).toBe("Muito forte");
    expect(levelOf(60).label).toBe("Forte");
    expect(levelOf(45).label).toBe("Moderada");
    expect(levelOf(20).label).toBe("Fraca");
    expect(levelOf(3).label).toBe("Muito fraca");
  });
  it("direcionais: alta = +1, queda = −1", () => {
    expect(trendOf(walk(120, 0.003))).toBeCloseTo(1, 3);
    expect(trendOf(walk(120, -0.003))).toBeCloseTo(-1, 3);
    expect(trendOf([1, 2, 3])).toBeNull();
  });
  it("VIX baixo com curva normal soma; invertido tira", () => {
    expect(volScore(12, 0.85)).toBeGreaterThan(0.7);
    expect(volScore(30, 1.1)).toBeLessThan(-0.8);
    // suave: VIX 36 pesa mais que VIX 30 (antes os dois travavam em −1)
    expect(volScore(36, null)).toBeLessThan(volScore(30, null));
  });
  it("nota contínua: variação pequena das razões mexe a nota sem arredondar", () => {
    const base = walk(200, 0.001);
    const mk = (c) => Array.from({ length: 6 }, () => ({ s: base, c }));
    const a = regimeStrength(mk(-0.004), 1, { verdict: "Misto", vix: 30, term: 1 });
    const b = regimeStrength(mk(-0.0045), 1, { verdict: "Misto", vix: 30, term: 1 });
    expect(b.raw).toBeLessThan(a.raw);
    expect(Math.abs(a.raw - a.score)).toBeLessThanOrEqual(0.5);
  });
  it("tudo subindo forte com VIX calmo = risk-on forte (entrar)", () => {
    const items = Array.from({ length: 6 }, () => {
      const s = walk(200, 0.003);
      return { s, c: s.at(-1) / s.at(-6) - 1 };
    });
    const st = regimeStrength(items, 5, { verdict: "Risk-on", vix: 13, term: 0.86 });
    expect(st.score).toBeGreaterThanOrEqual(60);
    expect(["Forte", "Muito forte"]).toContain(st.level);
    expect(st.hint).toMatch(/entrada/);
  });
  it("risk-on de um dia contra a tendência de baixa = fraca (esperar)", () => {
    const items = Array.from({ length: 6 }, () => ({ s: walk(200, -0.003), c: 0.0005 }));
    const st = regimeStrength(items, 1, { verdict: "Risk-on", vix: 24, term: 0.98 });
    expect(st.against).toBe(true);
    expect(st.intensity).toBeLessThan(20);
    expect(st.hint).toMatch(/esperar/);
  });
  it("regime() do Offshore traz a intensidade", () => {
    const s = walk(200, 0.002);
    const flat = Array(200).fill(100);
    const r = regime(
      {
        SPY: s,
        TLT: flat,
        HYG: s,
        IEF: flat,
        "^VIX": Array(200).fill(14),
        "^VIX3M": Array(200).fill(16),
      },
      1,
    );
    expect(r.strength.intensity).toBeGreaterThan(0);
    expect(r.strength.level).toBeTruthy();
  });
});

describe("pêndulo em 3 módulos: Bolsas por região, Classes de ativos, VIX e vol", () => {
  it("região e grupo pesam igual dentro do módulo; razão forte contra o contexto vira fora do padrão", async () => {
    const { regime } = await import("../assets/dash.js");
    const n = 120;
    // série com variação diária pequena (±0,2%) e um último dia escolhido
    const wig = (last) => {
      const s = Array.from({ length: n }, (_, i) => 100 * (1 + 0.002 * Math.sin(i)));
      s.push(s.at(-1) * (1 + last));
      return s;
    };
    const flat = Array(n + 1).fill(100);
    const close = {
      // EUA em queda; Japão dispara contra o contexto
      SPY: wig(-0.01), TLT: flat, HYG: wig(-0.01), IEF: flat, XLY: wig(-0.01), XLP: flat,
      IWM: wig(-0.02), RSP: wig(-0.02), "^N225": wig(0.03), EEM: wig(-0.01),
      // câmbio: AUD/JPY em queda, dólar subindo (invertido = queda)
      "AUDJPY=X": wig(-0.01), "DX-Y.NYB": wig(0.01),
      "^VIX": wig(0.1), "^VIX3M": Array(n + 1).fill(30),
    }; // prettier-ignore
    const r = regime(close, 1);
    expect(r.blocks.map((b) => b.id)).toEqual(["eq", "cls", "vol"]);
    expect(r.blocks[0].groups.map((g) => g.id)).toEqual(["us", "asia", "em"]);
    expect(r.blocks[1].groups.map((g) => g.id)).toEqual(["bonds", "credit", "equity", "fx"]);
    const w = Object.fromEntries(r.items.map((x) => [x.label, x.w]));
    expect(w["Japão (Nikkei 225)"]).toBeCloseTo(1 / 6); // sozinho na Ásia: 1/2 módulo × 1/3 região
    expect(w["S&P 500"]).toBeCloseTo(1 / 12); // EUA com 2 índices
    expect(w["Emergentes (EEM)"]).toBeCloseTo(1 / 6);
    expect(w["Ações × Treasuries"]).toBeCloseTo(1 / 8); // 1/2 módulo × 1/4 grupo
    expect(w["Cíclico × defensivo"]).toBeCloseTo(1 / 24);
    expect(r.items.reduce((t, x) => t + x.w, 0)).toBeCloseTo(1);
    expect(r.items.find((x) => x.a === "DX-Y.NYB").c).toBeLessThan(0);
    expect(r.strength.score).toBeLessThan(0);
    expect(r.blocks[2].score).toBeLessThan(0); // VIX subindo e acima de 20
    expect(r.outliers.map((o) => o.label)).toContain("Japão (Nikkei 225)");
    // as parcelas da nota (módulos + vol) somam a nota
    const { scoreParts } = await import("../assets/home-view.js");
    const parts = scoreParts(r.strength);
    expect(parts.map((x) => x.key)).toEqual(["eq", "cls", "vol"]);
    expect(parts.reduce((t, x) => t + x.pts, 0)).toBe(r.strength.score);
  });
});

describe("bolsas de fora na prévia: desde o fechamento local anterior", () => {
  it("Tóquio −5% e futuro +2,7% depois do fechamento contam como queda de −2,5%", async () => {
    const { localMove } = await import("../assets/dash.js");
    const now = Date.parse("2026-11-20T12:20:00Z");
    const nk = { p: 57976.58, pc: 59444.21, regP: 56436.65, offSrc: "fut", t: now / 1000 - 60 };
    expect(localMove(nk, now)).toBeCloseTo(57976.58 / 59444.21 - 1, 6);
    expect(localMove({ ...nk, t: now / 1000 - 20 * 3600 }, now)).toBeNull(); // cotação velha
    expect(localMove({ p: 1 }, now)).toBeNull();
  });
});
