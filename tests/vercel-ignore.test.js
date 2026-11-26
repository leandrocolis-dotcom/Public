import { describe, expect, it } from "vitest";
import { appSources, needsDeploy } from "../scripts/vercel-ignore.mjs";

describe("Vercel: pular deploy sem mudança no site", () => {
  const src = appSources();
  it("docs, testes, CI e Supabase não publicam", () => {
    for (const f of [
      "docs/X.md",
      "README.md",
      "CLAUDE.md",
      "tests/a.test.js",
      ".github/workflows/x.yml",
      "supabase/functions/push/index.ts",
    ])
      expect(needsDeploy(f, src), f).toBe(false);
  });
  it("dados que o app lê publicam; estudos sem leitor, não", () => {
    for (const f of [
      "data/prices.json",
      "data/flow.json",
      "data/ohlc.json",
      "data/fundamentals.json",
      "data/model.json",
      "data/news-weekend.json",
      "data/market-scan.json",
    ])
      expect(needsDeploy(f, src), f).toBe(true);
    for (const f of [
      "data/sector-study.json",
      "data/model-retro-setores.json",
      "data/money-study.json",
    ])
      expect(needsDeploy(f, src), f).toBe(false);
  });
  it("código e base histórica sempre publicam", () => {
    for (const f of [
      "assets/app.js",
      "api/quotes.js",
      "index.html",
      "sw.js",
      "vercel.json",
      "package.json",
      "data/hist/SPY.csv",
      "scripts/build.mjs",
    ])
      expect(needsDeploy(f, src), f).toBe(true);
  });
});
