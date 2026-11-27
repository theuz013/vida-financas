import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins/bearer";
import { APIError } from "better-auth/api";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { seedDefaults, seedOwner } from "./seed";

export const DEMO_EMAIL_DOMAIN = "demo.vida-financas.local";

export function isDemoEmail(email: string) {
  return email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/**
 * Better Auth precisa do binding D1, que só existe durante a requisição,
 * então a instância é criada por requisição (é barata).
 */
export function createAuth(env: Env) {
  const db = getDb(env.DB);
  const tz = env.APP_TIMEZONE || "America/Sao_Paulo";

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins: [
      env.BETTER_AUTH_URL,
      "http://localhost:5173",
      // app nativo (Capacitor) — fase 2
      "capacitor://localhost",
      "https://localhost",
    ].filter(Boolean),
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 8 },
    user: {
      additionalFields: { isDemo: { type: "boolean", required: false, input: false } },
      // Exclusão de conta: exigência da App Store para apps com login.
      deleteUser: { enabled: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 60, // 60 dias: app pessoal, login raro
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    // Bearer: o app nativo (Capacitor) usa token no header em vez de cookie.
    plugins: [bearer()],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (isDemoEmail(user.email)) {
              if (env.DEMO_ENABLED !== "true") {
                throw new APIError("FORBIDDEN", { message: "Modo demonstração desativado." });
              }
              return { data: { ...user, isDemo: true } };
            }
            if (env.ALLOW_SIGNUP === "true") return { data: user };
            // Cadastro fechado: só o primeiro usuário (o dono) pode se cadastrar.
            const [{ n }] = await db
              .select({ n: count() })
              .from(schema.user)
              .where(eq(schema.user.isDemo, false));
            if (n > 0) {
              throw new APIError("FORBIDDEN", { message: "Cadastro fechado. Fale com o dono do app." });
            }
            return { data: user };
          },
          after: async (user) => {
            await seedDefaults(db, user.id, tz);
            if (isDemoEmail(user.email)) return;
            const [{ n }] = await db
              .select({ n: count() })
              .from(schema.user)
              .where(eq(schema.user.isDemo, false));
            if (n === 1) await seedOwner(db, user.id, tz);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
