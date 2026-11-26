import { describe, expect, it } from "vitest";
import {
  BTG_STALE_MS,
  brokerHistory,
  brokerView,
  btgButton,
  brazilTable,
  btgFireDone,
  btgParts,
  onshoreClass,
} from "../assets/btg.js";

describe("btgFireDone", () => {
  const since = "2026-11-23T10:11:53Z";
  it("clique repetido com a foto já gravada não espera", () => {
    expect(btgFireDone({ already: true, since, syncedAt: "2026-11-23T10:12:47Z" })).toBe(true);
  });
  it("leitura ainda em curso continua esperando", () => {
    expect(btgFireDone({ already: true, since, syncedAt: "2026-11-23T10:01:38Z" })).toBe(false);
  });
  it("disparo novo sempre espera a foto", () => {
    expect(btgFireDone({ since, syncedAt: "2026-11-23T10:12:47Z" })).toBe(false);
    expect(btgFireDone({ already: true, since })).toBe(false);
  });
});

const asOf = "2026-11-22T21:48:39.601Z";
const now = Date.parse(asOf) + 3600 * 1000;
const row = (extra = {}) => ({
  asOf,
  status: "ok",
  summary: {
    asOf,
    fx: { ptax: 5.8883, date: "2026-11-18" },
    onshore: { total: 100, items: [{ name: "CDB <x>", value: 100, date: "2026-11-19" }] },
    offshore: { totalUsd: 10, investedUsd: 7, cashUsd: 3, totalBrl: 58.88 },
  },
  ...extra,
});

const btgCard = (...a) => {
  const p = btgParts(...a);
  return p ? p.kpis + p.card + brazilTable(p.v) : "";
};

