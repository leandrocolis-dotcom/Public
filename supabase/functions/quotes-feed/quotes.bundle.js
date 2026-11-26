// GERADO por scripts/build-quotes-feed.mjs a partir de api/quotes.js. Não edite: rode `npm run build:feed`.
// <define:process.env>
var define_process_env_default = {};

// slim:universe.js
var ASSETS = { "SPY": { "yahoo": "SPY" }, "QQQ": { "yahoo": "QQQ" }, "IWM": { "yahoo": "IWM" }, "EFA": { "yahoo": "EFA" }, "VGK": { "yahoo": "VGK" }, "EWJ": { "yahoo": "EWJ" }, "EEM": { "yahoo": "EEM" }, "FXI": { "yahoo": "FXI" }, "INDA": { "yahoo": "INDA" }, "EWZ": { "yahoo": "EWZ" }, "EWW": { "yahoo": "EWW" }, "XLK": { "yahoo": "XLK" }, "SMH": { "yahoo": "SMH" }, "XLC": { "yahoo": "XLC" }, "XLY": { "yahoo": "XLY" }, "XLF": { "yahoo": "XLF" }, "KRE": { "yahoo": "KRE" }, "XLI": { "yahoo": "XLI" }, "XLB": { "yahoo": "XLB" }, "XLE": { "yahoo": "XLE" }, "XLP": { "yahoo": "XLP" }, "XLV": { "yahoo": "XLV" }, "XLU": { "yahoo": "XLU" }, "VNQ": { "yahoo": "VNQ" }, "TLT": { "yahoo": "TLT" }, "TBF": { "yahoo": "TBF" }, "HYG": { "yahoo": "HYG" }, "EMB": { "yahoo": "EMB" }, "EMLC": { "yahoo": "EMLC" }, "BWX": { "yahoo": "BWX" }, "GLD": { "yahoo": "GLD" }, "SLV": { "yahoo": "SLV" }, "GDX": { "yahoo": "GDX" }, "COPX": { "yahoo": "COPX" }, "DBC": { "yahoo": "DBC" }, "USO": { "yahoo": "USO" }, "VNQI": { "yahoo": "VNQI" }, "UUP": { "yahoo": "UUP" }, "FXY": { "yahoo": "FXY" }, "VIXY": { "yahoo": "VIXY" }, "VIX": { "yahoo": "^VIX" }, "DXY": { "yahoo": "DX-Y.NYB" }, "US10Y": { "yahoo": "^TNX" }, "US3M": { "yahoo": "^IRX" }, "WTI": { "yahoo": "CL=F" }, "USDJPY": { "yahoo": "JPY=X" }, "USDBRL": { "yahoo": "BRL=X" } };

