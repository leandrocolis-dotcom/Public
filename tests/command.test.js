import { describe, expect, it } from "vitest";
import { parseCommand, suggestCommands } from "../assets/command.js";

const NAMES = {
  dash: "Painel",
  portfolio: "Carteira",
  news: "News",
  trig: "Agora",
  flow: "Mapa de fluxo",
};

describe("barra de comandos", () => {
  it("mnemônico de aba", () =>
    expect(parseCommand("port")).toEqual({ type: "tab", tab: "portfolio" }));
  it("ignora aba inexistente", () => expect(parseCommand("CAL", ["dash"])).toBeNull());
  it("ticker + função", () =>
    expect(parseCommand(" spy  ta ")).toEqual({ type: "asset", sym: "SPY", go: "page" }));
  it("ticker com sufixo", () =>
    expect(parseCommand("PETR4.SA DES")).toEqual({ type: "asset", sym: "PETR4.SA", go: "page" }));
  it("texto livre não é comando", () => expect(parseCommand("apple inc")).toBeNull());
  it("ticker sozinho não é comando", () => expect(parseCommand("AAPL")).toBeNull());
  it("sugere por prefixo, exato primeiro", () => {
    const s = suggestCommands("n", NAMES);
    expect(s[0]).toMatchObject({ cmd: "N", tab: "news", exact: true });
  });
  it("não repete a mesma aba", () => {
    const tabs = suggestCommands("p", NAMES).map((x) => x.tab);
    expect(new Set(tabs).size).toBe(tabs.length);
  });
  it("sugere função de ativo", () =>
    expect(suggestCommands("QQQ AN", NAMES)[0]).toMatchObject({ go: "analysis", sym: "QQQ" }));
});
