// Long & Short: motor de decisão (puro, determinístico). computeLs(input) → { orders, stopMoves, pairs, legs,
// portfolio, blockers, errors }. Recebe estado + parâmetros + horário; não lê relógio, rede nem DOM.
// Regras do JSON v4 (motor): por posição vale só a ação de maior prioridade (P0–P8); P0–P2 suspendem entradas e
// aumentos no par; bloqueios por FINALIDADE, nunca por lado (cobertura de short e venda para reduzir nunca
// bloqueadas); arredondamento: reduções max(1, floor(q·f)), exposição ceil limitado a q, compras floor.
import { PARAMS, hhmm } from "./ls-params.js";
import { frac, isBuySide, pyRound, qEntrada, qPyramiding, qtdReducao, side, stopVigente, exposure } from "./ls-core.js"; // prettier-ignore
import { legMetrics, pairMetrics, portfolioMetrics } from "./ls-metrics.js";

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const PRI = ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];

/** Classificação do par para exibição (1 a 9; 0 = manter), na ordem de `motor.classificacao_cenario_exibicao`. */
export function scenario({ mL, mS, pnlR, eventSoon, crosses }, p = PARAMS) {
  const ms = [mL, mS].filter((m) => m?.ok && m.qty > 0);
  if (eventSoon) return 9;
  if (ms.some((m) => m.stopHit || (m.devolucao ?? 0) >= p.devolucao_zerar_pct)) return 8;
  if (ms.some((m) => m.pnlR >= p.esticado_r || (m.stretchAtr ?? 0) >= p.esticado_atr_d)) return 6;
  if (ms.some((m) => (m.devolucao ?? 0) >= p.devolucao_reduzir_pct)) return 7;
  const l = mL?.ok && mL.qty > 0 ? mL.pnlR : null;
  const s = mS?.ok && mS.qty > 0 ? mS.pnlR : null;
  if (l !== null && s !== null) {
    if (l >= 1 && s <= -0.5) return 1;
    if (s >= 1 && l <= -0.5) return 2;
    if (l <= -0.5 && s <= -0.5) return 4;
    if (l > 0 && s > 0 && pnlR >= 1) return 3;
  }
  if ((crosses ?? 0) >= p.cruzamentos_vwap_lateral) return 5;
  return 0;
}

/** Preço limite: compra no ask, venda no bid; zeragem/redução no pré e no pós com folga (bid·0,995 / ask·1,005). */
export function limitPrice(sideName, purpose, session, quote, p = PARAMS) {
  const buy = isBuySide(sideName);
  const ext = session === "PRE" || session === "POS";
  const reduce = purpose === "REDUZIR" || purpose === "ZERAR";
  const ref = buy ? quote?.ask : quote?.bid;
  const has = fin(ref) && ref > 0;
  const base = has ? ref : quote?.P;
  if (!(base > 0)) return { limit: null, from: null };
  const mult = ext && reduce ? (buy ? p.limite_cobertura_estendida_mult : p.limite_venda_estendida_mult) : 1; // prettier-ignore
  return { limit: pyRound(base * mult, 2), from: has ? (buy ? "ask" : "bid") : "último" };
}

/**
 * Travas de COMPRA que valem para a carteira toda (ids de alerta). Nunca se aplicam a REDUZIR/ZERAR.
 * ctx: { session, minET, cutMin, plan, calendar, flags, day, p }.
 */
