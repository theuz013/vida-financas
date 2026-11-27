import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { id, schema, type DB } from "../lib/db";
import { bad, body, router, sha256Hex, zCents, zDate } from "../lib/http";
import { sendPush } from "../lib/push";
import { digestFor } from "../lib/notify";
import { createAuth } from "../lib/auth";
import { membershipOf, removeFromHousehold } from "../lib/household";

export const account = router();

/* ---------- configurações ---------- */

account.get("/settings", async (c) => {
  const { db, userId } = c.var;
  const s = await db.query.settings.findFirst({ where: (t, { eq }) => eq(t.userId, userId) });
  return c.json(s ?? { userId, timezone: c.var.tz, nextPayday: null, expectedIncome: null, monthlyLimit: null });
});

account.patch("/settings", async (c) => {
  const { db, userId } = c.var;
  const input = await body(
    c,
    z.object({
      timezone: z.string().min(1).optional(),
      nextPayday: zDate.nullable().optional(),
      expectedIncome: zCents.nonnegative().nullable().optional(),
      monthlyLimit: zCents.nonnegative().nullable().optional(),
    }),
  );
  if (input.timezone) {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: input.timezone });
    } catch {
      bad("Fuso horário inválido.");
    }
  }
  await db
    .insert(schema.settings)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: schema.settings.userId, set: { ...input, updatedAt: Date.now() } });
  return c.json({ ok: true });
});

/** Dono do app: o primeiro usuário (não demonstração). Só ele usa o assistente do WhatsApp. */
async function isOwner(db: DB, userId: string) {
  const first = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.isDemo, false),
    orderBy: (u, { asc }) => [asc(u.createdAt), asc(u.id)],
    columns: { id: true },
  });
  return first?.id === userId;
}

/* ---------- primeiro uso ---------- */

/** O que ainda falta configurar (guia "Comece por aqui" na tela Hoje). */
account.get("/setup", async (c) => {
  const { db, userId } = c.var;
  const [accounts, settings, push, keys, txCount] = await Promise.all([
    db.query.accounts.findMany({ where: (t, { eq }) => eq(t.userId, userId) }),
    db.query.settings.findFirst({ where: (t, { eq }) => eq(t.userId, userId) }),
    db.query.pushSubscriptions.findFirst({ where: (t, { eq }) => eq(t.userId, userId), columns: { id: true } }),
    db.query.apiKeys.findFirst({ where: (t, { eq }) => eq(t.userId, userId), columns: { id: true } }),
    db.query.transactions.findFirst({ where: (t, { eq }) => eq(t.userId, userId), columns: { id: true } }),
  ]);
  const checking = accounts.filter((a) => a.kind === "checking" && !a.archived);
  const me = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, userId), columns: { isDemo: true } });
  return c.json({
    // assistente é só do dono (a família não usa WhatsApp); demonstração mostra o passo
    assistantAvailable: me?.isDemo || (await isOwner(db, userId)),
    balances: checking.some((a) => a.openingBalance !== 0) || Boolean(txCount),
    cards: accounts.some((a) => a.kind === "card"),
    payday: Boolean(settings?.nextPayday),
    notifications: Boolean(push),
    assistant: Boolean(keys),
  });
});

/* ---------- chaves da API (assistente Pelúcio) ---------- */

account.get("/keys", async (c) => {
  const { db, userId } = c.var;
  const rows = await db.query.apiKeys.findMany({
    where: (t, { eq }) => eq(t.userId, userId),
    columns: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
  });
  return c.json(rows);
});