// slim:flow-universe.js
var FLOW_ASSETS = [{ "sym": "SPY" }, { "sym": "QQQ" }, { "sym": "DIA" }, { "sym": "IWM" }, { "sym": "MDY" }, { "sym": "RSP" }, { "sym": "MTUM" }, { "sym": "QUAL" }, { "sym": "USMV" }, { "sym": "VLUE" }, { "sym": "IWF" }, { "sym": "IWD" }, { "sym": "ARKK" }, { "sym": "VTI" }, { "sym": "VTV" }, { "sym": "VUG" }, { "sym": "XLK" }, { "sym": "XLC" }, { "sym": "XLY" }, { "sym": "XLP" }, { "sym": "XLE" }, { "sym": "XLF" }, { "sym": "XLV" }, { "sym": "XLI" }, { "sym": "XLB" }, { "sym": "XLRE" }, { "sym": "XLU" }, { "sym": "SOXX" }, { "sym": "IGV" }, { "sym": "KRE" }, { "sym": "KBE" }, { "sym": "XBI" }, { "sym": "IHI" }, { "sym": "ITB" }, { "sym": "XRT" }, { "sym": "XOP" }, { "sym": "OIH" }, { "sym": "ITA" }, { "sym": "JETS" }, { "sym": "IYT" }, { "sym": "PAVE" }, { "sym": "TAN" }, { "sym": "ICLN" }, { "sym": "LIT" }, { "sym": "URA" }, { "sym": "GDX" }, { "sym": "COPX" }, { "sym": "GDXJ" }, { "sym": "REMX" }, { "sym": "MOO" }, { "sym": "IXN" }, { "sym": "IXG" }, { "sym": "IXJ" }, { "sym": "IXC" }, { "sym": "MXI" }, { "sym": "EXI" }, { "sym": "RXI" }, { "sym": "KXI" }, { "sym": "JXI" }, { "sym": "IXP" }, { "sym": "REET" }, { "sym": "ACWI" }, { "sym": "EFA" }, { "sym": "VGK" }, { "sym": "EZU" }, { "sym": "AAXJ" }, { "sym": "EEM" }, { "sym": "EMXC" }, { "sym": "ILF" }, { "sym": "AFK" }, { "sym": "VT" }, { "sym": "ACWX" }, { "sym": "VWO" }, { "sym": "IEMG" }, { "sym": "^GSPC" }, { "sym": "^NDX" }, { "sym": "^DJI" }, { "sym": "^RUT" }, { "sym": "^STOXX50E" }, { "sym": "^STOXX" }, { "sym": "^GDAXI" }, { "sym": "^FTSE" }, { "sym": "^FCHI" }, { "sym": "^IBEX" }, { "sym": "FTSEMIB.MI" }, { "sym": "^N225" }, { "sym": "^HSI" }, { "sym": "000001.SS" }, { "sym": "399001.SZ" }, { "sym": "^KS11" }, { "sym": "^TWII" }, { "sym": "^NSEI" }, { "sym": "^BSESN" }, { "sym": "^AXJO" }, { "sym": "^BVSP" }, { "sym": "^MXX" }, { "sym": "^MERV" }, { "sym": "^GSPTSE" }, { "sym": "EWJ" }, { "sym": "DXJ" }, { "sym": "EWU" }, { "sym": "EWG" }, { "sym": "EWQ" }, { "sym": "EWI" }, { "sym": "EWP" }, { "sym": "EWL" }, { "sym": "EWN" }, { "sym": "EWD" }, { "sym": "NORW" }, { "sym": "EDEN" }, { "sym": "EWO" }, { "sym": "EWK" }, { "sym": "EIRL" }, { "sym": "EWC" }, { "sym": "EWA" }, { "sym": "ENZL" }, { "sym": "EWH" }, { "sym": "EWS" }, { "sym": "EIS" }, { "sym": "EWZ" }, { "sym": "EWW" }, { "sym": "ECH" }, { "sym": "EPU" }, { "sym": "ARGT" }, { "sym": "MCHI" }, { "sym": "FXI" }, { "sym": "KWEB" }, { "sym": "INDA" }, { "sym": "EPI" }, { "sym": "ASHR" }, { "sym": "EWY" }, { "sym": "EWT" }, { "sym": "EIDO" }, { "sym": "THD" }, { "sym": "EWM" }, { "sym": "EPHE" }, { "sym": "VNM" }, { "sym": "EZA" }, { "sym": "TUR" }, { "sym": "KSA" }, { "sym": "QAT" }, { "sym": "UAE" }, { "sym": "EPOL" }, { "sym": "GREK" }, { "sym": "DX-Y.NYB" }, { "sym": "EURUSD=X" }, { "sym": "JPY=X" }, { "sym": "GBPUSD=X" }, { "sym": "CHF=X" }, { "sym": "AUDUSD=X" }, { "sym": "CAD=X" }, { "sym": "NZDUSD=X" }, { "sym": "NOK=X" }, { "sym": "SEK=X" }, { "sym": "CNY=X" }, { "sym": "INR=X" }, { "sym": "KRW=X" }, { "sym": "BRL=X" }, { "sym": "MXN=X" }, { "sym": "CLP=X" }, { "sym": "COP=X" }, { "sym": "ZAR=X" }, { "sym": "TRY=X" }, { "sym": "AUDJPY=X" }, { "sym": "CNH=F" }, { "sym": "6E=F" }, { "sym": "6J=F" }, { "sym": "6B=F" }, { "sym": "6A=F" }, { "sym": "6C=F" }, { "sym": "6S=F" }, { "sym": "6N=F" }, { "sym": "6M=F" }, { "sym": "6L=F" }, { "sym": "UUP" }, { "sym": "FXE" }, { "sym": "FXY" }, { "sym": "FXF" }, { "sym": "CEW" }, { "sym": "^IRX" }, { "sym": "^FVX" }, { "sym": "^TNX" }, { "sym": "^TYX" }, { "sym": "AGG" }, { "sym": "BND" }, { "sym": "BIL" }, { "sym": "IEI" }, { "sym": "EDV" }, { "sym": "SCHP" }, { "sym": "VCIT" }, { "sym": "JNK" }, { "sym": "USHY" }, { "sym": "FLOT" }, { "sym": "VWOB" }, { "sym": "SHY" }, { "sym": "IEF" }, { "sym": "TLT" }, { "sym": "TIP" }, { "sym": "LQD" }, { "sym": "HYG" }, { "sym": "BKLN" }, { "sym": "MUB" }, { "sym": "BWX" }, { "sym": "IGOV" }, { "sym": "BNDX" }, { "sym": "EMB" }, { "sym": "EMLC" }, { "sym": "CBON" }, { "sym": "ES=F" }, { "sym": "NQ=F" }, { "sym": "YM=F" }, { "sym": "RTY=F" }, { "sym": "NKD=F" }, { "sym": "ZT=F" }, { "sym": "ZF=F" }, { "sym": "ZN=F" }, { "sym": "ZB=F" }, { "sym": "TN=F" }, { "sym": "UB=F" }, { "sym": "SMH" }, { "sym": "NVDA" }, { "sym": "AVGO" }, { "sym": "TSM" }, { "sym": "ASML" }, { "sym": "MU" }, { "sym": "ANET" }, { "sym": "DELL" }, { "sym": "VRT" }, { "sym": "DTCR" }, { "sym": "GRID" }, { "sym": "NLR" }, { "sym": "SKYY" }, { "sym": "CRWV" }, { "sym": "CHAT" }, { "sym": "PLTR" }, { "sym": "WCLD" }, { "sym": "CIBR" }, { "sym": "BOTZ" }, { "sym": "CL=F" }, { "sym": "BZ=F" }, { "sym": "NG=F" }, { "sym": "RB=F" }, { "sym": "HO=F" }, { "sym": "GC=F" }, { "sym": "SI=F" }, { "sym": "HG=F" }, { "sym": "PL=F" }, { "sym": "PA=F" }, { "sym": "ZC=F" }, { "sym": "ZW=F" }, { "sym": "ZS=F" }, { "sym": "KC=F" }, { "sym": "CC=F" }, { "sym": "CT=F" }, { "sym": "LE=F" }, { "sym": "HE=F" }, { "sym": "ZL=F" }, { "sym": "ZM=F" }, { "sym": "SB=F" }, { "sym": "DBC" }, { "sym": "GSG" }, { "sym": "PDBC" }, { "sym": "USO" }, { "sym": "BNO" }, { "sym": "UNG" }, { "sym": "UGA" }, { "sym": "GLD" }, { "sym": "IAU" }, { "sym": "SLV" }, { "sym": "PPLT" }, { "sym": "PALL" }, { "sym": "CPER" }, { "sym": "DBA" }, { "sym": "BTC-USD" }, { "sym": "ETH-USD" }, { "sym": "IBIT" }, { "sym": "FBTC" }, { "sym": "ETHA" }, { "sym": "BTC=F" }, { "sym": "ETH=F" }, { "sym": "SOL-USD" }, { "sym": "BNB-USD" }, { "sym": "XRP-USD" }, { "sym": "^VIX" }, { "sym": "VIXY" }, { "sym": "^VIX3M" }, { "sym": "^VVIX" }, { "sym": "^MOVE" }, { "sym": "^SKEW" }, { "sym": "^VXN" }, { "sym": "^OVX" }, { "sym": "^GVZ" }];

