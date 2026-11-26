import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkBase, checkLive, checkEngine, checkPortfolio, checkCross, runChecks, businessDaysBetween } from "../assets/checks.js"; // prettier-ignore
import { computeSnapshot } from "../assets/engine.js";
import { valuePortfolio } from "../assets/portfolio.js";
import { parseNasdaq, classify, money, parseSymbols, DEFAULT_SAMPLE } from "../api/verify.js";

const prices = JSON.parse(readFileSync(new URL("../data/prices.json", import.meta.url)));
const lv = (xs) => Object.fromEntries(xs.map((x) => [x.label, x.level]));

describe("checkBase", () => {
  it("aprova a base publicada", () => {
    const r = checkBase(prices, { today: prices.dates.at(-1) });
    expect(r.filter((x) => x.level === "bad")).toEqual([]);
  });
  it("acusa datas fora de ordem, série curta e salto anormal", () => {
    const p = structuredClone(prices);
    [p.dates[5], p.dates[6]] = [p.dates[6], p.dates[5]];
    p.series.SPY = p.series.SPY.slice(1);
    p.series.QQQ[500] = p.series.QQQ[499] * 3;
    const r = lv(checkBase(p));
    expect(r["Datas em ordem e sem repetição"]).toBe("bad");
    expect(r["Séries completas e numéricas"]).toBe("bad");
    expect(r["Sem saltos anormais de preço"]).toBe("warn");
  });
  it("base velha vira erro", () => {
    expect(businessDaysBetween("2026-10-02", "2026-10-07")).toBe(3); // sex -> qua
    const r = lv(checkBase(prices, { today: "2026-12-31" }));
    expect(r["Base atualizada"]).toBe("bad");
  });
});

describe("checkEngine", () => {
  it("recalcula o motor e bate", () => {
    const snap = computeSnapshot(prices, null);
    expect(checkEngine(snap, prices).every((x) => x.level === "ok")).toBe(true);
  });
  it("detecta conta adulterada", () => {
    const snap = computeSnapshot(prices, null);
    snap.assets.SPY.r5d += 0.001;
    expect(lv(checkEngine(snap, prices))["Retornos, médias e RSI"]).toBe("bad");
  });
});

describe("checkLive", () => {
  const n = prices.dates.length;
  const last = prices.dates.at(-1);
  const t = Date.parse(`${last}T15:00:00-04:00`) / 1000 + 86400; // pregão seguinte
  const mk = (over = {}) => ({
    count: 2, total: 2, missing: [],
    quotes: { SPY: { p: prices.series.SPY[n - 1] * 1.01, pc: prices.series.SPY[n - 1], t }, QQQ: { p: 100, pc: prices.series.QQQ[n - 1], t }, ...over },
  }); // prettier-ignore
  it("cotação emenda com a base", () => {
    const r = lv(checkLive(mk(), prices, { nowSec: t + 60 }));
    expect(r["Cotação ao vivo emenda com a base"]).toBe("ok");
    expect(r["Preços e horários válidos"]).toBe("ok");
  });
  it("fechamento anterior errado, horário no futuro e variação extrema", () => {
    const r = lv(
      checkLive(mk({ SPY: { p: 1, pc: prices.series.SPY[n - 1] * 1.05, t: t + 9999 } }), prices, {
        nowSec: t,
      }),
    );
    expect(r["Cotação ao vivo emenda com a base"]).toBe("warn");
    expect(r["Preços e horários válidos"]).toBe("bad");
    expect(r["Variações do dia plausíveis"]).toBe("warn");
  });
  it("sem cotação = erro", () => {
    expect(checkLive(null, prices)[0].level).toBe("bad");
  });
});

describe("checkPortfolio", () => {
  const pf = { importedAt: "2026-10-07T12:00:00Z", holdings: [{ sym: "SPY", qty: 10, avg: 500, invPrice: 700 }, { sym: "XYZ", qty: 5, avg: 20 }] }; // prettier-ignore
  const live = { fetched_at: "2026-10-07T14:00:00Z", quotes: { SPY: { p: 700, pc: 690, t: 1 } } };
  it("contas da carteira conferem", () => {
    const v = valuePortfolio(pf.holdings, live.quotes);
    const r = lv(checkPortfolio(pf, v, live));
    expect(r["Valor, custo e resultado por posição"]).toBe("ok");
    expect(r["Totais e pesos"]).toBe("ok");
    expect(r["Posições iguais às importadas"]).toBe("ok");
    expect(r["Todas as posições com preço ao vivo"]).toBe("warn"); // XYZ sem cotação
    expect(r["Preço do Yahoo × preço do Investing (hoje)"]).toBe("ok");
  });
  it("detecta total adulterado e ticker trocado", () => {
    const v = valuePortfolio(pf.holdings, { SPY: { p: 70, pc: 69, t: 1 } });
    v.total += 1;
    const r = lv(checkPortfolio(pf, v, live));
    expect(r["Totais e pesos"]).toBe("bad");
    expect(r["Preço do Yahoo × preço do Investing (hoje)"]).toBe("warn");
  });
});

