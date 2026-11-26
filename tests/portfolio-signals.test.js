import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseNumber,
  parseInvestingPortfolio,
  detectDecimal,
  valuePortfolio,
  isLeveraged,
  upsertHolding,
  removeHolding,
} from "../assets/portfolio.js";
import { indicators, signalsFor, ruleStats, RULES, rsiAt } from "../assets/signals.js";
import { parseExtra, SYMBOLS } from "../api/quotes.js";
import { parseSymbols, parseChart } from "../api/history.js";

const PASTE = readFileSync(new URL("./fixtures/investing-portfolio.txt", import.meta.url), "utf8");

describe("parser da carteira do Investing", () => {
  it("números no formato do Investing e pt-BR", () => {
    expect(parseNumber("$1,572.25")).toBe(1572.25);
    expect(parseNumber("-$13.62")).toBe(-13.62);
    expect(parseNumber("8.33%")).toBe(8.33);
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("(1.2)")).toBe(-1.2);
    expect(parseNumber("-")).toBeNull();
  });
  it("lê a tela colada (formato exato do Investing): posições e totais batem", () => {
    const { holdings, warnings, ignored } = parseInvestingPortfolio(PASTE);
    expect(warnings).toEqual([]);
    expect(ignored).toEqual([]);
    expect(holdings.map((h) => h.sym)).toEqual(["AAAA", "BBBB", "CCCC", "DDDD", "EEEE", "FFFF"]);
    expect(holdings[0]).toEqual({
      sym: "AAAA",
      qty: 50.5,
      avg: 10,
      invPrice: 10,
      invValue: 505,
      boughtToday: true,
    });
    // comprados hoje: Daily P/L% = Net P/L% no Investing
    expect(holdings.filter((h) => h.boughtToday).map((h) => h.sym)).toEqual([
      "AAAA",
      "BBBB",
      "FFFF",
    ]);
    const v = valuePortfolio(holdings); // sem cotação ao vivo: usa o preço colado
    expect(v.total).toBeCloseTo(2983.12, 1); // soma dos Market Value colados
    expect(v.netPL).toBeCloseTo(5.13, 1); // soma dos Net P/L colados
    expect(v.missingQuotes.length).toBe(6);
    expect(v.leveragedWeight).toBe(0);
  });
  it("também aceita colagem separada por espaços e sem cabeçalho", () => {
    const { holdings } = parseInvestingPortfolio(
      "AAPL   10   150.00   170.00   $1,700.00\nMSFT  2  300  310  $620",
    );
    expect(holdings.map((h) => [h.sym, h.qty, h.avg])).toEqual([
      ["AAPL", 10, 150],
      ["MSFT", 2, 300],
    ]);
  });
  it("soma lotes repetidos com preço médio ponderado e avisa divergência de valor", () => {
    const { holdings, warnings } = parseInvestingPortfolio(
      "Symbol\tAmount\tAvg Price\tCurrent Price\tMarket Value\nXYZ\t10\t10\t11\t$110\nXYZ\t10\t20\t11\t$999",
    );
    expect(holdings).toHaveLength(1);
    expect(holdings[0].qty).toBe(20);
    expect(holdings[0].avg).toBe(15);
    expect(warnings.some((w) => w.includes("mais de uma vez"))).toBe(true);
    expect(warnings.some((w) => w.includes("difere"))).toBe(true);
  });
  it("texto sem posições gera aviso", () => {
    expect(parseInvestingPortfolio("bom dia").warnings[0]).toContain("Nenhuma posição");
  });
  it("valorização com cotação ao vivo: dia e total", () => {
    const holdings = [
      { sym: "FAS", qty: 5, avg: 140 },
      { sym: "CIBR", qty: 4, avg: 100, invPrice: 105 },
    ];
    const v = valuePortfolio(holdings, {
      FAS: { p: 150, pc: 145, t: 1, n: "Direxion Financial Bull 3X ETF" },
    });
    const fas = v.rows.find((r) => r.sym === "FAS");
    expect(fas.live).toBe(true);
    expect(fas.leveraged).toBe(true);
    expect(v.missingQuotes).toEqual(["CIBR"]); // sem cotação: usa o preço colado
    expect(v.rows.find((r) => r.sym === "CIBR").value).toBe(420);
    expect(fas.value).toBeCloseTo(5 * 150, 6);
    expect(fas.dayPL).toBeCloseTo(5 * 5, 6);
    expect(fas.netPLPct).toBeCloseTo(150 / 140 - 1, 6);
    expect(v.rows.reduce((a, r) => a + r.weight, 0)).toBeCloseTo(1, 10);
  });
  it("no dia da compra, o resultado do dia parte do preço médio (como no Investing)", () => {
    const h = [{ sym: "KKKK", qty: 20, avg: 25, openedOn: "2026-10-06" }];
    const q = { KKKK: { p: 24, pc: 26, t: 1 } };
    const day0 = valuePortfolio(h, q, { today: "2026-10-06" }).rows[0];
    expect(day0.dayPLPct).toBeCloseTo(24 / 25 - 1, 6); // igual ao Investing
    const day1 = valuePortfolio(h, q, { today: "2026-10-07" }).rows[0];
    expect(day1.dayPLPct).toBeCloseTo(24 / 26 - 1, 6); // dia seguinte: desde o fechamento
  });
  it("detecta ETF alavancado por lista e pelo nome", () => {
    expect(isLeveraged("FAS")).toBe(true);
    expect(isLeveraged("XYZ", "Something 3X Long ETF")).toBe(true);
    expect(isLeveraged("FTNT", "Fortinet, Inc.")).toBe(false);
  });
});

