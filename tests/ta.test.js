import { describe, it, expect } from "vitest";
import {
  sma, ema, rsi, macd, bollinger, stochastic, atr, adx, obv, cmf, mfi, swings, levels, dowStructure,
  pivotsClassic, fibonacci, divergence, candlePatterns, vwapSessions, trueRange, roc,
} from "../assets/ta.js"; // prettier-ignore
import { walk } from "./helpers.js";

const close = (a, b, d = 6) => expect(Math.abs(a - b)).toBeLessThan(10 ** -d);

/** Série clássica de 14 dias usada para ensinar o RSI de Wilder. */
const RSI_SAMPLE = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28,
  46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
];

function bars(rows) {
  return {
    o: rows.map((r) => r[0]),
    h: rows.map((r) => r[1]),
    l: rows.map((r) => r[2]),
    c: rows.map((r) => r[3]),
    v: rows.map((r) => r[4] ?? 1000),
  };
}

describe("médias", () => {
  it("sma e ema com valores conhecidos", () => {
    const s = sma([1, 2, 3, 4, 5], 3);
    expect(s).toEqual([null, null, 2, 3, 4]);
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e.slice(0, 2)).toEqual([null, null]);
    close(e[2], 2);
    close(e[3], 3); // 4*0.5 + 2*0.5
    close(e[4], 4);
  });
  it("sma aceita nulos no começo", () => {
    expect(sma([null, null, 2, 4, 6], 2)).toEqual([null, null, null, 3, 5]);
  });
});

describe("rsi", () => {
  it("reproduz o cálculo de Wilder (suavização, não média simples)", () => {
    const r = rsi(RSI_SAMPLE, 14);
    expect(r.slice(0, 14).every((x) => x === null)).toBe(true);
    // primeira leitura: média simples dos 14 primeiros ganhos/perdas
    let g = 0,
      l = 0;
    for (let i = 1; i <= 14; i++) {
      const d = RSI_SAMPLE[i] - RSI_SAMPLE[i - 1];
      if (d > 0) g += d;
      else l -= d;
    }
    close(r[14], 100 - 100 / (1 + g / l), 9);
    expect(r[14]).toBeGreaterThan(70);
    expect(r[14]).toBeLessThan(71);
    // a segunda usa a suavização (g*13 + ganho)/14
    const d15 = RSI_SAMPLE[15] - RSI_SAMPLE[14];
    const g2 = ((g / 14) * 13 + Math.max(d15, 0)) / 14;
    const l2 = ((l / 14) * 13 + Math.max(-d15, 0)) / 14;
    close(r[15], 100 - 100 / (1 + g2 / l2), 9);
  });
  it("limites: só alta = 100, só queda = 0, plano = 50", () => {
    expect(
      rsi(
        Array.from({ length: 30 }, (_, i) => i),
        14,
      ).at(-1),
    ).toBe(100);
    expect(
      rsi(
        Array.from({ length: 30 }, (_, i) => -i),
        14,
      ).at(-1),
    ).toBeCloseTo(0, 9);
    expect(rsi(Array(30).fill(5), 14).at(-1)).toBe(50);
  });
});

describe("macd e bollinger", () => {
  it("macd de série constante é zero", () => {
    const m = macd(Array(60).fill(10));
    close(m.line.at(-1), 0);
    close(m.hist.at(-1), 0);
  });
  it("macd positivo em alta constante", () => {
    const m = macd(Array.from({ length: 80 }, (_, i) => 100 + i));
    expect(m.line.at(-1)).toBeGreaterThan(0);
  });
  it("bollinger: bandas simétricas, %B = 0,5 na média e largura zero em série constante", () => {
    const c = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i));
    const b = bollinger(c, 20, 2);
    close(b.up[30] - b.mid[30], b.mid[30] - b.lo[30]);
    const flat = bollinger(Array(30).fill(7), 20, 2);
    expect(flat.bw.at(-1)).toBe(0);
    expect(flat.pctB.at(-1)).toBe(0.5);
  });
});

