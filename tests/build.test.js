import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { distRefs, hashedName, rewriteHtml } from "../scripts/build.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const opts = {
  js: "dist/app-abc123.js",
  css: { "assets/themes.css": "dist/themes-1.css", "assets/styles.css": "dist/styles-2.css" },
};

describe("build de produção (Fase 4)", () => {
  it("nome com hash muda com o conteúdo e mantém a extensão", () => {
    expect(hashedName("app.js", "a")).toMatch(/^app-[0-9a-f]{10}\.js$/);
    expect(hashedName("app.js", "a")).toBe(hashedName("app.js", "a"));
    expect(hashedName("app.js", "a")).not.toBe(hashedName("app.js", "b"));
  });

  it("index.html real: aponta para o pacote, sem módulos soltos nem modulepreload antigos", () => {
    const out = rewriteHtml(html, opts);
    expect(out).toContain('<script type="module" src="dist/app-abc123.js"></script>');
    expect(out).toContain('<link rel="modulepreload" href="dist/app-abc123.js" />');
    expect(out).toContain('href="dist/styles-2.css"');
    expect(out).toContain('href="dist/themes-1.css"');
    expect(out).not.toMatch(/assets\/[\w-]+\.(js|css)/);
    expect(out.match(/modulepreload/g)).toHaveLength(1);
    // o resto da página (manifest, ícones, Chart.js) continua igual
    expect(out).toContain('rel="manifest"');
    expect(out).toContain('src="vendor/chart.umd.min.js"');
  });

  it("falha alto se o HTML não tiver o que trocar (deploy não sai quebrado)", () => {
    expect(() => rewriteHtml("<html></html>", opts)).toThrow(/sem <link>/);
    const noEntry = html.replace(/<script type="module"[^\n]*\n/, "");
    expect(() => rewriteHtml(noEntry, opts)).toThrow(/assets\/app\.js/);
  });

  it("lista os arquivos de dist/ citados (regra que o service worker usa para limpar o cache)", () => {
    expect(distRefs(rewriteHtml(html, opts)).sort()).toEqual([
      "dist/app-abc123.js",
      "dist/styles-2.css",
      "dist/themes-1.css",
    ]);
    expect(distRefs(html)).toEqual([]);
  });
});
