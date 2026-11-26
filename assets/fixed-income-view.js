// Carteira › 🇧🇷 Renda fixa: compara CDB, LCI, LCA, Tesouro, CRI/CRA, debêntures, fundo DI e poupança
// para o mesmo valor e prazo (bruto, impostos e líquido). Contas puras em fixed-income.js.
// CDI, Selic e IPCA esperado vêm do BCB (api/yields?br=1, o mesmo do Onshore) e podem ser editados.
import { DEFAULT_PRODUCTS, IDX, KINDS, TERMS, compare, grossUp, idxFor, irRate } from "./fixed-income.js"; // prettier-ignore
import { FREQS, IDX_BOND, parseSchedule, yieldToWorst } from "./bond-yield.js";
import { decSep, esc, num, pct } from "./format.js";
import { fetchJSON } from "./net.js";
import { parseNumber } from "./portfolio.js";
import { hooks, savePrefs, state } from "./state.js";

const MAX = 20;
const FALLBACK = { cdi: 14.9, selic: 15, ipca: 4.2, tr: 1.5 };
let macroAt = 0;

function loadMacro() {
  if (state.br?.macro || Date.now() - macroAt < 10 * 60000) return;
  macroAt = Date.now();
  fetchJSON("api/yields?br=1", { bg: true })
    .then((r) => {
      state.br ??= { hist: {}, quotes: {}, macro: null, errors: {} };
      state.br.macro = r;
      if (state.prefs.tab === "rfix") hooks.render();
    })
    .catch(() => {});
}

/** Valores do BCB (CDI, Selic, IPCA esperado 12m). */
function liveMacro() {
  const ind = state.br?.macro?.indicators ?? [];
  const v = (id) => ind.find((x) => x.id === id) ?? null;
  return { cdi: v("cdi"), selic: v("selic"), ipca: v("exp12") ?? v("ipca12") };
}

const cfg = () => {
  const c = (state.prefs.rfx ??= {});
  c.amount ??= 100000;
  c.days ??= 365;
  c.products ??= DEFAULT_PRODUCTS.map((p) => ({ ...p }));
  c.over ??= {};
  return c;
};

function macroNow() {
  const live = liveMacro();
  const o = cfg().over;
  const pick = (k) => (Number.isFinite(o[k]) ? o[k] : (live[k]?.value ?? FALLBACK[k]));
  return { cdi: pick("cdi"), selic: pick("selic"), ipca: pick("ipca"), tr: Number.isFinite(o.tr) ? o.tr : FALLBACK.tr }; // prettier-ignore
}

const brl = (x, d = 2) => (Number.isFinite(x) ? `R$ ${num(x, d)}` : "–");
const dec = (x, d = 2) => (Number.isFinite(x) ? num(x, d) : "");
const termTxt = (d) => TERMS.find(([n]) => n === d)?.[1] ?? `${d} dias`;
const rateTxt = (r) =>
  r.idx === "cdi" ? `${num(r.rate, 1)}% do CDI`
  : r.idx === "cdis" ? `CDI + ${num(r.rate, 2)}%`
  : r.idx === "pre" ? `${num(r.rate, 2)}% a.a.`
  : r.idx === "ipca" ? `IPCA + ${num(r.rate, 2)}%`
  : r.idx === "selic" ? `Selic + ${num(r.rate, 2)}%`
  : "0,5% a.m. + TR".replace(",", decSep()); // prettier-ignore
const taxTag = (r) =>
  r.tax === "free" ? `<span class="tag ok">isento de IR</span>`
  : r.tax === "fund" ? `<span class="tag">come-cotas</span>`
  : `<span class="tag">IR ${num(r.irRate * 100, 1)}%</span>`; // prettier-ignore

