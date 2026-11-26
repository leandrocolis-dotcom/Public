import { describe, expect, it } from "vitest";
import { cusipOfIsin, figiType, idKind, parseFigi, parseTreasury } from "../api/instrument.js";
import { mergeSources } from "../api/search.js";
import { benchmark, instrumentHtml, yearsTo } from "../assets/instrument-view.js";

describe("instrumentos além do Yahoo", () => {
  it("reconhece ISIN, CUSIP e FIGI", () => {
    expect(idKind("us912810tm09")).toEqual(["ID_ISIN", "US912810TM09"]);
    expect(idKind("912810TM0")).toEqual(["ID_CUSIP", "912810TM0"]);
    expect(idKind("BBG000B9XRY4")).toEqual(["ID_BB_GLOBAL", "BBG000B9XRY4"]);
    expect(idKind("apple")).toBeNull();
    expect(cusipOfIsin("US912810TM09")).toBe("912810TM0");
    expect(cusipOfIsin("LU0996182563")).toBeNull();
  });
  it("classifica tipos da OpenFIGI", () => {
    expect(figiType({ marketSector: "Govt", securityType: "US GOVERNMENT" })).toBe(
      "Título público",
    );
    expect(figiType({ marketSector: "Corp", securityType: "GLOBAL" })).toBe("Título privado");
    expect(
      figiType({ marketSector: "Equity", securityType: "SICAV", securityType2: "Mutual Fund" }),
    ).toBe("Fundo");
    expect(figiType({ marketSector: "Comdty", securityType2: "Future" })).toBe("Futuro");
    expect(
      figiType({ marketSector: "Equity", securityType2: "Common Stock", exchCode: "PQ" }),
    ).toBe("Ação");
  });
  it("agrupa listagens pelo FIGI composto", () => {
    const r = parseFigi(
      [
        { figi: "A1", compositeFIGI: "C1", name: "US TREASURY N/B", ticker: "T 4 1/4 05/15/39", marketSector: "Govt", securityType: "US GOVERNMENT" },
        { figi: "A2", compositeFIGI: "C1", name: "US TREASURY N/B" },
      ],
      { isin: "US912810TM09", cusip: "912810TM0" },
    ); // prettier-ignore
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ symbol: "FIGI:C1", type: "Título público", isin: "US912810TM09" });
  });
  it("resume leilões do Tesouro", () => {
    const t = parseTreasury([
      { cusip: "912810TM0", auctionDate: "2024-05-09T00:00:00", issueDate: "2024-05-15T00:00:00", maturityDate: "2054-05-15T00:00:00", securityType: "Bond", securityTerm: "30-Year", interestRate: "4.625000", highYield: "4.635000", pricePer100: "99.843", bidToCoverRatio: "2.41", reopening: "No" },
      { cusip: "912810TM0", auctionDate: "2024-06-13T00:00:00", issueDate: "2024-06-17T00:00:00", maturityDate: "2054-05-15T00:00:00", securityType: "Bond", securityTerm: "29-Year 11-Month", interestRate: "4.625000", highYield: "4.403000", pricePer100: "103.8", bidToCoverRatio: "2.52", reopening: "Yes" },
    ]); // prettier-ignore
    expect(t).toMatchObject({
      type: "Bond",
      coupon: 4.625,
      maturity: "2054-05-15",
      issueDate: "2024-05-15",
    });
    expect(t.auctions[0]).toMatchObject({ date: "2024-06-13", reopening: true, highYield: 4.403 });
    expect(parseTreasury([])).toBeNull();
  });
  it("Yahoo primeiro; OpenFIGI completa sem repetir ação cotada", () => {
    const m = mergeSources([{ symbol: "AAPL", type: "Ação" }], [
      { symbol: "FIGI:X", ticker: "AAPL", type: "Ação" },
      { symbol: "FIGI:Y", ticker: "AAPL 4.65 02/23/46", type: "Título privado" },
    ]); // prettier-ignore
    expect(m.map((x) => x.symbol)).toEqual(["AAPL", "FIGI:Y"]);
  });
  it("página mostra identificadores e dados do Tesouro", () => {
    const html = instrumentHtml({
      id: "US912810TM09",
      instrument: { name: "US TREASURY N/B", figi: "C1", ticker: "T 4 5/8 05/15/54", sector: "Govt", type: "Título público" },
      treasury: { cusip: "912810TM0", type: "Bond", term: "30-Year", maturity: "2054-05-15", issueDate: "2024-05-15", coupon: 4.625, auctions: [{ date: "2024-05-09", highYield: 4.635, price: 99.843, bidToCover: 2.41 }] },
    }); // prettier-ignore
    expect(html).toContain("US912810TM09");
    expect(html).toContain("912810TM0");
    expect(html).toContain("Leilões");
    expect(html).not.toContain("Abrir cotação");
    expect(benchmark(yearsTo("2054-05-15", Date.parse("2026-10-10")))[0]).toBe("^TYX");
  });
});
