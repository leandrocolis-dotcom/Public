// Long & Short: tour guiado e manual de uso (puro). Textos num lugar só; a tela (ls-view.js) só desenha.
// O tour roda sobre um EXEMPLO fixo (SOXL × SQQQ, o mesmo da especificação), nunca sobre a carteira real, e não
// registra nada. Cada passo aponta para um bloco da tela pelo atributo data-tour.
import { assetInfo } from "./ls-etfs.js";
import { PARAMS } from "./ls-params.js";

/** Passos do tour: anchor = data-tour do bloco destacado. */
export const TOUR = [
  {
    anchor: "status",
    title: "1. Onde estamos no dia",
    text: "A barra do topo diz a fase do mercado (PRÉ, REGULAR, PÓS ou FECHADO), a hora em Nova York e em Brasília e o próximo horário que muda as regras.",
    example:
      "● REGULAR 10:15 ET · 12:15 BRT · “fim dos aumentos em 4h45”. Travas “✓ ok” em cinza = nada travado.",
  },
  {
    anchor: "plan",
    title: "2. Plano do dia (1 minuto, antes de operar)",
    text: "Escreva o capital e, para cada par, o viés, o gatilho de entrada e a exposição direcional (0 = neutro). Sem plano o app não libera compras; vendas e zeragens continuam liberadas.",
    example:
      "Capital 25.000 · SOXL × SQQQ: viés alta, gatilho “SOXX acima de 250”, direcional 0,3 (leve aposta na alta).",
  },
  {
    anchor: "metrics",
    title: "3. Os números da carteira",
    text: "1R é quanto você aceita perder por ponta (0,5% do capital). P&L do dia em R, quanto ainda pode perder hoje antes de travar, o tamanho total da aposta (bruta) e para que lado ela pende (líquida).",
    example: "P&L +US$ 101,70 (+0,81R) · limite restante US$ 601,70 · 1R = US$ 125.",
  },
  {
    anchor: "order1",
    title: "4. Ordens agora: a resposta",
    text: "Leia de cima para baixo e faça na ordem. ▼ rosa reduz risco, ▲ verde aumenta, ⊘ cinza está bloqueada. A linha pequena traz o preço limite, o stop e a regra (P0 a P7).",
    example:
      "“▼ VENDER 92 SQQQ · limite 19,70 · P3”: o SOXL ganhou +1,48R e o SQQQ perde −0,66R; a regra corta 1/3 da ponta perdedora. Na corretora: venda limitada de 92 SQQQ a 19,70.",
  },
  {
    anchor: "stop",
    title: "5. Subir o stop",
    text: "Quando aparece “↥ SUBIR STOP”, mude o stop na corretora para o valor indicado. O stop só se aproxima do preço, nunca se afasta.",
    example:
      "“↥ SUBIR STOP SOXL para 30,36”. Depois de mudar na corretora, toque em “Atualizei na corretora”.",
  },
  {
    anchor: "blocked",
    title: "6. Ordem bloqueada: espere",
    text: "Cinza com ⊘ é algo que as regras ainda não deixam fazer. Toque para ver o motivo. Ela libera sozinha quando o motivo some.",
    example:
      "“⊘ BLOQUEADO · comprar 46 SOXL — aguarda reduzir a perdedora”. Feita a venda do SQQQ e com o rompimento do SOXX confirmado, vira “▲ COMPRAR 46 SOXL, stop 30,36”.",
  },
  {
    anchor: "buttons",
    title: "7. Executei e Ignorar (os dois são opcionais)",
    text: "Executei: informe a quantidade e o preço reais e o painel atualiza na hora; sem isso, ele atualiza na próxima foto do BTG. Ignorar: a ordem some por 15 min.",
    example:
      "Atenção: 2 alertas de risco ignorados em 30 min bloqueiam entradas até o dia seguinte.",
  },
  {
    anchor: "pairs",
    title: "8. Cartão do par",
    text: "Mostra a situação do par (cenário), o resultado das duas pontas em R e o stop de cada uma, que você pode digitar. “Detalhes” abre VWAP, faixa de abertura e outros dados técnicos, só se quiser.",
    example:
      "“Cenário 1: long certo, short errado” · LONG SOXL 154 +1,48R · SHORT SQQQ 277 −0,66R.",
  },
  {
    anchor: "alerts",
    title: "9. Alertas",
    text: "Só os avisos que valem agora; somem quando a situação passa. ‼ rosa é crítico, → é ação sugerida, ⚠ âmbar é atenção.",
    example: "“→ DEC-01 Mercado confirmou SOXL. VENDER 92 de SQQQ e suba o stop de SOXL.”",
  },
  {
    anchor: "metrics",
    title: "10. Dúvida? Toque no ⓘ",
    text: "Todo número e todo botão tem um ⓘ ao lado: o que é, como ler e o que fazer, em 3 linhas.",
    example: "Toque no ⓘ do “P&L do dia” para ver.",
  },
  {
    anchor: "guide",
    title: "11. Sua rotina em 4 passos",
    text: "1) Antes do pregão: plano do dia. 2) Durante: olhe só “Ordens agora”, rosa primeiro. 3) Na corretora: ordem limitada no preço indicado e stop atualizado. 4) Tela rosa cobrindo tudo: pare e zere. Este resumo fica no bloco “Como usar”.",
    example: "Pronto. Toque em “Sair do tour” para voltar à sua carteira.",
  },
];

