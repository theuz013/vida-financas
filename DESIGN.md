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

Todo o resto é cinza (`ink`, `ink-2`, `ink-3`, `sunken`, `line`).

## Componentes

`src/components/ui.tsx`: Button (primary / secondary / ghost / danger), Card, Section, Row e List (linhas com divisória), Chip (tons de estado), Money (números tabulares), Field, Input, MoneyInput (teclado decimal, aceita "67,54"), Segmented, Sheet (folha que sobe do rodapé no celular e vira janela no computador), Empty, Skeleton.

Ícones: Lucide, traço 2. Emoji só nas categorias, que a especificação pede.

## Layout

Celular: barra de abas (Hoje, Finanças, +, Vida, Ajustes) com o + de registrar no meio. Computador (≥768px): menu lateral e coluna de conteúdo de até 48rem.

## Pendente

Referência da interface do assistente (o dono vai mandar). Quando chegar, ajustar tokens de cinza e tipografia aqui antes de mexer nas telas.
