// Busca JSON com uma nova tentativa quando a função da Vercel cai por tempo ou sobrecarga (502/503/504).

const RETRY = new Set([502, 503, 504]);

// Pedidos iguais ao mesmo tempo viram um só. Cargas de fundo ({ bg: true }) passam por uma fila de no máximo MAX_PAR
// pedidos, para uma lista grande não derrubar as funções nem atrasar o que o usuário abriu.
const MAX_PAR = 6;
const inflight = new Map();
let running = 0;
const queue = [];
const slot = () =>
  running < MAX_PAR ? (running++, Promise.resolve()) : new Promise((ok) => queue.push(ok));
const release = () => {
  const next = queue.shift();
  if (next) next();
  else running--;
};

export function fetchJSON(url, opts = {}) {
  const hit = inflight.get(url);
  if (hit) return hit;
  // só as cargas em massa de fundo (bg: universo, listas grandes) entram na fila; o que o usuário abriu passa direto
  const p =
    (opts.bg ? slot().then(() => fetchJSONRaw(url, opts)).finally(release) : fetchJSONRaw(url, opts)) // prettier-ignore
      .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/**
 * Blocos ESTÁVEIS para o cache da borda: a lista toda (ordenada) é cortada sempre do mesmo jeito, e só os blocos que
 * têm algum ativo faltando são pedidos. Assim a mesma URL se repete entre aparelhos e visitas e a Vercel responde do
 * cache, sem ir ao Yahoo.
 */
export function stableLots(all, need, size) {
  const want = new Set(need);
  const sorted = [...new Set(all)].sort();
  const out = [];
  for (let i = 0; i < sorted.length; i += size) {
    const lot = sorted.slice(i, i + size);
    if (lot.some((x) => want.has(x))) out.push(lot);
  }
  return out;
}

async function fetchJSONRaw(url, { retries = 1, wait = 1500 } = {}) {
  let r;
  for (let i = 0; ; i++) {
    try {
      r = await fetch(url, { cache: "no-cache" });
    } catch (e) {
      if (i >= retries) throw e; // rede caiu: tenta de novo uma vez
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    if (!RETRY.has(r.status) || i >= retries) break;
    await new Promise((ok) => setTimeout(ok, wait));
  }
  let body = null;
  try {
    body = await r.json();
  } catch {
    /* corpo não-JSON */
  }
  if (!r.ok)
    throw new Error(
      body?.error ?? (r.status === 504 ? "fonte demorou demais (504)" : `HTTP ${r.status}`),
    );
  return body;
}