/** Manual curto (bloco “Como usar” da tela e docs/long-short/MANUAL.md). */
export const MANUAL = {
  routine: [
    [
      "Antes do pregão",
      "Abra Carteira › Long & Short e preencha o Plano do dia (capital e, por par, viés, gatilho e direcional 0 = neutro).",
    ],
    [
      "Durante o dia",
      "Olhe só “Ordens agora”. Faça de cima para baixo: primeiro as rosas ▼ (reduzem risco), depois as verdes ▲ (aumentam).",
    ],
    [
      "Na corretora",
      "Use ordem limitada no preço indicado. Ao comprar, coloque o stop mostrado. Ao ver “↥ SUBIR STOP”, suba o stop.",
    ],
    [
      "Se a tela ficar rosa",
      "Limite do dia ou outra trava crítica: zere as posições indicadas e pare por hoje.",
    ],
  ],
  colors: [
    ["▼ rosa", "reduz risco (vender, zerar, cobrir)"],
    ["▲ verde", "aumenta risco (comprar, aumentar)"],
    ["⊘ cinza", "bloqueada: as regras ainda não deixam; toque para ver por quê"],
    ["⚠ âmbar", "atenção (perto de um limite, dado aproximado, pré/pós-mercado)"],
    ["✓ cinza", "tudo certo (verde nunca quer dizer “ok” aqui)"],
  ],
  rules: [
    "Sem plano do dia, nada de compra. Venda e zeragem sempre liberadas.",
    "Perdeu 2% do capital no dia: o app manda zerar tudo e trava compras até o dia seguinte.",
    "Nunca aumentar uma ponta que está perdendo (preço médio para baixo é proibido).",
    "Pré e pós-mercado: só ordem limitada, metade do tamanho; no pós, só reduzir.",
    "O app não envia ordens: quem executa é você, na corretora.",
  ],
};

const NOW = Date.parse("2026-12-01T15:15:00Z"); // terça, 10:15 em NY: pregão regular
/** Horário fixo do exemplo do tour. */
export const DEMO_NOW = NOW;

/** Entrada do motor do EXEMPLO (especificação: SOXL 154 @ 30 → 31,20; SQQQ 277 @ 20 → 19,70). */
export function demoInput() {
  const q = (P) => ({ P, bid: Math.round((P - 0.005) * 1000) / 1000, ask: Math.round((P + 0.005) * 1000) / 1000, ts: NOW - 2000 }); // prettier-ignore
  const u = (S, atrIntra) => ({ S, atrIntra, atrD: S * 0.02, vwap: { value: S * 0.995, approx: false }, vwapExt: { value: S * 0.995, approx: false }, or: { lo: S * 0.99, hi: S * 1.003, done: true }, pre: { lo: S * 0.985, hi: S * 1.002 }, gap: { pct: 0.4, atr: 0.2 }, breakout: { dir: null, volRel: 1.1 }, crosses: 1, bias: "alta" }); // prettier-ignore
  return {
    now: NOW,
    session: "REGULAR",
    minET: 615,
    cutMin: 900,
    marks: { eod: 945, posteod: 1185, close: 960 },
    date: "2026-12-01",
    capital: 25000,
    params: PARAMS,
    plan: { ok: true, pairs: { "SOXL-SQQQ": { bias: "alta", trigger: "SOXX acima de 250", dirPlan: 0.3 } } }, // prettier-ignore
    calendar: { blocks: false, special: false, validated: true, reason: null },
    day: {},
    vix: 15,
    events: [],
    liveOrders: [],
    extraBlockers: [],
    pairs: [
      {
        id: "SOXL-SQQQ",
        name: "SOXL × SQQQ",
        corr: 0.8,
        betas: { SOXX: 1.0, QQQ: 1.0 },
        long: { sym: "SOXL", dir: 1, qty: 154, avg: 30, stop: 29.19, hwm: 31.2, pRef: 30, sessions: 0, asset: assetInfo("SOXL"), quote: q(31.2), under: u(250, 1.5) }, // prettier-ignore
        short: { sym: "SQQQ", dir: 1, qty: 277, avg: 20, stop: 19.55, hwm: 20, pRef: 20, sessions: 0, asset: assetInfo("SQQQ"), quote: q(19.7), under: u(500, 2.5) }, // prettier-ignore
      },
    ],
  };
}
