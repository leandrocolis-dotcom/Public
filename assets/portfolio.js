// Carteira: parser da tela de portfólio do Investing.com e valorização com cotações ao vivo.
// Funções puras. A carteira fica só no navegador do usuário (localStorage), nunca no servidor.

/**
 * Número no formato do Investing: "$1,234.56", "-$13.62", "8.33%", "(1.2)", "1.234,56".
 * `dec` ("," | ".") resolve o único caso ambíguo: um separador seguido de exatamente 3 dígitos
 * ("1.234" = mil e pouco em pt-BR, 1,234 em en-US). Sem `dec`, mantém a leitura antiga.
 */
export function parseNumber(raw, dec) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || s === "-" || s === "--") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$€£R%\s\u00a0]/g, "");
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // os dois aparecem: o último é o decimal
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const thousands =
      parts.length > 2
        ? /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((x) => /^\d{3}$/.test(x))
        : /^\d{1,3}$/.test(parts[0]) &&
          /^\d{3}$/.test(parts[1]) &&
          parts[0] !== "0" &&
          (dec ? dec !== sep : sep === ",");
    s = thousands ? parts.join("") : sep === "," ? s.replace(",", ".") : s;
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** Pistas do separador decimal num texto: tokens sem ambiguidade e idioma do cabeçalho. */
export function detectDecimal(text) {
  const t = String(text ?? "");
  let comma = 0;
  let dot = 0;
  for (const m of t.matchAll(/\d[\d.,]*\d/g)) {
    const x = m[0];
    const c = x.lastIndexOf(",");
    const d = x.lastIndexOf(".");
    if (c >= 0 && d >= 0) c > d ? comma++ : dot++;
    else if (c >= 0 || d >= 0) {
      const sep = c >= 0 ? "," : ".";
      const parts = x.split(sep);
      if (parts.length > 2)
        sep === "," ? dot++ : comma++; // separador repetido = milhar
      else if (parts[1].length !== 3) sep === "," ? comma++ : dot++;
    }
  }
  if (/s[ií]mbolo|quantidade|pre[cç]o\s*m[eé]dio|valor\s*de\s*mercado/i.test(t)) comma += 0.5;
  if (/\b(symbol|amount|avg\.?\s*price|market\s*value)\b/i.test(t)) dot += 0.5;
  return { dec: comma > dot ? "," : dot > comma ? "." : null, comma, dot };
}

const COLS = {
  symbol: /^(symbol|s[ií]mbolo|ticker|ativo|name|nome)$/i,
  qty: /^(amount|quantity|qty|quantidade|qtd\.?|position|posi[cç][aã]o|shares)$/i,
  avg: /^(avg\.?\s*price|average\s*price|pre[cç]o\s*m[eé]dio|cost\s*basis)$/i,
  price: /^(current\s*price|last|price|pre[cç]o\s*atual|pre[cç]o|[uú]ltimo)$/i,
  value: /^(market\s*value|valor\s*de\s*mercado|valor|value)$/i,
  dayPct: /^(daily\s*p\/l\s*%|l\/p\s*di[aá]rio\s*%|%\s*l\/p\s*di[aá]rio)$/i,
  netPct: /^(net\s*p\/l\s*%|l\/p\s*l[ií]quido\s*%|%\s*l\/p\s*l[ií]quido)$/i,
};
// ordem da tela do Investing: Symbol, Amount, Avg Price, Current Price, Market Value, Weight, Daily P/L%, Daily P/L, Net P/L%
const DEFAULT_ORDER = [
  "symbol",
  "qty",
  "avg",
  "price",
  "value",
  "weight",
  "dayPct",
  "dayPL",
  "netPct",
];

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/;

