// Long & Short, Fases 8–10: execução manual, idempotência, parcial com saldo, diário, reconciliação, relatório;
// montagem da entrada do motor a partir dos dados do app; todas as dicas da tela com texto.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ackCritical, answerRemainder, dayForEngine, deltaSince, liveOrders, loadBook, noteTrips, reconcile, recordExecution, recordIgnore, registerReport, rollDay, setStop, trackHwm } from "../assets/ls-book.js"; // prettier-ignore
import {
  atrPercentile,
  buildInput,
  livePrice,
  neededSyms,
  parseHistCsv,
} from "../assets/ls-input.js";
import { computeLs } from "../assets/ls-engine.js";
import { TIPS, tipText } from "../assets/ls-tooltips.js";

const T0 = Date.parse("2026-12-01T15:15:00Z"); // 10:15 ET
const sell92 = { id: "2026-12-01|SQQQ|REDUZIR|P3", pairId: "SOXL-SQQQ", sym: "SQQQ", purpose: "REDUZIR", side: "VENDER", qty: 92, limit: 19.7, stop: 19.55, reason: "P3", alert: "DEC-01" }; // prettier-ignore
const fresh = () => rollDay(loadBook(null).data, "2026-12-01", []);

describe("livro: execução manual", () => {
  it("execução registra uma vez só (mesmo id único), com realizado e P3 marcado no dia", () => {
    let b = fresh();
    const f = { uid: "u1", qty: 92, price: 19.7, fees: 1, ts: T0, avg: 20, dir: 1, R: 125 };
    let r = recordExecution(b, sell92, f);
    expect(r.applied).toBe(true);
    b = r.data;
    r = recordExecution(b, sell92, f);
    expect(r.applied).toBe(false);
    expect(r.data.fills).toHaveLength(1);
    expect(b.orders[0].status).toBe("EXECUTADA");
    expect(b.day.reduced["SOXL-SQQQ"]).toEqual(["SQQQ"]);
    expect(b.day.realized).toBeCloseTo((19.7 - 20) * 92 - 1, 9);
    expect(b.journal.at(-1)).toMatchObject({ followed: true, alertId: "DEC-01", qty: 92 });
    // a mesma ordem do motor de novo (outro id único) é um episódio novo: ordem nova, nunca a encerrada
    expect(recordExecution(b, sell92, { ...f, uid: "u2" }).data.orders.map((o) => o.id)).toEqual([sell92.id, `${sell92.id}#2`]); // prettier-ignore
  });
  it("parcial 40/92: saldo aberto bloqueia a mesma finalidade; cancelado libera", () => {
    let b = recordExecution(fresh(), sell92, { uid: "u1", qty: 40, price: 19.7, ts: T0, avg: 20, remainder: "aberto" }).data; // prettier-ignore
    expect(b.orders[0].status).toBe("PARCIAL");
    expect(liveOrders(b)).toHaveLength(1);
    b = answerRemainder(b, sell92.id, "cancelado", T0 + 1000);
    expect(b.orders[0].status).toBe("CANCELADA");
    expect(liveOrders(b)).toHaveLength(0);
    const c = recordExecution(fresh(), sell92, { uid: "u9", qty: 40, price: 19.7, ts: T0, avg: 20, remainder: "cancelado" }).data; // prettier-ignore
    expect(c.orders[0].status).toBe("CANCELADA");
  });
  it("entrada grava stop, lote, preço/subjacente de entrada e conta no dia; aumento só aperta o stop", () => {
    const buy = { id: "d|SOXL|ENTRAR|P7|P7#0", pairId: "p", sym: "SOXL", purpose: "ENTRAR", side: "COMPRAR", qty: 154, limit: 30, stop: 29.19, reason: "P7", alert: "INT-02", episode: "P7#0" }; // prettier-ignore
    let b = recordExecution(fresh(), buy, { uid: "a", qty: 154, price: 30, ts: T0, S: 250 }).data;
    expect(b.links.SOXL).toMatchObject({
      stop: 29.19,
      lastLot: 154,
      entryPrice: 30,
      entryUnder: 250,
    });
    expect(b.day.entries).toBe(1);
    expect(b.day.done["SOXL|P7#0"]).toBe(true);
    const add = { ...buy, id: "d|SOXL|AUMENTAR|P6|P6#0", purpose: "AUMENTAR", reason: "P6", qty: 46, stop: 29, episode: "P6#0" }; // prettier-ignore
    b = recordExecution(b, add, { uid: "b", qty: 46, price: 31.2, ts: T0 + 600000 }).data;
    expect(b.links.SOXL.stop).toBe(29.19); // não afrouxa
    expect(b.day.adds.SOXL).toBe(1);
    expect(b.day.lastAdj.SOXL).toBe(T0 + 600000);
  });
  it("zerar no stop com prejuízo: conta perda, stop do ativo e limpa o vínculo", () => {
    const z = { ...sell92, id: "z", purpose: "ZERAR", reason: "P1", alert: "DEC-07", qty: 277 };
    const b = recordExecution(fresh(), z, {
      uid: "z1",
      qty: 277,
      price: 19.4,
      ts: T0,
      avg: 20,
    }).data;
    expect(b.day.losses).toBe(1);
    expect(b.day.stopsBySym.SQQQ).toBe(1);
    expect(b.day.lastStop.SQQQ).toBe(T0);
    expect(b.links.SQQQ.stop).toBeNull();
  });
  it("dado inválido não registra", () => {
    expect(() => recordExecution(fresh(), sell92, { uid: "x", qty: 0, price: 19 })).toThrow();
    expect(() => recordExecution(fresh(), sell92, { qty: 1, price: 19 })).toThrow("id único");
  });
});

