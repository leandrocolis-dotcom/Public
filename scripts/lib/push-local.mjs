// `get` para computeAlerts (api/push-alerts.js) SEM passar pela Vercel: `api/...` chama a mesma função do app
// direto (mesmo código, mesma regra) e `data/...` vem de `getStatic` (arquivo estático, sem CPU de função).
// Usado pela Edge Function `push` do Supabase (empacotado por scripts/build-push.mjs) e pelo teste de CPU.
import quotes from "../../api/quotes.js";
import intraday from "../../api/intraday.js";
import history from "../../api/history.js";
import analyze from "../../api/analyze.js";

const HANDLERS = { quotes, intraday, history, analyze };

/** Validade do resultado por rota, em ms (a Vercel tinha cache na borda; aqui fica na memória da instância). */
export const TTL = { quotes: 30e3, intraday: 60e3, leaders: 120e3, history: 30 * 60e3, analyze: 30 * 60e3, data: 60e3 }; // prettier-ignore

/** Chama um handler (req, res) da Vercel na memória e devolve o JSON (null se status ≠ 200). */
export function callHandler(fn, path) {
  return new Promise((resolve) => {
    let status = 200;
    const res = {
      setHeader() {},
      status(c) {
        status = c;
        return res;
      },
      json(b) {
        resolve(status === 200 ? b : null);
        return res;
      },
      send(b) {
        resolve(status === 200 ? b : null);
        return res;
      },
      end() {
        resolve(null);
        return res;
      },
    };
    Promise.resolve()
      .then(() => fn({ method: "GET", url: `/${path}`, headers: {}, query: {} }, res))
      .catch(() => resolve(null));
  });
}

/** Rota de `api/...` (null se não for uma das que o cálculo usa). */
export function routeOf(path) {
  const m = /^api\/(\w+)/.exec(path);
  if (!m || !HANDLERS[m[1]]) return null;
  return m[1] === "intraday" && /[?&]leaders=1/.test(path) ? "leaders" : m[1];
}

/** Cria o `get` com cache por caminho. getStatic(caminho) → JSON de data/... (ou null). */
export function localGet({ getStatic, now = () => Date.now(), cache = new Map() }) {
  return (path) => {
    const route = routeOf(path);
    const ttl = route ? TTL[route] : TTL.data;
    const hit = cache.get(path);
    if (hit && now() - hit.at < ttl) return hit.p;
    const p = (
      route
        ? callHandler(HANDLERS[route === "leaders" ? "intraday" : route], path)
        : path.startsWith("data/")
          ? Promise.resolve(getStatic(path))
          : Promise.resolve(null)
    ).catch(() => null);
    cache.set(path, { at: now(), p });
    // resultado vazio não fica guardado: a próxima chamada tenta de novo
    p.then((v) => v == null && cache.get(path)?.p === p && cache.delete(path));
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return p;
  };
}
