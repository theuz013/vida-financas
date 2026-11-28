import { useEffect, useRef, useState } from "react";
import { SectionTabs } from "@/components/ui";
import { Navigate, NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Copy, Plus, Repeat, Share2, ShieldCheck, ShoppingCart, UserRound } from "lucide-react";
import {
  api,
  useAccounts,
  useAction,
  useHouse,
  useHouseBills,
  useHouseEvents,
  useHouseSummary,
  useHouseTasks,
  useShoppingList,
  useShoppingLists,
  type ShoppingList,
  type CalEvent,
  type HouseBill,
  type HouseData,
  type HouseMember,
  type HouseTask,
} from "@/lib/api";
import { centsToInput, formatBRL, localToday, longDate, parseBRL, relativeDay, shortDate } from "@/lib/format";
import {
  Button,
  Card,
  Collapse,
  Chip,
  Empty,
  ErrorNote,
  Field,
  IconBubble,
  Input,
  List,
  Money,
  MoneyInput,
  PageHeader,
  Row,
  Section,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  cx,
} from "@/components/ui";
import { usePlusAction } from "@/components/Layout";
import { useToast } from "@/components/Toast";
import { Toggle } from "./Life";

type Ctx = { house: NonNullable<HouseData["household"]>; me: HouseMember; members: HouseMember[]; invite: HouseData["invite"] };
const useHouseCtx = () => useOutletContext<Ctx>();

/* ===================== Estrutura ===================== */

export function HouseLayout() {
  const { data, isLoading } = useHouse();
  if (isLoading || !data) return <Skeleton className="h-60" />;
  if (!data.household || !data.me) return <HouseSetup />;
  const ctx: Ctx = { house: data.household, me: data.me, members: data.members ?? [], invite: data.invite ?? null };
  const tabs = [
    data.me.permissions.finance && { to: "/casa/contas", label: "Contas" },
    { to: "/casa/tarefas", label: "Tarefas" },
    { to: "/casa/agenda", label: "Agenda" },
    { to: "/casa/compras", label: "Compras" },
    { to: "/casa/membros", label: "Membros" },
  ].filter(Boolean) as { to: string; label: string }[];
  return (
    <div>
      <PageHeader title={data.household.name} subtitle={`${ctx.members.length} ${ctx.members.length === 1 ? "pessoa" : "pessoas"} · você é ${data.me.role === "admin" ? "administrador" : "membro"}`} />
      <SectionTabs label="Seções da casa">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cx("hit h-10 shrink-0 snap-start rounded-full px-4 text-[14px] leading-10 font-semibold transition-colors", isActive ? "bg-accent text-on-accent" : "bg-sunken text-ink-2 hover:text-ink active:text-ink")
            }
          >
            {t.label}
          </NavLink>
        ))}
      </SectionTabs>
      <Outlet context={ctx} />
    </div>
  );
}

export function HouseIndex() {
  const { data } = useHouse();
  if (!data) return null;
  return <Navigate to={data.me?.permissions.finance ? "/casa/contas" : "/casa/tarefas"} replace />;
}

/** Sem casa ainda: criar (vira administrador) ou entrar com código. */
function HouseSetup() {
  const [name, setName] = useState("Casa");
  const [code, setCode] = useState("");
  const create = useAction(() => api("/household", { body: { name } }));
  const join = useAction(() => api("/household/join", { body: { code } }));
  return (
    <div>
      <PageHeader title="Casa" subtitle="Contas, tarefas, agenda e lista de compras da casa, com cada pessoa no seu login." />
      <Card className="space-y-4 px-5 py-5">
        <div>
          <h2 className="text-[17px] font-bold tracking-[-0.01em]">Criar a casa</h2>
          <p className="mt-1 text-[14px] text-ink-2">Você vira o administrador e convida os outros com um código.</p>
        </div>
        <Field label="Nome da casa">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Casa" />
        </Field>
        <ErrorNote error={create.error} />
        <Button size="lg" loading={create.isPending} onClick={() => create.mutate()} disabled={!name.trim()}>
          Criar casa
        </Button>
      </Card>
      <Section title="Recebeu um código?">
        <Card className="space-y-4 px-5 py-5">
          <Field label="Código de convite" hint="6 letras e números, válido por 7 dias.">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} autoCapitalize="characters" autoComplete="off" className="num text-center text-[22px] font-bold tracking-[0.3em]" placeholder="ABC123" />
          </Field>
          <ErrorNote error={join.error} />
          <Button size="lg" variant="secondary" loading={join.isPending} onClick={() => join.mutate()} disabled={code.length !== 6}>
            Entrar na casa
          </Button>
        </Card>
      </Section>
    </div>
  );
}

/* ===================== Contas da casa ===================== */