// slim:br-universe.js
var BR_SYMBOLS = ["^BVSP", "BOVA11.SA", "SMAL11.SA", "DIVO11.SA", "IVVB11.SA", "EWZ", "EWZS", "PBR", "VALE", "ITUB", "NU", "LFTS11.SA", "IRFM11.SA", "IMAB11.SA", "B5P211.SA", "BRL=X", "EURBRL=X", "DX-Y.NYB", "MXN=X", "CLP=X", "ZAR=X", "BZ=F", "ZS=F", "ZC=F", "KC=F", "SB=F", "LE=F", "GC=F", "EEM", "ITUB4.SA", "BBDC4.SA", "BBAS3.SA", "SANB11.SA", "BPAC11.SA", "B3SA3.SA", "ITSA4.SA", "PETR4.SA", "PETR3.SA", "PRIO3.SA", "VBBR3.SA", "UGPA3.SA", "VALE3.SA", "GGBR4.SA", "CSNA3.SA", "USIM5.SA", "CMIN3.SA", "SUZB3.SA", "KLBN11.SA", "SLCE3.SA", "SMTO3.SA", "EQTL3.SA", "CMIG4.SA", "CPFE3.SA", "EGIE3.SA", "TAEE11.SA", "SBSP3.SA", "ABEV3.SA", "ASAI3.SA", "BEEF3.SA", "MGLU3.SA", "LREN3.SA", "AZZA3.SA", "CEAB3.SA", "VIVA3.SA", "RENT3.SA", "CYRE3.SA", "MRVE3.SA", "EZTC3.SA", "DIRR3.SA", "MULT3.SA", "RDOR3.SA", "HAPV3.SA", "FLRY3.SA", "RADL3.SA", "HYPE3.SA", "WEGE3.SA", "RAIL3.SA", "MOTV3.SA", "POMO4.SA", "VIVT3.SA", "TIMS3.SA", "TOTS3.SA", "PBR-A", "BBD", "BSBR", "ABEV", "SUZ", "GGB", "SID", "SBS", "CIG", "UGP", "VIV", "TIMB"];

// api/_http.js
var BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
async function httpFetch(url, { timeout = 8e3, ua = BROWSER_UA, headers = {}, deadline = null, ...init } = {}, read = (r) => r) {
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
      signal: ctl.signal
    });
    return await read(r);
  } finally {
    clearTimeout(timer);
  }
}
var timeLeft = (deadline) => deadline ? deadline - Date.now() : Infinity;

// api/verify.js
var TIMEOUT_MS = 7e3;
function money(s) {
  const n = Number(String(s ?? "").replace(/[$,+\s]/g, ""));
  return String(s ?? "").trim() && Number.isFinite(n) ? n : null;
}
function parseNasdaq(data) {
  if (!data?.primaryData) return null;
  const open = /market open/i.test(data.marketStatus ?? "");
  const closed = /closed at/i.test(data.secondaryData?.lastTradeTimestamp ?? "");
  const src = !open && closed ? data.secondaryData : data.primaryData;
  const price = money(src.lastSalePrice);
  const chg = money(src.netChange);
  if (!(price > 0)) return null;
  return {
    price,
    prevClose: chg != null ? Math.round((price - chg) * 1e4) / 1e4 : null,
    status: data.marketStatus ?? null,
    open
  };
}
async function nasdaq(sym, deadline = null) {
  for (const cls of ["etf", "stocks"]) {
    const q = await httpFetch(
      `https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/info?assetclass=${cls}`,
      { timeout: TIMEOUT_MS, deadline, headers: { Accept: "application/json" } },
      async (r) => r.ok ? parseNasdaq((await r.json())?.data) : null
    );
    if (q) return q;
  }
  return null;
}

