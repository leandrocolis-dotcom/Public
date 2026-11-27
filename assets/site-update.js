// Versão do site: detecta atualização, limpa cache e recarrega.
import { clearPwaCache } from "./pwa.js";
import { state } from "./state.js";
import { toast } from "./widgets.js";

/** Pacotes com hash (dist/…) citados por um index.html: mudam só quando o código ou o CSS do site muda. */
export const codeRefs = (html) =>
  [...new Set(html.match(/dist\/[\w.-]+\.(?:js|css)/g) ?? [])].sort().join(" ");

let checkedSha = null;
let watching = false;

/** Recarrega na versão nova se ninguém estiver digitando nem com o painel lateral aberto. */
function applyWhenIdle() {
  if (!state.newVersion) return;
  const typing = document.activeElement?.matches?.("input, textarea, select, [contenteditable]");
  const drawer = !document.getElementById("drawer")?.hidden;
  if (typing || drawer) return;
  hardRefresh();
}
/**
 * Compara a versão publicada com a que esta aba carregou. O commit (informado pela função) muda a cada deploy,
 * inclusive os dos robôs que só gravam dados (preços, varredura, notas): por isso, quando ele muda, confere o
 * index.html publicado e só avisa se os pacotes do código (dist/app-….js, CSS) forem outros.
 */
export function checkVersion() {
  const v = state.live?.version;
  if (!v || v === "dev" || v === checkedSha) return;
  checkedSha = v; // 1ª vez também confere: pega a cópia velha servida pelo service worker
  const tags = document.head.querySelectorAll("script[src], link[href]");
  const mine = codeRefs(
    [...tags].map((t) => t.getAttribute("src") ?? t.getAttribute("href")).join(" "),
  );
  if (!mine) return; // npm run dev: módulos soltos, sem pacote para comparar
  fetch("index.html", { cache: "no-store" })
    .then((r) => (r.ok ? r.text() : null))
    .then((html) => {
      const live = html && codeRefs(html);
      if (!live || live === mine) return;
      state.newVersion = v;
      document.querySelector("[data-action=hard-refresh]")?.classList.add("has-update");
      // versão nova do código: aplica sozinha logo depois de abrir o app, ou quando ele volta para a frente
      // (sem atrapalhar quem está digitando ou com um painel aberto)
      if (performance.now() < 20000) applyWhenIdle();
      else if (!watching) {
        watching = true;
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") applyWhenIdle();
        });
      }
    })
    .catch(() => {}); // sem rede: confere de novo no próximo deploy
}

/** Arquivos do próprio site já carregados nesta página (lista sempre atual, sem manutenção manual). */
function siteFiles() {
  const own = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => u.startsWith(location.origin) && !u.includes("/api/") && !u.includes("/data/"));
  return [...new Set(["./", "index.html", "sw.js", "manifest.webmanifest", ...own])];
}

/** Baixa de novo todos os arquivos do site ignorando o cache e recarrega a página. */
export async function hardRefresh() {
  toast("Baixando a versão mais recente do site…", "ok", 5000);
  await clearPwaCache();
  await Promise.allSettled(siteFiles().map((f) => fetch(f, { cache: "reload" })));
  const u = new URL(location.href);
  u.searchParams.set("r", String(Date.now()));
  location.replace(u);
}

/**
 * Atualização manual (botão Recarregar / tecla R): busca os preços E renova o cache do site.
 * Zera os prazos dos caches em memória (fundamentos, barras diárias), busca tudo de novo e,
 * se a função informar um deploy novo, aplica na hora (baixa os arquivos novos e recarrega a página);
 * senão, rebaixa os arquivos do site ignorando o cache para a cópia offline ficar em dia.
 */
export async function manualReload(load, { resetCaches = () => {} } = {}) {
  resetCaches();
  await load({ notify: true });
  if (state.newVersion) return hardRefresh();
  await Promise.allSettled(siteFiles().map((f) => fetch(f, { cache: "reload" })));
  toast("Preços e cache do site atualizados.", "ok", 3000);
}
