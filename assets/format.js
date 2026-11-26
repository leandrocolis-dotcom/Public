// Formatação compartilhada (números, datas, escape de HTML). Textos e datas em pt-BR; o separador decimal
// dos números segue a preferência do usuário: ponto (1,234.56, padrão) ou vírgula (1.234,56).
let SEP = ".";
let LOC = "en-US";
let NF = {};
const resetHooks = [];
/** Troca o separador decimal de todos os números do app ("." padrão ou ","). */
export function setDecimalSep(sep) {
  const next = sep === "," ? "," : ".";
  if (next === SEP) return;
  SEP = next;
  LOC = next === "," ? "pt-BR" : "en-US";
  NF = {};
  for (const fn of resetHooks) fn();
}
/** Módulos com cache próprio de Intl.NumberFormat se registram aqui para refazer ao trocar o separador. */
export const onDecimalSep = (fn) => resetHooks.push(fn);
export const decSep = () => SEP;
/** Locale dos números (en-US com ponto, pt-BR com vírgula). */
export const numLocale = () => LOC;
const nf = (d) =>
  new Intl.NumberFormat(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
const F = (d) => (NF[d] ??= nf(d)); // qualquer nº de casas, criado sob demanda
/** Inteiro com separador de milhar do usuário (troca o toLocaleString("pt-BR")). */
export const intTxt = (x) => (Number.isFinite(+x) ? F(0).format(Math.round(+x)) : "–");
export const num = (x, d = 2) => (Number.isFinite(x) ? F(d).format(x) : "–");
// Sinal explícito, mas valores que arredondam para zero não levam sinal (evita "-0,0%").
const sgn = (x, d) => (Number(x.toFixed(d)) === 0 ? "" : x > 0 ? "+" : "");
export const pct = (x, d = 1) =>
  Number.isFinite(x) ? `${sgn(x * 100, d)}${F(d).format(Number((x * 100).toFixed(d)) + 0)}%` : "–";
/** Percentual sem sinal (para frases como "caiu 2,0%"). */
export const pctU = (x, d = 1) =>
  Number.isFinite(x) ? `${F(d).format(Number((Math.abs(x) * 100).toFixed(d)) + 0)}%` : "–";
export const signed = (x, d = 1) =>
  Number.isFinite(x) ? `${sgn(x, d)}${F(d).format(Number(x.toFixed(d)) + 0)}` : "–";
export const cls = (x) => (Math.abs(x) < 0.0005 ? "" : x > 0 ? "pos" : x < 0 ? "neg" : "");
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
export const dateBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "–");
// formatadores criados uma vez (criar um Intl.DateTimeFormat por chamada é caro e roda a cada desenho)
const DT_BR = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
}); // prettier-ignore
const TIME_BR = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit",
}); // prettier-ignore
export const fmtDT = (d) =>
  !(d instanceof Date) || Number.isNaN(d.getTime()) ? "–" : DT_BR.format(d);
export function ago(d) {
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 60) return `há ${m} min`;
  if (m < 60 * 36) return `há ${Math.round(m / 60)} h`;
  return `há ${Math.round(m / 1440)} dias`;
}

export const fmtTime = (d) => TIME_BR.format(d);

/** Contexto da aba "Quando entrar" (análise gráfica); recriado a cada uso para refletir o estado atual. */