export function globalBuyBlockers({ session, minET, cutMin, planOk, calendarBlocks, flags, day, eventCooling, refMissing = [], noStop = [], p = PARAMS }) {
  const b = [];
  if (refMissing.length) b.push({ id: "EXE-01", why: `sem preço de referência do dia: ${refMissing.join(", ")}` });
  if (noStop.length) b.push({ id: "SEM-STOP", why: `posição sem stop: ${noStop.join(", ")} (defina o stop)` });
  if (session === "POS" || session === "FECHADO") b.push({ id: "SESSAO", why: session === "POS" ? "pós-mercado: só reduzir ou zerar" : "mercado fechado" }); // prettier-ignore
  if (fin(cutMin) && fin(minET) && minET >= cutMin && session === "REGULAR") b.push({ id: "CORTE", why: "depois do corte de compras do dia" }); // prettier-ignore
  if (!planOk) b.push({ id: "PRE-01", why: "sem plano do dia" });
  if (calendarBlocks) b.push({ id: "CAL-01", why: "sessão especial não validada" });
  if (flags.rsk01) b.push({ id: "RSK-01", why: "limite diário atingido" });
  if (flags.rsk02) b.push({ id: "RSK-02", why: "pausa por perdas seguidas" });
  if (flags.rsk03) b.push({ id: "RSK-03", why: "exposição acima do limite" });
  if (flags.rsk04) b.push({ id: "RSK-04", why: "risco total no teto" });
  if ((day.ignoredRisk30 ?? 0) >= p.max_alertas_risco_ignorados_30min) b.push({ id: "BEH-01", why: "alertas de risco ignorados" }); // prettier-ignore
  if ((day.entries ?? 0) >= p.max_entradas_dia) b.push({ id: "BEH-02", why: "limite de entradas do dia" });
  if (eventCooling) b.push({ id: "PRE-02", why: "aguarde 30 min depois do evento" });
  return b;
} // prettier-ignore

/** Travas de compra de UMA ponta (ids). `purpose` = ENTRAR ou AUMENTAR. */
export function legBuyBlockers(leg, m, purpose, { session, now, day, p = PARAMS }) {
  const b = [];
  if (!m.ok) b.push({ id: "EXE-01", why: m.errors.join("; ") || "dado inválido" });
  else if (!m.quote.ok) b.push({ id: "EXE-01", why: m.quote.reasons.join("; ") });
  if (m.ok && !m.canSize) b.push({ id: "EXE-01", why: `sem ATR/subjacente para dimensionar (${m.sizeErrors.join("; ")})` }); // prettier-ignore
  if (fin(m.spreadPct) && m.spreadPct > p.spread_max_pct) b.push({ id: "SES-02", why: `spread de ${pyRound(m.spreadPct, 2)}%` }); // prettier-ignore
  if (leg.corpEvent) b.push({ id: "ETF-01", why: "possível evento corporativo pendente" });
  if (leg.dir === -1 && !leg.borrow?.ok)
    b.push({ id: "SHR-01", why: "short sem aluguel confirmado" });
  if (leg.recall) b.push({ id: "SHR-01", why: "recall registrado" });
  if ((day.stopsBySym?.[leg.sym] ?? 0) >= p.max_stops_ativo_dia) b.push({ id: "BEH-02", why: `${leg.sym}: limite de stops do dia` }); // prettier-ignore
  const lastAdj = day.lastAdj?.[leg.sym];
  if (fin(lastAdj) && now - lastAdj < p.intervalo_ajuste_min * 60000) b.push({ id: "DEC-08", why: "uma mudança por vez (intervalo de ajuste)", waitMs: p.intervalo_ajuste_min * 60000 - (now - lastAdj) }); // prettier-ignore
  const lastStop = day.lastStop?.[leg.sym];
  if (purpose === "ENTRAR" && fin(lastStop) && now - lastStop < p.reentrada_apos_stop_min * 60000) b.push({ id: "REENTRADA", why: "reentrada antes de 15 min do stop" }); // prettier-ignore
  if (purpose === "AUMENTAR" && session === "PRE") b.push({ id: "PRE-PYR", why: "sem aumentos no pré-mercado" }); // prettier-ignore
  if (purpose === "AUMENTAR" && m.pnl < 0) b.push({ id: "DEC-02", why: "preço médio para baixo é proibido" }); // prettier-ignore
  return b;
}

/** Os 7 gatilhos de pyramiding com o valor de cada um (todos ✓ = aumento liberado). */
export function pyramidChecklist({ m, under, oppositeReduced, lot, lastLot, riskAfter, R, addsToday, minET, cutMin, session, corr, p = PARAMS }) {
  const brk = under?.breakout;
  const favorDir = m.favor === 1 ? "up" : "down";
  return [
    { id: "pnl", ok: m.pnlR >= p.pyramiding_r_minimo, value: m.pnlR },
    { id: "oposta", ok: !!oppositeReduced, value: oppositeReduced ? "reduzida" : "não reduzida" },
    { id: "rompimento", ok: brk?.dir === favorDir && m.vwapSide === "a favor", value: brk?.volRel ?? null },
    { id: "lote", ok: lot > 0 && lot <= p.pyramiding_lote_max_vs_anterior * lastLot, value: lot },
    { id: "risco", ok: fin(riskAfter) && riskAfter <= R + 1e-9, value: riskAfter },
    { id: "janela", ok: (addsToday ?? 0) < p.pyramiding_max_aumentos_dia && fin(minET) && minET < cutMin && session === "REGULAR", value: addsToday ?? 0 }, // prettier-ignore
    { id: "correlacao", ok: fin(corr) && corr >= p.correlacao_min_par, value: corr },
  ];
} // prettier-ignore

