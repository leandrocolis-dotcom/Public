// Faixas do regime pela nota (−100 a +100) de assets/regime-strength.js. Puro: usado pela tela (pêndulo da
// Início, histórico do regime) e pelo servidor (avisos de mudança de regime em api/push-alerts.js).

/** As 5 faixas do regime pela nota (−100 a +100) de assets/regime-strength.js. */
export const PEND_ZONES = [
  { key: "dfx", min: -100, max: -60, label: "Defesa forte", short: "DEF. FORTE", tone: "dn", word: "em defesa forte" },
  { key: "df", min: -60, max: -20, label: "Defesa", short: "DEFESA", tone: "dn", word: "defensivo" },
  { key: "nt", min: -20, max: 20, label: "Neutro", short: "NEUTRO", tone: "mid", word: "neutro" },
  { key: "rk", min: 20, max: 60, label: "Risco", short: "RISCO", tone: "up", word: "favorável ao risco" },
  { key: "rkx", min: 60, max: 100, label: "Risco forte", short: "RISCO FORTE", tone: "up", word: "com apetite forte por risco" },
]; // prettier-ignore

/** Faixa de uma nota. */
export const zoneOf = (s) => PEND_ZONES.find((z) => s < z.max || z.key === "rkx");