describe("livro: ignorar, stop, hwm, dia", () => {
  it("ignorar (motivo opcional) conta alerta de risco no BEH-01 por 30 min", () => {
    expect(recordIgnore(fresh(), { id: "DEC-07", ts: T0 }).day.ignored).toHaveLength(1); // sem motivo obrigatório
    let b = recordIgnore(fresh(), { id: "DEC-07", why: "spread largo", ts: T0 });
    b = recordIgnore(b, { id: "RSK-03", why: "vou reduzir no fechamento", ts: T0 + 60000 });
    expect(dayForEngine(b, T0 + 120000).ignoredRisk30).toBe(2);
    expect(dayForEngine(b, T0 + 30 * 60000 + 30000).ignoredRisk30).toBe(1);
    expect(recordIgnore(fresh(), { id: "INT-02", ts: T0 }).journal.at(-1).followed).toBe(false);
  });
  it("stop só se aproxima; hwm acompanha o melhor preço e recomeça com novo preço médio", () => {
    let b = setStop(fresh(), "SOXL", 29.19);
    b = setStop(b, "SOXL", 30);
    expect(() => setStop(b, "SOXL", 29.5)).toThrow("só se aproxima");
    b = trackHwm(b, "SOXL", { avg: 30, price: 31.2 });
    b = trackHwm(b, "SOXL", { avg: 30, price: 30.5 });
    expect(b.links.SOXL.hwm).toBe(31.2);
    b = trackHwm(b, "SOXL", { avg: 30.4, price: 30.5 });
    expect(b.links.SOXL.hwm).toBe(30.5);
  });
  it("virada do dia às 4:00 ET zera contadores e soma pregão carregado", () => {
    let b = { ...fresh(), day: { ...fresh().day, entries: 3 } };
    b = rollDay(b, "2026-12-02", ["SOXL"]);
    expect(b.day).toMatchObject({ date: "2026-12-02", entries: 0 });
    expect(b.links.SOXL.sessions).toBe(1);
    expect(rollDay(b, "2026-12-02", ["SOXL"])).toBe(b);
  });
  it("travas acionadas contam uma vez por dia; crítico lido fica marcado", () => {
    let b = noteTrips(fresh(), ["PRE-01", "RSK-04"], "2026-12-01");
    b = noteTrips(b, ["PRE-01"], "2026-12-01");
    expect(b.trips["2026-12-01"]).toEqual({ "PRE-01": 1, "RSK-04": 1 });
    expect(ackCritical(b, "RSK-01").day.ack["RSK-01"]).toBe(true);
  });
});

