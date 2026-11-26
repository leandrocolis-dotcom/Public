// Balões "?" do app: cada termo técnico ganha um botão que abre uma explicação para quem está começando, montada com
// o dado atual (o preço de hoje, o nível, a chance medida). Um só balão aberto por vez; fecha ao tocar fora ou no Esc.
// Uso: hq("res", { sym, price, level, p, n }) devolve o botão; helpText(chave, dados) devolve { title, body } (puro).
import { decSep, esc, num, pct } from "./format.js";

const n2 = (x) => num(x, 2);
const p1 = (x) => pct(x, 1);
const pu = (x) => pct(Math.abs(x), 1).replace(/^[+-]/, "");
const has = (x) => Number.isFinite(x);
const dirWord = (d) =>
  d >= 0.25 ? "a favor de subir" : d <= -0.25 ? "contra (aponta queda)" : "neutra";

/** Textos por chave. Cada função recebe os dados atuais (podem faltar: o texto se vira sem eles). */
const T = {
  res: {
    t: "Resistência",
    f: (c) => [
      `Resistência é um preço em que ${c.sym ?? "o ativo"} parou de subir antes: muita gente vendeu ali, e isso funcionou como um teto.`,
      has(c.price) && has(c.level)
        ? `Agora o preço (${n2(c.price)}) está ${pu(c.level / c.price - 1)} abaixo desse teto (${n2(c.level)}).`
        : null,
      has(c.p) && c.n
        ? `Nas ${c.n} vezes parecidas neste ativo, ele rompeu o teto em ${pct(c.p, 0).replace("+", "")} delas.`
        : null,
      has(c.level)
        ? `Como ler: se o dia fechar acima de ${n2(c.level)}, o teto foi rompido e costuma abrir espaço para subir. Se encostar e voltar, é comum recuar até o próximo suporte. Por isso o app espera o fechamento antes de mandar comprar.`
        : "Como ler: fechar acima do teto costuma abrir espaço para subir; bater e voltar costuma levar a um recuo.",
    ],
  },
  sup: {
    t: "Suporte",
    f: (c) => [
      `Suporte é um preço em que ${c.sym ?? "o ativo"} parou de cair antes: compradores apareceram ali, e isso funcionou como um piso.`,
      has(c.price) && has(c.level)
        ? `Agora o preço (${n2(c.price)}) está ${pu(c.price / c.level - 1)} acima desse piso (${n2(c.level)}).`
        : null,
      has(c.p) && c.n
        ? `Nas ${c.n} vezes parecidas neste ativo, o piso segurou em ${pct(c.p, 0).replace("+", "")} delas.`
        : null,
      has(c.level)
        ? `Como ler: comprar perto do piso dá um risco curto (a saída fica logo abaixo). Se o dia fechar abaixo de ${n2(c.level)}, o piso quebrou e o preço costuma buscar um nível mais baixo.`
        : "Como ler: perto do piso o risco é curto; se fechar abaixo dele, o piso quebrou.",
    ],
  },
  stop: {
    t: "Stop (preço de saída)",
    f: (c) => [
      "Stop é o preço de saída combinado antes de entrar: se o ativo cair até ali, a ideia de compra deu errado e o certo é sair para não perder mais.",
      has(c.price) && has(c.level)
        ? `Para ${c.sym ?? "este ativo"}, o stop está em ${n2(c.level)}, ${pu(c.price / c.level - 1)} ${c.price >= c.level ? "abaixo" : "acima"} do preço atual (${n2(c.price)}).`
        : null,
      "Como ler: o app só considera o stop perdido quando o dia FECHA abaixo dele, para não sair por um susto no meio do pregão. Quem não tem o ativo não deve comprar com o preço colado no stop.",
    ],
  },
  near: {
    t: "Perto de um nível",
    f: (c) => [
      "O preço está muito perto de um suporte (piso), de uma resistência (teto) ou do stop: a menos de meia oscilação normal de um dia (0,5 ATR).",
      has(c.n) ? `Nesta lista, ${c.n} ativo(s) estão nessa situação agora.` : null,
      "Como ler: é ali que as decisões acontecem. O texto de cada linha diz o que fazer agora e o que fazer se o dia fechar acima ou abaixo do nível.",
    ],
  },
  decision: {
    t: "Decisão do trader",
    f: (c) => [
      "É a conclusão do app para o ativo, juntando as análises com pesos: gráfico (35%), fundamentos da empresa (25%), momento do mercado (20%), situações parecidas no passado (20%) e, nas ações do S&P 500, a nota do Quant Aberto (15%, peso relativo). Sem nota do Quant, ele não pesa.",
      c.label
        ? `Para ${c.sym ?? "este ativo"} agora: "${c.label}", com confiança ${String(c.conf ?? "–").toLowerCase()}.${c.bias && c.bias !== c.label ? ` As análises dizem "${c.bias}"; a ação de agora traduz isso para o preço de hoje.` : ""}`
        : null,
      c.subs?.length
        ? `Por parte: ${c.subs.map((s) => `${s.name} ${dirWord(s.dir)}`).join("; ")}.`
        : null,
      c.conflict ? "As análises discordam entre si; por isso a confiança cai." : null,
      "Só existem estas ações: Comprar (posição inteira agora), Comprar em partes (metade agora, o resto na zona de compra), Esperar rompimento (colado na resistência: compra se fechar acima), Ficar de fora (sem vantagem) e Não comprar (análises contra). Com posição: Ampliar, Manter, Reduzir ou Vender. Esperar recuo para entrar não ajudou nos estudos do app, por isso a compra não é adiada só porque o preço está no meio da faixa. Material educacional, não é uma ordem.",
    ],
  },
  conf: {
    t: "Confiança",
    f: (c) => [
      "Mostra o quanto as análises concordam e o quanto de dado existe por trás da decisão.",
      c.conf ? `Aqui está ${String(c.conf).toLowerCase()}.` : null,
      "Alta: quase todas apontam para o mesmo lado. Média: a maioria concorda. Baixa: discordam ou há pouco histórico. Com confiança baixa, o app sugere tamanho menor ou esperar.",
    ],
  },
  mt: {
    t: "Médio prazo",
    f: (c) => [
      "Olha semanas a meses, sem o barulho do dia a dia: junta os fundamentos da empresa e o momento do mercado como um todo.",
      c.label ? `Para ${c.sym ?? "este ativo"}: ${c.label}.` : null,
      "Como ler: médio prazo favorável dá mais margem para comprar nos recuos; desfavorável faz o app vetar ampliar posição, mesmo com o gráfico bonito.",
    ],
  },
  sigs: {
    t: "Sinais de curto prazo",
    f: (c) => [
      "Avisos de regras simples do gráfico para os próximos dias (ex.: cruzou uma média, sobrevenda forte). ▲ indica entrada, ▼ saída e ⚠ atenção.",
      c.list?.length ? `Agora em ${c.sym ?? "este ativo"}: ${c.list.join("; ")}.` : null,
      "Como ler: cada regra mostra no detalhe o quanto acertou no passado. Sozinhos, valem pouco; use junto com a decisão e o nível.",
    ],
  },
  tone: {
    t: "Comprar / Aguardar / Reduzir",
    f: (c) => [
      "Contagem das decisões da lista: Comprar/ampliar (as análises apontam para alta), Aguardar (sem vantagem clara agora) e Reduzir/vender (apontam para queda).",
      has(c.buy)
        ? `Hoje: ${c.buy} para comprar, ${c.wait} para aguardar e ${c.sell} para reduzir.`
        : null,
      "Toque num balão para filtrar a lista por ele.",
    ],
  },
  atr: {
    t: "ATR (oscilação normal)",
    f: (c) => [
      "ATR é quanto o ativo costuma andar num dia, em média (entre a máxima e a mínima).",
      has(c.atr) && has(c.price)
        ? `Em ${c.sym ?? "este ativo"}, cerca de ${n2(c.atr)} por dia (${pu(c.atr / c.price)} do preço).`
        : null,
      "O app usa o ATR para medir 'perto' (meia oscilação) e para pôr o stop longe o bastante do ruído (2,5 ATR).",
    ],
  },
  ma: {
    t: "Médias de 50 e 200 dias",
    f: (c) => [
      "É o preço médio dos últimos 50 e 200 pregões. Mostra a direção do preço sem o sobe-e-desce diário.",
      has(c.price) && has(c.ma200)
        ? `O preço (${n2(c.price)}) está ${c.price >= c.ma200 ? `${pu(c.price / c.ma200 - 1)} acima` : `${pu(c.price / c.ma200 - 1)} abaixo`} da média de 200 dias (${n2(c.ma200)}).`
        : null,
      has(c.ma50) && has(c.ma200)
        ? `A média de 50 (${n2(c.ma50)}) está ${c.ma50 >= c.ma200 ? "acima" : "abaixo"} da de 200: ${c.ma50 >= c.ma200 ? "tendência de alta nos últimos meses" : "tendência de baixa nos últimos meses"}.`
        : null,
      "Como ler: acima da média de 200 dias, em geral, quem comprou no último ano está no lucro e a tendência é de alta.",
    ],
  },
  ma50: {
    t: "MM50 (média móvel de 50 dias)",
    f: (c) => [
      "É a média dos preços de fechamento dos últimos 50 pregões (cerca de 2 meses e meio), recalculada a cada dia. Suaviza o sobe-e-desce e mostra a tendência de curto a médio prazo.",
      has(c.price) && has(c.ma50)
        ? `Hoje ${c.sym ?? "o ativo"} (${n2(c.price)}) está ${pu(c.price / c.ma50 - 1)} ${c.price >= c.ma50 ? "acima" : "abaixo"} da MM50 (${n2(c.ma50)}).`
        : null,
      "Como ler: preço acima da MM50 e a linha subindo indicam força recente. Quando o preço cai abaixo dela, a alta perdeu fôlego, mas isso sozinho não é sinal de venda.",
    ],
  },
  ma200: {
    t: "MM200 (média móvel de 200 dias)",
    f: (c) => [
      "É a média dos fechamentos dos últimos 200 pregões (cerca de 10 meses). É a referência mais usada para a tendência de longo prazo.",
      has(c.price) && has(c.ma200)
        ? `Hoje ${c.sym ?? "o ativo"} (${n2(c.price)}) está ${pu(c.price / c.ma200 - 1)} ${c.price >= c.ma200 ? "acima" : "abaixo"} da MM200 (${n2(c.ma200)}).`
        : null,
      has(c.ma50) && has(c.ma200)
        ? `A MM50 está ${c.ma50 >= c.ma200 ? "acima" : "abaixo"} da MM200: ${c.ma50 >= c.ma200 ? "tendência de alta nos últimos meses" : "tendência de baixa nos últimos meses"}.`
        : null,
      "Como ler: acima da MM200, quem comprou no último ano em geral está no lucro. Perder a MM200 é usado no app como limite de perda (proteção), não como previsão de queda.",
    ],
  },
  range52: {
    t: "Máxima e mínima de 52 semanas",
    f: (c) => [
      "O maior e o menor preço do último ano.",
      has(c.price) && has(c.h52) && has(c.l52) && c.h52 > c.l52
        ? `Hoje ${c.sym ?? "o ativo"} está ${pu(c.price / c.h52 - 1)} abaixo da máxima e ${pu(c.price / c.l52 - 1)} acima da mínima: na posição ${Math.round((100 * (c.price - c.l52)) / (c.h52 - c.l52))}% da faixa do ano (0% = mínima, 100% = máxima).`
        : null,
      "Como ler: perto da máxima, o ativo está forte (e nos estudos do app isso não foi motivo para evitar ações). Perto da mínima, está fraco: barato nem sempre é oportunidade.",
    ],
  },
  pe: {
    t: "P/L (preço sobre lucro)",
    f: (c) => [
      "Quantos anos de lucro atual você paga ao comprar a ação. P/L 20 = o preço equivale a 20 anos do lucro de hoje.",
      has(c.pe) && c.pe > 0
        ? `${c.sym ?? "A empresa"} negocia a P/L ${num(c.pe, 1)}${has(c.fpe) && c.fpe > 0 ? ` (pelo lucro esperado para o próximo ano, ${num(c.fpe, 1)})` : ""}.`
        : "Sem P/L: a empresa não tem lucro nos últimos 12 meses, ou não se aplica (ETF).",
      has(c.pe) && has(c.fpe) && c.pe > 0 && c.fpe > 0
        ? c.fpe < c.pe
          ? "O projetado é menor que o atual: o mercado espera o lucro crescer."
          : "O projetado é maior que o atual: o mercado espera o lucro cair."
        : null,
      "Como ler: compare com o setor e com o próprio histórico. Empresa que cresce rápido costuma ter P/L alto; o S&P 500 anda entre 18 e 25.",
    ],
  },
  eps: {
    t: "LPA (lucro por ação)",
    f: (c) => [
      "O lucro dos últimos 12 meses dividido pelo número de ações.",
      has(c.eps) ? `${c.sym ?? "A empresa"} lucrou ${n2(c.eps)} por ação no período.` : null,
      "Como ler: o que importa é a direção. LPA subindo ano após ano é o que sustenta a alta da ação no longo prazo.",
    ],
  },
  pb: {
    t: "Preço / valor patrimonial",
    f: (c) => [
      "Compara o preço com o patrimônio contábil (o que sobraria se a empresa vendesse tudo e pagasse as dívidas).",
      has(c.pb)
        ? `Aqui, ${num(c.pb, 1)}: o mercado paga ${num(c.pb, 1)} vezes o patrimônio.`
        : null,
      "Como ler: importa mais em bancos e seguradoras. Em tecnologia, o valor está em marcas e software, que o balanço não mostra, e o número fica alto.",
    ],
  },
  dy: {
    t: "Dividend yield",
    f: (c) => [
      "Quanto o ativo pagou em dividendos no último ano, como % do preço.",
      has(c.dy)
        ? `Aqui, ${pu(c.dy)} ao ano: cada US$ 1.000 investidos renderiam cerca de US$ ${num(1000 * c.dy, 0)} em dividendos.`
        : null,
      "Atenção: para investidor do Brasil, os EUA retêm 30% dos dividendos na fonte.",
    ],
  },
  beta: {
    t: "Beta",
    f: (c) => [
      "Mede o quanto o ativo costuma oscilar junto com o S&P 500. Beta 1 = anda igual ao índice.",
      has(c.beta)
        ? `Beta ${num(c.beta, 2)}: quando o S&P 500 sobe ou cai 10%, ${c.sym ?? "o ativo"} tende a andar ~${num(10 * c.beta, 0)}%.`
        : null,
      "Como ler: beta alto ganha mais na alta e perde mais na queda. Foi o que explicou o ganho do momentum no estudo F35.",
    ],
  },
  mcap: {
    t: "Valor de mercado",
    f: (c) => [
      "Quanto a bolsa diz que a empresa inteira vale hoje (preço × número de ações).",
      has(c.mc)
        ? `${c.sym ?? "A empresa"}: ${c.mcTxt ?? num(c.mc, 0)}. ${c.mc >= 200e9 ? "Gigante (mega cap)." : c.mc >= 10e9 ? "Grande (large cap)." : c.mc >= 2e9 ? "Média (mid cap)." : "Pequena (small cap): mais oscilação."}`
        : null,
    ],
  },
  vol: {
    t: "Volume",
    f: (c) => [
      "Quantas ações trocaram de mão no dia (ou na média de 3 meses).",
      has(c.v) && has(c.av3) && c.av3 > 0
        ? `Hoje o volume está em ${num((100 * c.v) / c.av3, 0)}% da média de 3 meses.`
        : null,
      "Como ler: volume alto confirma o movimento (muita gente agindo); alta com volume baixo é mais frágil. Volume baixo também significa spread maior para comprar e vender.",
    ],
  },
  spread: {
    t: "Compra / venda (spread)",
    f: (c) => [
      "Compra (bid) é o maior preço que alguém aceita pagar agora; venda (ask) é o menor pelo qual alguém aceita vender.",
      has(c.bid) && has(c.ask) && c.bid > 0 && c.ask > c.bid
        ? `A diferença agora é ${n2(c.ask - c.bid)} (${pu((c.ask - c.bid) / c.ask)}), um custo escondido de cada operação.`
        : null,
      "Como ler: prefira ordem limitada (com preço) a ordem a mercado, principalmente em ativos de pouco volume.",
    ],
  },
  er: {
    t: "Taxa de administração",
    f: (c) => [
      "O custo anual do ETF, descontado aos poucos do valor da cota.",
      has(c.er)
        ? `Aqui, ${pu(c.er)} ao ano: US$ ${num(10000 * c.er, 0)} por ano a cada US$ 10.000.`
        : null,
      "Como ler: entre ETFs que fazem a mesma coisa, a taxa menor quase sempre vence no longo prazo.",
    ],
  },
  mom12: {
    t: "Momentum 12-1",
    f: (c) => [
      "Quanto o ativo subiu ou caiu nos últimos 12 meses, sem contar o último mês (o mês mais recente costuma devolver parte do movimento).",
      has(c.mom)
        ? `${c.sym ?? "Este ativo"}: ${p1(c.mom)}${has(c.pct) ? `, melhor que ${Math.round(c.pct * 100)}% da lista` : ""}.`
        : null,
      "Como ler: mostra quem vem mais forte. No estudo do app (F35), escolher pelos mais fortes não deu vantagem: deu mais risco. Use como informação, não como ordem.",
    ],
  },
  newsImpact: {
    t: "Notícias e impacto",
    f: (c) => [
      "Cada manchete recebe uma nota de −10 (muito ruim para este ativo) a +10 (muito boa), pelo que costuma acontecer com o preço depois desse tipo de notícia.",
      has(c.balance)
        ? `Para ${c.sym ?? "este ativo"}, o saldo das ${c.n} notícias com efeito é ${c.balance > 0 ? "+" : ""}${c.balance}: ${c.balance >= 2 ? "o noticiário pesa a favor" : c.balance <= -2 ? "o noticiário pesa contra" : "o noticiário está equilibrado"}.`
        : null,
      "Notícia que cita a empresa pesa mais; setor, região e geopolítica pesam menos, porque o efeito é indireto. As mais recentes pesam mais (a força cai pela metade a cada 2 dias).",
      "Como ler: notícia muito boa com o preço caindo, ou muito ruim com o preço subindo, é sinal de que o mercado já esperava a notícia. Use junto com a Decisão e os níveis.",
    ],
  },
  geo: {
    t: "Radar geopolítico",
    f: () => [
      "Temas de política internacional nas manchetes recentes (guerras, tarifas, sanções, tensão EUA–China, tréguas) e o efeito médio de cada um neste ativo.",
      "O mesmo tema afeta setores de forma oposta: um conflito no Oriente Médio tende a subir petróleo, ouro e defesa, e derrubar aéreas e turismo. Uma trégua faz o contrário.",
    ],
  },
  score: {
    t: "Nota (0 a 100)",
    f: () => [
      "Resume a análise integrada do ativo: gráfico, momentum, fundamentos, analistas e risco, cada um com o peso mostrado no título da coluna.",
      "Como ler: acima de 60 o conjunto é favorável; abaixo de 40, desfavorável; no meio, misto. A nota é uma leitura de qualidade, não uma ação: o que fazer está na Decisão do trader.",
    ],
  },
  trimPlan: {
    t: "Plano de ajuste",
    f: () => [
      "Quanto vender de cada posição para a agulha voltar à faixa do cenário, nesta ordem: menor perda realizada por ponto movido (posições no lucro primeiro). Só entra quem ajuda: com a carteira agressiva demais, o que tem beta acima da média; defensiva demais, os inversos.",
      "Preço, resultado e a velocidade (⚡ ritmo dos últimos 15 min projetado para 1 hora, com pré/pós) andam ao vivo. Resultado = realizado a preço de agora, antes de impostos e custos. 🔔 liga o aviso de tração de alta daquele ativo.",
    ],
  },
  trimWatch: {
    t: "Vigiar posições",
    f: () => [
      "Toque num ativo para alternar: ▼ reduzir → ▲ aumentar → nada.",
      "Reduzir: aviso quando subir no dia pelo menos o maior entre 1% e 0,75 do desvio diário de 20 pregões, ou quando voltar ao seu preço médio. Aumentar: aviso no recuo do mesmo tamanho. Chega pelo push (Configurações › Avisos › Ajuste da carteira), uma vez por ativo e tipo por dia.",
    ],
  },
  pfHelp: {
    t: "Tabela de posições",
    f: () => [
      "Cada coluna tem dois andares: em cima o principal, embaixo o detalhe (quantidade e preço médio; preço e pré/pós; valor e peso; dia em % e US$; total em % e US$). No celular, cada posição vira duas linhas, sem rolar para o lado.",
      'Preços ao vivo do Yahoo. "Dia" = desde o fechamento anterior (no dia da compra, desde o preço médio, como no Investing). ≈ = preço fora do pregão estimado pelo futuro equivalente ou pelo futuro do S&P × beta; * = sem cotação ao vivo (preço colado).',
    ],
  },
  bias: {
    t: "Termômetro bull/bear da carteira",
    f: () => [
      "Mostra para que lado a carteira inteira aponta: soma do peso ao vivo de cada posição × o beta dela contra o S&P 500 (1 ano de pregões). ETFs inversos têm beta negativo e puxam para bear; títulos e ouro têm beta perto de zero e puxam para neutro.",
      "Escala de −100 a +100: +50 = carteira que anda igual ao S&P 500; acima de +60 = mais agressiva que o índice; abaixo de −25 = aposta na queda.",
      "O triângulo é o cenário (intensidade do regime de risco do dia). Se a agulha está longe dele, a carteira não está alinhada ao momento: mais agressiva num mercado risk-off, ou defensiva demais num risk-on.",
    ],
  },
  weight: {
    t: "Peso na carteira",
    f: () => [
      "Quanto cada ativo representa do total investido.",
      "Como ler: um ativo com peso muito alto concentra o risco. Se ele cair 20% e pesar 30% da carteira, a carteira inteira cai 6%.",
    ],
  },
  hedge: {
    t: "Diminui a correlação via proteção, não diversificação",
    f: (c) => [
      `${c.sym ?? "Este ativo"} é um ETF inverso (ou se comporta como um): anda CONTRA o índice ou a ação que replica${has(c.spy) ? `; correlação de ${c.spy.toFixed(2).replace(".", decSep())} com o S&P 500 nos últimos ~120 pregões` : ""}.`,
      "Ele reduz a correlação da carteira porque sobe quando o resto cai: funciona como seguro (proteção, hedge), não como diversificação. Diversificar é somar algo que anda por conta própria e também pode render no longo prazo.",
      "Cuidado: inversos (e alavancados) perdem valor com o tempo pelo rebalanceamento diário e tendem a cair quando o mercado sobe. Servem para proteger por pouco tempo, não para carregar.",
    ],
  },
  regime: {
    t: "Regime de risco",
    f: (c) => [
      "O regime resume se o dinheiro está buscando risco (Risk-on) ou proteção (Risk-off). O app compara pares como ações × Treasuries, crédito de risco × governo, cíclicas × defensivas e cobre × ouro: quanto mais pares subindo, mais apetite por risco.",
      has(c.on) && c.n ? `Agora: ${c.on} de ${c.n} razões de risco em alta.` : null,
      has(c.intensity)
        ? `Intensidade ${Math.round(c.intensity)}/100: mede a força do movimento (amplitude, tendência e VIX). Abaixo de 20 é leitura fraca: vale pouco como sinal.`
        : null,
      "Prévia (pré-mercado, pós ou noite) usa futuros e preços fora do pregão; só se confirma na abertura. Leitura de contexto, em modo sombra: não gera ordem sozinha.",
    ],
  },
  sigma: {
    t: "Fluxo em desvios (σ)",
    f: () => [
      "O número com σ diz quanto o grupo andou hoje contra o seu benchmark, medido em desvios do próprio histórico: +1σ é um dia forte normal, +2σ ou mais é raro.",
      "Positivo = dinheiro entrando (o grupo ganha do benchmark); negativo = saindo. O fluxo é inferido por preço e volume, não por captação.",
      "Tom misto: os grupos de risco e os de proteção não apontam para o mesmo lado.",
    ],
  },
  outlier: {
    t: "Fora da curva",
    f: () => [
      "Ativo cujo movimento de hoje foge do que ele costuma fazer: variação do dia acima de ~2 desvios do próprio histórico recente.",
      "Como ler: é um alerta para olhar o motivo (notícia, resultado, dado macro), não um sinal de compra ou venda.",
    ],
  },
  champ: {
    t: "Qualidade e tendência (campeões)",
    f: (c) => [
      "Qualidade (0–100) compara a empresa com as do mesmo setor em lucro sobre o patrimônio (ROE), margens, crescimento de vendas, geração de caixa e dívida. Tendência (0–100) compara a força do preço nos últimos 6–12 meses.",
      has(c.Q)
        ? `${c.sym ?? "Este ativo"}: qualidade ${Math.round(c.Q)}, tendência ${Math.round(c.T)}, ${c.rank}º do setor.`
        : null,
      "Como ler: a lista diz o que vale acompanhar; o momento de entrar vem da Decisão e dos níveis.",
    ],
  },
};

