// Empacota a busca de cotações do app (api/quotes.js: Yahoo → spark → Nasdaq + contratos de futuros) num único
// arquivo para a Edge Function `quotes-feed` do Supabase. Assim o robô de 15 s busca direto no Yahoo, sem
// chamar a Vercel (a chamada a /api/quotes a cada 15 s estourava a cota de CPU do plano grátis), e a regra
// continua num lugar só: mudou api/quotes.js (ou o universo), rode `npm run build:feed` e reimplante a função.
// Também entram a regra de sessão (assets/sessions.js), as camadas (feed-tiers.js) e o delta (feed-delta.js).
// O teste tests/quotes-feed-bundle.test.js falha se o pacote ficar velho.
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ASSETS } from "../assets/universe.js";
import { FLOW_ASSETS } from "../assets/flow-universe.js";
import { BR_SYMBOLS } from "../assets/br-universe.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const OUT = `${ROOT}supabase/functions/quotes-feed/quotes.bundle.js`;

// Os universos entram só com os símbolos que o api/quotes.js lê (nomes, pares e grupos ficam de fora):
// o pacote cai de ~46 KB para ~20 KB. Mesmos valores, tirados dos arquivos de verdade na hora do build.
const json = (v) => JSON.stringify(v);
const SLIM = {
  "universe.js": `export const ASSETS = ${json(
    Object.fromEntries(Object.entries(ASSETS).map(([k, a]) => [k, { yahoo: a.yahoo }])),
  )};`,
  "flow-universe.js": `export const FLOW_ASSETS = ${json(FLOW_ASSETS.map((a) => ({ sym: a.sym })))};`,
  "br-universe.js": `export const BR_SYMBOLS = ${json(BR_SYMBOLS)};`,
};
const slimUniverse = {
  name: "slim-universe",
  setup(b) {
    b.onResolve({ filter: /\/(universe|flow-universe|br-universe)\.js$/ }, (a) => {
      const file = a.path.split("/").pop();
      return a.importer.endsWith("api/quotes.js") && SLIM[file]
        ? { path: file, namespace: "slim" }
        : undefined;
    });
    b.onLoad({ filter: /.*/, namespace: "slim" }, (a) => ({
      contents: SLIM[a.path],
      loader: "js",
    }));
  },
};

/** Código do pacote (string). */
export async function bundleQuotes() {
  const r = await build({
    stdin: {
      contents: [
        'export { fetchAll, SYMBOLS, SYMBOL_RE } from "./api/quotes.js";',
        'export { feedSession, nyClock } from "./assets/sessions.js";',
        'export { hotList, pickTier, yahooCalls } from "./assets/feed-tiers.js";',
        'export { addStats, newMem, planPacket, SNAP_EVERY, ZERO_STATS } from "./assets/feed-delta.js";',
      ].join("\n"),
      resolveDir: ROOT,
      sourcefile: "quotes-feed-entry.js",
    },
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    legalComments: "none",
    plugins: [slimUniverse],
    // no Supabase não há process.env da Vercel: a versão sai "dev" e o resto do api/ não é usado
    define: { "process.env": "{}" },
  });
  const head =
    "// GERADO por scripts/build-quotes-feed.mjs a partir de api/quotes.js. Não edite: rode `npm run build:feed`.\n";
  return head + r.outputFiles[0].text;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, await bundleQuotes());
  console.log(`ok: ${OUT}`);
}
