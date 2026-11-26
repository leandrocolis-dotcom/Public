// Watchlists (Mercados › Watchlist): parser da colagem, listas em abas e rotação/velocidade de cada ativo contra o
// benchmark. Puro (sem DOM): o desenho e a carga ficam em watch-view.js.

/**
 * Tickers do Investing.com que não são o código do Yahoo (índices). Ações e ETFs dos EUA são iguais.
 * Ação brasileira sem sufixo (PETR4, VALE3, BOVA11) ganha ".SA".
 */
const ALIAS = {
  VIX: "^VIX",
  SPX: "^GSPC",
  US500: "^GSPC",
  NDX: "^NDX",
  US100: "^NDX",
  IXIC: "^IXIC",
  DJI: "^DJI",
  US30: "^DJI",
  RUT: "^RUT",
  US2000: "^RUT",
  BVSP: "^BVSP",
  IBOV: "^BVSP",
};
const SYM_RE = /^\^?[A-Z0-9][A-Z0-9.\-=^]{0,14}$/;
const B3_RE = /^[A-Z]{4}\d{1,2}$/;
export const WATCH_MAX = Infinity; // sem limite de ativos por watchlist (pedido do usuário, 05/11/2026); só as listas têm limite

/** Código colado → código do Yahoo (VIX → ^VIX, PETR4 → PETR4.SA, BRK.B → BRK-B). Inválido: null. */
export function normSym(raw) {
  let s = String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^\$/, "");
  if (!s) return null;
  if (ALIAS[s]) return ALIAS[s];
  if (B3_RE.test(s)) return `${s}.SA`;
  if (/^[A-Z]{1,5}\.[A-Z]$/.test(s)) s = s.replace(".", "-"); // classe de ação: BRK.B → BRK-B
  return SYM_RE.test(s) ? s : null;
}

const HEAD = {
  sym: /^(symbol|s[ií]mbolo|ticker|c[oó]digo|ativo)$/i,
  name: /^(name|nome|descri[cç][aã]o)$/i,
  note: /^(nota|note|obs\.?|observa[cç][aã]o|coment[aá]rio)$/i,
};
const WORDY =
  /^(name|nome|symbol|s[ií]mbolo|last|[uú]ltimo|high|low|m[aá]x|m[ií]n|chg|var|vol|time|hora|total)\b/i;

/**
 * Lê o que foi colado e devolve os ativos da watchlist.
 * Aceita: (1) a tabela da watchlist do Investing.com copiada (Name, Symbol, Last, High, Low, Chg., Chg. %, Vol.,
 * Time), com ou sem cabeçalho; (2) qualquer tabela com uma coluna Symbol/Ticker/Código (e Nome/Nota opcionais);
 * (3) só os códigos, separados por vírgula, espaço, ponto e vírgula ou linha.
 * @returns { items: [{ sym, name?, note? }], ignored: [linhas], aliased: [[colado, yahoo]] }
 */
export function parseWatchlist(text) {
  const lines = String(text ?? "")
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const split = (l) => {
    const cells = (l.includes("\t") ? l.split("\t") : l.trim().split(/\s{2,}/)).map((c) => c.trim()); // prettier-ignore
    while (cells.length && cells[0] === "") cells.shift();
    return cells;
  };
  const items = [];
  const ignored = [];
  const aliased = [];
  const seen = new Set();
  const add = (raw, name, note) => {
    const sym = normSym(raw);
    if (!sym) return false;
    if (sym !== String(raw).toUpperCase().trim()) aliased.push([String(raw).trim(), sym]);
    if (seen.has(sym)) return true;
    seen.add(sym);
    items.push({ sym, ...(name ? { name } : {}), ...(note ? { note } : {}) });
    return true;
  };
  let map = null;
  for (const line of lines) {
    const cells = split(line);
    if (cells.some((c) => HEAD.sym.test(c))) {
      map = {};
      cells.forEach((c, i) => {
        for (const [k, re] of Object.entries(HEAD)) if (map[k] == null && re.test(c)) map[k] = i;
      });
      continue;
    }
    if (map) {
      const raw = cells[map.sym];
      if (
        !add(
          raw,
          map.name != null ? cells[map.name] : null,
          map.note != null ? cells[map.note] : null,
        )
      )
        // prettier-ignore
        ignored.push(line.trim());
      continue;
    }
    // sem cabeçalho, linha de tabela (2+ colunas): Investing = Nome, Código, Último…; senão, o 1º código válido
    if (cells.length >= 3 && /[a-z]/.test(cells[0]) && normSym(cells[1])) {
      add(cells[1], cells[0]);
      continue;
    }
    if (
      cells.length >= 2 &&
      cells.length <= 3 &&
      normSym(cells[0]) &&
      !/^[\d.,+\-%]+$/.test(cells[1])
    ) {
      add(cells[0], null, cells.slice(1).join(" "));
      continue;
    }
    // lista solta: "AAPL, MSFT NVDA; VOO"
    const toks = line.split(/[,;\s]+/).filter(Boolean);
    let any = false;
    for (const t of toks) if (!WORDY.test(t) && !/^[\d.,+\-%]+$/.test(t) && add(t)) any = true;
    if (!any && !WORDY.test(line.trim())) ignored.push(line.trim());
  }
  return { items: items.slice(0, WATCH_MAX), ignored, aliased, cut: Math.max(0, items.length - WATCH_MAX) }; // prettier-ignore
}

