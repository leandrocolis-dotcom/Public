// Página de instrumento sem cotação no Yahoo (título público ou privado, fundo não listado, papel só identificado):
// identificadores (ISIN, CUSIP, FIGI, ticker Bloomberg), tipo, mercado e, para Treasuries, emissão, vencimento,
// cupom e histórico de leilões (TreasuryDirect). Dados de api/instrument.
import { esc, num, pct } from "./format.js";
import { openDrawer } from "./charts.js";
import { state } from "./state.js";
import { fetchJSON } from "./net.js";

const cache = new Map();
const load = (id) => {
  if (!cache.has(id))
    cache.set(
      id,
      fetchJSON(`api/instrument?id=${encodeURIComponent(id)}`).catch((e) => {
        cache.delete(id);
        throw e;
      }),
    );
  return cache.get(id);
};

/** Anos entre hoje e uma data ISO (vencimento). */
export const yearsTo = (iso, now = Date.now()) =>
  iso ? (Date.parse(iso) - now) / (365.25 * 86400e3) : null;

/** Treasury de referência mais perto do prazo restante (Yahoo: ^IRX 3m, ^FVX 5a, ^TNX 10a, ^TYX 30a). */
export function benchmark(years) {
  if (!Number.isFinite(years)) return null;
  const refs = [["^IRX", 0.25, "T-bill 3 meses"], ["^FVX", 5, "Treasury 5 anos"], ["^TNX", 10, "Treasury 10 anos"], ["^TYX", 30, "Treasury 30 anos"]]; // prettier-ignore
  return refs.reduce((a, b) => (Math.abs(b[1] - years) < Math.abs(a[1] - years) ? b : a));
}

const k = (l, v) => (v == null || v === "" ? "" : `<div><span>${l}</span><b>${v}</b></div>`);
const dateBR = (iso) => (iso ? iso.split("-").reverse().join("/") : null);

