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

O primeiro cadastro vira o dono e já recebe os dados iniciais: categorias, frentes (Casa, VZT, LEVVA, Carros, Pessoal), carteira, as contas Nio Fibra, Metha, Copasa e Cemig e os lembretes de leitura. Depois disso o cadastro fecha (`ALLOW_SIGNUP=false` em `wrangler.jsonc`).

### Testes

```bash
npm test
```

Teste de ponta a ponta da API (com `npm run dev` rodando e banco local novo):

```bash
node scripts/smoke.mjs
```

## Publicar na Cloudflare (gratuito)

1. Entre na sua conta:

   ```bash
   npx wrangler login
   ```

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

## Lojas (fase 2)

O app já tem o que a revisão pede: exclusão de conta, exportação dos dados, política de privacidade e modo demonstração (`DEMO_ENABLED`) com dados de exemplo, apagados depois de 24h. O empacotamento com Capacitor e o push nativo (FCM/APNs, em `worker/lib/push.ts`) ficam para a fase 2.