export function HouseBillsPage() {
  const { me } = useHouseCtx();
  const [tab, setTab] = useState<"pending" | "paid">("pending");
  const { data: bills, isLoading } = useHouseBills(tab, me.permissions.finance);
  const { data: sum } = useHouseSummary(me.permissions.finance);
  const [editing, setEditing] = useState<HouseBill | "new" | null>(null);
  const [paying, setPaying] = useState<HouseBill | null>(null);
  const today = localToday();
  usePlusAction(me.permissions.finance ? "Nova conta da casa" : null, () => setEditing("new"));
  if (!me.permissions.finance) return <Empty title="Sem acesso às finanças da casa." hint="O administrador pode liberar para você em Membros." />;

  return (
    <div>
      {sum ? (
        <Card className="px-5 py-4">
          <p className="text-[14px] font-semibold text-ink-2">Contas da casa neste mês</p>
          <p className="num mt-1 text-[26px] font-extrabold tracking-[-0.03em]">{formatBRL(sum.total)}</p>
          <dl className="num mt-3 space-y-2 border-t border-line pt-3 text-[14px]">
            <div className="flex justify-between"><dt className="text-ink-2">Já pago</dt><dd className="font-semibold text-good">{formatBRL(sum.paid)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">A pagar</dt><dd className="font-semibold">{formatBRL(sum.pending)}</dd></div>
            {sum.byMember.map((m) => (
              <div key={m.userId} className="flex justify-between"><dt className="text-ink-2">Pago por {m.name}</dt><dd className="font-semibold">{formatBRL(m.total)}</dd></div>
            ))}
          </dl>
          {sum.unknown ? <p className="mt-3 text-[13px] text-warn">{sum.unknown === 1 ? "1 conta" : `${sum.unknown} contas`} com valor a confirmar.</p> : null}
        </Card>
      ) : <Skeleton className="h-36" />}

      <Segmented className="mt-6 mb-4" value={tab} onChange={setTab} options={[{ value: "pending", label: "A pagar" }, { value: "paid", label: "Pagas" }]} />
      {isLoading ? <Skeleton className="h-40" /> : !bills?.length ? (
        <Empty title={tab === "pending" ? "Nenhuma conta da casa a pagar." : "Nenhuma conta paga ainda."} hint={tab === "pending" ? "Aluguel, condomínio, água, luz, internet: cadastre e todos da casa veem quando vence e quem pagou." : undefined} />
      ) : (
        <List>
          {bills.map((b) => {
            const late = b.status === "pending" && b.dueDate < today;
            return (
              <Row
                key={b.id}
                onClick={() => setEditing(b)}
                leading={<IconBubble tone={late ? "bad" : b.status === "paid" ? "good" : "neutral"}><Repeat /></IconBubble>}
                title={b.name}
                subtitle={b.status === "paid" ? `Pago por ${b.paidByName ?? "?"} · venceu ${shortDate(b.dueDate)}` : `${late ? "Venceu" : "Vence"} ${shortDate(b.dueDate)}${b.recurrence === "monthly" ? " · todo mês" : b.recurrence === "yearly" ? " · todo ano" : ""}`}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    {b.amount != null ? <Money cents={b.amount} className="text-[15px] font-semibold" /> : <span className="text-[13px] text-ink-2">a confirmar</span>}
                    {b.status === "paid" ? <Chip tone="good">Paga</Chip> : late ? <Chip tone="bad">Vencida</Chip> : b.dueDate === today ? <Chip tone="warn">Hoje</Chip> : <span className="text-[12.5px] text-ink-2">{relativeDay(b.dueDate, today)}</span>}
                  </div>
                }
              />
            );
          })}
        </List>
      )}
      <HouseBillSheet value={editing} onClose={() => setEditing(null)} onPay={(b) => { setEditing(null); setPaying(b); }} />
      <PayHouseBill bill={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

function HouseBillSheet({ value, onClose, onPay }: { value: HouseBill | "new" | null; onClose: () => void; onPay: (b: HouseBill) => void }) {
  const bill = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(localToday());
  const [recurrence, setRecurrence] = useState<HouseBill["recurrence"]>("monthly");
  useEffect(() => {
    if (!value) return;
    setName(bill?.name ?? "");
    setAmount(centsToInput(bill?.amount));
    setDueDate(bill?.dueDate ?? localToday());
    setRecurrence(bill?.recurrence ?? "monthly");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(() => {
    const body = { name, amount: amount ? parseBRL(amount) : null, dueDate, recurrence };
    return bill ? api(`/household/bills/${bill.id}`, { method: "PATCH", body }) : api("/household/bills", { body });
  });
  const remove = useAction(() => api(`/household/bills/${bill!.id}`, { method: "DELETE" }));
  const unpay = useAction(() => api(`/household/bills/${bill!.id}/unpay`, { body: {} }));
  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={bill ? bill.name : "Nova conta da casa"}
      footer={
        <div className="flex flex-wrap gap-2">
          {bill ? <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm("Apagar esta conta da casa para todos?") && remove.mutate(undefined, { onSuccess: onClose })}>Apagar</Button> : null}
          {bill?.status === "pending" ? <Button variant="secondary" onClick={() => onPay(bill)}>Pagar</Button> : null}
          {bill?.status === "paid" ? <Button variant="secondary" loading={unpay.isPending} onClick={() => unpay.mutate(undefined, { onSuccess: onClose })}>Desfazer pagamento</Button> : null}
          <Button size="lg" className="min-w-40 flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {bill?.status === "paid" ? <p className="rounded-xl bg-good-soft px-3.5 py-2.5 text-[14px] font-medium text-good">Paga por {bill.paidByName ?? "?"}{bill.paidAt ? ` em ${new Date(bill.paidAt).toLocaleDateString("pt-BR")}` : ""}.</p> : null}
        <Field label="Nome"><Input autoFocus={!bill} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: condomínio" /></Field>
        <Field label="Valor" hint="Em branco se muda todo mês (água, luz)."><MoneyInput value={amount} onChange={setAmount} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vencimento"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="Repete">
            <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as HouseBill["recurrence"])}>
              <option value="monthly">Todo mês</option>
              <option value="yearly">Todo ano</option>
              <option value="none">Não repete</option>
            </Select>
          </Field>
        </div>
        <ErrorNote error={save.error ?? remove.error ?? unpay.error} />
      </div>
    </Sheet>
  );
}

/** Pagar conta da casa: quem pagou e, se foi você, se entra nas suas finanças. */
function PayHouseBill({ bill, onClose }: { bill: HouseBill | null; onClose: () => void }) {
  const { me, members } = useHouseCtx();
  const { data: accounts = [] } = useAccounts();
  const [paidBy, setPaidBy] = useState(me.userId);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const toast = useToast();
  useEffect(() => {
    if (!bill) return;
    setPaidBy(me.userId);
    setAmount(centsToInput(bill.amount));
    setAccountId("");
  }, [bill]); // eslint-disable-line react-hooks/exhaustive-deps
  const pay = useAction(() => api(`/household/bills/${bill!.id}/pay`, { body: { paidBy, amount: parseBRL(amount) ?? undefined, accountId: paidBy === me.userId && accountId ? accountId : undefined } }));
  const unpay = useAction((id: string) => api(`/household/bills/${id}/unpay`, { body: {} }));
  return (
    <Sheet
      open={bill !== null}
      onClose={onClose}
      title={bill ? `Pagar ${bill.name}` : "Pagar"}
      footer={
        <Button
          size="lg"
          loading={pay.isPending}
          onClick={() =>
            pay.mutate(undefined, {
              onSuccess: () => {
                const b = bill!;
                onClose();
                toast(`${b.name} paga.`, { label: "Desfazer", run: () => unpay.mutateAsync(b.id) });
              },
            })
          }
        >
          Marcar como paga
        </Button>
      }
    >
      {bill ? (
        <div className="space-y-4">
          <Field label="Quem pagou">
            <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {members.filter((m) => !m.isChild).map((m) => <option key={m.userId} value={m.userId}>{m.userId === me.userId ? `${m.name} (você)` : m.name}</option>)}
            </Select>
          </Field>
          <Field label="Valor pago" hint={bill.amount == null ? "Valor variável: informe o desta vez." : undefined}>
            <MoneyInput value={amount} onChange={setAmount} autoFocus={bill.amount == null} />
          </Field>
          {paidBy === me.userId ? (
            <Field label="Lançar também nas suas finanças" hint="Opcional. Sai da conta escolhida e entra no seu gasto por dia.">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Não lançar</option>
                {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.kind === "card" ? `${a.name} (crédito)` : a.name}</option>)}
              </Select>
            </Field>
          ) : null}
          <ErrorNote error={pay.error} />
        </div>
      ) : null}
    </Sheet>
  );
}