export const HELP_KEYS = Object.keys(T);

/** { title, body } da chave com os dados atuais (puro, para testar). */
export function helpText(key, ctx = {}) {
  const e = T[key];
  if (!e) return null;
  const lines = e.f(ctx).filter(Boolean);
  return { title: e.t, body: lines.map((l) => `<p>${esc(l)}</p>`).join("") };
}

/** Botão "?" do termo. ctx vai serializado no próprio botão (só números e textos curtos). */
export function hq(key, ctx = {}) {
  if (!T[key]) return "";
  // span com papel de botão: pode ficar dentro de outro botão (balões de contagem) ou de cabeçalho ordenável
  return `<span role="button" tabindex="0" class="hq" data-help="${key}" data-hc="${esc(JSON.stringify(ctx))}" aria-label="O que é ${esc(T[key].t)}?" aria-haspopup="dialog">?</span>`; // prettier-ignore
}

/** Botão "!" de alerta (mesmo balão do "?"). */
export const hx = (key, ctx = {}) => hq(key, ctx).replace('class="hq"', 'class="hq hx"').replace(">?</span>", ">!</span>"); // prettier-ignore

// ───────── balão (um por vez) ─────────
let pop = null;
let from = null;

function close() {
  if (!pop) return;
  pop.remove();
  pop = null;
  from?.setAttribute("aria-expanded", "false");
  from = null;
}