/**
 * Motor. input = {
 *   now, session, minET, date, capital, peak, realized, weeklyLossHit,
 *   plan: { ok, pairs: { id: { dirPlan } } }, calendar: { blocks }, day (ls-data emptyDay), params,
 *   pairs: [{ id, name, long: leg|null, short: leg|null, corr, betas }], events: [{ atMs, syms? }],
 *   liveOrders: [{ purpose, sym }] (enviadas/parciais com saldo aberto)
 * }; leg = ver ls-metrics.legMetrics + { pRef, lastLot, entryUnder, recall, borrow, corpEvent }.
 */
export function computeLs(input) {
  const p = input.params ?? PARAMS;
  const { now, session, minET, capital } = input;
  const day = input.day ?? {};
  const cutMin = input.cutMin ?? hhmm(p.pyramiding_corte_horario);
  const errors = [];
  if (!(capital > 0)) return { ok: false, errors: [{ id: "EXE-01", why: "capital do dia ausente" }], orders: [], stopMoves: [], pairs: [], legs: [], portfolio: null, blockers: [] }; // prettier-ignore

  // 1. métricas por ponta
  const legs = [];
  for (const pr of input.pairs) for (const k of ["long", "short"]) if (pr[k]) legs.push({ ...pr[k], pairId: pr.id, legKind: k }); // prettier-ignore
  const mets = legs.map((l) => legMetrics(l, { capital, now, session, p }));
  mets.forEach((m, i) => {
    if (!m.ok) errors.push({ id: "EXE-01", sym: legs[i].sym, why: m.errors.join("; ") });
    else if (!m.canSize) errors.push({ id: "EXE-01", sym: legs[i].sym, why: `compras sem tamanho: ${m.sizeErrors.join("; ")}` }); // prettier-ignore
  });
  const pf = portfolioMetrics(legs, mets, { capital, peak: input.peak, realized: input.realized ?? day.realized ?? 0, weeklyLossHit: input.weeklyLossHit, p }); // prettier-ignore
  const R = pf.R;
  const flags = {
    // RSK-01 trava o resto do dia, sem desbloqueio manual (day.rsk01Locked gravado no primeiro disparo)
    rsk01: pf.pnlDayPct <= -p.perda_diaria_max_pct_capital || !!day.rsk01Locked,
    // RSK-02: pausa de pausa_perdas_min desde a última perda (sem horário gravado, vale a pausa)
    rsk02: (day.losses ?? 0) >= p.perdas_seguidas_pausa && !(fin(day.lastLossAt) && now - day.lastLossAt >= p.pausa_perdas_min * 60000), // prettier-ignore
    rsk03: pf.expBruta > p.exposicao_bruta_max_x_capital * capital + 1e-9 || Math.abs(pf.expLiq) > p.exposicao_liquida_max_x_capital * capital + 1e-9, // prettier-ignore
    rsk04: pf.riskOpen >= pf.teto - 1e-9,
  };
  const events = input.events ?? [];
  const eventFor = (sym, fromMs, toMs) => events.some((e) => e.atMs > fromMs && e.atMs <= toMs && (!e.syms || e.syms.includes(sym))); // prettier-ignore
  const eventCooling = events.some((e) => e.atMs <= now && now - e.atMs < p.evento_espera_min * 60000); // prettier-ignore
  const eventToday = events.length > 0;
  const blockers = globalBuyBlockers({ session, minET, cutMin, planOk: !!input.plan?.ok, calendarBlocks: !!input.calendar?.blocks, flags, day, eventCooling, refMissing: pf.refMissing, noStop: pf.noStop, p }); // prettier-ignore

  const orders = [];
  const stopMoves = [];
  const decided = new Map(); // índice da ponta → prioridade já atribuída
  const live = input.liveOrders ?? [];
  const order = (i, purpose, prio, qty, extra = {}) => {
    const leg = legs[i];
    const m = mets[i];
    const s = side(purpose, m.dir);
    const { limit, from } = limitPrice(s, purpose, session, leg.quote, p);
    const residualOpen = live.some((o) => o.purpose === purpose && o.sym === leg.sym);
    const reducing = purpose === "REDUZIR" || purpose === "ZERAR";
    if (reducing) {
      // saldo de redução ainda aberto na corretora já vai sair: não pedir de novo (evita virar a posição)
      const open = live.filter((o) => o.sym === leg.sym && (o.purpose === "REDUZIR" || o.purpose === "ZERAR")).reduce((s0, o) => s0 + Math.max(0, (o.qtySug ?? 0) - (o.qtyExec ?? 0)), 0); // prettier-ignore
      const left = m.qty - open;
      qty = purpose === "ZERAR" ? left : Math.min(qty, left);
      if (qty <= 0) {
        decided.set(i, prio);
        return;
      }
    }
    const blk = [...(extra.blockers ?? [])];
    if (residualOpen)
      blk.push({ id: "EXE-02", why: "saldo de ordem igual ainda aberto na corretora" });
    orders.push({
      id: `${input.date ?? ""}|${leg.sym}|${purpose}|${prio}${extra.episode ? `|${extra.episode}` : ""}`,
      episode: extra.episode ?? null,
      pairId: leg.pairId,
      sym: leg.sym,
      purpose,
      side: s,
      qty,
      limit,
      limitFrom: from,
      stop: extra.stop ?? leg.stop ?? null,
      reason: prio,
      alert: extra.alert ?? null,
      blocked: blk.length > 0,
      blockers: blk,
      note: extra.note ?? null,
    });
    decided.set(i, prio);
  };
  /** Episódio já executado hoje (a tela grava day.done[chave] ao registrar a execução): não repetir. */
  const done = (i, ep) => !!day.done?.[`${legs[i].sym}|${ep}`];
  const idxOf = (pairId, kind) => legs.findIndex((l) => l.pairId === pairId && l.legKind === kind);

  // 2. P0: RSK-01 zera tudo; RSK-03 reduz a maior contribuição ao excesso
  if (flags.rsk01) {
    mets.forEach((m, i) => m.qty > 0 && order(i, "ZERAR", "P0", m.qty, { alert: "RSK-01" }));
  } else if (flags.rsk03) {
    const limB = p.exposicao_bruta_max_x_capital * capital;
    const limL = p.exposicao_liquida_max_x_capital * capital;
    // pontas que já vão zerar por P1 ficam fora (o ZERAR cobre) e saem dos totais
    const mustZero = (i) => legs[i].recall || mets[i].stopHit || (mets[i].devolucao ?? 0) >= p.devolucao_zerar_pct; // prettier-ignore
    const ok = mets.map((m, i) => [m, i]).filter(([m, i]) => m.ok && m.qty > 0 && !mustZero(i));
    const gone = mets.filter((m, i) => m.ok && m.qty > 0 && mustZero(i));
    const liq = pf.expLiq - gone.reduce((s0, m) => s0 + m.expAj, 0);
    const bru = pf.expBruta - gone.reduce((s0, m) => s0 + Math.abs(m.expAj), 0);
    // reduzir uma ponta do MESMO sinal da líquida baixa as duas; com a líquida dentro, só a bruta importa
    const sg = Math.sign(liq);
    const netOver = Math.abs(liq) > limL;
    const cands = ok.filter(([m]) => !netOver || Math.sign(m.expAj) === sg);
    const best = cands
      .map(([m, i]) => {
        const u = Math.abs(m.unit);
        const nL = netOver ? (Math.abs(liq) - limL) / u : 0;
        const nB = bru > limB ? (bru - limB) / u : 0;
        const q = Math.min(m.qty, Math.ceil(Math.max(nL, nB) - 1e-9));
        // depois da ordem nenhum limite pode piorar
        const liq2 = liq - Math.sign(m.expAj) * q * u;
        const worse = Math.abs(liq2) > Math.max(Math.abs(liq), limL) + 1e-9;
        const fixes = Math.abs(liq2) <= limL + 1e-9 && bru - q * u <= limB + 1e-9;
        return { i, q, worse, fixes, size: Math.abs(m.expAj) };
      })
      .filter((c) => c.q > 0 && !c.worse)
      .sort((x, y) => y.fixes - x.fixes || x.q - y.q || y.size - x.size)[0];
    if (best) order(best.i, "REDUZIR", "P0", best.q, { alert: "RSK-03" });
  }

  // 3. por par: P1–P5 (saídas e reduções, nunca bloqueadas)
  const pairsOut = [];
  for (const pr of input.pairs) {
    const iL = idxOf(pr.id, "long");
    const iS = idxOf(pr.id, "short");
    const mL = iL >= 0 ? mets[iL] : null;
    const mS = iS >= 0 ? mets[iS] : null;
    const dirPlan = input.plan?.pairs?.[pr.id]?.dirPlan ?? 0;
    const pm = pairMetrics(pr, legs[iL], legs[iS], mL, mS, { capital, dirPlan, betas: pr.betas ?? {}, maxPnlR: day.maxPairPnl?.[pr.id] ?? null, p }); // prettier-ignore
    const eventSoon = [iL, iS].some((i) => i >= 0 && eventFor(legs[i].sym, now, now + 30 * 60000));
    const crosses = Math.max(legs[iL]?.under?.crosses ?? 0, legs[iS]?.under?.crosses ?? 0);
    const info = { ...pm, name: pr.name, corr: pr.corr ?? null, scenario: scenario({ mL, mS, pnlR: pm.pnlR, eventSoon, crosses }, p), suspended: false, p3: null }; // prettier-ignore

    for (const i of [iL, iS]) {
      if (i < 0 || decided.has(i)) continue;
      const m = mets[i];
      const leg = legs[i];
      if (!m.ok || m.qty <= 0) continue;
      const ext = session === "PRE" || session === "POS";
      if (leg.recall) order(i, "ZERAR", "P1", m.qty, { alert: "SHR-01" });
      else if (m.stopHit) order(i, "ZERAR", "P1", m.qty, { alert: ext ? "SES-03" : "DEC-07" });
      else if ((m.devolucao ?? 0) >= p.devolucao_zerar_pct)
        order(i, "ZERAR", "P1", m.qty, { alert: "DEC-07" }); // prettier-ignore
      else if (eventFor(leg.sym, now, now + 30 * 60000)) {
        const ev = events.find((e) => e.atMs > now && e.atMs <= now + 30 * 60000 && (!e.syms || e.syms.includes(leg.sym))); // prettier-ignore
        const ep = `P2@${ev.atMs}`;
        const q = qtdReducao(m.qty, p.evento_tamanho_mult, "P2");
        if (q > 0 && !done(i, ep)) order(i, "REDUZIR", "P2", q, { alert: "PRE-02", episode: ep });
      }
    }
    // P3: vencedora ≥ +1R e perdedora ≤ −0,5R (uma vez por dia por par)
    if (mL?.ok && mS?.ok && mL.qty > 0 && mS.qty > 0) {
      const [iw, il] = mL.pnlR >= 1 && mS.pnlR <= -0.5 ? [iL, iS] : mS.pnlR >= 1 && mL.pnlR <= -0.5 ? [iS, iL] : [-1, -1]; // prettier-ignore
      const already = (day.reduced?.[pr.id] ?? []).includes(legs[il]?.sym);
      if (iw >= 0 && !already && !decided.has(il)) {
        const ml = mets[il];
        const [f1, f2] = p.reducao_ponta_perdedora;
        const f = ml.pnlR > p.reducao_ponta_perdedora_limiar_r ? frac(f1) : frac(f2);
        const q = qtdReducao(ml.qty, f, "P3");
        if (q > 0) {
          order(il, "REDUZIR", "P3", q, { alert: "DEC-01", note: `suba o stop de ${legs[iw].sym} para o preço médio` }); // prettier-ignore
          info.p3 = { winner: iw, loser: il, qty: q };
          const pmW = legs[iw].avg;
          const cur = legs[iw].stop;
          const to = fin(cur)
            ? mets[iw].dir === 1
              ? Math.max(cur, pmW)
              : Math.min(cur, pmW)
            : pmW;
          if (to !== cur) stopMoves.push({ sym: legs[iw].sym, from: cur ?? null, to, reason: "P3", alert: "DEC-01" }); // prettier-ignore
        }
      }
    }
    for (const i of [iL, iS]) {
      if (i < 0 || decided.has(i)) continue;
      const m = mets[i];
      if (!m.ok || m.qty <= 0) continue;
      if ((m.devolucao ?? 0) >= p.devolucao_reduzir_pct) {
        // um P4 por movimento: depois de executado, só volta com um novo melhor preço (hwm)
        const ep = `P4@${legs[i].hwm}`;
        const q = qtdReducao(m.qty, 0.5, "P4");
        if (q > 0 && !done(i, ep)) order(i, "REDUZIR", "P4", q, { alert: "DEC-06", episode: ep });
        if (done(i, ep)) decided.set(i, "P4");
        continue;
      }
      const partial = m.pnlR >= p.parcial_r && !legs[i].partialDone;
      const stretched = m.pnlR >= p.esticado_r || (m.stretchAtr ?? 0) >= p.esticado_atr_d;
      if (partial || stretched) {
        const q = qtdReducao(m.qty, 1 / 3, "P5");
        const cool = legBuyBlockers(legs[i], m, "REDUZIR", { session, now, day, p }).filter((b) => b.id === "DEC-08"); // prettier-ignore
        const ep = partial ? "P5@parcial" : `P5@esticado@${legs[i].hwm}`;
        if (q > 0 && !done(i, ep)) order(i, "REDUZIR", "P5", q, { alert: partial ? "DEC-04" : "DEC-05", blockers: cool, episode: ep }); // prettier-ignore
      }
    }
    info.suspended = [iL, iS].some((i) => i >= 0 && ["P0", "P1", "P2"].includes(decided.get(i)));
    pairsOut.push({ info, iL, iS, pr });
  }

  // stop móvel (stop_vigente): só se aproxima do preço; P3 já pode ter subido ao preço médio (vale o melhor)
  mets.forEach((m, i) => {
    const l = legs[i];
    if (!m.ok || !m.canSize || m.qty <= 0 || !fin(l.stop) || decided.get(i) === "P0" || decided.get(i) === "P1") return; // prettier-ignore
    const to = pyRound(stopVigente(l.stop, l.quote.P, m.dist, m.dir), 2);
    const prev = stopMoves.find((x) => x.sym === l.sym);
    const better = (a0, b0) => (m.dir === 1 ? a0 > b0 + 0.004 : a0 < b0 - 0.004);
    if (prev) {
      if (better(to, prev.to)) Object.assign(prev, { to, reason: "TRAIL" });
    } else if (better(to, l.stop)) stopMoves.push({ sym: l.sym, from: l.stop, to, reason: "TRAIL", alert: null }); // prettier-ignore
  });

  // 4. compras: P6 (aumentar vencedora) e P7 (entrar), sempre com a carteira DEPOIS das reduções sugeridas
  const after = mets.map((m, i) => {
    const o = orders.find((x) => x.sym === legs[i].sym && (x.purpose === "REDUZIR" || x.purpose === "ZERAR")); // prettier-ignore
    const q = m.ok ? m.qty - (o ? o.qty : 0) : 0;
    return {
      q,
      q0: q, // quantidade depois das reduções, antes das compras do ciclo (o risco delas vai em buyRisk)
      exp: m.ok ? exposure(q, legs[i].quote.P, legs[i].asset.L, legs[i].asset.type, m.dir) : 0,
    };
  });
  const totLiq = () => after.reduce((s, a) => s + a.exp, 0);
  const totBruta = () => after.reduce((s, a) => s + Math.abs(a.exp), 0);
  let buyRisk = 0; // risco das compras já liberadas neste ciclo (cada uma conta para a próxima)
  const take = (i, q, d) => {
    const o = orders.at(-1);
    if (!o || o.blocked || q <= 0) return;
    const l = legs[i];
    after[i].q += q;
    after[i].exp = exposure(after[i].q, l.quote.P, l.asset.L, l.asset.type, mets[i].dir);
    buyRisk += q * d;
  };
  const riskAfter = (stopOverride = {}) =>
    buyRisk +
    legs.reduce((s, l, i) => {
      const m = mets[i];
      if (!m.ok || after[i].q0 <= 0) return s;
      // sem stop gravado conta o stop sugerido; sem ele, o valor inteiro (como portfolioMetrics)
      const st = stopOverride[i] ?? l.stop ?? m.stopSug;
      return (
        s + (fin(st) ? Math.max(0, m.dir * (l.avg - st) * after[i].q0) : after[i].q0 * l.quote.P)
      );
    }, 0);
  const sizeMult = (eventToday ? p.evento_tamanho_mult : 1) * (input.weeklyLossHit ? 0.5 : 1);
  // tamanho calculado com as reduções sugeridas já feitas (prévia); a compra só libera depois de executá-las
  const pendingRed = orders.some((o) => o.purpose === "REDUZIR" || o.purpose === "ZERAR");
  const redBlk = pendingRed ? [{ id: "ORDEM", why: "execute antes as reduções sugeridas" }] : [];

  for (const { info, iL, iS, pr } of pairsOut) {
    const stopOverride = {};
    if (info.p3) stopOverride[info.p3.winner] = legs[info.p3.winner].avg;
    const pairBlk = info.suspended ? [{ id: "P0-P2", why: "saída de risco ativa no par" }] : [];
    for (const i of [iL, iS]) {
      if (i < 0 || decided.has(i)) continue;
      const leg = legs[i];
      const m = mets[i];
      if (!m.ok || !m.canSize) continue;
      const u = leg.under ?? {};
      if (m.qty > 0) {
        if (m.pnlR < p.pyramiding_r_minimo) continue; // sem gatilho 1: manter
        const opp = i === iL ? iS : iL;
        const pendingP3 = info.p3 && info.p3.winner === i;
        const oppositeReduced = pendingP3 ? false : (day.reduced?.[pr.id] ?? []).includes(legs[opp]?.sym); // prettier-ignore
        let pyr;
        try {
          pyr = qPyramiding({ capital, q: m.qty, pm: leg.avg, stopAtual: stopOverride[i] ?? leg.stop ?? leg.avg, ultimoLote: leg.lastLot ?? m.qty, P: leg.quote.P, L: leg.asset.L, type: leg.asset.type, dir: m.dir, atr: u.atrIntra, S: u.S, expLiq: totLiq(), expBruta: totBruta(), riscoTotal: riskAfter(stopOverride), teto: pf.teto, mult: input.weeklyLossHit ? 0.5 : 1, p }); // prettier-ignore
        } catch (e) {
          errors.push({ id: "EXE-01", sym: leg.sym, why: e.message });
          continue;
        }
        const riskNow = Math.max(
          0,
          m.dir * (leg.avg - (stopOverride[i] ?? leg.stop ?? leg.avg)) * m.qty,
        );
        const chk = pyramidChecklist({ m, under: u, oppositeReduced, lot: pyr.q, lastLot: leg.lastLot ?? m.qty, riskAfter: riskNow + pyr.q * pyr.d, R, addsToday: day.adds?.[leg.sym], minET, cutMin, session, corr: pr.corr, p }); // prettier-ignore
        const blk = [
          ...pairBlk,
          ...blockers,
          ...legBuyBlockers(leg, m, "AUMENTAR", { session, now, day, p }),
        ];
        if (pendingP3) blk.unshift({ id: "P6", why: "aguarda reduzir a perdedora" });
        else blk.push(...redBlk);
        for (const c of chk) if (!c.ok && !(pendingP3 && c.id === "oposta")) blk.push({ id: "DEC-03", why: `gatilho: ${c.id}` }); // prettier-ignore
        if (fin(pr.corr) && pr.corr < p.correlacao_min_par) blk.push({ id: "PAR-01", why: "correlação abaixo do mínimo" }); // prettier-ignore
        const dv = directional(legs, after, i, pyr.q, pr, capital, dirPlan(input, pr), p);
        if (dv?.bloqueia) blk.push({ id: "PAR-01", why: `desvio direcional ${dv.efetivo}x` });
        if (pyr.q > 0) {
          const cur = stopOverride[i] ?? leg.stop;
          const stop = fin(cur)
            ? pyRound(stopVigente(cur, leg.quote.P, pyr.d, m.dir), 2)
            : pyr.stop; // nunca afrouxa
          order(i, "AUMENTAR", "P6", pyr.q, { stop, episode: `P6#${day.adds?.[leg.sym] ?? 0}`, alert: blk.length ? "DEC-03" : null, blockers: dedupe(blk), note: `trava: ${pyr.trava}` }); // prettier-ignore
          orders.at(-1).checklist = chk;
          take(i, pyr.q, pyr.d);
        }
      } else {
        // P7: sem posição, gatilho do plano = rompimento confirmado a favor e lado certo da VWAP
        const favorDir = m.favor === 1 ? "up" : "down";
        if (!(u.breakout?.dir === favorDir && m.vwapSide === "a favor")) continue;
        let ent;
        try {
          ent = qEntrada({ capital, P: leg.quote.P, L: leg.asset.L, type: leg.asset.type, dir: m.dir, atr: u.atrIntra, S: u.S, expLiq: totLiq(), expBruta: totBruta(), riscoTotal: riskAfter(stopOverride), teto: pf.teto, sessao: session, mult: sizeMult, p }); // prettier-ignore
        } catch (e) {
          errors.push({ id: "EXE-01", sym: leg.sym, why: e.message });
          continue;
        }
        const blk = [
          ...pairBlk,
          ...redBlk,
          ...blockers,
          ...legBuyBlockers(leg, m, "ENTRAR", { session, now, day, p }),
        ];
        if (fin(u.gap?.atr) && Math.abs(u.gap.atr) > p.gap_max_atr && !u.or?.done) blk.push({ id: "PRE-03", why: "gap grande: só depois da faixa de abertura" }); // prettier-ignore
        if (session === "REGULAR" && !u.or?.done) blk.push({ id: "INT-01", why: "faixa de abertura em formação" }); // prettier-ignore
        const dv = directional(legs, after, i, ent.q, pr, capital, dirPlan(input, pr), p);
        if (dv?.bloqueia) blk.push({ id: "PAR-01", why: `desvio direcional ${dv.efetivo}x` });
        if (ent.q === 0)
          blk.push({ id: "RSK-04", why: "sem espaço de risco, exposição ou concentração" });
        order(i, "ENTRAR", "P7", ent.q, { stop: ent.stop, alert: "INT-02", blockers: dedupe(blk), episode: `P7#${day.entries ?? 0}` }); // prettier-ignore
        take(i, ent.q, ent.d);
      }
    }
  }

  orders.sort((a, b) => PRI.indexOf(a.reason) - PRI.indexOf(b.reason) || a.blocked - b.blocked);
  return {
    ok: true,
    errors,
    orders,
    stopMoves,
    pairs: pairsOut.map((x) => x.info),
    legs: mets.map((m, i) => ({ ...m, pairId: legs[i].pairId, legKind: legs[i].legKind, action: decided.get(i) ?? "P8" })), // prettier-ignore
    portfolio: { ...pf, flags },
    blockers,
  };
}

const dirPlan = (input, pr) => input.plan?.pairs?.[pr.id]?.dirPlan ?? 0;

/** Desvio direcional do par COM a ordem proposta (q cotas a mais na ponta i). */
function directional(legs, after, i, q, pr, capital, planned, p) {
  const betas = pr.betas ?? {};
  const pontas = [];
  for (const [j, l] of legs.entries()) {
    if (l.pairId !== pr.id || !l.asset?.ok) continue;
    const b = betas[l.asset.under];
    if (!fin(b)) return null;
    const qq = after[j].q + (j === i ? q : 0);
    pontas.push([exposure(qq, l.quote.P, l.asset.L, l.asset.type, l.dir === -1 ? -1 : 1), b]);
  }
  if (!pontas.length) return null;
  const ef = pontas.reduce((s, [e, b]) => s + e * b, 0) / capital;
  return { efetivo: pyRound(ef, 2), bloqueia: Math.abs(ef - planned) > p.desvio_direcional_max_x_capital }; // prettier-ignore
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((b) => {
    const k = `${b.id}|${b.why}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
