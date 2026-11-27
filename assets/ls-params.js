// Long & Short: parâmetros e regras (espelho de docs/long-short/pendulo-regras.json, schema v4). Puro.
// Mudou o JSON? Atualize aqui: tests/ls-params.test.js compara os dois e acusa diferença.
// O usuário ajusta parâmetros sem mexer em lógica: overrides em pendulo.ls.params (nuvem, pendulo_settings).

export const SCHEMA_VERSION = 4;
export const PARAMS_VERSION = "2026-11-27";

export const PARAMS = Object.freeze({
  risco_por_ponta_pct_capital: 0.5,
  perda_diaria_max_pct_capital: 2,
  perda_semanal_max_pct_capital: 5,
  drawdown_suspensao_pct: 15,
  perdas_seguidas_pausa: 3,
  pausa_perdas_min: 30,
  stop_inicial_atr_intraday: 1.5,
  faixa_abertura_min: 15,
  volume_confirmacao_mult: 1.5,
  gap_max_atr: 1.5,
  cruzamentos_vwap_lateral: 4,
  reducao_ponta_perdedora: [0.33, 0.5],
  pyramiding_lote_max_vs_anterior: 0.5,
  pyramiding_max_aumentos_dia: 2,
  pyramiding_r_minimo: 1,
  pyramiding_corte_horario: "15:00",
  parcial_r: 2,
  esticado_r: 3,
  devolucao_reduzir_pct: 50,
  devolucao_zerar_pct: 75,
  intervalo_ajuste_min: 10,
  reentrada_apos_stop_min: 15,
  exposicao_bruta_max_x_capital: 2,
  exposicao_liquida_max_x_capital: 1.5,
  concentracao_max_pct_capital: 25,
  evento_tamanho_mult: 0.5,
  evento_espera_min: 30,
  overnight_checagem_horario: "15:45",
  overnight_vix_max: 25,
  overnight_atr_percentil_max: 80,
  overnight_tamanho_max_vs_intraday: 0.5,
  overnight_prazo_max_pregoes: {
    "3x": 5,
    "2x": 10,
  },
  decaimento_gap_max_pp: 3,
  esticado_atr_d: 1,
  atr_intra_candle_min: 15,
  atr_periodo: 14,
  candle_coleta_min: 5,
  pre_tamanho_mult: 0.5,
  spread_max_pct: 0.3,
  reducao_ponta_perdedora_limiar_r: -0.75,
  overnight_checagem_pos_horario: "19:45",
  limite_venda_estendida_mult: 0.995,
  dedupe_alerta_min: 15,
  balanco_pos_reduzir_para: 0.25,
  teto_risco_r: 4,
  cotacao_max_s_regular: 10,
  cotacao_max_s_estendida: 30,
  max_entradas_dia: 6,
  max_stops_ativo_dia: 2,
  max_alertas_risco_ignorados_30min: 2,
  correlacao_min_par: 0.5,
  janela_beta_corr_pregoes: 60,
  limite_cobertura_estendida_mult: 1.005,
  etf_divergencia_alerta_pp: 25,
  desvio_direcional_max_x_capital: 0.25,
  aluguel_base_dias: 360,
});

