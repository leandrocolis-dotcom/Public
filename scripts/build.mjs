// Build de produção (docs/PLANO-OTIMIZACAO.md, Fase 4.1/4.2). Roda na Vercel antes do deploy (vercel.json →
// buildCommand). Junta os ~140 módulos de assets/ em UM arquivo minificado com hash no nome (dist/app-XXXX.js),
// faz o mesmo com o CSS e reescreve o index.html para apontar para eles, sem os <link rel="modulepreload">.
// Arquivo com hash nunca muda de conteúdo: a Vercel serve com cache imutável de 1 ano e o service worker usa
// "cópia primeiro". Deploy novo = nomes novos no index.html (que nunca fica em cache sem revalidar).
// Desenvolvimento NÃO usa isto: `npm run dev` serve os módulos soltos do index.html do repositório (4.5).
// Uso: node scripts/build.mjs [--out dist] [--html index.html] [--dry]
//   --dry: gera dist/ e imprime o index.html novo sem gravar (para conferir localmente).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Nome com hash do conteúdo: styles.css → styles-1a2b3c4d.css. */
export function hashedName(name, content) {
  const h = createHash("sha256").update(content).digest("hex").slice(0, 10);
  const dot = name.lastIndexOf(".");
  return `${name.slice(0, dot)}-${h}${name.slice(dot)}`;
}

/**
 * index.html de produção: troca o CSS e o módulo de entrada pelos arquivos com hash e tira os modulepreload
 * dos módulos soltos (o pacote já traz tudo). `css` mapeia "assets/styles.css" → "dist/styles-….css".
 * Falha alto se algo esperado não estiver no HTML (melhor um deploy que não sai do que um app quebrado).
 */
export function rewriteHtml(html, { js, css }) {
  let out = html.replace(/^ *<link rel="modulepreload" href="assets\/[^"]+" \/>\n/gm, "");
  for (const [src, dst] of Object.entries(css)) {
    const re = new RegExp(`href="${src.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(\\?v=\\d+)?"`);
    if (!re.test(out)) throw new Error(`index.html sem <link> para ${src}`);
    out = out.replace(re, `href="${dst}"`);
  }
  const entry = /<script type="module" src="assets\/app\.js(\?v=\d+)?"><\/script>/;
  if (!entry.test(out)) throw new Error("index.html sem <script type=module src=assets/app.js>");
  out = out.replace(entry, `<script type="module" src="${js}"></script>`);
  // o navegador já começa a baixar o pacote enquanto lê o <head>
  out = out.replace(/\n *<\/head>/, `\n    <link rel="modulepreload" href="${js}" />\n  </head>`);
  if (/assets\/[\w-]+\.js/.test(out)) throw new Error("index.html ainda aponta para módulo solto");
  return out;
}

/** Arquivos com hash citados pelo HTML (o service worker usa a mesma regra para limpar cópias velhas). */
export const distRefs = (html) => [...new Set(html.match(/dist\/[\w.-]+/g) ?? [])];

async function main() {
  const arg = (n, d) => {
    const i = process.argv.indexOf(`--${n}`);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const dry = process.argv.includes("--dry");
  const outDir = arg("out", "dist");
  const htmlPath = `${ROOT}${arg("html", "index.html")}`;
  const { build, transform } = await import("esbuild");

  rmSync(`${ROOT}${outDir}`, { recursive: true, force: true });
  mkdirSync(`${ROOT}${outDir}`, { recursive: true });

  // JS: um arquivo só (sem divisão: o único import() do app vira carga interna do pacote)
  const res = await build({
    entryPoints: [`${ROOT}assets/app.js`],
    bundle: true,
    format: "esm",
    minify: true,
    target: "es2020",
    write: false,
    legalComments: "none",
    logLevel: "warning",
  });
  const code = res.outputFiles[0].text;
  const js = `${outDir}/${hashedName("app.js", code)}`;
  writeFileSync(`${ROOT}${js}`, code);

  // CSS: minificado; url("../fonts/…") continua valendo (dist/ está na mesma altura de assets/)
  const css = {};
  for (const f of ["themes.css", "styles.css"]) {
    const src = readFileSync(`${ROOT}assets/${f}`, "utf8");
    const min = (await transform(src, { loader: "css", minify: true })).code;
    const dst = `${outDir}/${hashedName(f, min)}`;
    writeFileSync(`${ROOT}${dst}`, min);
    css[`assets/${f}`] = dst;
  }

  const html = rewriteHtml(readFileSync(htmlPath, "utf8"), { js, css });
  if (dry) console.log(html);
  else writeFileSync(htmlPath, html);
  const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
  console.log(`build: ${js} (${kb(code)}), ${Object.values(css).join(", ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(`build falhou: ${e.message}`);
    process.exit(1);
  });
