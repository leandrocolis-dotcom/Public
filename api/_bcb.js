// Macro do Brasil para Mercado › Local: séries do SGS e expectativas do Focus (Banco Central, gratuito, sem chave).
// Arquivo com "_" não vira rota: servido por GET /api/yields?br=1 (o plano limita o número de funções).
import { httpFetch } from "./_http.js";
import { SGS, brMacro } from "../assets/br.js";

const SGS_URL = (code, n) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/${n}?formato=json`;
const OLINDA = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/";

const json = (url, deadline) =>
  httpFetch(
    url,
    { timeout: 9000, deadline, headers: { Accept: "application/json" } },
    async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  );

/** URL do Focus anual (IPCA, Selic, PIB e câmbio do ano corrente e do seguinte). */
export function focusUrl(year) {
  const f = `(Indicador eq 'IPCA' or Indicador eq 'Selic' or Indicador eq 'PIB Total' or Indicador eq 'Câmbio') and (DataReferencia eq '${year}' or DataReferencia eq '${year + 1}') and baseCalculo eq 0`;
  return `${OLINDA}ExpectativasMercadoAnuais?$top=300&$orderby=Data%20desc&$format=json&$select=Indicador,Data,DataReferencia,Mediana,baseCalculo&$filter=${encodeURIComponent(f)}`;
}

export const FOCUS12_URL = `${OLINDA}ExpectativasMercadoInflacao12Meses?$top=40&$orderby=Data%20desc&$format=json&$select=Indicador,Data,Suavizada,Mediana,baseCalculo&$filter=${encodeURIComponent("Indicador eq 'IPCA' and Suavizada eq 'S' and baseCalculo eq 0")}`;

/** URL do Focus anual só do IPCA, do ano corrente até 4 anos à frente (para a curva de inflação esperada). */
export function focusIpcaUrl(year) {
  const yrs = [0, 1, 2, 3, 4].map((k) => `DataReferencia eq '${year + k}'`).join(" or ");
  const f = `Indicador eq 'IPCA' and (${yrs}) and baseCalculo eq 0`;
  return `${OLINDA}ExpectativasMercadoAnuais?$top=200&$orderby=Data%20desc&$format=json&$select=Indicador,Data,DataReferencia,Mediana,baseCalculo&$filter=${encodeURIComponent(f)}`;
}

/** Linhas do Focus (mais recente primeiro) -> { date, years: { "2027": 3.9, ... } } com a última mediana de cada ano. */
export function parseFocusIpca(rows) {
  const years = {};
  let date = null;
  for (const r of [...(rows ?? [])].sort((a, b) => (a.Data < b.Data ? 1 : -1))) {
    const y = String(r?.DataReferencia ?? "");
    const v = Number(r?.Mediana);
    if (!/^\d{4}$/.test(y) || !Number.isFinite(v) || y in years) continue;
    years[y] = v;
    date = date && date > r.Data ? date : r.Data;
  }
  return { date, years };
}

/** Focus: IPCA esperado por ano (GET /api/yields?focus=ipca). */
export async function fetchFocusIpca(deadline = null) {
  const year = new Date().getUTCFullYear();
  const j = await json(focusIpcaUrl(year), deadline);
  const out = parseFocusIpca(j?.value);
  if (Object.keys(out.years).length < 2) throw new Error("Focus sem IPCA anual");
  return { fetched_at: new Date().toISOString(), source: "Focus do Banco Central (mediana, IPCA anual)", ...out }; // prettier-ignore
}

export async function fetchBrMacro(deadline = null) {
  const year = new Date().getUTCFullYear();
  const errors = [];
  const [sgsR, focusR, f12R] = await Promise.all([
    Promise.allSettled(SGS.map(([, code, n]) => json(SGS_URL(code, n), deadline))),
    json(focusUrl(year), deadline).catch((e) => (errors.push(`Focus anual: ${e.message}`), null)),
    json(FOCUS12_URL, deadline).catch((e) => (errors.push(`Focus 12 meses: ${e.message}`), null)),
  ]);
  const sgs = {};
  sgsR.forEach((r, i) => {
    const [k, code] = SGS[i];
    if (r.status === "fulfilled" && Array.isArray(r.value)) sgs[k] = r.value;
    else errors.push(`SGS ${code} (${k}): ${r.reason?.message ?? "resposta inválida"}`);
  });
  const out = brMacro({ sgs, focus: focusR?.value, focus12: f12R?.value, year });
  return { fetched_at: new Date().toISOString(), ...out, errors };
}
