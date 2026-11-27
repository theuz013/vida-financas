import { eq, lt, and } from "drizzle-orm";
import { formatBRL } from "../../shared/money";
import { timeIn, todayIn } from "../../shared/dates";
import { id, schema, type DB } from "./db";
import { sendPush, type PushNote } from "./push";
import { buildToday } from "../routes/life";
import { loadFinance } from "../routes/finance";
import { membershipOf } from "./household";

/** Hora local em que sai o resumo do dia. */
const DIGEST_HOUR = "08";

/** Registra a chave; devolve false se este aviso já foi enviado. */
async function once(db: DB, userId: string, key: string): Promise<boolean> {
  const res = await db
    .insert(schema.notificationLog)
    .values({ id: id(), userId, key })
    .onConflictDoNothing()
    .returning({ id: schema.notificationLog.id });
  return res.length > 0;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Monta o texto do resumo do dia (contas, tarefas, compromissos, lembretes, prazos, limite do mês). */
export async function digestFor(db: DB, userId: string, tz: string): Promise<PushNote | null> {
  const t = await buildToday(db, userId, tz);
  const lines: string[] = [];
  if (t.bills.overdue.length) lines.push(`${plural(t.bills.overdue.length, "conta vencida", "contas vencidas")}`);
  if (t.bills.today.length) lines.push(`Vence hoje: ${t.bills.today.map((b) => b.name).join(", ")}`);
  if (t.bills.tomorrow.length) lines.push(`Vence amanhã: ${t.bills.tomorrow.map((b) => b.name).join(", ")}`);
  for (const inv of t.invoices) {
    lines.push(`Fatura ${inv.cardName} ${inv.dueDate === t.today ? "vence hoje" : inv.status === "overdue" ? "vencida" : "vence amanhã"}: ${formatBRL(inv.remaining)}`);
  }
  if (t.tasks.today.length) lines.push(`${plural(t.tasks.today.length, "tarefa", "tarefas")} para hoje`);
  if (t.tasks.overdue.length) lines.push(`${plural(t.tasks.overdue.length, "tarefa atrasada", "tarefas atrasadas")}`);
  for (const e of t.events.today) lines.push(`${e.time ? e.time + " " : ""}${e.title}`);
  for (const r of t.reminders.today) lines.push(`Hoje: ${r.title}`);
  for (const r of t.reminders.tomorrow) lines.push(`Amanhã: ${r.title}`);
  for (const d of t.deadlines.slice(0, 3)) {
    lines.push(d.daysLeft < 0 ? `Prazo vencido: ${d.title}` : d.daysLeft === 0 ? `Prazo hoje: ${d.title}` : `${d.title} em ${plural(d.daysLeft, "dia", "dias")}`);
  }

  // casa
  if (t.house) {
    const hb = [...t.house.bills.overdue, ...t.house.bills.today];
    if (hb.length) lines.push(`Casa: ${hb.map((b) => b.name).join(", ")} ${hb.some((b) => b.dueDate < t.today) ? "(há vencida)" : "vence hoje"}`);
    if (t.house.bills.tomorrow.length) lines.push(`Casa, amanhã: ${t.house.bills.tomorrow.map((b) => b.name).join(", ")}`);
    if (t.house.tasks.length) lines.push(`Casa: ${plural(t.house.tasks.length, "tarefa", "tarefas")} para hoje`);
    for (const e of t.house.events) lines.push(`Casa: ${e.time ? e.time + " " : ""}${e.title}`);
  }

  // limite do mês
  const fin = await loadFinance(db, userId);
  const limit = fin.settings?.monthlyLimit;
  if (limit) {
    const month = t.today.slice(0, 7);
    const spent = fin.txs.filter((x) => x.type === "expense" && x.date.startsWith(month)).reduce((s, x) => s + x.amount, 0);
    if (spent >= limit) lines.push(`Limite do mês estourado: ${formatBRL(spent)} de ${formatBRL(limit)}`);
    else if (spent >= limit * 0.8) lines.push(`Já usou ${Math.round((spent / limit) * 100)}% do limite do mês`);
  }

  if (lines.length === 0) return null;
  return {
    title: `Hoje · ${formatBRL(t.money.perDay)}/dia`,
    body: lines.slice(0, 8).join("\n"),
    url: "/",
    tag: `digest-${t.today}`,
  };
}

/** Roda a cada 15 minutos (cron). Resumo diário às 08h e lembretes com hora. */
export async function runNotifications(env: Env, db: DB, now = new Date()) {
  const users = await db.query.user.findMany({ columns: { id: true, isDemo: true } });
  for (const u of users) {
    if (u.isDemo) continue;
    const settings = await db.query.settings.findFirst({ where: (s, { eq }) => eq(s.userId, u.id) });
    const tz = settings?.timezone || env.APP_TIMEZONE || "America/Sao_Paulo";
    const today = todayIn(tz, now);
    const hhmm = timeIn(tz, now);

    if (hhmm.slice(0, 2) === DIGEST_HOUR && (await once(db, u.id, `digest:${today}`))) {
      const note = await digestFor(db, u.id, tz);
      if (note) await sendPush(env, db, u.id, note);
    }

    // compromissos com lembrete: avisa quando faltar remindMinutes (janela de 15 min do cron)
    const nowMin = toMinutes(hhmm);
    const membership = await membershipOf(db, u.id);
    const events = await db.query.events.findMany({
      where: (e, { eq, and, or, isNull }) =>
        and(
          eq(e.date, today),
          membership
            ? or(and(eq(e.userId, u.id), isNull(e.householdId)), eq(e.householdId, membership.householdId))
            : and(eq(e.userId, u.id), isNull(e.householdId)),
        ),
    });
    for (const e of events) {
      if (e.remindMinutes == null || !e.time) continue;
      const at = toMinutes(e.time) - e.remindMinutes;
      if (nowMin >= at && nowMin <= toMinutes(e.time) && (await once(db, u.id, `event:${e.id}:${today}`))) {
        await sendPush(env, db, u.id, {
          title: e.householdId ? `Casa: ${e.title}` : e.title,
          body: `Às ${e.time}${e.location ? ` · ${e.location}` : ""}`,
          url: e.householdId ? "/casa/agenda" : "/vida/agenda",
          tag: `event-${e.id}`,
        });
      }
    }

    // tarefas com lembrete em horário exato
    const tasks = await db.query.tasks.findMany({
      where: (t, { eq, and, lte, isNotNull, isNull }) => and(eq(t.userId, u.id), isNull(t.householdId), eq(t.done, false), isNotNull(t.remindAt), lte(t.remindAt, now.getTime())),
    });
    for (const t of tasks) {
      if (await once(db, u.id, `task:${t.id}:${t.remindAt}`)) {
        await sendPush(env, db, u.id, { title: "Tarefa", body: t.title, url: "/vida/tarefas", tag: `task-${t.id}` });
      }
    }
  }

  // limpeza: log de avisos com mais de 60 dias e contas de demonstração com mais de 1 dia
  await db.delete(schema.notificationLog).where(lt(schema.notificationLog.sentAt, now.getTime() - 60 * 86_400_000));
  await db.delete(schema.user).where(and(eq(schema.user.isDemo, true), lt(schema.user.createdAt, new Date(now.getTime() - 86_400_000))));
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
