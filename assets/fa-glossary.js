// Explicações em linguagem simples de cada métrica da aba Valor.
// `what`: o que é (uma frase); `read`: como ler; `limit`: onde costuma errar.

export const FA_GLOSSARY = [
  {
    name: "P/L (preço sobre lucro)",
    what: "Quantos anos de lucro atual você paga pelo preço de hoje.",
    read: [
      "P/L 25 = paga 25 anos de lucro.",
      "Comparar com o próprio histórico e com pares parecidos, nunca isolado.",
    ],
    limit:
      "Lucro de um ano só oscila com o ciclo: em empresas cíclicas o P/L fica baixo no topo e alto no fundo.",
  },
  {
    name: "Rendimento do lucro",
    what: "O inverso do P/L (1/PL): quanto a empresa lucra para cada 100 investidos.",
    read: ["P/L 25 = rendimento de 4% ao ano.", "Dá para comparar direto com a taxa de um título."],
    limit: "Lucro não é dividendo: parte é reinvestida, e o lucro pode cair.",
  },
  {
    name: "Prêmio de risco da bolsa",
    what: "Rendimento do lucro menos o juro real do Tesouro americano (TIPS de 10 anos).",
    read: [
      "Acima de 4%: bolsa paga bem pelo risco.",
      "Abaixo de 2%: paga pouco; o título protegido da inflação compete forte.",
    ],
    limit:
      "Usar juro real, não nominal: a inflação afeta os dois lados (crítica de Asness ao 'Fed model').",
  },
  {
    name: "CAPE (P/L de Shiller)",
    what: "Preço sobre a média do lucro real dos últimos 10 anos. Remove o efeito do ciclo.",
    read: [
      "CAPE alto = retorno dos 10 anos seguintes historicamente baixo.",
      "Retorno real esperado ≈ 1/CAPE (CAPE 40 → ~2,5% a.a.).",
    ],
    limit:
      "Explica 10 anos, quase nada de 1 ano. Mudanças na contabilidade e mais recompras elevam o 'normal'.",
  },
  {
    name: "Excess CAPE Yield (ECY)",
    what: "1/CAPE menos o juro real: o quanto a bolsa rende acima dos títulos, com o lucro alisado.",
    read: [
      "ECY alto = bolsa barata frente aos títulos.",
      "Melhor que o CAPE puro quando os juros mudam muito.",
    ],
    limit:
      "Depende da definição de juro real (Shiller usa juro de 10 anos menos a inflação passada).",
  },
  {
    name: "Spread de crédito (OAS)",
    what: "Quanto um título de empresa paga acima do Tesouro de mesmo prazo.",
    read: [
      "Spread alto = o mercado já cobra caro pelo risco de calote (barato para quem compra).",
      "Spread baixo = pouca folga se a economia piorar.",
    ],
    limit: "O spread abre rápido nas crises: barato pode ficar mais barato antes de melhorar.",
  },
  {
    name: "Juro real",
    what: "O juro descontada a inflação esperada (título TIPS de 10 anos).",
    read: [
      "Juro real alto = títulos pagam bem; aperta o valuation de ações e ouro.",
      "Juro real negativo = poupar em título perde poder de compra.",
    ],
    limit: "Juro real alto pode subir mais; barato não quer dizer que o preço não cai.",
  },
  {
    name: "Curva de juros (10 anos − 3 meses)",
    what: "Diferença entre o juro longo e o curto.",
    read: [
      "Curva positiva = quem alonga prazo ganha prêmio.",
      "Curva invertida costuma anteceder recessões.",
    ],
    limit: "O sinal de recessão pode demorar 1 a 2 anos para aparecer.",
  },
  {
    name: "Ouro × juro real",
    what: "Historicamente o ouro cai quando o juro real sobe (ouro não paga juro).",
    read: [
      "Ouro acima do que o juro real explica = caro.",
      "Relação quebrada = o modelo não vale no período.",
    ],
    limit: "Desde 2022 bancos centrais compram ouro em volume e a relação se desfez.",
  },
  {
    name: "Valor × momentum",
    what: "Dois fatores com correlação negativa: barato tende a ganhar em anos; o que sobe tende a seguir subindo por meses.",
    read: [
      "Barato com momentum: os dois concordam.",
      "Caro com momentum: seguir com stop curto.",
      "Barato sem momentum: esperar o preço virar.",
    ],
    limit: "Valor pode ficar barato por anos (2007–2020 foi ruim para o fator valor).",
  },
];
