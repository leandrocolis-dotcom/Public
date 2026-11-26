// Service worker do Pêndulo (PWA). Estratégias (docs/PLANO-OTIMIZACAO.md, 4.3):
// - dist/ (código e CSS com hash no nome, gerados por scripts/build.mjs): CÓPIA PRIMEIRO. O nome muda a cada
//   conteúdo novo, então a cópia guardada nunca fica velha; deploy novo = index.html novo com nomes novos.
// - vendor/, fonts/, icons/: cópia primeiro e atualiza por trás (mudam raramente).
// - index.html (navegação), data/ e o código solto do modo dev (assets/): REDE PRIMEIRO, como antes.
// Offline (avião, metrô), usa a última cópia salva: o selo de frescor mostra a idade real das cotações.
const CACHE = "pendulo-v3"; // v3: código empacotado em dist/ (sai a cópia dos ~140 módulos soltos da v2)
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon.svg"];
const NET_TIMEOUT_MS = 6000;
// dados publicados (data/): sem resposta em 3 s, usa a cópia local (docs/PLANO-OTIMIZACAO.md, 4.3). O código
// segue rede primeiro com 6 s: "cópia primeiro" só depois de nomes com hash (4.1), senão módulos de versões
// diferentes podem se misturar logo após um deploy.
const DATA_TIMEOUT_MS = 3000;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE && k !== "pendulo-notif").map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Chave do cache: navegações viram "./" (ignora ?tab=, ?r=, ?source=); o resto, a URL sem query de cache-busting. */
function keyOf(req) {
  const u = new URL(req.url);
  if (req.mode === "navigate") return new URL("./", self.registration.scope).href;
  u.searchParams.delete("r");
  return u.href;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const key = keyOf(req);
  try {
    const ctl = new AbortController();
    const wait = new URL(req.url).pathname.includes("/data/") ? DATA_TIMEOUT_MS : NET_TIMEOUT_MS;
    const timer = setTimeout(() => ctl.abort(), wait);
    const res = await fetch(req, { signal: ctl.signal, cache: "no-cache" });
    clearTimeout(timer);
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    if (req.mode === "navigate") {
      const shell = await cache.match(new URL("./", self.registration.scope).href);
      if (shell) return shell;
    }
    throw err;
  }
}

/** Arquivo com hash (dist/): cópia primeiro; sem cópia, rede e guarda. */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req.url, res.clone());
  return res;
}