// ───────────── listas em abas ─────────────
// MESMAS listas da aba Sinais de hoje (assets/desk.js): prefs.watchlists = [{ id, name, syms, meta? }], salvas na
// nuvem (pendulo_watchlists; o treino diário do Simulador lê os `syms`). `meta` guarda nome e nota colados.

export const MAX_LISTS = 8; // igual a desk.js

const uid = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const blank = () => ({ id: uid(), name: "Minha watchlist", syms: [] });

/** Listas salvas (prefs.watchlists); sem nenhuma, uma vazia (ainda não gravada). */
export function watchLists(prefs) {
  const ls = Array.isArray(prefs?.watchlists)
    ? prefs.watchlists.filter((l) => l?.id && Array.isArray(l.syms))
    : [];
  return ls.length ? ls : [{ id: "w1", name: "Minha watchlist", syms: [] }];
}
export const activeList = (prefs) => {
  const ls = watchLists(prefs);
  return ls.find((l) => l.id === prefs?.watchActive) ?? ls[0];
};
/** Ativos da lista na ordem, com nome e nota colados: [{ sym, name?, note? }]. */
export const itemsOf = (list) => (list?.syms ?? []).map((sym) => ({ sym, ...(list.meta?.[sym] ?? {}) })); // prettier-ignore
/** Nova lista no fim; null se já houver MAX_LISTS. */
export function newList(lists, name) {
  if (lists.length >= MAX_LISTS) return null;
  const base = String(name ?? "").trim() || `Lista ${lists.length + 1}`;
  return [...lists, { id: uid(), name: base.slice(0, 30), syms: [] }];
}
export const renameList = (lists, id, name) =>
  lists.map((l) => (l.id === id && String(name).trim() ? { ...l, name: String(name).trim().slice(0, 30) } : l)); // prettier-ignore
export function deleteList(lists, id) {
  const out = lists.filter((l) => l.id !== id);
  return out.length ? out : [blank()];
}
/** Junta os ativos colados à lista (sem repetir; nome/nota novos substituem os antigos). replace = troca tudo. */
export function mergeItems(list, items, { replace = false } = {}) {
  const syms = replace ? [] : [...(list.syms ?? [])];
  const meta = replace ? {} : { ...(list.meta ?? {}) };
  for (const it of items) {
    if (!syms.includes(it.sym)) syms.push(it.sym);
    const m = { ...(meta[it.sym] ?? {}) };
    if (it.name) m.name = it.name;
    if (it.note) m.note = it.note;
    if (Object.keys(m).length) meta[it.sym] = m;
  }
  const keep = syms.slice(0, WATCH_MAX);
  const out = { ...list, syms: keep };
  const mm = Object.fromEntries(Object.entries(meta).filter(([k]) => keep.includes(k)));
  if (Object.keys(mm).length) out.meta = mm;
  else delete out.meta;
  return out;
}
export function removeItem(list, sym) {
  const out = { ...list, syms: (list.syms ?? []).filter((x) => x !== sym) };
  if (list.meta?.[sym]) {
    out.meta = { ...list.meta };
    delete out.meta[sym];
  }
  return out;
}

// ───────────── rotação e velocidade de cada ativo contra o benchmark ─────────────

/** Benchmark do ativo: Brasil (.SA e índices da B3) contra o Ibovespa; o resto contra o S&P 500 (SPY). */
export const benchOf = (sym) => (/\.SA$|^\^BVSP$/.test(sym) ? "^BVSP" : "SPY");

const smaAt = (xs, i, w) => {
  if (i - w + 1 < 0) return null;
  let s = 0;
  for (let k = i - w + 1; k <= i; k++) {
    if (!Number.isFinite(xs[k])) return null;
    s += xs[k];
  }
  return s / w;
};

/**
 * Rotação diária de um ativo contra o benchmark, com as mesmas contas da aba Fluxo (flow-engine.rotation):
 * força = 100 × MM10(RS)/MM50(RS); momento = 100 × força(t)/força(t−10); 1 ponto a cada `step` pregões.
 * Séries alinhadas pela data (só os dias que os dois têm).
 * @returns tail [{ x, y, date }] (vazia se o histórico for curto)
 */
