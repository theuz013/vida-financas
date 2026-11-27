/**
 * Casa (vertente familiar): membros, convites, contas da casa, tarefas,
 * compromissos e lista de compras. Avisos por push, sem WhatsApp.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { todayIn } from "../../shared/dates";
import { nextDueDate } from "../../shared/finance";
import { id, schema, type DB } from "../lib/db";
import { bad, body, router, zCents, zDate, zTime } from "../lib/http";
import {
  can,
  INVITE_DAYS,
  memberNames,
  membershipOf,
  newInviteCode,
  removeFromHousehold,
  requireAdmin,
  requireMember,
  requirePermission,
  type Member,
} from "../lib/household";
import { createTransaction } from "./finance";
import { sendPush } from "../lib/push";

export const household = router();

function perms(m: Member) {
  return { finance: can(m, "finance"), createTasks: can(m, "createTasks"), shopping: can(m, "shopping") };
}

async function activeInvite(db: DB, householdId: string) {
  const inv = await db.query.householdInvites.findFirst({
    where: (i, { and, eq, isNull }) => and(eq(i.householdId, householdId), isNull(i.revokedAt)),
    orderBy: (i, { desc }) => [desc(i.createdAt)],
  });
  return inv && inv.expiresAt > Date.now() ? inv : null;
}

/** Valida um código; devolve o convite ou um erro em português. */
export async function findInvite(db: DB, rawCode: string) {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) bad("O código tem 6 caracteres.");
  const inv = await db.query.householdInvites.findFirst({ where: (i, { eq }) => eq(i.code, code) });
  if (!inv) bad("Código não encontrado. Confira com quem convidou você.", 404);
  if (inv.revokedAt) bad("Este código foi cancelado. Peça um novo ao administrador da casa.", 410);
  if (inv.expiresAt <= Date.now()) bad("Este código venceu. Peça um novo ao administrador da casa.", 410);
  return inv;
}

export async function joinHousehold(db: DB, userId: string, householdId: string) {
  if (await membershipOf(db, userId)) bad("Você já faz parte de uma casa. Saia dela antes de entrar em outra.", 409);
  const row = { id: id(), householdId, userId, role: "member" as const };
  await db.insert(schema.householdMembers).values(row);
  return row;
}

/* ===================== Casa e membros ===================== */

household.get("/household", async (c) => {
  const { db, userId } = c.var;
  const me = await membershipOf(db, userId);
  if (!me) return c.json({ household: null });
  const [house, members, invite] = await Promise.all([
    db.query.households.findFirst({ where: (h, { eq }) => eq(h.id, me.householdId) }),
    db.query.householdMembers.findMany({ where: (x, { eq }) => eq(x.householdId, me.householdId), orderBy: (x) => [asc(x.createdAt)] }),
    me.role === "admin" ? activeInvite(db, me.householdId) : null,
  ]);
  const users = await db
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
    .from(schema.user)
    .where(inArray(schema.user.id, members.map((m) => m.userId)));
  const byId = new Map(users.map((u) => [u.id, u]));
  return c.json({
    household: house,
    me: { ...me, permissions: perms(me) },
    members: members.map((m) => ({
      ...m,
      name: byId.get(m.userId)?.name ?? "",
      // e-mail dos outros só para o administrador
      email: me.role === "admin" || m.userId === userId ? byId.get(m.userId)?.email : undefined,
      permissions: perms(m),
    })),
    invite: invite ? { code: invite.code, expiresAt: invite.expiresAt } : null,
  });
});

/** O primeiro usuário cria a casa e vira administrador. */
household.post("/household", async (c) => {
  const { db, userId } = c.var;
  const { name } = await body(c, z.object({ name: z.string().trim().min(1).max(60) }));
  if (await membershipOf(db, userId)) bad("Você já faz parte de uma casa.", 409);
  const house = { id: id(), name, createdBy: userId };
  await db.insert(schema.households).values(house);
  await db.insert(schema.householdMembers).values({ id: id(), householdId: house.id, userId, role: "admin" });
  return c.json(house, 201);
});

household.patch("/household", async (c) => {
  const { db, userId } = c.var;
  const me = await requireAdmin(db, userId);
  const { name } = await body(c, z.object({ name: z.string().trim().min(1).max(60) }));
  await db.update(schema.households).set({ name, updatedAt: Date.now() }).where(eq(schema.households.id, me.householdId));
  return c.json({ ok: true });
});

