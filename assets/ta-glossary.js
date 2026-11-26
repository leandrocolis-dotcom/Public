// Explicações em linguagem simples de cada ferramenta de análise gráfica usada no site.
// `what`: o que é (uma frase); `read`: como ler; `limit`: onde costuma errar.
// As chaves casam com o campo `tip` dos votos em signals.js.

export const GLOSSARY = {
  sma: {
    name: "Média móvel (MM)",
    what: "O preço médio dos últimos N dias. Alisa o sobe-e-desce e mostra para onde o preço vem caminhando.",
    read: [
      "Preço acima da média = quem comprou nesse período está, em média, no lucro (força).",
      "Preço abaixo = quem comprou está no prejuízo (fraqueza).",
      "A média de 200 dias separa, na prática, mercado de alta (acima) de mercado de baixa (abaixo).",
    ],
    limit:
      "É lenta: confirma a tendência depois que ela já começou. Em mercado lateral dá muitos sinais falsos.",
  },
  cross: {
    name: "Cruz dourada e cruz da morte",
    what: "Quando a média de 50 dias passa por cima (dourada) ou por baixo (da morte) da média de 200 dias.",
    read: [
      "Cruz dourada: o mercado vem subindo há meses.",
      "Cruz da morte: o mercado vem caindo há meses.",
    ],
    limit: "Chega tarde: o preço costuma já ter andado bastante quando o cruzamento acontece.",
  },
  ema: {
    name: "Média móvel exponencial (EMA)",
    what: "Uma média que dá mais peso aos preços mais recentes, então reage mais rápido que a simples.",
    read: ["Média rápida acima da lenta = impulso de alta; abaixo = impulso de baixa."],
    limit: "Quanto mais rápida, mais sinais falsos.",
  },
  macd: {
    name: "MACD",
    what: "Compara a velocidade de duas médias (12 e 26 períodos). A linha de sinal é uma média do próprio MACD.",
    read: [
      "MACD acima da linha de sinal = impulso de alta; abaixo = impulso de baixa.",
      "MACD acima de zero = tendência de alta; abaixo de zero = de baixa.",
      "Cruzamento recente = o impulso acabou de mudar.",
    ],
    limit: "Atrasa e dá muitos falsos cruzamentos quando o preço anda de lado.",
  },
  adx: {
    name: "ADX (força da tendência)",
    what: 'Mede se há tendência, não a direção. Vai de 0 a 100. Os "+DI" e "-DI" dizem quem domina: compradores ou vendedores.',
    read: [
      "Abaixo de 20: mercado de lado. Indicadores de tendência falham mais.",
      "Acima de 25: tendência de verdade. Acima de 40: muito forte (e talvez esticada).",
    ],
    limit: "Sobe depois que a tendência começa e continua alto quando ela já está acabando.",
  },
  dow: {
    name: "Teoria de Dow: topos e fundos",
    what: "A definição mais antiga de tendência: alta é quando cada topo e cada fundo ficam mais altos que os anteriores; baixa, o contrário.",
    read: [
      "Topos e fundos mais altos = alta.",
      "Topos e fundos mais baixos = baixa.",
      "Quando o último fundo é rompido, a alta acabou.",
    ],
    limit: "Só confirma depois: o fundo/topo só é reconhecido alguns dias depois de acontecer.",
  },
  rsi: {
    name: "RSI (índice de força relativa)",
    what: "Compara o tamanho das altas com o das quedas dos últimos 14 períodos. Vai de 0 a 100.",
    read: [
      "Acima de 70: subiu muito e rápido (esticado). Abaixo de 30: caiu muito e rápido.",
      'Em alta forte, o RSI fica entre 40 e 80; em baixa forte, entre 20 e 60. Por isso "acima de 70" não é, sozinho, motivo para vender.',
      "Divergência: preço faz novo topo mas o RSI não = a alta perde fôlego.",
    ],
    limit:
      'Em tendência forte pode ficar "esticado" por semanas. Use com a tendência, não contra ela.',
  },
  stoch: {
    name: "Estocástico",
    what: "Mostra onde o preço fechou dentro da faixa dos últimos 14 períodos (0 = na mínima, 100 = na máxima).",
    read: [
      "Abaixo de 20 e virando para cima: possível repique.",
      "Acima de 80 e virando para baixo: possível recuo.",
    ],
    limit:
      'Em tendência forte, fica na zona de "esticado" e dá sinal contrário errado. Por isso pesa menos nesses casos.',
  },
  roc: {
    name: "Variação em 1 mês (momentum)",
    what: "Quanto o preço subiu ou caiu nos últimos 20 pregões.",
    read: [
      "Ativos que vêm subindo tendem a seguir subindo no curto prazo (e vice-versa). É o chamado efeito momentum.",
    ],
    limit: "Funciona até a tendência virar; vira contra quando o movimento já está esticado.",
  },
  bollinger: {
    name: "Bandas de Bollinger",
    what: "Uma faixa em volta da média de 20 dias, com 2 desvios-padrão para cima e para baixo. Contém cerca de 95% dos preços em condições normais.",
    read: [
      "Preço fora da banda sem tendência forte = esticado, costuma voltar à média.",
      'Em tendência forte, o preço pode "andar na banda": não é sinal de reversão.',
      'Bandas muito estreitas ("mola comprimida") costumam anteceder um movimento forte, mas não dizem a direção.',
    ],
    limit: "Tocar a banda não é sinal de compra ou venda por si só.",
  },
  atr: {
    name: "ATR (oscilação normal)",
    what: "A amplitude média diária do preço, incluindo gaps. Mede o quanto o ativo costuma balançar.",
    read: [
      "Usamos para saber se o preço está longe demais da média (esticado) e para definir a distância do stop.",
      "Stop muito curto (menor que a oscilação normal) é estopado por ruído.",
    ],
    limit: "Mede tamanho de movimento, não direção.",
  },
  obv: {
    name: "OBV (volume acumulado)",
    what: "Soma o volume dos dias de alta e subtrai o dos dias de queda.",
    read: [
      "OBV subindo com o preço = a alta tem dinheiro por trás.",
      "OBV caindo com o preço subindo = alta suspeita (divergência).",
    ],
    limit:
      "Um único dia de volume gigante distorce a linha. Índices (VIX, DXY, juros) não têm volume.",
  },
  cmf: {
    name: "Chaikin Money Flow",
    what: "Mede se os fechamentos acontecem perto da máxima (compradores fortes) ou da mínima (vendedores fortes) do dia, ponderado pelo volume.",
    read: [
      "Acima de +0,05: acumulação (dinheiro entrando).",
      "Abaixo de -0,05: distribuição (dinheiro saindo).",
    ],
    limit: "Ignora gaps entre um dia e outro.",
  },
  relvol: {
    name: "Volume relativo",
    what: "O volume de hoje comparado ao volume habitual.",
    read: [
      "Movimento com volume acima da média é mais confiável.",
      "Movimento com volume fraco tem mais chance de ser falso.",
    ],
    limit:
      "Em dias de vencimento de opções e rebalanceamento de índices o volume sobe sem significar convicção.",
  },
  sr: {
    name: "Suporte e resistência (pisos e tetos)",
    what: "Preços onde o ativo já virou várias vezes. O piso (suporte) é onde apareceram compradores; o teto (resistência), onde apareceram vendedores.",
    read: [
      "Perto do piso: boa região para comprar, com saída logo abaixo se o piso romper.",
      "Perto do teto: região de cautela. Se o teto é rompido, ele costuma virar piso.",
      "Quanto mais vezes o preço tocou o nível, mais relevante ele é.",
    ],
    limit: "São zonas, não linhas exatas. Um nível testado muitas vezes tende a romper.",
  },
  donchian: {
    name: "Rompimento da faixa de 4 semanas",
    what: "O preço fecha acima da máxima (ou abaixo da mínima) das últimas 20 sessões.",
    read: [
      "Rompimento com volume forte = mais confiável.",
      "Rompimento sem volume = confirme antes de confiar.",
    ],
    limit: "Muitos rompimentos são falsos e o preço volta para dentro da faixa.",
  },
  candle: {
    name: "Padrões de candle",
    what: "Cada candle mostra abertura, máxima, mínima e fechamento do período. Alguns formatos (martelo, engolfo, estrelas) sugerem virada.",
    read: [
      "Martelo (depois de queda) e estrela cadente (depois de alta): pavio longo mostra que um lado tentou e foi rejeitado.",
      'Engolfo: o candle de hoje "engole" o de ontem, no sentido contrário.',
      "Valem mais num piso ou teto e com volume.",
    ],
    limit:
      "Levantamentos de backtests apontam acerto de 55% a 65% para padrões isolados: pouco acima de cara ou coroa. Por isso só pesam mais perto de pisos e tetos.",
  },
  divergence: {
    name: "Divergência",
    what: "Quando o preço e um indicador discordam: o preço faz um novo topo mas o RSI faz um topo menor (ou o contrário nos fundos).",
    read: [
      "Divergência de alta (no fundo): a pressão vendedora diminui.",
      "Divergência de baixa (no topo): a alta perde fôlego.",
    ],
    limit: "Pode aparecer várias vezes antes da virada real. Espere o preço confirmar.",
  },
  fib: {
    name: "Retração de Fibonacci",
    what: "Marca em que ponto de uma alta (ou queda) o preço costuma parar quando recua: 38,2%, 50% e 61,8% do movimento.",
    read: [
      "Numa tendência de alta, recuos até 38% a 62% do último impulso são considerados saudáveis; abaixo disso, a alta fica em risco.",
    ],
    limit:
      "Não há prova forte de que esses números tenham poder próprio; funcionam em parte porque muita gente os observa.",
  },
  vwap: {
    name: "VWAP (preço médio do dia)",
    what: 'O preço médio de todos os negócios do dia, ponderado pelo volume. Reinicia a cada pregão. Grandes investidores a usam como referência de "preço justo" do dia.',
    read: [
      "Preço acima da VWAP: compradores no controle; abaixo: vendedores no controle.",
      "O preço costuma voltar para a VWAP quando se afasta muito (as faixas são ±1 desvio).",
    ],
    limit: "No começo do pregão há poucos negócios, então a VWAP ainda é instável.",
  },
  orb: {
    name: "Faixa de abertura (ORB)",
    what: "A máxima e a mínima dos primeiros 30 minutos do pregão. Marcam a briga inicial entre compradores e vendedores.",
    read: [
      "Preço rompe a faixa para cima com volume: o dia tende a ser de alta.",
      "Rompe para baixo: tende a ser de baixa.",
      "Dentro da faixa: sem vencedor ainda.",
    ],
    limit:
      "Uma replicação independente de um estudo famoso de ORB encontrou ganho bruto, mas resultado líquido próximo de zero depois de custos. Use como filtro de contexto, não como estratégia sozinha.",
  },
  pivot: {
    name: "Máxima e mínima de ontem, pivôs",
    what: 'O dia anterior costuma servir de referência: sua máxima, mínima e os "pivôs" (calculados da máxima, mínima e fechamento) viram pisos e tetos de hoje.',
    read: ["Acima da máxima de ontem: força. Abaixo da mínima de ontem: fraqueza."],
    limit: "Pivôs são níveis calculados; funcionam em parte porque muitos operadores os observam.",
  },
  gap: {
    name: "Gap de abertura",
    what: "A diferença entre o fechamento de ontem e a abertura de hoje.",
    read: [
      "Gap que se mantém: o impulso continua.",
      'Gap que "fecha" (o preço volta ao fechamento de ontem): o impulso se esgotou.',
    ],
    limit: "Gaps pequenos (menos de 0,3%) são ruído e ficam de fora.",
  },
};