describe("api/verify (Yahoo × Nasdaq)", () => {
  it("lê o fechamento oficial fora do pregão", () => {
    const q = parseNasdaq({
      marketStatus: "After-Hours",
      primaryData: { lastSalePrice: "$779.92", netChange: "+0.78" },
      secondaryData: { lastSalePrice: "$779.14", netChange: "+4.31", lastTradeTimestamp: "Closed at Oct 6, 2026 4:00 PM ET" },
    }); // prettier-ignore
    expect(q).toEqual({ price: 779.14, prevClose: 774.83, status: "After-Hours", open: false });
    expect(money("$1,234.50")).toBe(1234.5);
    expect(money("")).toBe(null);
  });
  it("classifica divergências", () => {
    expect(classify({ priceDiff: 0.0001, prevDiff: 0, open: false }).level).toBe("ok");
    expect(classify({ priceDiff: 0.004, prevDiff: 0, open: true }).level).toBe("ok");
    expect(classify({ priceDiff: 0.004, prevDiff: 0, open: false }).level).toBe("warn");
    expect(classify({ priceDiff: 0, prevDiff: 0.02, open: false }).level).toBe("bad");
  });
  it("só aceita tickers simples, no máximo 25", () => {
    const s = parseSymbols(
      "nvda,ES=F,^VIX,EURUSD=X,../x," +
        Array.from({ length: 40 }, (_, i) => `A${String.fromCharCode(65 + (i % 26))}${i}`).join(
          ",",
        ),
    );
    expect(s.slice(0, DEFAULT_SAMPLE.length)).toEqual(DEFAULT_SAMPLE);
    expect(s).toContain("NVDA");
    expect(s.some((x) => /[=^./]/.test(x))).toBe(false);
    expect(s.length).toBeLessThanOrEqual(25);
  });
  it("resumo da conferência", () => {
    expect(checkCross({ summary: { ok: 9, warn: 0, bad: 1, na: 2 } })[0].level).toBe("bad");
    expect(checkCross(null)[0].level).toBe("warn");
    expect(runChecks({ base: prices, today: prices.dates.at(-1) }).summary.total).toBeGreaterThan(
      5,
    );
  });
});

describe("PWA", () => {
  const root = new URL("..", import.meta.url);
  const man = JSON.parse(readFileSync(new URL("manifest.webmanifest", root)));
  const html = readFileSync(new URL("index.html", root), "utf8");
  it("manifest instalável", () => {
    expect(man.display).toBe("standalone");
    expect(man.start_url).toMatch(/^\//);
    const sizes = man.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(man.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of man.icons) expect(() => readFileSync(new URL(i.src, root))).not.toThrow();
  });
  it("index liga manifest, ícone da Apple e service worker existe", () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain("apple-touch-icon");
    expect(() => readFileSync(new URL("sw.js", root))).not.toThrow();
  });
});

import { splitFactor, rescale, applyLiveToFlow } from "../assets/live.js";
import { checkFlowLive } from "../assets/checks.js";

describe("desdobramento/grupamento ainda não refletido no histórico", () => {
  it("reconhece fatores típicos e ignora movimentos normais", () => {
    expect(splitFactor(61.29, 20.43)).toBe(3);
    expect(splitFactor(50, 100.5)).toBe(0.5);
    expect(splitFactor(101, 100)).toBe(null);
    expect(splitFactor(140, 100)).toBe(null); // +40%: movimento, não split
  });
  it("reescala a série, inclusive linhas mistas perto do evento (caso ETHA)", () => {
    const s = rescale([20.2, 20.3, 60.45, 20.28, 20.12, 61.29], 3, 5);
    expect(s.map((v) => Math.round(v))).toEqual([61, 61, 60, 61, 60, 61]);
  });
  it("aplica no overlay e a verificação registra a correção", () => {
    const flow = {
      dates: ["2026-10-02", "2026-10-05"],
      close: { SPY: [700, 701], ETHA: [20.11, 20.43] },
      vol: { SPY: [1, 1], ETHA: [30, 30] },
      last_real: {},
    };
    const t = Date.parse("2026-10-06T19:00:00Z") / 1000;
    const live = { quotes: { SPY: { p: 705, pc: 701, t }, ETHA: { p: 60.89, pc: 61.29, t } } };
    const r = applyLiveToFlow(flow, live);
    expect(r.adjusted).toEqual([{ code: "ETHA", factor: 3 }]);
    const e = r.table.close.ETHA;
    expect(e.at(-1) / e.at(-2) - 1).toBeCloseTo(60.89 / 61.29 - 1, 6); // dia real ≈ −0,65%, não +198%
    const c = checkFlowLive(flow, live, r.adjusted);
    expect(c.map((x) => x.level)).toEqual(["ok", "ok", "ok"]);
    expect(c[1].label).toBe("Variação do dia igual em todas as telas");
    expect(c[2].detail).toContain("ETHA");
    expect(checkFlowLive(flow, live, [])[0].level).toBe("warn"); // sem a correção, a emenda acusa
  });
});