describe("contas BTG", () => {
  it("soma Brasil e internacional em reais", () => {
    const v = brokerView(row(), now);
    expect(v.totalBrl).toBeCloseTo(158.88, 2);
    expect(v.stale).toBe(false);
  });
  it("sem foto válida não desenha nada", () => {
    expect(brokerView(null)).toBeNull();
    expect(btgCard({ summary: {} })).toBe("");
  });
  it("avisa foto velha e leitura recusada", () => {
    expect(brokerView(row(), Date.parse(asOf) + BTG_STALE_MS + 1).stale).toBe(true);
    const html = btgCard(row({ status: "rejected", statusDetail: "soma não bate" }), now);
    expect(html).toContain("soma não bate");
    expect(html).toContain("foto anterior");
  });
  it("botão fica travado durante a leitura", () => {
    expect(btgButton()).toContain("Atualizar BTG");
    expect(btgButton({ busy: true })).toContain("disabled");
  });
  it("abre o internacional por ativo, do maior para o menor", () => {
    const r = row();
    r.summary.offshore.positions = [
      { sym: "AAA", qty: 1, avg: 2, price: 2, value: 2, cost: 2 },
      { sym: "BBB", qty: 1, avg: 4, price: 5, value: 5, cost: 4 },
    ];
    const v = brokerView(r, now);
    expect(v.positions.map((p) => p.sym)).toEqual(["BBB", "AAA"]);
    expect(v.positions[0].pl).toBe(1);
    expect(v.positions[0].plPct).toBeCloseTo(0.25, 5);
    expect(v.positions[0].weight).toBeCloseTo(0.5, 5);
  });
  it("escapa texto vindo da corretora", () => {
    const html = btgCard(row(), now);
    expect(html).not.toContain("CDB <x>");
    expect(html).toContain("CDB &lt;x&gt;");
  });
  it("classifica os produtos do Brasil pelo nome", () => {
    expect(onshoreClass("BANCO BTG PACTUAL S A CDI 2028-11-21")).toBe("Renda fixa");
    expect(onshoreClass("Safra Inteligencia Artificial FIM RL")).toBe("Fundos");
    expect(onshoreClass("BTG Pactual Reference Digital Dolar FI Cambial RL")).toBe("Fundos");
    expect(onshoreClass("Valores em Trânsito")).toBe("Caixa");
    expect(onshoreClass("Conta Investimento")).toBe("Caixa");
  });
  it("Brasil com valor aplicado mostra resultado; vencimento sai do nome", () => {
    const r = row();
    r.summary.onshore.items = [
      { name: "CDB X CDI 2028-11-21", value: 100, cost: 80, date: "2026-11-19" },
    ];
    const v = brokerView(r, now);
    expect(v.onPL).toBe(20);
    expect(v.onPLPct).toBeCloseTo(0.25, 5);
    expect(v.items[0].due).toBe("21/11/2028");
    expect(v.items[0].wTotal).toBeCloseTo(100 / 158.88, 4);
  });
  it("internacional usa o preço ao vivo e soma o dia; mistura fecha 100%", () => {
    const r = row();
    r.summary.offshore.positions = [{ sym: "AAA", qty: 2, avg: 3, price: 3.5, value: 7 }];
    const v = brokerView(r, now, { AAA: { price: 4, dayPL: 1, dayPLPct: 0.1 } });
    expect(v.positions[0].value).toBe(8);
    expect(v.positions[0].live).toBe(true);
    expect(v.offPL).toBe(2);
    expect(v.dayPL).toBe(1);
    expect(v.offLiveUsd).toBe(11);
    expect(v.mix.reduce((a, m) => a + m.w, 0)).toBeCloseTo(1, 6);
    const html = btgCard(r, now, { live: { AAA: { price: 4, dayPL: 1, dayPLPct: 0.1 } } });
    expect(html).toContain('data-sortable="pfbr"');
    expect(html).not.toContain("pf-btg-off"); // internacional sai só na tabela principal
    expect(html).toContain("Exterior hoje");
    expect(html).toContain("Último pregão");
    expect(html).toContain("pf-split");
  });
  it("Brasil usa o desenho da tabela principal, com filtro mesmo com poucas linhas", () => {
    const html = brazilTable(brokerView(row(), now), ["qty"]);
    expect(html).toContain('class="pf-t pf-t-br hide-qty"');
    expect(html).toContain("data-tt-filter");
    for (const c of ["c-sym", "c-qty", "c-px", "c-val", "c-tot"]) expect(html).toContain(c);
  });
  it("evolução pelas fotos guardadas", () => {
    const h = brokerHistory([
      { as_of: "2026-11-20T21:00:00Z", total_brl: 100 },
      { as_of: "2026-11-21T21:00:00Z", total_brl: 110 },
      { as_of: "2026-11-22T21:00:00Z", total_brl: 99 },
    ]);
    expect(h.prev.d).toBe(-11);
    expect(h.first.pct).toBeCloseTo(-0.01, 6);
    expect(brokerHistory([{ as_of: "2026-11-20T21:00:00Z", total_brl: 1 }]).prev).toBeNull();
  });
  it("dólar ao vivo converte o internacional e o total; selo mostra o que é ao vivo", () => {
    const r = row();
    r.summary.offshore.positions = [{ sym: "AAA", qty: 2, avg: 3, price: 3.5, value: 7 }];
    const live = { AAA: { price: 4, quoteTime: 1795400000 } };
    const v = brokerView(r, now, live, { p: 5, t: 1795400000 });
    expect(v.fx).toBe(5);
    expect(v.liveTotalBrl).toBe(100 + 11 * 5);
    expect(v.positions[0].wTotal).toBeCloseTo(40 / 155, 6);
    expect(v.liveAt).toBeInstanceOf(Date);
    expect(btgCard(r, now, { live, fx: { p: 5, t: 1795400000 } })).toContain("ao vivo");
    expect(brokerView(r, now).fx).toBeCloseTo(5.888, 3); // sem dólar ao vivo: câmbio da foto
  });
});