/** Lições da seção "Aprenda em 5 minutos" (HTML simples, sem entrada do usuário). */
export const LESSONS = [
  {
    title: "O que é análise gráfica (e o que não é)",
    html: `<p>É ler o comportamento do <b>preço e do volume</b> para estimar o que os compradores e vendedores estão fazendo. A ideia central: o preço já reflete o que se sabe, e as pessoas repetem comportamentos (medo, euforia), o que deixa marcas no gráfico.</p>
      <p><b>Não é bola de cristal.</b> Cada ferramenta acerta um pouco mais do que erra, em média, e erra bastante. O valor está em combinar ferramentas <i>diferentes</i> que concordam (confluência) e em <b>limitar a perda</b> quando o cenário não acontece. Este site mostra o motivo de cada sinal e quanto aquele sinal já funcionou no passado do próprio ativo.</p>`,
  },
  {
    title: "1. Tendência: a regra número 1",
    html: `<p>Charles Dow (fim do século XIX) resumiu: <b>a tendência é sua amiga até que ela acabe</b>. Alta = topos e fundos cada vez mais altos; baixa = cada vez mais baixos. Em tendência de alta, procure comprar <i>recuos</i>; em tendência de baixa, evite comprar.</p>
      <p>Ferramentas: médias móveis (50 e 200 dias), MACD, ADX e a própria sequência de topos e fundos.</p>`,
  },
  {
    title: "2. Pisos e tetos (suporte e resistência)",
    html: `<p>O preço lembra onde virou antes: ali há ordens de gente que quer comprar (piso) ou vender (teto). O nível rompido costuma <b>trocar de papel</b>: um teto rompido vira piso. É nos pisos e tetos que o stop e a meta ficam mais fáceis de definir.</p>`,
  },
  {
    title: "3. Volume: a prova do dinheiro",
    html: `<p>Preço sobe com volume forte = convicção. Sobe com volume fraco = suspeito. Richard Wyckoff ensinou a ler preço e volume juntos: grande volume sem o preço avançar sugere que alguém está <i>acumulando</i> ou <i>distribuindo</i> sem pressa. Usamos OBV, Chaikin Money Flow e o volume relativo.</p>`,
  },
  {
    title: "4. Esticado ou calmo? (osciladores e volatilidade)",
    html: `<p>RSI, estocástico e Bollinger medem se o preço andou <b>rápido demais</b>. Eles servem para <b>escolher o momento</b> de entrada, não para decidir se compra: um ativo forte e esticado é um bom ativo em mau momento. Por isso o site separa "o ativo é bom?" de "é hora de entrar?".</p>`,
  },
  {
    title: "5. Candles: os sinais mais fracos",
    html: `<p>Padrões como martelo, engolfo e estrelas vêm dos japoneses do século XVIII. Sozinhos acertam pouco (algo entre 55% e 65% em levantamentos de backtests). Ficam interessantes quando aparecem <b>num piso ou teto, com volume</b>. Só os contamos com peso maior nessas condições.</p>`,
  },
  {
    title: "6. Fibonacci",
    html: `<p>Depois de uma alta, o preço costuma devolver parte dela. As razões 38,2%, 50% e 61,8% marcam onde esse recuo "normal" costuma acabar. Usamos como uma <i>zona</i> de atenção, nunca como linha exata.</p>`,
  },
  {
    title: "7. O pregão de hoje: VWAP, faixa de abertura e horário",
    html: `<p><b>VWAP</b>: preço médio do dia ponderado pelo volume; acima = compradores no controle. <b>Faixa de abertura</b>: máxima e mínima dos primeiros 30 minutos; romper para um lado indica o dia. <b>Máxima e mínima de ontem</b> e os pivôs são pisos e tetos de curto prazo.</p>
      <p>O <b>horário importa</b>: a abertura é instável; a primeira manhã tem o melhor volume; o almoço (11:30 a 14:00 em Nova York) é calmo e dá sinais falsos; a última meia hora é agitada. O site sempre mostra o horário de Brasília. No horário de verão dos EUA (março a novembro), a abertura é às 10:30 em Brasília; fora dele, às 11:30.</p>`,
  },
  {
    title: "8. Risco: o stop vale mais que a previsão",
    html: `<p>Antes de entrar, defina <b>onde você sai se estiver errado</b> (stop) e onde realiza o lucro (meta). Colocamos o stop um pouco abaixo do piso mais próximo, a uma distância de 1 a 3 oscilações normais (ATR). Regra prática: arrisque no máximo 1% do seu capital por operação. Se o stop está 2% abaixo da entrada, a posição pode ser de até 50% do capital (1% ÷ 2%).</p>
      <p>Uma relação ganho/risco acima de 1,5 compensa acertar menos da metade das vezes.</p>`,
  },
  {
    title: "9. Quem ganha e quem perde: o que os dados mostram",
    html: `<p><b>A maioria perde.</b> O estudo mais completo sobre pessoa física no Brasil (Chague, De-Losso e Giovannetti, FGV/USP, dados da CVM) acompanhou todos os iniciantes em day trade de mini-índice. Entre os que insistiram por mais de 300 pregões, <b>97% perderam dinheiro</b>, e só 0,5% ganharam mais que um salário inicial de caixa de banco. Não houve sinal de aprendizado com o tempo.</p>
<div class="tw ta-ltbl"><table><thead><tr><th>Estudo</th><th>Achado</th><th>O que significa</th></tr></thead><tbody><tr><td>Chague, De-Losso e Giovannetti (2020): day trade de mini-índice, Brasil</td><td>97% dos persistentes perderam; sem aprendizado</td><td>Day trade como profissão é inviável para quase toda pessoa física</td></tr><tr><td>Mesmos autores: ações à vista</td><td>Só 554 de 98 mil iniciantes ficaram &gt; 300 pregões; lucro bruto médio diário negativo</td><td>Vale também fora dos futuros</td></tr><tr><td>Barber, Lee, Liu e Odean: Taiwan</td><td>Menos de 1% lucra de forma previsível ano após ano</td><td>Resultado se repete em outro país</td></tr><tr><td>Park e Irwin: revisão de 92 estudos</td><td>58 positivos, 24 negativos; maioria com falhas de método</td><td>A evidência a favor de gráficos isolados é frágil</td></tr><tr><td>Park (2005): futuros dos EUA</td><td>Lucros de antes de 1985 somem depois de corrigir o vício de testar muitas regras</td><td>Regra que fica conhecida perde a vantagem</td></tr><tr><td>Moskowitz, Ooi e Pedersen (2012): momentum de série temporal</td><td>Significativo nos 58 futuros testados (ações, juros, commodities, moedas)</td><td>Seguir a tendência é robusto e diversificável</td></tr><tr><td>Hurst, Ooi e Pedersen (2017): um século de tendência</td><td>Lucrativo em praticamente todas as décadas desde 1880; melhor em crises</td><td>Funciona como proteção da carteira</td></tr><tr><td>Jegadeesh e Titman (1993): momentum entre ações</td><td>Quem subiu mais em 3 a 12 meses segue subindo mais</td><td>Base do &quot;comprar força relativa&quot;</td></tr></tbody></table></div>
<p><b>Leitura correta:</b> a análise gráfica funciona quando captura um comportamento persistente do mercado, como tendência, momentum ou falta de liquidez. Funciona mal quando tenta prever a partir de desenhos (bandeiras, ombro-cabeça-ombro, Elliott) sem regra objetiva.</p>`,
  },
  {
    title: "10. De onde vem o lucro (fontes de vantagem)",
    html: `<p>Todo trader lucrativo explora pelo menos uma destas fontes. <b>Se você não sabe dizer qual é a sua, você não tem vantagem.</b></p>
<div class="tw ta-ltbl"><table><thead><tr><th>Fonte</th><th>Por que existe</th><th>Quem paga</th><th>Estratégia</th></tr></thead><tbody><tr><td>Prêmio de tendência</td><td>Quem faz hedge aceita pagar para reduzir risco; a informação se espalha devagar</td><td>Hedgers e quem reage com atraso</td><td>Seguir tendência, rompimentos</td></tr><tr><td>Reação lenta</td><td>Ancoragem e viés de confirmação fazem o preço se ajustar devagar às notícias</td><td>Investidores lentos</td><td>Momentum, deriva depois do balanço</td></tr><tr><td>Exagero e falta de liquidez</td><td>Vendedores forçados (chamada de margem, resgates, stops em massa) empurram o preço abaixo do justo</td><td>Quem precisa vender já</td><td>Compra de pânico, volta à média no curto prazo</td></tr><tr><td>Fluxos obrigatórios</td><td>Rebalanceamento de índices, ETFs alavancados no fechamento, fim de mês e trimestre</td><td>Quem opera por obrigação</td><td>Operações de calendário</td></tr><tr><td>Evento</td><td>Balanço, guidance, aprovação regulatória, fusões mudam o patamar do ativo</td><td>Quem está do lado errado</td><td>Rompimento depois do evento</td></tr><tr><td>Velocidade</td><td>Latência, spread e incentivos de bolsa</td><td>Varejo e institucionais lentos</td><td>Alta frequência (<b>fora do alcance do varejo</b>)</td></tr></tbody></table></div>
<p>O day trader pessoa física compete justamente na última linha, contra robôs de alta frequência. Por isso costuma perder.</p>`,
  },
  {
    title: "11. Escolas de análise técnica: o que vale e o que não vale",
    html: `<div class="tw ta-ltbl"><table><thead><tr><th>Escola</th><th>Ideia central</th><th>Avaliação</th></tr></thead><tbody><tr><td><b>Teoria de Dow</b></td><td>Topos e fundos ascendentes definem a alta; volume confirma</td><td><b>Útil.</b> Base de quase todo seguidor de tendência</td></tr><tr><td><b>Wyckoff</b></td><td>Ciclo de acumulação → alta → distribuição → queda, conduzido pelos grandes investidores</td><td>Bom modelo mental; difícil de testar</td></tr><tr><td><b>Estágios de Weinstein</b></td><td>4 estágios em relação à média de 30 semanas; comprar só no estágio 2 (alta)</td><td><b>Simples e testável</b></td></tr><tr><td><b>CAN SLIM / VCP</b> (O'Neil, Minervini)</td><td>Lucro crescendo + força relativa + base + rompimento com volume</td><td>Funciona em alta de ações de crescimento; quedas fortes em mercado de baixa</td></tr><tr><td><b>Tartarugas / Donchian</b></td><td>Comprar o rompimento da máxima de N dias; tamanho pelo ATR</td><td><b>Evidência forte</b> quando diversificado; acerta pouco, ganha muito quando acerta</td></tr><tr><td><b>Perfil de volume / leilão</b></td><td>O mercado procura o preço onde há mais negócio</td><td>Útil em futuros líquidos; depende de bom dado de volume</td></tr><tr><td><b>Price action / candles</b></td><td>Leitura de barras (martelo, engolfo)</td><td>Isolados, quase não preveem; só valem num piso ou teto</td></tr><tr><td><b>Fibonacci</b></td><td>Recuos de 38,2%, 50% e 61,8%</td><td><b>Sem base estatística</b>; funciona fraco porque muita gente olha</td></tr><tr><td><b>Elliott</b></td><td>5 ondas de impulso + 3 de correção</td><td><b>Impossível de testar</b>: a contagem muda depois do fato. Evitar</td></tr><tr><td><b>SMC / ICT</b></td><td>Blocos de ordens, caça a stops, gaps de liquidez</td><td>Ideias reais com muito marketing; sem validação independente</td></tr><tr><td><b>Intermercados</b> (Murphy)</td><td>Juros, dólar, commodities e ações se influenciam</td><td>Bom como filtro de cenário, não como gatilho</td></tr><tr><td><b>Força relativa / rotação</b></td><td>Comprar o que sobe mais que o índice</td><td><b>Evidência forte</b> (momentum entre ativos)</td></tr></tbody></table></div>`,
  },
  {
    title: "12. Estratégias: acerto × tamanho do ganho",
    html: `<div class="tw ta-ltbl"><table><thead><tr><th>Estratégia</th><th>Prazo</th><th>Acerto típico</th><th>Ganho/perda</th><th>Falha em</th></tr></thead><tbody><tr><td>Seguir tendência (rompimento de 20/55 dias)</td><td>Semanas a meses</td><td>30–40%</td><td>2,5–4×</td><td>Mercado de lado</td></tr><tr><td>Seguir tendência (preço acima da MM200)</td><td>Meses</td><td>35–45%</td><td>2–3×</td><td>Viradas em V</td></tr><tr><td>Momentum entre ativos (top 10–20% em 12 meses, rebalanceio mensal)</td><td>Mensal</td><td>50–55%</td><td>~1,2×</td><td>Repique do &quot;lixo&quot; depois de um mercado de baixa</td></tr><tr><td>Comprar recuo em tendência (acima da MM50, recuo à MM20 ou RSI(2) &lt; 10)</td><td>3–15 dias</td><td>55–70%</td><td>0,8–1,5×</td><td>Quebra da tendência</td></tr><tr><td>Rompimento de base com volume (VCP, CAN SLIM)</td><td>Semanas</td><td>35–50%</td><td>2–3×</td><td>Mercado de baixa ou picado</td></tr><tr><td>Volta à média de curto prazo (Bollinger −2σ, RSI(2)) em índices</td><td>1–5 dias</td><td>60–75%</td><td>0,5–1×</td><td>Crashes</td></tr><tr><td>Rompimento da faixa de abertura (ORB)</td><td>Dia</td><td>40–50%</td><td>1,5–2×</td><td>Dias sem notícia</td></tr><tr><td>Deriva depois do balanço</td><td>20–60 dias</td><td>50–55%</td><td>~1,3×</td><td>Mega caps muito eficientes</td></tr><tr><td>Scalping</td><td>Segundos a minutos</td><td>60–80%</td><td>0,3–0,8×</td><td><b>Varejo</b>: o custo come a vantagem</td></tr></tbody></table></div>
<p><b>Regra geral:</b> acerto alto vem com ganho por operação baixo, e vice-versa. Não existe estratégia com os dois altos de forma sustentável. Desconfie de quem vende isso.</p>`,
  },
  {
    title: "13. Métricas: expectativa, R e profit factor",
    html: `<p>Meça tudo em <b>R</b>, o risco inicial da operação (entrada − stop). Ganhar 3R é ganhar 3 vezes o que se arriscou.</p>
<div class="tw ta-ltbl"><table><thead><tr><th>Métrica</th><th>Fórmula</th><th>Referência</th></tr></thead><tbody><tr><td><b>Expectativa</b></td><td>Acerto × ganho médio − (1 − acerto) × perda média</td><td><b>Precisa ser positiva depois dos custos</b>; acima de 0,2R já é bom</td></tr><tr><td>Acerto para empatar</td><td>1 ÷ (1 + ganho/perda)</td><td>Ganho/perda de 2 → precisa acertar mais de 33%</td></tr><tr><td>Profit factor</td><td>Lucro bruto ÷ prejuízo bruto</td><td>Abaixo de 1 perde; 1,3–2 bom; acima de 3, desconfie de ajuste ao passado</td></tr><tr><td>SQN (Van Tharp)</td><td>√N × média(R) ÷ desvio(R)</td><td>2–3 bom; acima de 3 excelente (mínimo de 30 operações, ideal 100)</td></tr><tr><td>Sharpe</td><td>(retorno − juro livre de risco) ÷ volatilidade</td><td>Acima de 1 bom; acima de 2 raro de forma sustentada</td></tr><tr><td>Drawdown máximo</td><td>Maior queda do pico ao vale</td><td>É o que faz você desistir do sistema</td></tr><tr><td>Calmar</td><td>Retorno anual ÷ drawdown máximo</td><td>Acima de 0,5 ok; acima de 1 bom</td></tr><tr><td>Recuperação</td><td>Perder x exige ganhar x ÷ (1 − x)</td><td>−20% → +25%; −50% → +100%; −80% → +400%</td></tr></tbody></table></div>
<p><b>Exemplo:</b> sistema de tendência que acerta 35%, ganha 3R e perde 1R → 0,35 × 3 − 0,65 × 1 = <b>+0,40R por operação</b>. Com 1% de risco e 50 operações por ano, dá cerca de 20% ao ano antes de custos, mas com sequências longas de perdas (10 seguidas é provável em algum momento). <b>O sistema só funciona se você sobreviver às fases ruins.</b></p>
<p>No plano de cada ativo, o site mostra a relação ganho/risco e o acerto mínimo para empatar.</p>`,
  },
  {
    title: "14. Tamanho da posição: onde o dinheiro é feito de verdade",
    html: `<div class="tw ta-ltbl"><table><thead><tr><th>Método</th><th>Fórmula</th><th>Quando usar</th></tr></thead><tbody><tr><td><b>Fração fixa</b></td><td>Quantidade = capital × % de risco ÷ (entrada − stop)</td><td><b>Padrão.</b> 0,5–1% de risco por operação</td></tr><tr><td>Pela volatilidade (ATR)</td><td>Quantidade = capital × % de risco ÷ (k × ATR)</td><td>Iguala o risco entre ativos calmos e agitados (método das Tartarugas)</td></tr><tr><td>Volatilidade-alvo</td><td>Peso = volatilidade-alvo ÷ volatilidade do ativo</td><td>Carteiras de tendência e momentum</td></tr><tr><td>Kelly</td><td>f = acerto − (1 − acerto) ÷ (ganho/perda)</td><td>Só como teto: use ¼ a ½ Kelly. Kelly cheio gera quedas de 50% ou mais</td></tr></tbody></table></div>
<ul><li><b>Risco total aberto</b> (soma dos riscos de todas as posições): no máximo 5–8% do capital.</li>
<li><b>Correlação:</b> cinco posições em semicondutores são, na prática, uma posição grande. Limite o risco por setor.</li>
<li><b>Freio de emergência:</b> corte o tamanho pela metade depois de uma queda de 10% da conta; pare e revise depois de 20%.</li>
<li><b>Ruína:</b> com expectativa positiva e 1% por operação, o risco de quebrar é quase zero. Com 5–10% por operação, até um sistema bom quebra.</li>
<li><b>Stops:</b> estrutural (abaixo do piso que invalida a ideia), por volatilidade (2–3 ATR), por tempo (sair se não andou em N dias) e móvel (máxima − 3 ATR, MM20 ou mínima de N dias) para deixar o lucro correr.</li></ul>`,
  },
  {
    title: "15. Custos e backtest: como não se enganar",
    html: `<p><b>Custo total</b> = corretagem + spread + escorregamento + impacto + impostos. Um scalper que busca 0,2% e paga 0,05% por perna perde metade da vantagem só em custo. A expectativa precisa sobreviver a <b>2× o custo estimado</b>. No Brasil, pessoa física paga 20% no day trade e 15% no swing, com regras próprias de isenção e compensação.</p>
<div class="tw ta-ltbl"><table><thead><tr><th>Vício</th><th>O que é</th><th>Como evitar</th></tr></thead><tbody><tr><td>Ajuste ao passado</td><td>Testar centenas de parâmetros e ficar com o melhor</td><td>Poucas regras, números redondos, vizinhos dando resultado parecido (MM 45 a 55)</td></tr><tr><td>Olhar o futuro</td><td>Usar o fechamento do dia para entrar no mesmo dia</td><td>Entrar na abertura seguinte ao sinal</td></tr><tr><td>Sobrevivência</td><td>Testar só ativos que ainda existem</td><td>Bases com ativos deslistados</td></tr><tr><td>Custos subestimados</td><td>Ignorar spread e escorregamento</td><td>Incluir de forma conservadora</td></tr><tr><td>Um só regime</td><td>Testar só no mercado de alta de 2010–2021</td><td>Incluir 2000–02, 2008, 2020 e 2022</td></tr><tr><td>Amostra pequena</td><td>20 operações não provam nada</td><td>Mínimo de 100 operações, de preferência em vários mercados</td></tr></tbody></table></div>
<p><b>Processo:</b> hipótese econômica (quem paga?) → regras escritas → teste em 60% dos dados → validação nos 40% restantes sem mexer → janela móvel → variar parâmetros ±20% → simulação no papel por 2–3 meses → comparar com comprar e segurar ajustado ao risco. Se não ganhar em Sharpe ou em drawdown, não vale o trabalho.</p>`,
  },
  {
    title: "16. ETFs alavancados (2x/3x)",
    html: `<p>Um ETF alavancado L vezes rende aproximadamente <b>L·r − ½·(L² − L)·σ²·t</b> no período: com volatilidade alta, o segundo termo (o <b>decaimento</b>) domina. Exemplo: o índice sobe 10% e cai 9,09% (volta ao zero); o ETF 3x faz +30% e −27,3% e termina em <b>−5,5%</b>.</p>
<ul><li><b>Funciona</b> em tendência forte e calma (ex.: TQQQ num mercado de alta estável).</li>
<li><b>Destrói</b> em mercado de lado e agitado: SOXL, LABU ou BOIL podem perder 30–50% com o ativo de referência parado.</li>
<li><b>Como usar:</b> gere o sinal no ativo de referência (QQQ, SMH) e execute no alavancado; calcule o tamanho pela volatilidade do alavancado (cerca de 3 vezes maior); use stops mais curtos no tempo.</li>
<li><b>Filtro clássico:</b> só ficar no 3x com o ativo de referência acima da MM200 e volatilidade abaixo da mediana; fora disso, caixa ou SGOV.</li>
<li>Inversos servem de proteção tática, não para ficar semanas posicionado.</li></ul>
<p>O placar deste site usa o mesmo motor para alavancados e não modela o decaimento: leia o sinal no ativo de referência.</p>`,
  },
  {
    title: "17. Processo: checklist antes de operar e diário",
    html: `<ol><li>A operação é um setup do meu plano, com expectativa positiva medida?</li>
<li>O cenário do mercado favorece este setup?</li>
<li>Stop definido <b>antes</b> de entrar, num nível que invalida a ideia?</li>
<li>Tamanho calculado (risco de até 1%)?</li>
<li>Risco total aberto e exposição por setor dentro do limite?</li>
<li>Há evento binário próximo (balanço, FOMC, CPI)?</li>
<li>O ganho esperado é de pelo menos 2R (tendência), ou o acerto histórico justifica um ganho menor?</li>
<li>Vou registrar no diário?</li></ol>
<p><b>Diário:</b> data, ativo, setup, R planejado e realizado, maior ganho e maior perda durante a operação, se seguiu o plano (sim/não) e estado emocional. A métrica-chave é a <b>% de operações que seguiram o plano</b>. Revise toda semana por setup e corte os que não têm expectativa positiva.</p>
<p><b>Erros clássicos:</b> mover o stop, realizar o lucro cedo demais, operar por vingança, aumentar a mão depois de perder, operar por tédio. Defina um limite diário de perda (ex.: −2R) e desligue a tela ao atingir. Separe o capital de trading do patrimônio de longo prazo (5–10% do total).</p>
<p><b>Teste antes de usar (o que fizemos):</b> a rotação mensal "3 setores com maior alta em 6 meses, só com o SPY acima da MM200, senão caixa" foi testada de jul/2009 a out/2026 com custos. Rendeu <b>7,9% ao ano</b> (Sharpe 0,53, queda máxima −21%), contra <b>14,8%</b> do S&P comprado e parado (Sharpe 0,82, queda −34%). Até o filtro da MM200 sozinho (10,1% ao ano) perdeu para o S&P: nas quedas rápidas com volta em V, ele sai perto do fundo e volta depois da alta. A evidência a favor de seguir tendência vem de futuros diversificados entre classes de ativo, não de alternar setores de ações. Lição: <b>todo sistema, por mais famoso, precisa bater o comprar e segurar ajustado ao risco</b>. Este não bateu (detalhes em docs/ESTUDO-SETORIAL.md).</p>`,
  },
  {
    title: "18. Momentum 12-1: escolhe risco, não ativo",
    html: `<p><b>O que é:</b> retorno dos últimos 12 meses <b>pulando o último</b> (o mês mais recente tende a devolver parte do movimento). A regra clássica (Jegadeesh e Titman, 1993) compra os 20% mais fortes e troca todo mês. É a base do Dual Momentum, do IBD RS e do SCTR.</p>
<p><b>O que testamos (estudo F35, out/2016 a ago/2026):</b> 220 ações e 156 ETFs da lista "Universo de Setores", cada grupo ranqueado dentro de si, com custo de 0,05% por perna.</p>
<div class="tw ta-ltbl"><table><thead><tr><th>Medida</th><th>Ações</th><th>ETFs</th></tr></thead><tbody><tr><td>Correlação do 12-1 com o mês seguinte</td><td>0,003 (t 0,1)</td><td>0,033 (t 1,3)</td></tr><tr><td>20% mais fortes − 20% mais fracos, por mês</td><td>+0,4% (t 0,6)</td><td>+0,5% (t 1,2)</td></tr><tr><td>Risco do top 20% (beta)</td><td>1,24</td><td>1,22</td></tr><tr><td>Ganho extra descontado o risco</td><td>+0,3%/mês (t 0,8)</td><td>+0,3%/mês (t 1,0)</td></tr></tbody></table></div>
<ul><li><b>Nas ações, não ordenou nada:</b> os 20% mais fracos também ganharam da média. Só os três anos de IA (2023–2026) foram positivos.</li>
<li><b>Nos ETFs, direção certa e efeito fraco</b>, igual aos estudos com os 40 ETFs do Pêndulo. Metade é rotação de setor.</li>
<li><b>A armadilha:</b> o top 20% rendeu 36,7% ao ano nas ações (o S&P, 15,6%). Parece ótimo, mas veio do beta: a regra comprou os papéis mais voláteis num mercado de alta. Numa baixa forte, a mesma conta vira contra. E a lista foi montada em 2026 com os vencedores (só comprar todas já deu 26,9% ao ano).</li>
<li><b>Esperar recuo não ajudou:</b> entre os mais fortes, os mais esticados acima da MM200 renderam <i>mais</i> no mês seguinte nas ações (+1,8%, t 2,5) e igual nos ETFs.</li></ul>
<p><b>Lição:</b> antes de acreditar num ranking, desconte o risco extra e compare com um sorteio do mesmo universo. Se o ganho some, a regra escolheu risco, não ativo. O site mostra o percentil 12-1 na página do ativo e a lista de quem passa no Simulador → 🧠 Aprendizado, sempre como informação, nunca como decisão (detalhes em docs/ESTUDO-MOMENTUM-UNIVERSO.md).</p>`,
  },
  {
    title: "O que o site NÃO usa (de propósito)",
    html: `<p><b>Ondas de Elliott</b>, <b>Gann</b> e figuras como ombro-cabeça-ombro, triângulos e bandeiras ficam de fora: dois analistas diferentes desenham contagens diferentes no mesmo gráfico, então não dá para automatizar e testar de forma honesta. Padrões de candle entram, mas com peso baixo. Análise de notícias e balanços também não: o site lê só preço e volume.</p>`,
  },
  {
    title: "Evidência e limites (leia antes de operar)",
    html: `<ul>
      <li>Brock, Lakonishok e LeBaron (1992) encontraram valor preditivo em médias móveis e rompimentos no índice Dow Jones de 1897 a 1986.</li>
      <li>A revisão de Park e Irwin (2007) mostra que a maioria dos estudos modernos achou lucro, mas que muitos sofrem de <i>data snooping</i> (testar muitas regras e mostrar só a que deu certo) e ignoram custos. Em futuros dos EUA, depois de corrigir esse vício, poucos mercados seguiram lucrativos.</li>
      <li>Uma replicação independente do estudo de rompimento da abertura (ORB) mostrou ganho bruto igual ao do artigo, mas líquido próximo de zero depois de custos.</li>
      <li>Quase tudo aqui perde força quando <b>muita gente usa</b> a mesma regra e em mercados muito eficientes (como o dos grandes ETFs).</li>
      <li>A exceção com evidência sólida é <b>seguir a tendência e o momentum</b> de forma sistemática e diversificada: lucrativo em quase todas as décadas desde 1880 (Hurst, Ooi e Pedersen, 2017).</li>
      <li>No Brasil, 97% dos day traders que insistiram mais de 300 pregões perderam dinheiro (Chague, De-Losso e Giovannetti, 2020).</li>
    </ul>
    <p>Por isso o site mostra, para cada ativo, <b>quanto o placar acertou no passado</b> e compara com um dia qualquer. Se não foi melhor, ele diz.</p>`,
  },
];

