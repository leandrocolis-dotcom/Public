// Geradores determinísticos de séries para os testes.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Passeio aleatório com drift diário e volatilidade diária (retornos simples). */
export function walk(n, { seed = 1, start = 100, drift = 0.0003, vol = 0.01 } = {}) {
  const r = rng(seed);
  const s = [start];
  for (let i = 1; i < n; i++) {
    const u = (r() + r() + r() - 1.5) * 2; // ~ N(0, 1) aproximado
    s.push(s[i - 1] * (1 + drift + vol * u));
  }
  return s;
}

/** n pregões (seg-sex) terminando em `end` (AAAA-MM-DD). */
export function tradingDates(n, end = "2026-10-05") {
  const out = [];
  const d = new Date(`${end}T00:00:00Z`);
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}
