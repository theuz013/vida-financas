# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

PWA instalável no iPhone e versão web no computador, mesmo login e mesmos dados. Fase 2: o mesmo código empacotado com Capacitor para App Store e Play Store (continua sendo uma interface web; não adota linguagem visual nativa).

## Stack

Escolhida com o dono: React 19 + TypeScript + Vite (SPA/PWA) servida por um Cloudflare Worker (Hono) com banco D1 (Drizzle) e login Better Auth. Plano gratuito da Cloudflare; nada pago. Trocou o Firebase da especificação original por decisão do dono.

## Users

Um usuário no MVP: o dono do app, que se diz muito desorganizado e quer um lugar só para controlar a vida e as finanças. Usa principalmente no iPhone, ao longo do dia, para registrar um gasto na hora ou ver o que tem para hoje; no computador para revisar o mês. O assistente pessoal dele (Pelúcio, no WhatsApp) também grava registros pela API.

O app nasce pronto para vários usuários (lojas), mas o cadastro fica fechado até o dono decidir abrir.

## As três vertentes

1. Vida pessoal: rotina, planos, tarefas e compromissos dele.
2. Gastos pessoais: contas e finanças dele.
3. Contas da casa (vertente familiar): a casa dele, com cada pessoa no seu login, entrada por código de convite (6 caracteres, 7 dias, revogável), papéis de administrador e membro, permissões por membro (finanças, criar tarefas e compromissos, lista de compras), contas da casa com "quem pagou", tarefas com responsável, agenda e lista de compras. Não é SaaS para várias famílias (essa ideia continua arquivada) e não tem WhatsApp: avisos só por push e dentro do app. O assistente do WhatsApp é só do dono.

## Product Purpose

Responder duas perguntas sem esforço: "o que eu tenho para hoje?" e "quanto eu posso gastar?". Duas vertentes de mesmo peso, financeira e pessoal, cada uma com telas, registros e resumo próprios, que se encontram na visão Hoje (a tela principal).

Sucesso: ele para de esquecer contas, prazos e leituras de medidor, e sabe antes de comprar se a compra cabe até o próximo salário.

## Positioning

Organizador manual próprio com o conjunto de recursos do PingDin (contas, cartões, faturas, "Posso comprar isso?", gasto por dia, contas a pagar) sem assinatura, somado a uma vertente de vida (tarefas, compromissos, lembretes recorrentes, prazos, pendências por frente) que o PingDin não tem, e alimentado também pelo assistente no WhatsApp.

## Operating Context

- Registro rápido em poucos toques, muitas vezes em pé, no celular, logo depois de pagar.
- O assistente recebe "comprei X" ou "conta de Y amanhã" no WhatsApp e grava pela API com chave.
- Salário variável, sem data fixa: ele informa a data do próximo recebimento e o app conta até lá.
- Frentes da vida (padrão genérico, editáveis): Casa, Trabalho, Carro, Pessoal.
- Contas recorrentes e lembretes ficam por conta de cada pessoa: nenhum dado pessoal vem pronto no app.
- Avisos por notificação push: resumo do dia às 08h, véspera de lembretes, compromissos com antecedência.

## Capabilities and Constraints

- Nunca pede, guarda ou usa credencial bancária. Não movimenta dinheiro, não conecta em banco.
- Transferência entre contas próprias (inclusive pagar fatura) não conta como gasto nem receita.
- Dinheiro em centavos; datas no fuso America/Sao_Paulo.
- Exigências das lojas já atendidas no MVP: exclusão de conta, exportação dos dados, política de privacidade, modo demonstração com dados de exemplo.
- Fora do MVP: captura automática por notificação do banco, importação de PDF, planilha sincronizada, multiusuário/família, metas e relatórios avançados.

## Brand Commitments

- Nome provisório: Vida & Finanças.
- Idioma pt-BR.
- Direção visual fixada pelo dono: parecer com a interface do assistente dele; cinza claro / cinza escuro; tipografia limpa; sem azul; cor só onde significa algo (vermelho = vencido, verde = pago); nada de gradiente chamativo. Estrutura, hierarquia e densidade das telas do app PingDin como base.

## Evidence on Hand

- Especificação do dono (este repositório a reflete).
- Prints do onboarding do PingDin (11 telas, novembro de 2026): base de estrutura e hierarquia, registrada em DESIGN.md.
- Prints da interface do assistente: ainda não enviados.

## Product Principles

0. Celular primeiro (decisão do dono): toda tela nasce para o iPhone, de 320px para cima; o computador é adaptação.
1. Hoje primeiro: a tela de abertura responde "o que eu tenho para hoje?" juntando as duas vertentes.
2. Registrar custa poucos toques; corrigir depois é fácil.
3. Número com contexto: todo valor de "pode gastar" diz até quando e o que já foi descontado.
4. Cor é sinal, não enfeite: vermelho, verde e âmbar só quando o estado muda algo para ele.
5. Organizar sem virar gerenciador de projetos: pendências por frente, não quadros e fluxos.