/** Série sintética: tendência e choques controlados. */
const series = (n, f) => Array.from({ length: n }, (_, i) => f(i));

describe("sinais", () => {
  it("RSI: alta contínua = 100", () => {
    expect(
      rsiAt(
        series(30, (i) => 100 + i),
        29,
      ),
    ).toBe(100);
  });
  it("recuo em tendência de alta dispara entrada", () => {
    const s = series(260, (i) => 100 * 1.002 ** i * (1 + 0.004 * Math.sin(i)));
    const n = s.length;
    for (let k = 5; k >= 1; k--) s[n - 1 - k] = s[n - 2 - k] * 0.985; // 5 dias de queda
    s[n - 1] = s[n - 2] * 1.002; // hoje estabiliza
    const sig = signalsFor(s, { sym: "X" });
    expect(sig.map((x) => x.code)).toContain("dip");
    expect(sig.find((x) => x.code === "dip").kind).toBe("entry");
  });
  it("alta esticada dispara saída", () => {
    const s = series(260, (i) => 100 * (1 + 0.01 * Math.sin(i / 3)));
    const n = s.length;
    for (let k = 7; k >= 0; k--) s[n - 1 - k] = s[n - 2 - k] * 1.03;
    const sig = signalsFor(s, { sym: "X" });
    expect(sig.map((x) => x.code)).toContain("stretched");
  });
  it("perda da MM200 vira alerta de risco", () => {
    const s = series(260, (i) => 100 + 0.05 * i);
    const n = s.length;
    const ma200 = s.slice(n - 200).reduce((a, b) => a + b, 0) / 200;
    s[n - 1] = ma200 * 0.97;
    const x = indicators(s, n - 1);
    expect(x.price).toBeLessThan(x.ma200);
    expect(signalsFor(s, { sym: "X" }).find((g) => g.code === "lost200").kind).toBe("risk");
  });
  it("série curta não gera sinal", () => {
    expect(signalsFor([1, 2, 3])).toEqual([]);
  });
  it("histórico das regras traz base e as 6 regras", () => {
    const p = JSON.parse(readFileSync(new URL("../data/prices.json", import.meta.url)));
    const st = ruleStats([p.series.SPY, p.series.QQQ, p.series.EWZ]);
    expect(Object.keys(st.rules)).toEqual(RULES.map((r) => r.code));
    expect(st.base.n).toBeGreaterThan(1000);
    expect(st.base.upRate).toBeGreaterThan(0);
  });
});

