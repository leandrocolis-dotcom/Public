import { describe, it, expect } from "vitest";
import { preCandidates, namesConfirm, regimeFit, confidenceOf, rateCandidates, leaderAlertText, dayChange, namesToQuote } from "../assets/leaders.js"; // prettier-ignore
import { THEME_NAMES, namesOf, profileOf, PROXY } from "../assets/theme-names.js";
import { quadrantOf } from "../assets/flow-engine.js";
import { FLOW_ASSETS, FLOW_GROUPS } from "../assets/flow-universe.js";
import { leaderAlerts } from "../scripts/lib/push-alerts.mjs";
import { leadersHtml, namesTableHtml, regimeLine } from "../assets/leaders-view.js";

const T0 = 1_800_000_000;
const tail = (pts) => pts.map(([x, y], i) => ({ x, y, t: T0 + i * 1800, label: `1${i}:00` }));

describe("nomes puros (theme-names)", () => {
  it("toda linha da rotação tem pelo menos 3 nomes, sem repetir dentro da linha", () => {
    const rot = new Set(FLOW_GROUPS.filter((g) => !g.noRotation).map((g) => g.id));
    for (const a of FLOW_ASSETS.filter((x) => rot.has(x.group))) {
      const ns = namesOf(a.sym).map((n) => n.sym);
      expect(ns.length, a.sym).toBeGreaterThanOrEqual(3);
      expect(new Set(ns).size, a.sym).toBe(ns.length);
    }
    for (const s of PROXY) expect(THEME_NAMES[s], s).toBeTruthy();
  });
  it("prefixo - vira nome inverso; perfil por grupo com exceções", () => {
    expect(namesOf("EURUSD=X").at(-1)).toEqual({ sym: "EUO", inv: true });
    expect(profileOf("XLK", "us_sectors")).toBe("risk");
    expect(profileOf("XLU", "us_sectors")).toBe("def");
    expect(profileOf("TLT", "bonds")).toBe("def");
    expect(profileOf("HYG", "bonds")).toBe("risk");
    expect(profileOf("ZC=F", "ags")).toBe("neutral");
  });
});

describe("pré-candidatos", () => {
  const rot = [
    {
      sym: "A",
      label: "Sobe",
      tail: tail([
        [99.9, 99.9],
        [99.95, 100.05],
        [100.1, 100.15],
        [100.3, 100.3],
      ]),
    }, // virou Liderando com ritmo
    {
      sym: "B",
      label: "Parado",
      tail: tail([
        [100.2, 100.1],
        [100.2, 100.1],
        [100.2, 100.1],
        [100.21, 100.1],
      ]),
    }, // sem ritmo
    {
      sym: "C",
      label: "Cai",
      tail: tail([
        [100.3, 100.2],
        [100.2, 100],
        [100, 99.8],
        [99.8, 99.7],
      ]),
    }, // atrasado
  ];
  it("pega quem ganha tração (Liderando/Ganhando força, momento > 100, força subindo, ritmo)", () => {
    const pc = preCandidates(rot, "ai", quadrantOf);
    expect(pc.map((c) => c.sym)).toEqual(["A"]);
    expect(pc[0].turn).toBe("virou Liderando");
    expect(pc[0].at).toBe("13:00");
  });
  it("descarta cabeça velha (mercado do ativo parado)", () => {
    expect(preCandidates(rot, "ai", quadrantOf, { minT: T0 + 99999 })).toEqual([]);
  });
});