/** Gera um novo código (o anterior deixa de valer). */
household.post("/household/invite", async (c) => {
  const { db, userId } = c.var;
  const me = await requireAdmin(db, userId);
  await db
    .update(schema.householdInvites)
    .set({ revokedAt: Date.now() })
    .where(and(eq(schema.householdInvites.householdId, me.householdId), isNull(schema.householdInvites.revokedAt)));
  let code = newInviteCode();
  for (let i = 0; i < 5 && (await db.query.householdInvites.findFirst({ where: (x, { eq }) => eq(x.code, code) })); i++) code = newInviteCode();
  const row = { id: id(), householdId: me.householdId, code, expiresAt: Date.now() + INVITE_DAYS * 86_400_000, createdBy: userId };
  await db.insert(schema.householdInvites).values(row);
  return c.json({ code, expiresAt: row.expiresAt }, 201);
});

household.delete("/household/invite", async (c) => {
  const { db, userId } = c.var;
  const me = await requireAdmin(db, userId);
  await db
    .update(schema.householdInvites)
    .set({ revokedAt: Date.now() })
    .where(and(eq(schema.householdInvites.householdId, me.householdId), isNull(schema.householdInvites.revokedAt)));
  return c.json({ ok: true });
});

/** Entrar com código, de dentro do app (para quem já tem conta). */
household.post("/household/join", async (c) => {
  const { db, userId } = c.var;
  const { code } = await body(c, z.object({ code: z.string() }));
  const inv = await findInvite(db, code);
  await joinHousehold(db, userId, inv.householdId);
  await notifyAdmins(c.env, db, inv.householdId, userId);
  return c.json({ ok: true });
});

export async function notifyAdmins(env: Env, db: DB, householdId: string, newUserId: string) {
  const names = await memberNames(db, householdId);
  const admins = await db.query.householdMembers.findMany({ where: (x, { and, eq }) => and(eq(x.householdId, householdId), eq(x.role, "admin")) });
  for (const a of admins) {
    if (a.userId === newUserId) continue;
    await sendPush(env, db, a.userId, { title: "Casa", body: `${names.get(newUserId) ?? "Alguém"} entrou na casa.`, url: "/casa/membros", tag: `join-${newUserId}` });
  }
}

household.patch("/household/members/:userId", async (c) => {
  const { db, userId } = c.var;
  const me = await requireAdmin(db, userId);
  const target = await db.query.householdMembers.findFirst({
    where: (x, { and, eq }) => and(eq(x.householdId, me.householdId), eq(x.userId, c.req.param("userId"))),
  });
  if (!target) bad("Membro não encontrado.", 404);
  const input = await body(
    c,
    z.object({
      role: z.enum(["admin", "member"]).optional(),
      isChild: z.boolean().optional(),
      canFinance: z.boolean().optional(),
      canCreateTasks: z.boolean().optional(),
      canShopping: z.boolean().optional(),
    }),
  );
  if (input.role === "member" && target.role === "admin") {
    const admins = await db.query.householdMembers.findMany({ where: (x, { and, eq }) => and(eq(x.householdId, me.householdId), eq(x.role, "admin")) });
    if (admins.length <= 1) bad("A casa precisa de pelo menos um administrador. Passe o papel para outra pessoa primeiro.", 409);
  }
  const patch: Partial<Member> = { ...input };
  // criança: finanças desligadas por padrão ao marcar
  if (input.isChild === true && input.canFinance === undefined) patch.canFinance = false;
  await db.update(schema.householdMembers).set({ ...patch, updatedAt: Date.now() }).where(eq(schema.householdMembers.id, target.id));
  return c.json({ ok: true });
});

/** Remover membro (administrador). Ele perde o acesso na hora; os dados ficam. */
household.delete("/household/members/:userId", async (c) => {
  const { db, userId } = c.var;
  const me = await requireAdmin(db, userId);
  const targetId = c.req.param("userId");
  if (targetId === userId) bad("Para sair da casa, use “Sair da casa”.");
  const target = await db.query.householdMembers.findFirst({ where: (x, { and, eq }) => and(eq(x.householdId, me.householdId), eq(x.userId, targetId)) });
  if (!target) bad("Membro não encontrado.", 404);
  await removeFromHousehold(db, target, { promote: false });
  return c.json({ ok: true });
});

household.post("/household/leave", async (c) => {
  const { db, userId } = c.var;
  const me = await requireMember(db, userId);
  return c.json(await removeFromHousehold(db, me, { promote: false }));
});

