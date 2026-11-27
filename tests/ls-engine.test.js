// Long & Short, Fase 4: motor completo (métricas + prioridades + bloqueios) com o exemplo da especificação e os
// casos de aceite da seção 10 do plano.
import { describe, expect, it } from "vitest";
import { computeLs, limitPrice, scenario } from "../assets/ls-engine.js";
import { assetInfo } from "../assets/ls-etfs.js";
import { legMetrics, quoteCheck } from "../assets/ls-metrics.js";
import { pyRound } from "../assets/ls-core.js";

const NOW = Date.parse("2026-12-01T15:15:00Z"); // 10:15 ET
const MIN = 615;
const quote = (P, spread = 0.01, ageS = 2) => ({ P, bid: pyRound(P - spread / 2, 3), ask: pyRound(P + spread / 2, 3), ts: NOW - ageS * 1000 }); // prettier-ignore
const under = (S, atrIntra, extra = {}) => ({ S, atrIntra, atrD: S * 0.02, vwap: { value: S * 0.995, approx: false }, or: { done: true }, breakout: { dir: null }, crosses: 1, ...extra }); // prettier-ignore

/** Estado "depois" do exemplo: SOXL 154 @ 30 (agora 31,20), SQQQ 277 @ 20 (agora 19,70). */
function example(over = {}) {
  return {
    now: NOW,
    session: "REGULAR",
    minET: MIN,
    date: "2026-12-01",
    capital: 25000,
    plan: { ok: true, pairs: { semis: { dirPlan: 0 } } },
    calendar: { blocks: false },
    day: {},
    pairs: [
      {
        id: "semis",
        name: "Semis vs Nasdaq",
        corr: 0.8,
        long: { sym: "SOXL", dir: 1, qty: 154, avg: 30, stop: 29.19, hwm: 31.2, pRef: 30, asset: assetInfo("SOXL"), quote: quote(31.2), under: under(250, 1.5) }, // prettier-ignore
        short: { sym: "SQQQ", dir: 1, qty: 277, avg: 20, stop: 19.55, hwm: 20, pRef: 20, asset: assetInfo("SQQQ"), quote: quote(19.7), under: under(500, 2.5) }, // prettier-ignore
      },
    ],
    ...over,
  };
}

describe("motor: exemplo da especificação", () => {
  const out = computeLs(example());
  it("P3: VENDER 92 SQQQ (DEC-01) e stop do SOXL sobe (preço médio ou stop móvel, o melhor)", () => {
    const o = out.orders[0];
    expect(o).toMatchObject({ sym: "SQQQ", purpose: "REDUZIR", side: "VENDER", qty: 92, reason: "P3", alert: "DEC-01", blocked: false }); // prettier-ignore
    expect(o.limit).toBe(19.7); // bid 19,695 → 19,70 (meio para o par sobre o double)
    // P3 sobe ao preço médio (30); o stop móvel (preço − 1,5 ATR) vai além: 30,36, vale o melhor
    expect(out.stopMoves).toEqual([{ sym: "SOXL", from: 29.19, to: 30.36, reason: "TRAIL", alert: "DEC-01" }]); // prettier-ignore
  });
  it("P6 em espera: aumentar 46 SOXL com stop 30,36, bloqueado até reduzir a perdedora", () => {
    const o = out.orders.find((x) => x.reason === "P6");
    expect(o).toMatchObject({ sym: "SOXL", side: "COMPRAR", qty: 46, stop: 30.36, blocked: true });
    expect(o.blockers[0]).toEqual({ id: "P6", why: "aguarda reduzir a perdedora" });
    expect(o.note).toBe("trava: concentracao");
  });
  it("métricas: P&L do dia +101,70 (+0,81R), limite 601,70, cenário 1", () => {
    expect(pyRound(out.portfolio.pnlDay, 2)).toBe(101.7);
    expect(out.portfolio.pnlDayR).toBe(0.81);
    expect(pyRound(out.portfolio.limiteRestante, 2)).toBe(601.7);
    expect(out.portfolio.teto).toBe(500);
    expect(out.pairs[0].scenario).toBe(1);
    expect(out.legs.map((l) => l.pnlR)).toEqual([1.48, -0.66]);
  });
  it("depois de registrar a venda (SQQQ 185, ponta oposta reduzida): COMPRAR 46 SOXL liberado com rompimento", () => {
    const st = example({ day: { reduced: { semis: ["SQQQ"] } } });
    st.pairs[0].short.qty = 185;
    st.pairs[0].long.stop = 30;
    st.pairs[0].long.under = under(250, 1.5, { breakout: { dir: "up", volRel: 2 } });
    const r = computeLs(st);
    const o = r.orders.find((x) => x.reason === "P6");
    expect(o).toMatchObject({ qty: 46, stop: 30.36, blocked: false, side: "COMPRAR" });
    expect(o.checklist.every((c) => c.ok)).toBe(true);
    // exposição final = a da especificação
    const s = r.legs;
    expect(pyRound(200 * 31.2 * 3 + s[1].expAj, 2)).toBe(7786.5);
  });
});

