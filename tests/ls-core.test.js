// Long & Short, Fase 4: porte INTEGRAL de docs/long-short/pendulo_motor_ref.py (mesmas funções, mesmos casos).
// teste_exemplo, testes_casos, testes_propriedades (20.000) e testes_revisao_2.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InvalidData, aluguel, alertaEventoCorporativo, desvioDirecional, devolucaoPct, distStop, exposure, frac, ordemBloqueada, pyRound, qEntrada, qLimiteExposicao, qPyramiding, qtdReducao, rValue, side, stopVigente } from "../assets/ls-core.js"; // prettier-ignore
import { emptyLs } from "../assets/ls-data.js";
import { blocksSamePurpose, closeRemainder, positionDelta, registerFill, suggest } from "../assets/ls-orders.js"; // prettier-ignore
import { PARAMS } from "../assets/ls-params.js";

const RULES = JSON.parse(readFileSync(new URL("../docs/long-short/pendulo-regras.json", import.meta.url), "utf8")); // prettier-ignore

describe("ls-core: round do Python", () => {
  it("meio para o par sobre o double exato", () => {
    expect(pyRound(0.125, 2)).toBe(0.12);
    expect(pyRound(0.375, 2)).toBe(0.38);
    expect(pyRound(2.675, 2)).toBe(2.67); // 2,67499999… no double
    expect(pyRound(30.3576, 2)).toBe(30.36);
    expect(pyRound(-0.6648, 2)).toBe(-0.66);
    expect(pyRound(0.39999999, 4)).toBe(0.4);
  });
});

describe("teste_exemplo (especificação)", () => {
  it("154 / 277 / reduz 92 / soma 46 / stop 30,36 / líquida +7.786,50 / bruta 29.653,50", () => {
    const { insumos: i, esperado: e } = RULES.teste_exemplo;
    const cap = i.capital;
    const R = rValue(cap);
    const teto = PARAMS.teto_risco_r * R;
    const a = i.SOXL;
    const b = i.SQQQ;
    const L1 = qEntrada({ capital: cap, P: a.P, L: 3, type: 1, dir: 1, atr: a.atr_intra, S: a.S, expLiq: 0, expBruta: 0, riscoTotal: 0, teto }); // prettier-ignore
    const eL = exposure(L1.q, a.P, 3, 1, 1);
    const rL0 = L1.q * (a.P - L1.stop);
    const S1 = qEntrada({ capital: cap, P: b.P, L: 3, type: -1, dir: 1, atr: b.atr_intra, S: b.S, expLiq: eL, expBruta: Math.abs(eL), riscoTotal: rL0, teto }); // prettier-ignore
    const P1 = i.depois.SOXL_P;
    const P2 = i.depois.SQQQ_P;
    const rS = pyRound(((P2 - b.P) * S1.q) / R, 2);
    const f = rS > PARAMS.reducao_ponta_perdedora_limiar_r ? 1 / 3 : 1 / 2;
    const vend = qtdReducao(S1.q, f, "P3");
    const qS2 = S1.q - vend;
    const stopSoxl = a.P;
    const riscoTotal = Math.max(0, (b.P - S1.stop) * qS2);
    const eL1 = exposure(L1.q, P1, 3, 1, 1);
    const eS1 = exposure(qS2, P2, 3, -1, 1);
    const pyr = qPyramiding({ capital: cap, q: L1.q, pm: a.P, stopAtual: stopSoxl, ultimoLote: L1.q, P: P1, L: 3, type: 1, dir: 1, atr: a.atr_intra, S: a.S, expLiq: eL1 + eS1, expBruta: Math.abs(eL1) + Math.abs(eS1), riscoTotal, teto }); // prettier-ignore
    const qt = L1.q + pyr.q;
    const el = exposure(qt, P1, 3, 1, 1) + eS1;
    const eb = Math.abs(exposure(qt, P1, 3, 1, 1)) + Math.abs(eS1);
    const got = { q_SOXL: L1.q, stop_SOXL: L1.stop, q_SQQQ: S1.q, stop_SQQQ: S1.stop, pnl_r_SOXL: pyRound(((P1 - a.P) * L1.q) / R, 2), pnl_r_SQQQ: rS, vender_SQQQ: vend, comprar_SOXL_pyr: pyr.q, novo_stop_SOXL: pyr.stop, exp_liq_final: pyRound(el, 2), exp_bruta_final: pyRound(eb, 2) }; // prettier-ignore
    for (const k of Object.keys(e)) expect(Math.abs(got[k] - e[k]), k).toBeLessThanOrEqual(1e-6);
    expect(pyr.trava).toBe("concentracao");
    // a fração do JSON (0,33) é 1/3 na referência
    expect(qtdReducao(S1.q, frac(PARAMS.reducao_ponta_perdedora[0]), "P3")).toBe(92);
  });
});

