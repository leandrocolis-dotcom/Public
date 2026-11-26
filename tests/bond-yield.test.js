import { describe, expect, it } from "vitest";
import { addMonths, cashflows, du, easter, holidays, isBusiness, parseSchedule, schedNum, yieldToWorst } from "../assets/bond-yield.js"; // prettier-ignore

describe("calendário ANBIMA", () => {
  it("Páscoa e feriados móveis", () => {
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    const h = holidays(2026);
    for (const d of ["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-11-20", "2026-04-21"]) expect(h.has(d)).toBe(true); // prettier-ignore
    expect(holidays(2023).has("2023-11-20")).toBe(false); // Consciência Negra nacional só desde 2024
  });
  it("dias úteis em [início, fim)", () => {
    expect(isBusiness("2026-11-24")).toBe(true);
    expect(isBusiness("2026-11-20")).toBe(false);
    expect(du("2026-11-23", "2026-11-30")).toBe(5); // seg a sex (sem feriado nessa semana)
    expect(du("2026-11-16", "2026-11-23")).toBe(4); // 16 a 19/11; 20/11 (Consciência Negra) é feriado
  });
  it("meses: dia 31 vira o último dia do mês", () => {
    expect(addMonths("2026-08-31", -6)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", 12)).toBe("2027-01-15");
  });
});

describe("preço → taxa", () => {
  const base = { idx: "pre", coupon: 12, freq: 6, maturity: "2030-06-15", settle: "2026-11-24", cdi: 14.9, calls: [], amort: [] }; // prettier-ignore

  it("no par (100% do PU par) a taxa é o próprio cupom, em qualquer indexador", () => {
    expect(yieldToWorst({ ...base, price: 100 }).ytm.rate).toBeCloseTo(12, 6);
    expect(yieldToWorst({ ...base, idx: "ipca", coupon: 7.5, price: 100 }).ytm.rate).toBeCloseTo(
      7.5,
      6,
    );
    expect(yieldToWorst({ ...base, idx: "cdis", coupon: 1.2, price: 100 }).ytm.rate).toBeCloseTo(
      1.2,
      6,
    );
    expect(yieldToWorst({ ...base, idx: "pcdi", coupon: 110, price: 100 }).ytm.rate).toBeCloseTo(
      110,
      4,
    );
  });

  it("título sem cupom (bullet): segunda rota pela fórmula fechada", () => {
    const r = yieldToWorst({ ...base, freq: 0, price: 95 });
    const n = du("2026-11-24", "2030-06-17"); // 15/06/2030 é sábado → paga na segunda
    // PU par = 100; fluxo = 100 × 1,12^(n/252); preço 95 → (1 + y)^(n/252) = 1,12^(n/252) / 0,95
    const y = (1.12 ** (n / 252) / 0.95) ** (252 / n) - 1;
    expect(r.ytm.rate).toBeCloseTo(y * 100, 6);
    expect(r.ytm.du).toBe(n);
  });

  it("YTW: com ágio o pior é o resgate antecipado; com deságio é o vencimento", () => {
    const calls = [{ date: "2027-12-15", v: 100 }];
    const premium = yieldToWorst({ ...base, price: 103, calls });
    expect(premium.rows).toHaveLength(2);
    expect(premium.worst.kind).toBe("call");
    expect(premium.worst.rate).toBeLessThan(premium.ytm.rate);
    expect(premium.ytm.rate).toBeLessThan(12);
    const discount = yieldToWorst({ ...base, price: 97, calls });
    expect(discount.worst.kind).toBe("maturity");
    expect(discount.ytm.rate).toBeGreaterThan(12);
    // resgate com prêmio de 1%: a taxa até o resgate sobe
    const prem = yieldToWorst({ ...base, price: 103, calls: [{ date: "2027-12-15", v: 101 }] });
    expect(prem.rows[1].rate).toBeGreaterThan(premium.rows[1].rate);
    // resgate antes da liquidação ou depois do vencimento é ignorado
    expect(
      yieldToWorst({ ...base, price: 103, calls: [{ date: "2026-01-01", v: 100 }] }).rows,
    ).toHaveLength(1);
  });

  it("amortizações: juros sobre o saldo e soma do principal = 100", () => {
    const amort = [{ date: "2029-06-15", v: 50 }];
    const cf = cashflows(
      { idx: "pre", coupon: 0.12, freq: 6, maturity: "2030-06-15", amort },
      "2026-11-24",
      0.149,
    );
    const principal = cf.flows.reduce((s, f) => s + f.principal, 0);
    expect(principal).toBeCloseTo(100, 9);
    const after = cf.flows.find((f) => f.date === "2029-12-15");
    const before = cf.flows.find((f) => f.date === "2028-12-15");
    expect(after.interest).toBeLessThan(before.interest * 0.6); // metade do saldo paga ~metade do juro
    expect(yieldToWorst({ ...base, amort, price: 100 }).ytm.rate).toBeCloseTo(12, 6);
    expect(
      yieldToWorst({ ...base, amort: [{ date: "2029-06-15", v: 150 }], price: 100 }).error,
    ).toBeTruthy();
  });

  it("duration: título sem cupom = prazo; com cupom, menor que o prazo", () => {
    const z = yieldToWorst({ ...base, freq: 0, price: 100 }).ytm;
    expect(z.duration).toBeCloseTo(z.years, 9);
    const c = yieldToWorst({ ...base, price: 100 }).ytm;
    expect(c.duration).toBeLessThan(c.years);
  });

  it("entradas inválidas", () => {
    expect(yieldToWorst({ ...base, price: 0 }).error).toBeTruthy();
    expect(yieldToWorst({ ...base, maturity: "2025-01-01", price: 100 }).error).toBeTruthy();
  });

  it("lista de datas e valores (dd/mm/aaaa ou ISO, vírgula ou ponto)", () => {
    const r = parseSchedule("15/12/2027 101,5\n2028-12-15 100.5\nlixo 31/02/2027 3");
    expect(r.list).toEqual([
      { date: "2027-12-15", v: 101.5 },
      { date: "2028-12-15", v: 100.5 },
    ]);
    expect(r.bad).toEqual(["31/02/2027"]);
  });

  it("colado do site: data numa linha e % na seguinte", () => {
    const r = parseSchedule("18/04/2022\n5,86%\n17/10/2022\n5,86%\n17/04/2023\n5,86%\n");
    expect(r.list).toEqual([
      { date: "2022-04-18", v: 5.86 },
      { date: "2022-10-17", v: 5.86 },
      { date: "2023-04-17", v: 5.86 },
    ]);
    expect(r.bad).toEqual([]);
  });

  it("colado de tabela: índice antes da data e colunas extras depois", () => {
    const r = parseSchedule("1\t18/04/2022\tAmortização\t5,8600%\t58,60\n2\t17/10/2022\tAmortização\t33,333%"); // prettier-ignore
    expect(r.list).toEqual([
      { date: "2022-04-18", v: 5.86 },
      { date: "2022-10-17", v: 33.333 },
    ]);
  });

  it("vírgula é sempre decimal (33,333% não vira 33 mil) e data sem valor é apontada", () => {
    expect(schedNum("33,333%")).toBeCloseTo(33.333, 9);
    expect(schedNum("1.234,56")).toBeCloseTo(1234.56, 9);
    expect(schedNum("100.5")).toBeCloseTo(100.5, 9);
    const r = parseSchedule("18/04/2022\n17/10/2022\n5,86%");
    expect(r.list).toEqual([{ date: "2022-10-17", v: 5.86 }]);
    expect(r.bad).toEqual(["18/04/2022"]);
  });

  it("amortizações já pagas antes da liquidação reduzem o saldo (taxa no par segue = cupom)", () => {
    const amort = parseSchedule("18/04/2025\n25%\n18/04/2026\n25%\n18/04/2028\n25%\n18/04/2029\n25%").list; // prettier-ignore
    const r = yieldToWorst({ ...base, amort, price: 100 });
    expect(r.ytm.rate).toBeCloseTo(12, 6);
    expect(r.puPar).toBeLessThan(55); // saldo de 50% + juros corridos
  });
});