/** 33 alertas: id, grupo, prioridade (critico/atencao/acao/info), bloqueia (true/false/"compras"/texto) e mensagem. */
export const ALERTS = Object.freeze([
  {
    id: "PRE-01",
    grupo: "pre_mercado",
    prioridade: "critico",
    bloqueia: true,
    mensagem: "Sem plano, sem trade. Preencha o plano do dia.",
  },
  {
    id: "PRE-02",
    grupo: "pre_mercado",
    prioridade: "atencao",
    bloqueia: false,
    mensagem: "Dia de evento: tamanho 50%, nada até 30 min após.",
  },
  {
    id: "PRE-03",
    grupo: "pre_mercado",
    prioridade: "atencao",
    bloqueia: false,
    mensagem: "Gap grande: entrada só depois da faixa de abertura.",
  },
  {
    id: "CAL-01",
    grupo: "calendario",
    prioridade: "critico",
    bloqueia: "compras",
    mensagem: "Sessão especial: janelas recalculadas. Compras bloqueadas até validar.",
  },
  {
    id: "SES-01",
    grupo: "sessao",
    prioridade: "atencao",
    bloqueia: false,
    mensagem: "Sessão estendida: só limitada, tamanho 50%.",
  },
  {
    id: "SES-02",
    grupo: "sessao",
    prioridade: "critico",
    bloqueia: "compras",
    mensagem: "Spread de {x}% em {ativo}: sem entradas agora.",
  },
  {
    id: "SES-03",
    grupo: "sessao",
    prioridade: "critico",
    bloqueia: false,
    mensagem: "Stop atingido fora do pregão: zere {ativo} ({lado}) com limitada a {limite}.",
  },
  {
    id: "EXE-01",
    grupo: "execucao",
    prioridade: "critico",
    bloqueia: "compras",
    mensagem: "Preço não confiável em {ativo}: entradas bloqueadas.",
  },
  {
    id: "EXE-02",
    grupo: "execucao",
    prioridade: "atencao",
    bloqueia: false,
    mensagem: "Execução parcial: residual de {q} {ativo}. Registre ou cancele.",
  },
  {
    id: "ETF-01",
    grupo: "etf",
    prioridade: "critico",
    bloqueia: true,
    mensagem:
      "Possível evento corporativo em {ativo}: ordens suspensas. Confirme o fator; o app não altera a carteira sozinho.",
  },
  {
    id: "SHR-01",
    grupo: "short",
    prioridade: "critico",
    bloqueia: true,
    mensagem:
      "Short sem aluguel: abertura bloqueada. Com recall: COMPRAR PARA COBRIR {q} {ativo} agora (sem intervalo).",
  },
  {
    id: "INT-01",
    grupo: "intradiario",
    prioridade: "atencao",
    bloqueia: false,
    mensagem: "Faixa de abertura em formação. Só observe.",
  },
  {
    id: "INT-02",
    grupo: "intradiario",
    prioridade: "info",
    bloqueia: false,
    mensagem: "Rompimento confirmado em {ativo}. Gatilho do plano liberado.",
  },
  {
    id: "INT-03",
    grupo: "intradiario",
    prioridade: "atencao",
    bloqueia: false,
    mensagem: "Dia lateral: sem aumentos. Decaimento trabalhando contra.",
  },
  {
    id: "PAR-01",
    grupo: "par",
    prioridade: "atencao",
    bloqueia: "pyramiding (correlacao) / entradas e aumentos (desvio)",
    mensagem: "Par fora do planejado ({motivo}): reequilibre ou revise o plano.",
  },
  {
    id: "DEC-01",
    grupo: "decisao",
    prioridade: "acao",
    bloqueia: false,
    mensagem: "Mercado confirmou {A}. {lado} {q} de {B} e suba o stop de {A}.",
  },
  {
    id: "DEC-02",
    grupo: "decisao",
    prioridade: "critico",
    bloqueia: true,
    mensagem: "Preço médio para baixo é proibido.",
  },
  {
    id: "DEC-03",
    grupo: "decisao",
    prioridade: "critico",
    bloqueia: true,
    mensagem: "Aumento bloqueado: {limite que travou}.",
  },
  {
    id: "DEC-04",
    grupo: "decisao",
    prioridade: "acao",
    bloqueia: false,
    mensagem: "{lado} {q} de {ativo} (1/3) e suba o stop.",
  },
  {
    id: "DEC-05",
    grupo: "decisao",
    prioridade: "acao",
    bloqueia: false,
    mensagem: "Movimento esticado: {lado} {q} de {ativo}.",
  },
  {
    id: "DEC-06",
    grupo: "decisao",
    prioridade: "acao",
    bloqueia: false,
    mensagem: "Devolveu metade do movimento: {lado} {q} de {ativo}.",
  },
  {
    id: "DEC-07",
    grupo: "decisao",
    prioridade: "critico",
    bloqueia: false,
    mensagem: "Zere {ativo} ({lado} {q}). Regra, não opinião.",
  },
  {
    id: "DEC-08",
    grupo: "decisao",
    prioridade: "atencao",
    bloqueia: false,
    mensagem: "Espere {mm:ss}. Uma mudança por vez.",
  },
  {
    id: "RSK-01",
    grupo: "risco",
    prioridade: "critico",
    bloqueia: true,
    mensagem: "Limite diário atingido. Zere tudo e feche o app.",
  },
  {
    id: "RSK-02",
    grupo: "risco",
    prioridade: "critico",
    bloqueia: true,
    mensagem: "Pausa de 30 min. Revise o diário antes de voltar.",
  },
  {
    id: "RSK-03",
    grupo: "risco",
    prioridade: "critico",
    bloqueia: "compras",
    mensagem: "Exposição acima do limite: {lado} {q} de {ativo}.",
  },
  {
    id: "RSK-04",
    grupo: "risco",
    prioridade: "critico",
    bloqueia: "compras",
    mensagem: "Risco total no teto ({x}R): só reduções.",
  },
  {
    id: "BEH-01",
    grupo: "comportamento",
    prioridade: "critico",
    bloqueia: "compras",
    mensagem: "Padrão impulsivo: entradas bloqueadas até amanhã.",
  },
  {
    id: "BEH-02",
    grupo: "comportamento",
    prioridade: "critico",
    bloqueia: "compras",
    mensagem: "Limite de tentativas: {ativo ou todos} bloqueado até amanhã.",
  },
  {
    id: "POS-01",
    grupo: "fechamento",
    prioridade: "acao",
    bloqueia: false,
    mensagem: "Balanço no pós: zere ou reduza {ativo} a 25% antes das 16:00.",
  },
  {
    id: "EOD-01",
    grupo: "fechamento",
    prioridade: "acao",
    bloqueia: false,
    mensagem: "Checagem de overnight: {n} de 5 filtros atendidos. Se não for 5, zere.",
  },
  {
    id: "EOD-02",
    grupo: "fechamento",
    prioridade: "acao",
    bloqueia: false,
    mensagem: "Fim do pós: {n} de 5 filtros. Se não for 5, zere agora com limitada.",
  },
  {
    id: "SWG-01",
    grupo: "swing",
    prioridade: "acao",
    bloqueia: false,
    mensagem: "Decaimento ou prazo estourado em {ativo}: sair.",
  },
]);

