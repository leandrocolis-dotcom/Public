// Aplica na tela só o que mudou entre o HTML atual e o novo (em vez de trocar a aba inteira com innerHTML).
// O HTML novo continua sendo gerado INTEIRO a partir do estado (preço, ação e níveis saem da mesma conta), então o
// resultado é idêntico ao da troca completa; só muda o custo: nós iguais ficam onde estão (sem refazer layout),
// e o que o usuário está mexendo (foco, rolagem interna, menu aberto) não é recriado.

/** Copia os atributos de `n` para `o` (e o estado vivo de campos de formulário que não estão em uso). */
function syncAttrs(o, n) {
  for (const { name, value } of n.attributes)
    if (o.getAttribute(name) !== value) o.setAttribute(name, value);
  for (const { name } of [...o.attributes]) if (!n.hasAttribute(name)) o.removeAttribute(name);
  if (o === document.activeElement) return; // campo em edição: o texto do usuário manda
  if ("checked" in o && o.checked !== n.checked) o.checked = n.checked;
  if ("value" in o && o.tagName !== "BUTTON" && o.value !== n.value) o.value = n.value;
}

const sameKind = (o, n) =>
  o.nodeType === n.nodeType &&
  o.nodeName === n.nodeName &&
  (o.nodeType !== 1 || (o.id === n.id && o.type === n.type));

/** Deixa os filhos de `from` iguais aos de `to` (consome os nós de `to`). */
export function morphChildren(from, to) {
  const a = [...from.childNodes];
  const b = [...to.childNodes];
  for (let i = 0; i < b.length; i++) {
    const o = a[i];
    const n = b[i];
    if (!o) from.appendChild(n);
    else if (!sameKind(o, n)) from.replaceChild(n, o);
    else if (o.nodeType !== 1) {
      if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
    } else if (!o.isEqualNode(n)) {
      syncAttrs(o, n);
      morphChildren(o, n);
    }
  }
  for (let i = a.length - 1; i >= b.length; i--) a[i].remove();
}

/** Troca o conteúdo de `el` pelo HTML novo aplicando só as diferenças. */
export function morphHtml(el, html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  morphChildren(el, t.content);
}

/** Dá para aplicar só as diferenças? Não com gráficos (Chart.js guarda estado e eventos no próprio elemento). */
export const canMorph = (el, html) => !html.includes("<canvas") && !el.querySelector("canvas");
