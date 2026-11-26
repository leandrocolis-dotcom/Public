# Silêncio Funcional: diretriz visual do Pêndulo (20/11/2026)

Base: princípios da skill `canvas-design` (forma e espaço comunicam; o texto é pouco, só o essencial) aplicados à UI.

## Princípios

1. **A tela mostra dados; a explicação fica a um passe de mouse.** Todo texto de "como ler", método e fonte vai para o
   ícone **(i)** ao lado do título do cartão. Na tela ficam números, rótulos curtos, avisos e erros.
2. **Nada de vão.** Coluna alta de um lado não pode deixar o outro lado vazio: distribuir o detalhe (ex.: pêndulo da
   Início, detalhe à esquerda embaixo do texto).
3. **Uma linha de navegação.** Lado (Offshore | Onshore) em pílula, sub-abas e (i) na mesma linha.
4. **Linhas cheias.** Cartões de resumo crescem para ocupar a linha, sem item sobrando sozinho.

## Como funciona o (i)

- `assets/info-tips.js` (`initInfoTips` no `app.js`): observa o DOM e converte `p.note`, `.dn-note`, `p.small`,
  `p.muted.small` com 70+ caracteres, e `p.muted` de 90+ logo abaixo de um título, num (i) ao lado do título do cartão
  (vários textos no mesmo cartão viram parágrafos do mesmo balão). Sem título por perto, o (i) fica no lugar do texto.
- **Não converte:** elementos com `id`, `role="status"`, `aria-live`, com `canvas/svg/table`, dentro de `[data-keep]`,
  ou que comecem com aviso/erro ("Avisos", "Fonte com falha", "Erro", "⚠"…). Botões dentro da nota ficam na tela.
- Texto que precisa ficar visível: marcar com `data-keep`.
- HTML estático: `it("texto")` gera um (i) com o texto puro no balão (usado na frase de cada aba, `TAB_INFO`).
- Desktop: abre no hover e fixa no clique; celular: toque; `Esc` fecha.