import { parseEcb, parseMof, parseBoe } from "../api/yields.js";
import { change, regime } from "../assets/dash.js";

describe("juros soberanos (fontes oficiais)", () => {
  it("lê BCE, MoF, BoE e BCB", () => {
    const ecb = parseEcb(
      "KEY,FREQ,TIME_PERIOD,OBS_VALUE\nYC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y,B,2026-10-05,3.50\nYC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y,B,2026-10-02,3.46",
    );
    expect(ecb["10Y"].at(-1)).toEqual({ d: "2026-10-05", v: 3.5 });
    const mof = parseMof(
      "Interest Rate,,\nDate,1Y,2Y,10Y\n2026/10/1,1.6,1.9,3.09\n2026/10/6,1.7,1.93,3.103\n",
    );
    expect(mof["10Y"].at(-1)).toEqual({ d: "2026-10-06", v: 3.103 });
    const boe = parseBoe("DATE,IUDMNZC,IUDBEDR\n02 Oct 2026,5.354,3.75\n05 Oct 2026,,3.75");
    expect(boe.IUDMNZC).toEqual([{ d: "2026-10-02", v: 5.354 }]);
  });
});

describe("painel", () => {
  it("variação em % e em bps", () => {
    expect(change([100, 110], 1, "px")).toBeCloseTo(0.1);
    expect(change([4.0, 4.25], 1, "yld")).toBeCloseTo(25);
    expect(change([1], 1, "px")).toBe(null);
  });
  it("regime conta razões de risco e detecta VIX invertido", () => {
    const up = [1, 1.1];
    const close = {
      SPY: up,
      TLT: [1, 1],
      HYG: up,
      IEF: [1, 1],
      "^VIX": [20, 30],
      "^VIX3M": [22, 25],
    };
    const r = regime(close, 1);
    expect(r.on).toBe(3); // S&P 500 (Bolsas), SPY/TLT e HYG/IEF (Classes)
    // tudo em alta com a curva invertida = repique sob estresse: segue Risk-on, com o alerta à parte
    expect(r.verdict).toBe("Risk-on (VIX ainda invertido)");
    expect(r.inverted).toBe(true);
    expect(r.strength.score).toBeGreaterThan(0);
    expect(r.strength.against).toBe(false);
  });
  it("curva invertida com as razões de risco caindo = Estresse", () => {
    const dn = [1, 0.9];
    const close = {
      SPY: dn,
      TLT: [1, 1],
      HYG: dn,
      IEF: [1, 1],
      "^VIX": [20, 30],
      "^VIX3M": [22, 25],
    };
    const r = regime(close, 1);
    expect(r.verdict).toBe("Estresse (VIX invertido)");
    expect(r.inverted).toBe(true);
  });
});

import { reconcile } from "../assets/cloud.js";

describe("nuvem: qual lado vale", () => {
  const pf = (t, n = 2) => ({ holdings: Array(n).fill({ sym: "SPY" }), updatedAt: t });
  it("último a mudar vence", () => {
    expect(reconcile(null, pf("2026-10-07T10:00:00Z"))).toBe("pull"); // aparelho novo
    expect(reconcile(pf("2026-10-07T10:00:00Z"), null)).toBe("push"); // primeira sincronização
    expect(reconcile(pf("2026-10-07T09:00:00Z"), pf("2026-10-07T10:00:00Z"))).toBe("pull");
    expect(reconcile(pf("2026-10-07T11:00:00Z"), pf("2026-10-07T10:00:00Z"))).toBe("push");
    expect(reconcile(pf("2026-10-07T10:00:00Z"), pf("2026-10-07T10:00:00Z"))).toBe("none");
  });
  it("carteira apagada em outro aparelho (marca vazia) não volta", () => {
    expect(reconcile(pf("2026-10-07T09:00:00Z"), pf("2026-10-07T10:00:00Z", 0))).toBe("pull");
    expect(reconcile(null, pf("2026-10-07T10:00:00Z", 0))).toBe("none");
  });
});

import { extendedHours } from "../api/quotes.js";

describe("pré/pós-mercado", () => {
  it("usa o preço estendido mais recente, só se posterior ao regular", () => {
    const q = {
      regularMarketPrice: 100,
      regularMarketTime: 1000,
      preMarketPrice: 99,
      preMarketTime: 2000,
      postMarketPrice: 101,
      postMarketTime: 1500,
    };
    const x = extendedHours(q);
    expect([x.xk, x.xp, x.xt]).toEqual(["pre", 99, 2000]);
    expect(x.xc).toBeCloseTo(-0.01);
    expect(
      extendedHours({
        regularMarketPrice: 100,
        regularMarketTime: 3000,
        postMarketPrice: 101,
        postMarketTime: 1500,
      }),
    ).toEqual({});
    expect(extendedHours({ regularMarketPrice: 100, regularMarketTime: 1 })).toEqual({});
  });
});
