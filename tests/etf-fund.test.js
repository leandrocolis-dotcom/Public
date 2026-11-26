import { describe, it, expect } from "vitest";
import {
  bondEtfFund,
  carryCost,
  durationOf,
  equityEtfFund,
  etfClass,
  goldFund,
  leverageOf,
} from "../assets/etf-fund.js";
import { analyzeTicker, fundPillar } from "../assets/integrated.js";
import { etfNeeds, parseFredLast, parseSummary } from "../api/analyze.js";
import { fundSub } from "../assets/decision.js";
import { dismissible, dismiss, noticeKey } from "../assets/dismiss.js";

const M = { cash: 4, y10: 4.2, y30: 4.6, real10: 1.8 };

function bars(n = 300, vol = 0.03) {
  const c = [100];
  for (let i = 1; i < n; i++) c.push(c[i - 1] * (1 + (i % 2 ? vol : -vol * 0.98)));
  return { dates: c.map((_, i) => `d${i}`), o: c, h: c, l: c, c, v: c.map(() => 1) };
}

describe("leverageOf", () => {
  it("tabela e nome", () => {
    expect(leverageOf("NVDL")).toEqual({ under: "NVDA", lev: 2 });
    expect(leverageOf("TMV")).toEqual({ under: "TLT", lev: -3 });
    expect(leverageOf("XYZ", "GraniteShares 2x Long META Daily ETF")).toEqual({ under: "META", lev: 2 }); // prettier-ignore
    expect(leverageOf("XYZ", "Direxion Daily TSLA Bear 1X Shares")).toEqual({ under: "TSLA", lev: -1 }); // prettier-ignore
    expect(leverageOf("SPY", "SPDR S&P 500 ETF Trust")).toBeNull();
  });
});

describe("etfClass", () => {
  it("separa ações, renda fixa, ouro, commodities e volatilidade", () => {
    expect(etfClass({ type: "EQUITY" }, "AAPL")).toBeNull();
    expect(etfClass({ type: "ETF", category: "Large Blend" }, "SPY")).toBe("equity");
    expect(etfClass({ type: "ETF", category: "Long Government" }, "TLT")).toBe("bond");
    expect(etfClass({ type: "ETF", category: "Commodities Focused", name: "SPDR Gold Shares" }, "GLD")).toBe("gold"); // prettier-ignore
    expect(etfClass({ type: "ETF", category: "Equity Precious Metals", name: "VanEck Gold Miners" }, "GDX")).toBe("equity"); // prettier-ignore
    expect(etfClass({ type: "ETF", category: "Commodities Focused", name: "United States Oil Fund" }, "USO")).toBe("commodity"); // prettier-ignore
    expect(etfClass({ type: "ETF", category: "Trading--Leveraged Equity", name: "ProShares Ultra VIX Short-Term Futures" }, "UVXY")).toBe("vol"); // prettier-ignore
  });
});

describe("ETF de ações (look-through)", () => {
  it("carteira barata e crescendo pontua acima de cara e parada", () => {
    const cheap = equityEtfFund({ eqPe: 15, eqPcf: 9, eqG3: 0.15, dy: 0.03 }, 25);
    const rich = equityEtfFund({ eqPe: 40, eqPcf: 30, eqG3: 0, dy: 0.004 }, 25);
    expect(cheap.score).toBeGreaterThan(65);
    expect(rich.score).toBeLessThan(35);
    expect(cheap.reasons[0]).toMatch(/P\/L da carteira 15,0/);
  });
  it("aceita o múltiplo invertido do Yahoo (rendimento) e cai no P/L do resumo", () => {
    expect(equityEtfFund({ eqPe: 0.05 }, 25).reasons[0]).toMatch(/P\/L da carteira 20,0/);
    expect(equityEtfFund({ pe: 20 }, 25).score).toBeGreaterThan(50);
    expect(equityEtfFund({}, 25)).toBeNull();
  });
});

describe("renda fixa", () => {
  it("margem de segurança = taxa ÷ duration; curto e longo", () => {
    const tlt = bondEtfFund({ type: "ETF", category: "Long Government" }, "TLT", M);
    expect(tlt.reasons[0]).toMatch(/duration 16,5 anos/);
    expect(tlt.reasons[0]).toMatch(/28 pontos-base/); // 4,6% / 16,5
    const shy = bondEtfFund({ type: "ETF", category: "Short Government" }, "SHY", M);
    expect(shy.parts.cushion).toBeGreaterThan(tlt.parts.cushion);
    expect(bondEtfFund({ type: "ETF", category: "Long Government" }, "TLT", {})).toBeNull();
    // Yahoo às vezes erra a duration (3,6 para o TLT): tabela vence; fora da faixa da categoria, ignora
    expect(durationOf({ category: "Long Government", duration: 3.62 }, "TLT")).toBe(16.5);
    expect(durationOf({ category: "Long Government", duration: 3.62 }, "XYZ")).toBe(15);
    expect(durationOf({ category: "Long Government", duration: 18 }, "XYZ")).toBe(18);
  });
  it("crédito usa o yield do próprio fundo", () => {
    const hy = bondEtfFund({ type: "ETF", category: "High Yield Bond", dy: 0.07 }, "HYG", M);
    expect(hy.reasons[0]).toMatch(/Taxa 7,00%/);
  });
});