/* ===================== Tarefas da casa ===================== */

export function HouseTasksPage() {
  const { me, members } = useHouseCtx();
  const { data: tasks, isLoading } = useHouseTasks();
  const [editing, setEditing] = useState<HouseTask | "new" | null>(null);
  const [showDone, setShowDone] = useState(false);
  const today = localToday();
  const canCreate = me.permissions.createTasks;
  usePlusAction(canCreate ? "Nova tarefa da casa" : null, () => setEditing("new"));

  const open = (tasks ?? []).filter((t) => !t.done);
  const groups: [string, HouseTask[]][] = [
    ["Para você", open.filter((t) => t.assigneeId === me.userId)],
    ["Sem responsável", open.filter((t) => !t.assigneeId)],
    ["Dos outros", open.filter((t) => t.assigneeId && t.assigneeId !== me.userId)],
  ];
  const done = (tasks ?? []).filter((t) => t.done);

  if (isLoading) return <Skeleton className="h-60" />;
  return (
    <div>
      {canCreate ? <div className="mb-4 hidden justify-end md:flex"><Button size="sm" variant="secondary" onClick={() => setEditing("new")}>Nova tarefa</Button></div> : null}
      {open.length === 0 ? <Empty title="Nenhuma tarefa da casa aberta." hint={canCreate ? "Divida as tarefas: cada um vê as suas na tela Hoje." : undefined} /> : null}
      {groups.map(([title, list]) =>
        list.length ? (
          <Section key={title} title={title}>
            <List>{list.map((t) => <HouseTaskRow key={t.id} task={t} today={today} onOpen={canCreate ? () => setEditing(t) : undefined} />)}</List>
          </Section>
        ) : null,
      )}
      {done.length ? (
        <div className="mt-8">
          <button type="button" className="-my-3 inline-flex h-11 items-center px-1 text-[14px] font-semibold text-ink-2 hover:text-ink" onClick={() => setShowDone(!showDone)}>
            {showDone ? "Esconder concluídas" : `Ver concluídas (${done.length})`}
          </button>
          {showDone ? <List className="mt-2.5">{done.slice(0, 50).map((t) => <HouseTaskRow key={t.id} task={t} today={today} />)}</List> : null}
        </div>
      ) : null}
      <HouseTaskSheet value={editing} members={members} onClose={() => setEditing(null)} />
    </div>
  );
}

