// Pêndulo flutuante: pílula sobre todas as abas com a nota do regime (−100 a +100), a faixa e quanto andou na
// última hora. Mesma conta do pêndulo da Início (regime de 1 dia; fora do pregão, prévia com futuros e pré/pós).
// Arrasta com o dedo ou o mouse (posição salva em prefs.pendFloatPos), toque abre a Início, × esconde
// (prefs.pendFloat = "off"; volta em Configurações › Atualização e dados).
import { regime } from "./dash.js";
import { pendulumReading, regimeMove, weekendLayer } from "./home-view.js";
import { liveReversal } from "./reversal-view.js";

const sgn = (x) => (x > 0 ? "+" : x < 0 ? "−" : "");

/** Selo do radar de virada na pílula (puro): ⚠ tendência, ▲/▼ confirmada. */
export function revBadge(rev) {
  if (!rev || (rev.stage !== "watch" && rev.stage !== "confirmed")) return "";
  const conf = rev.stage === "confirmed";
  const cls = conf ? (rev.dir > 0 ? "up" : "dn") : "warn";
  const txt = conf ? `${rev.dir > 0 ? "▲" : "▼"} virada` : "⚠ virada?";
  return `<small class="pf-rv ${cls}" title="Radar de virada: ${conf ? "confirmada" : "tendência de mudança"} (força ${rev.strength}/100)">${txt}</small>`; // prettier-ignore
}

/** Conteúdo da pílula (puro). r = pendulumReading; move = pontos na última hora (ou null); rev = radar de virada. */
export function pendFloatHtml(r, move = null, rev = null) {
  if (!r) return "";
  const m = Number.isFinite(move) ? Math.round(move) : null;
  const mv =
    m == null
      ? ""
      : `<small class="pf-mv ${m > 0 ? "up" : m < 0 ? "dn" : "mid"}" title="Quanto a nota andou na última hora">${m > 0 ? "▲" : m < 0 ? "▼" : "•"} ${sgn(m)}${Math.abs(m)} 1h</small>`; // prettier-ignore
  return `<span class="pf-dot ${r.zone.tone}" aria-hidden="true"></span><b class="pf-sc ${r.zone.tone}">${sgn(r.score)}${Math.abs(r.score)}</b><span class="pf-zn">${r.zone.label}${r.stress ? " ⚠" : ""}</span>${r.weekend ? `<small class="pf-mv mid" title="Fim de semana: prévia pelo cripto">fds</small>` : ""}${mv}${revBadge(rev)}`; // prettier-ignore
}

/** Posição dentro da tela (puro): mantém a pílula inteira visível. */
export function clampPos(x, y, w, h, vw, vh, pad = 6) {
  return {
    x: Math.round(Math.max(pad, Math.min(vw - w - pad, x))),
    y: Math.round(Math.max(pad, Math.min(vh - h - pad, y))),
  };
}

let memo = { flow: null, quotes: null, ses: null, val: null };
function reading(flow, quotes, ses) {
  if (!flow?.close) return null;
  if (memo.flow !== flow || memo.quotes !== quotes || memo.ses !== ses) {
    let val = null;
    try {
      val = pendulumReading(regime(flow.close, 1, ses !== "open" ? quotes : null, { world: quotes }), ses); // prettier-ignore
    } catch {
      val = null;
    }
    memo = { flow, quotes, ses, val };
  }
  // fim de semana: prévia pelo cripto, a mesma da Início
  return weekendLayer(memo.val, flow, quotes);
}

let el = null;
let hooks = { onOpen: () => {}, onClose: () => {}, onMove: () => {} };

function place(pos) {
  if (!el || !pos) return;
  const p = clampPos(pos.x, pos.y, el.offsetWidth, el.offsetHeight, innerWidth, innerHeight);
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.style.right = "auto";
  el.style.bottom = "auto";
}

function mount() {
  el = document.createElement("div");
  el.id = "pendFloat";
  el.className = "pfloat";
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.innerHTML = `<span class="pf-body"></span><button type="button" class="pf-x" aria-label="Fechar o pêndulo flutuante" title="Fechar (volta em Configurações)">×</button>`; // prettier-ignore
  document.body.appendChild(el);
  let start = null;
  let moved = false;
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".pf-x") || e.button > 0) return;
    const b = el.getBoundingClientRect();
    start = { px: e.clientX, py: e.clientY, x: b.left, y: b.top };
    moved = false;
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.px;
    const dy = e.clientY - start.py;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    moved = true;
    el.classList.add("drag");
    place({ x: start.x + dx, y: start.y + dy });
  });
  const end = () => {
    if (!start) return;
    start = null;
    el.classList.remove("drag");
    if (moved) hooks.onMove({ x: parseInt(el.style.left, 10), y: parseInt(el.style.top, 10) });
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("click", (e) => {
    e.stopPropagation(); // não deixa o clique cair nos atalhos do app (data-tab etc.)
    if (e.target.closest(".pf-x")) {
      el.hidden = true;
      hooks.onClose();
    } else if (!moved) hooks.onOpen();
    moved = false;
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.target.closest(".pf-x")) hooks.onOpen();
  });
  // rolando a página: a pílula sai da frente e volta 1 s depois de parar (não cobre o que se está lendo)
  let scrollT = 0;
  addEventListener(
    "scroll",
    () => {
      el.classList.add("away");
      clearTimeout(scrollT);
      scrollT = setTimeout(() => el.classList.remove("away"), 1000);
    },
    { passive: true },
  );
  addEventListener("resize", () => {
    if (el.style.left) place({ x: parseInt(el.style.left, 10), y: parseInt(el.style.top, 10) });
  });
}

/** Desenha (ou esconde) a pílula. Chamado a cada render do app. */
export function paintPendFloat({ flow, quotes, ses, prefs, onOpen, onClose, onMove }) {
  hooks = { onOpen, onClose, onMove };
  // na Início o pêndulo grande já está na tela: a pílula repetia a nota e cobria o detalhe dos blocos
  const r = prefs?.pendFloat === "off" || prefs?.tab === "home" ? null : reading(flow, quotes, ses);
  if (!r) {
    if (el) el.hidden = true;
    return;
  }
  if (!el) mount();
  let move = null;
  try {
    move = r.weekend ? null : regimeMove(flow, quotes);
  } catch {
    move = null;
  }
  let rev = null;
  try {
    rev = r.weekend ? null : liveReversal(flow, quotes);
  } catch {
    rev = null;
  }
  const html = pendFloatHtml(r, move, rev);
  el.classList.toggle("rv-on", rev?.stage === "watch" || rev?.stage === "confirmed");
  el.classList.toggle("rv-conf", rev?.stage === "confirmed");
  const body = el.querySelector(".pf-body");
  if (body.innerHTML !== html) body.innerHTML = html;
  el.title = `Pêndulo do mercado: ${r.label} (${r.depth}). ${r.session}. Toque para abrir a Início; arraste para mover.`; // prettier-ignore
  el.setAttribute("aria-label", `Pêndulo ${r.score}, ${r.label}`);
  el.hidden = false;
  if (prefs?.pendFloatPos) place(prefs.pendFloatPos);
}
