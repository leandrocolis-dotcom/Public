import { describe, expect, it } from "vitest";
import { marketClockText } from "../assets/sessions.js";
import { agendaNext, portfolioBrief, pulseTiles, sessionLine } from "../assets/home-view.js";

// 19/11/2026 (quinta) — horários de Nova York (EST, UTC−5)
const ny = (hh, mm = 0) => Date.UTC(2026, 10, 19, hh + 5, mm);

describe("Início: sessão de NY", () => {
  it("pregão, pré, pós e fechado", () => {
    expect(sessionLine(ny(11)).key).toBe("open");
    expect(sessionLine(ny(11)).hint).toBe("fecha em 5h");
    expect(sessionLine(ny(8)).hint).toBe("abre em 1h30");
    expect(sessionLine(ny(17)).key).toBe("post");
    expect(sessionLine(ny(22)).key).toBe("closed");
    expect(sessionLine(Date.UTC(2026, 10, 21, 15)).hint).toBe("fim de semana");
  });
});

describe("Início: pulso do mercado", () => {
  it("variação = p / pc; juro em bps; ignora o que não tem cotação", () => {
    const t = pulseTiles({ SPY: { p: 101, pc: 100 }, "^TNX": { p: 4.3, pc: 4.25 }, QQQ: { p: 0 } });
    expect(t.map((x) => x.sym)).toEqual(["SPY", "^TNX"]);
    expect(t[0].c).toBeCloseTo(0.01);
    expect(t[1].bps).toBeCloseTo(5);
  });
});

describe("Início: carteira", () => {
  it("contra o SPY, maiores altas e quedas, fatias", () => {
    const rows = [
      { sym: "A", weight: 0.6, dayPLPct: 0.02, dayPL: 12 },
      { sym: "B", weight: 0.4, dayPLPct: -0.01, dayPL: -4 },
    ];
    const pb = portfolioBrief({ rows, total: 1000, dayPL: 8, dayPLPct: 0.008, netPL: 50, netPLPct: 0.05 }, { SPY: { p: 100.5, pc: 100 } }); // prettier-ignore
    expect(pb.vsSpy).toBeCloseTo(0.003);
    expect(pb.best.map((r) => r.sym)).toEqual(["A"]);
    expect(pb.worst.map((r) => r.sym)).toEqual(["B"]);
    expect(pb.slices).toHaveLength(2);
    expect(portfolioBrief(null)).toBeNull();
  });
});

describe("Início: agenda", () => {
  const now = ny(9) / 1000;
  const cal = {
    events: [
      { t: now + 3600, cc: "USD", impact: "high", title: "CPI", titlePT: "Inflação (CPI)" },
      { t: now + 3600, cc: "EUR", impact: "medium", title: "x" },
      { t: now + 3 * 86400, cc: "USD", impact: "high", title: "longe" },
    ],
    corporate: [
      { sym: "NVDA", kind: "earnings", t: now + 86400 },
      { sym: "AAPL", kind: "earnings", t: now + 86400 },
    ],
  };
  it("agenda: alto impacto em 48 h e balanço só de posição", () => {
    const a = agendaNext(cal, ["NVDA"], now);
    expect(a.map((e) => e.title)).toEqual(["Inflação (CPI)", "Balanço NVDA"]);
  });
});

