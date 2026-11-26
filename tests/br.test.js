import { describe, expect, it } from "vitest";
import {
  brExtQuotes,
  BR_SECTORS,
  BR_SYMBOLS,
  b3Session,
  brBreadth,
  brMacro,
  brMovers,
  brRegime,
  brSectors,
  buildClose,
  focusPick,
  mergeLive,
  realizedVol,
} from "../assets/br.js";
import { SYMBOLS, parseExtra } from "../api/quotes.js";
import { freshestQuotes } from "../assets/br.js";
import { ADDABLE, normalizeExtra } from "../assets/dash-extra.js";
import { BR_PANELS } from "../assets/br-universe.js";
import { focusUrl } from "../api/_bcb.js";

const DATES = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10)); // prettier-ignore
const ser = (f) => ({ dates: DATES, close: DATES.map((_, i) => f(i)) });

describe("Local (Brasil): séries", () => {
  it("cotação ao vivo troca o fechamento do dia ou acrescenta o pregão novo", () => {
    const src = { dates: ["2026-10-26", "2026-10-27"], close: [100, 101] };
    const t27 = Date.parse("2026-10-27T15:00:00Z") / 1000;
    const t28 = Date.parse("2026-10-28T15:00:00Z") / 1000;
    expect(mergeLive(src, { p: 102, t: t27 }).close).toEqual([100, 102]);
    const n = mergeLive(src, { p: 103, t: t28 });
    expect(n.dates.at(-1)).toBe("2026-10-28");
    expect(n.close).toEqual([100, 101, 103]);
    expect(mergeLive(src, null)).toBe(src);
  });

  it("monta Ibovespa em US$, real invertido e cestas de setores", () => {
    const hist = { "^BVSP": ser((i) => 100 + i), "BRL=X": ser(() => 5) };
    for (const s of BR_SECTORS[0].members) hist[s] = ser((i) => 10 + i);
    const { close, dates } = buildClose(hist, {});
    expect(dates).toHaveLength(60);
    expect(close.IBOV_USD.at(-1)).toBeCloseTo(159 / 5);
    expect(close.BRLUSD.at(-1)).toBeCloseTo(0.2);
    expect(close["S:fin"][0]).toBeCloseTo(1);
    expect(close["S:fin"].at(-1)).toBeCloseTo(69 / 10);
    expect(buildClose({}, {})).toBeNull();
  });

  it("os símbolos cabem numa busca de cotações (?only=1, inclusive índices com ^)", () => {
    expect(BR_SYMBOLS.length).toBeLessThanOrEqual(180);
    expect(BR_SYMBOLS).toContain("^BVSP");
    expect(parseExtra(BR_SYMBOLS.join(","), { only: true })).toEqual(BR_SYMBOLS);
  });
});

describe("Local (Brasil): regime, setores e amplitude", () => {
  const up = (i) => 100 * 1.01 ** i;
  const dn = (i) => 100 * 0.99 ** i;
  const flat = () => 100;

  it("risk-on quando bolsa, small, real e prefixados sobem", () => {
    const hist = {
      "^BVSP": ser(up),
      "BOVA11.SA": ser(up),
      "SMAL11.SA": ser((i) => 100 * 1.02 ** i),
      "LFTS11.SA": ser(flat),
      "IRFM11.SA": ser(up),
      "BRL=X": ser(dn),
      EWZ: ser(up),
      EEM: ser(flat),
    };
    const rg = brRegime(buildClose(hist, {}).close, 1);
    expect(rg.n).toBe(5);
    expect(rg.on).toBe(5);
    expect(rg.verdict).toBe("Risk-on");
  });

  it("estresse quando o dólar dispara e os prefixados apanham", () => {
    const hist = {
      "^BVSP": ser(dn),
      "BOVA11.SA": ser(dn),
      "LFTS11.SA": ser(flat),
      "IRFM11.SA": ser((i) => (i < 59 ? 100 : 99)),
      "BRL=X": ser((i) => (i < 59 ? 5 : 5.1)),
    };
    const rg = brRegime(buildClose(hist, {}).close, 1);
    expect(rg.stress).toBe(true);
    expect(rg.verdict).toMatch(/Estresse/);
  });

  it("setores, maiores altas/baixas e amplitude", () => {
    const hist = { "^BVSP": ser(flat) };
    BR_SECTORS.forEach((s, k) =>
      s.members.forEach((m) => (hist[m] = ser((i) => 100 * (1 + (k - 5) / 100) ** i))),
    );
    const { close } = buildClose(hist, {});
    const sec = brSectors(close, 1);
    expect(sec[0].key).toBe(BR_SECTORS.at(-1).key);
    expect(sec.at(-1).key).toBe(BR_SECTORS[0].key);
    const mv = brMovers(close, 1, 3);
    expect(mv.up).toHaveLength(3);
    expect(mv.up[0].c).toBeGreaterThan(mv.dn[0].c);
    const bd = brBreadth(close, 1);
    expect(bd.up).toBeGreaterThan(0.3);
    expect(bd.up).toBeLessThan(0.7);
  });

  it("volatilidade realizada e percentil", () => {
    const s = DATES.map((_, i) => 100 + (i % 2 ? 1 : -1) * (i > 40 ? 3 : 0.5));
    const v = realizedVol(s);
    expect(v.v).toBeGreaterThan(0.3);
    expect(v.pct).toBe(1);
    expect(realizedVol([1, 2])).toBeNull();
  });
});