export function HouseTaskRow({ task, today, onOpen }: { task: HouseTask; today: string; onOpen?: () => void }) {
  const { data } = useHouse();
  const me = data?.me;
  const allowed = Boolean(me && (me.permissions.createTasks || !task.assigneeId || task.assigneeId === me.userId));
  const toggle = useAction(() => api(`/household/tasks/${task.id}`, { method: "PATCH", body: { done: !task.done } }));
  const late = task.dueDate && task.dueDate < today && !task.done;
  const meta = (
    <>
      <div className={cx("truncate text-[15px] font-medium", task.done && "text-ink-3 line-through")}>{task.title}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
        <span>{task.assigneeName ?? "Qualquer um"}</span>
        {task.dueDate ? <><span aria-hidden>·</span><span className={cx(late && "font-semibold text-bad")}>{late ? `Atrasada desde ${shortDate(task.dueDate)}` : relativeDay(task.dueDate, today)}</span></> : null}
      </div>
    </>
  );
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? "Reabrir tarefa" : "Concluir tarefa"}
        disabled={!allowed}
        onClick={() => toggle.mutate()}
        className={cx("hit-lg grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors disabled:opacity-40", task.done ? "border-good bg-good text-surface" : "border-line hover:border-ink-2")}
      >
        {task.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </button>
      {onOpen ? <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">{meta}</button> : <div className="min-w-0 flex-1">{meta}</div>}
      {task.priority === "high" && !task.done ? <Chip tone="warn">Alta</Chip> : null}
    </div>
  );
}

function HouseTaskSheet({ value, members, onClose }: { value: HouseTask | "new" | null; members: HouseMember[]; onClose: () => void }) {
  const t = value && value !== "new" ? value : null;
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<HouseTask["priority"]>("normal");
  useEffect(() => {
    if (!value) return;
    setTitle(t?.title ?? "");
    setDueDate(t?.dueDate ?? localToday());
    setAssigneeId(t?.assigneeId ?? "");
    setPriority(t?.priority ?? "normal");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(() => {
    const body = { title, dueDate: dueDate || null, assigneeId: assigneeId || null, priority };
    return t ? api(`/household/tasks/${t.id}`, { method: "PATCH", body }) : api("/household/tasks", { body });
  });
  const remove = useAction(() => api(`/household/tasks/${t!.id}`, { method: "DELETE" }));
  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={t ? "Editar tarefa da casa" : "Nova tarefa da casa"}
      footer={
        <div className="flex gap-2">
          {t ? <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm("Apagar esta tarefa para todos?") && remove.mutate(undefined, { onSuccess: onClose })}>Apagar</Button> : null}
          <Button size="lg" className="flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Tarefa"><Input autoFocus={!t} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: levar o lixo" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prazo"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="Prioridade">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as HouseTask["priority"])}>
              <option value="high">Alta</option>
              <option value="normal">Normal</option>
              <option value="low">Baixa</option>
            </Select>
          </Field>
        </div>
        <Field label="Responsável" hint="A pessoa recebe um aviso e vê a tarefa na tela Hoje.">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Qualquer um</option>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </Select>
        </Field>
        <ErrorNote error={save.error} />
      </div>
    </Sheet>
  );
}

/* ===================== Agenda da casa ===================== */

