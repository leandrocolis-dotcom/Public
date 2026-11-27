// Preferências de notificação por tipo (Configurações → Avisos). Funções puras.

/** Tipos que o usuário liga e desliga. "news" usa prefs.newsAlerts ("all" | "direct" | "off"). */
export const NOTIF_KINDS = [
  ["news", "Notícias da carteira", "Manchete com impacto de mercado que afeta suas posições (opinião e ruído nunca avisam). Os assuntos seguem os filtros da aba Notícias."],
  ["portfolio", "Sinais da carteira", "Entrada, saída e risco nos ativos que você tem, pelas regras da aba Sinais."],
  ["universe", "Entradas no universo", "Entradas em ETFs fora da carteira."],
  ["levels", "Níveis da carteira", "Preço perto de resistência, suporte ou stop de um ativo seu."],
  ["macro", "Calendário macro", "Assim que sai o dado (EUA, Europa, Reino Unido, Japão, China, Brasil): valor divulgado x expectativa. Alto impacto sempre; médio só quando sua carteira tem ativo na região, com 💼 e os ativos atingidos."],
  ["pairhit", "Alvo dos pares", "Par long × short (Gatilhos › Agora) bateu um alvo em % da carteira: quantas cotas vender da ponta vencedora para embolsar o alvo líquido do custo. 1 aviso por par e alvo por dia."],
  ["trim", "Ajuste da carteira", "Posição que você marcou no termômetro bull/bear: aviso quando a marcada para reduzir ganha tração de alta (ou volta ao preço médio) e quando a marcada para aumentar recua."],
  ["mktregime", "Regime do mercado", "Pêndulo da Início trocando de faixa (defesa forte, defesa, neutro, risco, risco forte) ou ganhando tração rumo à fronteira: avisa na hora, a qualquer hora em que haja bolsa ou futuro negociando."],
  ["reversal", "Virada do regime", "Radar de virada do pêndulo (pré, pregão, pós e noite pelos futuros): ⚠ quando o regime começa a virar depois de um movimento e ‼ quando a virada se confirma (metade da perna devolvida, médias cruzadas, blocos e SPY juntos); avisa também quando a virada não confirmou."],
  ["regime", "Vigia de regime", "Mudança de tendência que pede proteger o que já está ganho."],
  ["leaders", "Candidatos a liderança", "Tema da Rotação relativa ganhando tração no dia (pré, pregão e pós) com o regime a favor e os nomes puros confirmando: só confiança alta, 1 aviso por tema por dia."],
]; // prettier-ignore

/** Liga/desliga de um tipo. Sem escolha salva, segue o antigo "Sinais" (sigAlerts) e começa ligado. */
export function notifOn(prefs, kind) {
  const p = prefs ?? {};
  if (kind === "news") return (p.newsAlerts ?? "all") !== "off";
  const v = p.notif?.[kind];
  return typeof v === "boolean" ? v : p.sigAlerts !== "off";
}

/** Nova escolha (sem alterar o objeto original). */
export function setNotif(prefs, kind, on) {
  if (kind === "news")
    return { ...prefs, newsAlerts: on ? (prefs.newsAlertsLast ?? "all") : "off", ...(on ? {} : { newsAlertsLast: prefs.newsAlerts !== "off" ? (prefs.newsAlerts ?? "all") : "all" }) }; // prettier-ignore
  return { ...prefs, notif: { ...(prefs.notif ?? {}), [kind]: !!on } };
}

/** Algum aviso ligado (para vigiar com a janela fora da tela). */
export const anyNotifOn = (prefs) => NOTIF_KINDS.some(([k]) => notifOn(prefs, k));

/** O que o servidor de push precisa saber. */
export const pushKinds = (prefs) =>
  Object.fromEntries(
    NOTIF_KINDS.filter(([k]) => k !== "news").map(([k]) => [k, notifOn(prefs, k)]),
  );