/** HTML da página (puro, para testar). out = resposta de api/instrument; hint = sugestão escolhida. */
export function instrumentHtml(out, hint = {}) {
  const i = out?.instrument ?? {};
  const t = out?.treasury;
  const name = i.name ?? hint.name ?? out?.id ?? "";
  const isin = hint.isin ?? (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(out?.id ?? "") ? out.id : null);
  const cusip = hint.cusip ?? t?.cusip ?? null;
  const type = t ? `Treasury ${t.type ?? ""}`.trim() : (i.type ?? hint.type ?? "Instrumento");
  const yrs = yearsTo(t?.maturity);
  const ref = benchmark(yrs);
  const refY = ref ? state.live?.quotes?.[ref[0]]?.p : null;
  const last = t?.auctions?.[0];
  const quotable = i.ticker && /Ação|ETF|Fundo/.test(i.type ?? "") && !/\s/.test(i.ticker);
  const ids = `<div class="kv">${k("ISIN", esc(isin))}${k("CUSIP", esc(cusip))}${k("FIGI", esc(i.figi ?? hint.figi))}${k("Ticker Bloomberg", esc(i.ticker))}${k("Código de bolsa", esc(i.exch))}${k("Setor de mercado", esc(i.sector))}${k("Tipo do papel", esc(i.secType))}${k("Listagens encontradas", out?.listings > 1 ? num(out.listings, 0) : null)}</div>`; // prettier-ignore
  const tsy = t
    ? `<div class="card"><h3>Título do Tesouro americano</h3>
      <div class="kv">${k("Tipo e prazo", esc([t.type, t.term].filter(Boolean).join(" · ")))}${k("Emissão", dateBR(t.issueDate))}${k("Vencimento", dateBR(t.maturity))}${k("Prazo restante", Number.isFinite(yrs) ? (yrs > 0 ? `${num(yrs, 1)} anos` : "vencido") : null)}${k("Cupom", Number.isFinite(t.coupon) && t.coupon > 0 ? pct(t.coupon / 100, 3) : t.type === "Bill" ? "sem cupom (desconto)" : null)}${k("Pagamento de juros", esc(t.frequency))}${k("Indexado à inflação", t.tips ? "Sim (TIPS)" : null)}${k("Taxa flutuante", t.frn ? "Sim (FRN)" : null)}</div>
      ${t.auctions?.length ? `<h3 style="margin-top:14px">Leilões</h3><div class="tw" style="box-shadow:none"><table><thead><tr><th>Data</th><th></th><th class="num">Taxa</th><th class="num">Preço/100</th><th class="num">Demanda (bid-to-cover)</th><th class="num">Aceito (US$)</th></tr></thead><tbody>${t.auctions.map((a) => `<tr><td>${dateBR(a.date) ?? "–"}</td><td class="muted">${a.reopening ? "reabertura" : "emissão"}</td><td class="num">${Number.isFinite(a.highYield) ? pct(a.highYield / 100, 3) : "–"}</td><td class="num">${num(a.price, 4)}</td><td class="num">${Number.isFinite(a.bidToCover) ? `${num(a.bidToCover, 2)}x` : "–"}</td><td class="num">${Number.isFinite(a.accepted) ? `${num(a.accepted / 1e9, 1)} bi` : "–"}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${ref && Number.isFinite(refY) && Number.isFinite(last?.highYield) ? `<p class="note">Hoje o ${ref[2]} (prazo mais próximo do restante deste título) rende ${pct(refY / 100, 2)} a.a.; no último leilão este papel saiu a ${pct(last.highYield / 100, 3)}. ${refY > last.highYield ? "Juros subiram desde então: o preço de mercado tende a estar abaixo do preço do leilão." : "Juros caíram desde então: o preço de mercado tende a estar acima do preço do leilão."}</p>` : ""}
      <p class="note">Fonte: TreasuryDirect (resultados oficiais de leilão). O preço do mercado secundário não é público em tempo real; use a taxa do Treasury de prazo parecido como referência.</p></div>`
    : "";
  return `<h2 style="padding-right:30px">${esc(name)}</h2>
    <div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="tag">${esc(type)}</span>${i.desc && i.desc !== name ? `<span class="muted">${esc(i.desc)}</span>` : ""}</div>
      <h3 style="margin-top:12px">Identificadores</h3>${ids}
      ${quotable ? `<p style="margin-top:10px"><button class="btn" data-sr-open="${esc(i.ticker)}">Abrir cotação de ${esc(i.ticker)}</button></p>` : ""}</div>
    ${tsy}
    ${!t ? `<div class="card"><p class="note">${/Fundo/.test(type) ? "Fundo sem cotação pública em bolsa: identificado pelos códigos de mercado. Cota, patrimônio e rentabilidade saem do administrador ou da plataforma onde ele é distribuído." : /Título/.test(type) || /Corp|Govt|Muni|Mtge/.test(i.sector ?? "") ? "Título de renda fixa negociado em balcão: preço e taxa do mercado secundário não são públicos gratuitamente. Os identificadores acima servem para buscar a cotação na corretora ou no terminal." : "Instrumento sem cotação pública gratuita; mostrando os identificadores de mercado."}</p></div>` : ""}
    <p class="note">Fontes: OpenFIGI (identificadores da Bloomberg)${t ? " e TreasuryDirect" : ""}. Material educacional; não é recomendação de investimento.</p>`;
}

/** Abre a página. id = ISIN, CUSIP ou FIGI. */
export async function openInstrumentPage(id, hint = {}) {
  const token = (openInstrumentPage.token = {});
  openDrawer(`<h2 style="padding-right:30px">${esc(hint.name ?? id)}</h2><div class="card"><p class="muted">Buscando identificadores e dados de ${esc(id)}…</p></div>`); // prettier-ignore
  let out = null;
  try {
    out = await load(id);
  } catch {
    out = null;
  }
  if (openInstrumentPage.token !== token || document.getElementById("drawer").hidden) return;
  openDrawer(
    out?.instrument || out?.treasury
      ? instrumentHtml(out, hint)
      : `<h2 style="padding-right:30px">${esc(hint.name ?? id)}</h2><div class="card"><p class="muted">Não encontrei dados para ${esc(id)} agora. Confira o código (ISIN tem 12 caracteres, CUSIP 9, FIGI começa com BBG).</p></div>`,
  );
}
