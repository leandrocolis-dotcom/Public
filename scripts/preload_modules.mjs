// Atualiza os <link rel="modulepreload"> do index.html com todos os módulos que o app.js importa (direta ou indiretamente).
// Uso: npm run preload   (o teste tests/preload.test.js falha se o index.html estiver desatualizado)
import { readFileSync, writeFileSync } from "node:fs";

export function importClosure(entry = "app.js") {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    const src = readFileSync(new URL(`../assets/${f}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/from\s+"\.\/([\w-]+\.js)"/g)) walk(m[1]);
  };
  walk(entry);
  seen.delete(entry);
  return [...seen].sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = new URL("../index.html", import.meta.url);
  const links = importClosure()
    .map((f) => `    <link rel="modulepreload" href="assets/${f}" />`)
    .join("\n");
  const html = readFileSync(path, "utf8").replace(
    /( {4}<link rel="stylesheet" href="assets\/styles\.css[^\n]*\n)(?: {4}<link rel="modulepreload"[^\n]*\n)*/,
    (_, css) => `${css}${links}\n`,
  );
  writeFileSync(path, html);
  console.log("index.html atualizado com", links.split("\n").length, "modulepreload");
}
