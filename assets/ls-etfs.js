// Long & Short: cadastro dos ETFs alavancados (puro). L = alavancagem diária, type = +1 bull / −1 bear,
// under = subjacente negociado nos EUA usado para VWAP/ATR/beta (proxy líquido do índice do ETF),
// pid = id permanente (não muda se o emissor trocar o ticker). O usuário completa/corrige em
// pendulo.ls.assets ({ SYM: { L, type, under, pid? } }), que vence o catálogo.

const row = (L, type, under, pid) => Object.freeze({ L, type, under, pid });

export const ETF_CATALOG = Object.freeze({
  // Nasdaq 100
  TQQQ: row(3, 1, "QQQ", "px-tqqq"),
  SQQQ: row(3, -1, "QQQ", "px-sqqq"),
  QLD: row(2, 1, "QQQ", "px-qld"),
  QID: row(2, -1, "QQQ", "px-qid"),
  // S&P 500
  SPXL: row(3, 1, "SPY", "dx-spxl"),
  SPXS: row(3, -1, "SPY", "dx-spxs"),
  UPRO: row(3, 1, "SPY", "px-upro"),
  SPXU: row(3, -1, "SPY", "px-spxu"),
  SSO: row(2, 1, "SPY", "px-sso"),
  SDS: row(2, -1, "SPY", "px-sds"),
  // Russell 2000
  TNA: row(3, 1, "IWM", "dx-tna"),
  TZA: row(3, -1, "IWM", "dx-tza"),
  UWM: row(2, 1, "IWM", "px-uwm"),
  TWM: row(2, -1, "IWM", "px-twm"),
  // Semicondutores
  SOXL: row(3, 1, "SOXX", "dx-soxl"),
  SOXS: row(3, -1, "SOXX", "dx-soxs"),
  USD: row(2, 1, "SOXX", "px-usd"),
  SSG: row(2, -1, "SOXX", "px-ssg"),
  // Tecnologia, financeiro, biotecnologia, energia
  TECL: row(3, 1, "XLK", "dx-tecl"),
  TECS: row(3, -1, "XLK", "dx-tecs"),
  FAS: row(3, 1, "XLF", "dx-fas"),
  FAZ: row(3, -1, "XLF", "dx-faz"),
  LABU: row(3, 1, "XBI", "dx-labu"),
  LABD: row(3, -1, "XBI", "dx-labd"),
  ERX: row(2, 1, "XLE", "dx-erx"),
  ERY: row(2, -1, "XLE", "dx-ery"),
  // China, ouro (mineradoras), Treasuries longos
  YINN: row(3, 1, "FXI", "dx-yinn"),
  YANG: row(3, -1, "FXI", "dx-yang"),
  NUGT: row(2, 1, "GDX", "dx-nugt"),
  DUST: row(2, -1, "GDX", "dx-dust"),
  TMF: row(3, 1, "TLT", "dx-tmf"),
  TMV: row(3, -1, "TLT", "dx-tmv"),
});

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** Valida um cadastro { L, type, under, pid? }. Devolve lista de erros (vazia = ok). */
export function checkAsset(a) {
  const e = [];
  if (!a || typeof a !== "object") return ["cadastro ausente"];
  if (!(a.L === 1 || a.L === 2 || a.L === 3)) e.push("alavancagem deve ser 1, 2 ou 3");
  if (!(a.type === 1 || a.type === -1)) e.push("tipo deve ser bull (+1) ou bear (−1)");
  if (!TICKER.test(String(a.under ?? ""))) e.push("subjacente inválido");
  return e;
}

/**
 * Cadastro do ativo: o do usuário vence o catálogo. Ativo sem cadastro válido devolve { ok: false, errors }:
 * o motor não gera quantidade para ele (EXE-01), em vez de supor alavancagem 1.
 */
export function assetInfo(sym, user = {}) {
  const s = String(sym ?? "").toUpperCase();
  const u = user?.[s];
  const a = u ? { ...ETF_CATALOG[s], ...u } : ETF_CATALOG[s];
  if (!a)
    return { ok: false, sym: s, errors: ["ativo sem cadastro (alavancagem, tipo, subjacente)"] };
  const errors = checkAsset(a);
  if (errors.length) return { ok: false, sym: s, errors };
  return {
    ok: true,
    sym: s,
    L: a.L,
    type: a.type,
    under: a.under,
    pid: a.pid ?? `u-${s.toLowerCase()}`,
  };
}

/** Pontas no mesmo subjacente e tipos opostos (alerta estrutural: exposição ~0 e decaimento em dobro). */
export const sameUnderlying = (a, b) =>
  !!a?.ok && !!b?.ok && a.under === b.under && a.type === -b.type;