/* ===================== Contas da casa ===================== */

const billInput = z.object({
  name: z.string().trim().min(1).max(80),
  amount: zCents.positive().nullable().optional(),
  dueDate: zDate,
  recurrence: z.enum(["none", "monthly", "yearly"]).optional(),
});

async function houseBill(db: DB, householdId: string, billId: string) {
  const b = await db.query.bills.findFirst({ where: (x, { and, eq }) => and(eq(x.id, billId), eq(x.householdId, householdId)) });
  if (!b) bad("Conta não encontrada.", 404);
  return b;
}

household.get("/household/bills", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "finance");
  const status = c.req.query("status") === "paid" ? "paid" : "pending";
  const rows = await db.query.bills.findMany({
    where: (b, { and, eq }) => and(eq(b.householdId, me.householdId), eq(b.status, status)),
    orderBy: (b, { asc, desc }) => (status === "paid" ? [desc(b.paidAt)] : [asc(b.dueDate)]),
    limit: 300,
  });
  const names = await memberNames(db, me.householdId);
  return c.json(rows.map((b) => ({ ...b, paidByName: b.paidBy ? (names.get(b.paidBy) ?? "Ex-membro") : null })));
});

/** Resumo do mês da casa: total, pago, a pagar e quanto cada um pagou. */
household.get("/household/bills/summary", async (c) => {
  const { db, userId, tz } = c.var;
  const me = await requirePermission(db, userId, "finance");
  const month = c.req.query("month") ?? todayIn(tz).slice(0, 7);
  const rows = await db.query.bills.findMany({ where: (b, { eq }) => eq(b.householdId, me.householdId) });
  const inMonth = rows.filter((b) => b.dueDate.startsWith(month));
  const names = await memberNames(db, me.householdId);
  const byMember = new Map<string, number>();
  for (const b of inMonth) if (b.status === "paid" && b.paidBy) byMember.set(b.paidBy, (byMember.get(b.paidBy) ?? 0) + (b.amount ?? 0));
  return c.json({
    month,
    total: inMonth.reduce((s, b) => s + (b.amount ?? 0), 0),
    paid: inMonth.filter((b) => b.status === "paid").reduce((s, b) => s + (b.amount ?? 0), 0),
    pending: inMonth.filter((b) => b.status === "pending").reduce((s, b) => s + (b.amount ?? 0), 0),
    unknown: inMonth.filter((b) => b.status === "pending" && b.amount == null).length,
    byMember: [...byMember.entries()].map(([uid, total]) => ({ userId: uid, name: names.get(uid) ?? "Ex-membro", total })).sort((a, b) => b.total - a.total),
  });
});

household.post("/household/bills", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "finance");
  const input = await body(c, billInput);
  const row = { id: id(), userId, householdId: me.householdId, name: input.name, amount: input.amount ?? null, dueDate: input.dueDate, recurrence: input.recurrence ?? "monthly" };
  await db.insert(schema.bills).values(row);
  return c.json(row, 201);
});

household.patch("/household/bills/:id", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "finance");
  const b = await houseBill(db, me.householdId, c.req.param("id"));
  const input = await body(c, billInput.partial());
  await db.update(schema.bills).set({ ...input, updatedAt: Date.now() }).where(eq(schema.bills.id, b.id));
  return c.json({ ok: true });
});

household.delete("/household/bills/:id", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "finance");
  const b = await houseBill(db, me.householdId, c.req.param("id"));
  await db.delete(schema.bills).where(eq(schema.bills.id, b.id));
  return c.json({ ok: true });
});

/**
 * Pagar conta da casa: registra quem pagou. Se quem pagou foi o próprio usuário e ele
 * escolher uma conta dele, o gasto também entra nas finanças pessoais.
 */
