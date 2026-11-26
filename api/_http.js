// Cliente HTTP comum das funções da Vercel (arquivo com "_" não vira rota).
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * fetch com User-Agent e tempo limite (padrão 8 s). `read` recebe a resposta e roda DENTRO do tempo limite,
 * então o download do corpo também é interrompido; sem `read`, devolve a resposta (só os cabeçalhos são cobertos).
 * `init` aceita headers extras, redirect etc.
 */
export async function httpFetch(
  url,
  { timeout = 8000, ua = BROWSER_UA, headers = {}, deadline = null, ...init } = {},
  read = (r) => r,
) {
  // `deadline` (ms, horário absoluto): o pedido nunca passa dele. Assim a função responde com o que
  // já tem antes do teto da Vercel, em vez de ser cortada e devolver 504 vazio.
  if (deadline) {
    const left = deadline - Date.now() - 250;
    if (left < 500) throw new Error("sem tempo");
    timeout = Math.min(timeout, left);
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, {
      ...init,
      headers: { "User-Agent": ua, ...headers },
      signal: ctl.signal,
    });
    return await read(r);
  } finally {
    clearTimeout(timer);
  }
}

/** Prazo absoluto para uma função: `ms` a partir de agora. */
export const deadlineIn = (ms) => Date.now() + ms;
/** Tempo que ainda resta até o prazo (ms); Infinity sem prazo. */
export const timeLeft = (deadline) => (deadline ? deadline - Date.now() : Infinity);

// Memória da instância quente: o mesmo pedido ao Yahoo, feito por vários usuários (ou blocos) ao mesmo tempo ou em
// sequência, sai uma vez só. Pedidos em andamento são compartilhados; falhas não ficam guardadas.
const MEMO = new Map(); // chave -> { at, ttl, p }
const MEMO_MAX = 3000;

/** Executa fn() uma vez por chave a cada `ttl` ms (e junta chamadas simultâneas). */
export function memo(key, ttl, fn) {
  const hit = MEMO.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.p;
  const p = Promise.resolve()
    .then(fn)
    .catch((e) => {
      if (MEMO.get(key)?.p === p) MEMO.delete(key);
      throw e;
    });
  MEMO.set(key, { at: Date.now(), ttl, p });
  if (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value); // sai o mais antigo
  return p;
}

/** Esquece uma chave (ex.: resultado parcial que não deve ser reaproveitado). */
export const memoForget = (key) => MEMO.delete(key);

/** Só para testes. */
export const memoClear = () => MEMO.clear();
