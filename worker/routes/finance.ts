import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { z } from "zod";
import { monthKey, monthRange, todayIn } from "../../shared/dates";
import {
  canBuy,
  cardInvoices,
  cardSummary,
  checkingBalance,
  forecast,
  nextDueDate,
} from "../../shared/finance";
import { id, schema, type DB } from "../lib/db";
import {
  assertOwned,
  bad,
  body,
  deleteOwned,
  findOwned,
  refs,
  router,
  zCents,
  zDate,
} from "../lib/http";

/* ---------- carga dos dados de cálculo ---------- */

export async function loadFinance(db: DB, userId: string) {
  const [accounts, txs, bills, settings] = await Promise.all([
    db.query.accounts.findMany({ where: (a, { eq }) => eq(a.userId, userId), orderBy: (a) => a.createdAt }),
    db.query.transactions.findMany({ where: (t, { eq }) => eq(t.userId, userId) }),
    db.query.bills.findMany({ where: (b, { eq, and, isNull }) => and(eq(b.userId, userId), isNull(b.householdId)) }),
    db.query.settings.findFirst({ where: (s, { eq }) => eq(s.userId, userId) }),
  ]);
  return { accounts, txs, bills, settings };
}

export const finance = router();

/* ===================== Contas e cartões ===================== */

const accountInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["checking", "card"]),
  bucket: z.enum(["checking", "cash", "saved", "invested"]).optional(),
  openingBalance: zCents.optional(),
  creditLimit: zCents.nonnegative().nullable().optional(),
  closingDay: z.number().int().min(1).max(31).nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  archived: z.boolean().optional(),
});

finance.get("/accounts", async (c) => {
  const { db, userId, tz } = c.var;
  const today = todayIn(tz);
  const { accounts, txs } = await loadFinance(db, userId);
  return c.json(
    accounts.map((a) =>
      a.kind === "checking"
        ? { ...a, balance: checkingBalance(a, txs) }
        : { ...a, card: cardSummary(a, txs, today) },
    ),
  );
});

finance.post("/accounts", async (c) => {
  const { db, userId } = c.var;
  const input = await body(c, accountInput);
  if (input.kind === "card" && (!input.closingDay || !input.dueDay)) {
    bad("Cartão precisa do dia de fechamento e do dia de vencimento.");
  }
  const row = { id: id(), userId, ...input, openingBalance: input.openingBalance ?? 0 };
  await db.insert(schema.accounts).values(row);
  return c.json(row, 201);
});

finance.patch("/accounts/:id", async (c) => {
  const { db, userId } = c.var;
  await findOwned(db, schema.accounts, userId, c.req.param("id"));
  const input = await body(c, accountInput.partial());
  await db
    .update(schema.accounts)
    .set({ ...input, updatedAt: Date.now() })
    .where(and(eq(schema.accounts.id, c.req.param("id")), eq(schema.accounts.userId, userId)));
  return c.json({ ok: true });
});

finance.delete("/accounts/:id", async (c) => {
  const { db, userId } = c.var;
  await deleteOwned(db, schema.accounts, userId, [c.req.param("id")]);
  return c.json({ ok: true });
});

/** Faturas de um cartão: atual, próximas e passadas, com parcelas. */
finance.get("/cards/:id/invoices", async (c) => {
  const { db, userId, tz } = c.var;
  const card = await findOwned(db, schema.accounts, userId, c.req.param("id"));
  if (card.kind !== "card") bad("Esta conta não é um cartão.");
  const { txs } = await loadFinance(db, userId);
  const today = todayIn(tz);
  const byId = new Map(txs.map((t) => [t.id, t]));
  const invoices = cardInvoices(card, txs, today).map((inv) => ({
    ...inv,
    items: inv.items.map((it) => ({ ...it, description: byId.get(it.txId)?.description ?? "", date: byId.get(it.txId)?.date })),
  }));
  return c.json({ card, summary: cardSummary(card, txs, today), invoices });
});

/** Pagar fatura = transferência da conta para o cartão (não conta como gasto). */
finance.post("/cards/:id/pay", async (c) => {
  const { db, userId, tz } = c.var;
  const card = await findOwned(db, schema.accounts, userId, c.req.param("id"));
  if (card.kind !== "card") bad("Esta conta não é um cartão.");
  const input = await body(c, z.object({ fromAccountId: z.string(), amount: zCents.positive(), date: zDate.optional() }));
  await assertOwned(db, userId, [refs.account(input.fromAccountId)]);
  const row = {
    id: id(),
    userId,
    type: "transfer" as const,
    amount: input.amount,
    description: `Pagamento fatura ${card.name}`,
    accountId: input.fromAccountId,
    toAccountId: card.id,
    date: input.date ?? todayIn(tz),
  };
  await db.insert(schema.transactions).values(row);
  return c.json(row, 201);
});

