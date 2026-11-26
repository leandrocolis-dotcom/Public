import { describe, expect, it } from "vitest";
import {
  BR_FLOW_ASSETS,
  BR_FLOW_GROUPS,
  BR_FLOW_SYMBOLS,
  BR_UNI,
  brFlowTable,
  brPhase,
  volShare,
} from "../assets/br-flow.js";
import { BR_SYMBOLS, BR_SECTORS, b3Session, brFlow, dayIn } from "../assets/br.js";
import {
  OFF_UNI,
  flowNarrative,
  flowSnapshot,
  groupFlows,
  rotation,
} from "../assets/flow-engine.js";
import { FLOW_ASSETS } from "../assets/flow-universe.js";
import { parseChart } from "../api/history.js";
import { viewBrFlow, studyLine, studyPoint, studyVerdict } from "../assets/br-views.js";
import { runStudy, sessionBounds, CHECKPOINTS } from "../scripts/br-flow-study.mjs";

// pseudo-aleatório reproduzível
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5;
}
function bizDates(n, end = "2026-10-29") {
  const out = [];
  const d = new Date(`${end}T12:00:00Z`);
  while (out.length < n) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}
/** Histórico sintético de todo o universo (fechamento + volume). */
function makeHist(n = 140, seed = 7) {
  const r = rng(seed);
  const dates = bizDates(n);
  const hist = {};
  for (const sym of [...new Set([...BR_FLOW_SYMBOLS, "LFTS11.SA", "EEM"])]) {
    let p = 20 + 30 * (r() + 0.5);
    const close = [];
    const vol = [];
    for (let i = 0; i < n; i++) {
      p *= 1 + r() * 0.03;
      close.push(Math.round(p * 100) / 100);
      vol.push(Math.round(1e6 * (1 + r() * 0.4)));
    }
    hist[sym] = { dates, close, vol };
  }
  return hist;
}
const tOf = (day, hh = 13) => Date.parse(`${day}T${String(hh + 3).padStart(2, "0")}:00:00Z`) / 1000; // hh em Brasília

describe("universo do Fluxo Onshore", () => {
  it("todo símbolo do mapa está no universo de cotações/histórico da B3", () => {
    for (const s of BR_FLOW_SYMBOLS) expect(BR_SYMBOLS).toContain(s);
  });
  it("cada ação dos setores vira um bloco no grupo do seu setor; cestas S: só na rotação", () => {
    for (const s of BR_SECTORS)
      for (const m of s.members)
        expect(BR_FLOW_ASSETS.find((a) => a.sym === m)?.group).toBe(`br_${s.key}`);
    expect(BR_FLOW_GROUPS.find((g) => g.id === "br_sectors").noHeat).toBe(true);
    expect(BR_FLOW_SYMBOLS.some((s) => s.startsWith("S:"))).toBe(false);
  });
  it("ids dos grupos não colidem com os do Offshore", () => {
    const off = new Set(OFF_UNI.groups.map((g) => g.id));
    for (const g of BR_UNI.groups) expect(off.has(g.id)).toBe(false);
  });
  it("o Offshore segue igual (universo padrão)", () => {
    expect(OFF_UNI.assets).toBe(FLOW_ASSETS);
    expect(OFF_UNI.rotDefault).toBe("regions");
  });
});

