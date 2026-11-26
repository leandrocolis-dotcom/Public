import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { importClosure } from "../scripts/preload_modules.mjs";

describe("index.html", () => {
  it("pré-carrega exatamente os módulos que o app.js importa (rode `npm run preload` se falhar)", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const listed = [...html.matchAll(/<link rel="modulepreload" href="assets\/([\w-]+\.js)"/g)]
      .map((m) => m[1])
      .sort();
    expect(listed).toEqual(importClosure());
  });
});
