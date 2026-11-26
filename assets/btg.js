// Contas BTG na aba Carteira (puro, testado). A foto vem da tabela pendulo_broker, gravada pela
// sincronização (ver docs/BTG-PONTE.md); o app só lê. Valores como o BTG informou; o internacional usa
// o preço ao vivo quando a carteira tem cotação (mesma conta da tabela de posições).
import { cls, esc, fmtDT, num } from "./format.js";

/** Sem foto nova há mais que isso (cobre o fim de semana) = aviso de dado velho. */
export const BTG_STALE_MS = 96 * 3600 * 1000;

/** Horário de cotação em segundos ou milissegundos → Date. */
const toDate = (t) => (fin(t) ? new Date(+t < 1e12 ? +t * 1000 : +t) : null);
const fin = (x) => (Number.isFinite(+x) && x !== null && x !== "" ? +x : null);

/** Clique dentro da espera de 3 min cuja leitura já gravou: não há foto nova a aguardar. */
export function btgFireDone(fire) {
  const since = Date.parse(fire?.since ?? "");
  const synced = Date.parse(fire?.syncedAt ?? "");
  return !!fire?.already && Number.isFinite(since) && Number.isFinite(synced) && synced >= since;
}

/** Ajuste manual vale enquanto não chega foto do BTG mais nova que a usada como base. */
export function manualActive(row, manual) {
  if (!manual?.baseAsOf) return false;
  const base = Date.parse(manual.baseAsOf);
  const at = Date.parse(row?.asOf ?? row?.summary?.asOf ?? "");
  return Number.isFinite(base) && (!Number.isFinite(at) || at <= base);
}

/**
 * Foto do BTG com o ajuste manual por cima (quando a leitura automática falha). holdings: posições da
 * Carteira (editadas à mão viram as posições internacionais); manual: { baseAsOf, at, items, cashUsd }.
 * Sem ajuste ativo devolve a própria foto. Foto nova do BTG (asOf > baseAsOf) descarta o ajuste sozinha.
 */
export function withManual(row, holdings = [], manual = null) {
  const s = row?.summary;
  if (!s?.offshore || !s?.onshore || !manualActive(row, manual)) return row;
  const snap = new Map((s.offshore.positions ?? []).map((p) => [p.sym, p]));
  const positions = (holdings ?? []).map((h) => {
    const p = snap.get(h.sym);
    if (p && fin(p.qty) === fin(h.qty) && fin(p.avg) === fin(h.avg)) return p;
    const price = fin(h.invPrice) ?? fin(p?.price) ?? fin(h.avg);
    const qty = fin(h.qty);
    return { sym: h.sym, qty, avg: fin(h.avg), price, value: qty != null && price != null ? qty * price : null }; // prettier-ignore
  });
  const cashUsd = fin(manual.cashUsd) ?? fin(s.offshore.cashUsd) ?? 0;
  const investedUsd = positions.reduce((a, p) => a + (fin(p.value) ?? 0), 0);
  const totalUsd = investedUsd + cashUsd;
  const fx = fin(s.offshore.totalUsd) > 0 && fin(s.offshore.totalBrl) != null ? s.offshore.totalBrl / s.offshore.totalUsd : fin(s.fx?.ptax); // prettier-ignore
  const items = Array.isArray(manual.items) ? manual.items : (s.onshore.items ?? []);
  const onTotal = Array.isArray(manual.items) ? items.reduce((a, i) => a + (fin(i.value) ?? 0), 0) : s.onshore.total; // prettier-ignore
  return {
    ...row,
    manual: { at: manual.at ?? null, baseAsOf: manual.baseAsOf },
    summary: {
      ...s,
      onshore: { ...s.onshore, items, total: onTotal },
      offshore: { ...s.offshore, positions, cashUsd, investedUsd, totalUsd, totalBrl: fx ? totalUsd * fx : s.offshore.totalBrl }, // prettier-ignore
    },
  };
}

