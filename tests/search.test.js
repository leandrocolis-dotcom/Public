import { describe, expect, it } from "vitest";
import { markMatch, mergeSuggestions, norm, rankLocal } from "../assets/search.js";
import { parseSearch } from "../api/search.js";

const U = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "APP", name: "AppLovin" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "PETR4.SA", name: "Petrobras PN" },
  { symbol: "VALE", name: "Vale S.A." },
];

describe("busca de ativo", () => {
  it("norm tira acento e caixa", () => expect(norm(" Açúcar ")).toBe("acucar"));
  it("ticker exato vem primeiro", () => expect(rankLocal("app", U)[0].symbol).toBe("APP"));
  it("nome casa por prefixo", () => expect(rankLocal("apple", U)[0].symbol).toBe("AAPL"));
  it("app traz AAPL entre os 3 primeiros", () =>
    expect(
      rankLocal("app", U)
        .slice(0, 3)
        .map((x) => x.symbol),
    ).toContain("AAPL"));
  it("palavra do meio do nome", () => expect(rankLocal("petrob", U)[0].symbol).toBe("PETR4.SA"));
  it("vazio não sugere", () => expect(rankLocal("", U)).toEqual([]));
  it("mescla sem repetir e completa dados", () => {
    const m = mergeSuggestions(
      [{ symbol: "AAPL", name: "Apple" }],
      [
        { symbol: "AAPL", name: "Apple Inc.", exch: "NASDAQ", type: "Ação" },
        { symbol: "AAPL.BA", name: "Apple CEDEAR", exch: "Buenos Aires", type: "Ação" },
      ],
    );
    expect(m.map((x) => x.symbol)).toEqual(["AAPL", "AAPL.BA"]);
    expect(m[0].exch).toBe("NASDAQ");
  });
  it("destaca o trecho", () =>
    expect(markMatch("Apple", "pp", (s) => s)).toBe("A<mark>pp</mark>le"));
  it("parseSearch filtra tipos e marca ISIN", () => {
    const j = { quotes: [
      { symbol: "AAPL", quoteType: "EQUITY", longname: "Apple Inc.", exchDisp: "NASDAQ" },
      { symbol: "X", quoteType: "OPTION", shortname: "opção" },
      { symbol: "AAPL", quoteType: "EQUITY", shortname: "dup" },
    ] }; // prettier-ignore
    expect(parseSearch(j, "US0378331005")).toEqual([
      { symbol: "AAPL", name: "Apple Inc.", exch: "NASDAQ", type: "Ação", isin: "US0378331005" },
    ]);
  });
});
