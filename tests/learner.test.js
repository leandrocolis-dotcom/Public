import { describe, expect, it } from "vitest";
import {
  RULES,
  actionable,
  appendJournal,
  compareModels,
  dayScore,
  emptyModel,
  finalCriteria,
  nextStatus,
  settleJournal,
  stepWeights,
  trainStep,
  weightTargets,
  wilson,
} from "../assets/learner.js";
import { SUB_W, combine } from "../assets/decision.js";

const days = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1) + (from + i) * 86_400_000).toISOString().slice(0, 10)); // prettier-ignore

/** Gatilhos encerrados de uma lógica: um por dia, com a taxa de acerto pedida. */
function closed(key, n, hitRate, { from = 0, sym = "AAA" } = {}) {
  const [t, c, o] = key.split(":");
  return days(n, from).map((d, i) => ({ d, s: sym, t, c, o, r: o === "buy" ? 1 : o === "sell" ? -1 : 0, p: 100, out: (i * hitRate) % 1 < hitRate - 1e-9 ? "hit" : "miss", ret: 0.01 })); // prettier-ignore
}

describe("aproveitamento por dia", () => {
  it("vários gatilhos no mesmo dia contam como uma observação", () => {
    const es = [
      ...Array.from({ length: 30 }, (_, i) => ({ d: "2026-01-02", s: `S${i}`, out: "hit" })),
      { d: "2026-01-03", s: "A", out: "miss" },
    ];
    const s = dayScore(es);
    expect(s.n).toBe(2);
    expect(s.raw).toBe(31);
    expect(s.score).toBeCloseTo(0.5);
  });
  it("Parcial vale meio", () => {
    expect(dayScore([{ d: "x", out: "partial" }]).score).toBe(0.5);
  });
  it("intervalo de Wilson contém a proporção e encolhe com a amostra", () => {
    const a = wilson(0.6, 30);
    const b = wilson(0.6, 300);
    expect(a.lower).toBeLessThan(0.6);
    expect(a.upper).toBeGreaterThan(0.6);
    expect(b.upper - b.lower).toBeLessThan(a.upper - a.lower);
  });
});

describe("status das lógicas", () => {
  it("decide só com 30+ dias: < 60% elimina, ≥ 60% aprova", () => {
    expect(nextStatus({ n: 29, score: 0.3, upper: 0.7 })).toBe("eval");
    expect(nextStatus({ n: 30, score: 0.59, upper: 0.7 })).toBe("eliminated");
    expect(nextStatus({ n: 30, score: 0.6, upper: 0.75 })).toBe("approved");
  });
  it("elimina cedo quando nem o limite otimista chega a 60%", () => {
    expect(nextStatus({ n: 15, score: 0.3, upper: 0.55 })).toBe("eliminated");
    expect(nextStatus({ n: 14, score: 0.3, upper: 0.55 })).toBe("eval");
  });
  it("eliminada só volta com 63%+", () => {
    expect(nextStatus({ n: 40, score: 0.61, upper: 0.7 }, "eliminated")).toBe("eliminated");
    expect(nextStatus({ n: 40, score: 0.64, upper: 0.8 }, "eliminated")).toBe("approved");
  });
  it("esperar/aguardar não conta como lógica que opera", () => {
    expect(actionable("level:sup:wait")).toBe(false);
    expect(actionable("sig:dip:buy")).toBe(true);
  });
});

describe("diário fora da amostra", () => {
  const ds = days(20);
  it("o mesmo gatilho do mesmo ativo só volta depois de 5 pregões; o mesmo dia não duplica", () => {
    const e = (d) => ({ d, s: "A", t: "sig", c: "dip", o: "buy" });
    let j = appendJournal([], [e(ds[0])], () => ds).list;
    expect(appendJournal(j, [e(ds[0])], () => ds).added).toBe(0);
    expect(appendJournal(j, [e(ds[3])], () => ds).added).toBe(0);
    j = appendJournal(j, [e(ds[5])], () => ds).list;
    expect(j.length).toBe(2);
  });
  it("fecha 5 pregões depois com o resultado do modelo atual e do modelo em treino", () => {
    const c = ds.map((_, i) => 100 + i);
    const j = settleJournal(
      [
        { d: ds[0], s: "A", t: "dec", c: "buy", o: "buy", r: 1, p: 100, e: 0.01, a: { c: "wait", o: "wait", r: 0 }, v: 0.2 }, // prettier-ignore
        { d: ds[17], s: "A", t: "sig", c: "dip", o: "buy", r: 1, p: 117, e: 0.01 },
      ],
      () => ({ dates: ds, c }),
    );
    expect(j[0].ret).toBeCloseTo(0.05);
    expect(j[0].out).toBe("hit");
    expect(j[0].aout).toBe("hit"); // aguardar com alta de 5% < ½ oscilação de 20%
    expect(j[1].out).toBeUndefined();
  });
});

