import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { addDays, daysBetween, monthlyRuleOccursOn, nextMonthlyOccurrence, todayIn } from "../../shared/dates";
import { cardInvoices, forecast } from "../../shared/finance";
import { id, schema, type DB } from "../lib/db";
import { assertOwned, body, deleteOwned, findOwned, refs, router, zDate, zTime } from "../lib/http";
import { loadFinance } from "./finance";
import { can, memberNames, membershipOf } from "../lib/household";

export const life = router();

/** CRUD simples de uma tabela do usuário, com validação e checagem de área. */
function crud<T extends z.ZodObject>(
  path: string,
  table: typeof schema.tasks | typeof schema.events | typeof schema.reminders | typeof schema.deadlines | typeof schema.areas,
  input: T,
  order: (t: any, ops: any) => any,
) {
  life.get(`/${path}`, async (c) => {
    const { db, userId } = c.var;
    const rows = await (db.query as any)[path].findMany({
      where: (t: any, { eq, and, isNull }: any) => ("householdId" in table ? and(eq(t.userId, userId), isNull(t.householdId)) : eq(t.userId, userId)),
      orderBy: order,
    });
    return c.json(rows);
  });
  life.post(`/${path}`, async (c) => {
    const { db, userId } = c.var;
    const data = (await body(c, input)) as Record<string, unknown>;
    await assertOwned(db, userId, [refs.area(data.areaId as string | undefined)]);
    const row = { id: id(), userId, ...data };
    await db.insert(table).values(row as any);
    return c.json(row, 201);
  });
  life.patch(`/${path}/:id`, async (c) => {
    const { db, userId } = c.var;
    await findOwned(db, table, userId, c.req.param("id"));
    const data = (await body(c, input.partial())) as Record<string, unknown>;
    await assertOwned(db, userId, [refs.area(data.areaId as string | undefined)]);
    if (table === schema.tasks && "done" in data) data.doneAt = data.done ? Date.now() : null;
    await db
      .update(table)
      .set({ ...data, updatedAt: Date.now() } as any)
      .where(and(eq(table.id, c.req.param("id")), eq(table.userId, userId), ...("householdId" in table ? [isNull((table as typeof schema.tasks).householdId)] : [])));
    return c.json({ ok: true });
  });
  life.delete(`/${path}/:id`, async (c) => {
    const { db, userId } = c.var;
    await deleteOwned(db, table, userId, [c.req.param("id")]);
    return c.json({ ok: true });
  });
}

const areaId = z.string().nullable().optional();

crud("areas", schema.areas, z.object({ name: z.string().trim().min(1).max(40), sort: z.number().int().optional() }), (t: any, { asc }: any) => [asc(t.sort), asc(t.name)]);

crud(
  "tasks",
  schema.tasks,
  z.object({
    title: z.string().trim().min(1).max(200),
    areaId,
    dueDate: zDate.nullable().optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
    done: z.boolean().optional(),
    remindAt: z.number().int().nullable().optional(),
  }),
  (t: any, { asc }: any) => [asc(t.done), asc(t.dueDate)],
);

crud(
  "events",
  schema.events,
  z.object({
    title: z.string().trim().min(1).max(200),
    date: zDate,
    time: zTime.nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    remindMinutes: z.number().int().min(0).max(60 * 24 * 14).nullable().optional(),
    areaId,
  }),
  (t: any, { asc }: any) => [asc(t.date), asc(t.time)],
);

crud(
  "reminders",
  schema.reminders,
  z.object({
    title: z.string().trim().min(1).max(200),
    dayOfMonth: z.number().int().min(1).max(31),
    notifyEve: z.boolean().optional(),
    active: z.boolean().optional(),
    areaId,
  }),
  (t: any, { asc }: any) => [asc(t.dayOfMonth)],
);

