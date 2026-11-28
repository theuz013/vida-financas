---
name: Vida & Finanças
mode: operate
colors:
  bg: "oklch(0.975 0.002 260)"
  surface: "oklch(1 0 0)"
  sunken: "oklch(0.945 0.003 260)"
  line: "oklch(0.905 0.004 260)"
  ink: "oklch(0.22 0.006 260)"
  ink-2: "oklch(0.45 0.008 260)"
  ink-3: "oklch(0.56 0.008 260)"
  accent: "oklch(0.25 0.006 260)"
  hero: "oklch(0.26 0.006 260)"
  bad: "oklch(0.55 0.19 27)"
  good: "oklch(0.52 0.12 152)"
  warn: "oklch(0.58 0.13 70)"
  scrim: "oklch(0.15 0 0 / 0.45)"
typography:
  family: "Inter Variable"
  title: { size: 30px, weight: 800, tracking: -0.03em }
  hero-number: { size: 44px, weight: 800, tracking: -0.035em }
  section: { size: 17px, weight: 700 }
  body: { size: 15px, weight: 500 }
  meta: { size: 13px, weight: 400 }
radius: { card: 16px, control: 12px, pill: 9999px }
---

# Design

Tokens em `src/styles.css` (`@theme`, Tailwind 4). Modo escuro automático pelo aparelho, com os mesmos nomes de token.

## Direção

Fixada pelo dono: parecer com a interface do assistente dele, cinza claro e cinza escuro, tipografia limpa, **sem azul**, nada de gradiente. A estrutura vem do PingDin (prints do onboarding, novembro de 2026): títulos grandes e pesados, cartões brancos arredondados sobre fundo cinza, linhas "nome à esquerda, valor à direita", botão principal largo em pílula no rodapé e o cartão escuro de "R$ X / dia" com a conta explicada logo abaixo. O roxo do PingDin **não** entra: o acento é grafite.

## Cor

Cor só quando significa algo:

| Token | Uso |
|---|---|
| `bad` / `bad-soft` | vencido, atrasado, não cabe, saldo negativo |
| `good` / `good-soft` | pago, cabe, receita, tarefa concluída |
| `warn` / `warn-soft` | vence hoje, aperta, prioridade alta, prazo perto, valor a confirmar |
| `accent` | ação principal e item selecionado |
| `scrim` | fundo escurecido atrás das folhas e janelas |

Todo o resto é cinza (`ink`, `ink-2`, `ink-3`, `sunken`, `line`).

## Componentes

`src/components/ui.tsx`: Button (primary / secondary / ghost / danger), Card, Section, Row e List (linhas com divisória), Chip (tons de estado), Money (números tabulares), Field, Input, MoneyInput (teclado decimal, aceita "67,54"), Segmented, Sheet (folha que sobe do rodapé no celular e vira janela no computador; aceita uma faixa `tabs` fixa acima do conteúdo; trava a página de trás), Empty, Skeleton.

Ícones: Lucide, traço 2. Emoji só nas categorias, que a especificação pede.

## Layout — celular primeiro

Prioridade do dono: o celular vem antes. Tudo é desenhado para o iPhone (a partir de 320px, iPhone SE) e o computador (≥768px) é adaptação: menu lateral e coluna de até 48rem.

- Barra de abas (Hoje, Finanças, +, Vida, Ajustes). O + do meio é a ação principal da tela atual (`usePlusAction`): Registrar por padrão, Novo compromisso na Agenda, Nova conta a pagar em Contas etc. Assim a ação fica no alcance do polegar e o botão do topo só aparece no computador.
- Alvo de toque mínimo de 44px. Controles visualmente menores usam a utilidade `hit` / `hit-lg`, que estende a área tocável sem mudar o desenho.
- Toda ação tem estado de pressionado (`active:`), porque `hover:` não existe no toque.
- Folhas sobem do rodapé, com alça para arrastar e fechar, e sobem junto com o teclado do iPhone (visualViewport) para o botão de salvar continuar visível.
- Puxar para atualizar no topo da página (o iPhone não oferece isso com o app instalado).
- Valores em dinheiro com máscara R$ 1.000,00 (`MoneyInput` / `maskBRL`).
- Menus de seção (Vida e Casa) usam `SectionTabs`: no celular ficam fixos no topo depois de passar da posição natural, sem depender de `sticky` (o Safari do iPhone falha nele).
- Campos com fonte de 16px (o iOS não dá zoom) e teclado certo (`inputMode="decimal"` para dinheiro).
- Abaixo de 375px, títulos e o cartão principal ficam mais compactos.
- Conferência: `node scripts/mobile-audit.cjs` (nada vazando e nenhum alvo menor que 44px) e `node scripts/ui-gestures.cjs`.

## Pendente

Referência da interface do assistente (o dono vai mandar). Quando chegar, ajustar tokens de cinza e tipografia aqui antes de mexer nas telas.