// assets/futures.js
var MONTH_CODES = "FGHJKMNQUVXZ";
var DAY = 864e5;
var utc = (y, m, d) => new Date(Date.UTC(y, m, d));
var isBiz = (t) => t.getUTCDay() % 6 !== 0;
var addDays = (t, k) => new Date(t.getTime() + k * DAY);
function addBiz(t, k) {
  let x = t;
  const step = k < 0 ? -1 : 1;
  for (let left = Math.abs(k); left > 0; ) {
    x = addDays(x, step);
    if (isBiz(x)) left--;
  }
  return x;
}
function nthWeekday(y, m, wd, n) {
  const first = utc(y, m, 1);
  return utc(y, m, 1 + (wd - first.getUTCDay() + 7) % 7 + (n - 1) * 7);
}
function lastWeekday(y, m, wd) {
  const last = utc(y, m + 1, 0);
  return addDays(last, -((last.getUTCDay() - wd + 7) % 7));
}
function lastBiz(y, m) {
  let t = utc(y, m + 1, 0);
  while (!isBiz(t)) t = addDays(t, -1);
  return t;
}
function firstBiz(y, m) {
  let t = utc(y, m, 1);
  while (!isBiz(t)) t = addDays(t, 1);
  return t;
}
var prev = (y, m, k = 1) => [y + Math.floor((m - k) / 12), ((m - k) % 12 + 12) % 12];
var RULES = {
  // índices: vencem na 3ª sexta; o mercado rola na semana anterior
  idx: (y, m) => addDays(nthWeekday(y, m, 5, 3), -8),
  // Nikkei (CME): dia útil antes da 2ª sexta
  nkd: (y, m) => addDays(nthWeekday(y, m, 5, 2), -8),
  // moedas da CME: 2 dias úteis antes da 3ª quarta
  fx: (y, m) => addDays(addBiz(nthWeekday(y, m, 3, 3), -2), -7),
  // real (6L): último dia útil do mês anterior
  brl: (y, m) => addDays(lastBiz(...prev(y, m)), -5),
  // Treasuries: primeiro aviso no último dia útil do mês anterior
  ust: (y, m) => addBiz(lastBiz(...prev(y, m)), -2),
  // WTI: 3 dias úteis antes do dia 25 do mês anterior
  cl: (y, m) => addDays(addBiz(utc(...prev(y, m), 25), -3), -3),
  // Brent (NYMEX BZ): último dia útil do 2º mês anterior
  bz: (y, m) => addDays(lastBiz(...prev(y, m, 2)), -3),
  // gás natural: 3 dias úteis antes do 1º dia do mês
  ng: (y, m) => addDays(addBiz(utc(y, m, 1), -3), -3),
  // gasolina, diesel, açúcar: último dia útil do mês anterior
  eom: (y, m) => addDays(lastBiz(...prev(y, m)), -5),
  // metais e grãos: primeiro aviso no último dia útil do mês anterior
  fnd: (y, m) => addDays(lastBiz(...prev(y, m)), -5),
  // café, cacau, algodão (ICE): primeiro aviso dias úteis antes do 1º dia útil do mês
  kc: (y, m) => addBiz(firstBiz(y, m), -10),
  cc: (y, m) => addBiz(firstBiz(y, m), -13),
  ct: (y, m) => addBiz(firstBiz(y, m), -8),
  // boi gordo: último dia útil do mês do contrato
  le: (y, m) => addDays(lastBiz(y, m), -8),
  // suínos: 10º dia útil do mês do contrato
  he: (y, m) => addBiz(addBiz(addDays(utc(y, m, 1), -1), 10), -3),
  // cripto (CME): última sexta do mês
  crypto: (y, m) => addDays(lastWeekday(y, m, 5), -4)
};
var Q = "HMUZ";
var ALL = MONTH_CODES;
var FUT_SPECS = {
  ES: ["CME", Q, "idx"],
  NQ: ["CME", Q, "idx"],
  YM: ["CBT", Q, "idx"],
  RTY: ["CME", Q, "idx"],
  NKD: ["CME", Q, "nkd"],
  ZT: ["CBT", Q, "ust"],
  ZF: ["CBT", Q, "ust"],
  ZN: ["CBT", Q, "ust"],
  ZB: ["CBT", Q, "ust"],
  TN: ["CBT", Q, "ust"],
  UB: ["CBT", Q, "ust"],
  "6E": ["CME", Q, "fx"],
  "6J": ["CME", Q, "fx"],
  "6B": ["CME", Q, "fx"],
  "6A": ["CME", Q, "fx"],
  "6C": ["CME", Q, "fx"],
  "6S": ["CME", Q, "fx"],
  "6N": ["CME", Q, "fx"],
  "6M": ["CME", Q, "fx"],
  CNH: ["CME", Q, "fx"],
  "6L": ["CME", ALL, "brl"],
  CL: ["NYM", ALL, "cl"],
  BZ: ["NYM", ALL, "bz"],
  NG: ["NYM", ALL, "ng"],
  RB: ["NYM", ALL, "eom"],
  HO: ["NYM", ALL, "eom"],
  GC: ["CMX", "GJMQVZ", "fnd"],
  SI: ["CMX", "HKNUZ", "fnd"],
  HG: ["CMX", "HKNUZ", "fnd"],
  PL: ["NYM", "FJNV", "fnd"],
  PA: ["NYM", Q, "fnd"],
  ZC: ["CBT", "HKNUZ", "fnd"],
  ZW: ["CBT", "HKNUZ", "fnd"],
  ZS: ["CBT", "FHKNQUX", "fnd"],
  ZL: ["CBT", "FHKNQUVZ", "fnd"],
  ZM: ["CBT", "FHKNQUVZ", "fnd"],
  KC: ["NYB", "HKNUZ", "kc"],
  CC: ["NYB", "HKNUZ", "cc"],
  CT: ["NYB", "HKNVZ", "ct"],
  SB: ["NYB", "HKNV", "eom"],
  LE: ["CME", "GJMQVZ", "le"],
  HE: ["CME", "GJKMNQVZ", "he"],
  BTC: ["CME", ALL, "crypto"],
  ETH: ["CME", ALL, "crypto"]
};
function rootOf(sym) {
  const m = /^([A-Z0-9]+)=F$/.exec(String(sym ?? ""));
  return m && FUT_SPECS[m[1]] ? m[1] : null;
}
var toDate = (d) => d instanceof Date ? d : new Date(typeof d === "number" ? d : `${d}T00:00:00Z`);
var iso = (t) => t.toISOString().slice(0, 10);
function* contracts(root, y0) {
  const [ex, months, rule] = FUT_SPECS[root];
  const ms = [...months].map((c) => MONTH_CODES.indexOf(c));
  for (let y = y0; y < y0 + 30; y++)
    for (const m of ms) {
      const code = `${root}${MONTH_CODES[m]}${String(y % 100).padStart(2, "0")}`;
      yield { root, code, sym: `${code}.${ex}`, y, m, rollAt: iso(RULES[rule](y, m)) };
    }
}
function activeContract(rootOrSym, date = /* @__PURE__ */ new Date()) {
  const root = FUT_SPECS[rootOrSym] ? rootOrSym : rootOf(rootOrSym);
  if (!root) return null;
  const day = iso(toDate(date));
  const it = contracts(root, Number(day.slice(0, 4)) - 1);
  for (let c = it.next(); !c.done; c = it.next())
    if (c.value.rollAt > day) {
      const nx = it.next().value;
      return { ...c.value, next: { code: nx.code, sym: nx.sym, rollAt: nx.rollAt } };
    }
  return null;
}