/** Novo ajuste manual sobre a foto atual (mantém o que já foi ajustado nela). */
export function nextManual(row, manual, patch) {
  const base = manualActive(row, manual) ? manual : { baseAsOf: row?.asOf ?? row?.summary?.asOf ?? new Date().toISOString() }; // prettier-ignore
  return { ...base, ...patch, at: new Date().toISOString() };
}

/** Classe do produto do Brasil pelo nome que o BTG devolve. */
export function onshoreClass(name) {
  const s = String(name ?? "");
  if (/tr[aâ]nsito|saldo|conta (corrente|investimento)/i.test(s)) return "Caixa";
  if (/\b(FI|FIM|FIA|FIC|FICFI|FII|FIDC|RL)\b|fundo|cambial|multimercado|previd/i.test(s)) return "Fundos"; // prettier-ignore
  if (/\b(CDB|LCI|LCA|LIG|CRI|CRA|LF|COE)\b|deb[eê]nture|tesouro|NTN|LTN|CDI|IPCA|pr[eé]-?fixado/i.test(s)) return "Renda fixa"; // prettier-ignore
  return "Outros";
}

/**
 * row: linha de pendulo_broker no formato do app. live: { SYM: { price, dayPL, dayPLPct, quoteTime } } (preço
 * ao vivo da carteira). fxq: cotação ao vivo do dólar (BRL=X, { p, t }); sem ela, o câmbio implícito da foto.
 */
