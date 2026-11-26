import { describe, expect, it } from "vitest";
import {
  activeContract,
  backAdjust,
  contractsBetween,
  futMonth,
  rollHistory,
  rootOf,
} from "../assets/futures.js";
import { applyFutContracts, futContracts } from "../api/quotes.js";
import { adjustTable } from "../scripts/fut-adjust.mjs";

describe("activeContract", () => {
  it("índices trimestrais rolam na semana anterior à 3ª sexta", () => {
    expect(activeContract("ES=F", "2026-10-27").sym).toBe("ESZ26.CME");
    // dez/26: 3ª sexta = 18/12; rola em 10/12
    expect(activeContract("ES=F", "2026-12-09").code).toBe("ESZ26");
    expect(activeContract("ES=F", "2026-12-10").code).toBe("ESH27");
    expect(activeContract("YM=F", "2026-10-27").sym).toBe("YMZ26.CBT");
  });
  it("petróleo é mensal e rola antes do vencimento do mês anterior", () => {
    expect(activeContract("CL=F", "2026-10-27").sym).toBe("CLZ26.NYM");
    expect(activeContract("CL=F", "2026-11-17").sym).toBe("CLF27.NYM");
  });
  it("respeita os meses listados de cada mercado", () => {
    expect(activeContract("GC=F", "2026-10-27").code).toBe("GCZ26"); // ouro: G J M Q V Z
    expect(activeContract("GC=F", "2026-11-25").code).toBe("GCG27");
    expect(activeContract("PL=F", "2026-10-27").code).toBe("PLF27"); // platina: F J N V
    expect(activeContract("HE=F", "2026-10-27").code).toBe("HEZ26");
    expect(activeContract("SB=F", "2026-10-27").sym).toBe("SBH27.NYB");
    expect(activeContract("BTC=F", "2026-10-27").sym).toBe("BTCX26.CME");
  });
  it("só reconhece contínuos de raízes conhecidas", () => {
    expect(rootOf("HE=F")).toBe("HE");
    expect(rootOf("XYZ=F")).toBeNull();
    expect(rootOf("SPY")).toBeNull();
    expect(activeContract("SPY")).toBeNull();
  });
  it("futMonth mostra o vencimento em português", () => {
    expect(futMonth("HEZ26")).toBe("dez/26");
    expect(futMonth("6LF27")).toBe("jan/27");
    expect(futMonth(null)).toBe("");
  });
  it("contractsBetween encadeia os contratos da janela", () => {
    const c = contractsBetween("HE=F", "2026-06-01", "2026-10-27");
    expect(c.map((x) => x.code)).toEqual(["HEM26", "HEN26", "HEQ26", "HEV26", "HEZ26"]);
    expect(c[1].from).toBe(c[0].rollAt);
  });
});