/**
 * Lê o texto colado da tela "Holdings" do Investing.com.
 * Aceita colunas separadas por tab (cópia da tabela) ou por 2+ espaços; cabeçalho opcional.
 * O separador decimal muda com o idioma do Investing (en-US "1,234.56" | pt-BR "1.234,56"): a colagem
 * inteira dá o padrão (detectDecimal) e cada linha ambígua é conferida por qtd × preço ≈ valor e,
 * se houver, pela cotação de referência (opts.refPrices = { SYM: preço }), que dá a ordem de grandeza.
 * @returns { holdings: [{sym, qty, avg, invPrice, invValue}], warnings, ignored, dec }
 */
export function parseInvestingPortfolio(text, opts = {}) {
  const refPrices = opts.refPrices ?? {};
  const globalDec = opts.dec ?? detectDecimal(text).dec ?? ".";
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, " "))
    .filter((l) => l.trim());
  // Na cópia do Investing o cabeçalho começa com tab e as linhas não: descarta células vazias iniciais.
  const split = (l) => {
    const cells = (l.includes("\t") ? l.split("\t") : l.trim().split(/\s{2,}/)).map((c) =>
      c.trim(),
    );
    while (cells.length && cells[0] === "") cells.shift();
    return cells;
  };
  let map = null;
  const holdings = [];
  const warnings = [];
  const ignored = [];
  const seen = new Set();
  for (const line of lines) {
    const cells = split(line);
    // Cabeçalho: define a posição de cada coluna (linhas com tab inicial geram célula vazia)
    if (cells.some((c) => COLS.symbol.test(c)) && cells.some((c) => COLS.qty.test(c))) {
      map = {};
      cells.forEach((c, i) => {
        for (const [k, re] of Object.entries(COLS)) if (map[k] == null && re.test(c)) map[k] = i;
      });
      continue;
    }
    const nonEmpty = cells.filter((c) => c !== "");
    const get = (k) => {
      if (map) return cells[map[k]];
      const i = DEFAULT_ORDER.indexOf(k);
      return i >= 0 ? nonEmpty[i] : undefined;
    };
    const sym = String(get("symbol") ?? "")
      .toUpperCase()
      .replace(/\s+/g, "");
    const read = (dec) => {
      const r = { dec };
      for (const k of ["qty", "avg", "price", "dayPct", "netPct", "value"])
        r[k] = parseNumber(get(k), dec);
      return r;
    };
    // pontua as duas leituras: valida, coerente (qtd × preço ≈ valor) e perto da cotação online
    const score = (r) => {
      if (!(r.qty > 0) || !(r.avg > 0)) return -Infinity;
      let sc = r.dec === globalDec ? 1 : 0;
      if (r.price > 0 && r.value > 0 && Math.abs(r.qty * r.price - r.value) / r.value <= 0.02)
        sc += 2;
      const ref = refPrices[sym];
      if (ref > 0) {
        const near = (x, f) => x > 0 && x / ref <= f && ref / x <= f;
        if (r.price > 0) sc += near(r.price, 1.5) ? 3 : -3;
        sc += near(r.avg, 5) ? 2 : -2;
      }
      return sc;
    };
    const a = read(globalDec);
    const b = read(globalDec === "," ? "." : ",");
    const best = score(b) > score(a) ? b : a;
    const { qty, avg, price: invPrice, dayPct, netPct, value: invValue } = best;
    if (!SYMBOL_RE.test(sym) || !(qty > 0) || !(avg > 0)) {
      if (!/^(total|totais|cash|caixa)/i.test(line.trim())) ignored.push(line.trim());
      continue;
    }
    if (best !== a)
      warnings.push(
        `${sym}: separador decimal "${best.dec}" usado nesta linha (confere com valor/cotação).`,
      );
    // Comprada hoje: no Investing o resultado do dia é igual ao total (ambos medidos desde a compra).
    const boughtToday = dayPct != null && netPct != null && Math.abs(dayPct - netPct) < 0.005;
    if (invPrice > 0 && invValue > 0 && Math.abs(qty * invPrice - invValue) / invValue > 0.02) {
      warnings.push(
        `${sym}: quantidade × preço (${(qty * invPrice).toFixed(2)}) difere do valor de mercado colado (${invValue.toFixed(2)}).`,
      );
    }
    if (seen.has(sym)) {
      // mesmo ativo em duas linhas (lotes): soma e recalcula o preço médio
      const h = holdings.find((x) => x.sym === sym);
      const total = h.qty + qty;
      h.avg = (h.avg * h.qty + avg * qty) / total;
      h.qty = total;
      warnings.push(`${sym} aparece mais de uma vez: posições somadas (preço médio ponderado).`);
      continue;
    }
    seen.add(sym);
    holdings.push({
      sym,
      qty,
      avg,
      invPrice: invPrice ?? null,
      invValue: invValue ?? null,
      ...(boughtToday ? { boughtToday } : {}),
    });
  }
  if (!holdings.length)
    warnings.push(
      "Nenhuma posição reconhecida. Copie a tabela inteira de Holdings do Investing, com o cabeçalho.",
    );
  return { holdings, warnings, ignored, dec: globalDec };
}

