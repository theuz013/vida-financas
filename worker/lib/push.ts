import { buildPushPayload, type VapidKeys } from "@block65/webcrypto-web-push";
import { and, eq } from "drizzle-orm";
import { schema, type DB } from "./db";

export interface PushNote {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Envia para todos os aparelhos do usuário. Assinaturas expiradas (404/410) são apagadas.
 * Fase 2 (app nativo): este é o ponto único onde entram FCM (Android) e APNs (iOS).
 */
export async function sendPush(env: Env, db: DB, userId: string, note: PushNote): Promise<number> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
  const vapid: VapidKeys = {
    subject: env.VAPID_SUBJECT || "mailto:contato@example.com",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const subs = await db.query.pushSubscriptions.findMany({ where: (s, { eq }) => eq(s.userId, userId) });
  let sent = 0;
  for (const s of subs) {
    try {
      const payload = await buildPushPayload(
        { data: { ...note }, options: { ttl: 60 * 60 * 12, urgency: "normal" } },
        { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } },
        vapid,
      );
      const res = await fetch(s.endpoint, payload);
      if (res.status === 404 || res.status === 410) {
        await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.id, s.id), eq(schema.pushSubscriptions.userId, userId)));
      } else if (res.ok) {
        sent++;
      } else {
        console.warn("push falhou", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.warn("push erro", err);
    }
  }
  return sent;
}