account.post("/keys", async (c) => {
  const { db, userId } = c.var;
  if (!(await isOwner(db, userId))) bad("A integração com o assistente é só do dono do app.", 403);
  const { name } = await body(c, z.object({ name: z.string().trim().min(1).max(40) }));
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const secret = `vf_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  const row = { id: id(), userId, name, keyHash: await sha256Hex(secret), prefix: secret.slice(0, 7) };
  await db.insert(schema.apiKeys).values(row);
  // a chave completa só aparece aqui, uma vez
  return c.json({ id: row.id, name, prefix: row.prefix, key: secret }, 201);
});

account.delete("/keys/:id", async (c) => {
  const { db, userId } = c.var;
  await db.delete(schema.apiKeys).where(and(eq(schema.apiKeys.id, c.req.param("id")), eq(schema.apiKeys.userId, userId)));
  return c.json({ ok: true });
});

/* ---------- push ---------- */

account.get("/push/key", (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null }));

account.post("/push/subscribe", async (c) => {
  const { db, userId } = c.var;
  const sub = await body(
    c,
    z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }),
  );
  await db
    .insert(schema.pushSubscriptions)
    .values({ id: id(), userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, updatedAt: Date.now() },
    });
  return c.json({ ok: true });
});

account.post("/push/unsubscribe", async (c) => {
  const { db, userId } = c.var;
  const { endpoint } = await body(c, z.object({ endpoint: z.string() }));
  await db
    .delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, userId)));
  return c.json({ ok: true });
});

/** Envia agora o resumo do dia (ou um aviso de teste) para conferir que o push chega. */
account.post("/push/test", async (c) => {
  const { db, userId, tz } = c.var;
  const note = (await digestFor(db, userId, tz)) ?? { title: "Tudo certo", body: "As notificações estão funcionando.", url: "/" };
  const sent = await sendPush(c.env, db, userId, note);
  return c.json({ sent, configured: Boolean(c.env.VAPID_PUBLIC_KEY) });
});

/* ---------- exportar dados (LGPD / lojas) ---------- */

account.get("/account/export", async (c) => {
  const { db, userId } = c.var;
  const by = (t: { userId: any }) => eq(t.userId, userId);
  const [u, settings, accounts, categories, transactions, bills, areas, tasks, events, reminders, deadlines] =
    await Promise.all([
      db.query.user.findFirst({ where: (t, { eq }) => eq(t.id, userId), columns: { id: true, name: true, email: true, createdAt: true } }),
      db.select().from(schema.settings).where(by(schema.settings)),
      db.select().from(schema.accounts).where(by(schema.accounts)),
      db.select().from(schema.categories).where(by(schema.categories)),
      db.select().from(schema.transactions).where(by(schema.transactions)),
      db.select().from(schema.bills).where(by(schema.bills)),
      db.select().from(schema.areas).where(by(schema.areas)),
      db.select().from(schema.tasks).where(by(schema.tasks)),
      db.select().from(schema.events).where(by(schema.events)),
      db.select().from(schema.reminders).where(by(schema.reminders)),
      db.select().from(schema.deadlines).where(by(schema.deadlines)),
    ]);
  const data = { exportedAt: new Date().toISOString(), user: u, settings, accounts, categories, transactions, bills, areas, tasks, events, reminders, deadlines };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="vida-financas-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});

/**
 * Excluir conta: apaga o usuário e, em cascata, todos os dados.
 * Exige digitar EXCLUIR para evitar acidente.
 */
account.post("/account/delete", async (c) => {
  const { db, userId } = c.var;
  await body(c, z.object({ confirm: z.literal("EXCLUIR") }));
  // casa: passa os registros e, se preciso, a administração para outro membro
  const membership = await membershipOf(db, userId);
  if (membership) await removeFromHousehold(db, membership, { promote: true });
  // encerra a sessão (limpa os cookies, inclusive o cache) antes de apagar
  const out = await createAuth(c.env).api.signOut({ headers: c.req.raw.headers, asResponse: true });
  await db.delete(schema.user).where(eq(schema.user.id, userId));
  const res = c.json({ ok: true });
  for (const cookie of out.headers.getSetCookie()) res.headers.append("set-cookie", cookie);
  return res;
});
