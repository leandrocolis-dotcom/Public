import { describe, it, expect } from "vitest";
import {
  effectiveMode,
  impliedByFuture,
  impliedYield,
  offQuote,
  offQuotes,
} from "../assets/offmarket.js";
import { regime } from "../assets/dash.js";

const sec = (iso) => Date.parse(iso) / 1000;
// quarta 7/out/2026: pregão regular fechou às 16:00 NY (20:00 UTC)
const spy = {
  p: 777.22,
  pc: 779.09,
  t: sec("2026-10-07T20:00:00Z"),
  xk: "post",
  xp: 777.05,
  xt: sec("2026-10-07T21:10:00Z"),
  xc: -0.0002,
};

describe("off market: preço implícito pelo futuro", () => {
  it("antes das 18:00 NY o futuro ainda compara com o fechamento anterior: base = pc do ativo", () => {
    const es = { p: 7850.25, pc: 7874, t: sec("2026-10-07T20:59:00Z") };
    const r = impliedByFuture(spy, es);
    expect(r.rolled).toBe(false);
    expect(r.p).toBeCloseTo(779.09 * (7850.25 / 7874), 6);
  });
  it("depois das 18:00 NY o futuro virou de sessão: base = último fechamento regular", () => {
    const es = { p: 7880, pc: 7851, t: sec("2026-10-07T23:30:00Z") };
    const r = impliedByFuture(spy, es);
    expect(r.rolled).toBe(true);
    expect(r.p).toBeCloseTo(777.22 * (7880 / 7851), 6);
    expect(r.chgVsClose).toBeCloseTo(7880 / 7851 - 1, 6);
  });
  it("relação inversa (dólar/iene × futuro de iene)", () => {
    const usdjpy = { p: 158, pc: 158, t: sec("2026-10-07T20:00:00Z") };
    const jy = { p: 0.0064, pc: 0.0063, t: sec("2026-10-07T23:30:00Z") };
    expect(impliedByFuture(usdjpy, jy, -1).p).toBeLessThan(158);
  });
});

describe("off market: escolha da fonte", () => {
  it("proxy exato (SPY ↔ ES) vence o pós-mercado", () => {
    const quotes = { SPY: spy, "ES=F": { p: 7880, pc: 7851, t: sec("2026-10-07T23:30:00Z") } };
    const q = offQuote("SPY", spy, quotes);
    expect(q.offSrc).toBe("fut");
    expect(q.regP).toBe(777.22);
    expect(q.pc).toBe(779.09); // fechamento anterior não muda
  });
  it("ação sem futuro usa o pré/pós", () => {
    const aapl = {
      p: 336.67,
      pc: 333.63,
      t: spy.t,
      xk: "post",
      xp: 336.55,
      xt: spy.xt,
      xc: -0.0004,
    };
    const q = offQuote("AAPL", aapl, { AAPL: aapl });
    expect(q.offSrc).toBe("post");
    expect(q.p).toBe(336.55);
  });
  it("setor sem pré/pós cai no proxy aproximado", () => {
    const xlf = { p: 50, pc: 50, t: spy.t };
    const q = offQuote("XLF", xlf, {
      XLF: xlf,
      "ES=F": { p: 7880, pc: 7851, t: sec("2026-10-07T23:30:00Z") },
    });
    expect(q.offSrc).toBe("fut~");
  });
  it("sem nada: mantém o regular", () => {
    const x = { p: 10, pc: 9, t: spy.t };
    expect(offQuote("ZZZ", x, {}).p).toBe(10);
  });
  it("futuros não são alterados", () => {
    const es = { p: 1, pc: 1, t: 1 };
    expect(offQuotes({ "ES=F": es })["ES=F"]).toBe(es);
  });
  it("modo efetivo", () => {
    expect(effectiveMode("auto", "open")).toBe("on");
    expect(effectiveMode("auto", "post")).toBe("off");
    expect(effectiveMode("auto", "closed")).toBe("off");
    expect(effectiveMode("on", "closed")).toBe("on");
    expect(effectiveMode("off", "open")).toBe("off");
  });
});

describe("off market: juros, mercado aberto e proxy por ETF", () => {
  const t0 = sec("2026-10-07T20:00:00Z");
  it("taxa implícita cai quando o futuro de Treasury sobe", () => {
    const tnx = { p: 5.28, pc: 5.27, t: t0 };
    const zn = { p: 111, pc: 110, t: sec("2026-10-07T23:30:00Z") };
    const r = impliedYield(tnx, zn, 6.5);
    expect(r.p).toBeCloseTo(5.28 - ((111 / 110 - 1) * 100) / 6.5, 6);
  });
  it("ativo com o próprio mercado aberto fica com o preço regular", () => {
    const dax = { p: 25000, pc: 24900, t: sec("2026-10-07T12:00:00Z"), ms: "REGULAR" };
    const q = offQuote("^GDAXI", dax, {}, sec("2026-10-07T12:10:00Z"));
    expect(q.offSrc).toBe("live");
    expect(q.p).toBe(25000);
  });
  it("Ibovespa acompanha o pós do EWZ", () => {
    const ewz = { p: 42, pc: 42.5, t: t0, xk: "post", xp: 42.42, xt: t0 + 1800, xc: 0.01 };
    const bvsp = { p: 200000, pc: 201000, t: t0 };
    const out = offQuotes({ EWZ: ewz, "^BVSP": bvsp }, t0 + 3600);
    expect(out["^BVSP"].offSrc).toBe("fut~");
    expect(out["^BVSP"].p).toBeCloseTo(200000 * 1.01, 0);
  });
});

