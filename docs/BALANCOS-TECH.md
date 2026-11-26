# Balanços tech por subtema (Mercados › Offshore › Agenda › 💻 Balanços tech)

Objetivo: antecipar quem divulga balanço em breve, com o que o mercado espera, para avaliar entrar antes
e surfar um resultado positivo. Material educacional; não é recomendação.

## Universo (fonte única)

- Linhas do grupo "IA: subtemas" do Fluxo (`assets/flow-universe.js`) + nomes de cada linha
  (`assets/theme-names.js`) + Big Tech (`EXTRA_THEMES` em `assets/earnings.js`).
- ETF não divulga balanço: sai sozinho (Nasdaq sem histórico, sem previsão e fora do calendário).

## Dados

- `scripts/update-earnings.mjs` → `data/earnings.json`; cron `update-earnings.yml` (dias úteis, 11:25 e 22:25 UTC).
- Nasdaq (gratuita): calendário por dia (−21 a +100 dias: data, horário, consenso de LPA, LPA do ano anterior),
  `earnings-forecast` (faixa, nº de analistas, revisões ↑/↓ em 4 semanas) e `earnings-surprise` (data divulgada,
  LPA × consenso).
- Preço: `data/hist`. **Corrida pré** = variação nos 10 pregões até o último fechamento antes da divulgação;
  **reação** = desse fechamento ao primeiro depois (antes da abertura reage no próprio dia).

## Regras

- Data sem confirmação = última divulgação + 91 dias (marcada "estimada"), sempre no futuro.
- Divulgação das últimas 3 semanas ainda fora do histórico de surpresas entra como "a confirmar".
- Previsão pula o trimestre já divulgado (a Nasdaq demora a virar).
- "Bateu" = LPA > consenso (não usa o % da Nasdaq, que inverte o sinal com consenso de prejuízo); surpresa média
  só com consenso ≥ US$ 0,10 e cada trimestre limitado a ±100%. Cresc. LPA só com base ≥ US$ 0,05.
- Leitura (forte/neutro/fraco, `setupOf`): revisões líquidas, bateu em todas, corrida pré positiva na maioria.

## Tela

Destaque dos próximos 7 dias em cartões → tabela das próximas na janela → últimos resultados (45 dias) em ordem
cronológica. Filtros: subtema, janela, leitura, só da carteira. Ordenar: data, corrida pré, surpresa, revisões,
crescimento do LPA, valor de mercado.