describe("motor: casos de aceite (seção 10)", () => {
  it("zerar short real com compras suspensas: COMPRAR PARA COBRIR liberado", () => {
    const st = example({ plan: { ok: false } });
    st.pairs[0].short = { sym: "QQQ", dir: -1, qty: 10, avg: 500, stop: 505, hwm: 495, pRef: 500, borrow: { ok: true }, asset: { ok: true, L: 1, type: 1, under: "QQQ" }, quote: quote(506), under: under(506, 2.5) }; // prettier-ignore
    const r = computeLs(st);
    const o = r.orders.find((x) => x.sym === "QQQ");
    expect(o).toMatchObject({ purpose: "ZERAR", side: "COMPRAR_PARA_COBRIR", qty: 10, blocked: false, reason: "P1" }); // prettier-ignore
    expect(r.blockers.map((b) => b.id)).toContain("PRE-01");
  });
  it("posição de 1 cota em parcial P5: nenhuma ordem", () => {
    const st = example();
    st.pairs[0].long = { ...st.pairs[0].long, qty: 1, hwm: 33, quote: quote(32.9) };
    st.pairs[0].short = null;
    const r = computeLs(st);
    expect(r.legs[0].pnlR).toBeLessThan(2); // 1 cota não chega a 2R: troca para P5 por movimento esticado
    st.pairs[0].long.entryUnder = 240; // subjacente andou 10 = 2 ATR_d
    const r2 = computeLs(st);
    expect(r2.orders.filter((o) => o.reason === "P5")).toEqual([]);
  });
  it("execução parcial 40/100 com saldo aberto: bloqueia nova ordem com o mesmo objetivo", () => {
    const r = computeLs(example({ liveOrders: [{ purpose: "REDUZIR", sym: "SQQQ" }] }));
    expect(r.orders[0]).toMatchObject({ sym: "SQQQ", blocked: true });
    expect(r.orders[0].blockers[0].id).toBe("EXE-02");
  });
  it("desvio direcional +0,40x com plano 0: entradas e aumentos bloqueados", () => {
    const st = example();
    // entrada no SOXL sem posição; betas fazem a exposição beta-ajustada passar de 0,25x
    st.pairs[0].long = { ...st.pairs[0].long, qty: 0, avg: null, stop: null, under: under(250, 1.5, { breakout: { dir: "up", volRel: 2 } }) }; // prettier-ignore
    st.pairs[0].short = { ...st.pairs[0].short, qty: 0, avg: null, stop: null };
    st.pairs[0].betas = { SOXX: 1.5, QQQ: 0.5 };
    const r = computeLs(st);
    const o = r.orders.find((x) => x.reason === "P7");
    expect(o.qty).toBeGreaterThan(0);
    expect(o.blockers.map((b) => b.id)).toContain("PAR-01");
  });
  it("cotação com 31 s no pré: EXE-01 e compras bloqueadas", () => {
    expect(quoteCheck(quote(30, 0.01, 31), NOW, "PRE")).toMatchObject({ ok: false });
    expect(quoteCheck(quote(30, 0.01, 29), NOW, "PRE").ok).toBe(true);
    expect(quoteCheck(quote(30, 0.01, 11), NOW, "REGULAR").ok).toBe(false);
    const st = example({ session: "PRE", minET: 500, day: { reduced: { semis: ["SQQQ"] } } });
    st.pairs[0].short.qty = 185;
    st.pairs[0].long.stop = 30;
    st.pairs[0].long.quote = quote(31.2, 0.01, 31);
    st.pairs[0].long.under = under(250, 1.5, { breakout: { dir: "up", volRel: 2 } });
    const r = computeLs(st);
    const o = r.orders.find((x) => x.sym === "SOXL" && x.purpose === "AUMENTAR");
    expect(o.blockers.map((b) => b.id)).toEqual(expect.arrayContaining(["EXE-01", "PRE-PYR"]));
  });
  it("pregão encurtado: compras bloqueadas a partir de 12:00 (corte deslocado)", () => {
    const st = example({ minET: 721, cutMin: 720, day: { reduced: { semis: ["SQQQ"] } } });
    st.pairs[0].short.qty = 185;
    st.pairs[0].long.stop = 30;
    st.pairs[0].long.under = under(250, 1.5, { breakout: { dir: "up", volRel: 2 } });
    const o = computeLs(st).orders.find((x) => x.reason === "P6");
    expect(o.blockers.map((b) => b.id)).toContain("CORTE");
  });
  it("sem stop subido ao preço médio, o risco da ponta ocupa o 1R: nenhum aumento", () => {
    const st = example({ day: { reduced: { semis: ["SQQQ"] } } });
    st.pairs[0].short.qty = 185;
    expect(computeLs(st).orders.some((o) => o.reason === "P6")).toBe(false);
  });
  it("RSK-01: zera tudo com ordens nunca bloqueadas", () => {
    const st = example();
    st.pairs[0].long.quote = quote(26.5);
    st.pairs[0].long.stop = 20;
    st.pairs[0].short.stop = 15;
    const r = computeLs(st);
    expect(r.portfolio.flags.rsk01).toBe(true);
    expect(r.orders.filter((o) => o.reason === "P0").map((o) => [o.sym, o.purpose, o.qty, o.blocked])).toEqual([["SOXL", "ZERAR", 154, false], ["SQQQ", "ZERAR", 277, false]]); // prettier-ignore
  });
  it("RSK-03: reduz a maior contribuição ao excesso (ceil, até q)", () => {
    const st = example();
    st.pairs[0].short = null;
    st.pairs[0].long = { ...st.pairs[0].long, qty: 600, hwm: 31.2, pRef: 31.2 }; // 600·31,2·3 = 56.160 > 50.000
    const r = computeLs(st);
    const o = r.orders.find((x) => x.alert === "RSK-03");
    // excesso bruto 6.160 / 93,6 = 65,8 → 66 (líquido 18.660/93,6 = 199,4 → 200 vence)
    expect(o).toMatchObject({ purpose: "REDUZIR", qty: 200, blocked: false });
  });
  it("stop atingido no pós: zerar com limitada bid·0,995 (SES-03)", () => {
    const st = example({ session: "POS", minET: 1000 });
    st.pairs[0].long.quote = quote(29);
    const o = computeLs(st).orders.find((x) => x.sym === "SOXL");
    expect(o).toMatchObject({
      purpose: "ZERAR",
      alert: "SES-03",
      limit: pyRound(28.995 * 0.995, 2),
    });
  });
  it("devolução: 50–75% reduz metade (P4); ≥ 75% zera (P1)", () => {
    const st = example();
    st.pairs[0].short = null;
    st.pairs[0].long = { ...st.pairs[0].long, hwm: 34, quote: quote(32) }; // devolveu 50%
    expect(computeLs(st).orders[0]).toMatchObject({ reason: "P4", qty: 77 });
    st.pairs[0].long.quote = quote(31);
    expect(computeLs(st).orders[0]).toMatchObject({ reason: "P1", purpose: "ZERAR", qty: 154 });
  });
  it("evento em ≤ 30 min: reduz 50% (P2) e suspende aumentos do par", () => {
    const r = computeLs(example({ events: [{ atMs: NOW + 20 * 60000 }] }));
    expect(r.orders.filter((o) => o.reason === "P2").map((o) => [o.sym, o.qty])).toEqual([["SOXL", 77], ["SQQQ", 138]]); // prettier-ignore
    expect(r.pairs[0].scenario).toBe(9);
  });
  it("sem capital: nenhum cálculo (EXE-01)", () => {
    expect(computeLs(example({ capital: 0 })).errors[0].id).toBe("EXE-01");
  });
  it("ativo sem cadastro: EXE-01 e nenhuma quantidade", () => {
    const st = example();
    st.pairs[0].long.asset = assetInfo("XYZ");
    const r = computeLs(st);
    expect(r.errors.some((e) => e.id === "EXE-01" && e.sym === "SOXL")).toBe(true);
    expect(r.orders.some((o) => o.sym === "SOXL")).toBe(false);
  });
});

