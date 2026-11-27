import { eq } from "drizzle-orm";
import { addDays, nextMonthlyOccurrence, todayIn, type ISODate } from "../../shared/dates";
import { schema, id, type DB } from "./db";

export const DEFAULT_CATEGORIES: { name: string; emoji: string; kind: "expense" | "income" }[] = [
  { name: "Mercado", emoji: "🛒", kind: "expense" },
  { name: "Combustível", emoji: "⛽", kind: "expense" },
  { name: "Casa", emoji: "🏠", kind: "expense" },
  { name: "Carro", emoji: "🚗", kind: "expense" },
  { name: "Contas da casa", emoji: "💡", kind: "expense" },
  { name: "Alimentação", emoji: "🍽️", kind: "expense" },
  { name: "Lazer", emoji: "🎉", kind: "expense" },
  { name: "Saúde", emoji: "💊", kind: "expense" },
  { name: "Compras", emoji: "🛍️", kind: "expense" },
  { name: "Outros", emoji: "📦", kind: "expense" },
  { name: "Salário", emoji: "💰", kind: "income" },
  { name: "Outras receitas", emoji: "➕", kind: "income" },
];

export const DEFAULT_AREAS = ["Casa", "VZT", "LEVVA", "Carros", "Pessoal"];

/** Dados que todo usuário novo recebe: categorias, áreas, carteira e configurações. */
export async function seedDefaults(db: DB, userId: string, timezone: string) {
  await db.insert(schema.settings).values({ userId, timezone }).onConflictDoNothing();
  await db
    .insert(schema.categories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ id: id(), userId, ...c })));
  await db
    .insert(schema.areas)
    .values(DEFAULT_AREAS.map((name, sort) => ({ id: id(), userId, name, sort })));
  await db.insert(schema.accounts).values({
    id: id(),
    userId,
    name: "Carteira",
    kind: "checking",
    openingBalance: 0,
  });
}

/**
 * Dados reais do dono (primeiro usuário): contas recorrentes e lembretes de leitura.
 * Valores conforme a especificação; Copasa e Cemig ficam com valor a confirmar.
 */
export async function seedOwner(db: DB, userId: string, timezone: string) {
  const today = todayIn(timezone);
  const cats = await db.query.categories.findMany({ where: (c, { eq }) => eq(c.userId, userId) });
  const contas = cats.find((c) => c.name === "Contas da casa")?.id ?? null;
  const areas = await db.query.areas.findMany({ where: (a, { eq }) => eq(a.userId, userId) });
  const casa = areas.find((a) => a.name === "Casa")?.id ?? null;

  const bill = (name: string, amount: number | null, day: number) => ({
    id: id(),
    userId,
    name,
    amount,
    dueDate: nextMonthlyOccurrence(day, today),
    recurrence: "monthly" as const,
    categoryId: contas,
  });
  await db.insert(schema.bills).values([
    bill("Nio Fibra", 6754, 26),
    bill("Metha Energia", 6803, 27),
    // valores variam; vencimento a confirmar com o Matheus
    bill("Copasa", null, 20),
    bill("Cemig", null, 15),
  ]);

  await db.insert(schema.reminders).values([
    { id: id(), userId, title: "Leitura do medidor Copasa", dayOfMonth: 17, areaId: casa },
    { id: id(), userId, title: "Leitura do medidor Copasa (outro endereço)", dayOfMonth: 13, areaId: casa },
    { id: id(), userId, title: "Aviso Cemig", dayOfMonth: 10, areaId: casa },
  ]);
}

/** Dados de exemplo para o modo demonstração (revisores das lojas). */
export async function seedDemo(db: DB, userId: string, timezone: string) {
  const today = todayIn(timezone);
  const d = (n: number): ISODate => addDays(today, n);
  const cats = await db.query.categories.findMany({ where: (c, { eq }) => eq(c.userId, userId) });
  const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? null;
  const areas = await db.query.areas.findMany({ where: (a, { eq }) => eq(a.userId, userId) });
  const area = (name: string) => areas.find((a) => a.name === name)?.id ?? null;
  const wallet = await db.query.accounts.findFirst({ where: (a, { eq }) => eq(a.userId, userId) });

  const bank = id();
  const card = id();
  await db.insert(schema.accounts).values([
    { id: bank, userId, name: "Banco Exemplo", kind: "checking", openingBalance: 61_540 },
    { id: card, userId, name: "Cartão Exemplo", kind: "card", creditLimit: 400_000, closingDay: 3, dueDay: 10 },
  ]);
  if (wallet) {
    await db.update(schema.accounts).set({ openingBalance: 15_000 }).where(eq(schema.accounts.id, wallet.id));
  }
  await db.update(schema.settings).set({ nextPayday: d(12), expectedIncome: 420_000 }).where(eq(schema.settings.userId, userId));

  const tx = (p: Partial<typeof schema.transactions.$inferInsert>) => ({
    id: id(),
    userId,
    type: "expense" as const,
    amount: 0,
    description: "",
    accountId: bank,
    date: today,
    ...p,
  });
  await db.insert(schema.transactions).values([
    tx({ type: "income", amount: 420_000, description: "Salário", categoryId: cat("Salário"), date: d(-18) }),
    tx({ amount: 42_380, description: "Supermercado", categoryId: cat("Mercado"), date: d(-6) }),
    tx({ amount: 25_000, description: "Gasolina", categoryId: cat("Combustível"), date: d(-3), accountId: card }),
    tx({ amount: 180_000, description: "Geladeira", categoryId: cat("Casa"), date: d(-10), accountId: card, installmentsTotal: 6 }),
    tx({ amount: 8_990, description: "Cinema", categoryId: cat("Lazer"), date: d(-1), accountId: card }),
    tx({ amount: 3_250, description: "Padaria", categoryId: cat("Alimentação"), date: today, accountId: wallet?.id ?? bank }),
  ]);
  await db.insert(schema.bills).values([
    { id: id(), userId, name: "Internet", amount: 9_990, dueDate: today, recurrence: "monthly", categoryId: cat("Contas da casa") },
    { id: id(), userId, name: "Energia", amount: null, dueDate: d(5), recurrence: "monthly", categoryId: cat("Contas da casa") },
    { id: id(), userId, name: "Seguro do carro", amount: 21_000, dueDate: d(-2), recurrence: "monthly", categoryId: cat("Carro") },
  ]);
  await db.insert(schema.tasks).values([
    { id: id(), userId, title: "Levar o carro para revisão", areaId: area("Carros"), dueDate: today, priority: "high" },
    { id: id(), userId, title: "Enviar proposta", areaId: area("VZT"), dueDate: d(2) },
    { id: id(), userId, title: "Trocar lâmpada da garagem", areaId: area("Casa"), dueDate: d(-1), priority: "low" },
  ]);
  await db.insert(schema.events).values([
    { id: id(), userId, title: "Reunião com o contador", date: today, time: "15:00", remindMinutes: 30 },
    { id: id(), userId, title: "Dentista", date: d(3), time: "09:30", remindMinutes: 60 },
  ]);
  const dayToday = Number(today.slice(8, 10));
  await db.insert(schema.reminders).values([
    { id: id(), userId, title: "Leitura do medidor de água", dayOfMonth: dayToday, areaId: area("Casa") },
  ]);
  await db.insert(schema.deadlines).values([
    { id: id(), userId, title: "CNH vence", date: d(25), alertDaysBefore: 30, areaId: area("Pessoal") },
  ]);
}