describe("reconciliação e foto da Carteira", () => {
  it("execuções depois da foto somam; antes da foto já estão nela", () => {
    const b = recordExecution(fresh(), sell92, {
      uid: "u",
      qty: 92,
      price: 19.7,
      ts: T0,
      avg: 20,
    }).data;
    expect(deltaSince(b, "SQQQ", T0 - 1000)).toBe(-92);
    expect(deltaSince(b, "SQQQ", T0 + 1000)).toBe(0);
  });
  it("fechar o app no meio de uma parcial e reabrir: estado idêntico e compras bloqueadas até responder", () => {
    const b = recordExecution(fresh(), sell92, { uid: "u", qty: 40, price: 19.7, ts: T0, avg: 20, remainder: "aberto" }).data; // prettier-ignore
    const reopened = loadBook(JSON.parse(JSON.stringify(b))).data; // gravado e lido de volta
    expect(reopened).toEqual(b);
    const rec = reconcile({ data: reopened, rows: [{ sym: "SQQQ", qty: 277 }], photoMs: T0 - 3600000, now: T0 + 19 * 3600000 }); // prettier-ignore
    expect(rec.ok).toBe(false);
    expect(rec.issues[0].id).toBe("antiga");
    expect(reconcile({ data: reopened, rows: [], photoMs: T0 - 1, now: T0 + 1, loaded: false }).issues.map((i) => i.id)).toEqual(expect.arrayContaining(["estado", "divergencia"])); // prettier-ignore
  });
  it("migração incompleta (ordem v3 sem status) pede confirmação", () => {
    const b = loadBook({ schemaVersion: 3, orders: [{ id: "o", sym: "SOXL", purpose: "REDUZIR", qtySug: 10, qtyExec: 4 }] }).data; // prettier-ignore
    expect(reconcile({ data: b, rows: [], photoMs: null, now: T0 }).issues[0].id).toBe("confirmar");
  });
});

describe("relatório do modo registro", () => {
  it("seguidas × ignoradas, resultado, queda máxima, mais ignorados e travas", () => {
    let b = recordExecution(fresh(), sell92, { uid: "u", qty: 92, price: 19.7, ts: T0, avg: 20, R: 125 }).data; // prettier-ignore
    b = recordIgnore(b, { id: "DEC-07", why: "x y z", ts: T0 + 1 });
    b = noteTrips(b, ["PRE-01"], "2026-12-01");
    const r = registerReport(b);
    expect(r.followed.n).toBe(1);
    expect(r.followed.pnl).toBeCloseTo(-27.6, 9);
    expect(r.followed.maxDD).toBeCloseTo(-27.6, 9);
    expect(r.ignored).toEqual({ n: 1, risk: 1 });
    expect(r.topIgnored).toEqual([["DEC-07", 1]]);
    expect(r.topTrips).toEqual([["PRE-01", 1]]);
    expect(r.ready).toBe(false);
  });
});

describe("entrada do motor a partir dos dados do app", () => {
  const csv = (base) => "date,o,h,l,c,v\n" + Array.from({ length: 70 }, (_, i) => { const c = base * (1 + 0.01 * Math.sin(i)); return `2026-09-${String((i % 28) + 1).padStart(2, "0")}`.replace("2026-09", `2026-${String(8 + Math.floor(i / 28)).padStart(2, "0")}`) + `,${c},${c * 1.01},${c * 0.99},${c},1000`; }).join("\n"); // prettier-ignore
  const daily = {
    SOXX: parseHistCsv(csv(250)),
    QQQ: parseHistCsv(csv(500)),
    SPY: parseHistCsv(csv(600)),
  };
  const q = (p) => ({ p, pc: p, t: T0 / 1000 - 2, b: p - 0.005, a: p + 0.005 });
  const src = (over = {}) => ({
    now: T0,
    rows: [{ sym: "SOXL", qty: 154, avg: 30, price: 31.2 }, { sym: "SQQQ", qty: 277, avg: 20, price: 19.7 }], // prettier-ignore
    pairs: [["SOXL", "SQQQ"]],
    quotes: { SOXL: q(31.2), SQQQ: q(19.7), SOXX: q(250), QQQ: q(500), SPY: q(600), "^VIX": q(15) },
    bars: {},
    daily,
    book: fresh(),
    plan: { date: "2026-12-01", capital: 25000, pairs: { "SOXL-SQQQ": { bias: "alta", trigger: "SOXX > 250", dirPlan: 0 } } }, // prettier-ignore
    account: 40000,
    ...over,
  });
  it("monta pares, cotação com bid/ask, sessão, marcos e capital do plano", () => {
    const { input, meta } = buildInput(src());
    expect(input.session).toBe("REGULAR");
    expect(input.capital).toBe(25000);
    expect(input.plan.ok).toBe(true);
    expect(input.pairs[0].long).toMatchObject({ sym: "SOXL", dir: 1, qty: 154, avg: 30 });
    expect(input.pairs[0].long.quote).toMatchObject({ P: 31.2, bid: 31.195, ask: 31.205 });
    expect(input.pairs[0].corr).not.toBeNull();
    expect(meta.missing.some((m) => m.includes("barras"))).toBe(true); // sem barras: aviso, sem inventar
    expect(meta.capitalFrom).toBe("plano");
    const out = computeLs(input);
    expect(out.ok).toBe(true);
  });
  it("sem plano: capital da conta e PRE-01; execução depois da foto entra na quantidade", () => {
    const b = recordExecution(fresh(), sell92, { uid: "u", qty: 92, price: 19.7, ts: T0 - 1000, avg: 20 }).data; // prettier-ignore
    const { input, meta } = buildInput(src({ plan: null, book: b, photoMs: T0 - 3600000 }));
    expect(meta.capitalFrom).toBe("conta");
    expect(input.capital).toBe(40000);
    expect(input.pairs[0].short.qty).toBe(185);
    expect(computeLs(input).blockers.map((x) => x.id)).toContain("PRE-01");
  });
  it("peças: preço vigente, CSV, ativos necessários, percentil do ATR", () => {
    expect(livePrice({ p: 10, t: 100, xk: "post", xp: 10.5, xt: 200 })).toEqual({
      P: 10.5,
      ts: 200000,
    });
    expect(livePrice({ p: 10, t: 100 })).toEqual({ P: 10, ts: 100000 });
    expect(livePrice(null).P).toBeNull();
    expect(parseHistCsv("date,o,h,l,c,v\n2026-01-02,1,2,0.5,1.5,10\nlixo")).toHaveLength(1);
    expect(neededSyms([["SOXL", "SQQQ"]]).all).toEqual(["SOXL", "SQQQ", "SOXX", "QQQ", "SPY", "^VIX"]); // prettier-ignore
    const p = atrPercentile(daily.SOXX);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(100);
  });
});