// api/quotes.js
var SYMBOLS = [
  .../* @__PURE__ */ new Set([
    ...Object.values(ASSETS).map((a) => a.yahoo),
    ...FLOW_ASSETS.map((a) => a.sym),
    ...BR_SYMBOLS
    // Mercado › Local: a B3 também vai no canal de tempo real (quotes-feed, 15 s)
  ])
];
var CHUNK = 60;
var SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/;
var session = null;
var get = (url, headers = {}, deadline = null) => httpFetch(url, { headers, redirect: "manual", deadline });
async function getSession(force = false, deadline = null) {
  if (!force && session && Date.now() - session.at < 30 * 60 * 1e3) return session;
  const r1 = await get("https://fc.yahoo.com", {}, deadline);
  const cookie = (r1.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const r2 = await get(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    { Cookie: cookie },
    deadline
  );
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.length > 40) throw new Error(`crumb HTTP ${r2.status}`);
  session = { cookie, crumb, at: Date.now() };
  return session;
}
async function quoteChunk(symbols, s, deadline = null) {
  const url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" + encodeURIComponent(symbols.join(",")) + "&crumb=" + encodeURIComponent(s.crumb);
  const r = await get(url, { Cookie: s.cookie }, deadline);
  if (r.status === 401 || r.status === 403)
    throw Object.assign(new Error("crumb inv\xE1lido"), { auth: true });
  if (!r.ok) throw new Error(`quote HTTP ${r.status}`);
  const j = await r.json();
  return j?.quoteResponse?.result ?? [];
}
async function sparkChunk(symbols, deadline = null) {
  const url = "https://query1.finance.yahoo.com/v7/finance/spark?range=1d&interval=1d&symbols=" + encodeURIComponent(symbols.join(","));
  const r = await get(url, {}, deadline);
  if (!r.ok) throw new Error(`spark HTTP ${r.status}`);
  const j = await r.json();
  return (j?.spark?.result ?? []).map((x) => ({ symbol: x.symbol, meta: x.response?.[0]?.meta })).filter((x) => x.meta?.regularMarketPrice);
}
var chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
function extendedHours(q) {
  const cands = [
    ["pre", q.preMarketPrice, q.preMarketTime],
    ["post", q.postMarketPrice, q.postMarketTime]
  ].filter(([, p2, t2]) => p2 > 0 && t2 > (q.regularMarketTime ?? 0));
  if (!cands.length) return {};
  const [k, p, t] = cands.sort((a, b) => b[2] - a[2])[0];
  return {
    xk: k,
    xp: p,
    xt: t,
    xc: q.regularMarketPrice > 0 ? p / q.regularMarketPrice - 1 : null
  };
}
function futContracts(symbols, now = /* @__PURE__ */ new Date()) {
  const out = {};
  for (const s of symbols) {
    const c = rootOf(s) && activeContract(s, now);
    if (c) out[s] = c.sym;
  }
  return out;
}
function applyFutContracts(quotes, map, keep = /* @__PURE__ */ new Set()) {
  for (const [cont, sym] of Object.entries(map)) {
    const k = quotes[sym];
    if (!keep.has(sym)) delete quotes[sym];
    if (!k) continue;
    const c = quotes[cont];
    quotes[cont] = { ...k, fut: sym.split(".")[0], ...c && "n" in c ? { n: c.n } : {} };
  }
  return quotes;
}
async function fetchAll(symbols = SYMBOLS, extra = [], { deadline = null } = {}) {
  const extraSet = new Set(extra);
  symbols = [...symbols, ...extra];
  const fut = futContracts(symbols);
  const asked = symbols;
  symbols = [.../* @__PURE__ */ new Set([...symbols, ...Object.values(fut)])];
  const quotes = {};
  const wanted = new Set(symbols);
  const errors = [];
  const calls = { quote: 0, spark: 0, nasdaq: 0 };
  let s = null;
  try {
    s = await getSession(false, deadline);
  } catch (e) {
    errors.push(`sess\xE3o Yahoo: ${e.message}`);
  }
  if (s) {
    const run = async (sess) => {
      const cs = chunks(symbols, CHUNK);
      calls.quote += cs.length;
      return Promise.allSettled(cs.map((c) => quoteChunk(c, sess, deadline)));
    };
    let results = await run(s);
    if (results.some((r) => r.status === "rejected" && r.reason?.auth) && timeLeft(deadline) > 6e3) {
      try {
        results = await run(await getSession(true, deadline));
      } catch (e) {
        errors.push(`sess\xE3o Yahoo (renova\xE7\xE3o): ${e.message}`);
      }
    }
    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(`cota\xE7\xE3o: ${r.reason?.message ?? r.reason}`);
        continue;
      }
      for (const q of r.value) {
        if (!wanted.has(q.symbol)) continue;
        if (typeof q.regularMarketPrice !== "number" || !q.regularMarketTime) continue;
        quotes[q.symbol] = {
          p: q.regularMarketPrice,
          t: q.regularMarketTime,
          ms: q.marketState ?? null,
          v: q.regularMarketVolume ?? null,
          dh: q.regularMarketDayHigh ?? null,
          dl: q.regularMarketDayLow ?? null,
          h52: q.fiftyTwoWeekHigh ?? null,
          l52: q.fiftyTwoWeekLow ?? null,
          av3: q.averageDailyVolume3Month ?? null,
          mc: q.marketCap ?? null,
          av: q.averageDailyVolume10Day ?? null,
          pc: q.regularMarketPreviousClose ?? null,
          ...extendedHours(q),
          ...extraSet.has(q.symbol) ? { n: q.shortName ?? q.longName ?? null } : {}
        };
      }
    }
  }
  const missing1 = symbols.filter((x) => !quotes[x]);
  if (missing1.length && timeLeft(deadline) > 1500) {
    const cs = chunks(missing1, 20);
    calls.spark += cs.length;
    const results = await Promise.allSettled(cs.map((c) => sparkChunk(c, deadline)));
    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(`reserva (spark): ${r.reason?.message ?? r.reason}`);
        continue;
      }
      for (const { symbol, meta } of r.value) {
        if (!wanted.has(symbol)) continue;
        quotes[symbol] = {
          p: meta.regularMarketPrice,
          t: meta.regularMarketTime,
          ms: null,
          v: null,
          av: null,
          pc: meta.chartPreviousClose ?? null
        };
      }
    }
  }
  const missing2 = symbols.filter((x) => !quotes[x] && /^[A-Z]{1,5}$/.test(x)).slice(0, 15);
  if (missing2.length && timeLeft(deadline) > 3e3) {
    calls.nasdaq += missing2.length;
    const got = await Promise.all(missing2.map((x) => nasdaq(x, deadline).catch(() => null)));
    got.forEach((n, i) => {
      if (n?.price > 0)
        quotes[missing2[i]] = {
          p: n.price,
          t: Math.floor(Date.now() / 1e3),
          ms: n.open ? "REGULAR" : null,
          v: null,
          av: null,
          pc: n.prevClose,
          src: "nasdaq"
        };
    });
  }
  applyFutContracts(quotes, fut, new Set(asked));
  symbols = asked;
  const viaNasdaq = Object.values(quotes).filter((q) => q.src === "nasdaq").length;
  return {
    fetched_at: (/* @__PURE__ */ new Date()).toISOString(),
    version: (define_process_env_default.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
    source: viaNasdaq ? `Yahoo Finance + Nasdaq (${viaNasdaq})` : "Yahoo Finance",
    market_state: quotes.SPY?.ms ?? null,
    count: Object.keys(quotes).length,
    total: symbols.length,
    quotes,
    missing: symbols.filter((x) => !quotes[x]),
    errors,
    calls
  };
}

