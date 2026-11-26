// Janela do ativo em dois balões: informações do ativo (gráfico, preço, empresa, números) e análises e recomendações.
// Dentro deles, cada seção abre recolhida, mostrando só o título e o essencial (data-lead ou o primeiro bloco curto).

const SHORT = 280; // texto do "essencial" automático: acima disso, fica só o título

function leadOf(card, h) {
  const marked = card.querySelector(":scope > [data-lead]");
  if (marked) return marked;
  const el = h.nextElementSibling;
  if (!el || el.matches("table, .tw, details, canvas, .chart-box, ul")) return null;
  return el.textContent.trim().length <= SHORT ? el : null;
}

/** Recolhe os cartões de uma janela de ativo (idempotente: cartão já recolhido fica como está). */
export function foldCards(root) {
  const ap = root?.querySelector(".card.ap");
  if (!ap) return;
  // "Sobre a empresa/o fundo" vira parte do primeiro cartão (gráfico e preço): um bloco só, sempre aberto
  for (const src of root.querySelectorAll(".card.ap-about-src")) {
    const sec = document.createElement("div");
    sec.className = "ap-sec ap-about";
    sec.append(...src.childNodes);
    ap.append(sec);
    src.remove();
  }
  // Dois balões: (1) INFORMAÇÕES do ativo (gráfico, preço, empresa, números, financeiros, manchetes) num cartão só;
  // (2) ANÁLISES E RECOMENDAÇÕES (decisão do trader, plano, notas, Quant, riscos, analistas, notícias com impacto).
  let box = root.querySelector(".an-box");
  for (const card of [...root.querySelectorAll(".card")]) {
    if (card === ap || card.classList.contains("an-box")) continue;
    const t = card.querySelector("h3, h2")?.textContent.trim() ?? "";
    if (!t || KEEP.test(t)) continue; // "Carregando…", selos e ações ficam como estão
    card.classList.remove("card");
    if (INFO.test(t)) {
      card.classList.add("ap-sec", "ap-info");
      if (!ap.contains(card)) ap.append(card);
    } else {
      if (!box) {
        box = document.createElement("section");
        box.className = "card an-box";
        box.innerHTML = `<h2 class="an-box-h">Análises e recomendações</h2>`;
        ap.after(box);
      }
      card.classList.add("an-sec");
      if (!box.contains(card)) box.append(card);
    }
    foldEl(card);
  }
}

const INFO = /^(Sobre|Composição do fundo|Números|Últimos dados financeiros|Últimas manchetes|Ativo de referência)/; // prettier-ignore
const KEEP = /^Acompanhar/;

/** Seção recolhida: título + o essencial no resumo; o resto ao abrir (idempotente). */
function foldEl(card) {
  if (card.dataset.folded) return;
  const h = card.querySelector(":scope > h3, :scope > h2");
  if (!h) return;
  const lead = leadOf(card, h);
  // nada além do título e do essencial: recolher só esconderia vazio
  const rest = [...card.children].filter((x) => x !== h && x !== lead);
  if (!rest.some((x) => x.textContent.trim() || x.querySelector("canvas, table"))) return;
  const det = document.createElement("details");
  det.className = "fold";
  const sum = document.createElement("summary");
  sum.append(h);
  if (lead) sum.append(lead);
  det.append(sum, ...card.childNodes);
  card.append(det);
  card.dataset.folded = "1";
}

let obs = null;
/** Liga o recolhimento na gaveta (uma vez): vale também para o que chega depois (contexto, notícias). */
export function watchDrawer() {
  const body = document.getElementById("drawerBody");
  if (!body || obs) return;
  obs = new MutationObserver(() => foldCards(body));
  obs.observe(body, { childList: true, subtree: true });
}
