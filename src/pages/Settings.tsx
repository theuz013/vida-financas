import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Bell, Copy, Download, FileText, KeyRound, LogOut, Trash2, Wallet } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { api, useAction, useAreas, useCategories, useMe, useSettings, type Area, type Category } from "@/lib/api";
import { formatBRL, shortDate } from "@/lib/format";
import { authClient } from "@/lib/auth";
import { currentSubscription, disablePush, enablePush, isStandalone, pushSupported } from "@/lib/push";
import { Button, Card, ErrorNote, Field, IconBubble, Input, List, PageHeader, Row, Section, Segmented, Sheet } from "@/components/ui";
import { PaydaySheet } from "./Finance";

export function SettingsPage() {
  const { data: me } = useMe();
  const { data: settings } = useSettings();
  const [paydayOpen, setPaydayOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await authClient.signOut();
    qc.clear();
    navigate("/entrar");
  };

  return (
    <div>
      <PageHeader title="Ajustes" subtitle={me ? `${me.name} · ${me.email}` : undefined} />

      <Section title="Dinheiro">
        <List>
          <Row
            onClick={() => setPaydayOpen(true)}
            leading={<IconBubble><Wallet /></IconBubble>}
            title="Próximo salário"
            subtitle={settings?.nextPayday ? `${shortDate(settings.nextPayday)}${settings.expectedIncome ? ` · ${formatBRL(settings.expectedIncome)}` : ""}` : "Não informado"}
            trailing={settings?.monthlyLimit ? <span className="text-[13px] text-ink-2">limite {formatBRL(settings.monthlyLimit)}</span> : null}
          />
        </List>
      </Section>

      <PushSection />
      <CategoriesSection />
      <AreasSection />
      <ApiKeysSection />

      <Section title="Seus dados">
        <List>
          <a href="/api/account/export" className="flex items-center gap-3 px-4 py-3.5 hover:bg-sunken/60">
            <IconBubble><Download /></IconBubble>
            <div className="flex-1"><div className="text-[15px] font-medium">Exportar dados</div><div className="text-[13px] text-ink-2">Arquivo JSON com tudo o que está no app</div></div>
          </a>
          <Row to="/privacidade" leading={<IconBubble><FileText /></IconBubble>} title="Política de privacidade" />
          <Row onClick={signOut} leading={<IconBubble><LogOut /></IconBubble>} title="Sair" />
          <Row onClick={() => setDeleteOpen(true)} leading={<IconBubble tone="bad"><Trash2 /></IconBubble>} title={<span className="text-bad">Excluir conta</span>} subtitle="Apaga a conta e todos os dados, sem volta" />
        </List>
      </Section>

      <PaydaySheet open={paydayOpen} onClose={() => setPaydayOpen(false)} />
      <DeleteAccount open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}

function PushSection() {
  const [status, setStatus] = useState<"loading" | "on" | "off">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    currentSubscription().then((s) => setStatus(s ? "on" : "off")).catch(() => setStatus("off"));
  }, []);

  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (status === "on") {
        await disablePush();
        setStatus("off");
      } else {
        const r = await enablePush();
        if (r === "ok") setStatus("on");
        else if (r === "denied") setMsg("As notificações estão bloqueadas. Libere nos ajustes do aparelho.");
        else if (r === "not-configured") setMsg("O servidor ainda não tem as chaves de push configuradas.");
        else setMsg(isStandalone() ? "Este aparelho não aceita notificações." : "No iPhone, adicione o app à tela de início primeiro (Compartilhar → Adicionar à Tela de Início).");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu para ativar.");
    } finally {
      setBusy(false);
    }
  };
  const test = useAction(() => api<{ sent: number }>("/push/test", { body: {} }));

  return (
    <Section title="Notificações">
      <Card className="px-4 py-4">
        <div className="flex items-start gap-3">
          <IconBubble><Bell /></IconBubble>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">Avisos neste aparelho</p>
            <p className="mt-0.5 text-[13px] text-ink-2">Resumo do dia às 8h (contas, faturas, tarefas, lembretes, prazos e limite do mês) e lembrete antes dos compromissos.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant={status === "on" ? "secondary" : "primary"} loading={busy || status === "loading"} onClick={toggle}>
            {status === "on" ? "Desativar" : "Ativar notificações"}
          </Button>
          {status === "on" ? (
            <Button variant="ghost" loading={test.isPending} onClick={() => test.mutate(undefined, { onSuccess: (r) => setMsg(r.sent ? "Enviado. Deve chegar em instantes." : "Nenhum aparelho recebeu. Tente desativar e ativar de novo.") })}>
              Enviar teste
            </Button>
          ) : null}
        </div>
        {msg ? <p className="mt-3 text-[13.5px] text-ink-2">{msg}</p> : null}
      </Card>
    </Section>
  );
}

