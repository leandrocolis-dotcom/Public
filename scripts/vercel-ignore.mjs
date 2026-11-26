// "Ignored Build Step" da Vercel (vercel.json → ignoreCommand). Sai 0 = NÃO publica; sai 1 = publica.
// Plano grátis: 100 deploys por dia, e todo commit no main publicava, até os que só mudam docs, testes,
// workflows ou estudos/diários que o app nunca lê. Regra: publica se QUALQUER arquivo mudado desde o último
// deploy pode mudar o que o site serve; na dúvida (sem histórico, erro do git), publica.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Arquivos que nunca chegam ao site: documentação, testes, CI e as funções do Supabase. */
const NEVER = [/^docs\//, /^tests\//, /^\.github\//, /^supabase\//, /^[^/]+\.md$/, /^\.ui-audit\//];

/** O arquivo mudado precisa de deploy? `appSrc` = código que roda no site (para ver se um data/*.json é lido). */
export function needsDeploy(file, appSrc) {
  if (NEVER.some((re) => re.test(file))) return false;
  const m = /^data\/([^/]+\.json)$/.exec(file);
  if (m) return appSrc.includes(m[1].replace(/\.json$/, "")); // lido pelo app ou pelas funções (por nome)
  return true; // código, data/hist (lido pelo api/analyze), scripts usados no build etc.
}

/** Fonte de tudo o que roda no site: assets/, api/, scripts/lib/ (o api importa), sw.js e index.html. */
export function appSources(root = ROOT) {
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(m?js|html)$/.test(f)) out.push(readFileSync(p, "utf8"));
    }
  };
  for (const d of ["assets", "api", "scripts/lib"]) walk(join(root, d));
  for (const f of ["sw.js", "index.html"]) out.push(readFileSync(join(root, f), "utf8"));
  return out.join("\n");
}

function main() {
  const ref = process.env.VERCEL_GIT_COMMIT_REF;
  if (ref && ref !== "main") return 0; // só o main publica (as outras branches já ficam fora)
  let files;
  try {
    const base = process.env.VERCEL_GIT_PREVIOUS_SHA || "HEAD^";
    files = execSync(`git diff --name-only ${base} HEAD`, { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    console.log("sem histórico para comparar: publica");
    return 1;
  }
  const src = appSources();
  const need = files.filter((f) => needsDeploy(f, src));
  if (!files.length || need.length) {
    console.log(`publica: ${need.slice(0, 8).join(", ") || "sem lista de arquivos"}`);
    return 1;
  }
  console.log(
    `sem mudança no site (${files.length} arquivo(s) de docs/testes/estudos): não publica`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
