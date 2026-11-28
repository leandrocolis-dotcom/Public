// Botão "Atualizar BTG": dispara a leitura na nuvem (rotina do Claude "BTG carteira na nuvem"). Sempre na nuvem,
// nunca no Mac (23/11/2026). Só avisa sucesso com a foto nova gravada.
import { hooks, state } from "./state.js";
import { toast } from "./widgets.js";
import * as cloud from "./cloud.js";
import { syncCloud } from "./cloud-sync.js";
import { btgFireDone } from "./btg.js";

const CLOUD_POLL_MS = 4000;
/** Espera máxima pela foto nova. Uma leitura que funciona leva ~1–2 min (sessão na nuvem + 3 chamadas ao BTG +
 *  conferência); passar disso quase sempre é a rotina sem o conector BTG, então avisa logo em vez de 8 min. */
export const CLOUD_LIMIT_MS = 4 * 60000;
/** Duas contas do Claude (o conector do BTG só fica ativo numa por vez): a principal tem prioridade; sem foto nova
 *  em 90 s (uma leitura boa grava em ~50–60 s; sessão sem o conector termina em ~11 s sem gravar), o app pede a 2ª
 *  conta (btg-fire { fallback: true }), se ela estiver configurada. */
export const FALLBACK_AFTER_MS = 90000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const setBusy = (busy, startedAt = state.btgSync?.startedAt) => {
  state.btgSync = busy ? { busy, startedAt: startedAt ?? Date.now() } : { busy };
  hooks.render();
};

/** Aviso de quando a nuvem não grava no prazo: a causa mais comum e onde resolver. */
export const BTG_SLOW_MSG =
  "BTG: a leitura na nuvem não gravou. A causa mais comum é o conector BTG desconectado na conta do Claude da rotina (ele cai quando você conecta o BTG na outra conta): reconecte em claude.ai › Configurações › Conectores › BTGPactual. A Carteira segue com a última foto e atualiza sozinha se a leitura gravar depois."; // prettier-ignore

/** Horários da leitura automática na nuvem (dias úteis, Brasília): tarefa agendada "BTG carteira na nuvem". */
export const BTG_CLOUD_TIMES = ["10h41", "13h41", "16h41", "19h41", "22h41"];

export function btgFailMsg(why) {
  if (why === "nuvem_off")
    return `O botão ainda não dispara a leitura na nuvem (falta ligar o token da rotina). A foto do BTG se atualiza sozinha na nuvem nos dias úteis às ${BTG_CLOUD_TIMES.join(", ")}.`;
  if (/paused/i.test(why ?? ""))
    return "BTG: a rotina ligada ao botão está pausada. Em claude.ai › Code › Rotinas, abra a rotina do BTG e retome (ou gere o token da API da rotina ativa e troque os segredos BTG_ROUTINE_URL/BTG_ROUTINE_TOKEN da função btg-fire). A Carteira segue com a última foto."; // prettier-ignore
  if (/HTTP 40[13]|unauthori[sz]ed|forbidden|invalid.*token/i.test(why ?? ""))
    return "BTG: o token da rotina do botão foi recusado (expirou ou foi trocado). Gere um novo em claude.ai › Code › Rotinas › BTG › API e grave em BTG_ROUTINE_TOKEN da função btg-fire. A Carteira segue com a última foto."; // prettier-ignore
  return `BTG não atualizado (${why || "falha na leitura"}). A Carteira segue com a última foto.`;
}

/**
 * A rotina anotou que tentou e NÃO gravou (pendulo_btg_note) depois do disparo? Devolve o motivo; o app para de
 * esperar na hora. `since` = hora do disparo (ISO).
 */
export function btgTryFailed(b, since) {
  const t = Date.parse(b?.tryAt ?? "");
  const s = Date.parse(since ?? "");
  if (!Number.isFinite(t) || !Number.isFinite(s) || t < s - 5000) return null;
  if (Date.parse(b?.syncedAt ?? "") >= t) return null; // gravou depois da anotação
  return b.tryDetail || "a leitura na nuvem não gravou";
}

/** Pela nuvem: dispara a rotina e espera a foto nova (synced_at muda; ~1–2 min quando a rotina tem o conector). */
async function viaCloud(fire, onChanged) {
  const done = btgFireDone(fire);
  const before = done ? -1 : Date.parse(fire.syncedAt ?? "") || 0;
  const start = Date.now();
  let until = start + CLOUD_LIMIT_MS;
  let second = !(fire.hasFallback && !done); // 2ª conta já tentada (ou não há)
  let b = done ? await cloud.pullBroker().catch(() => null) : null;
  let failed = null;
  while (!(Date.parse(b?.syncedAt ?? "") > before) && Date.now() < until) {
    await wait(CLOUD_POLL_MS);
    b = await cloud.pullBroker().catch(() => b);
    failed = done ? null : btgTryFailed(b, fire.since);
    if (failed && (second || !fire.hasFallback)) break;
    if (
      !second &&
      !(Date.parse(b?.syncedAt ?? "") > before) &&
      Date.now() - start >= FALLBACK_AFTER_MS
    ) {
      second = true;
      const f2 = await cloud.fireBtg({ fallback: true }).catch(() => null);
      if (f2?.ok) {
        toast("BTG: a conta principal não respondeu; tentando a segunda conta do Claude…", "warn", 8000); // prettier-ignore
        until = Math.max(until, Date.now() + 3 * 60000);
      }
    }
    hooks.render(); // o botão mostra há quanto tempo espera
  }
  if (!(Date.parse(b?.syncedAt ?? "") > before))
    return toast(failed ? `BTG não atualizado: ${failed} A Carteira segue com a última foto.` : BTG_SLOW_MSG, "err", 16000); // prettier-ignore
  if (await syncCloud({ force: true })) onChanged?.();
  if (b.status === "rejected") return toast(btgFailMsg(b.statusDetail), "err");
  toast("Posições e valores atualizados do BTG.", "ok");
}

/** `reconnected`: o usuário refez o login do conector BTG no claude.ai ("Reconectei"): marca a hora e lê na hora. */
export async function refreshBtg(onChanged, { reconnected = false } = {}) {
  if (state.btgSync?.busy) return;
  if (!cloud.cloudUser()) return toast("Entre na sua conta para atualizar do BTG.", "err");
  setBusy(true);
  try {
    const fire = await cloud
      .fireBtg({ reconnected })
      .catch((e) => ({ ok: false, why: cloud.authMessage(e) }));
    if (fire?.ok) return await viaCloud(fire, onChanged);
    toast(btgFailMsg(fire?.why), fire?.why === "nuvem_off" ? "warn" : "bad", 14000);
  } catch (e) {
    toast(btgFailMsg(cloud.authMessage(e)), "err");
  } finally {
    setBusy(false);
  }
}
