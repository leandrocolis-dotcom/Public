// Long & Short: os 33 alertas do JSON v4 (puro). evaluateAlerts(input, out) recebe a entrada do motor e a saída
// de computeLs e devolve [{ id, sym, prio, blocks, msg }], com a mensagem do JSON preenchida (nenhuma chave
// {…} sobra). dedupeAlerts aplica o intervalo de 15 min por alerta e posição, exceto se a prioridade subir.
// Bloqueios de compra moram no motor (ls-engine.js); aqui só se descreve. Nenhum alerta muda a carteira.
import { ALERTS, PARAMS, alertDef, hhmm } from "./ls-params.js";
import { alertaEventoCorporativo } from "./ls-core.js";
import { num } from "./format.js";

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const RANK = { info: 0, atencao: 1, acao: 2, critico: 3 };
const SIDE_TXT = { VENDER: "VENDER", COMPRAR: "COMPRAR", COMPRAR_PARA_COBRIR: "COMPRAR PARA COBRIR", VENDER_A_DESCOBERTO: "VENDER A DESCOBERTO" }; // prettier-ignore
export const sideText = (s) => SIDE_TXT[s] ?? s;

/** Troca {chave} pelos valores. Chave sem valor é erro (mensagem pela metade vira ordem mal lida). */
export function fillMsg(tpl, vars) {
  return tpl.replace(/\{([^}]+)\}/g, (_, k) => {
    if (vars[k] === undefined || vars[k] === null) throw new Error(`alerta: falta {${k}}`);
    return String(vars[k]);
  });
}

const mk = (id, sym, vars = {}) => {
  const d = alertDef(id);
  return { id, sym: sym ?? null, prio: d.prioridade, blocks: d.bloqueia, group: d.grupo, msg: fillMsg(d.mensagem, vars) }; // prettier-ignore
};

/**
 * Filtros de overnight de uma ponta (5): VIX ≤ máx., percentil do ATR ≤ máx., tamanho ≤ 50% do maior tamanho
 * do dia, pregões carregados < prazo da alavancagem, decaimento ≤ máx. Dado ausente = filtro não atendido.
 */
export function overnightFilters(
  { vix, atrPct, value, maxValueToday, sessions, L, decayPp },
  p = PARAMS,
) {
  const prazo = p.overnight_prazo_max_pregoes[`${L}x`] ?? p.overnight_prazo_max_pregoes["3x"];
  return [
    { id: "vix", ok: fin(vix) && vix <= p.overnight_vix_max },
    { id: "atr", ok: fin(atrPct) && atrPct <= p.overnight_atr_percentil_max },
    { id: "tamanho", ok: fin(value) && fin(maxValueToday) && maxValueToday > 0 && value <= p.overnight_tamanho_max_vs_intraday * maxValueToday + 1e-9 }, // prettier-ignore
    { id: "prazo", ok: fin(sessions) && sessions < prazo },
    { id: "decaimento", ok: fin(decayPp) && decayPp <= p.decaimento_gap_max_pp },
  ];
}

/**
 * input = entrada do motor + { vix?, eodCtx?: { [sym]: { atrPct, maxValueToday } }, balancePost?: [syms],
 * marks?: { eod, posteod, close } (minutos ET) }; out = computeLs(input).
 */
