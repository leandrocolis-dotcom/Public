// Marcador de tema no início de cada notificação (push com o app fechado e aviso com o app aberto).
export const TOPIC = {
  macro: "📅 DADO MACRO",
  news: "📰 NOTÍCIA",
  signal: "📈 SINAL DA CARTEIRA",
  trader: "💡 SUGESTÃO DO TRADER",
  level: "🎯 NÍVEL DE PREÇO",
  regime: "🛡 REGIME",
  mkt: "🧭 REGIME DO MERCADO",
  rev: "🔄 VIRADA DO REGIME",
  leaders: "🚀 LIDERANÇA",
  trim: "⚖️ AJUSTE DA CARTEIRA",
  more: "📋 RESUMO",
  app: "🔔 PÊNDULO",
};

/** "📅 DADO MACRO · Inflação (CPI) a/a nos EUA". */
export const topicTitle = (topic, title) => `${TOPIC[topic] ?? TOPIC.app} · ${title}`;