/** vendor/fonts/ícones: responde com a cópia na hora e atualiza a cópia por trás. */
async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(CACHE);
  const key = keyOf(req);
  const hit = await cache.match(key);
  const net = fetch(req)
    .then((res) => {
      if (res.ok && res.type === "basic") cache.put(key, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    e.waitUntil(net);
    return hit;
  }
  return (await net) ?? networkFirst(req);
}

/**
 * Depois de baixar um index.html novo: apaga as cópias de dist/ que ele não cita mais (versões antigas), para o
 * cache não crescer a cada deploy. Mesma regra de scripts/build.mjs (distRefs).
 */
async function pruneDist(res) {
  try {
    const html = await res.text();
    const keep = new Set(
      (html.match(/dist\/[\w.-]+/g) ?? []).map((p) => new URL(p, self.registration.scope).href),
    );
    if (!keep.size) return; // modo dev (sem dist/): nada a limpar
    const cache = await caches.open(CACHE);
    for (const r of await cache.keys())
      if (new URL(r.url).pathname.includes("/dist/") && !keep.has(r.url)) await cache.delete(r);
  } catch {
    /* limpeza é só economia de espaço */
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== self.location.origin) return;
  // API fica fora do service worker: a função pode levar até ~25 s (ativo frio) e o corte de 6 s abaixo
  // derrubava a análise; o cache da borda (Vercel) já cuida de repetir respostas.
  if (u.pathname.startsWith("/api/")) return;
  if (u.pathname.startsWith("/dist/")) return e.respondWith(cacheFirst(req));
  if (/^\/(vendor|fonts|icons)\//.test(u.pathname))
    return e.respondWith(staleWhileRevalidate(req, e));
  if (req.mode === "navigate")
    return e.respondWith(
      networkFirst(req).then((res) => {
        if (res.ok) e.waitUntil(pruneDist(res.clone()));
        return res;
      }),
    );
  e.respondWith(networkFirst(req));
});

// O app pede para limpar tudo (botão ⟳).
self.addEventListener("message", (e) => {
  if (e.data === "clear")
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
});

// Push do servidor: chega mesmo com o app fechado (celular, Mac e, pelo iPhone, o Apple Watch).
// O iOS exige que todo push mostre uma notificação, por isso sempre chamamos showNotification.
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }
  // virada do regime (🔄): a confirmada fica na tela até tocar e vibra forte; a de tendência vibra e substitui
  // a anterior da mesma perna (mesma tag), para o aviso novo não passar despercebido
  const rev = /^🔄/u.test(d.title || "");
  const urgent = rev && /CONFIRMADA/.test(d.title || "");
  e.waitUntil(
    Promise.all([
      logPush(d),
      self.registration.showNotification(d.title || "Pêndulo", {
        body: d.body || "",
        tag: d.tag || undefined,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        data: { url: d.url || "./?tab=signals", update: !!d.update },
        ...(rev
          ? { renotify: !!d.tag, vibrate: urgent ? [300, 120, 300, 120, 600] : [200, 100, 200] }
          : {}),
        ...(urgent ? { requireInteraction: true } : {}),
      }),
    ]),
  );
});

// Histórico de avisos (todas as categorias): o app lê na central do sino e em Sinais › Histórico de avisos.
async function logPush(d) {
  if (!d.title) return;
  try {
    const c = await caches.open("pendulo-notif");
    const r = await c.match("./__notif-log");
    const list = r ? await r.json() : [];
    list.unshift({
      at: Date.now(),
      title: d.title,
      body: d.body || "",
      url: d.url || "./?tab=signals",
    });
    await c.put(
      "./__notif-log",
      new Response(JSON.stringify(list.slice(0, 300)), {
        headers: { "content-type": "application/json" },
      }),
    );
  } catch {
    /* sem cache: só não registra */
  }
}

// Aviso "Pêndulo atualizado": limpa o cache (menos o histórico de avisos) e busca o service worker novo
// ANTES de mostrar qualquer conteúdo; depois recarrega a janela aberta (ou abre uma) já na versão nova.
async function openUpdated(url) {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== "pendulo-notif").map((k) => caches.delete(k)));
  } catch {
    /* segue mesmo assim */
  }
  await self.registration.update().catch(() => {});
  const target = new URL(url, self.registration.scope).href;
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of list) {
    try {
      const nav = "navigate" in c ? await c.navigate(target) : null;
      if (nav) return nav.focus();
    } catch {
      /* janela não controlada: abre uma nova abaixo */
    }
  }
  return self.clients.openWindow(target);
}

// Toque na notificação: traz o app para a frente (ou abre) na aba indicada (padrão: Sinais).
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "./?tab=signals";
  if (e.notification.data?.update) return e.waitUntil(openUpdated(url));
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const c = list.find((w) => "focus" in w);
      if (c) {
        // app já aberto: pede para ele abrir o item (sem recarregar a página) e traz para a frente
        c.postMessage({
          type: "open",
          url,
          title: e.notification.title,
          body: e.notification.body,
        });
        return c.focus();
      }
      // app fechado: leva o texto na url para ele ficar fixo na tela ao abrir
      const u = new URL(url, self.registration.scope);
      u.searchParams.set("nt", e.notification.title || "");
      if (e.notification.body) u.searchParams.set("nb", e.notification.body);
      return self.clients.openWindow(u.href);
    }),
  );
});