describe("funções da Vercel: validação de entrada", () => {
  it("quotes: extras só com formato válido, sem repetir o universo, no máximo 60", () => {
    const x = parseExtra("labd, NVDL,../etc,SPY,a b,FAS,FAS");
    expect(x).toEqual(["LABD", "NVDL", "FAS"]);
    expect(SYMBOLS).toContain("SPY");
    expect(parseExtra(Array.from({ length: 80 }, (_, i) => `T${i}`).join(","))).toHaveLength(60);
  });
  it("history: símbolos válidos (máx. 40) e conversão da resposta do Yahoo", () => {
    expect(parseSymbols("abc,,$$$,PETR4.SA")).toEqual(["ABC", "PETR4.SA"]);
    const chart = {
      chart: {
        result: [
          {
            timestamp: [1791244800, 1791331200],
            meta: { longName: "Teste", exchangeTimezoneName: "America/New_York" },
            indicators: { quote: [{ close: [10, null] }] },
          },
        ],
      },
    };
    expect(parseChart(chart)).toEqual({ dates: ["2026-10-05"], close: [10], name: "Teste" });
  });
});

describe("pré/pós-mercado na carteira", () => {
  it("no pré/pós o valor segue o preço estendido ao vivo", () => {
    const v = valuePortfolio(
      [
        { sym: "AAA", qty: 10, avg: 90 },
        { sym: "BBB", qty: 5, avg: 20 },
      ],
      { AAA: { p: 100, pc: 98, t: 1, xk: "pre", xp: 102, xt: 2 }, BBB: { p: 20, pc: 20, t: 1 } },
    );
    const a = v.rows.find((r) => r.sym === "AAA");
    expect(a.price).toBe(102);
    expect(a.value).toBe(1020); // quantidade × preço do pré
    expect(a.dayPL).toBeCloseTo(40); // desde o fechamento anterior (98)
    expect(a.src).toBe("pre");
    expect(a.quoteTime).toBe(2);
    expect(v.total).toBe(1120);
    expect(a.extPL).toBeCloseTo(20); // movimento só do pré, desde o regular (100)
    expect(a.xc).toBeCloseTo(0.02);
    expect(v.extPL).toBeCloseTo(20);
    expect(v.extCount).toBe(1);
    expect(v.extKind).toBe("pre");
  });

  it("estendido mais velho que o regular não vale", () => {
    const v = valuePortfolio([{ sym: "AAA", qty: 10, avg: 90 }], {
      AAA: { p: 100, pc: 98, t: 5, xk: "post", xp: 99, xt: 3 },
    });
    expect(v.rows[0].value).toBe(1000);
    expect(v.extPL).toBeNull();
  });

  it("modo Off: o pré do próprio ativo vence o implícito pelo futuro", () => {
    const q = {
      p: 101,
      regP: 100,
      regT: 10,
      t: 20,
      pc: 98,
      offSrc: "fut",
      xk: "pre",
      xp: 103,
      xt: 15,
    };
    const r = valuePortfolio([{ sym: "QQQ", qty: 2, avg: 90 }], { QQQ: q }).rows[0];
    expect(r.price).toBe(103);
    expect(r.src).toBe("pre");
    expect(r.extPL).toBeCloseTo(6); // 2 × (103 − 100)
    expect(r.xc).toBeCloseTo(0.03);
  });
});

