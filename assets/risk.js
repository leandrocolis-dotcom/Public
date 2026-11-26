// Risco da carteira (estilo Bloomberg PORT): volatilidade, beta, VaR/CVaR histórico, queda máxima,
// contribuição de cada posição para o risco, correlação e concentração. Funções puras, para testar.
// Entrada: pesos atuais (valuation.rows) e históricos de fechamento { dates, close } por símbolo.

const ANN = Math.sqrt(252);

/** Retornos diários simples alinhados nas datas comuns a todos os símbolos (últimos `lookback` pregões). */
export function alignReturns(history, syms, lookback = 252) {
  const ok = syms.filter((s) => history[s]?.dates?.length > 2);
  if (!ok.length) return { syms: [], dates: [], R: {} };
  const maps = Object.fromEntries(ok.map((s) => [s, new Map(history[s].dates.map((d, i) => [d, history[s].close[i]]))])); // prettier-ignore
  const dates = history[ok[0]].dates.filter((d) => ok.every((s) => Number.isFinite(maps[s].get(d)) && maps[s].get(d) > 0)); // prettier-ignore
  const win = dates.slice(-(lookback + 1));
  const R = {};
  for (const s of ok) {
    const px = win.map((d) => maps[s].get(d));
    R[s] = px.slice(1).map((p, i) => p / px[i] - 1);
  }
  return { syms: ok, dates: win.slice(1), R };
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
export function cov(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}
export const corr = (a, b) => cov(a, b) / Math.sqrt(cov(a, a) * cov(b, b));

/** Queda máxima de uma série de retornos (fração negativa). */
export function maxDrawdown(rets) {
  let v = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of rets) {
    v *= 1 + r;
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
  }
  return mdd;
}

/** VaR e CVaR históricos (perda como fração positiva) ao nível `q` (0,95). */
export function historicalVaR(rets, q = 0.95) {
  if (rets.length < 20) return { var: null, cvar: null };
  const s = [...rets].sort((a, b) => a - b);
  const k = Math.max(0, Math.floor((1 - q) * s.length) - 1);
  const tail = s.slice(0, k + 1);
  return { var: -s[k], cvar: -mean(tail) };
}

/**
 * rows: [{ sym, weight, value }]; history: { SYM: { dates, close } }.
 * Posições sem histórico ficam de fora e são listadas em `missing` (os pesos são renormalizados).
 */
export function portfolioRisk(rows, history, { bench = "SPY", lookback = 252, total = null } = {}) {
  const held = (rows ?? []).filter((r) => r.weight > 0);
  const { syms, dates, R } = alignReturns(history, [...new Set([...held.map((r) => r.sym), bench])], lookback); // prettier-ignore
  const inSet = held.filter((r) => syms.includes(r.sym));
  const missing = held.filter((r) => !syms.includes(r.sym)).map((r) => r.sym);
  const covered = inSet.reduce((a, r) => a + r.weight, 0);
  if (!inSet.length || dates.length < 20)
    return { ok: false, missing, days: dates.length, reason: dates.length < 20 ? "histórico comum curto" : "sem posições com histórico" }; // prettier-ignore
  const w = Object.fromEntries(inSet.map((r) => [r.sym, r.weight / covered]));
  const n = dates.length;
  const port = Array.from({ length: n }, (_, i) => inSet.reduce((a, r) => a + w[r.sym] * R[r.sym][i], 0)); // prettier-ignore
  const b = syms.includes(bench) ? R[bench] : null;
  const varP = cov(port, port);
  const tail = historicalVaR(port);
  const value = total ?? null;
  const positions = inSet
    .map((r) => {
      const ri = R[r.sym];
      const c = cov(ri, port);
      return {
        sym: r.sym,
        weight: w[r.sym],
        vol: Math.sqrt(cov(ri, ri)) * ANN,
        beta: b ? cov(ri, b) / cov(b, b) : null,
        corrPort: c / Math.sqrt(cov(ri, ri) * varP),
        riskShare: (w[r.sym] * c) / varP, // soma 1: quanto do risco total vem da posição
        mdd: maxDrawdown(ri),
      };
    })
    .sort((x, y) => y.riskShare - x.riskShare);
  const hhi = Object.values(w).reduce((a, x) => a + x * x, 0);
  // apostas independentes = (razão de diversificação)²: soma dos riscos isolados ÷ risco da carteira, ao quadrado.
  // 1 = tudo anda junto (uma aposta só); N ativos sem correlação = N apostas.
  const dr = positions.reduce((a, p) => a + p.weight * p.vol, 0) / (Math.sqrt(varP) * ANN);
  const top = positions.slice(0, 12).map((p) => p.sym);
  return {
    ok: true,
    days: n,
    from: dates[0],
    to: dates.at(-1),
    missing,
    coverage: covered,
    vol: Math.sqrt(varP) * ANN,
    beta: b ? cov(port, b) / cov(b, b) : null,
    benchVol: b ? Math.sqrt(cov(b, b)) * ANN : null,
    var95: tail.var,
    cvar95: tail.cvar,
    var95Usd: value && tail.var != null ? tail.var * value : null,
    mdd: maxDrawdown(port),
    effN: 1 / hhi,
    effBets: Number.isFinite(dr) ? dr * dr : null,
    spyExposure: b && value ? (cov(port, b) / cov(b, b)) * value : null,
    topWeight: Math.max(...Object.values(w)),
    positions,
    corr: { syms: top, m: top.map((a) => top.map((c) => (a === c ? 1 : corr(R[a], R[c])))) },
  };
}