describe("brFlowTable: coerência com a cotação", () => {
  const hist = makeHist();
  const last = hist["^BVSP"].dates.at(-1);
  const today = "2026-10-30";
  const quotes = {
    "^BVSP": { p: 101, pc: hist["^BVSP"].close.at(-1) * 1.001, t: tOf(today), v: 0 },
    // pc = fechamento anterior oficial (≠ do histórico em até 25%: proventos/ajuste); p ao vivo
    "PETR4.SA": { p: hist["PETR4.SA"].close.at(-1) * 1.02, pc: hist["PETR4.SA"].close.at(-1) * 1.005, t: tOf(today), v: 35624700 }, // prettier-ignore
    "VALE3.SA": { p: hist["VALE3.SA"].close.at(-1) * 0.97, pc: hist["VALE3.SA"].close.at(-1), t: tOf(today), v: 26590900 }, // prettier-ignore
  };
  const chg = (s) => (quotes[s].p / quotes[s].pc - 1) * 100;
  const table = brFlowTable(hist, quotes);
  it("acrescenta o pregão de hoje e a variação do dia é p ÷ pc", () => {
    expect(table.dates.at(-2)).toBe(last);
    expect(table.dates.at(-1)).toBe(today);
    const rows = flowSnapshot(table, { horizon: "1d", uni: BR_UNI }).rows;
    const petr = rows.find((r) => r.sym === "PETR4.SA");
    expect(petr.value).toBeCloseTo(chg("PETR4.SA"), 9);
    const vale = rows.find((r) => r.sym === "VALE3.SA");
    expect(vale.value).toBeCloseTo(chg("VALE3.SA"), 9);
    expect(petr.price).toBe(quotes["PETR4.SA"].p);
  });
  it("o volume de hoje vem da cotação; sem cotação nova, 0 (o volume relativo some)", () => {
    expect(table.vol["PETR4.SA"].at(-1)).toBe(35624700);
    expect(table.vol["ITUB4.SA"].at(-1)).toBe(0);
    expect(table.vol["PETR4.SA"].at(-2)).toBe(hist["PETR4.SA"].vol.at(-1));
  });
  it("volume relativo ajustado pela parcela esperada do volume do dia", () => {
    const full = flowSnapshot(table, { horizon: "1d", uni: BR_UNI, sessionFrac: 1 }).rows;
    const half = flowSnapshot(table, { horizon: "1d", uni: BR_UNI, sessionFrac: 0.5 }).rows;
    const a = full.find((r) => r.sym === "PETR4.SA").relVol;
    const b = half.find((r) => r.sym === "PETR4.SA").relVol;
    expect(b).toBeCloseTo(a * 2, 9);
    const prev = hist["PETR4.SA"].vol.slice(-20);
    expect(a).toBeCloseTo(35624700 / (prev.reduce((x, y) => x + y, 0) / 20), 9);
  });
  it("cestas de setor fora do mapa; ^BVSP no mapa mas nunca candidato", () => {
    const rows = flowSnapshot(table, { horizon: "1d", uni: BR_UNI }).rows;
    expect(rows.some((r) => r.group === "br_sectors")).toBe(false);
    const nar = flowNarrative(rows, groupFlows(rows, BR_UNI), { uni: BR_UNI, session: "open", sessionFrac: 0.5 }); // prettier-ignore
    const bad = [...nar.candidates, ...nar.weak].filter(
      (r) => r.sym === "^BVSP" || ["br_fx", "br_cmd"].includes(r.group),
    );
    expect(bad).toEqual([]);
    expect(nar.phase.id).toBe("open2");
    expect(nar.phase.title).toBe("Meio do pregão");
  });
  it("rotação dos setores contra o Ibovespa (padrão) e das ações de um setor", () => {
    const sec = rotation(table, "br_sectors", { uni: BR_UNI });
    expect(sec.map((d) => d.sym).sort()).toEqual(BR_SECTORS.map((s) => `S:${s.key}`).sort());
    for (const d of sec) expect(d.tail.length).toBeGreaterThan(3);
    const fin = rotation(table, "br_fin", { uni: BR_UNI });
    expect(fin.map((d) => d.label)).toContain("ITUB4");
    expect(rotation(table, "regions", { uni: BR_UNI })).toEqual([]);
  });
  it("brFlow usa o mesmo volume relativo do mapa quando recebe rv", () => {
    const f = brFlow(table.close, quotes, { rv: { "PETR4.SA": 2 }, share: 0.5 });
    const all = [...f.inflow, ...f.outflow, ...f.unusual];
    const petr = all.find((x) => x.sym === "PETR4.SA");
    expect(petr.rv).toBe(2);
  });
});