describe("motor: peças", () => {
  it("preço limite por sessão e finalidade", () => {
    const q = { P: 20, bid: 19.9, ask: 20.1 };
    expect(limitPrice("COMPRAR", "ENTRAR", "REGULAR", q)).toEqual({ limit: 20.1, from: "ask" });
    expect(limitPrice("VENDER", "REDUZIR", "REGULAR", q)).toEqual({ limit: 19.9, from: "bid" });
    expect(limitPrice("VENDER", "ZERAR", "PRE", q).limit).toBe(pyRound(19.9 * 0.995, 2));
    expect(limitPrice("COMPRAR_PARA_COBRIR", "ZERAR", "POS", q).limit).toBe(pyRound(20.1 * 1.005, 2)); // prettier-ignore
    expect(limitPrice("VENDER", "REDUZIR", "REGULAR", { P: 20 })).toEqual({ limit: 20, from: "último" }); // prettier-ignore
  });
  it("cenários 2, 3, 4 e 5", () => {
    const m = (pnlR) => ({ ok: true, qty: 1, pnlR });
    expect(scenario({ mL: m(-0.6), mS: m(1.2), pnlR: 0.6 })).toBe(2);
    expect(scenario({ mL: m(0.6), mS: m(0.5), pnlR: 1.1 })).toBe(3);
    expect(scenario({ mL: m(-0.6), mS: m(-0.5), pnlR: -1.1 })).toBe(4);
    expect(scenario({ mL: m(0.1), mS: m(0.1), pnlR: 0.2, crosses: 4 })).toBe(5);
    expect(scenario({ mL: m(0.1), mS: m(0.1), pnlR: 0.2 })).toBe(0);
  });
  it("métricas da ponta: aluguel do short real e lado da VWAP", () => {
    const leg = { sym: "QQQ", dir: -1, qty: 40, avg: 500, stop: 510, asset: { ok: true, L: 1, type: 1, under: "QQQ" }, quote: quote(500), under: under(500, 2.5), borrow: { ok: true, rateAa: 0.12 } }; // prettier-ignore
    const m = legMetrics(leg, { capital: 25000, now: NOW, session: "REGULAR" });
    expect(pyRound(m.rentDay * 10, 2)).toBe(66.67); // US$ 20.000 a 12% a.a., 10 dias, base 360
    expect(m.vwapSide).toBe("contra"); // short com o subjacente acima da VWAP
    expect(m.riskOpen).toBe(400);
  });
});