/* ===================== Categorias ===================== */

const categoryInput = z.object({
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().min(1).max(8),
  kind: z.enum(["expense", "income"]),
});

finance.get("/categories", async (c) => {
  const { db, userId } = c.var;
  return c.json(await db.query.categories.findMany({ where: (t, { eq }) => eq(t.userId, userId), orderBy: (t) => t.name }));
});
finance.post("/categories", async (c) => {
  const { db, userId } = c.var;
  const row = { id: id(), userId, ...(await body(c, categoryInput)) };
  await db.insert(schema.categories).values(row);
  return c.json(row, 201);
});
finance.patch("/categories/:id", async (c) => {
  const { db, userId } = c.var;
  await findOwned(db, schema.categories, userId, c.req.param("id"));
  const input = await body(c, categoryInput.partial());
  await db.update(schema.categories).set({ ...input, updatedAt: Date.now() }).where(eq(schema.categories.id, c.req.param("id")));
  return c.json({ ok: true });
});
finance.delete("/categories/:id", async (c) => {
  const { db, userId } = c.var;
  await deleteOwned(db, schema.categories, userId, [c.req.param("id")]);
  return c.json({ ok: true });
});

/* ===================== Transações ===================== */

export const transactionInput = z.object({
  type: z.enum(["expense", "income", "transfer"]),
  amount: zCents.positive(),
  description: z.string().trim().min(1).max(120),
  categoryId: z.string().nullable().optional(),
  accountId: z.string(),
  toAccountId: z.string().nullable().optional(),
  date: zDate,
  installmentsTotal: z.number().int().min(1).max(48).optional(),
  installmentCurrent: z.number().int().min(1).max(48).optional(),
});

export async function createTransaction(
  db: DB,
  userId: string,
  input: z.infer<typeof transactionInput>,
  source: "manual" | "whatsapp" | "import" | "bill" = "manual",
  extra: { billId?: string } = {},
) {
  if (input.type === "transfer") {
    if (!input.toAccountId) bad("Transferência precisa da conta de destino.");
    if (input.toAccountId === input.accountId) bad("Origem e destino são a mesma conta.");
  }
  if ((input.installmentCurrent ?? 1) > (input.installmentsTotal ?? 1)) {
    bad("Parcela atual maior que o total de parcelas.");
  }
  await assertOwned(db, userId, [
    refs.account(input.accountId),
    refs.toAccount(input.type === "transfer" ? input.toAccountId : null),
    refs.category(input.categoryId),
  ]);
  const row = {
    id: id(),
    userId,
    ...input,
    toAccountId: input.type === "transfer" ? input.toAccountId! : null,
    categoryId: input.type === "transfer" ? null : (input.categoryId ?? null),
    installmentsTotal: input.installmentsTotal ?? 1,
    installmentCurrent: input.installmentCurrent ?? 1,
    source,
    billId: extra.billId ?? null,
  };
  await db.insert(schema.transactions).values(row);
  return row;
}

finance.get("/transactions", async (c) => {
  const { db, userId } = c.var;
  const month = c.req.query("month");
  const accountId = c.req.query("accountId");
  const conds = [eq(schema.transactions.userId, userId)];
  if (month) {
    const { start, end } = monthRange(month);
    conds.push(gte(schema.transactions.date, start), lte(schema.transactions.date, end));
  }
  if (accountId) conds.push(or(eq(schema.transactions.accountId, accountId), eq(schema.transactions.toAccountId, accountId))!);
  const rows = await db
    .select()
    .from(schema.transactions)
    .where(and(...conds))
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt))
    .limit(500);
  return c.json(rows);
});

finance.post("/transactions", async (c) => {
  const { db, userId } = c.var;
  return c.json(await createTransaction(db, userId, await body(c, transactionInput)), 201);
});

finance.patch("/transactions/:id", async (c) => {
  const { db, userId } = c.var;
  const current = await findOwned(db, schema.transactions, userId, c.req.param("id"));
  const input = await body(c, transactionInput.partial());
  const merged = { ...current, ...input };
  await assertOwned(db, userId, [
    refs.account(input.accountId),
    refs.toAccount(merged.type === "transfer" ? input.toAccountId : null),
    refs.category(input.categoryId),
  ]);
  await db
    .update(schema.transactions)
    .set({ ...input, updatedAt: Date.now() })
    .where(eq(schema.transactions.id, current.id));
  return c.json({ ok: true });
});

