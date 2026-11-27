// Long & Short, Fase 1: parâmetros (espelho do JSON v4), cadastro de ETFs, modelo de dados e migração.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALERTS, PARAMS, PYRAMID_TRIGGERS, SCHEMA_VERSION, SIDE, hhmm, resolveParams } from "../assets/ls-params.js"; // prettier-ignore
import { ETF_CATALOG, assetInfo, sameUnderlying } from "../assets/ls-etfs.js";
import { checkPlan, legFromHolding, makePair, migrateLs } from "../assets/ls-data.js";
import { bidAsk } from "../api/quotes.js";
import { WHOLE } from "../assets/settings-sync.js";

const RULES = JSON.parse(readFileSync(new URL("../docs/long-short/pendulo-regras.json", import.meta.url), "utf8")); // prettier-ignore

describe("ls-params: espelho de pendulo-regras.json", () => {
  it("parâmetros, lado da ordem e gatilhos idênticos ao JSON", () => {
    expect(SCHEMA_VERSION).toBe(RULES.schema_version);
    expect(PARAMS).toEqual(RULES.parametros);
    expect(SIDE).toEqual(RULES.motor.lado_ordem);
    expect(PYRAMID_TRIGGERS).toEqual(RULES.gatilhos_pyramiding);
  });
  it("33 alertas com id, prioridade, bloqueio e mensagem iguais", () => {
    expect(ALERTS).toHaveLength(33);
    RULES.alertas.forEach((a, i) => {
      expect(ALERTS[i]).toEqual({ id: a.id, grupo: a.grupo, prioridade: a.prioridade, bloqueia: a.bloqueia, mensagem: a.mensagem }); // prettier-ignore
    });
  });
  it("override válido entra; inválido volta como erro (nada de zero silencioso)", () => {
    const r = resolveParams({ risco_por_ponta_pct_capital: 0.25, spread_max_pct: 0, foo: 1, pyramiding_corte_horario: "25:00" }); // prettier-ignore
    expect(r.params.risco_por_ponta_pct_capital).toBe(0.25);
    expect(r.params.spread_max_pct).toBe(PARAMS.spread_max_pct);
    expect(r.params.pyramiding_corte_horario).toBe("15:00");
    expect(r.errors).toHaveLength(3);
    expect(r.changed).toEqual(["risco_por_ponta_pct_capital"]);
    expect(hhmm("15:45")).toBe(945);
    expect(() => hhmm("9h")).toThrow();
  });
});

describe("ls-etfs: cadastro", () => {
  it("catálogo válido e usuário vence o catálogo", () => {
    for (const s of Object.keys(ETF_CATALOG)) expect(assetInfo(s).ok).toBe(true);
    expect(assetInfo("SQQQ")).toMatchObject({ L: 3, type: -1, under: "QQQ" });
    expect(assetInfo("SOXL", { SOXL: { under: "SMH" } }).under).toBe("SMH");
    expect(assetInfo("XYZ").ok).toBe(false);
    expect(assetInfo("XYZ", { XYZ: { L: 2, type: 1, under: "SPY" } }).ok).toBe(true);
    expect(assetInfo("XYZ", { XYZ: { L: 5, type: 1, under: "SPY" } }).ok).toBe(false);
  });
  it("mesmo subjacente bull × bear é detectado", () => {
    expect(sameUnderlying(assetInfo("TQQQ"), assetInfo("SQQQ"))).toBe(true);
    expect(sameUnderlying(assetInfo("SOXL"), assetInfo("SQQQ"))).toBe(false);
  });
});

describe("ls-data: modelo e migração", () => {
  it("registro antigo (v1, só ticker/qtd/pm) vira ponta v4: dir +1, hwm = máx(pm, P), stop vazio", () => {
    const old = { sym: "soxl", qty: 154, avg: 30 };
    const leg = legFromHolding(old, 31.2, { pairId: "semis" });
    expect(leg).toMatchObject({ sym: "SOXL", dir: 1, hwm: 31.2, stop: null, qty: 154, avg: 30, pairId: "semis" }); // prettier-ignore
    expect(legFromHolding(old, 29).hwm).toBe(30);
    // short real: mínimo
    expect(legFromHolding({ sym: "QQQ", qty: 10, avg: 500 }, 490, { dir: -1 }).hwm).toBe(490);
    // hwm guardado vale enquanto o pm não muda; pm mudou, recomeça
    expect(legFromHolding(old, 31, { hwm: 33, hwmAvg: 30 }).hwm).toBe(33);
    expect(legFromHolding({ ...old, avg: 31 }, 31.5, { hwm: 33, hwmAvg: 30 }).hwm).toBe(31.5);
  });
  it("v3 → v4: ordem sem status com residual vira ENVIADA e pede confirmação", () => {
    const r = migrateLs({ schemaVersion: 3, orders: [{ id: "o1", qtySug: 100, qtyExec: 40 }, { id: "o2", qtySug: 10, qtyExec: 10 }] }); // prettier-ignore
    expect(r.migrated).toBe(true);
    expect(r.data.schemaVersion).toBe(4);
    expect(r.data.orders[0]).toMatchObject({ status: "ENVIADA", needsConfirm: true });
    expect(r.data.orders[1].status).toBe("EXECUTADA");
    expect(migrateLs({ schemaVersion: 4, orders: [{ id: "x", status: "XYZ" }] }).errors).toHaveLength(1); // prettier-ignore
    expect(migrateLs({ schemaVersion: 9 }).data).toBeNull();
    expect(migrateLs(null).data.legs).toEqual([]);
  });
  it("par e plano do dia validados", () => {
    expect(makePair({ long: "soxl", short: "sqqq" }).pair).toMatchObject({ id: "SOXL-SQQQ", name: "SOXL × SQQQ" }); // prettier-ignore
    expect(makePair({ long: "SOXL", short: "SOXL" }).ok).toBe(false);
    const plan = { date: "2026-11-27", capital: 25000, pairs: { p: { bias: "alta", trigger: "SOXX > 250", dirPlan: 0 } } }; // prettier-ignore
    expect(checkPlan(plan, "2026-11-27").ok).toBe(true);
    expect(checkPlan(plan, "2026-11-30").ok).toBe(false);
    expect(checkPlan(null, "2026-11-27").ok).toBe(false);
    expect(checkPlan({ ...plan, pairs: { p: { bias: "?", trigger: "", dirPlan: "x" } } }, "2026-11-27").errors).toHaveLength(3); // prettier-ignore
  });
  it("coletor repassa bid/ask só quando válidos e chaves do L&S vão para a nuvem", () => {
    expect(bidAsk({ bid: 19.68, ask: 19.7 })).toEqual({ b: 19.68, a: 19.7 });
    expect(bidAsk({ bid: 0, ask: 19.7 })).toEqual({});
    expect(bidAsk({ bid: 20, ask: 19 })).toEqual({});
    for (const k of ["pendulo.ls.params", "pendulo.ls.plan", "pendulo.ls.pairs", "pendulo.ls.assets"]) expect(WHOLE).toContain(k); // prettier-ignore
  });
});