export function HouseAgendaPage() {
  const { me } = useHouseCtx();
  const { data: events, isLoading } = useHouseEvents();
  const [editing, setEditing] = useState<CalEvent | "new" | null>(null);
  const today = localToday();
  const canCreate = me.permissions.createTasks;
  usePlusAction(canCreate ? "Novo compromisso da casa" : null, () => setEditing("new"));
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events ?? []) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  if (isLoading) return <Skeleton className="h-60" />;
  return (
    <div>
      {canCreate ? <div className="mb-4 hidden justify-end md:flex"><Button size="sm" variant="secondary" onClick={() => setEditing("new")}>Novo compromisso</Button></div> : null}
      {byDay.size === 0 ? <Empty title="Nenhum compromisso da casa." hint="Reunião de condomínio, visita técnica, entrega: todos da casa veem e recebem o lembrete." /> : null}
      {[...byDay.entries()].map(([day, list]) => (
        <Section key={day} title={day === today ? "Hoje" : relativeDay(day, today) === "amanhã" ? "Amanhã" : longDate(day)} className="[&_h2]:first-letter:uppercase">
          <List>
            {list.map((e) => (
              <Row key={e.id} onClick={canCreate ? () => setEditing(e) : undefined} leading={<IconBubble><Clock /></IconBubble>} title={e.title} subtitle={e.location ?? undefined} trailing={<span className="num text-[15px] font-semibold">{e.time ?? "Dia todo"}</span>} />
            ))}
          </List>
        </Section>
      ))}
      <HouseEventSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function HouseEventSheet({ value, onClose }: { value: CalEvent | "new" | null; onClose: () => void }) {
  const ev = value && value !== "new" ? value : null;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(localToday());
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [remind, setRemind] = useState("60");
  useEffect(() => {
    if (!value) return;
    setTitle(ev?.title ?? "");
    setDate(ev?.date ?? localToday());
    setTime(ev?.time ?? "");
    setLocation(ev?.location ?? "");
    setRemind(ev ? (ev.remindMinutes == null ? "" : String(ev.remindMinutes)) : "60");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(() => {
    const body = { title, date, time: time || null, location: location || null, remindMinutes: remind === "" ? null : Number(remind) };
    return ev ? api(`/household/events/${ev.id}`, { method: "PATCH", body }) : api("/household/events", { body });
  });
  const remove = useAction(() => api(`/household/events/${ev!.id}`, { method: "DELETE" }));
  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={ev ? "Editar compromisso da casa" : "Novo compromisso da casa"}
      footer={
        <div className="flex gap-2">
          {ev ? <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm("Apagar este compromisso para todos?") && remove.mutate(undefined, { onSuccess: onClose })}>Apagar</Button> : null}
          <Button size="lg" className="flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="O quê"><Input autoFocus={!ev} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: reunião de condomínio" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Field label="Onde"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Opcional" /></Field>
        <Field label="Lembrete para todos">
          <Select value={remind} onChange={(e) => setRemind(e.target.value)} disabled={!time}>
            <option value="">Sem lembrete</option>
            <option value="0">Na hora</option>
            <option value="30">30 min antes</option>
            <option value="60">1 hora antes</option>
            <option value="1440">1 dia antes</option>
          </Select>
        </Field>
        <ErrorNote error={save.error} />
      </div>
    </Sheet>
  );
}

/* ===================== Listas de compras (com data) ===================== */

const weekdayDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(Date.UTC(y, m - 1, day, 12)));
};