describe("prévia do regime fora do pregão", () => {
  it("usa futuros e pré-mercado desde o último fechamento", async () => {
    const { regime } = await import("../assets/dash.js");
    const flat = (v) => Array(40).fill(v);
    const close = { SPY: flat(100), TLT: flat(100), HYG: flat(100), IEF: flat(100) };
    const quotes = {
      SPY: { p: 101, regP: 100, offSrc: "fut" },
      TLT: { p: 99, regP: 100, offSrc: "pre" },
      HYG: { p: 100.5, regP: 100, offSrc: "fut~" },
      "HG=F": { p: 4.4, pc: 4.4 },
      IEF: { p: 100, regP: 100, offSrc: "reg" },
    };
    const r = regime(close, 1, quotes);
    expect(r.on).toBe(3); // S&P 500 pelo futuro + SPY/TLT + HYG/IEF
    expect(r.live).toBe(3);
    expect(r.verdict).toBe("Risk-on");
    expect(r.items.find((x) => x.a === "SPY" && !x.b).c).toBeCloseTo(0.01);
    expect(r.items.find((x) => x.a === "SPY" && x.b === "TLT").c).toBeCloseTo(101 / 99 - 1);
  });
});

describe("pré/pós velho × futuro da sessão nova (domingo à noite)", () => {
  // dados reais de produção: domingo 11/10/2026 20:04 em NY; RSP com pós de sexta, ES=F já na sessão de segunda
  const now = Date.parse("2026-10-12T00:04:34Z") / 1000;
  const ES = { p: 7878.5, pc: 7859.75, t: 1791762870, ms: "REGULAR" };
  const RSP = {
    p: 213.04,
    pc: 211.87,
    t: 1791576000,
    ms: "CLOSED",
    xk: "post",
    xp: 213.14,
    xt: 1791590040,
  };
  it("usa o futuro, não o pós de sexta", () => {
    const q = offQuote("RSP", RSP, { "ES=F": ES }, now);
    expect(q.offSrc).toBe("fut~");
    expect(q.p / q.regP - 1).toBeCloseTo(7878.5 / 7859.75 - 1, 6);
  });
  it("pós da sessão corrente (recente) continua valendo", () => {
    const fresh = { ...RSP, xt: ES.t - 600 };
    expect(offQuote("RSP", fresh, { "ES=F": ES }, now).offSrc).toBe("post");
  });
});

describe("prévia do regime", () => {
  it("razão com as duas pontas no mesmo futuro sai da conta; só as com preço fora do pregão contam", () => {
    const close = { RSP: [100, 101], SPY: [100, 101], "HG=F": [1, 1], "GC=F": [1, 1] };
    const quotes = {
      RSP: { p: 101.2, regP: 101, offSrc: "fut~", offFut: "ES=F" },
      SPY: { p: 101.2, regP: 101, offSrc: "fut", offFut: "ES=F" },
      "HG=F": { p: 1.02, pc: 1 },
      "GC=F": { p: 1.0, pc: 1 },
    };
    const r = regime(close, 1, quotes);
    const amp = r.items.find((x) => x.a === "RSP");
    expect(amp.sameProxy).toBe(true);
    expect(amp.live).toBe(false);
    expect(r.n).toBe(2); // S&P 500 pelo futuro e cobre × ouro
    expect(r.on).toBe(2);
  });
});

describe("bolsa de fora fechada: ETF do país em NY (sem futuro no Yahoo)", () => {
  it("índice ≈ fechamento local anterior × variação do ETF desde o fechamento dele; sem dupla contagem", async () => {
    const { impliedByCountryEtf, offQuote } = await import("../assets/offmarket.js");
    const t = Date.parse("2026-11-20T15:00:00Z") / 1000; // 10h de NY: Coreia fechou às ~1h30 de NY
    const ks = { p: 4869.96, pc: 5137.89, t: t - 9 * 3600, ms: "POSTPOST" };
    const ewy = { p: 60.6, pc: 63.0, t }; // ETF em NY já embute a sessão de Seul
    const imp = impliedByCountryEtf(ks, ewy);
    expect(imp.fchg).toBeCloseTo(60.6 / 63 - 1, 6);
    expect(imp.p / ks.pc - 1).toBeCloseTo(60.6 / 63 - 1, 6);
    const q = offQuote("^KS11", ks, { EWY: ewy }, t);
    expect(q.offSrc).toBe("fut~");
    expect(q.offFut).toBe("EWY");
    // ETF sem negócio depois do fechamento local: fica o fechamento local
    expect(impliedByCountryEtf(ks, { p: 60, pc: 63, t: ks.t - 60 })).toBeNull();
    // bolsa aberta: vale o preço dela
    const open = { p: 5000, pc: 4900, t: t - 60, ms: "REGULAR" };
    expect(offQuote("^KS11", open, { EWY: ewy }, t).offSrc).toBe("live");
  });
});