function open(btn) {
  close();
  let ctx = {};
  try {
    ctx = JSON.parse(btn.dataset.hc || "{}");
  } catch {
    /* sem dados: texto genérico */
  }
  const h = helpText(btn.dataset.help, ctx);
  if (!h) return;
  pop = document.createElement("div");
  pop.className = "hq-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", h.title);
  pop.innerHTML = `<div class="hq-head"><b>${esc(h.title)}</b><button type="button" class="hq-x" aria-label="Fechar">×</button></div>${h.body}`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 24);
  pop.style.width = `${w}px`;
  const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
  const below = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
  pop.style.left = `${left}px`;
  pop.style.top = `${below ? r.bottom + 8 : Math.max(12, r.top - pop.offsetHeight - 8)}px`;
  from = btn;
  btn.setAttribute("aria-expanded", "true");
  pop.querySelector(".hq-x").focus({ preventScroll: true });
}

/** Liga os balões uma vez (cliques em fase de captura: o "?" não abre a linha da tabela por baixo). */
export function initHelp() {
  if (typeof document === "undefined" || initHelp.done) return;
  initHelp.done = true;
  document.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest?.(".hq");
      if (b) {
        e.preventDefault();
        e.stopPropagation();
        if (from === b) close();
        else open(b);
        return;
      }
      if (pop && (e.target.closest?.(".hq-x") || !pop.contains(e.target))) close();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") return close();
      const b = e.target.closest?.(".hq");
      if (b && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.stopPropagation();
        if (from === b) close();
        else open(b);
      }
    },
    true,
  );
  window.addEventListener("scroll", close, { passive: true, capture: true });
  window.addEventListener("resize", close);
}