function CategoriesSection() {
  const { data: cats = [] } = useCategories();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const list = cats.filter((c) => c.kind === kind);
  return (
    <Section title="Categorias" action={<button type="button" className="-my-3 -mr-2 inline-flex h-11 min-w-11 items-center justify-center px-2 text-[14px] font-semibold text-ink-2 hover:text-ink active:text-ink" onClick={() => setEditing("new")}>Nova</button>}>
      <Segmented className="mb-2.5" value={kind} onChange={setKind} options={[{ value: "expense", label: "Gastos" }, { value: "income", label: "Receitas" }]} />
      <Card className="flex flex-wrap gap-2 px-3 py-3">
        {list.map((c) => (
          <button key={c.id} type="button" onClick={() => setEditing(c)} className="hit inline-flex h-10 items-center gap-1.5 rounded-full bg-sunken px-3.5 text-[14px] font-medium hover:bg-line/70 active:bg-line">
            <span aria-hidden>{c.emoji}</span> {c.name}
          </button>
        ))}
      </Card>
      <CategorySheet value={editing} kind={kind} onClose={() => setEditing(null)} />
    </Section>
  );
}

function CategorySheet({ value, kind, onClose }: { value: Category | "new" | null; kind: "expense" | "income"; onClose: () => void }) {
  const c = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  useEffect(() => {
    if (!value) return;
    setName(c?.name ?? "");
    setEmoji(c?.emoji ?? "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(() => {
    const body = { name, emoji: emoji || "•", kind: c?.kind ?? kind };
    return c ? api(`/categories/${c.id}`, { method: "PATCH", body }) : api("/categories", { body });
  });
  const remove = useAction(() => api(`/categories/${c!.id}`, { method: "DELETE" }));
  return (
    <Sheet open={value !== null} onClose={onClose} title={c ? "Editar categoria" : "Nova categoria"} footer={
      <div className="flex gap-2">
        {c ? <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm("Apagar a categoria? Os lançamentos ficam sem categoria.") && remove.mutate(undefined, { onSuccess: onClose })}>Apagar</Button> : null}
        <Button size="lg" className="flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>
      </div>
    }>
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <Field label="Emoji"><Input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 8))} className="text-center text-[20px]" placeholder="🛒" /></Field>
        <Field label="Nome"><Input autoFocus={!c} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <ErrorNote error={save.error} />
    </Sheet>
  );
}

function AreasSection() {
  const { data: areas = [] } = useAreas();
  const [editing, setEditing] = useState<Area | "new" | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    if (editing) setName(editing === "new" ? "" : editing.name);
  }, [editing]);
  const area = editing && editing !== "new" ? editing : null;
  const save = useAction(() => (area ? api(`/areas/${area.id}`, { method: "PATCH", body: { name } }) : api("/areas", { body: { name, sort: areas.length } })));
  const remove = useAction(() => api(`/areas/${area!.id}`, { method: "DELETE" }));
  return (
    <Section title="Frentes da vida" action={<button type="button" className="-my-3 -mr-2 inline-flex h-11 min-w-11 items-center justify-center px-2 text-[14px] font-semibold text-ink-2 hover:text-ink active:text-ink" onClick={() => setEditing("new")}>Nova</button>}>
      <Card className="flex flex-wrap gap-2 px-3 py-3">
        {areas.map((a) => (
          <button key={a.id} type="button" onClick={() => setEditing(a)} className="hit h-10 rounded-full bg-sunken px-4 text-[14px] font-medium hover:bg-line/70 active:bg-line">{a.name}</button>
        ))}
      </Card>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={area ? "Editar frente" : "Nova frente"} footer={
        <div className="flex gap-2">
          {area ? <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm("Apagar a frente? As tarefas ficam sem frente.") && remove.mutate(undefined, { onSuccess: () => setEditing(null) })}>Apagar</Button> : null}
          <Button size="lg" className="flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => setEditing(null) })}>Salvar</Button>
        </div>
      }>
        <Field label="Nome"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Casa" /></Field>
        <ErrorNote error={save.error} />
      </Sheet>
    </Section>
  );
}