export function brokerView(row, now = Date.now(), live = {}, fxq = null) {
  const s = row?.summary;
  if (!s?.offshore || !s?.onshore) return null;
  const onshore = fin(s.onshore.total);
  const offshoreBrl = fin(s.offshore.totalBrl);
  const offshoreUsd = fin(s.offshore.totalUsd);
  const totalBrl = onshore != null && offshoreBrl != null ? onshore + offshoreBrl : null; // como na foto
  const fxLive = fin(fxq?.p) > 0 ? fin(fxq.p) : null;
  const fx =
    fxLive ??
    (offshoreUsd > 0 && offshoreBrl != null ? offshoreBrl / offshoreUsd : fin(s.fx?.ptax));
  const at = Date.parse(row.asOf ?? s.asOf);
  const items = (s.onshore.items ?? [])
    .map((i, idx) => {
      const value = fin(i.value);
      const cost = fin(i.cost);
      const pl = value != null && cost != null ? value - cost : null;
      const due = String(i.name ?? "").match(/(\d{4})-(\d{2})-(\d{2})/);
      return {
        idx,
        name: String(i.name ?? ""),
        kind: onshoreClass(i.name),
        value,
        cost,
        pl,
        plPct: pl != null && cost > 0 ? pl / cost : null,
        due: due ? `${due[3]}/${due[2]}/${due[1]}` : null,
        date: i.date ?? null,
        wLocal: onshore > 0 && value != null ? value / onshore : null,
      };
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const positions = offshorePositions(s.offshore, live);
  const cashUsd = fin(s.offshore.cashUsd);
  const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] ?? 0), 0);
  const invested = positions.length ? sum(positions, "value") : (fin(s.offshore.investedUsd) ?? 0); // foto sem quebra: total
  const cost = sum(positions, "cost");
  const dayRows = positions.filter((p) => p.dayPL != null);
  const dayPL = dayRows.length ? sum(dayRows, "dayPL") : null;
  const onCostRows = items.filter((i) => i.cost != null);
  const onPL = onCostRows.length ? sum(onCostRows, "pl") : null;
  const onCost = onCostRows.length ? sum(onCostRows, "cost") : null;
  // patrimônio agora: Brasil da foto + internacional a preço e dólar ao vivo
  const offLiveUsd = invested + (cashUsd ?? 0);
  const liveTotalBrl = fx && onshore != null ? onshore + offLiveUsd * fx : totalBrl;
  for (const i of items)
    i.wTotal = liveTotalBrl > 0 && i.value != null ? i.value / liveTotalBrl : null;
  for (const p of positions) p.wTotal = liveTotalBrl > 0 && p.value != null && fx ? (p.value * fx) / liveTotalBrl : null; // prettier-ignore
  // mistura por classe, em reais, sobre o patrimônio total
  const mix = {};
  for (const i of items) mix[i.kind] = (mix[i.kind] ?? 0) + (i.value ?? 0);
  if (fx) {
    mix["Ações e ETFs EUA"] = invested * fx;
    mix["Caixa US$"] = (cashUsd ?? 0) * fx;
  }
  const mixTotal = Object.values(mix).reduce((a, x) => a + x, 0);
  return {
    asOf: Number.isFinite(at) ? new Date(at) : null,
    stale: !Number.isFinite(at) || now - at > BTG_STALE_MS,
    rejected: row.status === "rejected" ? row.statusDetail || "leitura recusada" : null,
    manual: row.manual ?? null,
    totalBrl,
    liveTotalBrl,
    onshore,
    offshoreBrl,
    offshoreUsd,
    investedUsd: fin(s.offshore.investedUsd),
    cashUsd,
    ptax: fin(s.fx?.ptax),
    ptaxDate: s.fx?.date ?? null,
    fx,
    fxLive,
    fxAt: fxLive != null ? toDate(fxq?.t) : null,
    liveCount: positions.filter((p) => p.live).length,
    liveAt: positions.reduce(
      (m, p) => (p.quoteTime && (!m || p.quoteTime > m) ? p.quoteTime : m),
      null,
    ),
    items,
    positions,
    offPL: positions.length ? invested - cost : null,
    offPLPct: cost > 0 ? (invested - cost) / cost : null,
    offCost: cost,
    offLiveUsd,
    dayPL,
    dayPLPct: dayPL != null && invested - dayPL > 0 ? dayPL / (invested - dayPL) : null,
    onPL,
    onPLPct: onCost > 0 ? onPL / onCost : null,
    onCostCount: onCostRows.length,
    mix: Object.entries(mix)
      .filter(([, x]) => x > 0)
      .map(([k, x]) => ({ k, brl: x, w: mixTotal > 0 ? x / mixTotal : 0 }))
      .sort((a, b) => b.brl - a.brl),
  };
}