describe("pesos da decisão", () => {
  it("sem amostra mínima, mantém o peso original", () => {
    expect(weightTargets([]).target).toEqual(SUB_W);
  });
  it("parte que acerta mais ganha peso, dentro de 1,5×; o passo é gradual", () => {
    const decs = Array.from({ length: 100 }, (_, i) => ({ ret: i % 2 ? 0.01 : -0.01, sub: { tech: i % 2 ? 1 : -1, market: 0.5 } })); // prettier-ignore
    const { target, acc } = weightTargets(decs);
    expect(acc.tech.acc).toBe(1);
    expect(target.tech).toBeGreaterThan(SUB_W.tech);
    expect(target.market).toBeLessThan(SUB_W.market);
    const w = stepWeights(SUB_W, target);
    expect(w.tech).toBeGreaterThan(SUB_W.tech);
    expect(w.tech).toBeLessThan(target.tech);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
  });
  it("a decisão aceita pesos novos", () => {
    const subs = { tech: { dir: 1, conf: "Alta" }, market: { dir: -1, conf: "Alta" } };
    expect(combine(subs, { ...SUB_W, tech: 0.9, market: 0.1 }).score).toBeGreaterThan(combine(subs).score); // prettier-ignore
  });
});

describe("treino e modelo final", () => {
  const good = ["sig:dip:buy", "dec:buy:buy", "level:sup:wait"];
  const journal = [
    ...good.flatMap((k) => closed(k, 70, 0.8)),
    ...closed("sig:breakdown:sell", 70, 0.3),
  ];
  it("elimina a lógica fraca e aprova as boas", () => {
    const m = trainStep(emptyModel(days(1)[0]), journal, { date: days(1, 69)[0], sessions: 70 });
    expect(m.logics["sig:breakdown:sell"].status).toBe("eliminated");
    good.forEach((k) => expect(m.logics[k].status).toBe("approved"));
    expect(m.compare.learned.score).toBeGreaterThan(m.compare.current.score);
    expect(m.final).toBe(false); // ainda sem 4 retreinos estáveis
  });
  it("vira final só depois de 4 retreinos estáveis, e então congela", () => {
    let m = emptyModel(days(1)[0]);
    for (let s = 60; s <= 80; s++) m = trainStep(m, journal, { date: days(1, s)[0], sessions: s });
    expect(m.final).toBe(true);
    expect(finalCriteria(m).items.every((x) => x.ok)).toBe(true);
    const frozen = trainStep(m, [...journal, ...closed("sig:dip:buy", 40, 0, { from: 80 })], { date: days(1, 120)[0], sessions: 120 }); // prettier-ignore
    expect(frozen.final).toBe(true);
    expect(frozen.logics["sig:dip:buy"].status).toBe("approved"); // não muda sozinho...
    expect(frozen.degraded.map((d) => d.key)).toContain("sig:dip:buy"); // ...mas avisa
  });
  it("só lógicas de esperar não fecham o modelo", () => {
    const waits = ["level:sup:wait", "level:res:wait", "dec:wait:wait"].flatMap((k) => closed(k, 70, 0.9)); // prettier-ignore
    let m = emptyModel(days(1)[0]);
    for (let s = 60; s <= 90; s++) m = trainStep(m, waits, { date: days(1, s)[0], sessions: s });
    expect(m.final).toBe(false);
    expect(m.criteria.items.find((x) => x.key === "actionable").ok).toBe(false);
  });
  it("compara modelo atual e em treino", () => {
    const cmp = compareModels(journal, { "sig:breakdown:sell": { status: "eliminated" } });
    expect(cmp.current.n).toBe(70);
    expect(cmp.learned.score).toBeGreaterThan(cmp.current.score);
  });
  it("regras do enunciado", () => {
    expect(RULES.threshold).toBe(0.6);
    expect(RULES.finalSessions).toBe(60);
  });
});