finance.delete("/transactions/:id", async (c) => {
  const { db, userId } = c.var;
  await deleteOwned(db, schema.transactions, userId, [c.req.param("id")]);
  return c.json({ ok: true });
});

/* ===================== Contas a pagar ===================== */

export const billInput = z.object({
  name: z.string().trim().min(1).max(80),
  amount: zCents.positive().nullable().optional(),
  dueDate: zDate,
  recurrence: z.enum(["none", "monthly", "yearly"]).optional(),
  accountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
});

export async function createBill(
  db: DB,
  userId: string,
  input: z.infer<typeof billInput>,
  source: "manual" | "whatsapp" | "import" = "manual",
) {
  await assertOwned(db, userId, [refs.account(input.accountId), refs.category(input.categoryId)]);
  const row = {
    id: id(),
    userId,
    name: input.name,
    amount: input.amount ?? null,
    dueDate: input.dueDate,
    recurrence: input.recurrence ?? "none",
    accountId: input.accountId ?? null,
    categoryId: input.categoryId ?? null,
    source,
  };
  await db.insert(schema.bills).values(row);
  return row;
}

finance.get("/bills", async (c) => {
  const { db, userId } = c.var;
  const status = c.req.query("status") as "pending" | "paid" | undefined;
  const rows = await db.query.bills.findMany({
    where: (b, { eq, and, isNull }) => (status ? and(eq(b.userId, userId), isNull(b.householdId), eq(b.status, status)) : and(eq(b.userId, userId), isNull(b.householdId))),
    orderBy: (b, { asc, desc }) => (status === "paid" ? desc(b.paidAt) : asc(b.dueDate)),
    limit: 300,
  });
  return c.json(rows);
});

finance.post("/bills", async (c) => {
  const { db, userId } = c.var;
  return c.json(await createBill(db, userId, await body(c, billInput)), 201);
});

finance.patch("/bills/:id", async (c) => {
  const { db, userId } = c.var;
  const bill = await findOwned(db, schema.bills, userId, c.req.param("id"));
  const input = await body(c, billInput.partial());
  await assertOwned(db, userId, [refs.account(input.accountId), refs.category(input.categoryId)]);
  await db.update(schema.bills).set({ ...input, updatedAt: Date.now() }).where(eq(schema.bills.id, bill.id));
  return c.json({ ok: true });
});

finance.delete("/bills/:id", async (c) => {
  const { db, userId } = c.var;
  await deleteOwned(db, schema.bills, userId, [c.req.param("id")]);
  return c.json({ ok: true });
});

/**
 * Marcar como paga: lança o gasto na conta escolhida e, se recorrente,
 * já cria a próxima conta a pagar.
 */
finance.post("/bills/:id/pay", async (c) => {
  const { db, userId, tz } = c.var;
  const bill = await findOwned(db, schema.bills, userId, c.req.param("id"));
  if (bill.status === "paid") bad("Esta conta já está paga.", 409);
  const input = await body(
    c,
    z.object({ accountId: z.string().optional(), amount: zCents.positive().optional(), date: zDate.optional() }),
  );
  const amount = input.amount ?? bill.amount;
  if (!amount) bad("Informe o valor pago (esta conta tem valor variável).");
  const accountId = input.accountId ?? bill.accountId;
  if (!accountId) bad("Escolha a conta usada para pagar.");

  const tx = await createTransaction(
    db,
    userId,
    {
      type: "expense",
      amount,
      description: bill.name,
      categoryId: bill.categoryId,
      accountId,
      date: input.date ?? todayIn(tz),
    },
    "bill",
    { billId: bill.id },
  );
  await db
    .update(schema.bills)
    .set({ status: "paid", paidAt: Date.now(), amount, accountId, updatedAt: Date.now() })
    .where(eq(schema.bills.id, bill.id));

  let next = null;
  const nextDue = nextDueDate(bill.dueDate, bill.recurrence);
  if (nextDue) {
    next = {
      id: id(),
      userId,
      name: bill.name,
      // conta de valor variável continua "a confirmar" no mês seguinte
      amount: bill.amount,
      dueDate: nextDue,
      recurrence: bill.recurrence,
      accountId,
      categoryId: bill.categoryId,
      previousBillId: bill.id,
    };
    await db.insert(schema.bills).values(next);
  }
  return c.json({ transaction: tx, next });
});

