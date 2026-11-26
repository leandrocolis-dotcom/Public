// Simulador › 🧠 Aprendizado › ⚡ Velocidade do fluxo: o que o modelo aprende com a velocidade (modo sombra).
// Lê data/speed-model.json (diário próprio, scripts/train-speed.mjs) e data/speed-study.json (estudo retroativo de 2
// anos, scripts/speed-study.mjs). Só exibe. Ver docs/ESTUDO-VELOCIDADE.md.
import { STATUS, RULES } from "./learner.js";
import { speedCodeLabel } from "./speed-learn.js";
import { decSep, esc } from "./format.js";

const fR = (x) =>
  Number.isFinite(x)
    ? `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(3).replace(".", decSep())}R`
    : "–";
const fP = (x) =>
  Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2).replace(".", decSep())}%` : "–"; // prettier-ignore
const cls = (x) => (Number.isFinite(x) ? (x > 0 ? "pos" : "neg") : "");
const band = (st, pct = null) =>
  st?.n
    ? `<b class="${cls(st.mean)}">${fR(st.mean)}</b>${pct != null ? ` <span class="dim">(${fP(pct)})</span>` : ""}<div class="dim spd-band">[${fR(st.lower)}; ${fR(st.upper)}] · ${st.n} dias</div>`
    : `<span class="dim">–</span>`;
const toneTag = (o) =>
  `<span class="tag ${o === "buy" ? "buy" : "sell"}">${o === "buy" ? "Compra" : "Short"}</span>`;
const dateBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "–");

function studyHtml(st) {
  if (!st?.horizons) return "";
  const H = [1, 5, 10].filter((h) => st.horizons[h]);
  const codes = Object.keys(st.horizons[H[0]]?.logics ?? {}).sort();
  const rows = codes
    .map((c) => {
      const l0 = st.horizons[H[0]].logics[c];
      return `<tr><td>${esc(speedCodeLabel(c))}</td><td>${toneTag(l0.tone)}</td>${H.map((h) => {
        const l = st.horizons[h].logics[c];
        return `<td class="num">${band(l?.x, l?.xs?.mean)}${l?.pass ? '<div><span class="tag buy" title="Passa na correção de Benjamini-Hochberg (testes múltiplos)">✓ BH</span></div>' : ""}</td>`;
      }).join("")}</tr>`;
    })
    .join("");
  return `<h4 style="margin:12px 0 4px">Estudo retroativo: ${dateBR(st.from)} a ${dateBR(st.to)} · ${st.syms} ativos dos EUA</h4>
    <div class="tw"><table class="spd-t"><thead><tr><th>Gatilho (no fechamento, janela 8 sem)</th><th>Operação</th>${H.map((h) => `<th class="num">${h} pregão${h > 1 ? "s" : ""}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Excesso em R = resultado da operação (stop 2,5 ATR, custo por perna) acima da média do universo no mesmo dia, média por dia, com faixa de 90%. Entre parênteses: retorno simples no sentido da operação, acima do universo. É PRÉVIA: o universo é o de hoje (viés de sobrevivência) e a hipótese de repique nasceu desses mesmos dados; só o diário abaixo, fora da amostra, aprova.</p>`; // prettier-ignore
}

function liveHtml(m) {
  if (!m?.logics) return `<p class="muted small">O diário da velocidade começa no próximo treino (depois do fechamento).</p>`; // prettier-ignore
  const ORDER = { approved: 0, eval: 1, eliminated: 2 };
  const rows = Object.entries(m.logics)
    .sort((a, b) => ORDER[a[1].status] - ORDER[b[1].status] || a[0].localeCompare(b[0]))
    .map(([k, l]) => {
      const [t, c, o] = k.split(":");
      const st = STATUS[l.status] ?? STATUS.eval;
      return `<tr><td>${esc(speedCodeLabel(c))} <span class="dim">${t === "ispd" ? "· até o fechamento seguinte" : "· 10 pregões"}</span></td><td>${toneTag(o)}</td><td><span class="tag ${st.tone}">${st.label}</span></td><td class="num">${band(l.x)}</td><td class="num">${band(l.preview)}</td></tr>`; // prettier-ignore
    })
    .join("");
  return `<h4 style="margin:12px 0 4px">Diário fora da amostra (decide) · ${m.sessions ?? 0} pregões ao vivo · atualizado em ${dateBR(m.updatedAt)}</h4>
    <div class="tw"><table class="spd-t"><thead><tr><th>Gatilho</th><th>Operação</th><th>Situação</th><th class="num">Excesso ao vivo</th><th class="num">Prévia (60 pregões reconstruídos)</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Mesmas regras do aprendizado: cada dia é uma observação; com ${RULES.minN}+ dias, aprova se o excesso médio for positivo e passar na correção de Benjamini-Hochberg entre as lógicas; elimina se for ≤ 0. Sessões: pré (até 9h30 de NY), pregão (16h) e pós (20h), em barras de 5 min com pré e pós-mercado, entrada no preço daquele momento e saída no fechamento do pregão seguinte. Universo: ${m.universe?.daily ?? "–"} ativos no fechamento; ${m.universe?.session ?? "–"} do Fluxo nas sessões. Modo sombra: não muda a aba Sinais de hoje nem os avisos.</p>`; // prettier-ignore
}

/** Cartão do Simulador. learn = { speed, speedStudy } (assets/model-status.js). */
export function speedLearnHtml(learn = {}) {
  if (!learn.speed && !learn.speedStudy) return "";
  return `<section class="card"><h3>⚡ Velocidade do fluxo <span class="muted small">entrar no que ganha tração? short no que acelera para baixo? (modo sombra)</span></h3>
    ${studyHtml(learn.speedStudy)}${liveHtml(learn.speed)}</section>`;
}
