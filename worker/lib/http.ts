import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, inArray } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { schema, type DB } from "./db";

export type AppEnv = {
  Bindings: Env;
  Variables: { db: DB; userId: string; tz: string };
};

export const router = () => new Hono<AppEnv>();

export function bad(message: string, status: 400 | 401 | 403 | 404 | 409 = 400): never {
  throw new HTTPException(status, { message });
}

/** Lê e valida o corpo JSON; erro 400 com mensagem em português. */
export async function body<T extends z.ZodType>(c: Context<AppEnv>, schemaDef: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    bad("Corpo da requisição não é JSON válido.");
  }
  const parsed = schemaDef.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    bad(`Campo inválido: ${issue.path.join(".") || "corpo"} — ${issue.message}`);
  }
  return parsed.data;
}

/* ---------- validações comuns ---------- */

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");
export const zTime = z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM");
export const zCents = z.number().int();
export const zId = z.string().min(1);

type OwnedTable = SQLiteTable & { id: any; userId: any };

/** Garante que os ids referenciados pertencem ao usuário (isolamento entre contas). */
export async function assertOwned(
  db: DB,
  userId: string,
  refs: { table: OwnedTable; id: string | null | undefined; label: string }[],
) {
  for (const ref of refs) {
    if (!ref.id) continue;
    const rows = await db
      .select({ id: ref.table.id })
      .from(ref.table)
      .where(and(eq(ref.table.id, ref.id), eq(ref.table.userId, userId)))
      .limit(1);
    if (rows.length === 0) bad(`${ref.label} não encontrada.`, 404);
  }
}

export const refs = {
  account: (id?: string | null) => ({ table: schema.accounts, id, label: "Conta" }),
  toAccount: (id?: string | null) => ({ table: schema.accounts, id, label: "Conta de destino" }),
  category: (id?: string | null) => ({ table: schema.categories, id, label: "Categoria" }),
  area: (id?: string | null) => ({ table: schema.areas, id, label: "Área" }),
};

/** Busca uma linha do usuário ou devolve 404. */
export async function findOwned<T extends OwnedTable>(db: DB, table: T, userId: string, id: string) {
  const rows = await db
    .select()
    .from(table as SQLiteTable)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .limit(1);
  if (rows.length === 0) bad("Registro não encontrado.", 404);
  return rows[0] as T["$inferSelect"];
}

export async function deleteOwned(db: DB, table: OwnedTable, userId: string, ids: string[]) {
  if (ids.length === 0) return;
  await db.delete(table).where(and(inArray(table.id, ids), eq(table.userId, userId)));
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
