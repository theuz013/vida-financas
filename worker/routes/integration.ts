/**
 * API do assistente (Pelúcio, via WhatsApp).
 * Autenticação: header `X-Api-Key: vf_...` (ou `Authorization: ApiKey vf_...`).
 * A chave pertence a um usuário e só grava na conta dele.
 *
 * O assistente fala em texto ("comprei 50 no mercado no Nubank"), então aqui
 * conta e categoria podem vir pelo NOME, e o valor como "50,00" ou número.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { todayIn } from "../../shared/dates";
import { parseBRL } from "../../shared/money";
import { getDb, schema, type DB } from "../lib/db";
import { bad, body, sha256Hex, zDate, type AppEnv } from "../lib/http";
import { createBill, createTransaction } from "./finance";

export const integration = new Hono<AppEnv>();

integration.use("*", async (c, next) => {
  const header = c.req.header("x-api-key") ?? c.req.header("authorization")?.replace(/^ApiKey\s+/i, "");
  if (!header || !header.startsWith("vf_")) bad("Chave da API ausente.", 401);
  const db = getDb(c.env.DB);
  const hash = await sha256Hex(header!);
  const apiKey = await db.query.apiKeys.findFirst({ where: (k, { eq }) => eq(k.keyHash, hash) });
  if (!apiKey) bad("Chave da API inválida.", 401);
  await db.update(schema.apiKeys).set({ lastUsedAt: Date.now() }).where(eq(schema.apiKeys.id, apiKey.id));
  const settings = await db.query.settings.findFirst({ where: (s, { eq }) => eq(s.userId, apiKey.userId) });
  c.set("db", db);
  c.set("userId", apiKey.userId);
  c.set("tz", settings?.timezone || c.env.APP_TIMEZONE || "America/Sao_Paulo");
  await next();
});

const money = z.union([z.number(), z.string()]);

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

async function resolveAccount(db: DB, userId: string, ref: string | undefined, kindHint?: "checking" | "card") {
  const accounts = await db.query.accounts.findMany({ where: (a, { eq, and }) => and(eq(a.userId, userId), eq(a.archived, false)) });
  if (accounts.length === 0) bad("Nenhuma conta cadastrada no app.");
  if (ref) {
    const byId = accounts.find((a) => a.id === ref);
    if (byId) return byId;
    const n = norm(ref);
    const candidates = accounts.filter((a) => norm(a.name) === n || norm(a.name).includes(n) || n.includes(norm(a.name)));
    const pick = candidates.find((a) => !kindHint || a.kind === kindHint) ?? candidates[0];
    if (pick) return pick;
    bad(`Conta "${ref}" não encontrada. Contas: ${accounts.map((a) => a.name).join(", ")}.`, 404);
  }
  // sem conta informada: primeira conta corrente (ou primeiro cartão se for crédito)
  return accounts.find((a) => a.kind === (kindHint ?? "checking")) ?? accounts[0];
}

async function resolveCategory(db: DB, userId: string, ref: string | undefined, kind: "expense" | "income") {
  const cats = await db.query.categories.findMany({ where: (c, { eq }) => eq(c.userId, userId) });
  if (ref) {
    const n = norm(ref);
    const hit = cats.find((c) => c.id === ref) ?? cats.find((c) => norm(c.name) === n) ?? cats.find((c) => norm(c.name).includes(n));
    if (hit) return hit.id;
  }
  return cats.find((c) => c.kind === kind && norm(c.name).startsWith("outr"))?.id ?? null;
}

function cents(v: string | number, field = "amount") {
  const n = parseBRL(v);
  if (n == null || n <= 0) bad(`Valor inválido em "${field}".`);
  return n;
}

/**
 * POST /api/v1/transactions
 * { "type": "expense"|"income", "amount": "50,00", "description": "Mercado",
 *   "category": "Mercado", "account": "Nubank", "method": "credit"|"pix"|"debit",
 *   "date": "2026-11-27", "installments": 3 }
 */
integration.post("/transactions", async (c) => {
  const { db, userId, tz } = c.var;
  const input = await body(
    c,
    z.object({
      type: z.enum(["expense", "income"]).default("expense"),
      amount: money,
      description: z.string().trim().min(1).max(120),
      category: z.string().optional(),
      account: z.string().optional(),
      method: z.enum(["pix", "debit", "credit", "cash"]).optional(),
      date: zDate.optional(),
      installments: z.number().int().min(1).max(48).optional(),
    }),
  );
  const acc = await resolveAccount(db, userId, input.account, input.method === "credit" ? "card" : input.account ? undefined : "checking");
  const tx = await createTransaction(
    db,
    userId,
    {
      type: input.type,
      amount: cents(input.amount),
      description: input.description,
      categoryId: await resolveCategory(db, userId, input.category, input.type),
      accountId: acc.id,
      date: input.date ?? todayIn(tz),
      installmentsTotal: acc.kind === "card" ? (input.installments ?? 1) : 1,
    },
    "whatsapp",
  );
  return c.json({ ok: true, transaction: tx, account: acc.name }, 201);
});

/**
 * POST /api/v1/bills
 * { "name": "Conta de luz", "amount": "120,50" (opcional), "dueDate": "2026-11-28",
 *   "recurrence": "none"|"monthly"|"yearly", "account": "Inter" }
 */
integration.post("/bills", async (c) => {
  const { db, userId } = c.var;
  const input = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(80),
      amount: money.nullable().optional(),
      dueDate: zDate,
      recurrence: z.enum(["none", "monthly", "yearly"]).optional(),
      account: z.string().optional(),
      category: z.string().optional(),
    }),
  );
  const acc = input.account ? await resolveAccount(db, userId, input.account) : null;
  const bill = await createBill(
    db,
    userId,
    {
      name: input.name,
      amount: input.amount == null || input.amount === "" ? null : cents(input.amount),
      dueDate: input.dueDate,
      recurrence: input.recurrence ?? "none",
      accountId: acc?.id ?? null,
      categoryId: input.category ? await resolveCategory(db, userId, input.category, "expense") : null,
    },
    "whatsapp",
  );
  return c.json({ ok: true, bill }, 201);
});