describe("confiança: regime + nomes", () => {
  const q = (p, pc) => ({ p, pc, t: T0 });
  it("dayChange usa pré/pós só com ext", () => {
    const x = { p: 100, pc: 100, t: 10, xp: 102, xt: 20 };
    expect(dayChange(x, true)).toBeCloseTo(0.02);
    expect(dayChange(x, false)).toBe(0);
  });
  it("nomes confirmam quando ≥ 60% andam melhor que o benchmark (inverso conta ao contrário)", () => {
    const quotes = { NVDA: q(105, 100), AMD: q(103, 100), SMH: q(100.5, 100) };
    const r = namesConfirm("NVDA", quotes, 0.01);
    expect(r.up).toBe(2);
    expect(r.ok).toBe(true);
    expect(namesConfirm("NVDA", quotes, 0.04).ok).toBe(false);
    const fx = { FXE: q(101, 100), ULE: q(102, 100), EUO: q(98, 100) };
    expect(namesConfirm("EURUSD=X", fx, 0).up).toBe(3); // EUO caindo confirma o euro subindo
  });
  it("regimeFit e confidenceOf", () => {
    const on = { verdict: "Risk-on", strength: { intensity: 65, level: "Forte" } };
    const weak = { verdict: "Risk-on", strength: { intensity: 15, level: "Muito fraca" } };
    const off = { verdict: "Risk-off", strength: { intensity: 70, level: "Forte" } };
    expect(regimeFit("risk", on).fit).toBe(1);
    expect(regimeFit("risk", weak).fit).toBe(0.5);
    expect(regimeFit("def", off).fit).toBe(1);
    expect(regimeFit("risk", off).fit).toBe(-1);
    expect(regimeFit("neutral", on).fit).toBe(0);
    expect(regimeFit("risk", { verdict: "Misto" }).fit).toBe(0);
    expect(confidenceOf(1, true)).toBe("alta");
    expect(confidenceOf(1, false)).toBe("media");
    expect(confidenceOf(0.5, true)).toBe("media");
    expect(confidenceOf(0, true)).toBe("media");
    expect(confidenceOf(0.5, false)).toBe("baixa");
    expect(confidenceOf(-1, true)).toBe("baixa");
  });
  it("rateCandidates ordena por confiança e o aviso só sai para a alta", () => {
    const pre = [
      {
        sym: "NVDA",
        label: "GPUs",
        group: "ai",
        quadrant: "Liderando",
        pace: 0.8,
        turn: null,
        at: "12:00",
        score: 1,
      },
      {
        sym: "XLU",
        label: "Utilities",
        group: "us_sectors",
        quadrant: "Liderando",
        pace: 0.8,
        turn: null,
        at: "12:00",
        score: 3,
      },
    ];
    const quotes = { NVDA: q(105, 100), AMD: q(104, 100), SMH: q(103, 100), NEE: q(99, 100), SO: q(99, 100), CEG: q(99, 100) }; // prettier-ignore
    const rg = { verdict: "Risk-on", strength: { intensity: 65, level: "Forte" } };
    const r = rateCandidates(pre, { quotes, regime: rg, benchChg: { ai: 0.01, us_sectors: 0 }, groupOf: (g) => g }); // prettier-ignore
    expect(r.map((c) => [c.sym, c.conf])).toEqual([
      ["NVDA", "alta"],
      ["XLU", "baixa"],
    ]);
    expect(namesToQuote(pre)).toContain("AMD");
    const t = leaderAlertText(r[0]);
    expect(t.title).toContain("GPUs");
    expect(t.body).toMatch(/3\/3 nomes confirmam/);
    const al = leaderAlerts(r, T0);
    expect(al).toHaveLength(1);
    expect(al[0].key).toMatch(/^lead:\d{4}-\d{2}-\d{2}:ai:NVDA$/);
    expect(al[0].title).toMatch(/LIDERANÇA/);
    expect(al[0].url).toContain("rot=ai");
  });
});

describe("HTML do quadro", () => {
  it("regimeLine, leadersHtml e namesTableHtml", () => {
    expect(regimeLine(null)).toContain("indisponível");
    expect(regimeLine({ verdict: "Risk-on", on: 5, n: 7, level: "Forte", intensity: 64 })).toContain("Forte (64/100)"); // prettier-ignore
    const c = { sym: "NVDA", label: "GPUs", group: "ai", groupLabel: "IA", quadrant: "Liderando", turn: "virou Liderando", at: "12:00", pace: 0.7, conf: "alta", fit: { fit: 1, text: "a favor do regime" }, names: { up: 3, n: 3, ok: true, rows: [{ sym: "NVDA", chg: 0.03, rel: 0.02, inv: false }] } }; // prettier-ignore
    const h = leadersHtml({ candidates: [c], regime: null }, { first: { "ai:NVDA": "11:30" } });
    expect(h).toContain("conf-alta");
    expect(h).toContain('data-rot-goto="ai"');
    expect(h).toContain('data-sr-open="NVDA"');
    expect(h).toContain("desde 11:30");
    expect(leadersHtml({ candidates: [] })).toContain("Nenhum tema");
    const t = namesTableHtml([{ sym: "XLK", label: "Tecnologia" }], { NVDA: { p: 101, pc: 100, t: 1 } }, { benchChg: 0, benchName: "SPY" }); // prettier-ignore
    expect(t).toContain('data-sr-open="NVDA"');
    expect(t).toContain("acima SPY");
    expect(namesTableHtml([{ sym: "ZZZ", label: "x" }], {})).toContain("Sem nomes");
  });
});