function ApiKeysSection() {
  const { data: keys = [] } = useQuery({ queryKey: ["keys"], queryFn: () => api<{ id: string; name: string; prefix: string; lastUsedAt: number | null }[]>("/keys") });
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useAction(() => api<{ key: string }>("/keys", { body: { name: "Assistente (WhatsApp)" } }));
  const revoke = useAction((id: string) => api(`/keys/${id}`, { method: "DELETE" }));
  return (
    <Section title="Integração com o assistente">
      <Card className="px-4 py-4">
        <div className="flex items-start gap-3">
          <IconBubble><KeyRound /></IconBubble>
          <p className="min-w-0 flex-1 text-[13.5px] text-ink-2">
            Chave para o assistente registrar gastos e contas a pagar pelo WhatsApp. Ele envia no header <code className="rounded bg-sunken px-1 py-0.5 text-[12.5px] text-ink">X-Api-Key</code>. O formato dos pedidos está no README do projeto.
          </p>
        </div>
        {keys.length ? (
          <ul className="mt-3 divide-y divide-line rounded-xl bg-sunken/60">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14px]">
                <span className="min-w-0 truncate"><span className="font-medium">{k.name}</span> <span className="num text-ink-2">{k.prefix}…</span></span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[12.5px] text-ink-3">{k.lastUsedAt ? `usada ${new Date(k.lastUsedAt).toLocaleDateString("pt-BR")}` : "nunca usada"}</span>
                  <Button size="sm" variant="ghost" onClick={() => window.confirm("Revogar esta chave? O assistente para de conseguir registrar.") && revoke.mutate(k.id)}>Revogar</Button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <Button className="mt-3" variant="secondary" loading={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: (r) => { setCreated(r.key); setCopied(false); } })}>
          Gerar nova chave
        </Button>
      </Card>
      <Sheet open={created !== null} onClose={() => setCreated(null)} title="Chave criada" footer={<Button size="lg" onClick={() => setCreated(null)}>Pronto, guardei</Button>}>
        <p className="text-[14px] text-ink-2">Copie agora e coloque no assistente. Por segurança, ela não aparece de novo.</p>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-sunken p-3">
          <code className="num min-w-0 flex-1 text-[13px] break-all">{created}</code>
          <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(created ?? ""); setCopied(true); }}>
            <Copy className="size-4" />{copied ? "Copiada" : "Copiar"}
          </Button>
        </div>
      </Sheet>
    </Section>
  );
}

function DeleteAccount({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const del = useAction(() => api("/account/delete", { body: { confirm: "EXCLUIR" } }));
  useEffect(() => { if (open) setText(""); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Excluir conta" footer={
      <Button size="lg" variant="danger" disabled={text !== "EXCLUIR"} loading={del.isPending} onClick={() => del.mutate(undefined, { onSuccess: () => { qc.clear(); navigate("/entrar"); } })}>
        Excluir conta e todos os dados
      </Button>
    }>
      <div className="space-y-4">
        <p className="text-[14px] text-ink-2">Contas, cartões, lançamentos, tarefas, lembretes e chaves do assistente são apagados na hora. Não dá para desfazer. Se quiser guardar uma cópia, exporte os dados antes.</p>
        <Field label='Digite EXCLUIR para confirmar'><Input value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" /></Field>
        <ErrorNote error={del.error} />
      </div>
    </Sheet>
  );
}

export function PrivacyPage() {
  return (
    <article className="mx-auto max-w-[68ch] px-4 py-10 text-[15.5px] leading-relaxed text-ink-2 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-[18px] [&_h2]:font-bold [&_h2]:text-ink">
      <Link to="/" className="-my-3 inline-flex h-11 items-center text-[14px] font-semibold text-ink-2 hover:text-ink active:text-ink">← Voltar</Link>
      <h1 className="mt-4 text-[30px] font-extrabold tracking-[-0.03em] text-ink">Política de privacidade</h1>
      <p className="mt-2 text-[14px]">Vida &amp; Finanças · atualizada em novembro de 2026</p>
      <h2>O que o app guarda</h2>
      <p>Nome, e-mail e a senha (guardada só como hash). E o que você mesmo registra: contas, cartões, lançamentos, contas a pagar, tarefas, compromissos, lembretes e prazos. Se você ativar notificações, guardamos o endereço técnico do aparelho para entregar os avisos.</p>
      <h2>O que o app nunca pede</h2>
      <p>Senha de banco, acesso a conta bancária, número completo de cartão ou qualquer credencial financeira. O app é um organizador manual: não movimenta dinheiro e não se conecta a bancos.</p>
      <h2>Para que os dados são usados</h2>
      <p>Só para mostrar suas informações, fazer os cálculos (gasto por dia, faturas, "Posso comprar isso?") e mandar os avisos que você ativou. Não há anúncios, venda ou compartilhamento de dados com terceiros, nem análise de comportamento.</p>
      <h2>Onde ficam</h2>
      <p>Na infraestrutura da Cloudflare (servidor e banco de dados), com acesso por conexão criptografada. A chave usada pelo assistente no WhatsApp grava apenas na sua conta e pode ser revogada a qualquer momento em Ajustes.</p>
      <h2>Seus direitos</h2>
      <p>Em Ajustes você pode exportar todos os seus dados em um arquivo e excluir a conta. A exclusão apaga tudo na hora, de forma definitiva.</p>
      <h2>Contato</h2>
      <p>Dúvidas sobre privacidade: fale com o responsável pelo app pelo e-mail informado na página da loja.</p>
    </article>
  );
}