// assets/sessions.js
var ET = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});
var SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});
var PRE = 240;
var OPEN = 570;
var CLOSE = 960;
var POST_END = 1200;
var FUT_OPEN = 1080;
var FUT_CLOSE = 1020;
var HOLIDAYS = {
  "2026-01-01": "Ano Novo",
  "2026-01-19": "Martin Luther King",
  "2026-02-16": "Dia dos Presidentes",
  "2026-04-03": "Sexta-feira Santa",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Independ\xEAncia (observado)",
  "2026-09-07": "Dia do Trabalho",
  "2026-11-26": "A\xE7\xE3o de Gra\xE7as",
  "2026-12-25": "Natal",
  "2027-01-01": "Ano Novo",
  "2027-01-18": "Martin Luther King",
  "2027-02-15": "Dia dos Presidentes",
  "2027-03-26": "Sexta-feira Santa",
  "2027-05-31": "Memorial Day",
  "2027-06-18": "Juneteenth (observado)",
  "2027-07-05": "Independ\xEAncia (observado)",
  "2027-09-06": "Dia do Trabalho",
  "2027-11-25": "A\xE7\xE3o de Gra\xE7as",
  "2027-12-24": "Natal (observado)"
};
var EARLY_CLOSE = /* @__PURE__ */ new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);
var EARLY_POST_END = 17 * 60;
var FUT_CLOSED = /* @__PURE__ */ new Set(["2026-04-03", "2026-12-25", "2027-01-01", "2027-03-26", "2027-12-24"]);
var FUT_HALT = 13 * 60;
var FUT_EARLY = 13 * 60 + 15;
function nyClock(ms) {
  const p = Object.fromEntries(ET.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    wd: p.weekday,
    min: Number(p.hour) * 60 + Number(p.minute)
  };
}
function sessionInfo(date) {
  const wd = (/* @__PURE__ */ new Date(`${date}T12:00:00Z`)).getUTCDay();
  if (wd === 0 || wd === 6)
    return { open: false, closeMin: CLOSE, postEnd: POST_END, reason: "fim de semana" };
  if (HOLIDAYS[date])
    return { open: false, closeMin: CLOSE, postEnd: POST_END, reason: `feriado nos EUA (${HOLIDAYS[date]})` };
  const early = EARLY_CLOSE.has(date);
  return {
    open: true,
    closeMin: early ? 13 * 60 : CLOSE,
    postEnd: early ? EARLY_POST_END : POST_END,
    early,
    reason: early ? "preg\xE3o encurtado (fecha \xE0s 13:00 e o p\xF3s \xE0s 17:00 em Nova York)" : null
  };
}
function usSession(ms = Date.now()) {
  const { date, min } = nyClock(ms);
  const info = sessionInfo(date);
  if (!info.open) return "closed";
  if (min >= OPEN && min < info.closeMin) return "open";
  if (min >= PRE && min < OPEN) return "pre";
  if (min >= info.closeMin && min < info.postEnd) return "post";
  return "closed";
}
var nextDay = (date) => new Date(Date.parse(`${date}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
function futuresOpen(ms) {
  const { date, wd, min } = nyClock(ms);
  if (wd === "Sat") return false;
  const tomorrowShut = FUT_CLOSED.has(nextDay(date));
  if (FUT_CLOSED.has(date)) return false;
  if (wd === "Sun") return min >= FUT_OPEN && !tomorrowShut;
  const evening = min >= FUT_OPEN && wd !== "Fri" && !tomorrowShut;
  if (HOLIDAYS[date]) return min < FUT_HALT || evening;
  if (EARLY_CLOSE.has(date)) return min < FUT_EARLY || evening;
  if (wd === "Fri") return min < FUT_CLOSE;
  return min < FUT_CLOSE || evening;
}
function fxOpen(ms) {
  const { wd, min } = nyClock(ms);
  if (wd === "Sat") return false;
  if (wd === "Sun") return min >= FUT_CLOSE;
  if (wd === "Fri") return min < FUT_CLOSE;
  return true;
}
function b3Open(ms) {
  const p = Object.fromEntries(SP.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const min = Number(p.hour) * 60 + Number(p.minute);
  return min >= 585 && min < 1110;
}
function feedSession(ms = Date.now()) {
  const s = usSession(ms);
  if (s !== "closed") return s;
  return futuresOpen(ms) ? "night" : null;
}
function symClass(sym) {
  const s = String(sym ?? "");
  if (/\.SA$/.test(s) || s === "^BVSP") return "b3";
  if (/=F$|\.(NYM|CME|CBT|CMX|NYB)$/.test(s)) return "fut";
  if (/=X$/.test(s)) return "fx";
  if (/-USD$/.test(s)) return "crypto";
  if (/\.(MI|SS|SZ|L|PA|DE|T|HK|TO)$/.test(s)) return "world";
  if (/^\^(STOXX|GDAXI|FTSE|FCHI|IBEX|N225|HSI|KS11|TWII|NSEI|BSESN|AXJO|MXX|MERV|GSPTSE)/.test(s))
    return "world";
  return "us";
}
function symOpen(sym, ms = Date.now()) {
  switch (symClass(sym)) {
    case "b3":
      return b3Open(ms);
    case "fut":
      return futuresOpen(ms);
    case "fx":
    case "world":
      return fxOpen(ms);
    case "crypto":
      return true;
    default:
      return usSession(ms) !== "closed";
  }
}

// assets/feed-tiers.js
var CHUNK2 = 60;
var WARM_EVERY = 6e4;
var REFS = ["SPY", "QQQ", "^VIX", "^TNX", "DX-Y.NYB", "BRL=X", "ES=F", "NQ=F", "BTC-USD"];
var slots = (sym) => /=F$/.test(sym) ? 2 : 1;
var yahooCalls = (syms) => Math.ceil(syms.reduce((n, s) => n + slots(s), 0) / CHUNK2);
function hotList(demand, now, { refs = REFS, limit = CHUNK2 } = {}) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  let used = 0;
  for (const s of [...refs, ...(demand ?? []).flat()]) {
    if (typeof s !== "string" || !s || seen.has(s)) continue;
    seen.add(s);
    if (!symOpen(s, now)) continue;
    const c = slots(s);
    if (used + c > limit) continue;
    out.push(s);
    used += c;
  }
  return out;
}
function pickTier({ now, universe, extra = [], hot = [], lastWarmAt = 0, session: session2 = null }) {
  const uni = new Set(universe);
  const split = (list, tier) => {
    const all = [...new Set(list)];
    return {
      tier: all.length ? tier : null,
      syms: all.filter((s) => uni.has(s)),
      extra: all.filter((s) => !uni.has(s))
    };
  };
  if (!lastWarmAt) return split([...universe, ...extra, ...hot], "full");
  if (now - lastWarmAt >= WARM_EVERY - 5e3) {
    const r = split(
      [...universe, ...extra, ...hot].filter((s) => symOpen(s, now)),
      "warm"
    );
    if (r.tier) return r;
  }
  if (session2 === "night") return split([], "hot");
  return split(
    hot.filter((s) => symOpen(s, now)),
    "hot"
  );
}

// assets/feed-delta.js
var FULL_EVERY = 5 * 6e4;
var PULSE_EVERY = 6e4;
var SNAP_EVERY = 6e4;
var HEAVY = ["h52", "l52", "av3", "mc", "av", "n"];
function slimQuote(q) {
  const out = {};
  for (const [k, v] of Object.entries(q ?? {})) if (!HEAVY.includes(k)) out[k] = v;
  return out;
}
function same(a, b) {
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}
function diffQuotes(prev2, cur) {
  const out = {};
  for (const [s, q] of Object.entries(cur ?? {})) if (!same(prev2?.[s], q)) out[s] = q;
  return out;
}
var newMem = () => ({ last: {}, seq: 0, fullAt: 0, sentAt: 0 });
function planPacket(mem, data, now, { pulseSym = "SPY" } = {}) {
  const cur = {};
  for (const [s, q] of Object.entries(data?.quotes ?? {})) cur[s] = slimQuote(q);
  const merged = { ...mem.last, ...cur };
  const full = !mem.seq || now - mem.fullAt >= FULL_EVERY;
  let quotes = full ? merged : diffQuotes(mem.last, cur);
  let pulse = false;
  if (!Object.keys(quotes).length) {
    const ps = merged[pulseSym] ? pulseSym : Object.keys(merged)[0];
    if (now - mem.sentAt < PULSE_EVERY || !ps)
      return { packet: null, mem: { ...mem, last: merged } };
    quotes = { [ps]: merged[ps] };
    pulse = true;
  }
  const seq = mem.seq + 1;
  const total = Object.keys(merged).length;
  const packet = {
    fetched_at: data.fetched_at,
    version: data.version,
    source: data.source,
    market_state: merged.SPY?.ms ?? data.market_state ?? null,
    count: Object.keys(quotes).length,
    total,
    quotes,
    missing: (data.missing ?? []).filter((s) => !merged[s]),
    errors: data.errors ?? [],
    feed: { ...data.feed ?? {}, seq, kind: full ? "full" : "delta", ...pulse ? { pulse } : {} }
  };
  return {
    packet,
    mem: { last: merged, seq, fullAt: full ? now : mem.fullAt, sentAt: now }
  };
}
var ZERO_STATS = Object.freeze({
  runs: 0,
  yahoo_calls: 0,
  packets: 0,
  bytes_sent: 0,
  symbols_sent: 0
});
function addStats(stats, delta, date, keep = 14) {
  const out = { ...stats && typeof stats === "object" ? stats : {} };
  const cur = { ...ZERO_STATS, ...out[date] ?? {} };
  for (const [k, v] of Object.entries(delta ?? {}))
    if (Number.isFinite(v)) cur[k] = (cur[k] ?? 0) + v;
  out[date] = cur;
  for (const d of Object.keys(out).sort().slice(0, -keep)) delete out[d];
  return out;
}
export {
  SNAP_EVERY,
  SYMBOLS,
  SYMBOL_RE,
  ZERO_STATS,
  addStats,
  feedSession,
  fetchAll,
  hotList,
  newMem,
  nyClock,
  pickTier,
  planPacket,
  yahooCalls
};
