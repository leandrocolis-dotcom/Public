// Auditoria dos dados e dos cálculos (funções puras). Cada verificação refaz a conta por um caminho
// independente do motor (engine.js / portfolio.js) e compara. Resultado: [{ group, label, level, detail }],
// level: "ok" | "warn" | "bad". Não substitui conferir com a corretora: pega erro de dado e de conta, não de premissa.
import { ASSETS } from "./universe.js";
import { decSep, num } from "./format.js";
import { isLeveraged } from "./portfolio.js";

const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const fmtPct = (x) => `${(x * 100).toFixed(2).replace(".", decSep())}%`;
const item = (group, label, level, detail = "") => ({ group, label, level, detail });

/** Data (AAAA-MM-DD) de Nova York de um instante em segundos. */
const NY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
function nyDay(sec) {
  return NY_DAY.format(new Date(sec * 1000)); // formatador único: criar um por chamada custava ~100 ms por pacote
}

/** Dias úteis (seg-sex) entre duas datas AAAA-MM-DD, excluindo a inicial. Feriados contam como úteis. */
export function businessDaysBetween(a, b) {
  let n = 0;
  const d = new Date(`${a}T12:00:00Z`);
  const end = new Date(`${b}T12:00:00Z`);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

// ───────────── 1. Base histórica (data/prices.json) ─────────────

/** Movimentos extremos já conferidos como reais (não são erro de dado). Formato "CÓDIGO@AAAA-MM-DD". */
const VERIFIED_MOVES = new Set([
  "SLV@2026-01-30", // crash da prata: −28,5% (Yahoo 105,57 → 75,44), conferido em out/2026
]);

export function checkBase(base, { today } = {}) {
  const G = "Base histórica";
  const out = [];
  if (!base?.dates?.length)
    return [item(G, "Arquivo de preços", "bad", "data/prices.json ausente ou vazio.")];
  const { dates, series } = base;
  const unordered = dates.findIndex((d, i) => i > 0 && d <= dates[i - 1]);
  out.push(
    unordered < 0
      ? item(
          G,
          "Datas em ordem e sem repetição",
          "ok",
          `${dates.length} pregões, ${dates[0]} a ${dates.at(-1)}.`,
        )
      : item(
          G,
          "Datas em ordem e sem repetição",
          "bad",
          `Quebra em ${dates[unordered - 1]} → ${dates[unordered]}.`,
        ),
  );
  const bad = [];
  for (const [code, s] of Object.entries(series)) {
    if (s.length !== dates.length)
      bad.push(`${code}: ${s.length} valores para ${dates.length} datas`);
    else if (s.some((v) => typeof v !== "number" || !Number.isFinite(v)))
      bad.push(`${code}: valor inválido`);
    else if (ASSETS[code]?.unit === "US$" && s.some((v) => v <= 0)) bad.push(`${code}: preço ≤ 0`);
  }
  out.push(
    bad.length
      ? item(G, "Séries completas e numéricas", "bad", bad.slice(0, 4).join("; "))
      : item(
          G,
          "Séries completas e numéricas",
          "ok",
          `${Object.keys(series).length} séries sem lacunas.`,
        ),
  );
  // Saltos de um dia muito acima do normal do próprio ativo: típico de erro de dado (split não ajustado, preço trocado).
  const jumps = [];
  for (const [code, s] of Object.entries(series)) {
    if (ASSETS[code]?.unit !== "US$") continue;
    const r = s.slice(1).map((v, i) => Math.log(v / s[i]));
    const sd = Math.sqrt(r.reduce((a, x) => a + x * x, 0) / r.length);
    const i = r.findIndex(
      (x, k) =>
        Math.abs(x) > Math.max(0.25, 10 * sd) && !VERIFIED_MOVES.has(`${code}@${dates[k + 1]}`),
    );
    if (i >= 0) jumps.push(`${code} em ${dates[i + 1]} (${fmtPct(Math.exp(r[i]) - 1)})`);
  }
  out.push(
    jumps.length
      ? item(G, "Sem saltos anormais de preço", "warn", `Confira: ${jumps.slice(0, 4).join("; ")}.`)
      : item(
          G,
          "Sem saltos anormais de preço",
          "ok",
          "Nenhum movimento diário acima de 10 desvios-padrão.",
        ),
  );
  if (today) {
    const lag = businessDaysBetween(dates.at(-1), today);
    out.push(
      item(
        G,
        "Base atualizada",
        lag <= 1 ? "ok" : lag <= 3 ? "warn" : "bad",
        `Último pregão da base: ${dates.at(-1)} (${lag} dia(s) útil(eis) até hoje).`,
      ),
    );
  }
  const stale = Object.entries(base.last_real ?? {}).filter(([, d]) => d && d < dates.at(-1));
  out.push(
    stale.length
      ? item(G, "Ativos repetindo o último preço", stale.length > 5 ? "warn" : "ok",
          `${stale.length} ativo(s) sem negócio no último pregão (preço repetido): ${stale.slice(0, 6).map(([c]) => c).join(", ")}.`) // prettier-ignore
      : item(G, "Ativos repetindo o último preço", "ok", "Todos negociaram no último pregão."),
  );
  return out;
}

// ───────────── 2. Cotações ao vivo ─────────────

export function checkLive(live, base, { nowSec = Date.now() / 1000 } = {}) {
  const G = "Cotações ao vivo";
  if (!live?.quotes)
    return [
      item(
        G,
        "Cotações recebidas",
        "bad",
        "A função /api/quotes não respondeu: o site usa a base publicada.",
      ),
    ];
  const out = [];
  const q = live.quotes;
  const cov = live.count / (live.total || 1);
  out.push(item(G, "Cobertura", cov >= 0.97 ? "ok" : cov >= 0.85 ? "warn" : "bad",
    `${live.count}/${live.total} cotações${live.missing?.length ? `; faltando: ${live.missing.slice(0, 6).join(", ")}` : ""}.`)); // prettier-ignore

  const invalid = Object.entries(q).filter(([, x]) => !(x.p > 0) || !(x.t > 0));
  const future = Object.entries(q).filter(([, x]) => x.t > nowSec + 300);
  out.push(
    invalid.length || future.length
      ? item(
          G,
          "Preços e horários válidos",
          "bad",
          [...invalid, ...future]
            .slice(0, 5)
            .map(([s]) => s)
            .join(", "),
        )
      : item(G, "Preços e horários válidos", "ok", "Todos positivos e com horário no passado."),
  );

  // Variação do dia fora do comum para ativos sem alavancagem: costuma ser erro de cotação.
  const extreme = Object.entries(q)
    .filter(([s, x]) => x.pc > 0 && /^[A-Z]{1,5}$/.test(s) && !isLeveraged(s, x.n))
    .map(([s, x]) => [s, x.p / x.pc - 1])
    .filter(([, r]) => Math.abs(r) > 0.15);
  out.push(
    extreme.length
      ? item(
          G,
          "Variações do dia plausíveis",
          "warn",
          `Acima de 15% sem alavancagem: ${extreme.map(([s, r]) => `${s} ${fmtPct(r)}`).join(", ")}.`,
        )
      : item(
          G,
          "Variações do dia plausíveis",
          "ok",
          "Nenhum ETF/ação sem alavancagem com variação acima de 15%.",
        ),
  );

  // Continuidade: o fechamento anterior informado pela cotação deve ser o último fechamento da base.
  if (base?.dates?.length) {
    const lastDate = base.dates.at(-1);
    const n = base.dates.length;
    const diverge = [];
    let compared = 0;
    for (const [code, a] of Object.entries(ASSETS)) {
      const x = q[a.yahoo];
      const s = base.series[code];
      if (!x?.pc || !s || !/^[A-Z]{1,5}$/.test(a.yahoo)) continue;
      const day = nyDay(x.t);
      const ref = day > lastDate ? s[n - 1] : day === lastDate ? s[n - 2] : null;
      if (ref == null) continue;
      compared++;
      const d = Math.abs(x.pc / ref - 1);
      if (d > 0.0075) diverge.push(`${code} ${fmtPct(d)}`);
    }
    out.push(
      item(G, "Cotação ao vivo emenda com a base",
        diverge.length > 3 ? "bad" : diverge.length ? "warn" : "ok",
        diverge.length
          ? `Fechamento anterior difere da base em: ${diverge.slice(0, 6).join(", ")} (dividendo na data ex ou dado errado).`
          : `${compared} ETFs: o fechamento anterior do Yahoo bate com a base publicada.`), // prettier-ignore
    );
  }
  return out;
}

/**
 * Mapa de fluxo: o fechamento anterior de cada ação/ETF ao vivo deve emendar com o flow.json.
 * Desdobramentos/grupamentos já corrigidos pelo app aparecem como informação.
 */
export function checkFlowLive(flow, live, splits = []) {
  const G = "Cotações ao vivo";
  if (!flow?.dates?.length || !live?.quotes) return [];
  const out = [];
  const lastDate = flow.dates.at(-1);
  const n = flow.dates.length;
  const fixed = new Set(splits.map((x) => x.code));
  const diverge = [];
  const others = []; // futuros, moedas, índices, cripto: a base às vezes traz outro valor (ex.: sessão da noite)
  let compared = 0;
  for (const [sym, s] of Object.entries(flow.close)) {
    const x = live.quotes[sym];
    if (x?.pc && !/^[A-Z]{1,5}$/.test(sym) && !fixed.has(sym)) {
      const day = nyDay(x.t);
      const ref = day > lastDate ? s[n - 1] : day === lastDate ? s[n - 2] : null;
      if (ref > 0 && Math.abs(x.pc / ref - 1) > 0.0075 && Math.abs(x.pc / ref - 1) < 0.25)
        others.push(`${sym} ${num(ref, 2)} → ${num(x.pc, 2)}`);
    }
    if (!x?.pc || !/^[A-Z]{1,5}$/.test(sym) || fixed.has(sym)) continue;
    const day = nyDay(x.t);
    const ref = day > lastDate ? s[n - 1] : day === lastDate ? s[n - 2] : null;
    if (ref == null) continue;
    compared++;
    const d = Math.abs(x.pc / ref - 1);
    if (d > 0.0075) diverge.push(`${sym} ${fmtPct(d)}`);
  }
  out.push(
    item(G, "Mapa de fluxo emenda com a base",
      diverge.length > 5 ? "bad" : diverge.length ? "warn" : "ok",
      diverge.length
        ? `Fechamento anterior difere da base em: ${diverge.slice(0, 8).join(", ")}.`
        : `${compared} ações/ETFs do mapa: o fechamento anterior do Yahoo bate com a base.`), // prettier-ignore
  );
  out.push(
    item(G, "Variação do dia igual em todas as telas", others.length ? "warn" : "ok",
      others.length
        ? `A base gravou outro fechamento anterior para ${others.length} ativo(s): ${others.slice(0, 8).join(", ")}. O app usa o fechamento oficial da cotação (tabelas, painel do ativo, carteira e Onshore mostram a mesma variação); a base se corrige na próxima atualização.`
        : "Tabelas, painel do ativo, carteira e Onshore calculam a variação do dia pelo mesmo fechamento anterior oficial da cotação."), // prettier-ignore
  );
  if (splits.length)
    out.push(
      item(G, "Desdobramentos/grupamentos corrigidos", "ok",
        `${splits.map((x) => `${x.code} (${x.factor >= 1 ? `grupamento ${Math.round(x.factor)}:1` : `desdobramento 1:${Math.round(1 / x.factor)}`})`).join(", ")}: o histórico do Yahoo ainda estava na escala antiga; o app reescalou a série.`), // prettier-ignore
    );
  return out;
}

// ───────────── 3. Cálculos do motor, refeitos de forma independente ─────────────

function rsiIndep(s) {
  // mesma definição do motor (RSI simples de 14), escrita de outro jeito: médias de ganhos e perdas
  const d = s
    .slice(-15)
    .map((v, i, a) => (i ? v - a[i - 1] : 0))
    .slice(1);
  const up = d.filter((x) => x > 0).reduce((a, b) => a + b, 0) / 14;
  const dn = -d.filter((x) => x < 0).reduce((a, b) => a + b, 0) / 14;
  return dn === 0 ? 100 : (100 * up) / (up + dn);
}

export function checkEngine(snap, prices) {
  const G = "Cálculos do Pêndulo";
  if (!snap?.assets || !prices?.series) return [];
  const out = [];
  const errs = [];
  let n = 0;
  for (const [code, a] of Object.entries(snap.assets)) {
    const s = prices.series[code];
    if (!a.ok || !s) continue;
    n++;
    const L = s.length;
    const ref = {
      price: s[L - 1],
      r1d: s[L - 1] / s[L - 2] - 1,
      r5d: s[L - 1] / s[L - 6] - 1,
      r1m: s[L - 1] / s[L - 22] - 1,
      ma50: s.slice(-50).reduce((x, y) => x + y, 0) / 50,
      ma200: s.slice(-200).reduce((x, y) => x + y, 0) / 200,
      rsi: rsiIndep(s),
    };
    for (const [k, v] of Object.entries(ref))
      if (a[k] != null && !close(a[k], v, 1e-9)) errs.push(`${code}.${k}`);
  }
  out.push(
    errs.length
      ? item(
          G,
          "Retornos, médias e RSI",
          "bad",
          `Divergem do recálculo: ${errs.slice(0, 6).join(", ")}.`,
        )
      : item(
          G,
          "Retornos, médias e RSI",
          "ok",
          `${n} ativos: preço, retornos 1d/5d/1m, MM50, MM200 e RSI recalculados e iguais.`,
        ),
  );
  return out;
}

// ───────────── 4. Carteira ─────────────

export function checkPortfolio(portfolio, valuation, live) {
  const G = "Carteira";
  if (!portfolio?.holdings?.length || !valuation) return [];
  const out = [];
  const rows = valuation.rows;
  const rowErr = rows.filter(
    (r) =>
      !close(r.value, r.qty * r.price, 1e-9) ||
      !close(r.cost, r.qty * r.avg, 1e-9) ||
      !close(r.netPL, r.value - r.cost, 1e-9),
  );
  out.push(
    rowErr.length
      ? item(G, "Valor, custo e resultado por posição", "bad", rowErr.map((r) => r.sym).join(", "))
      : item(
          G,
          "Valor, custo e resultado por posição",
          "ok",
          `${rows.length} posições: valor = qtd × preço, custo = qtd × médio, resultado = valor − custo.`,
        ),
  );
  const sumV = rows.reduce((a, r) => a + r.qty * r.price, 0);
  const sumC = rows.reduce((a, r) => a + r.qty * r.avg, 0);
  const sumW = rows.reduce((a, r) => a + r.weight, 0);
  const totOk =
    close(valuation.total, sumV, 1e-9) && close(valuation.cost, sumC, 1e-9) && close(sumW, 1, 1e-9);
  out.push(
    totOk
      ? item(
          G,
          "Totais e pesos",
          "ok",
          `Pesos somam 100%; total e custo batem com a soma das linhas.`,
        )
      : item(
          G,
          "Totais e pesos",
          "bad",
          `Pesos somam ${fmtPct(sumW)}; total ${valuation.total.toFixed(2)} × soma ${sumV.toFixed(2)}.`,
        ),
  );
  // Quantidades e médios iguais aos importados (nada foi alterado sem querer)
  const changed = portfolio.holdings.filter((h) => {
    const r = rows.find((x) => x.sym === h.sym);
    return !r || r.qty !== h.qty || r.avg !== h.avg;
  });
  out.push(
    changed.length
      ? item(G, "Posições iguais às importadas", "bad", changed.map((h) => h.sym).join(", "))
      : item(
          G,
          "Posições iguais às importadas",
          "ok",
          `Quantidades e preços médios iguais aos salvos (importados ou ajustados à mão).`,
        ),
  );
  const noLive = rows.filter((r) => !r.live);
  out.push(
    noLive.length
      ? item(
          G,
          "Todas as posições com preço ao vivo",
          "warn",
          `Sem cotação (usa o preço colado): ${noLive.map((r) => r.sym).join(", ")}.`,
        )
      : item(
          G,
          "Todas as posições com preço ao vivo",
          "ok",
          `${rows.length}/${rows.length} com cotação do Yahoo.`,
        ),
  );
  // No dia da importação, o preço ao vivo deve estar perto do preço que o Investing mostrava.
  const sameDay =
    portfolio.importedAt &&
    live?.fetched_at &&
    portfolio.importedAt.slice(0, 10) === live.fetched_at.slice(0, 10);
  if (sameDay) {
    const far = rows.filter(
      (r) => r.live && r.invPrice > 0 && Math.abs(r.price / r.invPrice - 1) > 0.05,
    );
    out.push(
      far.length
        ? item(G, "Preço do Yahoo × preço do Investing (hoje)", "warn",
            far.map((r) => `${r.sym}: ${r.price.toFixed(2)} × ${r.invPrice.toFixed(2)}`).join("; ") + ". Pode ser ticker diferente entre as fontes.") // prettier-ignore
        : item(
            G,
            "Preço do Yahoo × preço do Investing (hoje)",
            "ok",
            "Todas as posições a menos de 5% do preço colado.",
          ),
    );
  }
  return out;
}

// ───────────── 5. Fonte independente (/api/verify) ─────────────

export function checkCross(verify) {
  const G = "Fonte independente (Nasdaq)";
  if (!verify)
    return [
      item(
        G,
        "Conferência com a Nasdaq",
        "warn",
        "Ainda não rodou. Abra esta aba ou aperte Conferir agora.",
      ),
    ];
  if (verify.error)
    return [item(G, "Conferência com a Nasdaq", "warn", `Indisponível: ${verify.error}`)];
  const s = verify.summary;
  const compared = s.ok + s.warn + s.bad;
  const level = s.bad ? "bad" : s.warn ? "warn" : compared ? "ok" : "warn";
  return [
    item(G, "Preço e fechamento anterior: Yahoo × Nasdaq", level,
      `${s.ok}/${compared} iguais${s.warn ? `, ${s.warn} com pequena diferença` : ""}${s.bad ? `, ${s.bad} divergentes` : ""}${s.na ? ` · ${s.na} sem referência` : ""}.`), // prettier-ignore
  ];
}

/** Junta tudo e resume. */
export function runChecks(ctx) {
  const items = [
    ...checkBase(ctx.base, { today: ctx.today }),
    ...checkLive(ctx.live, ctx.base, { nowSec: ctx.nowSec }),
    ...checkFlowLive(ctx.flowBase, ctx.live, ctx.splits),
    ...checkEngine(ctx.snap, ctx.prices),
    ...checkPortfolio(ctx.portfolio, ctx.valuation, ctx.live),
    ...checkCross(ctx.verify),
  ];
  const count = (l) => items.filter((i) => i.level === l).length;
  const summary = { ok: count("ok"), warn: count("warn"), bad: count("bad"), total: items.length };
  summary.level = summary.bad ? "bad" : summary.warn ? "warn" : "ok";
  return { items, summary };
}