household.post("/household/bills/:id/pay", async (c) => {
  const { db, userId, tz } = c.var;
  const me = await requirePermission(db, userId, "finance");
  const b = await houseBill(db, me.householdId, c.req.param("id"));
  if (b.status === "paid") bad("Esta conta já está paga.", 409);
  const input = await body(c, z.object({ paidBy: z.string().optional(), amount: zCents.positive().optional(), accountId: z.string().optional(), date: zDate.optional() }));
  const paidBy = input.paidBy ?? userId;
  const payer = await db.query.householdMembers.findFirst({ where: (x, { and, eq }) => and(eq(x.householdId, me.householdId), eq(x.userId, paidBy)) });
  if (!payer) bad("Quem pagou precisa ser da casa.");
  const amount = input.amount ?? b.amount;
  if (!amount) bad("Informe o valor pago (esta conta tem valor variável).");
  let transaction = null;
  if (input.accountId) {
    if (paidBy !== userId) bad("Só dá para lançar nas suas finanças uma conta que você pagou.");
    transaction = await createTransaction(db, userId, { type: "expense", amount, description: `${b.name} (casa)`, accountId: input.accountId, date: input.date ?? todayIn(tz) }, "bill", { billId: b.id });
  }
  await db.update(schema.bills).set({ status: "paid", paidAt: Date.now(), paidBy, amount, updatedAt: Date.now() }).where(eq(schema.bills.id, b.id));
  let next = null;
  const nextDue = nextDueDate(b.dueDate, b.recurrence);
  if (nextDue) {
    next = { id: id(), userId: b.userId, householdId: me.householdId, name: b.name, amount: b.amount, dueDate: nextDue, recurrence: b.recurrence, previousBillId: b.id };
    await db.insert(schema.bills).values(next);
  }
  return c.json({ ok: true, transaction, next });
});

household.post("/household/bills/:id/unpay", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "finance");
  const b = await houseBill(db, me.householdId, c.req.param("id"));
  if (b.status !== "paid") bad("Esta conta não está paga.", 409);
  const next = await db.query.bills.findFirst({ where: (x, { and, eq }) => and(eq(x.householdId, me.householdId), eq(x.previousBillId, b.id)) });
  if (next?.status === "paid") bad("A conta do período seguinte já foi paga. Desfaça aquela primeiro.", 409);
  if (next) await db.delete(schema.bills).where(eq(schema.bills.id, next.id));
  await db.delete(schema.transactions).where(eq(schema.transactions.billId, b.id));
  await db.update(schema.bills).set({ status: "pending", paidAt: null, paidBy: null, updatedAt: Date.now() }).where(eq(schema.bills.id, b.id));
  return c.json({ ok: true });
});

/* ===================== Tarefas da casa ===================== */

const taskInput = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: zDate.nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  assigneeId: z.string().nullable().optional(),
});

async function assertMemberOf(db: DB, householdId: string, uid: string | null | undefined) {
  if (!uid) return;
  const m = await db.query.householdMembers.findFirst({ where: (x, { and, eq }) => and(eq(x.householdId, householdId), eq(x.userId, uid)) });
  if (!m) bad("O responsável precisa ser da casa.");
}

household.get("/household/tasks", async (c) => {
  const { db, userId } = c.var;
  const me = await requireMember(db, userId);
  const rows = await db.query.tasks.findMany({
    where: (t, { eq }) => eq(t.householdId, me.householdId),
    orderBy: (t, { asc }) => [asc(t.done), asc(t.dueDate)],
  });
  const names = await memberNames(db, me.householdId);
  return c.json(rows.map((t) => ({ ...t, assigneeName: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null })));
});

household.post("/household/tasks", async (c) => {
  const { db, userId, env } = { ...c.var, env: c.env };
  const me = await requirePermission(db, userId, "createTasks");
  const input = await body(c, taskInput);
  await assertMemberOf(db, me.householdId, input.assigneeId);
  const row = { id: id(), userId, householdId: me.householdId, title: input.title, dueDate: input.dueDate ?? null, priority: input.priority ?? "normal", assigneeId: input.assigneeId ?? null };
  await db.insert(schema.tasks).values(row);
  if (row.assigneeId && row.assigneeId !== userId) {
    const names = await memberNames(db, me.householdId);
    await sendPush(env, db, row.assigneeId, { title: "Nova tarefa da casa", body: `${names.get(userId) ?? "Alguém"} passou para você: ${row.title}`, url: "/casa/tarefas", tag: `task-${row.id}` });
  }
  return c.json(row, 201);
});

household.patch("/household/tasks/:id", async (c) => {
  const { db, userId } = c.var;
  const me = await requireMember(db, userId);
  const t = await db.query.tasks.findFirst({ where: (x, { and, eq }) => and(eq(x.id, c.req.param("id")), eq(x.householdId, me.householdId)) });
  if (!t) bad("Tarefa não encontrada.", 404);
  const input = await body(c, taskInput.partial().extend({ done: z.boolean().optional() }));
  const onlyDone = Object.keys(input).every((k) => k === "done");
  // membro faz as próprias tarefas (e as sem responsável); editar exige permissão de criar
  if (onlyDone) {
    if (!can(me, "createTasks") && t.assigneeId && t.assigneeId !== userId) bad("Esta tarefa é de outra pessoa da casa.", 403);
  } else if (!can(me, "createTasks")) {
    bad("Sem permissão para editar tarefas da casa. Peça ao administrador.", 403);
  }
  await assertMemberOf(db, me.householdId, input.assigneeId);
  const patch: Record<string, unknown> = { ...input, updatedAt: Date.now() };
  if ("done" in input) patch.doneAt = input.done ? Date.now() : null;
  await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, t.id));
  return c.json({ ok: true });
});

