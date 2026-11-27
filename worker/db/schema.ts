import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/*
 * Convenções
 * - Dinheiro sempre em centavos (inteiro). Nunca float.
 * - Datas sem hora ("dia de vencimento", "prazo") em texto YYYY-MM-DD, no fuso do usuário.
 * - Instantes (compromissos, createdAt) em epoch ms.
 * - Toda tabela de dados tem userId: o MVP tem um usuário, mas o app nasce pronto
 *   para várias contas (lojas), sem migração de banco.
 */

const now = sql`(unixepoch() * 1000)`;
const timestamps = {
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
};

/* ===================== Better Auth ===================== */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  isDemo: integer("isDemo", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(now),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(now),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text("scope"),
  idToken: text("idToken"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().default(now),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(now),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(now),
});

const owner = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

/* ===================== Configurações ===================== */

export const settings = sqliteTable("settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  /** Salário variável: o usuário informa a data do próximo recebimento. */
  nextPayday: text("next_payday"),
  /** Valor esperado do próximo recebimento (centavos), opcional. */
  expectedIncome: integer("expected_income"),
  /** Teto de gasto do mês (centavos), para o aviso de "limite do mês". */
  monthlyLimit: integer("monthly_limit"),
  ...timestamps,
});

/* ===================== Financeiro ===================== */

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    /** checking = conta/carteira; card = cartão de crédito */
    kind: text("kind", { enum: ["checking", "card"] }).notNull(),
    /** Conta: saldo inicial. O saldo atual é derivado das transações. */
    openingBalance: integer("opening_balance").notNull().default(0),
    /** Cartão: limite total. */
    creditLimit: integer("credit_limit"),
    closingDay: integer("closing_day"),
    dueDay: integer("due_day"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("accounts_user").on(t.userId)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("•"),
    kind: text("kind", { enum: ["expense", "income"] }).notNull().default("expense"),
    ...timestamps,
  },
  (t) => [index("categories_user").on(t.userId)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    type: text("type", { enum: ["expense", "income", "transfer"] }).notNull(),
    /** Valor total, sempre positivo (centavos). Parcelado: valor total da compra. */
    amount: integer("amount").notNull(),
    description: text("description").notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** Origem do dinheiro (conta ou cartão). */
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Transferência: conta de destino (inclui pagamento de fatura de cartão). */
    toAccountId: text("to_account_id").references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    installmentsTotal: integer("installments_total").notNull().default(1),
    /** Parcela em que a compra está no momento do registro (1 = compra nova). */
    installmentCurrent: integer("installment_current").notNull().default(1),
    source: text("source", { enum: ["manual", "whatsapp", "import", "bill"] })
      .notNull()
      .default("manual"),
    billId: text("bill_id"),
    ...timestamps,
  },
  (t) => [index("transactions_user_date").on(t.userId, t.date)],
);

export const bills = sqliteTable(
  "bills",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    /** Null = valor variável, a confirmar (ex.: Copasa, Cemig). */
    amount: integer("amount"),
    dueDate: text("due_date").notNull(),
    recurrence: text("recurrence", { enum: ["none", "monthly", "yearly"] })
      .notNull()
      .default("none"),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    status: text("status", { enum: ["pending", "paid"] }).notNull().default("pending"),
    paidAt: integer("paid_at"),
    source: text("source", { enum: ["manual", "whatsapp", "import"] }).notNull().default("manual"),
    ...timestamps,
  },
  (t) => [index("bills_user_due").on(t.userId, t.dueDate)],
);

/* ===================== Vida ===================== */

export const areas = sqliteTable(
  "areas",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("areas_user").on(t.userId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    title: text("title").notNull(),
    areaId: text("area_id").references(() => areas.id, { onDelete: "set null" }),
    dueDate: text("due_date"),
    priority: text("priority", { enum: ["low", "normal", "high"] }).notNull().default("normal"),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    doneAt: integer("done_at"),
    /** Lembrete opcional (epoch ms). */
    remindAt: integer("remind_at"),
    ...timestamps,
  },
  (t) => [index("tasks_user").on(t.userId, t.done)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    title: text("title").notNull(),
    /** Dia (YYYY-MM-DD) e hora (HH:MM) no fuso do usuário. */
    date: text("date").notNull(),
    time: text("time"),
    location: text("location"),
    /** Minutos de antecedência do lembrete; null = sem lembrete. */
    remindMinutes: integer("remind_minutes"),
    areaId: text("area_id").references(() => areas.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("events_user_date").on(t.userId, t.date)],
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    title: text("title").notNull(),
    /** Regra "todo dia X do mês". */
    dayOfMonth: integer("day_of_month").notNull(),
    notifyEve: integer("notify_eve", { mode: "boolean" }).notNull().default(true),
    areaId: text("area_id").references(() => areas.id, { onDelete: "set null" }),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** Último dia (YYYY-MM-DD) marcado como feito, para tirar da lista "Hoje". */
    lastDoneDate: text("last_done_date"),
    ...timestamps,
  },
  (t) => [index("reminders_user").on(t.userId)],
);

export const deadlines = sqliteTable(
  "deadlines",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    title: text("title").notNull(),
    date: text("date").notNull(),
    alertDaysBefore: integer("alert_days_before").notNull().default(30),
    areaId: text("area_id").references(() => areas.id, { onDelete: "set null" }),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("deadlines_user").on(t.userId, t.date)],
);

/* ===================== Integração e push ===================== */

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    /** SHA-256 da chave. A chave em si só aparece uma vez, na criação. */
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    lastUsedAt: integer("last_used_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("api_keys_hash").on(t.keyHash)],
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("push_endpoint").on(t.endpoint)],
);

/** Evita mandar o mesmo aviso duas vezes (chave = tipo:id:data). */
export const notificationLog = sqliteTable(
  "notification_log",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    key: text("key").notNull(),
    sentAt: integer("sent_at").notNull().default(now),
  },
  (t) => [uniqueIndex("notification_key").on(t.userId, t.key)],
);
