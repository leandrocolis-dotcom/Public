// Painéis laterais de detalhe: ativo e atualização manual.
import { dateBR, esc, num, pct } from "./format.js";
import { state, store } from "./state.js";
import { openDrawer, seriesOf } from "./charts.js";
import { assetPanelHtml, mountAssetPanel } from "./asset-pop.js";
import { ASSETS } from "./universe.js";

export function openAsset(code) {
  const a = state.snap.assets[code];
  const s = seriesOf(code);
  if (!a?.ok || !s) return;
  const kv = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  openDrawer(
    `<h2 style="padding-right:30px"><span class="tk">${a.code}</span> ${esc(a.name)} ${a.stale ? `<span class="tag sell">defasado</span>` : ""}</h2>
    <div class="card"><div class="kv">${kv("Preço", `${num(a.price, 2)} ${esc(a.unit)}`)}${kv("Momentum", `${Math.round(a.momentum)} · ${a.band}`)}${kv("Fluxo", a.flow)}${kv("RSI", `${num(a.rsi, 0)}${a.timing ? ` · ${a.timing}` : ""}`)}
      ${kv("1d", pct(a.r1d))}${kv("5d", pct(a.r5d))}${kv("1m", pct(a.r1m))}${kv("3m", pct(a.r3m))}${kv("6m", pct(a.r6m))}${kv("No ano", pct(a.ytd))}${kv("1a", pct(a.r1y))}${kv("vs MM50", pct(a.vsMa50))}${kv("Topo 52s", pct(a.fromHigh))}${kv("Último preço real", dateBR(a.lastReal))}</div></div>
    ${assetPanelHtml(ASSETS[code]?.yahoo ?? code, { dates: state.prices.dates, close: s })}`,
    () => mountAssetPanel(ASSETS[code]?.yahoo ?? code, { dates: state.prices.dates, close: s }),
  );
}

export function openManual() {
  const stored = store.get("pendulo.manual", null);
  openDrawer(`<h2 style="padding-right:30px">Atualização manual de preços</h2>
    <div class="card"><p>Cole linhas <code>TICKER;preço</code> (ex.: <code>SPY;774,14</code>). O preço <b>sobrescreve o último pregão</b> do ticker e o resultado é recalculado na hora. Fica salvo só neste navegador e é descartado quando um <code>prices.json</code> novo for publicado.</p>
      <textarea id="manualTxt" placeholder="SPY;774,14&#10;GLD;412,30" aria-label="Preços manuais"></textarea>
      <p><button class="btn primary" data-action="apply-manual">Aplicar</button> <button class="btn" data-action="export-prices">Exportar prices.json</button>
      ${stored ? `<button class="btn" data-action="reset-manual">Descartar ajustes</button>` : ""}</p><p id="manualMsg" class="note" role="status"></p></div>`);
}