/** Internacional por ativo, do maior para o menor. Resultado sobre o custo informado pelo BTG. */
function offshorePositions(off, live) {
  const total = fin(off.totalUsd);
  return (off.positions ?? [])
    .map((p) => {
      const [qty, avg, btgPrice, btgValue] = [p.qty, p.avg, p.price, p.value].map(fin);
      const q = live?.[p.sym];
      const livePx = fin(q?.price);
      const price = livePx ?? btgPrice;
      const value = livePx != null && qty != null ? qty * livePx : btgValue;
      const cost = fin(p.cost) ?? (qty != null && avg != null ? qty * avg : null);
      const pl = value != null && cost != null ? value - cost : null;
      return {
        sym: String(p.sym ?? ""),
        qty,
        avg,
        price,
        live: livePx != null,
        value,
        cost,
        weight: total > 0 && value != null ? value / total : null,
        pl,
        plPct: pl != null && cost > 0 ? pl / cost : null,
        dayPL: fin(q?.dayPL),
        dayPLPct: fin(q?.dayPLPct),
        quoteTime: livePx != null ? toDate(q?.quoteTime) : null,
      };
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

/** Evolução pelas fotos guardadas (pendulo_broker_hist). Variação inclui aportes, resgates e câmbio. */
export function brokerHistory(hist = []) {
  const pts = hist
    .map((h) => ({ at: Date.parse(h.as_of ?? h.asOf), brl: fin(h.total_brl ?? h.totalBrl) }))
    .filter((h) => Number.isFinite(h.at) && h.brl != null)
    .sort((a, b) => a.at - b.at);
  if (pts.length < 2) return { pts, prev: null, first: null };
  const last = pts.at(-1);
  const delta = (base) => ({ at: new Date(base.at), d: last.brl - base.brl, pct: base.brl > 0 ? last.brl / base.brl - 1 : null }); // prettier-ignore
  return { pts, prev: delta(pts.at(-2)), first: delta(pts[0]) };
}

const brl = (x, d = 2) => (x == null ? "–" : `${x < 0 ? "−" : ""}R$ ${num(Math.abs(x), d)}`);
const usd = (x, d = 2) => (x == null ? "–" : `${x < 0 ? "−" : ""}US$ ${num(Math.abs(x), d)}`);
const sgn = (x, f) => (x == null ? "–" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${f(Math.abs(x))}`);
const sBrl = (x) => sgn(x, (a) => `R$ ${num(a, 2)}`);
const sUsd = (x) => sgn(x, (a) => `US$ ${num(a, 2)}`);
const pctTxt = (x, d = 1) => (x == null ? "–" : `${num(x * 100, d)}%`);
const sPct = (x, d = 1) => sgn(x, (a) => `${num(a * 100, d)}%`);
const brDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "–");
const MIX_TONE = { "Renda fixa": 1, Fundos: 2, Caixa: 3, Outros: 4, "Ações e ETFs EUA": 5, "Caixa US$": 6 }; // prettier-ignore

/** Botão da barra de posições. */
export function btgButton(sync, now = Date.now()) {
  const busy = !!sync?.busy;
  const secs = busy && sync.startedAt ? Math.max(0, Math.round((now - sync.startedAt) / 1000)) : 0;
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return `<button class="btn small" data-action="btg-refresh" ${busy ? 'disabled aria-busy="true"' : ""} title="Buscar agora posições e valores no BTG (leitura na nuvem, ~1–2 min; desiste em 4 min com o motivo)">${busy ? `Lendo o BTG na nuvem… ${clock}` : "Atualizar BTG"}</button>`; // prettier-ignore
}

/**
 * Contas BTG: topo da Carteira (`kpis`: patrimônio → régua Brasil × exterior → dois cartões → faixa "Exterior hoje"; ver docs/design/CARTEIRA-TOPO.md) e faixa com status e mistura por classe (`card`).
 * As posições saem nas tabelas da Carteira, com filtro, ordenação e colunas iguais nos dois lados.
 */
export function btgParts(
  row,
  now = Date.now(),
  {
    live = {},
    hist = [],
    fx = null,
    sync = null,
    sessionCells = "",
    sessionClock = "",
    marketOpen = false,
  } = {},
) {
  const v = brokerView(row, now, live, fx);
  if (!v) return null;
  const h = brokerHistory(hist);
  const manualWarn = v.manual
    ? `<p class="pf-btg-warn">✎ Ajuste manual sobre a foto de ${v.asOf ? fmtDT(v.asOf) : "–"}${v.manual.at ? ` (editado ${fmtDT(new Date(v.manual.at))})` : ""}. Some sozinho na próxima leitura do BTG. <button class="btn small" data-action="btg-manual-clear">Descartar ajustes</button></p>`
    : "";
  const warn = v.rejected
    ? `<p class="pf-btg-warn">⚠ Última leitura recusada (${esc(v.rejected)}). A carteira segue com a foto anterior.</p>`
    : v.stale
      ? `<p class="pf-btg-warn">⚠ Foto do BTG com mais de 4 dias.</p>`
      : "";
  const hm = (d) =>
    d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  const liveTxt = v.liveCount
    ? `<span class="pf-btg-live">● ao vivo</span> ${v.liveCount}/${v.positions.length} ativos${v.liveAt ? ` às ${hm(v.liveAt)}` : ""} · dólar ${v.fxLive != null ? `${num(v.fxLive, 4)}${v.fxAt ? ` às ${hm(v.fxAt)}` : ""}` : `da foto ${num(v.fx, 4)}`}`
    : `sem cotação ao vivo · dólar ${v.fxLive != null ? num(v.fxLive, 4) : `da foto ${num(v.fx, 4)}`}`;
  const shareOn = v.liveTotalBrl > 0 ? v.onshore / v.liveTotalBrl : null;
  const ddmm = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  // variação do patrimônio pelas fotos do BTG (inclui aportes, resgates e câmbio): só a data, sem jargão
  const since = (x) => `<span class="pf-chg" title="${sBrl(x.d)} desde ${fmtDT(x.at)} (inclui aportes, resgates e câmbio)"><b class="${cls(x.d)}">${sPct(x.pct, 2)}</b> desde ${ddmm(x.at)}</span>`; // prettier-ignore
  const chg = [h.prev && since(h.prev), h.first && h.pts.length > 2 && since(h.first)].filter(Boolean).join('<span class="pf-dot">·</span>'); // prettier-ignore
  const offBrl = v.fx ? v.offLiveUsd * v.fx : v.offshoreBrl;
  const split = shareOn != null
    ? `<div class="pf-split" role="img" aria-label="${pctTxt(shareOn, 0)} no Brasil, ${pctTxt(1 - shareOn, 0)} no exterior"><span class="br" style="flex:${shareOn.toFixed(4)}"></span><span class="ex" style="flex:${(1 - shareOn).toFixed(4)}"></span></div>`
    : ""; // prettier-ignore
  const side = (k, name, w, val, sub, title = "") =>
    `<div class="pf-sk ${k}"${title ? ` title="${title}"` : ""}><span class="lab"><i></i>${name}${w != null ? ` <em>${pctTxt(w, 0)}</em>` : ""}</span><b>${val}</b><small>${sub}</small></div>`; // prettier-ignore
  const brSub = v.onPL != null
    ? `<span class="${cls(v.onPL)}">${sBrl(v.onPL)}</span> rendimento`
    : `${v.items.length} produtos`; // prettier-ignore
  const brTitle = v.onPL != null ? `Rendimento sobre o aplicado em ${v.onCostCount} de ${v.items.length} produtos (os demais não informam o aplicado)` : ""; // prettier-ignore
  const offSub = v.offPLPct != null
    ? `<span class="${cls(v.offPL)}">${sPct(v.offPLPct, 2)}</span> s/ custo · ${brl(offBrl, 0)}`
    : brl(offBrl, 0); // prettier-ignore
  const dayCell = v.dayPL != null
    ? `<div class="pf-sc"><small>${marketOpen ? "Hoje · ao vivo" : "Último pregão"}</small><b class="${cls(v.dayPL)}">${sPct(v.dayPLPct, 2)}</b><small>${sUsd(v.dayPL)}</small></div>`
    : ""; // prettier-ignore
  const sess = dayCell || sessionCells
    ? `<div class="pf-sess"><div class="pf-sess-h"><span class="lab">Exterior hoje</span>${sessionClock ? `<small>${sessionClock}</small>` : ""}</div><div class="pf-sess-c">${dayCell}${sessionCells}</div></div>`
    : ""; // prettier-ignore
  const kpis = `<div class="pf-kpis pf-btg-kpis">
    <div class="pf-hero"><span class="lab">Patrimônio</span><b>${brl(v.liveTotalBrl, 0)}</b>${chg ? `<div class="pf-chgs">${chg}</div>` : ""}</div>
    ${split}
    <div class="pf-sides">
      ${side("br", "🇧🇷 Brasil", shareOn, brl(v.onshore, 0), brSub, brTitle)}
      ${side("ex", "🌎 Exterior", shareOn == null ? null : 1 - shareOn, usd(v.offLiveUsd, 0), offSub, `${v.positions.length} ativos · resultado sobre o custo de compra`)}
    </div>
    ${sess}
  </div>`; // prettier-ignore
  const mix = v.mix.length
    ? `<div class="pf-btg-mix" role="img" aria-label="Patrimônio por classe: ${v.mix.map((m) => `${esc(m.k)} ${pctTxt(m.w)}`).join(", ")}">${v.mix.map((m) => `<span class="mx t${MIX_TONE[m.k] ?? 4}" style="flex:${m.w.toFixed(4)}" title="${esc(m.k)} · ${brl(m.brl, 0)} · ${pctTxt(m.w)}"></span>`).join("")}</div>
      <ul class="pf-btg-leg">${v.mix.map((m) => `<li><i class="mx t${MIX_TONE[m.k] ?? 4}"></i>${esc(m.k)} <b>${pctTxt(m.w)}</b> <small class="muted">${brl(m.brl, 0)}</small></li>`).join("")}</ul>`
    : ""; // prettier-ignore
  const card = `<section class="card pf-btg" aria-label="Contas BTG">
    <div class="pf-btg-head"><span class="lab">Contas BTG</span><small class="muted">${liveTxt} · foto do BTG de ${v.asOf ? fmtDT(v.asOf) : "–"}</small><span class="pf-btg-act">${btgButton(sync)}</span></div>
    ${warn}${manualWarn}
    ${mix}
  </section>`;
  return { v, kpis, card };
}

const two = (top, bottom, tone = "") =>
  `<span class="c2 ${tone}">${top}</span><small class="c2s ${tone}">${bottom}</small>`;

/** Carteira Brasil no mesmo desenho da internacional (classes .pf-t, colunas e filtro iguais). */
export function brazilTable(v, hide = []) {
  const off = new Set(hide);
  const hideCls = [...off].map((k) => ` hide-${k}`).join("");
  const mCols = ["val", "tot"].filter((k) => !off.has(k)).length;
  const mGrid = `minmax(0, 1fr)${" minmax(max-content, 1fr)".repeat(mCols)}`;
  const rows = v.items
    .map((i) => `<tr>
      <td class="c-sym"><span class="tk pf-prod">${esc(i.name)}</span> <button class="pf-edit" data-action="btg-item-edit" data-idx="${i.idx}" title="Editar produto" aria-label="Editar ${esc(i.name)}">✎</button><small class="c2s nm">${esc(i.kind)}${i.due ? ` · vence ${esc(i.due)}` : ""}</small></td>
      <td class="num c-qty">${two(i.cost != null ? brl(i.cost) : "–", i.due ?? "–")}</td>
      <td class="num c-px">${two(esc(i.kind), brDate(i.date))}</td>
      <td class="num c-val">${two(brl(i.value), pctTxt(i.wLocal))}</td>
      <td class="num c-tot">${i.pl != null ? two(sBrl(i.pl), sPct(i.plPct), cls(i.pl)) : two("–", "–")}</td></tr>`)
    .join(""); // prettier-ignore
  return `<div class="tw pf-tw2"><table class="pf-t pf-t-br${hideCls}" data-sortable="pfbr" data-tt-filter style="--pf-gc: ${mGrid}"><thead><tr><th class="c-sym">Produto</th><th class="num c-qty">Aplicado · vence</th><th class="num c-px">Classe · posição</th><th class="num c-val">Valor · peso</th><th class="num c-tot">Total</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td class="c-sym"><b>Total</b></td><td class="c-qty"></td><td class="c-px"></td><td class="num c-val">${two(`<b>${brl(v.onshore)}</b>`, "100%")}</td><td class="num c-tot">${v.onPL != null ? two(sBrl(v.onPL), sPct(v.onPLPct), cls(v.onPL)) : ""}</td></tr></tfoot></table></div>`; // prettier-ignore
}