/** Lado da ordem por finalidade e dir (+1 comprado no ETF, -1 vendido a descoberto). */
export const SIDE = Object.freeze({
  REDUZIR: {
    "+1": "VENDER",
    "-1": "COMPRAR_PARA_COBRIR",
  },
  AUMENTAR: {
    "+1": "COMPRAR",
    "-1": "VENDER_A_DESCOBERTO",
  },
});

export const PYRAMID_TRIGGERS = Object.freeze([
  "pnl_r_ponta>=1",
  "ponta oposta ja reduzida",
  "rompimento novo vol_rel>=1.5 e lado_vwap a favor",
  "lote<=0.5*ultimo",
  "risco aberto da ponta apos ajuste<=R (sem credito de lucro)",
  "aumentos_hoje<2, hora<15:00 (ou fechamento antecipado -1h), sessao REGULAR",
  "correlacao_60d>=correlacao_min_par",
]);
export const NEVER_BLOCKED = Object.freeze(["P0", "P1", "P2", "P3", "P4"]);
export const COOLDOWN_APPLIES = Object.freeze(["P5", "P6", "P7"]);
export const ORDER_STATES = Object.freeze([
  "SUGERIDA",
  "ENVIADA",
  "PARCIAL",
  "EXECUTADA",
  "CANCELADA",
  "REJEITADA",
  "EXPIRADA",
]);

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parâmetros vigentes = padrão do JSON + o que o usuário mudou. Override inválido (tipo diferente, número
 * não finito ou ≤ 0 onde o padrão é > 0, horário fora de HH:MM, chave desconhecida) NÃO entra: volta em
 * `errors` para a tela mostrar, em vez de virar zero silencioso. Devolve { params, errors, changed }.
 */
export function resolveParams(user = {}) {
  const params = { ...PARAMS };
  const errors = [];
  const changed = [];
  for (const [k, v] of Object.entries(user ?? {})) {
    const base = PARAMS[k];
    if (base === undefined) {
      errors.push(`${k}: parâmetro desconhecido`);
      continue;
    }
    if (typeof base === "number") {
      if (typeof v !== "number" || !Number.isFinite(v) || (base > 0 && v <= 0)) {
        errors.push(`${k}: número inválido`);
        continue;
      }
    } else if (typeof base === "string") {
      if (typeof v !== "string" || !HHMM.test(v)) {
        errors.push(`${k}: horário inválido (use HH:MM)`);
        continue;
      }
    } else if (Array.isArray(base)) {
      if (
        !Array.isArray(v) ||
        v.length !== base.length ||
        !v.every((x) => Number.isFinite(x) && x > 0)
      ) {
        errors.push(`${k}: lista inválida`);
        continue;
      }
    } else if (typeof base === "object") {
      if (!v || typeof v !== "object" || Object.keys(base).some((kk) => !(Number(v[kk]) > 0))) {
        errors.push(`${k}: valores inválidos`);
        continue;
      }
    }
    params[k] = v;
    changed.push(k);
  }
  return { params: Object.freeze(params), errors, changed };
}

/** "15:45" → minutos do dia (945). */
export const hhmm = (s) => {
  if (!HHMM.test(String(s))) throw new Error(`horário inválido: ${s}`);
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export const alertDef = (id) => ALERTS.find((a) => a.id === id) ?? null;