describe("testes_casos (casos-limite)", () => {
  it("redução, devolução, lado, exposição, stop e dado inválido", () => {
    expect(qtdReducao(0, 1 / 3, "P3")).toBe(0);
    expect(qtdReducao(1, 1 / 3, "P5")).toBe(0);
    expect(qtdReducao(1, 1 / 3, "P3")).toBe(1);
    expect(qtdReducao(2, 1 / 3, "P3")).toBe(1);
    expect(devolucaoPct(30, 29, 30, 1)).toBeNull();
    expect(side("REDUZIR", -1)).toBe("COMPRAR_PARA_COBRIR");
    expect(side("REDUZIR", 1)).toBe("VENDER");
    expect(side("ZERAR", -1)).toBe("COMPRAR_PARA_COBRIR");
    expect(side("ENTRAR", -1)).toBe("VENDER_A_DESCOBERTO");
    expect(exposure(10, 20, 3, -1, 1)).toBeLessThan(0); // bear comprado
    expect(exposure(10, 20, 3, -1, -1)).toBeGreaterThan(0); // bear vendido
    expect(stopVigente(20.8, 20.5, 0.5, -1)).toBe(20.8); // short: não se afasta
    expect(stopVigente(null, 20.0, 0.5, -1)).toBeGreaterThan(20.0);
    const cap = 25000;
    const q = qLimiteExposicao(-1.4 * cap, 1.4 * cap, 90.0, cap);
    expect(Math.abs(-1.4 * cap + q * 90.0)).toBeLessThanOrEqual(1.5 * cap + 1e-6);
    for (const bad of [[0, 3, 1, 250], [30, 3, 0, 250], [30, 3, 1, 0]]) expect(() => distStop(...bad)).toThrow(InvalidData); // prettier-ignore
    expect(() => rValue(0)).toThrow(InvalidData);
  });
});

describe("testes_propriedades (20.000 casos, gerador com semente)", () => {
  it("redução nunca passa de q nem aumenta a exposição; stop nunca se afasta", () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const uni = (lo, hi) => lo + rnd() * (hi - lo);
    for (let k = 0; k < 20000; k++) {
      const dir = pick([1, -1]);
      const type = pick([1, -1]);
      const q = 1 + Math.floor(rnd() * 500);
      const P = uni(1, 200);
      const L = pick([2, 3]);
      const r = qtdReducao(q, pick([1 / 3, 1 / 2]), pick(["P2", "P3", "P4", "P5"]));
      if (!(r >= 0 && r <= q)) throw new Error(`redução fora de [0, q]: ${r}/${q}`);
      if (Math.abs(exposure(q - r, P, L, type, dir)) > Math.abs(exposure(q, P, L, type, dir)) + 1e-9) throw new Error("exposição aumentou"); // prettier-ignore
      const stop0 = uni(1, 200);
      const novo = stopVigente(stop0, P, uni(0.01, 5), dir);
      if (dir === 1 ? novo < stop0 : novo > stop0) throw new Error("stop se afastou");
    }
    expect(true).toBe(true);
  });
});

describe("testes_revisao_2 (controles)", () => {
  it("cobertura de short liberada com compras suspensas", () => {
    expect(ordemBloqueada("ZERAR", ["RSK-04"])).toBe(false);
    expect(ordemBloqueada("REDUZIR", ["P0"])).toBe(false);
    expect(ordemBloqueada("AUMENTAR", ["RSK-04"])).toBe(true);
  });
  it("desvio direcional, aluguel e evento corporativo", () => {
    expect(desvioDirecional([[10000, 1.5], [-10000, 0.5]], 25000, 0)).toEqual({ efetivo: 0.4, bloqueia: true }); // prettier-ignore
    expect(desvioDirecional([[10000, 1.0], [-10000, 1.0]], 25000, 0)).toEqual({ efetivo: 0, bloqueia: false }); // prettier-ignore
    expect(pyRound(aluguel(20000, 0.12, 10), 2)).toBe(66.67);
    expect(pyRound(aluguel(20000, 0.12, 10, 365), 2)).toBe(65.75);
    expect(alertaEventoCorporativo(-0.45, -0.05, 3, 1)).toBe(true);
    expect(alertaEventoCorporativo(-0.15, -0.05, 3, 1)).toBe(false);
    expect(alertaEventoCorporativo(-1 / 3, 0.0, 3, 1)).toBe(true); // split 3:2 com subjacente parado
  });
  it("ciclo de vida e idempotência", () => {
    let d = suggest(emptyLs(), { id: "o1", sym: "SQQQ", purpose: "REDUZIR", side: "VENDER", qtySug: 100 }); // prettier-ignore
    let r = registerFill(d, { uid: "r1", orderId: "o1", qty: 40, price: 19.7 });
    expect(r.applied).toBe(true);
    d = r.data;
    r = registerFill(d, { uid: "r1", orderId: "o1", qty: 40, price: 19.7 }); // duplicado ignorado
    expect(r.applied).toBe(false);
    d = r.data;
    expect(positionDelta(d, "SQQQ")).toBe(-40);
    expect(d.orders[0].status).toBe("PARCIAL");
    expect(blocksSamePurpose(d, "REDUZIR")).toBe(true);
    d = closeRemainder(d, "o1", "CANCELADA");
    expect(blocksSamePurpose(d, "REDUZIR")).toBe(false);
    expect(() => closeRemainder(d, "o1", "EXECUTADA")).toThrow();
  });
});