describe("aprendizado v2: R, excesso, regime, testes múltiplos e correlação", async () => {
  const L = await import("../assets/learner.js");
  it("rMultiple: stop vira −1R (mais custos) e alta sem stop vira múltiplos do risco", () => {
    const c = [100, 99, 96, 97, 98];
    const b = { c, o: c, h: c, l: [100, 99, 94.5, 97, 98] }; // tocou o stop (95) durante o dia
    expect(L.rMultiple(b, 0, 100, 1, 0.05, 4, 0)).toBeCloseTo(-1);
    const gap = { c: [100, 99, 90, 92, 93], o: [100, 99, 90, 92, 93] }; // abriu abaixo do stop: sai na abertura
    expect(L.rMultiple(gap, 0, 100, 1, 0.05, 4, 0)).toBeCloseTo(-2);
    const up = [100, 102, 104, 106, 110];
    expect(L.rMultiple({ c: up }, 0, 100, 1, 0.05, 4, 0)).toBeCloseTo(2);
  });
  it("riskK: 2,5 ATR ÷ preço", () => {
    const c = Array.from({ length: 30 }, (_, i) => 100 + (i % 2));
    const k = L.riskK({ c, h: c.map((x) => x + 1), l: c.map((x) => x - 1) }, 29);
    expect(k).toBeGreaterThan(0.04);
    expect(k).toBeLessThan(0.08);
  });
  it("settleJournal grava rR e o excesso sobre a média do universo no horizonte da lógica", () => {
    const dates = Array.from({ length: 30 }, (_, i) => `d${String(i).padStart(2, "0")}`);
    const c = dates.map((_, i) => 100 + i);
    const j = L.settleJournal([{ d: "d00", s: "A", p: 100, r: 1, t: "dec", k: 0.1, e: 0.003 }], () => ({ dates, c }), 5, { mktOf: () => 0.1 }); // prettier-ignore
    expect(j[0].out).toBeTruthy();
    expect(j[0].rR).toBeCloseTo((120 - 100 - 0.0005 * 220) / 10, 3); // horizonte de 20 (decisão)
    expect(j[0].xR).toBeCloseTo(j[0].rR - 1, 3); // menos 0,10 ÷ 0,10
  });
  it("dayStatsR conta cada dia uma vez e dá o p unilateral", () => {
    const es = [
      { d: "a", xR: 1 },
      { d: "a", xR: 0 },
      { d: "b", xR: 0.5 },
      { d: "c", xR: 0.7 },
    ];
    const st = L.dayStatsR(es);
    expect(st.n).toBe(3);
    expect(st.mean).toBeCloseTo(0.5667, 3);
    expect(st.p).toBeLessThan(0.05);
  });
  it("Benjamini-Hochberg corta as descobertas por sorte", () => {
    const pass = L.bhPass(
      [
        ["a", 0.001],
        ["b", 0.04],
        ["c", 0.5],
        ["d", 0.9],
      ],
      0.1,
    );
    expect([...pass]).toEqual(["a", "b"]);
    expect(
      L.bhPass(
        [
          ["a", 0.2],
          ["b", 0.3],
        ],
        0.1,
      ).size,
    ).toBe(0);
  });
  it("status v2: aprova com excesso positivo e BH; elimina com excesso ≤ 0; antecipa com limite otimista negativo", () => {
    expect(L.nextStatusR({ n: 40, mean: 0.1, upper: 0.2 }, "eval", true)).toBe("approved");
    expect(L.nextStatusR({ n: 40, mean: 0.1, upper: 0.2 }, "eval", false)).toBe("eval");
    expect(L.nextStatusR({ n: 40, mean: -0.01, upper: 0.05 }, "eval", false)).toBe("eliminated");
    expect(L.nextStatusR({ n: 20, mean: -0.3, upper: -0.1 }, "eval", false)).toBe("eliminated");
    expect(L.nextStatusR({ n: 40, mean: 0.03, upper: 0.1 }, "eliminated", true)).toBe("eliminated"); // abaixo de +0,05R
  });
  it("spearman e pesos por correlação", () => {
    expect(L.spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(L.spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    const decs = Array.from({ length: 60 }, (_, i) => ({
      xs: i / 100,
      sub: { tech: i, market: -i, history: 0 },
    }));
    const w = L.weightTargetsIC(decs);
    expect(w.target.tech).toBeGreaterThan(w.target.market);
    expect(L.weightTargetsIC(decs.slice(0, 10))).toBeNull();
  });
  it("validação do filtro separa bloqueadas e liberadas", () => {
    const ev = L.edgeValidation([
      { t: "dec", r: 1, d: "a", xR: -1, eg: "D", eb: 1 },
      { t: "dec", r: 1, d: "a", xR: 1, eg: "A", eb: 0 },
    ]);
    expect(ev.blocked.mean).toBe(-1);
    expect(ev.passed.mean).toBe(1);
    expect(ev.grades.A.n).toBe(1);
  });
});

describe("aprendizado v2: risco mínimo", async () => {
  const L = await import("../assets/learner.js");
  it("ativo quase sem oscilação (T-bill) não é medido em R", () => {
    const dates = Array.from({ length: 30 }, (_, i) => `d${String(i).padStart(2, "0")}`);
    const c = dates.map((_, i) => 100 + i * 0.01);
    const j = L.settleJournal([{ d: "d00", s: "BIL", p: 100, r: 1, t: "sig", k: 0.0005, e: 0.003 }], () => ({ dates, c }), 5, { mktOf: () => 0.02 }); // prettier-ignore
    expect(j[0].out).toBeTruthy();
    expect(j[0].xR).toBeUndefined();
  });
});