/** Leitura em linguagem simples (alertas de concentração e risco). */
export function riskNotes(r) {
  if (!r?.ok) return [];
  const out = [];
  const lead = r.positions[0];
  if (lead && lead.riskShare > 0.35 && lead.riskShare > lead.weight * 1.4)
    out.push({ tone: "warn", text: `${lead.sym} pesa ${pctTxt(lead.weight)} da carteira, mas responde por ${pctTxt(lead.riskShare)} do risco.` }); // prettier-ignore
  if (r.effBets != null && r.effN >= 2 && r.effBets < Math.max(1.5, r.effN / 2))
    out.push({ tone: "warn", text: `${r.effN.toFixed(1)} posições, mas só ~${r.effBets.toFixed(1)} apostas independentes: na prática a carteira é ${r.effBets < 1.5 ? "uma aposta só" : "poucas apostas"} (correlação alta).` }); // prettier-ignore
  if (r.effN < 4) out.push({ tone: "warn", text: `Concentrada: equivale a ~${r.effN.toFixed(1)} posições de mesmo peso.` }); // prettier-ignore
  if (r.beta != null && r.beta > 1.2) out.push({ tone: "warn", text: `Beta ${r.beta.toFixed(2)}: tende a cair ${Math.round((r.beta - 1) * 100)}% mais que o S&P 500 nas quedas.` }); // prettier-ignore
  if (r.beta != null && r.beta < 0.6) out.push({ tone: "ok", text: `Beta ${r.beta.toFixed(2)}: carteira defensiva em relação ao S&P 500.` }); // prettier-ignore
  const m = r.corr.m;
  let hi = null;
  for (let i = 0; i < m.length; i++)
    for (let j = i + 1; j < m.length; j++)
      if (m[i][j] > 0.85 && (!hi || m[i][j] > hi.c))
        hi = { a: r.corr.syms[i], b: r.corr.syms[j], c: m[i][j] };
  if (hi) out.push({ tone: "warn", text: `${hi.a} e ${hi.b} andam juntos (correlação ${hi.c.toFixed(2)}): diversificam pouco entre si.` }); // prettier-ignore
  if (r.missing.length) out.push({ tone: "info", text: `Sem histórico suficiente: ${r.missing.join(", ")} (fora do cálculo).` }); // prettier-ignore
  return out;
}

const pctTxt = (x) => `${Math.round(x * 100)}%`;
