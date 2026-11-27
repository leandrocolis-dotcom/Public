// Estado do modelo em treino (data/model.json, gravado todo dia por scripts/train-model.mjs) e o aviso de
// "modelo final" mostrado nas abas Simulador e Decisões.
import { esc } from "./format.js";
import { fetchJSON } from "./net.js";
import { hooks, state } from "./state.js";

const TTL = 10 * 60_000;
export const learn = { model: null, retro: null, at: 0, loading: false, error: null };

/** Busca data/model.json (no máximo a cada 10 min) e redesenha a aba atual quando chega. */
export async function loadModel(force = false) {
  if (learn.loading || (!force && Date.now() - learn.at < TTL)) return;
  learn.loading = true;
  try {
    learn.model = await fetchJSON(`data/model.json?t=${Date.now()}`);
    learn.error = null;
    // estudo retroativo (scripts/retro-study.mjs): prévia, só exibição
    learn.retro = await fetchJSON(`data/model-retro.json?t=${Date.now()}`).catch(() => learn.retro);
    // velocidade do fluxo (scripts/train-speed.mjs e scripts/speed-study.mjs): diário próprio + estudo retroativo
    learn.speed = await fetchJSON(`data/speed-model.json?t=${Date.now()}`).catch(
      () => learn.speed ?? null,
    );
    learn.speedStudy = await fetchJSON(`data/speed-study.json?t=${Date.now()}`).catch(() => learn.speedStudy ?? null); // prettier-ignore
  } catch (e) {
    learn.error = e.message;
  } finally {
    learn.at = Date.now();
    learn.loading = false;
  }
  if (["sim", "trig"].includes(state.prefs.tab)) hooks.render();
}

const dateBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "–");

/** Faixa no topo: modelo final atingido (ou degradação depois do final). Vazio enquanto treina. */
export function finalBanner(m = learn.model) {
  if (!m?.final) return "";
  const deg = m.degraded?.length
    ? `<div class="small" style="margin-top:4px">⚠ Atenção: ${m.degraded.length} lógica(s) aprovada(s) caiu(ram) abaixo de 55% nos últimos 30 dias. Veja o Simulador antes de usar.</div>`
    : "";
  return `<div class="card model-final" role="status"><b>✅ Chegamos ao modelo final</b> (${esc(dateBR(m.finalAt))}). O Simulador terminou de aprender: ${Object.values(m.logics).filter((l) => l.status === "approved").length} lógicas aprovadas fora da amostra (as que mandam operar, com expectativa em R acima da média do universo; as de esperar, com aproveitamento ≥ 60%) e pesos estáveis há 4 retreinos. A Decisão do trader ainda usa o modelo original até você decidir aplicar. <button class="btn" data-tab="sim">Ver no Simulador</button>${deg}</div>`; // prettier-ignore
}