export const SOURCES = [
  [
    "Chague, De-Losso e Giovannetti (2020), Day Trading for a Living?",
    "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3423101",
  ],
  [
    "Moskowitz, Ooi e Pedersen (2012), Time Series Momentum",
    "https://doi.org/10.1016/j.jfineco.2011.11.003",
  ],
  [
    "Hurst, Ooi e Pedersen (2017), A Century of Evidence on Trend-Following Investing",
    "https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing",
  ],
  [
    "Jegadeesh e Titman (1993), Returns to Buying Winners and Selling Losers",
    "https://doi.org/10.1111/j.1540-6261.1993.tb04702.x",
  ],
  [
    "Park e Irwin (2007), What Do We Know About the Profitability of Technical Analysis?",
    "https://doi.org/10.1111/j.1467-6419.2007.00519.x",
  ],
  [
    "Brock, Lakonishok e LeBaron (1992), Journal of Finance",
    "https://ideas.repec.org/a/bla/jfinan/v47y1992i5p1731-64.html",
  ],
  [
    "Índice de Força Relativa (RSI), fórmula de Wilder",
    "https://en.wikipedia.org/wiki/Relative_strength_index",
  ],
  ["Pontos de pivô", "https://en.wikipedia.org/wiki/Pivot_point_(technical_analysis)"],
  ["Retração de Fibonacci", "https://www.babypips.com/forexpedia/fibonacci-retracement"],
  [
    "Indicadores de análise técnica (CFA)",
    "https://analystprep.com/cfa-level-1-exam/portfolio-management/technical-analysis-indicators/",
  ],
  [
    "Chaikin Money Flow",
    "https://infront-investment-manager.helpcenter.infront.co/en/im/latest/chaikin-money-flow",
  ],
  [
    "Replicação do estudo de rompimento da abertura (ORB)",
    "https://www.mql5.com/en/blogs/post/776235",
  ],
];