describe("hora do pregão da B3", () => {
  it("b3Session.frac: 0 na abertura, 0,5 no meio, 1 depois do fechamento", () => {
    // 30/10/2026: EUA ainda no horário de verão (até 1/11) -> pregão 10:00-17:00
    expect(b3Session(new Date("2026-10-30T13:00:00Z")).frac).toBe(0);
    expect(b3Session(new Date("2026-10-30T16:30:00Z")).frac).toBeCloseTo(0.5, 9);
    expect(b3Session(new Date("2026-10-30T21:00:00Z")).frac).toBe(1);
    // dezembro: pregão até 18:00
    expect(b3Session(new Date("2026-12-02T17:00:00Z")).frac).toBeCloseTo(0.5, 9);
  });
  it("fases", () => {
    expect(brPhase("open", 0.05).id).toBe("open1");
    expect(brPhase("open", 0.9).id).toBe("open3");
    expect(brPhase("pre").title).toMatch(/Pré-abertura/);
    expect(brPhase("closed").id).toBe("closed");
  });
  it("volShare: linear sem curva; interpola a curva medida", () => {
    expect(volShare(0.4)).toBe(0.4);
    const c = [[0.5, 0.4], [0.9, 0.7]]; // prettier-ignore
    expect(volShare(0.5, c)).toBeCloseTo(0.4, 9);
    expect(volShare(0.25, c)).toBeCloseTo(0.2, 9);
    expect(volShare(0.7, c)).toBeCloseTo(0.55, 9);
    expect(volShare(0.95, c)).toBeCloseTo(0.85, 9);
    expect(volShare(1, c)).toBe(1);
  });
  it("sessionBounds: 10:00 às 17:00 (out) e às 18:00 (dez) em Brasília", () => {
    const a = sessionBounds("2026-10-30");
    expect(new Date(a.open * 1000).toISOString()).toBe("2026-10-30T13:00:00.000Z");
    expect(new Date(a.close * 1000).toISOString()).toBe("2026-10-30T20:00:00.000Z");
    expect(new Date(sessionBounds("2026-12-02").close * 1000).toISOString()).toBe("2026-12-02T21:00:00.000Z"); // prettier-ignore
  });
});

describe("api/history com volume", () => {
  const json = {
    chart: {
      result: [
        {
          meta: { exchangeTimezoneName: "America/Sao_Paulo", longName: "X" },
          timestamp: [1793000000, 1793086400, 1793172800],
          indicators: {
            quote: [{ close: [10, null, 11], volume: [100, 50, null] }],
            adjclose: [{ adjclose: [10, null, 11] }],
          },
        },
      ],
    },
  };
  it("sem vol=1 nada muda; com vol=1 o volume acompanha os fechamentos válidos", () => {
    expect(parseChart(json)).toEqual({ dates: expect.any(Array), close: [10, 11], name: "X" });
    const p = parseChart(json, { vol: true });
    expect(p.vol).toEqual([100, 0]);
    expect(p.vol).toHaveLength(p.close.length);
  });
});

