// Verificação dos dados (segunda fonte): carga, selo no topo e tela de conferência.
import { esc, fmtDT, num } from "./format.js";
import { nyDate } from "./live.js";
import { runChecks } from "./checks.js";
import { state } from "./state.js";
import { toast } from "./widgets.js";
import { fetchJSON } from "./net.js";

export const VERIFY_EVERY = 15 * 60000; // conferência com a Nasdaq: no máximo a cada 15 min (a função tem cache de 5 min)

/** Refaz a auditoria com o estado atual (rápida: só contas locais). */
/** Verificação no caminho lento (docs/PLANO-OTIMIZACAO.md, Fase 3): no máximo 1 vez a cada AUDIT_EVERY. */
export const AUDIT_EVERY = 60_000;
/** Refazer a verificação agora? Sempre na aba Verificação, na 1ª vez e depois de AUDIT_EVERY. Pura. */
export const auditDue = (lastAt, now, tab) =>
  tab === "checks" || !Number.isFinite(lastAt) || now - lastAt >= AUDIT_EVERY;

/** Pacote do canal: refaz a verificação só quando vencida (ela custava ~100 ms no celular a cada 15 s). */
export function auditMaybe(now = Date.now()) {
  if (!auditDue(state.auditAt, now, state.prefs.tab)) return;
  audit();
}

export function audit() {
  state.auditAt = Date.now();
  state.audit = runChecks({
    base: state.base,
    live: state.live,
    snap: state.snap,
    prices: state.prices,
    portfolio: state.portfolio,
    valuation: state.valuation,
    verify: state.verify,
    flowBase: state.flowBase,
    splits: state.splits,
    today: nyDate(Date.now() / 1000),
    nowSec: Date.now() / 1000,
  });
}

/** Busca a conferência Yahoo × Nasdaq (amostra do universo + ações/ETFs da carteira). */
export async function loadVerify({ force = false } = {}) {
  if (state.verifying) return;
  state.verifying = true;
  state.verifyAt = Date.now();
  if (force) renderChecksIfOpen();
  const held = (state.portfolio?.holdings ?? [])
    .map((h) => h.sym)
    .filter((s) => /^[A-Z]{1,5}$/.test(s));
  try {
    state.verify = await fetchJSON(
      `api/verify${held.length ? `?symbols=${encodeURIComponent(held.join(","))}` : ""}`,
    );
  } catch (e) {
    state.verify = { error: e.message };
  }
  state.verifying = false;
  audit();
  renderAuditPill();
  renderChecksIfOpen();
  if (force) {
    const s = state.audit.summary;
    toast(
      `Verificação concluída: ${s.ok} ok, ${s.warn} alerta(s), ${s.bad} erro(s).`,
      s.level === "ok" ? "ok" : s.level,
    );
  }
}

function renderChecksIfOpen() {
  if (state.prefs.tab !== "checks") return;
  document.getElementById("view").innerHTML = viewChecks();
}

export function renderAuditPill() {
  const el = document.getElementById("auditPill");
  if (!el || !state.audit) return;
  const s = state.audit.summary;
  el.hidden = false;
  el.className = `audit-pill ${s.level}`;
  el.textContent =
    s.level === "ok"
      ? "✓ Dados conferidos"
      : s.bad
        ? `✗ ${s.bad} erro(s) nos dados`
        : `! ${s.warn} alerta(s)`;
  el.title = `Verificação: ${s.ok} ok, ${s.warn} alerta(s), ${s.bad} erro(s). Clique para ver.`;
}

const LEVEL_ICON = { ok: "✓", warn: "!", bad: "✗" };

export function viewChecks() {
  if (!state.audit) audit();
  const { items, summary: s } = state.audit;
  const groups = [...new Set(items.map((i) => i.group))];
  const v = state.verify;
  const rows = (v?.rows ?? [])
    .map((r) => {
      const fx = (x) => (x == null ? "–" : num(x, 2));
      const dp = (x) => (x == null ? "–" : `${num(x * 100, 3)}%`);
      return `<tr><td><b>${esc(r.sym)}</b></td><td class="num">${fx(r.yahoo?.price)}</td><td class="num">${fx(r.nasdaq?.price)}</td><td class="num">${dp(r.priceDiff)}</td>
        <td class="num">${fx(r.yahoo?.prevClose)}</td><td class="num">${fx(r.nasdaq?.prevClose)}</td><td class="num">${dp(r.prevDiff)}</td>
        <td><span class="ck ${r.level === "na" ? "na" : r.level}">${r.level === "na" ? "–" : LEVEL_ICON[r.level]}</span> ${esc(r.why.join("; "))}</td></tr>`;
    })
    .join("");
  return `
  <section class="card">
    <h2>Verificação dos dados</h2>
    <p class="muted">Cada item refaz a conta por um caminho independente do motor do site ou compara com uma segunda fonte. Roda sozinho a cada atualização; a conferência com a Nasdaq, a cada 15 min.</p>
  </section>
  <div class="grid g3">
    <div class="card kpi"><div class="lab">Conferidos</div><div class="val pos">${s.ok}</div><div class="sub muted">de ${s.total} verificações</div></div>
    <div class="card kpi"><div class="lab">Alertas</div><div class="val ${s.warn ? "wait-t" : ""}">${s.warn}</div><div class="sub muted">confira o detalhe</div></div>
    <div class="card kpi"><div class="lab">Erros</div><div class="val ${s.bad ? "neg" : ""}">${s.bad}</div><div class="sub muted">dado ou conta inconsistente</div></div>
  </div>
  <section class="card">
    <p><button class="btn primary" data-action="verify-now" ${state.verifying ? "disabled" : ""}>${state.verifying ? "Conferindo…" : "Conferir agora"}</button>
    <span class="muted">${v?.checked_at ? `Última conferência com a Nasdaq: ${fmtDT(new Date(v.checked_at))}${v.market ? ` · mercado: ${esc(v.market)}` : ""}` : ""}</span></p>
  </section>
  ${groups
    .map(
      (g) =>
        `<section class="card"><h2>${esc(g)}</h2><ul class="checks">${items
          .filter((i) => i.group === g)
          .map(
            (i) =>
              `<li><span class="ck ${i.level}" aria-label="${i.level}">${LEVEL_ICON[i.level]}</span><div><b>${esc(i.label)}</b><br><span class="muted">${esc(i.detail)}</span></div></li>`,
          )
          .join("")}</ul></section>`,
    )
    .join("")}
  ${
    rows
      ? `<section class="card"><h2>Yahoo × Nasdaq, ativo a ativo</h2>
    <div class="tw"><table data-sortable="chk"><thead><tr><th>Ativo</th><th class="num">Preço Yahoo</th><th class="num">Preço Nasdaq</th><th class="num">Dif.</th><th class="num">Fech. ant. Yahoo</th><th class="num">Fech. ant. Nasdaq</th><th class="num">Dif.</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Tolerância: fechamento anterior até 0,15% (é um número oficial, deve bater); preço até 0,15% com mercado fechado e 0,6% com mercado aberto (as fontes atualizam em momentos diferentes). A Nasdaq não cobre futuros, moedas e índices.</p></section>`
      : ""
  }
  <section class="card"><h2>O que a verificação não cobre</h2><ul>
    <li>Premissas dos modelos (pares, sinais): a conta está certa, mas a regra pode não funcionar no futuro.</li>
    <li>Preços de futuros, moedas e juros: só têm a fonte Yahoo; são checados por formato, horário e continuidade.</li>
    <li>Saldos e custos reais da corretora: a carteira é a que você colou do Investing; confira com o extrato.</li>
  </ul></section>`;
}
