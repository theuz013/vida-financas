# Vida & Finanças

App pessoal para controlar a vida e as finanças: contas, cartões e faturas, "Posso comprar isso?", gasto por dia até o próximo salário, contas a pagar, tarefas, compromissos, lembretes recorrentes, prazos e a visão **Hoje**, que junta tudo.

PWA (iPhone + web) servido por um Cloudflare Worker, com banco D1. Plano gratuito da Cloudflare.

| Parte | Tecnologia |
|---|---|
| App | React 19, TypeScript, Vite, Tailwind |
| API | Hono no Cloudflare Worker (`worker/`) |
| Banco | Cloudflare D1 (SQLite) com Drizzle (`worker/db/schema.ts`, `migrations/`) |
| Login | Better Auth (e-mail e senha, cookie no navegador, token Bearer para o app nativo) |
| Avisos | Cron do Worker a cada 15 min + Web Push (VAPID) |
| Regras de cálculo | `shared/finance.ts` (testado em `shared/finance.test.ts`) |

## Rodar no computador

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

Preencha o `.dev.vars`: `BETTER_AUTH_SECRET` com `openssl rand -base64 32` e as chaves de push com a saída de:

```bash
node scripts/vapid.mjs
```

Crie o banco local e suba o app em http://localhost:5173:

```bash
npm run db:migrate:local
```

```bash
npm run dev
```

Cada cadastro começa só com o genérico: categorias, frentes (Casa, Trabalho, Carro, Pessoal) e a carteira. Nenhum dado pessoal vem pronto; o que for cadastrado fica só na conta de quem cadastrou.

### Testes

```bash
npm test
```

Teste de ponta a ponta da API (com `npm run dev` rodando e banco local novo):

```bash
node scripts/smoke.mjs
```

Teste dos fluxos pela interface, no tamanho de um iPhone (Playwright):

```bash
node scripts/ui-flow.cjs
```

Celular (prioridade do app): auditoria de toque e largura no iPhone SE, e gestos (arrastar para fechar, puxar para atualizar, + por tela):

```bash
node scripts/mobile-audit.cjs
```

```bash
node scripts/ui-gestures.cjs
```

Para regerar os ícones a partir de `public/icon.svg`:

```bash
node scripts/icons.mjs
```

## Publicar na Cloudflare (gratuito)

Este app usa uma **conta Cloudflare própria**, separada de qualquer outro projeto (de outro sistema, incluído). Nada dele é criado numa conta já usada por outro sistema.

1. Crie a conta nova na Cloudflare (gratuita). Se o wrangler já estiver logado em outra conta nesta máquina, saia primeiro:

   ```bash
   npx wrangler logout
   ```

   Depois entre com a conta nova:

   ```bash
   npx wrangler login
   ```

   Confira que é a conta certa antes de criar qualquer coisa:

   ```bash
   npx wrangler whoami
   ```

   Copie o Account ID que aparecer para o campo `account_id` do `wrangler.jsonc` (tire o `//` da frente). Assim o deploy só aceita essa conta.

2. Crie o banco e copie o `database_id` que aparecer para o `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create vida-financas-db
   ```

3. Cadastre os segredos (um de cada vez; cada comando pede o valor):

   ```bash
   npx wrangler secret put BETTER_AUTH_SECRET
   ```

   ```bash
   npx wrangler secret put BETTER_AUTH_URL
   ```

   ```bash
   npx wrangler secret put VAPID_PUBLIC_KEY
   ```

   ```bash
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```

   `BETTER_AUTH_URL` é o endereço final, por exemplo `https://vida-financas.SEU-USUARIO.workers.dev`. Troque também `VAPID_SUBJECT` em `wrangler.jsonc` por um `mailto:` seu.

4. Crie as tabelas no banco de produção:

   ```bash
   npm run db:migrate:remote
   ```

5. Publique:

   ```bash
   npm run deploy
   ```

## API do assistente (Pelúcio)

Crie uma chave em **Configurações → Integração** no app. Ela aparece uma vez só. Envie no header `X-Api-Key`.

Conta e categoria podem ir pelo nome ("nubank", "mercado"), sem acento e sem maiúscula. O valor aceita `"50,00"`, `"1.234,56"` ou número.

**Registrar gasto ou receita** — `POST /api/v1/transactions`