describe("Início: desenho do pêndulo, rosca e mini-gráfico", async () => {
  const { pendulumReading, sparkPath, donutArcs, regimeWord, PEND_MAX } =
    await import("../assets/home-view.js");
  const pendulumAngle = (rg) => pendulumReading(rg)?.angle;
  it("ângulo do pêndulo: sem nota, pela fração de razões em alta", () => {
    expect(pendulumAngle({ on: 9, n: 9, verdict: "Risk-on" })).toBe(PEND_MAX);
    expect(pendulumAngle({ on: 0, n: 9, verdict: "Risk-off" })).toBe(-PEND_MAX);
    expect(pendulumAngle({ on: 5, n: 10, verdict: "Misto" })).toBe(0);
    expect(pendulumAngle(null) ?? null).toBeNull();
  });
  it("pêndulo pela nota contínua: 5 faixas, profundidade e prévia do pré/pós", () => {
    const rg = (score, extra = {}) => ({ on: 5, n: 10, verdict: "Misto", strength: { score }, ...extra }); // prettier-ignore
    expect(pendulumReading(rg(-85)).zone.key).toBe("dfx");
    expect(pendulumReading(rg(-40)).zone.key).toBe("df");
    expect(pendulumReading(rg(0)).zone.key).toBe("nt");
    expect(pendulumReading(rg(20)).zone.key).toBe("rk");
    expect(pendulumReading(rg(100)).zone.key).toBe("rkx");
    expect(pendulumReading(rg(34)).depth).toBe("14 pontos da fronteira com o neutro");
    expect(pendulumReading(rg(-45)).depth).toBe("15 pontos da fronteira com a defesa forte");
    expect(pendulumReading(rg(-21)).depth).toBe("1 ponto da fronteira com o neutro");
    expect(pendulumReading(rg(-72)).depth).toBe("12 pontos além da fronteira da defesa forte");
    expect(pendulumReading(rg(12)).depth).toMatch(/pende para o risco/);
    expect(pendulumReading(rg(50)).angle).toBe(19);
    expect(pendulumReading(rg(30, { live: 8, n: 8 }), "pre").session).toBe("Prévia do pré-mercado · 8 razões com preço do pré-mercado"); // prettier-ignore
    expect(pendulumReading(rg(30, { live: 7 }), "post").session).toMatch(/^Prévia do pós-mercado/);
    expect(pendulumReading(rg(30), "open").session).toBe("Ao vivo no pregão");
    // estresse não força a nota: a agulha fica na nota real e o VIX invertido vira alerta
    const st = pendulumReading(rg(-38, { verdict: "Estresse (VIX invertido)" }));
    expect([st.score, st.zone.key]).toEqual([-38, "df"]);
    expect(st.warn).toMatch(/VIX invertido/);
    // repique amplo com a curva ainda invertida: nota no risco, alerta de alívio sob estresse
    const rel = pendulumReading(
      rg(62, { verdict: "Risk-on (VIX ainda invertido)", inverted: true }),
    );
    expect(rel.score).toBe(62);
    expect(rel.stress).toBe(true);
    expect(rel.warn).toMatch(/^Repique com o VIX ainda invertido/);
  });
  it("mini-gráfico ocupa a caixa e ignora pontos inválidos", () => {
    expect(sparkPath([1, null, 2], 100, 28)).toBe("M0.0 27.0L100.0 1.0");
    expect(sparkPath([1])).toBeNull();
  });
  it("rosca: fatias somam o perímetro", () => {
    const a = donutArcs([{ w: 0.25 }, { w: 0.75 }], 10);
    expect(a[1].off).toBeCloseTo(a[0].len);
    expect(a[0].len + a[1].len).toBeCloseTo(2 * Math.PI * 10);
  });
  it("regime em palavras", () => {
    expect(regimeWord({ verdict: "Risk-on" })[0]).toBe("favorável ao risco");
    expect(regimeWord({ verdict: "Misto" })[0]).toBe("dividido");
    expect(regimeWord({ on: 5, n: 10, verdict: "Misto", strength: { score: 70 } })[0]).toBe("com apetite forte por risco"); // prettier-ignore
    expect(regimeWord(null)).toBeNull();
    // estresse (VIX invertido) só vira a manchete quando a nota confirma; defesa leve não alarma
    const st = (score) => ({
      on: 5,
      n: 10,
      verdict: "Estresse (VIX invertido)",
      strength: { score },
    });
    expect(regimeWord(st(-24))).toEqual(["levemente defensivo", "dn"]);
    expect(regimeWord(st(-50))).toEqual(["defensivo", "dn"]);
    expect(regimeWord(st(-75))).toEqual(["sob estresse", "dn"]);
    expect(regimeWord(st(30))[0]).toBe("levemente favorável ao risco");
  });
});

describe("scoreParts", () => {
  it("parcelas da nota somam a nota mostrada (movimento do dia, tendência e VIX)", async () => {
    const { scoreParts } = await import("../assets/home-view.js");
    const st = { score: -24, parts: { breadth: 0.2, force: 0.157, trend: -0.633, vol: -1 } };
    const p = scoreParts(st);
    expect(p.map((x) => x.key)).toEqual(["move", "trend", "vol"]);
    expect(p.reduce((t, x) => t + x.pts, 0)).toBe(-24);
    expect(scoreParts(null)).toEqual([]);
  });
});

describe("marketClockText", () => {
  const ny = (Y, M, D, h, mi = 0) => Date.UTC(Y, M - 1, D, h + 5, mi); // EST
  it("conta até fechar ou abrir, com feriado, pregão curto e horário de verão", () => {
    expect(marketClockText(ny(2026, 11, 20, 11))).toBe("fecha em 5h00");
    expect(marketClockText(ny(2026, 11, 20, 8))).toBe("abre em 1h30");
    expect(marketClockText(ny(2026, 11, 20, 17))).toBe("abre em 2d 16h30");
    expect(marketClockText(ny(2026, 11, 25, 17))).toBe("abre em 1d 16h30");
    expect(marketClockText(ny(2026, 11, 27, 10))).toBe("fecha em 3h00");
    expect(marketClockText(Date.UTC(2027, 2, 13, 17))).toBe("abre em 1d 20h30");
  });
});

describe("homeSpans / homeBlocks", () => {
  it("blocos pequenos seguidos dividem a linha; os outros ocupam a linha toda", async () => {
    const { homeSpans, homeBlocks } = await import("../assets/home-view.js");
    const b = (id, small = false) => ({ id, small, html: `<section class="x">${id}</section>` });
    expect(homeSpans([b("a"), b("s1", 1), b("s2", 1), b("c")])).toEqual(["12", "7", "5", "12"]);
    expect(homeSpans([b("s1", 1), b("s2", 1), b("s3", 1)])).toEqual(["4", "4", "4e"]);
    expect(homeSpans([b("s1", 1), b("a")])).toEqual(["12", "12"]);
    const html = homeBlocks([b("a"), b("b"), { id: "z", html: "" }], ["b", "a"]);
    expect(html.indexOf('data-dp="b"')).toBeLessThan(html.indexOf('data-dp="a"'));
    expect(html).toContain("data-dp-grip");
    expect(html).not.toContain('data-dp="z"');
  });
});
