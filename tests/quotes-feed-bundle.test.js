// A Edge Function `quotes-feed` busca as cotações com o api/quotes.js empacotado (quotes.bundle.js).
// Se alguém mudar api/quotes.js, o universo ou os futuros sem rodar `npm run build:feed`, o robô de 15 s
// continuaria com a regra velha: este teste trava isso.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundleQuotes, OUT } from "../scripts/build-quotes-feed.mjs";
import { SYMBOLS } from "../api/quotes.js";

describe("quotes-feed: pacote do api/quotes.js", () => {
  it("está atualizado (rode `npm run build:feed` e reimplante a função)", async () => {
    expect(readFileSync(OUT, "utf8")).toBe(await bundleQuotes());
  });

  it("expõe a mesma busca e o mesmo universo do app, sem process da Vercel", async () => {
    const m = await import("../supabase/functions/quotes-feed/quotes.bundle.js");
    expect(typeof m.fetchAll).toBe("function");
    expect(m.SYMBOLS).toEqual(SYMBOLS);
    expect(m.SYMBOL_RE.test("BRK-B")).toBe(true);
    const code = readFileSync(OUT, "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bprocess\b/);
  });

  it("a função não chama funções da Vercel (só baixa o pacote estático, sem CPU)", () => {
    const src = readFileSync(OUT.replace("quotes.bundle.js", "index.ts"), "utf8");
    expect(src).not.toMatch(/vercel\.app\/api\//);
    expect(src).toMatch(/vercel\.app\/supabase\/functions\/quotes-feed\/quotes\.bundle\.js/);
  });
});