/** Lista das compras da casa: cada lista tem nome e data; tocar abre a lista com os itens. */
export function HouseShoppingPage() {
  const { me } = useHouseCtx();
  const { data: lists, isLoading } = useShoppingLists();
  const [creating, setCreating] = useState(false);
  const today = localToday();
  const can = me.permissions.shopping;
  usePlusAction(can ? "Nova lista de compras" : null, () => setCreating(true));
  const sorted = [...(lists ?? [])];
  const upcoming = sorted.filter((l) => l.date >= today);
  const past = sorted.filter((l) => l.date < today);

  return (
    <div>
      {can ? <div className="mb-4 hidden justify-end md:flex"><Button size="sm" variant="secondary" onClick={() => setCreating(true)}>Nova lista</Button></div> : (
        <p className="mb-5 rounded-xl bg-sunken px-3.5 py-2.5 text-[14px] text-ink-2">Você pode ver as listas. Para criar e marcar itens, peça permissão ao administrador.</p>
      )}
      {can ? (
        <Button size="lg" className="mb-6 w-full" onClick={() => setCreating(true)}>
          <Plus className="size-5" aria-hidden /> Nova lista de compras
        </Button>
      ) : null}
      {isLoading ? <Skeleton className="h-40" /> : sorted.length === 0 ? (
        <Empty title="Nenhuma lista de compras." hint="Crie uma lista com nome e data (ex.: Supermercado, sábado) e vá colocando os itens dentro dela." />
      ) : (
        <>
          {upcoming.length ? <Section title="Próximas"><ListCards lists={upcoming} /></Section> : null}
          {past.length ? <Section title="Anteriores"><ListCards lists={past} /></Section> : null}
        </>
      )}
      <NewListSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function ListCards({ lists }: { lists: ShoppingList[] }) {
  return (
    <List>
      {lists.map((l) => (
        <Row
          key={l.id}
          to={`/casa/compras/${l.id}`}
          leading={<IconBubble><ShoppingCart /></IconBubble>}
          title={l.name}
          subtitle={`${weekdayDate(l.date)} · ${l.total === 0 ? "vazia" : l.open === 0 ? "tudo no carrinho" : `${l.open} ${l.open === 1 ? "item" : "itens"} para comprar`}`}
        />
      ))}
    </List>
  );
}

function NewListSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("Supermercado");
  const [date, setDate] = useState(localToday());
  const navigate = useNavigate();
  useEffect(() => {
    if (open) {
      setName("Supermercado");
      setDate(localToday());
    }
  }, [open]);
  const create = useAction(() => api<{ id: string }>("/household/shopping-lists", { body: { name: name.trim(), date } }));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nova lista de compras"
      footer={
        <Button
          size="lg"
          loading={create.isPending}
          disabled={!name.trim() || !date}
          onClick={() => create.mutate(undefined, { onSuccess: (l) => { onClose(); navigate(`/casa/compras/${l.id}`); } })}
        >
          Criar lista
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nome da lista">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Supermercado" />
        </Field>
        <Field label="Data da compra">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <ErrorNote error={create.error} />
      </div>
    </Sheet>
  );
}

/** Uma lista aberta: itens dentro, campo e botão "Adicionar" visíveis. */
export function HouseShoppingListPage() {
  const { listId = "" } = useParams();
  const { me } = useHouseCtx();
  const { data: list, isLoading } = useShoppingList(listId);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const can = me.permissions.shopping;
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  usePlusAction(can ? "Adicionar item" : null, () => input.current?.focus());

  const refresh = () => qc.invalidateQueries({ queryKey: ["household", "shopping-lists"] });
  const qc = useQueryClient();
  const add = useAction(() => api(`/household/shopping-lists/${listId}/items`, { body: { name: name.trim(), quantity: qty.trim() || null } }));
  const toggle = useAction(({ id, checked }: { id: string; checked: boolean }) => api(`/household/shopping-lists/${listId}/items/${id}`, { method: "PATCH", body: { checked } }));
  const remove = useAction((id: string) => api(`/household/shopping-lists/${listId}/items/${id}`, { method: "DELETE" }));
  const clear = useAction(() => api(`/household/shopping-lists/${listId}/clear`, { body: {} }));
  const drop = useAction(() => api(`/household/shopping-lists/${listId}`, { method: "DELETE" }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !can) return;
    add.mutate(undefined, { onSuccess: () => { setName(""); setQty(""); input.current?.focus(); refresh(); } });
  };

  if (isLoading || !list) return <Skeleton className="h-60" />;
  const open = list.items.filter((i) => !i.checked);
  const done = list.items.filter((i) => i.checked);

  return (
    <div>
      <PageHeader
        title={list.name}
        subtitle={weekdayDate(list.date)}
        back="/casa/compras"
        action={can ? <button type="button" onClick={() => setEditing(true)} className="-my-3 inline-flex h-11 items-center px-2 text-[14px] font-semibold text-ink-2 hover:text-ink active:text-ink">Editar</button> : undefined}
      />

      {can ? (
        <form onSubmit={submit} className="mb-6 space-y-2.5">
          <div className="grid grid-cols-[1fr_5.5rem] gap-2">
            <Input ref={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Item (ex.: leite)" aria-label="Item" enterKeyHint="done" />
            <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qtd." aria-label="Quantidade" />
          </div>
          <Button type="submit" size="lg" className="w-full" loading={add.isPending} disabled={!name.trim()}>
            <Plus className="size-5" aria-hidden /> Adicionar à lista
          </Button>
          <ErrorNote error={add.error} />
        </form>
      ) : (
        <p className="mb-6 rounded-xl bg-sunken px-3.5 py-2.5 text-[14px] text-ink-2">Você pode ver esta lista. Para adicionar e marcar itens, peça permissão ao administrador.</p>
      )}

      {list.items.length === 0 ? (
        <Empty title="Lista vazia." hint="Digite um item acima e toque em Adicionar à lista." />
      ) : (
        <>
          {open.length ? (
            <List>
              {open.map((i) => (
                <ShopRow key={i.id} name={i.name} qty={i.quantity} by={i.addedByName} checked={false} disabled={!can} onToggle={() => toggle.mutate({ id: i.id, checked: true }, { onSuccess: refresh })} onRemove={can ? () => remove.mutate(i.id, { onSuccess: refresh }) : undefined} />
              ))}
            </List>
          ) : <p className="px-1 text-[14px] text-ink-2">Tudo no carrinho.</p>}
          {done.length ? (
            <Section title="No carrinho" action={can ? <button type="button" onClick={() => clear.mutate(undefined, { onSuccess: refresh })} className="-my-3 inline-flex h-11 items-center text-[14px] font-semibold text-ink-2 hover:text-ink active:text-ink">Tirar todos</button> : undefined}>
              <List>
                {done.map((i) => (
                  <ShopRow key={i.id} name={i.name} qty={i.quantity} checked disabled={!can} onToggle={() => toggle.mutate({ id: i.id, checked: false }, { onSuccess: refresh })} />
                ))}
              </List>
            </Section>
          ) : null}
        </>
      )}

      {can ? (
        <div className="mt-10">
          <Button variant="danger" className="w-full" loading={drop.isPending} onClick={() => window.confirm("Apagar esta lista e os itens dela?") && drop.mutate(undefined, { onSuccess: () => navigate("/casa/compras") })}>
            Apagar lista
          </Button>
        </div>
      ) : null}
      <ListEditSheet open={editing} listId={listId} name={list.name} date={list.date} onClose={() => { setEditing(false); refresh(); qc.invalidateQueries({ queryKey: ["household", "shopping-lists", listId] }); }} />
    </div>
  );
}

function ListEditSheet({ open, listId, name: initialName, date: initialDate, onClose }: { open: boolean; listId: string; name: string; date: string; onClose: () => void }) {
  const [name, setName] = useState(initialName);
  const [date, setDate] = useState(initialDate);
  useEffect(() => {
    if (open) {
      setName(initialName);
      setDate(initialDate);
    }
  }, [open, initialName, initialDate]);
  const save = useAction(() => api(`/household/shopping-lists/${listId}`, { method: "PATCH", body: { name: name.trim(), date } }));
  return (
    <Sheet open={open} onClose={onClose} title="Editar lista" footer={<Button size="lg" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>}>
      <div className="space-y-4">
        <Field label="Nome da lista"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Data da compra"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <ErrorNote error={save.error} />
      </div>
    </Sheet>
  );
}

function ShopRow({ name, qty, by, checked, disabled, onToggle, onRemove }: { name: string; qty: string | null; by?: string | null; checked: boolean; disabled: boolean; onToggle: () => void; onRemove?: () => void }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={checked ? `Tirar ${name} do carrinho` : `Pôr ${name} no carrinho`}
        disabled={disabled}
        onClick={onToggle}
        className={cx("hit-lg grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors disabled:opacity-40", checked ? "border-good bg-good text-surface" : "border-line hover:border-ink-2")}
      >
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cx("truncate text-[15px] font-medium", checked && "text-ink-3 line-through")}>{name}{qty ? <span className="font-normal text-ink-2"> · {qty}</span> : null}</div>
        {by ? <div className="text-[12.5px] text-ink-3">por {by}</div> : null}
      </div>
      {onRemove ? <button type="button" onClick={onRemove} className="hit h-10 rounded-xl px-3 text-[13px] font-semibold text-ink-2 hover:bg-sunken active:bg-sunken">Tirar</button> : null}
    </div>
  );
}