describe("dicas da tela", () => {
  it("toda dica usada em ls-view.js tem texto (o que é / como ler) e ≤ 280 caracteres", () => {
    const src = readFileSync(new URL("../assets/ls-view.js", import.meta.url), "utf8");
    const used = new Set(
      [...src.matchAll(/(?:info|lab)\((?:"[^"]*",\s*)?"([a-z_A-Z]+)"/g)].map((m) => m[1]),
    );
    for (const m of src.matchAll(/tipOf = \{([^}]*)\}/g)) for (const k of m[1].matchAll(/"(param_[a-z_]+)"/g)) used.add(k[1]); // prettier-ignore
    expect(used.size).toBeGreaterThan(40);
    for (const id of used) {
      expect(TIPS[id], id).toBeTruthy();
      const t = tipText(id);
      expect(t.que && t.ler, id).toBeTruthy();
      expect(t.que.length + t.ler.length + t.fazer.length, id).toBeLessThanOrEqual(280);
    }
    expect(() => tipText("nao_existe")).toThrow();
  });
});

describe("regressões da revisão (27/11/2026)", () => {
  it("dois aparelhos registrando: a mesclagem une execuções, ordens e diário sem perder nada", async () => {
    const { mergeBooks } = await import("../assets/ls-book.js");
    const base = fresh();
    const cel = recordExecution(base, sell92, { uid: "cel", qty: 92, price: 19.7, ts: T0, avg: 20 }).data; // prettier-ignore
    const buy = { id: "d|SOXL|ENTRAR|P7|P7#0", pairId: "p", sym: "SOXL", purpose: "ENTRAR", side: "COMPRAR", qty: 10, limit: 30, stop: 29, reason: "P7", alert: "INT-02", episode: "P7#0" }; // prettier-ignore
    const desk = recordExecution(base, buy, {
      uid: "desk",
      qty: 10,
      price: 30,
      ts: T0 + 5000,
    }).data;
    const m = mergeBooks(desk, cel);
    expect(m.fills.map((f) => f.uid).sort()).toEqual(["cel", "desk"]);
    expect(m.orders).toHaveLength(2);
    expect(m.journal).toHaveLength(2);
    expect(m.day.entries).toBe(1);
    expect(m.day.reduced["SOXL-SQQQ"]).toEqual(["SQQQ"]);
    expect(m.day.realized).toBeCloseTo((19.7 - 20) * 92, 9);
    expect(mergeBooks(m, m)).toEqual(m); // idempotente
  });
  it("posição = foto + execuções depois dela, com preço médio ponderado; zerou recomeça", async () => {
    const { positionFrom } = await import("../assets/ls-book.js");
    const buy = (id, q, p, ts) => ({ o: { id, pairId: "p", sym: "TQQQ", purpose: "ENTRAR", side: "COMPRAR", qty: q, limit: p, stop: p * 0.95, reason: "P7", alert: null }, f: { uid: id, qty: q, price: p, ts } }); // prettier-ignore
    let b = fresh();
    for (const x of [buy("a", 100, 50, T0), buy("b", 50, 56, T0 + 1000)]) b = recordExecution(b, x.o, x.f).data; // prettier-ignore
    expect(positionFrom(null, b, "TQQQ", T0 - 1)).toEqual({ qty: 150, avg: 52, short: false });
    expect(positionFrom({ qty: 100, avg: 50 }, b, "TQQQ", T0 + 500)).toEqual({ qty: 150, avg: 52, short: false }); // prettier-ignore
    const z = { id: "z", pairId: "p", sym: "TQQQ", purpose: "ZERAR", side: "VENDER", qty: 150, limit: 55, reason: "P1", alert: "DEC-07" }; // prettier-ignore
    b = recordExecution(b, z, { uid: "z", qty: 150, price: 55, ts: T0 + 2000, avg: 52 }).data;
    expect(positionFrom(null, b, "TQQQ", T0 - 1)).toEqual({ qty: 0, avg: null, short: false });
  });
  it("zerar de novo no mesmo dia (saldo cancelado ou novo stop) abre ordem nova em vez de travar", () => {
    const z = {
      ...sell92,
      id: "d|SQQQ|ZERAR|P1",
      purpose: "ZERAR",
      reason: "P1",
      alert: "DEC-07",
      qty: 100,
    };
    let b = recordExecution(fresh(), z, { uid: "1", qty: 40, price: 19, ts: T0, avg: 20, remainder: "cancelado" }).data; // prettier-ignore
    b = recordExecution(b, { ...z, qty: 60 }, { uid: "2", qty: 60, price: 19, ts: T0 + 1000, avg: 20 }).data; // prettier-ignore
    expect(b.orders.map((o) => [o.id, o.status])).toEqual([["d|SQQQ|ZERAR|P1", "CANCELADA"], ["d|SQQQ|ZERAR|P1#2", "EXECUTADA"]]); // prettier-ignore
    // saldo aberto: o "Executou o saldo" cai na MESMA ordem viva
    let c = recordExecution(fresh(), z, { uid: "a", qty: 40, price: 19, ts: T0, avg: 20, remainder: "aberto" }).data; // prettier-ignore
    c = recordExecution(c, { ...z, qty: 60 }, { uid: "b", qty: 60, price: 19, ts: T0 + 1000, avg: 20 }).data; // prettier-ignore
    expect(c.orders).toHaveLength(1);
    expect(c.orders[0]).toMatchObject({ status: "EXECUTADA", qtyExec: 100 });
  });
  it("'Está aberta' confirma a ordem antiga e tira a pendência da reconciliação", () => {
    const b0 = recordExecution(fresh(), sell92, { uid: "u", qty: 40, price: 19.7, ts: T0, avg: 20, remainder: "aberto" }).data; // prettier-ignore
    const late = T0 + 19 * 3600000;
    expect(reconcile({ data: b0, rows: [{ sym: "SQQQ", qty: 277 }], photoMs: T0 - 1, now: late }).ok).toBe(false); // prettier-ignore
    const b1 = answerRemainder(b0, sell92.id, "aberto", late);
    expect(reconcile({ data: b1, rows: [{ sym: "SQQQ", qty: 277 }], photoMs: T0 - 1, now: late + 1 }).ok).toBe(true); // prettier-ignore
  });
});

describe("número digitado no separador do usuário", () => {
  it("separador trocado é inválido (nunca ×100); milhar aceito", async () => {
    const { parseNum } = await import("../assets/ls-view.js");
    expect(parseNum("50.25", ".")).toBe(50.25);
    expect(parseNum("50,25", ".")).toBeNaN();
    expect(parseNum("25,000", ".")).toBe(25000);
    expect(parseNum("1,234.5", ".")).toBe(1234.5);
    expect(parseNum("50,25", ",")).toBe(50.25);
    expect(parseNum("50.25", ",")).toBeNaN();
    expect(parseNum("25.000", ",")).toBe(25000);
    expect(parseNum("", ".")).toBeNull();
    expect(parseNum("abc", ".")).toBeNaN();
  });
});

describe("bid/ask de outra sessão", () => {
  it("oferta longe do preço vigente é descartada (compras ficam sem preço confiável)", async () => {
    const { sanePair } = await import("../assets/ls-input.js");
    const miss = [];
    expect(sanePair({ b: 38.31, a: 38.33 }, 45.78, "SQQQ", miss)).toEqual({ bid: null, ask: null });
    expect(miss[0]).toMatch(/SQQQ/);
    expect(sanePair({ b: 45.77, a: 45.79 }, 45.78)).toEqual({ bid: 45.77, ask: 45.79 });
    expect(sanePair({ b: 0, a: 45.79 }, 45.78)).toEqual({ bid: null, ask: null });
  });
});
