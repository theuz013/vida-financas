import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth, DEMO_EMAIL_DOMAIN } from "./lib/auth";
import { getDb } from "./lib/db";
import { type AppEnv } from "./lib/http";
import { runNotifications } from "./lib/notify";
import { seedDemo } from "./lib/seed";
import { account } from "./routes/account";
import { finance } from "./routes/finance";
import { integration } from "./routes/integration";
import { life } from "./routes/life";

const app = new Hono<AppEnv>().basePath("/api");

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Erro inesperado no servidor." }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));

/* ---------- autenticação (Better Auth) ---------- */
app.on(["GET", "POST"], "/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

/** Configuração pública que a tela de login precisa. */
app.get("/public-config", (c) => c.json({ demoEnabled: c.env.DEMO_ENABLED === "true", signupOpen: c.env.ALLOW_SIGNUP === "true" }));

/**
 * Modo demonstração: cria uma conta temporária com dados de exemplo e já entra.
 * Serve para os revisores da App Store / Play Store testarem sem conta real.
 * As contas de demonstração são apagadas pelo cron depois de 24h.
 */
app.post("/demo", async (c) => {
  if (c.env.DEMO_ENABLED !== "true") return c.json({ error: "Modo demonstração desativado." }, 403);
  const auth = createAuth(c.env);
  const suffix = crypto.randomUUID().slice(0, 8);
  const password = crypto.randomUUID();
  const res = await auth.api.signUpEmail({
    body: { name: "Demonstração", email: `demo-${suffix}@${DEMO_EMAIL_DOMAIN}`, password },
    asResponse: true,
    headers: c.req.raw.headers,
  });
  if (!res.ok) return res;
  const data = (await res.clone().json()) as { user: { id: string } };
  await seedDemo(getDb(c.env.DB), data.user.id, c.env.APP_TIMEZONE || "America/Sao_Paulo");
  return res;
});

/* ---------- API do assistente (chave) ---------- */
app.route("/v1", integration);

/* ---------- rotas do app (sessão) ---------- */
const authed = new Hono<AppEnv>();
authed.use("*", async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Faça login para continuar." }, 401);
  const db = getDb(c.env.DB);
  const settings = await db.query.settings.findFirst({ where: (s, { eq }) => eq(s.userId, session.user.id) });
  c.set("db", db);
  c.set("userId", session.user.id);
  c.set("tz", settings?.timezone || c.env.APP_TIMEZONE || "America/Sao_Paulo");
  await next();
});
authed.get("/me", async (c) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  return c.json({ user: session?.user });
});
authed.route("/", finance);
authed.route("/", life);
authed.route("/", account);
app.route("/", authed);

app.all("*", (c) => c.json({ error: "Rota não encontrada." }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runNotifications(env, getDb(env.DB)));
  },
} satisfies ExportedHandler<Env>;
