// Copia Chart.js e as fontes (woff2) de node_modules para vendor/ e fonts/,
// para o site não depender de CDN. Rode: npm run vendor
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("vendor", { recursive: true });
mkdirSync("fonts", { recursive: true });
copyFileSync("node_modules/chart.js/dist/chart.umd.min.js", "vendor/chart.umd.min.js");
// Lightweight Charts (TradingView, Apache 2.0): gráfico do ativo na aba Quando entrar, carregado sob demanda.
copyFileSync(
  "node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js",
  "vendor/lightweight-charts.standalone.production.js",
);
// Instrument Sans: texto da interface. Geist Mono: números (algarismos tabulares).
for (const w of [400, 500, 600, 700]) {
  copyFileSync(
    `node_modules/@fontsource/instrument-sans/files/instrument-sans-latin-${w}-normal.woff2`,
    `fonts/instrument-sans-${w}.woff2`,
  );
}
for (const w of [400, 500, 600]) {
  copyFileSync(
    `node_modules/@fontsource/geist-mono/files/geist-mono-latin-${w}-normal.woff2`,
    `fonts/geist-mono-${w}.woff2`,
  );
}
console.log("vendor/ e fonts/ atualizados");