crud(
  "deadlines",
  schema.deadlines,
  z.object({
    title: z.string().trim().min(1).max(200),
    date: zDate,
    alertDaysBefore: z.number().int().min(0).max(365).optional(),
    areaId,
    done: z.boolean().optional(),
    notes: z.string().max(1000).nullable().optional(),
  }),
  (t: any, { asc }: any) => [asc(t.done), asc(t.date)],
);

/** Marca o lembrete recorrente como feito neste mês (sai da lista "Hoje"). */
life.post("/reminders/:id/done", async (c) => {
  const { db, userId, tz } = c.var;
  const r = await findOwned(db, schema.reminders, userId, c.req.param("id"));
  const today = todayIn(tz);
  await db.update(schema.reminders).set({ lastDoneDate: today, updatedAt: Date.now() }).where(eq(schema.reminders.id, r.id));
  return c.json({ ok: true, next: nextMonthlyOccurrence(r.dayOfMonth, addDays(today, 1)) });
});

/* ===================== Hoje ===================== */

export async function buildToday(db: DB, userId: string, tz: string) {
  const today = todayIn(tz);
  const tomorrow = addDays(today, 1);
  const fin = await loadFinance(db, userId);
  const [tasks, events, reminders, deadlines, areas] = await Promise.all([
    db.query.tasks.findMany({ where: (t, { eq, and, isNull }) => and(eq(t.userId, userId), isNull(t.householdId), eq(t.done, false)) }),
    db.query.events.findMany({ where: (t, { eq, and, gte, lte, isNull }) => and(eq(t.userId, userId), isNull(t.householdId), gte(t.date, today), lte(t.date, tomorrow)) }),
    db.query.reminders.findMany({ where: (t, { eq, and }) => and(eq(t.userId, userId), eq(t.active, true)) }),
    db.query.deadlines.findMany({ where: (t, { eq, and, isNull }) => and(eq(t.userId, userId), isNull(t.householdId), eq(t.done, false)) }),
    db.query.areas.findMany({ where: (t, { eq }) => eq(t.userId, userId) }),
  ]);
  const areaName = new Map(areas.map((a) => [a.id, a.name]));

  const pendingBills = fin.bills.filter((b) => b.status === "pending");
  const billsToday = pendingBills.filter((b) => b.dueDate === today);
  const billsOverdue = pendingBills.filter((b) => b.dueDate < today);
  const billsTomorrow = pendingBills.filter((b) => b.dueDate === tomorrow);

  const invoices = fin.accounts
    .filter((a) => a.kind === "card" && !a.archived)
    .flatMap((card) =>
      cardInvoices(card, fin.txs, today)
        .filter((i) => i.remaining > 0 && i.dueDate <= tomorrow)
        .map((i) => ({ cardId: card.id, cardName: card.name, dueDate: i.dueDate, remaining: i.remaining, status: i.status })),
    );

  const withArea = <T extends { areaId: string | null }>(x: T) => ({ ...x, areaName: x.areaId ? (areaName.get(x.areaId) ?? null) : null });

  const tasksToday = tasks.filter((t) => t.dueDate === today).map(withArea);
  const tasksOverdue = tasks.filter((t) => t.dueDate && t.dueDate < today).map(withArea);

  const remindersToday = reminders
    .filter((r) => monthlyRuleOccursOn(r.dayOfMonth, today) && r.lastDoneDate !== today)
    .map(withArea);
  const remindersTomorrow = reminders
    .filter((r) => r.notifyEve && monthlyRuleOccursOn(r.dayOfMonth, tomorrow))
    .map(withArea);

  const deadlinesAlert = deadlines
    .map((d) => ({ ...withArea(d), daysLeft: daysBetween(today, d.date) }))
    .filter((d) => d.daysLeft <= d.alertDaysBefore)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const fc = forecast({ ...fin, today, nextPayday: fin.settings?.nextPayday ?? null });
  const house = await houseToday(db, userId, today, tomorrow);

  return {
    today,
    bills: { today: billsToday, overdue: billsOverdue, tomorrow: billsTomorrow },
    invoices,
    tasks: { today: tasksToday, overdue: tasksOverdue },
    events: {
      today: events.filter((e) => e.date === today).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")).map(withArea),
      tomorrow: events.filter((e) => e.date === tomorrow).map(withArea),
    },
    reminders: { today: remindersToday, tomorrow: remindersTomorrow },
    deadlines: deadlinesAlert,
    money: {
      perDay: fc.perDay,
      free: fc.free,
      payday: fc.payday,
      paydayAssumed: fc.paydayAssumed,
      days: fc.days,
      // sem saldo cadastrado nem lançamento, o cálculo ainda não diz nada
      hasData: fin.accounts.some((a) => a.kind === "checking" && a.openingBalance !== 0) || fin.txs.length > 0,
    },
    house,
  };
}

