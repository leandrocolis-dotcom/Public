// Fluxo › Rotação relativa: "Candidatos a liderança" (api/intraday?leaders=1) e "Nomes puros por linha" (theme-names.js).
// HTML puro (leadersHtml, namesTableHtml: testados) + busca com cache e desenho nos elementos da aba.
import { fetchJSON } from "./net.js";
import { fetchQuotes, hubQuote, liveQuote } from "./quote-hub.js";

/** Elemento só se o bloco estiver aberto (bloco recolhido do Fluxo não é desenhado nem busca cotação). */
const shown = (id) => {
  const el = document.getElementById(id);
  return el && !el.closest("details:not([open])") ? el : null;
};
import { decSep, esc } from "./format.js";
import { namesOf, PROXY } from "./theme-names.js";
import { dayChange } from "./leaders.js";

const CONF = { alta: ["Alta", "conf-alta"], media: ["Média", "conf-media"], baixa: ["Baixa", "conf-baixa"] }; // prettier-ignore
const pct = (x) => (x == null ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", decSep())}%`); // prettier-ignore
const tone = (x) => (x == null ? "" : x > 0 ? "up" : x < 0 ? "dn" : "");
const hhmm = (d = new Date()) =>
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }); // prettier-ignore

// ───────────── cache de busca (1 por URL), redesenho ao chegar ─────────────
const cache = new Map();
function cached(url, ttl, done) {
  const c = cache.get(url);
  if (c && (c.loading || Date.now() - c.at < ttl)) return c;
  const entry = { at: c?.at ?? 0, data: c?.data ?? null, loading: true };
  cache.set(url, entry);
  fetchJSON(url, { bg: true })
    .then((d) => cache.set(url, { at: Date.now(), data: d }))
    .catch((e) =>
      cache.set(url, {
        at: Date.now(),
        data: entry.data,
        err: String(e?.message ?? e).slice(0, 80),
      }),
    ) // prettier-ignore
    .finally(done);
  return entry;
}

// ───────────── "desde" e avisos já dados: memória do dia no aparelho ─────────────
const SEEN_KEY = "pendulo.leadSeen";
function seenToday(day) {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null");
  } catch {
    /* sem armazenamento */
  }
  return s?.day === day ? s : { day, first: {}, told: {} };
}
function saveSeen(s) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento */
  }
}

// ───────────── HTML ─────────────

/** Linha do regime no topo do quadro. */
export function regimeLine(rg) {
  if (!rg) return `<span class="dim">regime indisponível</span>`;
  const cls = /^Risk-on/.test(rg.verdict)
    ? "up"
    : /^Risk-off|^Estresse/.test(rg.verdict)
      ? "dn"
      : "";
  return `Regime do dia: <b class="${cls}">${esc(rg.verdict)}</b>${rg.level ? ` · ${esc(rg.level)} (${Math.round(rg.intensity ?? 0)}/100)` : ""} <span class="dim">· ${rg.on}/${rg.n} razões de risco em alta</span>`; // prettier-ignore
}

/** Quadro dos candidatos. j = resposta de api/intraday?leaders=1; first = { chave: "HH:MM" } (desde quando aparece hoje). */
export function leadersHtml(j, { first = {}, status = "" } = {}) {
  const list = j?.candidates ?? [];
  const rows = list
    .map((c) => {
      const [txt, cls] = CONF[c.conf] ?? CONF.baixa;
      const key = `${c.group}:${c.sym}`;
      const names = c.names.rows
        .map(
          (r) =>
            `<button class="ld-n ${tone(r.rel)}" data-sr-open="${esc(r.sym)}" title="${r.inv ? "Anda contra o tema · " : ""}dia ${pct(r.chg)}${r.rel != null ? ` · ${pct(r.rel)} contra o benchmark` : ""}">${esc(r.sym)}${r.inv ? "↕" : ""} <span>${pct(r.chg)}</span></button>`,
        )
        .join(""); // prettier-ignore
      return `<div class="ld-row ${cls}">
        <span class="ld-conf" title="Confiança: regime ${c.fit.fit >= 1 ? "a favor" : c.fit.fit > 0 ? "a favor (fraco)" : c.fit.fit < 0 ? "contra" : "neutro"} · nomes ${c.names.ok ? "confirmam" : "não confirmam"}">${txt}</span>
        <div class="ld-main">
          <button class="ld-t" data-rot-goto="${esc(c.group)}" data-rot-sym="${esc(c.sym)}" title="Abrir ${esc(c.label)} na rotação (janela Hoje)"><b>${esc(c.label)}</b> <span class="dim">${esc(c.groupLabel ?? "")}</span></button>
          <div class="ld-meta">${esc(c.turn ?? c.quadrant)}${c.at ? ` · ${esc(c.at)}` : ""} · ritmo ${Math.round(c.pace * 100)}% · <span class="${c.names.ok ? "up" : "dim"}">${c.names.up}/${c.names.n} nomes confirmam</span> · <span class="${c.fit.fit >= 1 ? "up" : c.fit.fit < 0 ? "dn" : "dim"}">${esc(c.fit.text)}</span>${first[key] ? ` · <span class="dim">desde ${first[key]}</span>` : ""}</div>
          <div class="ld-names">${names}</div>
        </div></div>`;
    })
    .join("");
  return `<div class="ld-head"><h3>Candidatos a liderança</h3><span class="ld-rg">${regimeLine(j?.regime)}</span></div>
    ${status ? `<p class="dim ld-status">${status}</p>` : ""}
    ${rows || (j ? `<p class="dim">Nenhum tema ganhando tração agora. Entra aqui o tema em Ganhando força ou Liderando, com momento acima de 100, força subindo na última hora e ritmo de pelo menos ${30}%.</p>` : "")}
    <p class="note">Varre a janela <b>Hoje</b> de todos os grupos a cada 2 min (pré, pregão e pós, conforme o switch On/Off). Confiança <b>alta</b> = regime a favor do tema (Risk-on para temas de risco, Risk-off/Estresse para defensivos, com intensidade moderada ou mais) <b>e</b> a maioria dos nomes puros andando melhor que o benchmark no dia; <b>média</b> = só um dos dois; <b>baixa</b> = contra o regime. Só a confiança alta vira aviso (🚀 LIDERANÇA). ↕ = nome que anda contra o tema. Pauta de estudo, não recomendação: confirme no gráfico e use stop.</p>`; // prettier-ignore
}