/* ===================== Membros e convites ===================== */

export function HouseMembersPage() {
  const { house, me, members, invite } = useHouseCtx();
  const [editing, setEditing] = useState<HouseMember | null>(null);
  const [renaming, setRenaming] = useState(false);
  const navigate = useNavigate();
  const isAdmin = me.role === "admin";
  const leave = useAction(() => api("/household/leave", { body: {} }));
  const [inviting, setInviting] = useState(false);
  usePlusAction(isAdmin ? "Convidar" : null, () => {
    setInviting(true);
    setTimeout(() => document.getElementById("convite")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  });

  return (
    <div>
      <Section title="Pessoas">
        <List>
          {members.map((m) => (
            <Row
              key={m.userId}
              onClick={isAdmin && m.userId !== me.userId ? () => setEditing(m) : undefined}
              leading={<IconBubble>{m.role === "admin" ? <ShieldCheck /> : <UserRound />}</IconBubble>}
              title={m.userId === me.userId ? `${m.name} (você)` : m.name}
              subtitle={[m.role === "admin" ? "Administrador" : m.isChild ? "Criança" : "Membro", m.role !== "admin" ? permSummary(m) : null].filter(Boolean).join(" · ")}
            />
          ))}
        </List>
      </Section>
      {isAdmin ? (
        <Section title="Convite">
          <Collapse
            id="convite"
            open={inviting}
            onToggle={() => setInviting(!inviting)}
            title={invite ? "Código de convite ativo" : "Convidar para a casa"}
            subtitle={invite ? `Vale até ${new Date(invite.expiresAt).toLocaleDateString("pt-BR")}` : "Gere um código de 6 caracteres"}
          >
            <InviteCard invite={invite ?? null} houseName={house.name} />
          </Collapse>
        </Section>
      ) : null}
      <Section title="Casa">
        <List>
          {isAdmin ? <Row onClick={() => setRenaming(true)} title="Mudar o nome da casa" subtitle={house.name} /> : null}
          <Row
            onClick={() => {
              if (!window.confirm(members.length === 1 ? "Você é a única pessoa da casa. Sair apaga a casa e os dados dela. Continuar?" : "Sair da casa? Você perde o acesso aos dados dela na hora; eles continuam para os outros.")) return;
              leave.mutate(undefined, { onSuccess: () => navigate("/casa") });
            }}
            title={<span className="text-bad">Sair da casa</span>}
          />
        </List>
        <ErrorNote error={leave.error} />
      </Section>
      <MemberSheet member={editing} onClose={() => setEditing(null)} />
      <RenameSheet open={renaming} current={house.name} onClose={() => setRenaming(false)} />
    </div>
  );
}

function permSummary(m: HouseMember) {
  const on = [m.permissions.finance && "finanças", m.permissions.createTasks && "cria tarefas", m.permissions.shopping && "compras"].filter(Boolean);
  return on.length ? on.join(", ") : "só vê e faz as próprias tarefas";
}

function InviteCard({ invite, houseName }: { invite: { code: string; expiresAt: number } | null; houseName: string }) {
  const create = useAction(() => api("/household/invite", { body: {} }));
  const revoke = useAction(() => api("/household/invite", { method: "DELETE" }));
  const [copied, setCopied] = useState(false);
  const message = invite ? `Entre na ${houseName} no Vida & Finanças com o código ${invite.code} (vale até ${new Date(invite.expiresAt).toLocaleDateString("pt-BR")}): ${location.origin}/entrar` : "";
  const share = async () => {
    if (!invite) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: houseName, text: message });
        return;
      } catch {
        /* cancelado: cai para copiar */
      }
    }
    await navigator.clipboard?.writeText(message);
    setCopied(true);
  };
  return (
    <div>
      {invite ? (
        <>
          <p className="mt-1 text-[14px] text-ink-2">Quem for entrar digita este código ao criar a conta (ou em Casa, se já tiver conta).</p>
          <p className="num mt-4 rounded-xl bg-sunken py-4 text-center text-[32px] font-extrabold tracking-[0.25em]" aria-label={`Código ${invite.code.split("").join(" ")}`}>{invite.code}</p>
          <p className="mt-2 text-center text-[13px] text-ink-2">Vale até {new Date(invite.expiresAt).toLocaleDateString("pt-BR")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={share}><Share2 className="size-4" />{copied ? "Copiado" : "Enviar"}</Button>
            <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(invite.code); setCopied(true); }}><Copy className="size-4" />Copiar</Button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="ghost" loading={create.isPending} onClick={() => window.confirm("Gerar um código novo? O atual para de funcionar.") && create.mutate()}>Gerar novo</Button>
            <Button variant="ghost" className="text-bad" loading={revoke.isPending} onClick={() => window.confirm("Cancelar o código? Ninguém mais entra com ele.") && revoke.mutate()}>Cancelar código</Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-[14px] text-ink-2">Gere um código de 6 caracteres, válido por 7 dias. Você pode cancelar quando quiser.</p>
          <Button className="mt-4 w-full" loading={create.isPending} onClick={() => create.mutate()}>Gerar código de convite</Button>
        </>
      )}
      <ErrorNote error={create.error ?? revoke.error} />
    </div>
  );
}

