import { describe, expect, it } from "vitest";
import { codeRefs } from "../assets/site-update.js";

describe("codeRefs", () => {
  const html = (js, css) =>
    `<link rel="stylesheet" href="dist/${css}" /><link rel="modulepreload" href="dist/${js}" />` +
    `<script type="module" src="dist/${js}"></script>`;
  it("mesmo pacote (deploy só de dados) = mesma assinatura", () => {
    expect(codeRefs(html("app-aa.js", "styles-1.css"))).toBe(
      codeRefs(html("app-aa.js", "styles-1.css")),
    );
  });
  it("código novo muda a assinatura", () => {
    expect(codeRefs(html("app-bb.js", "styles-1.css"))).not.toBe(
      codeRefs(html("app-aa.js", "styles-1.css")),
    );
  });
  it("modo dev (módulos soltos) não tem assinatura", () => {
    expect(codeRefs('<script type="module" src="assets/app.js"></script>')).toBe("");
  });
});
