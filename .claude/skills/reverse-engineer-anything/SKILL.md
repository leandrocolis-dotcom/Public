---
name: reverse-engineer-anything
description: Pesquisa ferramentas, sites ou produtos e faz engenharia reversa de como funcionam (modelos, premissas, regras, entradas e saídas), gerando um relatório .md em docs/. Use quando o usuário pedir para "descobrir como X funciona", "engenharia reversa" ou comparar metodologias de terceiros.
---

# Engenharia reversa de qualquer coisa

Objetivo: entender como um produto/ferramenta/metodologia funciona por dentro, a
partir de evidências públicas, e transformar isso em ideias aplicáveis ao projeto
(ver `docs/OBJETIVO.md`).

## Passos

1. **Delimitar o alvo:** liste as ferramentas/sites a estudar (8–15 é um bom
   tamanho). Se o pedido for genérico, escolha as referências mais usadas do
   mercado, incluindo opções brasileiras.
2. **Coletar evidências** (WebSearch/WebFetch quando disponíveis, em paralelo):
   páginas de metodologia, FAQs, white papers, documentação, patentes, artigos
   de terceiros, comportamento observável da interface. Anote a fonte de cada
   afirmação.
3. **Reconstruir o modelo** de cada alvo:
   - entradas (dados usados);
   - transformação (regras, pesos, fórmulas, limiares);
   - saída (escala da nota/sinal, horizonte, distribuição);
   - regras de entrada e de saída/stop, quando houver;
   - premissa econômica (por que deveria funcionar) e fraquezas.
     Marque como **(inferido)** tudo que não estiver documentado publicamente.
4. **Sintetizar padrões:** tabela de regras recorrentes × quem usa; o que quase
   ninguém mostra (backtest, custos, sobreajuste).
5. **Aplicação ao projeto:** lista curta de ideias para avaliar, sem aplicar.
   Respeitar as restrições do `CLAUDE.md` (ex.: não mexer nos limites do
   aprendizado sem autorização).
6. **Entregar:** salvar em `docs/ESTUDO-<TEMA>.md` (português, aviso de material
   educacional), rodar `npx prettier --write` no arquivo, commitar e seguir o
   fluxo de merge/push do `CLAUDE.md`.

## Regras

- Nunca apresentar pesos proprietários como fatos se não forem públicos.
- Citar se a pesquisa foi feita com busca na web ou só com conhecimento prévio.
- Não é recomendação de investimento.