/**
 * Desfazer pagamento: apaga o gasto lançado, volta a conta para "a pagar" e
 * remove a próxima ocorrência criada automaticamente (se ainda não foi paga).
 */
finance.post("/bills/:id/unpay", async (c) => {
  const { db, userId } = c.var;
  const bill = await findOwned(db, schema.bills, userId, c.req.param("id"));
  if (bill.status !== "paid") bad("Esta conta não está paga.", 409);
  const next = await db.query.bills.findFirst({
    where: (b, { and, eq }) => and(eq(b.userId, userId), eq(b.previousBillId, bill.id)),
  });
  if (next?.status === "paid") bad("A conta do período seguinte já foi paga. Desfaça aquela primeiro.", 409);
  if (next) await deleteOwned(db, schema.bills, userId, [next.id]);
  await db
    .delete(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), eq(schema.transactions.billId, bill.id)));
  await db
    .update(schema.bills)
    .set({ status: "pending", paidAt: null, updatedAt: Date.now() })
    .where(eq(schema.bills.id, bill.id));
  return c.json({ ok: true });
});

/* ===================== Cálculos ===================== */

/** Os quatro baldes, separados (a tela Hoje mostra cada um). */
finance.get("/buckets", async (c) => {
  const { db, userId, tz } = c.var;
  const { accounts, txs, bills, settings } = await loadFinance(db, userId);
  const fc = forecast({ accounts, txs, bills, today: todayIn(tz), nextPayday: settings?.nextPayday ?? null });
  return c.json({ buckets: fc.buckets, spendable: fc.cash, committed: fc.committed, free: fc.free, perDay: fc.perDay, days: fc.days, payday: fc.payday, paydayAssumed: fc.paydayAssumed });
});

finance.get("/forecast", async (c) => {
  const { db, userId, tz } = c.var;
  const { accounts, txs, bills, settings } = await loadFinance(db, userId);
  return c.json(forecast({ accounts, txs, bills, today: todayIn(tz), nextPayday: settings?.nextPayday ?? null }));
});

finance.post("/can-buy", async (c) => {
  const { db, userId, tz } = c.var;
  const input = await body(
    c,
    z.object({
      amount: zCents.positive(),
      method: z.enum(["pix", "debit", "credit"]),
      installments: z.number().int().min(1).max(48).optional(),
    }),
  );
  const { accounts, txs, bills, settings } = await loadFinance(db, userId);
  return c.json(
    canBuy({ ...input, accounts, txs, bills, today: todayIn(tz), nextPayday: settings?.nextPayday ?? null }),
  );
});

/** Resumo do mês: entradas, saídas, saldo e maiores gastos por categoria. */
finance.get("/summary", async (c) => {
  const { db, userId, tz } = c.var;
  const month = c.req.query("month") ?? monthKey(todayIn(tz));
  if (!/^\d{4}-\d{2}$/.test(month)) bad("Mês inválido, use AAAA-MM.");
  const { start, end } = monthRange(month);
  const [txs, cats, settings] = await Promise.all([
    db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.userId, userId), gte(schema.transactions.date, start), lte(schema.transactions.date, end))),
    db.query.categories.findMany({ where: (t, { eq }) => eq(t.userId, userId) }),
    db.query.settings.findFirst({ where: (s, { eq }) => eq(s.userId, userId) }),
  ]);
  const catById = new Map(cats.map((x) => [x.id, x]));
  let income = 0;
  let expense = 0;
  const byCat = new Map<string, number>();
  for (const t of txs) {
    if (t.type === "income") income += t.amount;
    if (t.type === "expense") {
      expense += t.amount;
      const k = t.categoryId ?? "_";
      byCat.set(k, (byCat.get(k) ?? 0) + t.amount);
    }
  }
  const categories = [...byCat.entries()]
    .map(([k, total]) => ({
      categoryId: k === "_" ? null : k,
      name: catById.get(k)?.name ?? "Sem categoria",
      emoji: catById.get(k)?.emoji ?? "•",
      total,
      share: expense ? total / expense : 0,
    }))
    .sort((a, b) => b.total - a.total);
  return c.json({
    month,
    income,
    expense,
    balance: income - expense,
    count: txs.length,
    categories,
    monthlyLimit: settings?.monthlyLimit ?? null,
  });
});