```json
{
  "type": "expense",
  "amount": "50,00",
  "description": "Mercado",
  "category": "mercado",
  "account": "nubank",
  "method": "credit",
  "installments": 3,
  "date": "2026-11-27"
}
```

Só `amount` e `description` são obrigatórios. Sem `type`, vale gasto. Sem `date`, vale hoje. Sem `account`, vale a primeira conta corrente, ou o primeiro cartão quando `method` é `credit`.

**Registrar conta a pagar** — `POST /api/v1/bills`

```json
{ "name": "Conta de luz", "amount": "120,50", "dueDate": "2026-11-28", "recurrence": "monthly" }
```

`amount` pode faltar (conta de valor variável). `recurrence` aceita `none`, `monthly` ou `yearly`.

Exemplo com curl:

```bash
curl -X POST https://SEU-ENDERECO/api/v1/transactions -H "X-Api-Key: vf_..." -H "content-type: application/json" -d '{"amount":"42,90","description":"Padaria","category":"alimentação"}'
```

As respostas de erro vêm em JSON com `error` em português, para o assistente repassar.

## Quatro baldes do dinheiro

Cada conta (não-cartão) pertence a um balde: **conta corrente**, **carteira em dinheiro**, **guardado** ou **investido**.

- Gasto por dia = (corrente + carteira em dinheiro − contas e faturas até o salário) ÷ dias até o salário.
- Guardado e investido não entram de jeito nenhum; o "Posso comprar isso?" também usa só corrente e carteira (e o limite do cartão).
- Transferir do investido ou do guardado para a conta corrente conta como dinheiro gastável, porque você moveu de propósito.
- Rota `GET /api/buckets` mostra os quatro saldos e o cálculo.

## Casa (vertente familiar)

Aba **Casa**. O primeiro a criar a casa vira administrador e gera um **código de convite** (6 caracteres, vale 7 dias, pode ser cancelado ou trocado). Quem recebe o código toca em "Tenho um código de convite" na tela de entrada e já cria a conta dentro da casa; quem já tem conta digita o código em Casa.

- **Papéis:** administrador (tudo) e membro. A casa sempre tem pelo menos um administrador: não dá para rebaixar ou tirar o último, e ele passa o papel antes de sair.
- **Permissões por membro** (o administrador liga e desliga): ver e editar as finanças da casa, criar tarefas e compromissos, mexer na lista de compras. Todo membro vê as tarefas e compromissos da casa e faz as próprias tarefas. Criança fica sem finanças.
- **Contas da casa:** com vencimento, recorrência e **quem pagou**. Quem pagou pode lançar o gasto também nas próprias finanças.
- **Compras:** listas com nome e data (ex.: Supermercado, sábado). Abra a lista, digite o item e toque em **Adicionar à lista**; quem marca um item no carrinho aparece para todos.
- **Tarefas da casa** com responsável (a pessoa recebe push), **agenda** com lembrete para todos e **lista de compras** compartilhada.
- **Saída:** quem sai ou é removido perde o acesso na hora; os dados da casa ficam para os outros (os registros que ele criou passam para um administrador).
- Uma casa por usuário. Sem WhatsApp para a família: avisos por push e na tela Hoje.

Os registros da casa usam as mesmas tabelas do app (contas a pagar, tarefas, compromissos) com o campo `household_id`; as rotas pessoais nunca mostram nem alteram o que é da casa. Testes:

```bash
node scripts/smoke-household.mjs
```

```bash
node scripts/ui-household.cjs
```

(os dois pedem banco local vazio, como o `ui-owner.cjs`).

## Lojas (fase 2)

O app já tem o que a revisão pede: exclusão de conta e exportação dos dados (Ajustes), política de privacidade (`/privacidade`) e modo demonstração (`DEMO_ENABLED`, botão "Ver com dados de exemplo" na tela de entrada) com dados de exemplo, apagados depois de 24h. O empacotamento com Capacitor e o push nativo (FCM/APNs, em `worker/lib/push.ts`) ficam para a fase 2.

## Instalar no iPhone

Abra o endereço publicado no Safari → Compartilhar → **Adicionar à Tela de Início**. Abra pelo ícone e ative as notificações em **Ajustes → Notificações** (no iPhone, push só funciona com o app instalado assim, iOS 16.4 ou mais novo).