describe("ajuste manual da carteira", () => {
  const base = [
    { sym: "SPY", qty: 10, avg: 650, invPrice: 670, invValue: 6700 },
    { sym: "QQQ", qty: 5, avg: 500 },
  ];
  it("edita quantidade e preço médio (aceita vírgula) e mantém a ordem e o preço colado", () => {
    const r = upsertHolding(base, { from: "SPY", sym: "SPY", qty: "12,5", avg: "648,30" });
    expect(r.holdings.map((h) => h.sym)).toEqual(["SPY", "QQQ"]);
    expect(r.holdings[0]).toMatchObject({ qty: 12.5, avg: 648.3, invPrice: 670, manual: true });
    expect(base[0].qty).toBe(10); // não altera a lista original
  });
  it("inclui ativo novo e renomeia sem duplicar", () => {
    expect(upsertHolding(base, { sym: "tqqq", qty: 3, avg: 80 }).holdings.at(-1)).toMatchObject({
      sym: "TQQQ",
      qty: 3,
      avg: 80,
    });
    const ren = upsertHolding(base, { from: "QQQ", sym: "SPY", qty: 1, avg: 1 }).holdings;
    expect(ren.map((h) => h.sym)).toEqual(["SPY"]);
    expect(ren[0].invPrice).toBeUndefined(); // preço colado do QQQ não vale para o SPY
  });
  it("recusa valores inválidos", () => {
    expect(upsertHolding(base, { from: "SPY", sym: "SPY", qty: "0", avg: 1 }).error).toMatch(
      /Quantidade/,
    );
    expect(upsertHolding(base, { from: "SPY", sym: "SPY", qty: 1, avg: "" }).error).toMatch(
      /médio/,
    );
    expect(upsertHolding(base, { sym: "??", qty: 1, avg: 1 }).error).toMatch(/Símbolo/);
  });
  it("remove posição e a valorização reflete o ajuste", () => {
    expect(removeHolding(base, "SPY").map((h) => h.sym)).toEqual(["QQQ"]);
    const { holdings } = upsertHolding(base, { from: "QQQ", sym: "QQQ", qty: 4, avg: 450 });
    const v = valuePortfolio(holdings, { QQQ: { p: 500, pc: 490, t: 1 } });
    const q = v.rows.find((x) => x.sym === "QQQ");
    expect(q.cost).toBe(1800);
    expect(q.netPL).toBe(200);
  });
});

describe("separador decimal da colagem (Investing em inglês ou português)", () => {
  it("parseNumber resolve o caso ambíguo pelo separador informado", () => {
    expect(parseNumber("1.234", ",")).toBe(1234);
    expect(parseNumber("1.234", ".")).toBe(1.234);
    expect(parseNumber("1,234", ",")).toBe(1.234);
    expect(parseNumber("1,234", ".")).toBe(1234);
    expect(parseNumber("1.234.567", ",")).toBe(1234567);
    expect(parseNumber("12,50", ".")).toBe(12.5);
  });
  it("detecta pt-BR pela colagem inteira e lê 1.234 como milhar", () => {
    const txt =
      "Símbolo\tQuantidade\tPreço médio\tPreço atual\tValor de mercado\nAAA\t2\t1.234\t1.300\t2.600,00\nBBB\t10\t12,5\t13,1\t131,00";
    expect(detectDecimal(txt).dec).toBe(",");
    const { holdings, dec } = parseInvestingPortfolio(txt);
    expect(dec).toBe(",");
    expect(holdings.map((h) => [h.sym, h.avg, h.invPrice])).toEqual([
      ["AAA", 1234, 1300],
      ["BBB", 12.5, 13.1],
    ]);
  });
  it("detecta en-US e lê 1,234 como milhar", () => {
    const txt =
      "Symbol\tAmount\tAvg Price\tCurrent Price\tMarket Value\nAAA\t2\t1,234\t1,300\t$2,600.00";
    const { holdings } = parseInvestingPortfolio(txt);
    expect(holdings[0]).toMatchObject({ avg: 1234, invPrice: 1300, invValue: 2600 });
  });
  it("usa a cotação online para desfazer a ambiguidade quando a colagem não decide", () => {
    const txt = "XYZ  3  1.250  1.310";
    expect(parseInvestingPortfolio(txt).holdings[0].avg).toBe(1.25);
    const { holdings, warnings } = parseInvestingPortfolio(txt, { refPrices: { XYZ: 1300 } });
    expect(holdings[0]).toMatchObject({ avg: 1250, invPrice: 1310 });
    expect(warnings.some((w) => w.includes("separador"))).toBe(true);
  });
});