describe("motor: regressões da revisão de 27/11/2026", () => {
  it("ponta sem ATR continua com saídas, exposição e P&L (só não dimensiona compras)", () => {
    const st = example();
    st.pairs[0].short.under = { ...st.pairs[0].short.under, atrIntra: null };
    st.pairs[0].short.quote = quote(19);
    const r = computeLs(st);
    expect(r.orders.find((o) => o.sym === "SQQQ")).toMatchObject({ purpose: "ZERAR", qty: 277, blocked: false }); // prettier-ignore
    expect(r.portfolio.expBruta).toBeGreaterThan(20000);
    expect(r.errors.some((e) => e.sym === "SQQQ" && e.id === "EXE-01")).toBe(true);
  });
  it("RSK-03 nunca piora a líquida (não cobre o short quando a líquida já passou)", () => {
    const leg = (sym, qty, P, dir = 1) => ({ sym, dir, qty, avg: P, stop: P * 0.9, hwm: P, pRef: P, borrow: { ok: true }, asset: { ok: true, L: 1, type: 1, under: "SPY" }, quote: quote(P), under: under(600, 1) }); // prettier-ignore
    const st = example({ pairs: [
      { id: "a", corr: 0.8, long: leg("A1", 150, 100), short: leg("C1", 180, 100, -1) },
      { id: "b", corr: 0.8, long: leg("A2", 150, 100), short: leg("A3", 150, 100) },
      { id: "c", corr: 0.8, long: leg("A4", 150, 100), short: null },
    ] }); // prettier-ignore
    const r = computeLs(st);
    const o = r.orders.find((x) => x.alert === "RSK-03");
    expect(o.sym).not.toBe("C1");
    expect(o.side).toBe("VENDER");
  });
  it("zeragem desconta o saldo de redução ainda aberto na corretora (não vira a posição)", () => {
    const st = example({
      liveOrders: [{ purpose: "REDUZIR", sym: "SQQQ", qtySug: 92, qtyExec: 0 }],
    });
    st.pairs[0].short.quote = quote(19.5);
    const o = computeLs(st).orders.find((x) => x.sym === "SQQQ");
    expect(o).toMatchObject({ purpose: "ZERAR", qty: 185 });
  });
  it("duas entradas no mesmo ciclo somam: a segunda respeita o que a primeira já ocupou", () => {
    const L = (sym, P, S, atr) => ({ sym, dir: 1, qty: 0, avg: null, stop: null, hwm: null, pRef: null, asset: assetInfo(sym), quote: quote(P), under: under(S, atr, { breakout: { dir: "up", volRel: 2 } }) }); // prettier-ignore
    const held = { sym: "TECL", dir: 1, qty: 40, avg: 100, stop: 99, hwm: 100, pRef: 100, asset: assetInfo("TECL"), quote: quote(100), under: under(200, 0.5) }; // prettier-ignore
    const st = example({ capital: 20000, plan: { ok: true, pairs: {} }, pairs: [
      { id: "a", corr: 0.8, long: held, short: null },
      { id: "b", corr: 0.8, long: L("SPXL", 100, 600, 0.6), short: null },
      { id: "c", corr: 0.8, long: L("TQQQ", 50, 500, 0.5), short: null },
    ] }); // prettier-ignore
    const r = computeLs(st);
    let liq = 40 * 100 * 3;
    for (const o of r.orders.filter((x) => x.purpose === "ENTRAR" && !x.blocked)) liq += o.qty * st.pairs.find((pp) => pp.long.sym === o.sym).long.quote.P * 3; // prettier-ignore
    expect(liq).toBeLessThanOrEqual(1.5 * 20000 + 1e-6);
  });
  it("aumento nunca afrouxa o stop", () => {
    const st = example({ day: { reduced: { semis: ["SQQQ"] } } });
    st.pairs[0].short.qty = 185;
    st.pairs[0].long.stop = 30.9;
    st.pairs[0].long.under = under(250, 1.5, { breakout: { dir: "up", volRel: 2 } });
    const o = computeLs(st).orders.find((x) => x.reason === "P6");
    if (o) expect(o.stop).toBeGreaterThanOrEqual(30.9);
  });
  it("posição sem stop conta risco e bloqueia compras até definir", () => {
    const st = example();
    st.pairs[0].long.stop = null;
    st.pairs[0].long.quote = quote(30); // no zero a zero o stop sugerido (29,19) fica abaixo do médio
    const r = computeLs(st);
    expect(r.legs[0].riskOpen).toBeCloseTo(0.81 * 154, 6);
    expect(r.blockers.map((b) => b.id)).toContain("SEM-STOP");
  });
  it("P4 sai uma vez por movimento (episódio executado não repete)", () => {
    const st = example();
    st.pairs[0].short = null;
    st.pairs[0].long = { ...st.pairs[0].long, hwm: 34, quote: quote(32) };
    const o = computeLs(st).orders[0];
    expect(o).toMatchObject({ reason: "P4", episode: "P4@34" });
    st.day = { done: { "SOXL|P4@34": true } };
    expect(computeLs(st).orders.filter((x) => x.reason === "P4")).toEqual([]);
  });
});
