// Long & Short: TODOS os textos de ajuda (ⓘ) da tela, chaveados pelo id do campo (seção 9 de
// docs/PLANO-LONG-SHORT.md, extraídos por script). A tela nunca escreve texto de ajuda direto no componente.
// Estrutura fixa: o que é · como ler · o que fazer. Valores entre chaves são preenchidos na hora (tipText).

export const TIPS = Object.freeze({
  sessao: {
    que: "Fase do dia de negociação nos EUA: PRÉ (4:00–9:30 ET), REGULAR (9:30–16:00), PÓS (16:00–20:00) ou FECHADO",
    ler: "Cada sessão tem regras próprias de tamanho, tipo de ordem e aumentos",
    fazer: "No PRÉ e no PÓS, use só ordem limitada; no PÓS, só reduza ou zere",
  },
  relogio: {
    que: "Hora em Nova York e em Brasília",
    ler: "Regras são definidas em ET; a diferença muda com o horário de verão americano",
    fazer: "Guie-se pelo horário ET nas regras",
  },
  proximo_marco: {
    que: "Próximo horário que muda o que é permitido",
    ler: "Ex.: fim da faixa de abertura, 15:00 (fim dos aumentos), 15:45 (checagem de overnight)",
    fazer: "Termine o que precisa antes do marco",
  },
  semaforo_travas: {
    que: "Estado das travas de risco da carteira",
    ler: "Cinza ✓: nada ativo; âmbar: algum indicador acima de 80% do limite; rosa: trava ativa",
    fazer: "Âmbar: não aumente risco; rosa: só reduza ou zere",
  },
  plano_dia: {
    que: "Seu plano escrito antes da primeira ordem",
    ler: "Sem plano, o app bloqueia compras",
    fazer: "Preencha viés, gatilho e exposição direcional de cada par",
  },
  dia_especial: {
    que: "Feriado ou fechamento antecipado da bolsa",
    ler: "As janelas do dia foram recalculadas",
    fazer: "Confira os novos horários antes de operar",
  },
  pnl_dia: {
    que: "Resultado do dia desde as 4:00 ET, aberto + realizado, em US$, R e %",
    ler: "Inclui o gap da noite; 1R = US$ {R}",
    fazer: "Se chegar a −4R (−2%), o app manda zerar tudo",
  },
  limite_restante: {
    que: "Quanto você ainda pode perder hoje antes do bloqueio",
    ler: "Barra cheia = longe do limite",
    fazer: "Abaixo de 20%: não abra nada novo",
  },
  exp_bruta: {
    que: "Soma das exposições de todas as posições, já multiplicadas pela alavancagem, em vezes o capital",
    ler: "Mede o tamanho total da aposta; limite 2,0x",
    fazer: "Perto do limite, reduza antes de aumentar qualquer coisa",
  },
  exp_liquida: {
    que: "Exposição comprada menos vendida, ajustada pela alavancagem, em vezes o capital",
    ler: "Positivo = apostando na alta; negativo = na baixa; limite ±1,5x",
    fazer: "Fora do que você planejou? Reduza o lado dominante",
  },
  risco_aberto_total: {
    que: "Quanto você perderia se todos os stops fossem atingidos agora, em R",
    ler: "Teto = menor entre 4R e o limite diário restante",
    fazer: "No teto, só reduções são permitidas (RSK-04)",
  },
  R: {
    que: "Valor de 1R: o quanto você aceita perder por ponta (0,5% do capital)",
    ler: "Todas as quantidades são calculadas a partir dele",
    fazer: "Para arriscar menos, reduza o 1R nos Parâmetros, nunca o stop",
  },
  drawdown: {
    que: "Queda do capital desde o pico",
    ler: "Limite −15%",
    fazer: "Atingiu: pausa de 2 semanas para revisar o diário",
  },
  ordens_agora: {
    que: "Lista do que fazer agora, por prioridade",
    ler: "De cima para baixo: risco primeiro, oportunidade depois",
    fazer: "Execute na ordem; ignore só com motivo",
  },
  acao: {
    que: "O que fazer: VENDER, COMPRAR, COMPRAR PARA COBRIR, VENDER A DESCOBERTO, ZERAR, MANTER ou BLOQUEADO",
    ler: "Rosa reduz risco; verde-menta aumenta; cinza está bloqueado ou é manter",
    fazer: "Execute exatamente a ação e a quantidade indicadas",
  },
  quantidade: {
    que: "Número de cotas da ordem",
    ler: "Calculado por risco (1R), concentração, exposição e teto de risco",
    fazer: "Não arredonde para cima",
  },
  preco_limite: {
    que: "Preço máximo (compra) ou mínimo (venda) sugerido",
    ler: "Regular: ask/bid; pré e pós: com folga para executar",
    fazer: "Use ordem limitada neste preço",
  },
  stop_proposto: {
    que: "Novo stop após a ordem",
    ler: "O stop só se aproxima do preço, nunca se afasta",
    fazer: "Atualize o stop na corretora ao executar",
  },
  motivo: {
    que: "Regra que gerou a ordem (ID do alerta ou prioridade)",
    ler: "P0–P4 são saídas de risco; P5 parcial; P6 aumento; P7 entrada",
    fazer: "Toque para ver a regra completa",
  },
  bloqueado: {
    que: "Ordem que as regras não permitem agora",
    ler: "O motivo mostra o limite que travou",
    fazer: "Não force; resolva o motivo ou espere",
  },
  executei: {
    que: "Registra o que você executou de fato",
    ler: "Quantidade menor que a sugerida vira execução parcial",
    fazer: "Informe quantidade, preço e custos reais",
  },
  ignorar: {
    que: "Marca que você decidiu não seguir",
    ler: "Conta no diário; 2 alertas de risco ignorados em 30 min bloqueiam entradas",
    fazer: "Escreva o motivo; ele serve para revisar depois",
  },
  residual: {
    que: "Parte de uma ordem que ainda não foi executada",
    ler: "Enquanto o saldo estiver aberto, não surge nova ordem com o mesmo objetivo",
    fazer: "Marque se o saldo ainda está aberto na corretora ou se foi cancelado",
  },
  cenario: {
    que: "Situação do par (1 a 9) pela matriz de decisão",
    ler: "Ex.: 1 = long certo e short errado; 5 = dia lateral",
    fazer: "Siga a ordem gerada; o rótulo é contexto",
  },
  pnl_par: {
    que: "Soma do P&L das duas pontas, em R",
    ler: "É o resultado da aposta de força relativa",
    fazer: "Devolveu 50% do máximo do dia: reduza; 75%: zere",
  },
  direcional_efetiva: {
    que: "Exposição do par ajustada pelo beta de cada subjacente contra o S&P 500",
    ler: "Mostra quanto o par aposta na direção do mercado",
    fazer: "Diferença acima de 0,25x do plano bloqueia aumentos: reequilibre ou revise o plano",
  },
  direcional_planejada: {
    que: "A exposição direcional que você definiu no plano (0 = neutro)",
    ler: "É a referência para a efetiva",
    fazer: "Mude só no plano, de forma deliberada",
  },
  correlacao: {
    que: "Correlação dos retornos diários dos dois subjacentes, 60 pregões",
    ler: "Abaixo de 0,50 o par deixa de se proteger",
    fazer: "Abaixo do mínimo, sem aumentos (PAR-01)",
  },
  mesmo_subjacente: {
    que: "Pontas no mesmo índice, uma bull e outra bear",
    ler: "Exposição perto de zero e decaimento em dobro",
    fazer: "Repense a estrutura: use subjacentes diferentes",
  },
  checklist_pyramiding: {
    que: "Os 7 gatilhos obrigatórios para aumentar a ponta vencedora",
    ler: "Todos ✓ = aumento liberado",
    fazer: "Um ✗ basta para não aumentar",
  },
  perna: {
    que: "Lado da ponta no par: long ou short",
    ler: "Short pode ser compra de ETF inverso ou venda a descoberto",
    fazer: "Confira o tipo antes de operar",
  },
  alavancagem_tipo: {
    que: "Multiplicador diário (2x/3x) e direção (bull/bear) do ETF",
    ler: "Bear sobe quando o subjacente cai",
    fazer: "",
  },
  quantidade_pos: {
    que: "Cotas que você tem",
    ler: "Vem da aba Carteira",
    fazer: "Corrija na Carteira se divergir da corretora",
  },
  preco_medio: {
    que: "Custo médio da posição",
    ler: "Não entra na decisão; serve só para o P&L",
    fazer: 'Nunca aumente para "melhorar o preço médio"',
  },
  pnl_r_ponta: {
    que: "Resultado da ponta em R",
    ler: "+1R = ganhou o que aceitava perder",
    fazer: "Em +1R, suba o stop; em +2R, parcial de 1/3",
  },
  stop_vigente: {
    que: "Preço de saída obrigatória",
    ler: "Só se aproxima do preço; nunca se afasta",
    fazer: "Mantenha a ordem de stop na corretora; fora do pregão, o app avisa",
  },
  hwm: {
    que: "Melhor preço a favor desde a última mudança de preço médio",
    ler: "Base para medir a devolução",
    fazer: "",
  },
  devolucao: {
    que: "Quanto do melhor movimento o preço já devolveu",
    ler: "50% = reduzir metade; 75% = zerar",
    fazer: "Siga a ordem gerada",
  },
  lado_vwap: {
    que: "Se o subjacente está do lado que favorece a ponta, em relação à VWAP",
    ler: '"A favor" sustenta a posição',
    fazer: "Contra a VWAP, não aumente",
  },
  concentracao: {
    que: "Peso da posição no capital",
    ler: "Limite 25%",
    fazer: "No limite, aumentos bloqueados",
  },
  decaimento: {
    que: "Diferença entre o que o ETF rendeu e alavancagem × subjacente, desde a entrada",
    ler: "Acima de 3 p.p. contra você, a volatilidade está comendo o resultado",
    fazer: "Saia (SWG-01)",
  },
  pregoes_carregados: {
    que: "Fechamentos desde a entrada",
    ler: "Máximo 5 (3x) ou 10 (2x)",
    fazer: "Venceu: saia, ganhando ou perdendo",
  },
  spread: {
    que: "Diferença entre compra e venda, em % do preço",
    ler: "Acima de 0,30%, o custo de entrar é alto",
    fazer: "Não entre agora; reduzir continua permitido",
  },
  idade_cotacao: {
    que: "Segundos desde a última cotação",
    ler: "Acima de 10 s (regular) ou 30 s (pré/pós), o preço não é confiável",
    fazer: "Espere a atualização; entradas ficam bloqueadas",
  },
  aluguel: {
    que: "Custo diário de manter a venda a descoberto",
    ler: "Valor vendido × taxa anual ÷ 360",
    fazer: "Taxa alta corrói o resultado de posições longas",
  },
  recall: {
    que: "Pedido da corretora para devolver as cotas alugadas",
    ler: "Gera ordem de cobertura imediata",
    fazer: "Cubra a posição já",
  },
  vwap: {
    que: "Preço médio do dia ponderado por volume, desde 9:30",
    ler: "Acima = compradores no controle; abaixo = vendedores",
    fazer: "Só aumente long acima; short (ou ETF bear) abaixo",
  },
  vwap_estendida: {
    que: "VWAP desde as 4:00, usada no pré e no pós",
    ler: "Referência quando o pregão regular não começou",
    fazer: "Mesma leitura da VWAP",
  },
  vwap_aproximada: {
    que: "Aviso de que o coletor não tem volume",
    ler: "A VWAP vira média por tempo e o filtro de volume desliga",
    fazer: "Dê menos peso aos sinais de rompimento",
  },
  faixa_abertura: {
    que: "Máxima e mínima de 9:30 a 9:45",
    ler: "Rompimento com volume indica a direção do dia",
    fazer: "Não opere dentro da faixa nos primeiros 15 min",
  },
  pmh_pml: {
    que: "Máxima e mínima do pré-mercado",
    ler: "Rompidas na abertura, reforçam o sinal",
    fazer: "Use como confirmação extra",
  },
  gap: {
    que: "Distância entre o preço e o fechamento anterior, em % e em ATR diário",
    ler: "Acima de 1,5 ATR, a abertura tende a ser instável",
    fazer: "Entre só depois da faixa de abertura",
  },
  cruzamentos_vwap: {
    que: "Quantas vezes o preço trocou de lado da VWAP no dia",
    ler: "4 ou mais = dia lateral",
    fazer: "Sem aumentos; o decaimento joga contra",
  },
  atr_intra: {
    que: "Oscilação típica em candles de 15 min",
    ler: "Define a distância do stop (1,5×)",
    fazer: "",
  },
  atr_d: {
    que: "Oscilação típica diária",
    ler: "Mede gap e movimento esticado (1 ATR)",
    fazer: "",
  },
  vies: {
    que: "Tendência diária pela média de 20 dias e sua inclinação",
    ler: "Alta, baixa ou neutro",
    fazer: "Neutro: metade do tamanho",
  },
  volume_relativo: {
    que: "Volume do candle contra a média da faixa de abertura",
    ler: "≥ 1,5x confirma rompimento",
    fazer: "Rompimento sem volume não conta",
  },
  beta: {
    que: "Sensibilidade do subjacente ao S&P 500 em 60 pregões",
    ler: "Beta 1,5 anda 1,5% para cada 1% do índice",
    fazer: "Usado na exposição direcional do par",
  },
  alertas: {
    que: "Últimos 20 avisos das regras",
    ler: "Rosa ‼ crítico, periwinkle ação sugerida, âmbar atenção, cinza informação",
    fazer: "Críticos primeiro; toque para ver a regra",
  },
  prioridade_critico: {
    que: "Alerta que bloqueia ou exige ação imediata",
    ler: "Fica fixo até você confirmar a leitura",
    fazer: "Aja antes de qualquer outra coisa",
  },
  diario: {
    que: "Registro de alertas seguidos e ignorados e do resultado de cada grupo",
    ler: "Comparação que mostra se as regras pagam",
    fazer: "Revise no fim do dia e no fim das 2 semanas",
  },
  pnl_liquido: {
    que: "Resultado depois de corretagem, taxas e aluguel",
    ler: "É o número que importa",
    fazer: "Custos altos? Opere menos vezes",
  },
  pnl_brl: {
    que: "Resultado em reais, cada fluxo pelo câmbio do seu dia",
    ler: "Diferente de multiplicar o total pelo câmbio de hoje",
    fazer: "Use para o controle patrimonial, não para decidir ordens",
  },
  exec_quantidade: {
    que: "Cotas executadas de fato",
    ler: "Menor que a sugerida = execução parcial",
    fazer: "Informe o número da nota da corretora",
  },
  exec_preco: {
    que: "Preço médio executado",
    ler: "Base do novo preço médio e do stop",
    fazer: "Use o preço da nota, não o da tela",
  },
  exec_custos: {
    que: "Corretagem e taxas da execução",
    ler: "Entram no P&L líquido",
    fazer: "Copie da nota da corretora",
  },
  saldo_status: {
    que: "Situação do restante de uma execução parcial",
    ler: "Aberto bloqueia nova ordem igual; encerrado libera o motor",
    fazer: "Confira na corretora antes de responder",
  },
  plano_vies: {
    que: "Sua leitura de direção para o par hoje",
    ler: "Alta, baixa ou neutro",
    fazer: "Baseie no gráfico diário, antes do mercado abrir",
  },
  plano_gatilho: {
    que: "Preço ou condição que libera a entrada",
    ler: "Sem gatilho atingido, nada de entrada",
    fazer: "Escreva um número, não uma intenção",
  },
  plano_direcional: {
    que: "Exposição direcional que o par pode ter (beta-ajustada)",
    ler: "0 = neutro; positivo = viés de alta",
    fazer: "Defina antes de operar; mudar no meio do dia é sinal de impulso",
  },
  evento_corporativo: {
    que: "Split, grupamento ou mudança de ticker detectado ou cadastrado",
    ler: "Ordens no ativo ficam suspensas",
    fazer: "Confirme o fator pelo comunicado do emissor ou extrato; o app só ajusta depois disso",
  },
  param_r: {
    que: "Percentual do capital arriscado por ponta",
    ler: "Padrão 0,5%; faixa 0,25% a 1%",
    fazer: "Reduza em fases ruins; aumente só com histórico positivo no diário",
  },
  param_perda_diaria: {
    que: "Perda máxima do dia",
    ler: "Padrão 2%",
    fazer: "Não aumente depois de um dia ruim",
  },
  param_stop_atr: {
    que: "Múltiplo do ATR que define o stop",
    ler: "Padrão 1,5",
    fazer: "Stop mais largo = posição menor, mesmo risco",
  },
  param_spread: {
    que: "Spread máximo para entrar",
    ler: "Padrão 0,30%",
    fazer: "Mais apertado no pré e no pós protege de execução ruim",
  },
  param_desvio_direcional: {
    que: "Desvio máximo entre exposição efetiva e planejada",
    ler: "Padrão 0,25x o capital",
    fazer: "Menor = disciplina maior no hedge",
  },
  param_aluguel_base: {
    que: "Base de dias do custo de aluguel",
    ler: "Padrão 360",
    fazer: "Ajuste para a convenção da sua corretora",
  },
});

/** Texto da dica com {chaves} preenchidas; chave desconhecida é erro (a tela não pode mostrar ajuda vazia). */
export function tipText(id, vars = {}) {
  const t = TIPS[id];
  if (!t) throw new Error(`ajuda sem texto: ${id}`);
  const fill = (s) => s.replace(/\{([^}]+)\}/g, (m, k) => vars[k] ?? m);
  return { que: fill(t.que), ler: fill(t.ler), fazer: fill(t.fazer) };
}