/** O que a casa tem para hoje, para este membro. */
export async function houseToday(db: DB, userId: string, today: string, tomorrow: string) {
  const me = await membershipOf(db, userId);
  if (!me) return null;
  const hh = me.householdId;
  const [house, bills, tasks, events] = await Promise.all([
    db.query.households.findFirst({ where: (h, { eq }) => eq(h.id, hh) }),
    can(me, "finance")
      ? db.query.bills.findMany({ where: (b, { and, eq, lte }) => and(eq(b.householdId, hh), eq(b.status, "pending"), lte(b.dueDate, tomorrow)) })
      : Promise.resolve([]),
    db.query.tasks.findMany({
      where: (t, { and, eq, lte, or, isNull }) =>
        and(eq(t.householdId, hh), eq(t.done, false), lte(t.dueDate, today), or(isNull(t.assigneeId), eq(t.assigneeId, userId))),
    }),
    db.query.events.findMany({ where: (e, { and, eq }) => and(eq(e.householdId, hh), eq(e.date, today)) }),
  ]);
  const names = await memberNames(db, hh);
  return {
    name: house?.name ?? "Casa",
    canFinance: can(me, "finance"),
    bills: {
      today: bills.filter((b) => b.dueDate === today),
      overdue: bills.filter((b) => b.dueDate < today),
      tomorrow: bills.filter((b) => b.dueDate === tomorrow),
    },
    tasks: tasks.map((t) => ({ ...t, assigneeName: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null })),
    events: events.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
  };
}

life.get("/today", async (c) => {
  const { db, userId, tz } = c.var;
  return c.json(await buildToday(db, userId, tz));
});

/** Pendências por frente: tarefas abertas e prazos por área. */
life.get("/pendencias", async (c) => {
  const { db, userId, tz } = c.var;
  const today = todayIn(tz);
  const [areas, tasks, deadlines] = await Promise.all([
    db.query.areas.findMany({ where: (t, { eq }) => eq(t.userId, userId), orderBy: (t, { asc }) => [asc(t.sort)] }),
    db.query.tasks.findMany({ where: (t, { eq, and, isNull }) => and(eq(t.userId, userId), isNull(t.householdId), eq(t.done, false)), orderBy: (t, { asc }) => [asc(t.dueDate)] }),
    db.query.deadlines.findMany({ where: (t, { eq, and, isNull }) => and(eq(t.userId, userId), isNull(t.householdId), eq(t.done, false)), orderBy: (t, { asc }) => [asc(t.date)] }),
  ]);
  const group = (areaId: string | null) => {
    const ts = tasks.filter((t) => t.areaId === areaId);
    const ds = deadlines.filter((d) => d.areaId === areaId);
    return {
      tasks: ts,
      deadlines: ds.map((d) => ({ ...d, daysLeft: daysBetween(today, d.date) })),
      overdue: ts.filter((t) => t.dueDate && t.dueDate < today).length,
      open: ts.length + ds.length,
    };
  };
  const result = areas.map((a) => ({ area: a, ...group(a.id) }));
  const loose = group(null);
  if (loose.open) result.push({ area: { id: "", name: "Sem área" } as (typeof areas)[number], ...loose });
  return c.json(result);
});