export function evaluateAlerts(input, out, p = input.params ?? PARAMS) {
  const A = [];
  const { session, minET } = input;
  const day = input.day ?? {};
  const legsIn = [];
  for (const pr of input.pairs ?? [])
    for (const k of ["long", "short"]) if (pr[k]) legsIn.push(pr[k]);
  const ms = out.legs ?? [];
  const open = ms.filter((m) => m.ok && m.qty > 0);
  const marks = input.marks ?? { eod: hhmm(p.overnight_checagem_horario), posteod: hhmm(p.overnight_checagem_pos_horario), close: 960 }; // prettier-ignore

  // pré-mercado e calendário
  if (session !== "FECHADO" && minET >= 240 && !input.plan?.ok) A.push(mk("PRE-01"));
  if ((input.events ?? []).length) A.push(mk("PRE-02"));
  if (input.calendar?.blocks) A.push(mk("CAL-01"));
  legsIn.forEach((l, i) => {
    const m = ms[i];
    const u = l.under ?? {};
    if (session === "PRE" && fin(u.gap?.atr) && Math.abs(u.gap.atr) > p.gap_max_atr) A.push(mk("PRE-03", l.sym)); // prettier-ignore
    if (!m) return;
    if (fin(m.spreadPct) && m.spreadPct > p.spread_max_pct) A.push(mk("SES-02", l.sym, { x: num(m.spreadPct, 2), ativo: l.sym })); // prettier-ignore
    if (!m.ok || !m.quote?.ok) A.push(mk("EXE-01", l.sym, { ativo: l.sym }));
    const corp = l.corpEvent || (fin(l.retDay?.etf) && fin(l.retDay?.under) && l.asset?.ok && alertaEventoCorporativo(l.retDay.etf, l.retDay.under, l.asset.L, l.asset.type, p)); // prettier-ignore
    if (corp) A.push(mk("ETF-01", l.sym, { ativo: l.sym }));
    const wantsMore = (out.orders ?? []).some((o) => o.sym === l.sym && (o.purpose === "AUMENTAR" || o.purpose === "ENTRAR")); // prettier-ignore
    if (l.recall || (l.dir === -1 && wantsMore && !l.borrow?.ok)) A.push(mk("SHR-01", l.sym, { q: m.qty ?? 0, ativo: l.sym })); // prettier-ignore
    if (u.breakout?.dir && m.ok && u.breakout.dir === (m.favor === 1 ? "up" : "down") && m.vwapSide === "a favor") A.push(mk("INT-02", l.sym, { ativo: l.sym })); // prettier-ignore
    if (m.ok && m.qty > 0) {
      const prazo = p.overnight_prazo_max_pregoes[`${l.asset.L}x`] ?? p.overnight_prazo_max_pregoes["3x"]; // prettier-ignore
      if ((fin(m.decayPp) && m.decayPp > p.decaimento_gap_max_pp) || (l.sessions ?? 0) > prazo) A.push(mk("SWG-01", l.sym, { ativo: l.sym })); // prettier-ignore
      if (minET >= marks.close - 30 && session === "REGULAR" && (input.balancePost ?? []).includes(l.sym)) A.push(mk("POS-01", l.sym, { ativo: l.sym })); // prettier-ignore
    }
  });
  if ((out.orders ?? []).length && (session === "PRE" || session === "POS")) A.push(mk("SES-01"));
  for (const o of input.liveOrders ?? []) {
    const left = (o.qtySug ?? 0) - (o.qtyExec ?? 0);
    if (o.status === "PARCIAL" && left > 0) A.push(mk("EXE-02", o.sym, { q: left, ativo: o.sym }));
  }
  if (session === "REGULAR" && minET >= 570 && minET < 570 + p.faixa_abertura_min)
    A.push(mk("INT-01"));
  const crossSyms = new Set();
  for (const l of legsIn) if ((l.under?.crosses ?? 0) >= p.cruzamentos_vwap_lateral && l.asset?.under) crossSyms.add(l.asset.under); // prettier-ignore
  if (crossSyms.size) A.push(mk("INT-03"));
  for (const pr of out.pairs ?? []) {
    const why = [];
    if (fin(pr.corr) && pr.corr < p.correlacao_min_par) why.push(`correlação ${num(pr.corr, 2)}`);
    if (pr.desvio?.bloqueia) why.push(`desvio direcional ${num(pr.desvio.efetivo, 2)}x × plano ${num(pr.dirPlan, 2)}x`); // prettier-ignore
    if (why.length) A.push(mk("PAR-01", pr.id, { motivo: why.join(", ") }));
  }

  // decisões (das ordens do motor)
  for (const o of out.orders ?? []) {
    const vars = { lado: sideText(o.side), q: o.qty, ativo: o.sym, limite: fin(o.limit) ? num(o.limit, 2) : "—" }; // prettier-ignore
    if (o.alert === "DEC-01") {
      const pr = (out.pairs ?? []).find((x) => x.id === o.pairId);
      const win = pr?.p3 ? out.legs[pr.p3.winner]?.sym : null;
      A.push(mk("DEC-01", o.sym, { ...vars, A: win ?? "a vencedora", B: o.sym }));
    }
    if (o.alert === "DEC-04" || o.alert === "DEC-05" || o.alert === "DEC-06") A.push(mk(o.alert, o.sym, vars)); // prettier-ignore
    if (o.alert === "DEC-07") A.push(mk("DEC-07", o.sym, vars));
    if (o.alert === "SES-03") A.push(mk("SES-03", o.sym, vars));
    if (o.alert === "RSK-03") A.push(mk("RSK-03", o.sym, vars));
    for (const b of o.blockers ?? []) {
      if (b.id === "DEC-02") A.push(mk("DEC-02", o.sym));
      if (b.id === "DEC-08") {
        const s = Math.max(0, Math.ceil((b.waitMs ?? 0) / 1000));
        A.push(mk("DEC-08", o.sym, { "mm:ss": `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` })); // prettier-ignore
      }
    }
    const dec3 = (o.blockers ?? []).filter((b) => b.id === "DEC-03" || b.id === "P6");
    if (o.purpose === "AUMENTAR" && dec3.length) A.push(mk("DEC-03", o.sym, { "limite que travou": dec3.map((b) => b.why).join("; ") })); // prettier-ignore
  }

  // risco e comportamento
  const f = out.portfolio?.flags ?? {};
  if (f.rsk01) A.push(mk("RSK-01"));
  if (f.rsk02) A.push(mk("RSK-02"));
  if (f.rsk03 && !(out.orders ?? []).some((o) => o.alert === "RSK-03")) {
    const big = open.slice().sort((a, b) => Math.abs(b.expAj) - Math.abs(a.expAj))[0];
    A.push(mk("RSK-03", big?.sym, { lado: "REDUZIR", q: "o excesso", ativo: big?.sym ?? "a maior posição" })); // prettier-ignore
  }
  if (f.rsk04) A.push(mk("RSK-04", null, { x: num(Math.max(0, out.portfolio.tetoR ?? 0), 2) }));
  const gb = out.blockers ?? [];
  if (gb.some((b) => b.id === "BEH-01")) A.push(mk("BEH-01"));
  const symStops = Object.entries(day.stopsBySym ?? {}).filter(([, n]) => n >= p.max_stops_ativo_dia).map(([s]) => s); // prettier-ignore
  if (gb.some((b) => b.id === "BEH-02") || symStops.length) A.push(mk("BEH-02", null, { "ativo ou todos": gb.some((b) => b.id === "BEH-02") ? "todos" : symStops.join(", ") })); // prettier-ignore

  // fechamento
  if (open.length) {
    const nOk = open.map((m) => {
      const l = legsIn[ms.indexOf(m)];
      const e = input.eodCtx?.[m.sym] ?? {};
      return overnightFilters({ vix: input.vix, atrPct: e.atrPct, value: m.value, maxValueToday: e.maxValueToday, sessions: l?.sessions, L: l?.asset?.L, decayPp: m.decayPp }, p).filter((x) => x.ok).length; // prettier-ignore
    });
    const n = Math.min(...nOk);
    if (session === "REGULAR" && minET >= marks.eod) A.push(mk("EOD-01", null, { n }));
    if (session === "POS" && minET >= marks.posteod) A.push(mk("EOD-02", null, { n }));
  }
  return A.sort((a, b) => RANK[b.prio] - RANK[a.prio]);
}

/**
 * Dedupe de 15 min por alerta e posição: mostra se não apareceu há `dedupe_alerta_min` ou se a prioridade subiu.
 * mem = { "ID|SYM": { at, rank } }. Devolve { show, mem } (mem novo, imutável).
 */
export function dedupeAlerts(alerts, mem = {}, now, p = PARAMS) {
  const next = { ...mem };
  const show = [];
  const win = p.dedupe_alerta_min * 60000;
  for (const a of alerts) {
    const k = `${a.id}|${a.sym ?? ""}`;
    const prev = mem[k];
    const rank = RANK[a.prio] + (a.level ?? 0);
    if (!prev || now - prev.at >= win || rank > prev.rank) {
      show.push(a);
      next[k] = { at: now, rank };
    }
  }
  return { show, mem: next };
}

/** Alertas de risco (contam no BEH-01 quando ignorados). */
export const isRiskAlert = (id) => /^(RSK|DEC-07|DEC-06|SES-03|SHR|ETF)/.test(id) || alertDef(id)?.prioridade === "critico"; // prettier-ignore

/** Para a tela e os testes: todos os ids do JSON. */
export const ALERT_IDS = ALERTS.map((a) => a.id);