describe("ouro", () => {
  it("juro real alto pesa contra; estima quando falta o real", () => {
    expect(goldFund({ real10: 2.5 }).score).toBeLessThan(goldFund({ real10: 0 }).score);
    expect(goldFund({ y10: 4.3 }).reasons[0]).toMatch(/estimado/);
    expect(goldFund({})).toBeNull();
  });
});

describe("alavancados", () => {
  it("custo de carregar: L(L−1)/2·σ² mais a taxa", () => {
    const c = carryCost(2, 1.0, 0.01); // ETF 2x com 100% de vol -> referência 50%
    expect(c.sigma).toBeCloseTo(0.5);
    expect(c.drag).toBeCloseTo(0.25);
    expect(c.total).toBeCloseTo(0.26);
    expect(carryCost(-3, 0.6, 0).drag).toBeCloseTo(6 * 0.04); // (9+3)/2 · 0,2²
  });
  it("NVDL herda a nota da NVDA menos o custo; TMV espelha a do TLT", () => {
    const nvda = { type: "EQUITY", pe: 30, fpe: 25, peg: 1, fcf: 6e10, marketCap: 3e12, roe: 0.8, margin: 0.5, debtEq: 20, revGrowth: 0.5, epsGrowth: 0.5 }; // prettier-ignore
    const p = fundPillar({ type: "ETF", name: "GraniteShares 2x Long NVDA Daily ETF" }, 25, {
      sym: "NVDL",
      bars: bars(),
      under: { sym: "NVDA", fund: nvda },
    });
    expect(p.score).toBeGreaterThan(30);
    expect(p.under.sym).toBe("NVDA");
    expect(p.reasons.join(" ")).toMatch(/Custo de carregar 2x comprado/);
    expect(p.conf).toBe("Baixa");
    const tlt = { type: "ETF", category: "Long Government" };
    const tmv = fundPillar({ type: "ETF", name: "Direxion Daily 20+ Year Treasury Bear 3X" }, 25, {
      sym: "TMV",
      bars: bars(),
      under: { sym: "TLT", fund: tlt },
      macro: M,
    });
    const base = fundPillar(tlt, 25, { sym: "TLT", macro: M });
    expect(tmv.under.score).toBeCloseTo(base.score);
    expect(tmv.reasons[0]).toMatch(/inverso: conta/);
  });
  it("sem o ativo de referência: sem nota, com o motivo", () => {
    const p = fundPillar({ type: "ETF", name: "x" }, 25, { sym: "NVDL" });
    expect(p.score).toBeNull();
    expect(p.reasons[0]).toMatch(/NVDA indisponíveis/);
  });
  it("analyzeTicker usa item.under/macro e o fundSub diz a base do cálculo", () => {
    const r = analyzeTicker("TLT", {
      bars: bars(),
      fund: { type: "ETF", category: "Long Government" },
      macro: M,
    });
    expect(Number.isFinite(r.pillars.fund.score)).toBe(true);
    const s = fundSub(r.pillars.fund, null, r.fund);
    expect(s.text).toMatch(/ETF: taxa, duration e juro real/);
    expect(s.conf).toBe("Média");
  });
});

describe("api/analyze: ETFs", () => {
  it("parseSummary lê taxa do fundProfile, carteira e duration", () => {
    const f = parseSummary({
      quoteSummary: {
        result: [
          {
            quoteType: { quoteType: "ETF" },
            fundProfile: { feesExpensesInvestment: { annualReportExpenseRatio: { raw: 0.0095 } } },
            topHoldings: {
              stockPosition: { raw: 0.99 },
              equityHoldings: { priceToEarnings: { raw: 0.04 }, priceToCashflow: { raw: 15 }, threeYearEarningsGrowth: { raw: 0.12 } }, // prettier-ignore
              bondHoldings: { duration: { raw: 0 } },
            },
          },
        ],
      },
    });
    expect(f.expense).toBe(0.0095);
    expect(f.eqPe).toBe(0.04);
    expect(f.eqG3).toBe(0.12);
    expect(f.stockPos).toBe(0.99);
  });
  it("etfNeeds: referência dos alavancados e juros para renda fixa/ouro", () => {
    const n = etfNeeds({
      NVDL: { fund: { type: "ETF", name: "x" } },
      TLT: { fund: { type: "ETF", category: "Long Government" } },
      AAPL: { fund: { type: "EQUITY" } },
    });
    expect(n.under).toEqual(["NVDA"]);
    expect(n.needMacro).toBe(true);
  });
  it("parseFredLast pega o último número e ignora '.'", () => {
    expect(parseFredLast("observation_date,DFII10\n2026-10-01,1.80\n2026-10-02,.\n2026-10-03,1.75\n2026-10-06,.")).toBe(1.75); // prettier-ignore
    expect(parseFredLast("")).toBeNull();
  });
});

