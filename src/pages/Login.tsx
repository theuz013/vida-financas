import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, useMe } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { Button, ErrorNote, Field, Input } from "@/components/ui";

export function LoginPage() {
  const { data: me } = useMe();
  const { data: cfg } = useQuery({ queryKey: ["public-config"], queryFn: () => api<{ demoEnabled: boolean; signupOpen: boolean }>("/public-config") });
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"login" | "demo" | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  if (me) return <Navigate to="/" replace />;

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ["me"] });
    navigate("/", { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("login");
    const res =
      mode === "in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name: name || email.split("@")[0], email, password });
    setBusy(null);
    if (res.error) {
      const m = res.error.message ?? "";
      setError(
        /invalid email or password/i.test(m) ? "E-mail ou senha incorretos." :
        /already exists/i.test(m) ? "Já existe uma conta com este e-mail. Entre com ela." :
        /password.*short/i.test(m) ? "A senha precisa de pelo menos 8 caracteres." :
        m || "Não deu para entrar. Tente de novo.",
      );
      return;
    }
    await done();
  };

  const demo = async () => {
    setError(null);
    setBusy("demo");
    try {
      await api("/demo", { body: {} });
      await done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não deu para abrir a demonstração.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <p className="text-center text-[17px] font-extrabold tracking-[-0.02em]">Vida &amp; Finanças</p>

      <div className="my-auto py-10">
        <h1 className="text-[34px] leading-[1.08] font-extrabold tracking-[-0.035em]">
          {mode === "in" ? "Seu dia e seu dinheiro, num lugar só." : "Criar sua conta"}
        </h1>
        <p className="mt-3 text-[16px] text-ink-2">
          {mode === "in" ? "Entre para ver o que tem para hoje e quanto dá para gastar." : "A primeira conta criada vira a dona do app."}
        </p>

        <form className="mt-8 space-y-4" onSubmit={submit}>
          {mode === "up" ? (
            <Field label="Como posso chamar você?">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Seu nome" />
            </Field>
          ) : null}
          <Field label="E-mail">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" />
          </Field>
          <Field label="Senha" hint={mode === "up" ? "Pelo menos 8 caracteres." : undefined}>
            <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
          </Field>
          <ErrorNote error={error ? new Error(error) : null} />
          <Button size="lg" type="submit" loading={busy === "login"} className="mt-2">
            {mode === "in" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <p className="mt-5 text-center text-[15px] text-ink-2">
          {mode === "in" ? "Primeiro acesso? " : "Já tem uma conta? "}
          <button type="button" className="font-semibold text-ink underline underline-offset-4" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }}>
            {mode === "in" ? "Criar conta" : "Entrar"}
          </button>
        </p>
      </div>

      {cfg?.demoEnabled ? (
        <div className="space-y-3 text-center">
          <Button variant="secondary" size="lg" loading={busy === "demo"} onClick={demo}>
            Ver com dados de exemplo
          </Button>
          <p className="text-[12.5px] text-ink-3">
            Conta de demonstração temporária, apagada em 24h. <Link to="/privacidade" className="underline">Privacidade</Link>
          </p>
        </div>
      ) : (
        <p className="text-center text-[12.5px] text-ink-3"><Link to="/privacidade" className="underline">Política de privacidade</Link></p>
      )}
    </div>
  );
}