describe("volatilidade e tendência", () => {
  it("true range considera o gap contra o fechamento anterior", () => {
    expect(trueRange([10, 15], [9, 14], [9.5, 14.5])[1]).toBe(5.5); // |15 - 9,5|
  });
  it("atr de barras de amplitude fixa 2 = 2", () => {
    const h = Array.from({ length: 30 }, (_, i) => 12 + i * 0);
    const l = h.map((x) => x - 2);
    const c = h.map((x) => x - 1);
    close(atr(h, l, c, 14).at(-1), 2);
  });
  it("adx alto e +DI > -DI em tendência de alta limpa; baixo em ruído", () => {
    const n = 80;
    const c = Array.from({ length: n }, (_, i) => 100 + i);
    const t = adx(
      c.map((x) => x + 0.5),
      c.map((x) => x - 0.5),
      c,
      14,
    );
    expect(t.adx.at(-1)).toBeGreaterThan(40);
    expect(t.pdi.at(-1)).toBeGreaterThan(t.mdi.at(-1));
    const z = Array.from({ length: n }, (_, i) => 100 + (i % 2 ? 1 : -1));
    const q = adx(
      z.map((x) => x + 0.5),
      z.map((x) => x - 0.5),
      z,
      14,
    );
    expect(q.adx.at(-1)).toBeLessThan(20);
  });
  it("estocástico: fechar na máxima = 100, na mínima = 0", () => {
    const h = Array.from({ length: 30 }, (_, i) => 10 + i);
    const l = h.map((x) => x - 1);
    const s = stochastic(h, l, h, 14, 1, 1);
    close(s.k.at(-1), 100);
    const hd = Array.from({ length: 30 }, (_, i) => 50 - i);
    const ld = hd.map((x) => x - 1);
    expect(stochastic(hd, ld, ld, 14, 1, 1).k.at(-1)).toBeCloseTo(0, 9);
  });
  it("roc", () => {
    close(roc([100, 110, 121], 2)[2], 0.21);
  });
});

describe("volume", () => {
  it("obv soma nos dias de alta e subtrai nos de queda", () => {
    expect(obv([10, 11, 10, 10], [5, 100, 40, 7])).toEqual([0, 100, 60, 60]);
  });
  it("cmf positivo quando fecha na máxima; negativo quando fecha na mínima", () => {
    const h = Array(25).fill(11),
      l = Array(25).fill(9),
      v = Array(25).fill(100);
    expect(cmf(h, l, Array(25).fill(11), v, 20).at(-1)).toBeCloseTo(1, 9);
    expect(cmf(h, l, Array(25).fill(9), v, 20).at(-1)).toBeCloseTo(-1, 9);
  });
  it("mfi 100 em alta contínua", () => {
    const c = Array.from({ length: 30 }, (_, i) => 10 + i);
    expect(mfi(c, c, c, Array(30).fill(10), 14).at(-1)).toBe(100);
  });
  it("vwap reinicia a cada sessão e pondera por volume", () => {
    const h = [10, 12, 20],
      l = [10, 12, 20],
      c = [10, 12, 20],
      v = [100, 300, 50];
    const w = vwapSessions(h, l, c, v, ["a", "a", "b"]);
    close(w.vwap[1], (10 * 100 + 12 * 300) / 400);
    expect(w.vwap[2]).toBe(20);
  });
});

