// Empacota o cálculo dos avisos push (api/push-alerts.js → computeAlerts) e as funções que ele consulta
// (api/quotes, intraday, history, analyze) num único arquivo para a Edge Function `push` do Supabase.
// Assim o robô de 1 min não chama mais a Vercel (cada chamada a /api/push-alerts disparava outras 5 a 10
// funções e gastava a cota de CPU do plano grátis). Mudou api/push-alerts.js, scripts/lib/push-alerts.mjs ou
// alguma regra de aviso? Rode `npm run build:push` e reimplante a função. O teste tests/push-bundle.test.js
// falha se o pacote ficar velho.
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const OUT = `${ROOT}supabase/functions/push/push.bundle.js`;

// a base local data/hist (node:fs) não existe no Supabase: lá o api/analyze busca o histórico inteiro no Yahoo
const noHist = {
  name: "no-hist",
  setup(b) {
    b.onResolve({ filter: /\/_hist\.js$/ }, () => ({ path: "_hist.js", namespace: "nohist" }));
    b.onLoad({ filter: /.*/, namespace: "nohist" }, async () => {
      const { readFileSync } = await import("node:fs");
      const src = readFileSync(`${ROOT}api/_hist.js`, "utf8")
        .replace(/^import .*node:(fs|path).*$/gm, "")
        .replace(/export const HIST_DIR = .*$/m, 'export const HIST_DIR = "";')
        .replace(/export function readHist\([^)]*\) \{[\s\S]*?\n\}/, "export function readHist() {\n  return null;\n}"); // prettier-ignore
      return { contents: src, loader: "js", resolveDir: `${ROOT}api` };
    });
  },
};

/** Código do pacote (string). */
export async function bundlePush() {
  const r = await build({
    stdin: {
      contents: [
        'export { computeAlerts } from "./api/push-alerts.js";',
        'export { localGet } from "./scripts/lib/push-local.mjs";',
      ].join("\n"),
      resolveDir: ROOT,
      sourcefile: "push-entry.js",
    },
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    legalComments: "none",
    plugins: [noHist],
    minify: true, // menos para subir e para o Deno compilar na partida a frio
    define: { "process.env": "{}" },
  });
  const head =
    "// GERADO por scripts/build-push.mjs a partir de api/push-alerts.js. Não edite: rode `npm run build:push`.\n";
  return head + r.outputFiles[0].text;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, await bundlePush());
  console.log(`ok: ${OUT}`);
}