function MemberSheet({ member, onClose }: { member: HouseMember | null; onClose: () => void }) {
  const [f, setF] = useState({ role: "member" as HouseMember["role"], isChild: false, canFinance: true, canCreateTasks: true, canShopping: true });
  useEffect(() => {
    if (member) setF({ role: member.role, isChild: member.isChild, canFinance: member.canFinance, canCreateTasks: member.canCreateTasks, canShopping: member.canShopping });
  }, [member]);
  const save = useAction(() => api(`/household/members/${member!.userId}`, { method: "PATCH", body: f }));
  const remove = useAction(() => api(`/household/members/${member!.userId}`, { method: "DELETE" }));
  const admin = f.role === "admin";
  return (
    <Sheet
      open={member !== null}
      onClose={onClose}
      title={member?.name ?? ""}
      footer={
        <div className="flex gap-2">
          <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm(`Remover ${member?.name} da casa? Perde o acesso na hora; os dados da casa ficam.`) && remove.mutate(undefined, { onSuccess: onClose })}>Remover</Button>
          <Button size="lg" className="flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {member?.email ? <p className="text-[14px] text-ink-2">{member.email}</p> : null}
        <Toggle label="Administrador" checked={admin} onChange={(v) => setF({ ...f, role: v ? "admin" : "member" })} />
        {admin ? (
          <p className="px-1 text-[13px] text-ink-2">Administrador pode tudo: membros, convites, finanças, tarefas, agenda e compras.</p>
        ) : (
          <>
            <Toggle label="É criança" checked={f.isChild} onChange={(v) => setF({ ...f, isChild: v, canFinance: v ? false : f.canFinance })} />
            <p className="px-1 pt-2 text-[13px] font-semibold text-ink-2">Pode</p>
            <Toggle label="Ver e editar as finanças da casa" checked={f.canFinance && !f.isChild} onChange={(v) => setF({ ...f, canFinance: v })} />
            {f.isChild ? <p className="-mt-1 px-1 text-[12.5px] text-ink-3">Finanças ficam fechadas para criança.</p> : null}
            <Toggle label="Criar tarefas e compromissos" checked={f.canCreateTasks} onChange={(v) => setF({ ...f, canCreateTasks: v })} />
            <Toggle label="Mexer na lista de compras" checked={f.canShopping} onChange={(v) => setF({ ...f, canShopping: v })} />
            <p className="px-1 text-[12.5px] text-ink-3">Todo membro vê as tarefas e compromissos da casa e faz as próprias tarefas.</p>
          </>
        )}
        <ErrorNote error={save.error ?? remove.error} />
      </div>
    </Sheet>
  );
}

function RenameSheet({ open, current, onClose }: { open: boolean; current: string; onClose: () => void }) {
  const [name, setName] = useState(current);
  useEffect(() => { if (open) setName(current); }, [open, current]);
  const save = useAction(() => api("/household", { method: "PATCH", body: { name } }));
  return (
    <Sheet open={open} onClose={onClose} title="Nome da casa" footer={<Button size="lg" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>}>
      <Field label="Nome"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <ErrorNote error={save.error} />
    </Sheet>
  );
}