describe("Local (Brasil): sessão da B3", () => {
  it("pregão até 17:00 com os EUA no horário de verão e até 18:00 fora dele", () => {
    expect(b3Session(new Date("2026-10-28T19:30:00Z")).id).toBe("open"); // 16:30 BRT
    expect(b3Session(new Date("2026-10-28T20:30:00Z")).id).toBe("closed"); // 17:30 BRT
    expect(b3Session(new Date("2026-12-02T20:30:00Z")).id).toBe("open"); // 17:30 BRT, EUA sem verão
    expect(b3Session(new Date("2026-10-28T12:50:00Z")).id).toBe("pre"); // 9:50 BRT
    expect(b3Session(new Date("2026-10-31T15:00:00Z")).id).toBe("closed"); // sábado
  });
});

describe("Local (Brasil): macro do BCB", () => {
  const sgs = (vals, d0 = 1) =>
    vals.map((v, i) => ({ data: `${String(d0 + i).padStart(2, "0")}/09/2026`, valor: String(v) }));
  const focus = [
    { Indicador: "Selic", DataReferencia: "2027", Data: "2026-10-23", Mediana: 12.25 },
    { Indicador: "IPCA", DataReferencia: "2027", Data: "2026-10-23", Mediana: 4.0 },
    { Indicador: "IPCA", DataReferencia: "2027", Data: "2026-09-20", Mediana: 4.2 },
    { Indicador: "PIB Total", DataReferencia: "2026", Data: "2026-10-23", Mediana: 2.1 },
  ];

  it("Focus: mediana mais recente e a de 4 semanas antes", () => {
    expect(focusPick(focus, "IPCA", 2027)).toMatchObject({ v: 4, prev: 4.2 });
    expect(focusPick(focus, "Câmbio", 2027)).toBeNull();
  });

  it("juro real, cortes esperados e nota em −100 a +100", () => {
    const m = brMacro({
      year: 2026,
      now: Date.parse("2026-10-28"),
      sgs: {
        selic: sgs([15, 15]),
        ipca12: sgs([5.0, 5.2]),
        ibc: sgs([100, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 101, 102]),
        desemp: sgs([7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6]),
      },
      focus,
      focus12: [{ Data: "2026-10-23", Mediana: 4.0 }],
    });
    const by = Object.fromEntries(m.indicators.map((x) => [x.id, x]));
    expect(by.real.value).toBeCloseTo((1.15 / 1.04 - 1) * 100, 1);
    expect(by.real.score).toBeLessThan(0);
    expect(by.fselic.score).toBeGreaterThan(0);
    expect(by.fipca.value).toBeCloseTo(-0.2);
    expect(by.fipca.score).toBe(2);
    expect(by.ibc.value).toBeCloseTo(2);
    expect(by.desemp.score).toBe(2);
    expect(m.overall).toBeGreaterThanOrEqual(-100);
    expect(m.overall).toBeLessThanOrEqual(100);
    expect(m.pillars.fiscal.score).toBeNull();
  });

  it("dado antigo aparece, mas fica fora da nota", () => {
    const vals = Array.from({ length: 13 }, (_, i) => ({ data: `01/${String((i % 12) + 1).padStart(2, "0")}/2025`, valor: "80" })); // prettier-ignore
    const m = brMacro({ year: 2026, now: Date.parse("2026-10-28"), sgs: { divida: vals } });
    expect(m.indicators[0].score).toBeNull();
    expect(m.indicators[0].read).toMatch(/dado antigo/);
    expect(m.overall).toBeNull();
  });

  it("URL do Focus filtra os dois anos", () => {
    const u = decodeURIComponent(focusUrl(2026));
    expect(u).toContain("DataReferencia eq '2026'");
    expect(u).toContain("DataReferencia eq '2027'");
  });
});

describe("Local (Brasil): tempo real e personalização", () => {
  it("a B3 vai no universo do canal de tempo real", () => {
    for (const s of ["^BVSP", "PETR4.SA", "BRL=X", "IRFM11.SA"]) expect(SYMBOLS).toContain(s);
  });
  it("fica com a cotação mais nova de cada ativo", () => {
    const q = freshestQuotes(
      { A: { p: 1, t: 10 }, B: { p: 2, t: 30 } },
      { A: { p: 1.1, t: 20 }, B: { p: 2.1, t: 25 } },
      { C: { p: 0, t: 99 } },
    );
    expect(q.A.p).toBe(1.1);
    expect(q.B.p).toBe(2);
    expect(q.C).toBeUndefined();
  });
  it("todo quadro de cotação aceita '+' e o código da B3 ganha .SA", () => {
    for (const [title] of BR_PANELS) expect(ADDABLE[title]).toBeTruthy();
    expect(normalizeExtra("br", "petr4")).toEqual({ sym: "PETR4.SA", label: "PETR4" });
    expect(normalizeExtra("br", "bova11")).toEqual({ sym: "BOVA11.SA", label: "BOVA11" });
    expect(normalizeExtra("br", "^BVSP")).toEqual({ sym: "^BVSP", label: "^BVSP" });
  });
});

it("brExtQuotes: pós do espelho em NY vira pós aproximado do ativo da B3 fora do pregão", () => {
  const q = {
    "PETR4.SA": { p: 40, t: 1000 },
    "PBR-A": { p: 13, t: 1000, xk: "post", xp: 13.13, xt: 2000, xc: 0.01 },
    "VALE3.SA": { p: 60, t: 3000 },
    VALE: { p: 10, t: 1000, xk: "post", xp: 10.1, xt: 2000, xc: 0.01 },
  };
  const out = brExtQuotes(q, false);
  expect(out["PETR4.SA"].xk).toBe("post");
  expect(out["PETR4.SA"].xv).toBe("PBR-A");
  expect(out["PETR4.SA"].xp).toBeCloseTo(40.4, 9);
  expect(out["VALE3.SA"].xk).toBe(undefined); // estendido mais velho que o último preço da B3
  expect(brExtQuotes(q, true)).toBe(q); // pregão aberto: nada muda
});