describe("estudo de assertividade (núcleo)", () => {
  // 5 min sintéticos: PETR4 sobe forte de manhã e segue subindo; VALE3 cai e segue caindo; o resto anda de lado
  const n = 100;
  const hist = makeHist(n, 11);
  const days = hist["^BVSP"].dates.slice(80, 95);
  const intra = {};
  for (const [sym, s] of Object.entries(hist)) {
    const t = [];
    const c = [];
    const v = [];
    for (const day of days) {
      const i = s.dates.indexOf(day);
      const pc = s.close[i - 1];
      const { open, close } = sessionBounds(day);
      const drift = sym === "PETR4.SA" ? 0.04 : sym === "VALE3.SA" ? -0.04 : 0;
      const bars = Math.round((close - open) / 300);
      for (let k = 0; k < bars; k++) {
        t.push(open + k * 300);
        c.push(pc * (1 + (drift * (k + 1)) / bars));
        v.push(s.vol[i] / bars);
      }
      if (drift) s.close[i] = pc * (1 + drift); // fecha onde o intradiário terminou
      if (drift && i + 1 < n) s.close[i + 1] = s.close[i] * (1 + drift / 2); // e segue no dia seguinte
    }
    intra[sym] = { t, c, v };
  }
  const res = runStudy(hist, intra, days);
  it("estrutura: um ponto por hora do pregão e a curva de volume", () => {
    expect(res.days).toBe(days.length);
    expect(res.checkpoints.map((c) => c.frac)).toEqual(CHECKPOINTS.map(([f]) => f));
    expect(res.volCurve.length).toBeGreaterThan(5);
    const mid = res.volCurve.find(([f]) => f === 0.5)[1];
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
  it("forte que segue subindo: resto do dia e dia seguinte positivos; fraco, negativos", () => {
    const mid = res.checkpoints.find((c) => c.frac === 0.5);
    expect(mid.cand.n).toBeGreaterThan(0);
    expect(mid.cand.restBps).toBeGreaterThan(0);
    expect(mid.cand.nextBps).toBeGreaterThan(0);
    expect(mid.weak.restBps).toBeLessThan(0);
  });
  it("a frase da tela usa o ponto mais perto da hora (fechado = fechamento)", () => {
    expect(studyPoint(res, 0.48, true).frac).toBe(0.5);
    expect(studyPoint(res, 0.48, false).frac).toBe(1);
    expect(studyLine(res, 0.5, true)).toMatch(
      /Medido em 15 pregões reais da B3 \(meio do pregão\)/,
    );
    expect(studyLine(null, 0.5, true)).toBe("");
  });
});

describe("tela Onshore › Fluxo", () => {
  it("mesmas partes do Offshore (Fluxo agora, mapa de calor, rotação) + canal do estrangeiro", () => {
    const hist = makeHist();
    const flow = brFlowTable(hist, {});
    const prefs = { flowHorizon: "1d", flowGroup: "all", flowSize: "liq", rotGroup: "br_sectors" };
    const html = viewBrFlow({ flow, uni: BR_UNI, quotes: {}, br: {}, prefs, rotKey: "brRotGroup", back: 0, sessionFrac: 1 }); // prettier-ignore
    for (const id of ["flowHeadline", "flowStory", "treemap", "rotChart", "groupBars", "flowTable"])
      expect(html).toContain(`id="${id}"`);
    expect(html).toContain('data-pref="brRotGroup"');
    expect(html).toContain("Setores da B3 × Ibovespa");
    expect(html).toContain("Estrangeiro (EWZ em NY)");
    expect(html).not.toContain("Países emergentes");
  });
  it("sem histórico: aviso de carga", () => {
    expect(viewBrFlow({ flow: null, br: {} })).toContain("Carregando a B3");
    expect(dayIn(tOf("2026-10-30"))).toBe("2026-10-30");
  });
});

describe("veredito do estudo (sem exagero)", () => {
  const base = { frac: 0.5, label: "meio do pregão", sectors: { up: { n: 166, cont: 0.85 }, down: { n: 130, cont: 0.8 } } }; // prettier-ignore
  it("dados reais de 30/10/2026: lê o dia, mas sem vantagem de entrada; fracos repicam", () => {
    const v = studyVerdict({ ...base, cand: { n: 209, restBps: 8.6, restT: 0.76, nextBps: 19.2, nextT: 0.91 }, weak: { n: 168, restBps: 15, restT: 1.44, nextBps: 26.9, nextT: 1.18 } }); // prettier-ignore
    expect(v).toMatch(/Serve para ler o dia/);
    expect(v).toMatch(/ainda não há vantagem comprovada/);
    expect(v).toMatch(/fracos tenderam a repicar/);
  });
  it("só chama de vantagem com t ≥ 2", () => {
    const v = studyVerdict({ ...base, cand: { n: 200, restBps: 30, restT: 2.4, nextBps: 5, nextT: 0.3 }, weak: { n: 100, restBps: -20, restT: -2.1 } }); // prettier-ignore
    expect(v).toMatch(/Com significância \(t ≥ 2\): fortes seguem rendendo mais até o fechamento; fracos seguem caindo até o fechamento/); // prettier-ignore
    expect(studyVerdict(null)).toBe("");
  });
});