export function dailyTail(a, b, { points = 8, step = 5 } = {}) {
  if (!a?.dates?.length || !b?.dates?.length) return [];
  const bm = new Map(b.dates.map((d, i) => [d, b.close[i]]));
  const dates = [];
  const rs = [];
  a.dates.forEach((d, i) => {
    const bv = bm.get(d);
    const av = a.close[i];
    if (bv > 0 && av > 0) {
      dates.push(d);
      rs.push((100 * av) / bv);
    }
  });
  const n = rs.length;
  const ratio = rs.map((_, i) => {
    const f = smaAt(rs, i, 10);
    const s = smaAt(rs, i, 50);
    return f && s ? (100 * f) / s : null;
  });
  const tail = [];
  for (let k = points - 1; k >= 0; k--) {
    const i = n - 1 - k * step;
    if (i - 10 < 0 || ratio[i] == null || ratio[i - 10] == null) continue;
    tail.push({ x: ratio[i], y: (100 * ratio[i]) / ratio[i - 10], date: dates[i] });
  }
  return tail;
}

/** Janelas da coluna de velocidade: intraday pela api/intraday; diário pelas séries da api/analyze. */
export const WATCH_WINDOWS = {
  today: { label: "Hoje", intra: true },
  "5d": { label: "5 dias", intra: true },
  "8w": { label: "8 sem", points: 8, step: 5 },
  "3m": { label: "3 meses", points: 13, step: 5 },
};
export const WATCH_DEFAULT_WIN = "today";

// ───────────── sessão do mercado dos EUA agora (coluna única Pré / Pregão / Pós) ─────────────

const NY_CLOCK = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export const SESS_LABEL = { pre: "Pré", reg: "Pregão", post: "Pós" };

/**
 * Sessão que está acontecendo agora em Nova York: pré 4h–9h30, pregão 9h30–16h (13h nos encurtados), pós até 20h
 * (17h nos encurtados).
 * Fora disso (madrugada, fim de semana, feriado) mostra a última que terminou: o pós (live = false).
 * @param sec horário Unix (segundos); info(date) = { open, closeMin } (calendário da NYSE)
 * @returns { id: "pre"|"reg"|"post", live: boolean }
 */
export function currentSession(sec, info = () => ({ open: true, closeMin: 960 })) {
  const p = Object.fromEntries(NY_CLOCK.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value])); // prettier-ignore
  const date = `${p.year}-${p.month}-${p.day}`;
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  const day = wd === 0 || wd === 6 ? { open: false } : info(date);
  if (!day?.open) return { id: "post", live: false };
  const min = Number(p.hour) * 60 + Number(p.minute);
  const close = day.closeMin ?? 960;
  if (min < 240) return { id: "post", live: false };
  if (min < 570) return { id: "pre", live: true };
  if (min < close) return { id: "reg", live: true };
  if (min < (day.postEnd ?? 1200)) return { id: "post", live: true };
  return { id: "post", live: false };
}

// ───────────── filtros por coluna (quadrante, velocidade, momento) ─────────────

export const WATCH_QUADS = ["Liderando", "Ganhando força", "Perdendo força", "Atrasado"];
export const WATCH_LEVELS = [
  { id: "vfast", label: "muito rápido" },
  { id: "fast", label: "rápido" },
  { id: "normal", label: "normal" },
  { id: "slow", label: "lento" },
];
export const WATCH_MOMENTUM = [
  { id: "up", label: "Acelerando ↑" },
  { id: "dn", label: "Freando ↓" },
];

/** Filtro guardado nas prefs -> { q: [], lv: [], mo: [] } (só valores conhecidos). */
export function normFilter(f) {
  const pick = (xs, ok) => (Array.isArray(xs) ? [...new Set(xs.filter((x) => ok.includes(x)))] : []); // prettier-ignore
  return {
    q: pick(f?.q, WATCH_QUADS),
    lv: pick(
      f?.lv,
      WATCH_LEVELS.map((x) => x.id),
    ),
    mo: pick(
      f?.mo,
      WATCH_MOMENTUM.map((x) => x.id),
    ),
  };
}

/** Liga/desliga um valor do filtro ("q:Liderando", "lv:fast", "mo:up"). */
export function toggleFilter(f, key) {
  const n = normFilter(f);
  const i = key.indexOf(":");
  const k = key.slice(0, i);
  const v = key.slice(i + 1);
  if (!(k in n)) return n;
  n[k] = n[k].includes(v) ? n[k].filter((x) => x !== v) : [...n[k], v];
  return normFilter(n);
}

export const filterActive = (f) => {
  const n = normFilter(f);
  return n.q.length + n.lv.length + n.mo.length > 0;
};

/**
 * O ativo passa no filtro? Dentro de cada coluna vale qualquer um dos marcados (OU); entre colunas, todos (E).
 * row = { quadrant, level (id), vy (momento) }. Ativo ainda sem o dado da coluna filtrada não passa.
 */
export function passFilter(row, f) {
  const n = normFilter(f);
  if (n.q.length && !n.q.includes(row?.quadrant)) return false;
  if (n.lv.length && !n.lv.includes(row?.level)) return false;
  if (n.mo.length) {
    const vy = row?.vy;
    if (!Number.isFinite(vy)) return false;
    const m = vy > 0 ? "up" : vy < 0 ? "dn" : null;
    if (!n.mo.includes(m)) return false;
  }
  return true;
}
