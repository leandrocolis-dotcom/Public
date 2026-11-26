// PWA: registro do service worker, botão "Instalar o app" e instruções por plataforma.
let deferred = null; // evento beforeinstallprompt (Chrome/Edge/Android)

const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua)) return /Chrome|Edg\//.test(ua) ? "mac-chrome" : "mac-safari";
  return "desktop";
}

export function initPwa({ onChange } = {}) {
  if ("serviceWorker" in navigator && isSecureContext) {
    navigator.serviceWorker
      .register("sw.js", { scope: "./", updateViaCache: "none" })
      .catch(() => {});
  }
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    onChange?.();
  });
  addEventListener("appinstalled", () => {
    deferred = null;
    onChange?.();
  });
}

/** Abre o prompt nativo quando existe; senão devolve false (mostre as instruções). */
export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  return true;
}

/** Remove service worker e caches (usado pelo ⟳). */
export async function clearPwaCache() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    for (const r of regs) {
      r.active?.postMessage("clear");
      await r.update().catch(() => {});
    }
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
  } catch {
    /* sem suporte */
  }
}

/** HTML das instruções de instalação, destacando a plataforma atual. */
export function installHelp() {
  const p = platform();
  const box = (id, title, steps) =>
    `<div class="card" ${id === p || (id === "mac" && p.startsWith("mac")) ? 'style="outline:2px solid var(--accent)"' : ""}><h3>${title}${id === p || (id === "mac" && p.startsWith("mac")) ? " · este aparelho" : ""}</h3><ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol></div>`;
  return `<h2>Instalar o Pêndulo como app</h2>
  <p class="muted">${isStandalone() ? "Você já está usando o app instalado." : "O app abre em janela própria, com ícone, sem a barra do navegador, e funciona offline com os últimos dados salvos."}</p>
  <div class="install-steps">
    ${box("ios", "iPhone / iPad (Safari)", ["Abra este endereço no <b>Safari</b>.", "Toque em <b>Compartilhar</b> (quadrado com seta).", "Escolha <b>Adicionar à Tela de Início</b> e confirme."])}
    ${box("android", "Android (Chrome)", ["Toque no menu <b>⋮</b>.", "Escolha <b>Instalar app</b> (ou Adicionar à tela inicial)."])}
    ${box("mac", "Mac", ["<b>Safari</b> (macOS 14+): menu <b>Arquivo › Adicionar ao Dock</b>.", "<b>Chrome / Edge</b>: ícone de instalar na barra de endereço, ou menu <b>⋮ › Transmitir, salvar e compartilhar › Instalar página como app</b>."])}
    ${box("desktop", "Windows / Linux (Chrome ou Edge)", ["Clique no ícone de instalar na barra de endereço.", "Confirme em <b>Instalar</b>."])}
  </div>
  <h3>Importante: carteira no app instalado</h3>
  <p>No iPhone e no Mac (Safari), o app instalado tem armazenamento <b>separado</b> do navegador. A carteira e as preferências não passam sozinhas: no navegador, use <b>Configurações › Carteira › Exportar backup</b>; no app, <b>Restaurar backup</b> (ou cole de novo a tabela do Investing).</p>
  <p class="muted">Notificações: no iPhone só funcionam com o app instalado (iOS 16.4+) e com ele aberto.</p>`;
}