describe("estrutura", () => {
  const zig = [10, 12, 14, 12, 10, 12, 15, 13, 11, 13, 16, 14, 12, 14, 17, 15, 13, 15, 18, 16];
  const h = zig.map((x) => x + 0.2),
    l = zig.map((x) => x - 0.2);
  it("swings acham topos e fundos e a estrutura de Dow é de alta", () => {
    const sw = swings(h, l, 2);
    expect(sw.filter((s) => s.type === "H").length).toBeGreaterThanOrEqual(3);
    expect(sw.filter((s) => s.type === "L").length).toBeGreaterThanOrEqual(3);
    expect(dowStructure(sw).trend).toBe("up");
  });
  it("estrutura de baixa é detectada", () => {
    const d = zig.map((x) => 30 - x);
    const sw = swings(
      d.map((x) => x + 0.2),
      d.map((x) => x - 0.2),
      2,
    );
    expect(dowStructure(sw).trend).toBe("down");
  });
  it("níveis agrupam pivôs próximos e separam suporte de resistência", () => {
    const sw = [
      { i: 1, price: 100, type: "L" },
      { i: 5, price: 100.3, type: "L" },
      { i: 9, price: 120, type: "H" },
      { i: 13, price: 119.8, type: "H" },
      { i: 17, price: 110, type: "L" },
    ];
    const lv = levels(sw, 112, 1);
    expect(lv.resistances[0].price).toBeCloseTo(119.9, 1);
    expect(lv.resistances[0].touches).toBe(2);
    expect(lv.supports[0].price).toBeLessThan(112);
  });
  it("pivôs clássicos", () => {
    const p = pivotsClassic(110, 100, 106);
    close(p.p, 105.333333, 5);
    close(p.r1, 2 * p.p - 100);
    close(p.s1, 2 * p.p - 110);
    close(p.r2, p.p + 10);
  });
  it("fibonacci de uma perna de alta", () => {
    const f = fibonacci(
      [
        { i: 1, price: 100, type: "L" },
        { i: 9, price: 200, type: "H" },
      ],
      150,
    );
    expect(f.dir).toBe("up");
    close(f.retr, 0.5);
    close(f.levels.find((x) => x.r === 0.618).price, 200 - 61.8);
  });
  it("divergência de alta: preço faz fundo mais baixo e rsi mais alto", () => {
    const sw = [
      { i: 10, price: 100, type: "L" },
      { i: 30, price: 95, type: "L" },
    ];
    const osc = Array(40).fill(50);
    osc[10] = 25;
    osc[30] = 35;
    expect(divergence(sw, osc, 35).bullish).toBe(true);
    expect(divergence(sw, osc, 35).bearish).toBe(false);
    expect(divergence(sw, osc, 100).bullish).toBe(false); // antigo demais
  });
});

describe("candles", () => {
  const down = [
    [20, 20.2, 19.8, 20],
    [19.8, 20, 19.4, 19.5],
    [19.4, 19.5, 18.9, 19],
    [19, 19.1, 18.5, 18.6],
    [18.6, 18.7, 18.0, 18.2],
  ];
  it("martelo depois de queda", () => {
    const b = bars([...down, [18.1, 18.2, 17.0, 18.15]]);
    const p = candlePatterns(b, 5, 0.5);
    expect(p.map((x) => x.id)).toContain("hammer");
  });
  it("engolfo de alta depois de queda", () => {
    const b = bars([...down, [18.3, 18.35, 17.7, 17.8], [17.7, 18.7, 17.6, 18.6]]);
    const p = candlePatterns(b, 6, 0.5);
    expect(p.map((x) => x.id)).toContain("bull-engulf");
  });
  it("doji e estrela cadente", () => {
    const up = down.map((r) => r.map((x) => 40 - x));
    const b = bars([...up, [21.9, 23.0, 21.85, 21.95]]);
    expect(candlePatterns(b, 5, 0.5).map((x) => x.id)).toContain("shooting");
    const d = bars([...down, [18, 18.5, 17.5, 18.02]]);
    expect(candlePatterns(d, 5, 0.5).map((x) => x.id)).toContain("doji");
  });
  it("sem padrão em barra sem amplitude", () => {
    expect(candlePatterns(bars([...down, [18, 18, 18, 18]]), 5, 0.5)).toEqual([]);
  });
});

describe("robustez", () => {
  it("séries curtas não quebram", () => {
    const c = walk(10);
    expect(rsi(c).every((x) => x === null)).toBe(true);
    expect(macd(c).line.every((x) => x === null)).toBe(true);
    expect(adx(c, c, c).adx.every((x) => x === null)).toBe(true);
  });
});
