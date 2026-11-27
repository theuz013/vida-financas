import { and, eq, inArray } from "drizzle-orm";
import { schema, type DB } from "./db";
import { bad } from "./http";

export type Member = typeof schema.householdMembers.$inferSelect;
export type Permission = "finance" | "createTasks" | "shopping";

/** Vínculo do usuário com a casa (ou null). */
export async function membershipOf(db: DB, userId: string): Promise<Member | null> {
  return (await db.query.householdMembers.findFirst({ where: (m, { eq }) => eq(m.userId, userId) })) ?? null;
}

export function can(m: Member, p: Permission): boolean {
  if (m.role === "admin") return true;
  if (p === "finance") return m.canFinance && !m.isChild;
  if (p === "createTasks") return m.canCreateTasks;
  return m.canShopping;
}

export async function requireMember(db: DB, userId: string): Promise<Member> {
  const m = await membershipOf(db, userId);
  if (!m) bad("Você ainda não faz parte de uma casa.", 404);
  return m;
}

export async function requirePermission(db: DB, userId: string, p: Permission): Promise<Member> {
  const m = await requireMember(db, userId);
  if (!can(m, p)) {
    const what = p === "finance" ? "as finanças da casa" : p === "createTasks" ? "criar tarefas e compromissos" : "mexer na lista de compras";
    bad(`Sem permissão para ${what}. Peça ao administrador da casa.`, 403);
  }
  return m;
}

export async function requireAdmin(db: DB, userId: string): Promise<Member> {
  const m = await requireMember(db, userId);
  if (m.role !== "admin") bad("Só o administrador da casa pode fazer isso.", 403);
  return m;
}

const houseTables = [schema.bills, schema.tasks, schema.events, schema.deadlines] as const;

/**
 * Quando alguém sai da casa (ou exclui a conta), os registros da casa que ele criou
 * passam para um administrador. Assim continuam lá para os demais, mesmo se a conta
 * de quem criou for apagada (o userId tem exclusão em cascata).
 */
export async function handOverHouseRecords(db: DB, householdId: string, fromUserId: string, toUserId: string) {
  for (const t of houseTables) {
    await db
      .update(t)
      .set({ userId: toUserId, updatedAt: Date.now() })
      .where(and(eq(t.householdId, householdId), eq(t.userId, fromUserId)));
  }
  // tarefas atribuídas a quem saiu voltam para "qualquer um"
  await db
    .update(schema.tasks)
    .set({ assigneeId: null })
    .where(and(eq(schema.tasks.householdId, householdId), eq(schema.tasks.assigneeId, fromUserId)));
}

/** Apaga a casa e tudo o que é dela (as colunas household_id não têm FK em cascata). */
export async function deleteHousehold(db: DB, householdId: string) {
  for (const t of houseTables) await db.delete(t).where(eq(t.householdId, householdId));
  await db.delete(schema.households).where(eq(schema.households.id, householdId));
}

/**
 * Tira o usuário da casa respeitando a regra de sempre haver um administrador.
 * - Último membro: a casa e os dados dela são apagados.
 * - Último administrador com outros membros: o membro mais antigo vira administrador
 *   (só quando `promote` é true, como na exclusão de conta; ao sair, ele precisa passar o papel antes).
 */
export async function removeFromHousehold(db: DB, m: Member, opts: { promote: boolean }) {
  const members = await db.query.householdMembers.findMany({
    where: (x, { eq }) => eq(x.householdId, m.householdId),
    orderBy: (x, { asc }) => [asc(x.createdAt)],
  });
  const others = members.filter((x) => x.userId !== m.userId);
  if (others.length === 0) {
    await deleteHousehold(db, m.householdId);
    return { deletedHousehold: true };
  }
  let heir = others.find((x) => x.role === "admin");
  if (m.role === "admin" && !heir) {
    if (!opts.promote) bad("Você é o único administrador. Passe a administração para outro membro antes de sair.", 409);
    heir = others[0];
    await db.update(schema.householdMembers).set({ role: "admin", updatedAt: Date.now() }).where(eq(schema.householdMembers.id, heir.id));
  }
  await handOverHouseRecords(db, m.householdId, m.userId, (heir ?? others[0]).userId);
  await db.delete(schema.householdMembers).where(eq(schema.householdMembers.id, m.id));
  return { deletedHousehold: false };
}

/** Nomes dos membros (para "quem pagou", responsável etc.). */
export async function memberNames(db: DB, householdId: string) {
  const members = await db.query.householdMembers.findMany({ where: (x, { eq }) => eq(x.householdId, householdId) });
  if (members.length === 0) return new Map<string, string>();
  const users = await db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(inArray(schema.user.id, members.map((x) => x.userId)));
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Código de convite: 6 caracteres sem os que confundem (0/O, 1/I/L). */
export function newInviteCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export const INVITE_DAYS = 7;