describe("avisos fecháveis", () => {
  it("a chave ignora números: o mesmo aviso com outro preço continua fechado", () => {
    expect(noticeKey("<p>A 2,1% do stop 36,46</p>")).toBe(noticeKey("<p>A 0,8% do stop 35,10</p>"));
    expect(noticeKey("Perto do suporte 10")).not.toBe(noticeKey("Perto da resistência 10"));
  });
  it("desenha com ✕ e some depois de fechado", () => {
    const mem = {};
    globalThis.localStorage = {
      getItem: (k) => mem[k] ?? null,
      setItem: (k, v) => (mem[k] = v),
    };
    const html = dismissible("card alert-box", "<p>Aviso X</p>");
    expect(html).toMatch(/data-dismiss="/);
    dismiss(noticeKey("<p>Aviso X</p>"));
    expect(dismissible("card alert-box", "<p>Aviso X</p>")).toBe("");
    expect(dismissible("card alert-box", "<p>Aviso Y</p>")).toMatch(/Aviso Y/);
    delete globalThis.localStorage;
  });
});

describe("alavancados e cestas: trader sempre com fundamentos do ativo de referência", () => {
  const n = 300;
  const c = Array.from({ length: n }, (_, i) => 50 + i * 0.05 + 2 * Math.sin(i / 5));
  const bars = { c, o: c, h: c, l: c, v: c.map(() => 1e6), dates: c.map((_, i) => `d${i}`) };
  const nvda = { type: "EQUITY", price: 100, fpe: 25, pe: 30, roe: 0.5, margin: 0.4, revGrowth: 0.5, epsGrowth: 0.5, debtEq: 20, analysts: 40, target: 130, recMean: 1.6 }; // prettier-ignore

  it("etfNeeds pede o ativo de referência mesmo sem o resumo do ETF alavancado", () => {
    expect(etfNeeds({ NVDL: { fund: null } }).under).toEqual(["NVDA"]);
    expect(etfNeeds({ NVDL: {}, UCYB: { fund: null } }).under.sort()).toEqual(["CIBR", "NVDA"]);
  });

  it("NVDL sem resumo próprio: fundamentos e analistas vêm de NVDA", () => {
    const r = analyzeTicker("NVDL", { bars, fund: null, under: { sym: "NVDA", fund: nvda } });
    expect(r.pillars.fund.score).toBeGreaterThan(0);
    expect(r.pillars.analyst.score).toBeGreaterThan(60);
    expect(r.pillars.analyst.reasons[0]).toMatch(/NVDA/);
  });

  it("inverso espelha os analistas do ativo de referência", () => {
    const r = analyzeTicker("SQQQ", { bars, fund: null, under: { sym: "QQQ", fund: nvda } });
    expect(r.pillars.analyst.score).toBeLessThan(40);
  });

  it("cesta (UCYB -> CIBR): média ponderada das posições entra nos fundamentos e analistas", () => {
    const cheap = { ...nvda, fpe: 12, target: 140 };
    const dear = { ...nvda, fpe: 90, pe: 90, roe: 0.02, margin: 0.01, revGrowth: -0.1, epsGrowth: -0.2, target: 70 }; // prettier-ignore
    const cibr = { type: "ETF", name: "First Trust NASDAQ Cybersecurity ETF", category: "Technology", eqPe: 28 }; // prettier-ignore
    const basket = [
      { sym: "AAA", w: 0.3, fund: cheap },
      { sym: "BBB", w: 0.1, fund: dear },
    ];
    const r = analyzeTicker("UCYB", {
      bars,
      fund: null,
      under: { sym: "CIBR", fund: cibr, basket },
    });
    expect(r.pillars.fund.score).toBeGreaterThan(0);
    expect(r.pillars.fund.reasons.join(" ")).toMatch(/Média ponderada das 2 maiores posições/);
    expect(r.pillars.analyst.reasons[0]).toMatch(/2 maiores posições/);
    // peso maior da barata puxa a média para cima do caso simétrico
    const flip = [
      { sym: "AAA", w: 0.1, fund: cheap },
      { sym: "BBB", w: 0.3, fund: dear },
    ];
    const r2 = analyzeTicker("UCYB", { bars, fund: null, under: { sym: "CIBR", fund: cibr, basket: flip } }); // prettier-ignore
    expect(r.pillars.analyst.score).toBeGreaterThan(r2.pillars.analyst.score);
  });

  it("parseSummary guarda as maiores posições do fundo", () => {
    const f = parseSummary({ quoteSummary: { result: [{ topHoldings: { holdings: [{ symbol: "CRWD", holdingPercent: { raw: 0.06 } }, { symbol: "", holdingPercent: { raw: 0.5 } }] } }] } }); // prettier-ignore
    expect(f.holdings).toEqual([{ sym: "CRWD", w: 0.06 }]);
  });
});