/**
 * Tabela dos nomes puros das linhas do grupo aberto. lines = [{ sym, label }]; quad = { sym: quadrante };
 * benchChg = variação do benchmark no dia (ou null). colorOf(quadrante) = cor do ponto.
 */
export function namesTableHtml(lines, quotes, { ext = true, benchChg = null, benchName = "", quad = {}, colorOf = () => "" } = {}) {
  const rows = lines
    .filter((l) => namesOf(l.sym).length)
    .map((l) => {
      const ns = namesOf(l.sym).map((n) => ({ ...n, chg: dayChange(quotes?.[n.sym], ext) }));
      const have = ns.filter((n) => n.chg != null);
      const beat = benchChg == null ? null : have.filter((n) => (n.inv ? -n.chg : n.chg) > benchChg).length;
      const chips = ns
        .map((n) => `<button class="ld-n ${tone(n.inv ? (n.chg == null ? null : -n.chg) : n.chg)}" data-sr-open="${esc(n.sym)}" title="${n.inv ? "Anda contra o tema" : "Abrir a página do ativo"}">${esc(n.sym)}${n.inv ? "↕" : ""} <span>${pct(n.chg)}</span></button>`)
        .join(""); // prettier-ignore
      const q = quad[l.sym];
      return `<tr><td class="nm-l"><i class="nm-dot" style="background:${colorOf(q) || "var(--text-3)"}" title="${esc(q ?? "")}"></i>${esc(l.label)}${PROXY.has(l.sym) ? ` <span class="dim" title="Sem papel próprio nos EUA: ETFs mais próximos">(aprox.)</span>` : ""}</td><td class="nm-n">${chips}</td><td class="nm-b dim">${beat == null ? "" : `${beat}/${have.length} acima ${esc(benchName)}`}</td></tr>`; // prettier-ignore
    })
    .join("");
  return rows ? `<table class="nm-tbl">${rows}</table>` : `<p class="dim">Sem nomes para este grupo.</p>`;
} // prettier-ignore

// ───────────── desenho na aba ─────────────

/**
 * Quadro dos candidatos (só Offshore). ctx: { mode, notifyLeader?(c), setPrefs?(o) }; goto(group, sym) abre o tema.
 */
export function drawLeaders(ctx, goto) {
  const el = shown("rotLeaders");
  if (!el) return;
  const ext = ctx.mode === "off";
  const url = `api/intraday?leaders=1&ext=${ext ? 1 : 0}`;
  const c = cached(url, 120_000, () => drawLeaders(ctx, goto));
  const j = c.data;
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const seen = seenToday(day);
  for (const x of j?.candidates ?? []) {
    const key = `${x.group}:${x.sym}`;
    seen.first[key] ??= hhmm();
    // aviso com o app aberto (quem não ativou o push): só confiança alta, 1 vez por tema por dia
    if (x.conf === "alta" && !seen.told[key] && ctx.notifyLeader?.(x)) seen.told[key] = true;
  }
  if (j) saveSeen(seen);
  const at = j?.at ? hhmm(new Date(j.at)) : null;
  const status = !j
    ? c.err
      ? `Sem varredura agora (${esc(c.err)}). Tenta de novo em 2 min.`
      : "Varrendo todos os grupos…"
    : `Atualizado às ${at} · ${j.ext ? "com pré e pós-mercado (Off)" : "só pregão regular (On)"} · ${j.scanned}/${j.asked} ativos${c.loading ? " · atualizando…" : ""}`; // prettier-ignore
  el.innerHTML = leadersHtml(j, { first: seen.first, status });
  el.onclick = (e) => {
    const b = e.target.closest("[data-rot-goto]");
    if (b) goto(b.dataset.rotGoto, b.dataset.rotSym);
  };
}

/** Tabela dos nomes puros do grupo aberto (cotações dos nomes a cada 1 min). */
export function drawNames(ctx, g, lines, quad, colorOf) {
  const el = shown("rotNames");
  if (!el) return;
  const syms = [...new Set(lines.flatMap((l) => namesOf(l.sym).map((n) => n.sym)))].sort();
  if (!syms.length) {
    el.closest("details")?.setAttribute("hidden", "");
    return;
  }
  el.closest("details")?.removeAttribute("hidden");
  // central de cotações (validade 1 min por ativo; o que o canal traz não é buscado); redesenha se buscou
  const want = syms.slice(0, 180);
  fetchQuotes(want, { id: "names" }).then(
    (r) => r.fetched && drawNames(ctx, g, lines, quad, colorOf),
  );
  const quotes = { ...(ctx.quotes ?? {}) };
  for (const s of want) quotes[s] = liveQuote(s) ?? hubQuote(s) ?? quotes[s];
  for (const s of want) if (!quotes[s]) delete quotes[s];
  const ext = ctx.mode === "off";
  const benchChg = g.bench ? dayChange(quotes[g.bench], ext) : null;
  el.innerHTML = namesTableHtml(lines, quotes, { ext, benchChg, benchName: g.bench ?? "", quad, colorOf }); // prettier-ignore
}
