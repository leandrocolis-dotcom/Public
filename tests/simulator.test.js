import { describe, expect, it } from "vitest";
import {
  HORIZON,
  MIN_EXPECTED,
  addToDiary,
  classify,
  evalDiary,
  expectedOfRule,
  expectedOfVol,
  groupSummary,
  pnlOf,
  replayTicker,
  rowTriggers,
  summarize,
} from "../assets/simulator.js";

function bars(n = 420, drift = 0.08) {
  const c = Array.from({ length: n }, (_, i) => 100 + i * drift + 4 * Math.sin(i / 5));
  const dates = c.map((_, i) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)); // prettier-ignore
  return {
    c,
    o: c,
    h: c.map((x) => x + 0.6),
    l: c.map((x) => x - 0.6),
    v: c.map(() => 1e6),
    dates,
  };
}

describe("classificação Atingiu / Parcial / Não atingiu", () => {
  it("compra: atinge com o esperado, parcial abaixo, não atinge contra", () => {
    expect(classify({ dir: 1, ret: 0.02, expected: 0.01 })).toBe("hit");
    expect(classify({ dir: 1, ret: 0.005, expected: 0.01 })).toBe("partial");
    expect(classify({ dir: 1, ret: -0.01, expected: 0.01 })).toBe("miss");
  });
  it("reduzir: a queda é o acerto", () => {
    expect(classify({ dir: -1, ret: -0.02, expected: 0.01 })).toBe("hit");
    expect(classify({ dir: -1, ret: 0.01, expected: 0.01 })).toBe("miss");
  });
  it("aguardar: ruim só se a alta passou de 1 oscilação", () => {
    expect(classify({ dir: 0, ret: -0.05, vol5: 0.03 })).toBe("hit");
    expect(classify({ dir: 0, ret: 0.02, vol5: 0.03 })).toBe("partial");
    expect(classify({ dir: 0, ret: 0.05, vol5: 0.03 })).toBe("miss");
  });
  it("sem retorno ainda: em andamento", () => {
    expect(classify({ dir: 1, ret: null, expected: 0.01 })).toBe("open");
  });
});

describe("esperado e resultado simulado", () => {
  it("regra usa a média histórica na direção, com piso", () => {
    const stats = { rules: { dip: { avgFwd: 0.008 }, stretched: { avgFwd: 0.001 } } };
    expect(expectedOfRule(stats, "dip", 1)).toBeCloseTo(0.008);
    expect(expectedOfRule(stats, "stretched", -1)).toBe(MIN_EXPECTED);
    expect(expectedOfRule(null, "x", 1)).toBe(MIN_EXPECTED);
    expect(expectedOfVol(0.04)).toBeCloseTo(0.01);
  });
  it("US$ 1.000: compra ganha a alta, redução ganha a queda, aguardar não opera", () => {
    expect(pnlOf(1, 0.02)).toBeCloseTo(20);
    expect(pnlOf(-1, -0.02)).toBeCloseTo(20);
    expect(pnlOf(0, 0.05)).toBe(0);
  });
});

describe("retroativo", () => {
  const b = bars();
  const rows = replayTicker(b, { sym: "AAA" });
  it("gera gatilhos dos três tipos só depois do aquecimento, com resultado", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.type === "dec")).toBe(true);
    for (const r of rows) {
      expect(["hit", "partial", "miss", "open"]).toContain(r.outcome);
      expect(r.src).toBe("retro");
    }
  });
  it("não usa o futuro: o resultado é o fechamento de 5 pregões depois", () => {
    const r = rows.find((x) => x.done);
    const i = b.dates.indexOf(r.date);
    expect(r.ret).toBeCloseTo(b.c[i + HORIZON] / b.c[i] - 1);
    // a mesma data simulada com o histórico cortado dá a mesma decisão
    const cut = Object.fromEntries(
      Object.entries(b).map(([k, v]) => [k, v.slice(0, i + HORIZON + 1)]),
    );
    const again = replayTicker(cut, { sym: "AAA" }).find((x) => x.date === r.date && x.type === r.type && x.code === r.code); // prettier-ignore
    expect(again?.action).toBe(r.action);
  });
  it("o mesmo gatilho não se repete antes de 5 pregões", () => {
    const by = {};
    for (const r of rows)
      (by[`${r.type}:${r.code}:${r.tone}`] ??= []).push(b.dates.indexOf(r.date));
    for (const idx of Object.values(by))
      for (let k = 1; k < idx.length; k++) expect(idx[k] - idx[k - 1]).toBeGreaterThanOrEqual(HORIZON); // prettier-ignore
  });
  it("histórico curto: nada a simular", () => {
    expect(replayTicker(bars(200), {})).toEqual([]);
  });
});

describe("diário", () => {
  const row = {
    sym: "AAA", price: 100,
    dec: { final: { step: { key: "buy", label: "Comprar", tone: "buy" }, conf: "Média" } },
    alert: { zone: "sup", headline: "Perto do suporte", action: "Agora: esperar", tone: "wait" },
    sigs: [{ code: "dip", kind: "entry", title: "Recuo" }],
  }; // prettier-ignore
  it("uma linha da aba Decisões vira decisão, nível e sinal", () => {
    const t = rowTriggers(row, "2024-03-01");
    expect(t.map((x) => x.type)).toEqual(["dec", "level", "sig"]);
    expect(t[0].dir).toBe(1);
    expect(t[1].dir).toBe(0);
  });
  it("não grava o mesmo gatilho de novo antes de 7 dias", () => {
    let d = addToDiary([], rowTriggers(row, "2024-03-01")).list;
    expect(addToDiary(d, rowTriggers(row, "2024-03-04")).added).toBe(0);
    d = addToDiary(d, rowTriggers(row, "2024-03-09")).list;
    expect(d.length).toBe(6);
  });
  it("avalia 5 pregões depois a partir do preço gravado", () => {
    const b = bars();
    const t = { ...rowTriggers(row, b.dates[300])[0], price: b.c[300] };
    const e = evalDiary(t, b, null);
    expect(e.done).toBe(true);
    expect(e.ret).toBeCloseTo(b.c[305] / b.c[300] - 1);
    const open = evalDiary({ ...t, date: b.dates.at(-2) }, b, null);
    expect(open.outcome).toBe("open");
  });
});

describe("placar", () => {
  it("conta só os encerrados e soma o resultado de quem operou", () => {
    const rows = [
      { done: true, outcome: "hit", dir: 1, ret: 0.02, expected: 0.01, pnl: 20, type: "dec" },
      { done: true, outcome: "partial", dir: -1, ret: -0.004, expected: 0.01, pnl: 4, type: "sig" },
      { done: true, outcome: "miss", dir: 0, ret: 0.05, pnl: 0, type: "dec" },
      { done: false, outcome: "open", dir: 1, ret: 0.01, pnl: null, type: "dec" },
    ];
    const s = summarize(rows);
    expect([s.n, s.hit, s.partial, s.miss, s.open]).toEqual([3, 1, 1, 1, 1]);
    expect(s.score).toBeCloseTo(0.5);
    expect(s.pnl).toBeCloseTo(24);
    expect(groupSummary(rows, (r) => r.type).find((g) => g.key === "dec").n).toBe(2);
  });
});