household.delete("/household/tasks/:id", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "createTasks");
  await db.delete(schema.tasks).where(and(eq(schema.tasks.id, c.req.param("id")), eq(schema.tasks.householdId, me.householdId)));
  return c.json({ ok: true });
});

/* ===================== Compromissos da casa ===================== */

const eventInput = z.object({
  title: z.string().trim().min(1).max(200),
  date: zDate,
  time: zTime.nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  remindMinutes: z.number().int().min(0).max(60 * 24 * 14).nullable().optional(),
});

household.get("/household/events", async (c) => {
  const { db, userId, tz } = c.var;
  const me = await requireMember(db, userId);
  const from = todayIn(tz);
  const rows = await db.query.events.findMany({
    where: (e, { and, eq, gte }) => and(eq(e.householdId, me.householdId), gte(e.date, from)),
    orderBy: (e, { asc }) => [asc(e.date), asc(e.time)],
  });
  return c.json(rows);
});

household.post("/household/events", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "createTasks");
  const input = await body(c, eventInput);
  const row = { id: id(), userId, householdId: me.householdId, ...input };
  await db.insert(schema.events).values(row);
  return c.json(row, 201);
});

household.patch("/household/events/:id", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "createTasks");
  const input = await body(c, eventInput.partial());
  await db
    .update(schema.events)
    .set({ ...input, updatedAt: Date.now() })
    .where(and(eq(schema.events.id, c.req.param("id")), eq(schema.events.householdId, me.householdId)));
  return c.json({ ok: true });
});

household.delete("/household/events/:id", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "createTasks");
  await db.delete(schema.events).where(and(eq(schema.events.id, c.req.param("id")), eq(schema.events.householdId, me.householdId)));
  return c.json({ ok: true });
});

/* ===================== Lista de compras ===================== */

household.get("/household/shopping", async (c) => {
  const { db, userId } = c.var;
  const me = await requireMember(db, userId);
  const rows = await db.query.shoppingItems.findMany({
    where: (s, { eq }) => eq(s.householdId, me.householdId),
    orderBy: (s) => [asc(s.checked), desc(s.createdAt)],
  });
  const names = await memberNames(db, me.householdId);
  return c.json(rows.map((s) => ({ ...s, addedByName: s.addedBy ? (names.get(s.addedBy) ?? null) : null })));
});

household.post("/household/shopping", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "shopping");
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(80), quantity: z.string().trim().max(30).nullable().optional() }));
  const row = { id: id(), householdId: me.householdId, name: input.name, quantity: input.quantity || null, addedBy: userId };
  await db.insert(schema.shoppingItems).values(row);
  return c.json(row, 201);
});

household.patch("/household/shopping/:id", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "shopping");
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(80).optional(), quantity: z.string().trim().max(30).nullable().optional(), checked: z.boolean().optional() }));
  const patch: Record<string, unknown> = { ...input, updatedAt: Date.now() };
  if ("checked" in input) patch.checkedBy = input.checked ? userId : null;
  await db
    .update(schema.shoppingItems)
    .set(patch)
    .where(and(eq(schema.shoppingItems.id, c.req.param("id")), eq(schema.shoppingItems.householdId, me.householdId)));
  return c.json({ ok: true });
});

household.delete("/household/shopping/:id", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "shopping");
  await db.delete(schema.shoppingItems).where(and(eq(schema.shoppingItems.id, c.req.param("id")), eq(schema.shoppingItems.householdId, me.householdId)));
  return c.json({ ok: true });
});

/** Limpar os itens já comprados. */
household.post("/household/shopping/clear", async (c) => {
  const { db, userId } = c.var;
  const me = await requirePermission(db, userId, "shopping");
  await db.delete(schema.shoppingItems).where(and(eq(schema.shoppingItems.householdId, me.householdId), eq(schema.shoppingItems.checked, true)));
  return c.json({ ok: true });
});