/**
 * Ajuste manual de uma posição (edita ou inclui). Devolve uma nova lista, ou { error } se inválido.
 * Ao renomear (sym ≠ from), a posição antiga sai; se o novo símbolo já existir, é substituído.
 */
export function upsertHolding(holdings, { from = null, sym, qty, avg, dec }) {
  const s = String(sym ?? "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const q = typeof qty === "number" ? qty : parseNumber(qty, dec);
  const a = typeof avg === "number" ? avg : parseNumber(avg, dec);
  if (!SYMBOL_RE.test(s)) return { error: "Símbolo inválido." };
  if (!(q > 0)) return { error: "Quantidade deve ser maior que zero." };
  if (!(a > 0)) return { error: "Preço médio deve ser maior que zero." };
  const old = holdings.find((h) => h.sym === (from ?? s));
  // preço colado do Investing só vale para o mesmo símbolo
  const base = old && old.sym === s ? old : {};
  const next = { ...base, sym: s, qty: q, avg: a, manual: true };
  const rest = holdings.filter((h) => h.sym !== s && h.sym !== from);
  const i = holdings.findIndex((h) => h.sym === (from ?? s));
  if (i < 0) return { holdings: [...rest, next] };
  const out = [...rest];
  out.splice(Math.min(i, out.length), 0, next);
  return { holdings: out };
}

/** Remove uma posição pelo símbolo. */
export function removeHolding(holdings, sym) {
  return holdings.filter((h) => h.sym !== sym);
}

/**
 * Sessão noturna (api/quotes?night=): entra como estendido "night", com horário da consulta, por cima do
 * pós da véspera. night = { at: ms, q: { SYM: { xp, regP } } }; fora da janela o app zera.
 */
export function withNight(quotes = {}, night = null) {
  if (!night?.q) return quotes;
  const out = { ...quotes };
  for (const [sym, n] of Object.entries(night.q)) {
    const q = out[sym];
    if (!q || !(n.xp > 0)) continue;
    const reg = q.regP > 0 ? q.regP : n.regP > 0 ? n.regP : q.p;
    out[sym] = { ...q, xk: "night", xp: n.xp, xt: Math.floor(night.at / 1000), xc: reg > 0 ? n.xp / reg - 1 : null }; // prettier-ignore
  }
  return out;
}

/**
 * Valoriza a carteira com as cotações ao vivo (fallback: preço colado do Investing). No pré/pós, o preço é o
 * negócio estendido do próprio ativo (xp), em qualquer modo On/Off.
 * quotes: { SYM: { p, pc, t, n } } (formato do /api/quotes).
 */
export function valuePortfolio(holdings, quotes = {}, { today = null } = {}) {
  const rows = holdings.map((h) => {
    const q = quotes[h.sym];
    const live = q?.p > 0;
    // pré/pós-mercado: o último negócio do próprio ativo fora do pregão (mais novo que o regular) É o preço
    // da carteira — vale também no modo On e acima do implícito pelo futuro do modo Off.
    const reg = live ? (q.regP > 0 ? q.regP : q.p) : null;
    const ext = live && q.xk && q.xp > 0 && q.xt > (q.regT ?? q.t ?? 0) ? q : null;
    const price = ext ? ext.xp : live ? q.p : (h.invPrice ?? h.avg);
    // No dia da compra, o "dia" é medido desde o preço médio (como no Investing); depois, desde o fechamento anterior.
    const prev = h.openedOn && h.openedOn === today ? h.avg : q?.pc > 0 ? q.pc : null;
    const value = h.qty * price;
    const cost = h.qty * h.avg;
    return {
      ...h,
      name: q?.n ?? null,
      price,
      live,
      quoteTime: ext ? ext.xt : (q?.t ?? null),
      value,
      cost,
      netPL: value - cost,
      netPLPct: cost > 0 ? value / cost - 1 : null,
      dayPL: prev ? h.qty * (price - prev) : null,
      dayPLPct: prev ? price / prev - 1 : null,
      leveraged: isLeveraged(h.sym, q?.n),
      // modo Off: de onde veio o preço (pre/post = do próprio ativo; fut / fut~ = estimado pelo futuro)
      ...(ext ? { src: ext.xk } : q?.offSrc ? { src: q.offSrc } : {}),
      // pré/pós-mercado: entra no valor; xc/extPL medem o movimento desde o último preço regular
      ...(ext
        ? {
            regP: reg,
            xk: ext.xk,
            xp: ext.xp,
            xt: ext.xt,
            xc: ext.xp / reg - 1,
            extPL: h.qty * (ext.xp - reg),
          }
        : {}),
    };
  });
  const total = rows.reduce((a, r) => a + r.value, 0);
  for (const r of rows) r.weight = total > 0 ? r.value / total : 0;
  const cost = rows.reduce((a, r) => a + r.cost, 0);
  const withDay = rows.filter((r) => r.dayPL != null);
  const dayPL = withDay.reduce((a, r) => a + r.dayPL, 0);
  const prevValue = withDay.reduce((a, r) => a + r.value - r.dayPL, 0);
  return {
    rows: rows.sort((a, b) => b.value - a.value),
    total,
    cost,
    netPL: total - cost,
    netPLPct: cost > 0 ? total / cost - 1 : null,
    dayPL: withDay.length ? dayPL : null,
    dayPLPct: prevValue > 0 ? dayPL / prevValue : null,
    leveragedWeight: rows.filter((r) => r.leveraged).reduce((a, r) => a + r.weight, 0),
    missingQuotes: rows.filter((r) => !r.live).map((r) => r.sym),
    extPL: rows.some((r) => r.extPL != null) ? rows.reduce((a, r) => a + (r.extPL ?? 0), 0) : null,
    extCount: rows.filter((r) => r.extPL != null).length,
    extKind: rows.find((r) => r.xk)?.xk ?? null,
    extTime: Math.max(0, ...rows.map((r) => r.xt ?? 0)) || null,
  };
}

// ETFs alavancados/inversos conhecidos da carteira e o padrão de nome no Yahoo ("3X", "2X", "Bull", "Bear", "Ultra").
const KNOWN_LEVERAGED = new Set([
  "LABD", "LABU", "NVDL", "NVDU", "FAS", "FAZ", "KORU", "BRZU", "AMDG", "TMV", "TMF", "UCYB", "CRWL",
  "SNDU", "TQQQ", "SQQQ", "SOXL", "SOXS", "SPXL", "SPXS", "UPRO", "SPXU", "TNA", "TZA", "YINN", "YANG",
  "TBF", "TBT", "UVXY", "SVXY", "NUGT", "DUST", "GUSH", "DRIP", "ERX", "ERY", "TECL", "TECS", "UDOW", "SDOW",
  "UVIX", "SVIX",
]); // prettier-ignore
export function isLeveraged(sym, name) {
  if (KNOWN_LEVERAGED.has(sym)) return true;
  return /\b([23]x|ultra|bull|bear|inverse|-1x|leveraged)\b/i.test(name ?? "");
}