function editRow(p, i) {
  const kinds = Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === p.kind ? "selected" : ""}>${esc(v.label)}</option>`).join(""); // prettier-ignore
  const ids = idxFor(p.kind);
  const idx = ids.includes(p.idx) ? p.idx : ids[0];
  const idxSel = ids.length > 1
    ? `<select class="rfx-in" data-rfx-field="idx" data-i="${i}" aria-label="Indexador">${ids.map((k) => `<option value="${k}" ${k === idx ? "selected" : ""}>${esc(IDX[k])}</option>`).join("")}</select>`
    : `<span class="muted small">${esc(IDX[idx])}</span>`; // prettier-ignore
  const rateIn = idx === "poup" ? `<span class="muted small">regra legal</span>` : `<input class="rfx-in rfx-rate" data-rfx-field="rate" data-i="${i}" value="${esc(dec(Number(p.rate), 2))}" inputmode="decimal" aria-label="Taxa" />`; // prettier-ignore
  return `<tr>
    <td><select class="rfx-in" data-rfx-field="kind" data-i="${i}" aria-label="Produto">${kinds}</select></td>
    <td>${idxSel}</td>
    <td class="num">${rateIn}</td>
    <td><input class="rfx-in rfx-name" data-rfx-field="name" data-i="${i}" value="${esc(p.name ?? "")}" placeholder="emissor (opcional)" aria-label="Nome" /></td>
    <td><button type="button" class="btn ghost" data-rfx-act="del" data-i="${i}" aria-label="Remover">✕</button></td></tr>`;
}

// --- Preço → taxa (YTM e YTW) ---
const todaySP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const ytwCfg = () => {
  const y = (cfg().ytw ??= {});
  y.idx ??= "pre";
  y.coupon ??= 12;
  y.freq ??= 6;
  y.maturity ??= "";
  y.settle ??= "";
  y.price ??= 100;
  y.calls ??= "";
  y.amort ??= "";
  return y;
};
const bondRate = (idx, r) =>
  !Number.isFinite(r) ? "–"
  : idx === "pcdi" ? `${num(r, 2)}% do CDI`
  : idx === "cdis" ? `CDI + ${num(r, 2)}%`
  : idx === "ipca" ? `IPCA + ${num(r, 2)}%`
  : `${num(r, 2)}% a.a.`; // prettier-ignore
const brDate = (d) => (d ? d.split("-").reverse().join("/") : "");

/** Conferência do que foi lido da colagem: quantas datas, soma das amortizações e quantas já passaram. */
function schedLine(calls, amort, settle) {
  const a = amort.list;
  const parts = [];
  if (calls.list.length) parts.push(`${calls.list.length} ${calls.list.length === 1 ? "resgate lido" : "resgates lidos"}`); // prettier-ignore
  if (a.length) {
    const sum = a.reduce((x, y) => x + y.v, 0);
    const past = a.filter((x) => x.date <= settle);
    const paid = past.reduce((x, y) => x + y.v, 0);
    parts.push(`${a.length} ${a.length === 1 ? "amortização lida" : "amortizações lidas"} (${esc(brDate(a[0].date))} a ${esc(brDate(a.at(-1).date))}) · soma ${num(sum, 2)}%`); // prettier-ignore
    if (past.length) parts.push(`${past.length} já paga${past.length === 1 ? "" : "s"} até a liquidação (${num(paid, 2)}%): saldo de ${num(100 - paid, 2)}%`); // prettier-ignore
    if (sum < 99.5)
      parts.push(`<span class="warn-txt">⚠ a soma não fecha 100%: o restante (${num(100 - sum, 2)}%) é pago no vencimento. Confira se a escritura dá o % sobre o valor nominal de emissão (o que a calculadora usa) e não sobre o saldo</span>`); // prettier-ignore
  }
  return parts.length ? `<p class="small muted" data-keep>${parts.join(" · ")}</p>` : ""; // data-keep: é dado, não vira "i"
}

function ytwCard(m) {
  const y = ytwCfg();
  const settle = y.settle || todaySP();
  const calls = parseSchedule(y.calls);
  const amort = parseSchedule(y.amort);
  const r = y.maturity ? yieldToWorst({ idx: y.idx, coupon: y.coupon, freq: y.freq, maturity: y.maturity, settle, price: y.price, cdi: m.cdi, calls: calls.list, amort: amort.list }) : null; // prettier-ignore
  const opt = (list, cur) => list.map(([k, v]) => `<option value="${k}" ${String(k) === String(cur) ? "selected" : ""}>${esc(v)}</option>`).join(""); // prettier-ignore
  const inp = (k, label, val, extra = "") => `<label>${label}<input class="rfx-in" data-rfx-field="y" data-k="${k}" value="${esc(val)}" ${extra} /></label>`; // prettier-ignore
  const couponLabel = y.idx === "pcdi" ? "Taxa da emissão (% do CDI)" : y.idx === "cdis" ? "Spread da emissão (% a.a.)" : "Cupom da emissão (% a.a.)"; // prettier-ignore
  const bad = [...calls.bad, ...amort.bad];
  let out = "";
  if (!y.maturity) out = `<p class="muted">Informe o vencimento e o preço para calcular.</p>`;
  else if (r?.error) out = `<p class="warn-txt">⚠ ${esc(r.error)}</p>`;
  else if (r) {
    const w = r.worst;
    const rows = r.rows
      .map(
        (x) =>
          `<tr class="${x === w ? "rfx-best" : ""}"><td>${x.kind === "call" ? `Resgate antecipado a ${num(x.price, 2)}%` : "Vencimento"}${x === w ? ` <span class="tag">pior</span>` : ""}</td><td>${esc(brDate(x.date))}</td><td class="num">${num(x.years, 2)} anos<div class="muted small">${x.du} DU</div></td><td class="num"><b>${esc(bondRate(y.idx, x.rate))}</b></td><td class="num">${x.duration == null ? "–" : `${num(x.duration, 2)} anos`}</td></tr>`,
      ) // prettier-ignore
      .join("");
    const flows = (w ?? r.ytm).flows
      .map(
        (f) =>
          `<tr><td>${esc(brDate(f.pay))}</td><td class="num">${f.du}</td><td class="num">${num(f.interest, 4)}</td><td class="num">${num(f.principal, 4)}</td><td class="num">${num(f.interest + f.principal, 4)}</td></tr>`,
      ) // prettier-ignore
      .join("");
    out = `<div class="rk-tiles">
        <div class="rk-tile"><span class="l">YTW (pior taxa)</span><b>${esc(bondRate(y.idx, w?.rate))}</b><span class="muted">${w ? (w.kind === "call" ? `se resgatado em ${esc(brDate(w.date))}` : "levando ao vencimento") : "sem solução"}</span></div>
        <div class="rk-tile"><span class="l">YTM (até o vencimento)</span><b>${esc(bondRate(y.idx, r.ytm.rate))}</b><span class="muted">${num(r.ytm.years, 2)} anos · duration ${r.ytm.duration == null ? "–" : num(r.ytm.duration, 2)}</span></div>
        <div class="rk-tile"><span class="l">PU de compra</span><b>${num(r.pu, 4)}</b><span class="muted">${num(y.price, 4)}% de um PU par de ${num(r.puPar, 4)} (por 100 de valor nominal)</span></div>
      </div>
      <div class="table-wrap"><table class="cal-table"><thead><tr><th>Saída</th><th>Data</th><th class="num">Prazo</th><th class="num">Taxa</th><th class="num">Duration</th></tr></thead><tbody>${rows}</tbody></table></div>
      <details><summary class="small">Fluxos do pior cenário (por 100 de valor nominal)</summary>
        <div class="table-wrap"><table class="cal-table"><thead><tr><th>Pagamento</th><th class="num">DU</th><th class="num">Juros</th><th class="num">Principal</th><th class="num">Total</th></tr></thead><tbody>${flows}</tbody></table></div>
      </details>`;
  }
  return `<div class="card" id="rfx-ytw">
      <h2>📐 Preço → taxa (YTM e YTW)</h2>
      <p class="muted">Para debênture, CRI, CRA ou LF negociada no secundário: informe o preço em % do PU par e veja a taxa até o vencimento e até cada resgate antecipado. O YTW é a menor delas, o que você leva no pior caso.</p>
      <div class="rfx-top">
        <label>Indexador<select class="rfx-in" data-rfx-field="y" data-k="idx">${opt(Object.entries(IDX_BOND), y.idx)}</select></label>
        ${inp("coupon", couponLabel, dec(y.coupon, 4), 'inputmode="decimal"')}
        <label>Pagamento de juros<select class="rfx-in" data-rfx-field="y" data-k="freq">${opt(FREQS, y.freq)}</select></label>
      </div>
      <div class="rfx-top">
        ${inp("maturity", "Vencimento", y.maturity, 'type="date"')}
        ${inp("settle", "Liquidação", settle, 'type="date"')}
        ${inp("price", "Preço (% do PU par)", dec(y.price, 4), 'inputmode="decimal"')}
        ${y.idx === "cdis" || y.idx === "pcdi" ? `<label>CDI projetado (% a.a.)<input class="rfx-in" value="${esc(dec(m.cdi, 2))}" disabled /><span class="muted small">o do topo da tela</span></label>` : ""}
      </div>
      <div class="rfx-top">
        <label>Resgates antecipados (cole do site: data e preço de resgate em %)<textarea class="rfx-in rfx-ta" data-rfx-field="y" data-k="calls" rows="3" placeholder="15/12/2027 101,00&#10;15/12/2028 100,50">${esc(y.calls)}</textarea></label>
        <label>Amortizações (cole do site: data e % do valor nominal; vazio = tudo no vencimento)<textarea class="rfx-in rfx-ta" data-rfx-field="y" data-k="amort" rows="3" placeholder="18/04/2029&#10;50,00%&#10;18/04/2030&#10;50,00%">${esc(y.amort)}</textarea></label>
      </div>
      ${schedLine(calls, amort, settle)}
      ${bad.length ? `<p class="small warn-txt">⚠ Datas sem valor ou inválidas, ignoradas: ${esc(bad.join(" · "))}</p>` : ""}
      ${out}
      <p class="note">Convenção ANBIMA de debêntures: dias úteis pelo calendário de feriados nacionais (base 252), juros de cada período = saldo × (fator da taxa − 1), resgate paga os juros do período mais o saldo × preço de resgate. IPCA+ em termos reais (o preço em % do PU par já embute o VNA atualizado). CDI + e % do CDI com o CDI constante no nível do topo. Taxas brutas, antes de IR. Tesouro (NTN-B/NTN-F) usa cupom fixo por semestre e pode diferir na 2ª casa. Simulação educacional; confira a escritura e a ANBIMA.</p>
    </div>`;
}

export function viewFixedIncome() {
  loadMacro();
  const c = cfg();
  const m = macroNow();
  const live = liveMacro();
  const rows = compare(c.products, c.amount, c.days, m);
  const best = rows[0];
  const maxNet = Math.max(...rows.map((r) => r.netGain), 0);
  const src = (k, unit = "% a.a.") => {
    const ov = Number.isFinite(c.over[k]);
    const l = live[k];
    return ov
      ? "editado por você"
      : l
        ? `BCB · ${esc(l.date?.split("-").reverse().join("/") ?? "")}`
        : `estimativa (${unit})`;
  };
  const macroIn = (k, label) => `<label>${label}<input class="rfx-in" data-rfx-field="m" data-k="${k}" value="${esc(dec(m[k], 2))}" inputmode="decimal" /><span class="muted small">${src(k)}</span></label>`; // prettier-ignore
  const terms = TERMS.map(([d, t]) => `<button type="button" class="chip ${c.days === d ? "on" : ""}" data-rfx-act="term" data-d="${d}" aria-pressed="${c.days === d}">${t}</button>`).join(""); // prettier-ignore

  const bars = rows
    .map((r) => {
      const w = maxNet > 0 ? Math.max(2, (Math.max(0, r.netGain) / maxNet) * 100) : 0;
      return `<div class="rfx-bar ${r.rank === 1 ? "best" : ""}">
        <span class="rfx-bl">${esc(r.label)} <span class="muted small">${esc(rateTxt(r))}</span></span>
        <span class="rfx-track"><span style="width:${w.toFixed(1)}%"></span></span>
        <b class="num">${brl(r.netGain, 0)}</b></div>`;
    })
    .join("");

  const table = rows
    .map(
      (r) => `<tr class="${r.rank === 1 ? "rfx-best" : ""}">
      <td><b>${r.rank}. ${esc(r.label)}</b><div class="muted small">${esc(r.kindLabel !== r.label ? r.kindLabel + " · " : "")}${esc(rateTxt(r))}${r.fgc ? " · FGC" : ""}</div>${r.shortWarn ? `<div class="small warn-txt">⚠ ${esc(r.shortWarn)}</div>` : ""}</td>
      <td class="num">${brl(r.grossGain)}<div class="muted small">${pct(r.grossPct, 2)}</div></td>
      <td class="num">${taxTag(r)}<div class="muted small">${r.ir > 0 ? `IR ${brl(r.ir)}` : "IR R$ 0"}${r.iof > 0 ? ` · IOF ${brl(r.iof)}` : ""}${r.other > 0 ? ` · ${esc(r.otherLabel)} ${brl(r.other)}` : ""}</div></td>
      <td class="num"><b>${brl(r.netGain)}</b><div class="muted small">${pct(r.netPct, 2)} no período</div></td>
      <td class="num">${pct(r.netAA, 2)}<div class="muted small">${r.netPctCdi === null ? "–" : `${num(r.netPctCdi * 100, 1)}% do CDI`}</div></td>
      <td class="num">${r.cdbEq === null ? `<span class="muted">–</span>` : `<b>${num(r.cdbEq, 1)}%</b><div class="muted small">do CDI num CDB</div>`}</td>
      <td class="num">${brl(r.net)}<div class="muted small">${r.vsBest === null || r.rank === 1 ? "melhor" : brl(r.vsBest)}</div></td></tr>`,
    )
    .join("");

  // conversor rápido isento × tributado para o prazo escolhido
  const conv = c.conv ?? 90;
  const aliq = irRate(c.days);
  const convCdb = grossUp(conv, c.days);

  return `<section class="rfx">
    <div class="card">
      <h2>🇧🇷 Comparador de renda fixa</h2>
      <p class="muted">Mesmo valor e mesmo prazo para todos. Bruto, impostos pela regra vigente para pessoa física e o que sobra no bolso.</p>
      <div class="rfx-top">
        <label>Valor aplicado (R$)<input class="rfx-in rfx-amt" data-rfx-field="amount" value="${esc(dec(c.amount, 2))}" inputmode="decimal" /></label>
        <label>Prazo (dias corridos)<input class="rfx-in" data-rfx-field="days" value="${c.days}" inputmode="numeric" /><span class="muted small">${esc(termTxt(c.days))} · IR ${num(aliq * 100, 1)}%</span></label>
      </div>
      <div class="chips" role="group" aria-label="Prazo">${terms}</div>
      <div class="rfx-top">
        ${macroIn("cdi", "CDI (% a.a.)")}
        ${macroIn("selic", "Selic (% a.a.)")}
        ${macroIn("ipca", "IPCA esperado (% a.a.)")}
        ${macroIn("tr", "TR (% a.a.)")}
      </div>
      ${Object.keys(c.over).length ? `<button type="button" class="btn small ghost" data-rfx-act="live">Voltar aos dados do BCB</button>` : ""}
    </div>

    ${
      best
        ? `<div class="card">
      <div class="rk-tiles">
        <div class="rk-tile"><span class="l">Melhor líquido</span><b>${esc(best.label)}</b><span class="muted">${esc(rateTxt(best))}</span></div>
        <div class="rk-tile"><span class="l">Ganho líquido</span><b>${brl(best.netGain)}</b><span class="muted">${pct(best.netPct, 2)} em ${esc(termTxt(c.days))}</span></div>
        <div class="rk-tile"><span class="l">Ao ano, líquido</span><b>${pct(best.netAA, 2)}</b><span class="muted">${best.netPctCdi === null ? "" : `${num(best.netPctCdi * 100, 1)}% do CDI bruto`}</span></div>
        <div class="rk-tile"><span class="l">Diferença para o último</span><b>${brl(best.net - rows.at(-1).net)}</b><span class="muted">${esc(rows.at(-1).label)}</span></div>
      </div>
      <h3>Ganho líquido no prazo</h3>
      <div class="rfx-bars">${bars}</div>
    </div>`
        : ""
    }

    <div class="card">
      <h2>Bruto, impostos e líquido</h2>
      <div class="table-wrap"><table class="cal-table rfx-table">
        <thead><tr><th>Produto</th><th class="num">Rendimento bruto</th><th class="num">Impostos e custos</th><th class="num">Rendimento líquido</th><th class="num">Líquido a.a.</th><th class="num">CDB equivalente</th><th class="num">Valor final</th></tr></thead>
        <tbody>${table}</tbody></table></div>
      <p class="note">"% do CDI" do líquido = rendimento líquido ÷ CDI bruto do mesmo prazo. "CDB equivalente" (isentos) = quanto um CDB precisa pagar, em % do CDI, para dar o mesmo líquido neste prazo.</p>
    </div>

    <div class="card">
      <h2>LCI/LCA × CDB em % do CDI</h2>
      <div class="rfx-top">
        <label>LCI ou LCA a (% do CDI)<input class="rfx-in" data-rfx-field="conv" value="${esc(dec(conv, 1))}" inputmode="decimal" /></label>
        <div class="rfx-conv"><span class="muted small">Em ${esc(termTxt(c.days))} (IR ${num(aliq * 100, 1)}%), empata com um CDB a</span><b>${num(convCdb, 1)}% do CDI</b><span class="muted small">${num(conv, 1)} ÷ (1 − ${num(aliq, 3)})</span></div>
      </div>
      <div class="table-wrap"><table class="cal-table"><thead><tr><th>Isento a</th>${[180, 360, 720, 721].map((d) => `<th class="num">${d === 721 ? "> 720 d (15%)" : `até ${d} d (${num(irRate(d) * 100, 1)}%)`}</th>`).join("")}</tr></thead>
        <tbody>${[85, 90, 95, 100].map((x) => `<tr><td>${x}% do CDI</td>${[180, 360, 720, 721].map((d) => `<td class="num">${num(grossUp(x, d), 1)}%</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="note">Quanto mais longo o prazo, menor o IR do CDB e menor a vantagem do isento. Na prática a LCI/LCA tem carência mínima (CMN) e liquidez menor: compare também o prazo de resgate.</p>
    </div>

    ${ytwCard(m)}

    <details class="card" ${c.products.length ? "" : "open"}>
      <summary><h2>Produtos para comparar (${c.products.length})</h2></summary>
      <div class="table-wrap"><table class="cal-table"><thead><tr><th>Produto</th><th>Indexador</th><th class="num">Taxa</th><th>Nome</th><th></th></tr></thead>
        <tbody>${c.products.map(editRow).join("")}</tbody></table></div>
      <div class="row-btns">
        <button type="button" class="btn small" data-rfx-act="add" ${c.products.length >= MAX ? "disabled" : ""}>+ Produto</button>
        <button type="button" class="btn small ghost" data-rfx-act="reset">Restaurar exemplo</button>
      </div>
      <p class="note">As taxas de exemplo não são ofertas reais: troque pelas do seu banco ou corretora.</p>
    </details>

    <details class="card">
      <summary><h2>Regras usadas</h2></summary>
      <ul class="rk-notes">
        <li><b>IR regressivo</b> (CDB, LC, Tesouro, debênture comum, fundos): até 180 dias 22,5%; 181 a 360 20%; 361 a 720 17,5%; acima de 720 15%, sobre o rendimento.</li>
        <li><b>IOF</b> no resgate antes de 30 dias: de 96% do rendimento (1º dia) a 0% (30º dia).</li>
        <li><b>Isentos de IR</b> para pessoa física: LCI, LCA, CRI, CRA, debênture incentivada e poupança.</li>
        <li><b>Fundo DI</b>: come-cotas de 15% a cada 6 meses (maio e novembro) e complemento da tabela no resgate; a taxa informada já é líquida da taxa de administração.</li>
        <li><b>Tesouro Direto</b>: custódia da B3 de 0,20% a.a. (Tesouro Selic isento até R$ 10 mil).</li>
        <li><b>Poupança</b> (Selic acima de 8,5%): 0,5% ao mês + TR.</li>
        <li><b>FGC</b> cobre CDB, LC, LCI, LCA e poupança até R$ 250 mil por CPF e instituição; CRI, CRA, debêntures e títulos privados não têm FGC (risco do emissor).</li>
        <li>Dias úteis estimados como dias corridos × 252 ÷ 365; Tesouro Prefixado e IPCA+ levados ao vencimento (sem marcação a mercado). A MP 1.303/2025, que mudava essas regras, perdeu a validade em outubro de 2025.</li>
      </ul>
      <p class="note">Simulação educacional; não é recomendação de investimento. Confira a lâmina e as condições de cada emissão.</p>
    </details>
  </section>`;
}

export function initFixedIncome() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-rfx-act]");
    if (!t) return;
    const c = cfg();
    const a = t.dataset.rfxAct;
    const i = Number(t.dataset.i);
    if (a === "term") c.days = Number(t.dataset.d);
    else if (a === "add" && c.products.length < MAX)
      c.products.push({ id: Math.random().toString(36).slice(2, 8), kind: "cdb", idx: "cdi", rate: 100 }); // prettier-ignore
    else if (a === "del") c.products.splice(i, 1);
    else if (a === "reset") c.products = DEFAULT_PRODUCTS.map((p) => ({ ...p }));
    else if (a === "live") c.over = {};
    savePrefs();
    hooks.render();
  });
  document.addEventListener("change", (e) => {
    const t = e.target.closest("[data-rfx-field]");
    if (!t) return;
    const c = cfg();
    const f = t.dataset.rfxField;
    const i = Number(t.dataset.i);
    const n = parseNumber(t.value);
    if (f === "amount" && n > 0) c.amount = n;
    else if (f === "days" && n >= 1) c.days = Math.min(36500, Math.round(n));
    else if (f === "conv" && n > 0) c.conv = n;
    else if (f === "m") {
      if (Number.isFinite(n)) c.over[t.dataset.k] = n;
      else delete c.over[t.dataset.k];
    } else if (f === "kind") {
      const p = c.products[i];
      p.kind = t.value;
      const ids = idxFor(p.kind);
      if (!ids.includes(p.idx)) {
        p.idx = ids[0];
        p.rate = p.idx === "cdi" ? 100 : p.idx === "selic" ? 0.05 : p.idx === "poup" ? 0 : 7;
      }
    } else if (f === "idx") {
      const p = c.products[i];
      p.idx = t.value;
      p.rate = p.idx === "cdi" ? 100 : p.idx === "pre" ? 13 : p.idx === "ipca" ? 7 : 1;
    } else if (f === "rate" && Number.isFinite(n)) c.products[i].rate = n;
    else if (f === "name") c.products[i].name = t.value.slice(0, 40);
    else if (f === "y") {
      const y = ytwCfg();
      const k = t.dataset.k;
      if (k === "idx") {
        y.idx = t.value;
        y.coupon = y.idx === "pcdi" ? 110 : y.idx === "cdis" ? 1.5 : y.idx === "ipca" ? 7 : 12;
      } else if (k === "freq") y.freq = Number(t.value);
      else if (k === "maturity" || k === "settle")
        y[k] = /^\d{4}-\d{2}-\d{2}$/.test(t.value) ? t.value : "";
      else if (k === "calls" || k === "amort") y[k] = t.value.slice(0, 2000);
      else if ((k === "coupon" || k === "price") && Number.isFinite(n)) y[k] = n;
    }
    savePrefs();
    hooks.render();
  });
}