describe("backAdjust / rollHistory", () => {
  const dates = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
  const seg = [{ sym: "K", from: "0000-00-00" }];
  it("contínuo congelado vira o preço do contrato (sem buraco)", () => {
    const cont = [6.7, 6.7, 6.7, 6.7, 6.7]; // Yahoo parado depois do vencimento
    const k = { K: { "2026-10-19": 6.71, "2026-10-20": 6.69, "2026-10-21": 6.68, "2026-10-22": 6.66, "2026-10-23": 6.65 } }; // prettier-ignore
    const r = backAdjust(dates, cont, k, seg);
    expect(r.close).toEqual([6.71, 6.69, 6.68, 6.66, 6.65]);
    expect(r.src.every((s) => s === "K")).toBe(true);
  });
  it("emenda por razão: a troca de fonte não vira variação e o fim é o preço do contrato", () => {
    const cont = [100, 101, 102, 103, 104];
    const k = { K: { "2026-10-21": 112.2, "2026-10-22": 113.3, "2026-10-23": 114.4 } }; // +10% (outro vencimento)
    const r = backAdjust(dates, cont, k, seg);
    expect(r.close.at(-1)).toBeCloseTo(114.4);
    expect(r.close[1] / r.close[0]).toBeCloseTo(101 / 100); // variações do contínuo preservadas
    expect(r.close[2] / r.close[1]).toBeCloseTo(102 / 101);
  });
  it("cauda sem contínuo é completada pelo contrato", () => {
    const cont = [100, 101, null, null, null];
    const k = { K: { "2026-10-20": 101, "2026-10-21": 102, "2026-10-22": 103, "2026-10-23": 104 } };
    expect(backAdjust(dates, cont, k, seg).close).toEqual([100, 101, 102, 103, 104]);
  });
  it("rollHistory junta as datas das duas fontes e informa o contrato", () => {
    const c = activeContract("HE=F", "2026-10-27");
    const r = rollHistory(
      { dates: ["2026-10-14", "2026-10-15"], close: [70, 80] }, // salto falso de rolagem no contínuo
      { dates: ["2026-10-14", "2026-10-15", "2026-10-16"], close: [80, 80.5, 81] },
      c,
    );
    expect(r.fut).toBe("HEZ26");
    expect(r.dates).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(r.close).toEqual([80, 80.5, 81]);
    expect(rollHistory({ dates: ["a"], close: [1] }, null, c)).toEqual({ dates: ["a"], close: [1], fut: null }); // prettier-ignore
  });
});

describe("api/quotes: contrato vigente no lugar do contínuo", () => {
  it("pede o contrato junto e devolve a cotação dele com o nome do contínuo", () => {
    const map = futContracts(["SPY", "HE=F"], new Date("2026-10-27T12:00:00Z"));
    expect(map).toEqual({ "HE=F": "HEZ26.CME" });
    const q = {
      SPY: { p: 1 },
      "HE=F": { p: 70, t: 1, n: "Lean Hogs" },
      "HEZ26.CME": { p: 64.7, t: 2, pc: 64.6 },
    };
    applyFutContracts(q, map, new Set(["SPY", "HE=F"]));
    expect(q["HEZ26.CME"]).toBeUndefined();
    expect(q["HE=F"]).toEqual({ p: 64.7, t: 2, pc: 64.6, fut: "HEZ26", n: "Lean Hogs" });
  });
  it("sem cotação do contrato, fica o contínuo; contrato pedido pelo usuário fica na resposta", () => {
    const q = { "HE=F": { p: 70, t: 1 }, "CLZ26.NYM": { p: 100, t: 1 } };
    applyFutContracts(q, { "HE=F": "HEZ26.CME", "CL=F": "CLZ26.NYM" }, new Set(["CLZ26.NYM"]));
    expect(q["HE=F"]).toEqual({ p: 70, t: 1 });
    expect(q["CLZ26.NYM"]).toEqual({ p: 100, t: 1 });
    expect(q["CL=F"].fut).toBe("CLZ26");
  });
});

describe("scripts/fut-adjust: tabelas de preços", () => {
  it("troca só os futuros conhecidos e atualiza last_real e o mapa de contratos", () => {
    const t = {
      dates: ["2026-10-21", "2026-10-22", "2026-10-23"],
      close: { "CNH=F": [6.7, 6.7, 6.7], SPY: [1, 2, 3] },
      last_real: { "CNH=F": "2026-10-21", SPY: "2026-10-23" },
    };
    const k = { "CNHZ26.CME": { dates: ["2026-10-21", "2026-10-22", "2026-10-23"], close: [6.66, 6.65, 6.64] } }; // prettier-ignore
    const done = adjustTable(t, "close", (s) => s, k, "2026-10-27");
    expect(done).toEqual([{ key: "CNH=F", fut: "CNHZ26" }]);
    expect(t.close["CNH=F"]).toEqual([6.66, 6.65, 6.64]);
    expect(t.close.SPY).toEqual([1, 2, 3]);
    expect(t.last_real["CNH=F"]).toBe("2026-10-23");
    expect(t.fut).toEqual({ "CNH=F": "CNHZ26" });
  });
});
