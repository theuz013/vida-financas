import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { Clock, Hourglass, Plus, Repeat } from "lucide-react";
import { nextMonthlyOccurrence } from "@shared/dates";
import { api, useAction, useAreas, useList, usePendencias, type CalEvent, type Deadline, type Reminder, type Task } from "@/lib/api";
import { localToday, longDate, relativeDay, shortDate } from "@/lib/format";
import { Button, Card, Chip, Empty, ErrorNote, Field, IconBubble, Input, List, PageHeader, Row, Section, Select, Sheet, Skeleton, cx } from "@/components/ui";
import { TaskRow } from "./Today";
import { usePlusAction, useQuickAdd } from "@/components/Layout";

const tabs = [
  { to: "/vida", label: "Tarefas", end: true },
  { to: "/vida/agenda", label: "Agenda" },
  { to: "/vida/lembretes", label: "Lembretes" },
  { to: "/vida/prazos", label: "Prazos" },
  { to: "/vida/frentes", label: "Frentes" },
];

export function LifeLayout() {
  return (
    <div>
      <PageHeader title="Vida" />
      <nav className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" aria-label="Seções">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cx("hit h-10 shrink-0 rounded-full px-4 text-[14px] leading-10 font-semibold transition-colors", isActive ? "bg-accent text-on-accent" : "bg-sunken text-ink-2 hover:text-ink")
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button size="sm" variant="secondary" onClick={onClick}>
      <Plus className="size-4" aria-hidden />
      {children}
    </Button>
  );
}

function AreaSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: areas = [] } = useAreas();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sem frente</option>
      {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </Select>
  );
}

/* ===================== Tarefas ===================== */

export function TasksPage() {
  const { data: tasks, isLoading } = useList<Task>("tasks");
  const { data: areas = [] } = useAreas();
  const quickAdd = useQuickAdd();
  const [editing, setEditing] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);
  usePlusAction("Nova tarefa", () => quickAdd({ mode: "task" }));
  const today = localToday();
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const withArea = (t: Task) => ({ ...t, areaName: t.areaId ? areaName.get(t.areaId) : null });

  const open = (tasks ?? []).filter((t) => !t.done).map(withArea);
  const groups: [string, Task[]][] = [
    ["Atrasadas", open.filter((t) => t.dueDate && t.dueDate < today)],
    ["Hoje", open.filter((t) => t.dueDate === today)],
    ["Próximas", open.filter((t) => t.dueDate && t.dueDate > today)],
    ["Sem prazo", open.filter((t) => !t.dueDate)],
  ];
  const done = (tasks ?? []).filter((t) => t.done).map(withArea);

  if (isLoading) return <Skeleton className="h-60" />;
  return (
    <div>
      <div className="mb-4 hidden justify-end md:flex"><AddButton onClick={() => quickAdd({ mode: "task" })}>Nova tarefa</AddButton></div>
      {open.length === 0 ? <Empty title="Nenhuma tarefa aberta." hint="Anote o que precisa fazer e em qual frente: casa, trabalho, carro ou pessoal." /> : null}
      {groups.map(([title, list]) =>
        list.length ? (
          <Section key={title} title={title}>
            <List>
              {list.map((t) => <TaskRow key={t.id} task={t} today={today} onOpen={() => setEditing(t)} />)}
            </List>
          </Section>
        ) : null,
      )}
      {done.length ? (
        <div className="mt-8">
          <button type="button" className="px-1 text-[14px] font-semibold text-ink-2 hover:text-ink" onClick={() => setShowDone(!showDone)}>
            {showDone ? "Esconder concluídas" : `Ver concluídas (${done.length})`}
          </button>
          {showDone ? <List className="mt-2.5">{done.slice(0, 50).map((t) => <TaskRow key={t.id} task={t} today={today} onOpen={() => setEditing(t)} />)}</List> : null}
        </div>
      ) : null}
      <TaskSheet task={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [areaId, setAreaId] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [remindAt, setRemindAt] = useState("");
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDueDate(task.dueDate ?? "");
    setAreaId(task.areaId ?? "");
    setPriority(task.priority);
    setRemindAt(task.remindAt ? toLocalInput(task.remindAt) : "");
  }, [task]);
  const save = useAction(() =>
    api(`/tasks/${task!.id}`, {
      method: "PATCH",
      body: { title, dueDate: dueDate || null, areaId: areaId || null, priority, remindAt: remindAt ? new Date(remindAt).getTime() : null },
    }),
  );
  const remove = useAction(() => api(`/tasks/${task!.id}`, { method: "DELETE" }));
  return (
    <Sheet
      open={task !== null}
      onClose={onClose}
      title="Editar tarefa"
      footer={
        <div className="flex gap-2">
          <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm("Apagar esta tarefa?") && remove.mutate(undefined, { onSuccess: onClose })}>Apagar</Button>
          <Button size="lg" className="flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Tarefa"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prazo"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="Frente"><AreaSelect value={areaId} onChange={setAreaId} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prioridade">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])}>
              <option value="high">Alta</option>
              <option value="normal">Normal</option>
              <option value="low">Baixa</option>
            </Select>
          </Field>
          <Field label="Lembrar em" hint="Notificação neste horário."><Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} /></Field>
        </div>
        <ErrorNote error={save.error} />
      </div>
    </Sheet>
  );
}

function toLocalInput(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ===================== Agenda (compromissos) ===================== */

const remindOptions = [
  { v: "", l: "Sem lembrete" },
  { v: "0", l: "Na hora" },
  { v: "15", l: "15 min antes" },
  { v: "30", l: "30 min antes" },
  { v: "60", l: "1 hora antes" },
  { v: "120", l: "2 horas antes" },
  { v: "1440", l: "1 dia antes" },
];

export function AgendaPage() {
  const { data: events, isLoading } = useList<CalEvent>("events");
  const [editing, setEditing] = useState<CalEvent | "new" | null>(null);
  usePlusAction("Novo compromisso", () => setEditing("new"));
  const today = localToday();
  const upcoming = (events ?? []).filter((e) => e.date >= today);
  const byDay = new Map<string, CalEvent[]>();
  for (const e of upcoming) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  if (isLoading) return <Skeleton className="h-60" />;
  return (
    <div>
      <div className="mb-4 hidden justify-end md:flex"><AddButton onClick={() => setEditing("new")}>Novo compromisso</AddButton></div>
      {upcoming.length === 0 ? <Empty title="Nenhum compromisso marcado." hint="Reuniões, consultas e visitas, com aviso antes da hora." /> : null}
      {[...byDay.entries()].map(([day, list]) => (
        <Section key={day} title={day === today ? "Hoje" : relativeDay(day, today) === "amanhã" ? "Amanhã" : longDate(day)} className="[&_h2]:first-letter:uppercase">
          <List>
            {list.map((e) => (
              <Row
                key={e.id}
                onClick={() => setEditing(e)}
                leading={<IconBubble><Clock /></IconBubble>}
                title={e.title}
                subtitle={[e.location, e.remindMinutes != null ? remindOptions.find((o) => o.v === String(e.remindMinutes))?.l ?? `${e.remindMinutes} min antes` : null].filter(Boolean).join(" · ") || undefined}
                trailing={<span className="num text-[15px] font-semibold">{e.time ?? "Dia todo"}</span>}
              />
            ))}
          </List>
        </Section>
      ))}
      <EventSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EventSheet({ value, onClose }: { value: CalEvent | "new" | null; onClose: () => void }) {
  const ev = value && value !== "new" ? value : null;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(localToday());
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [remind, setRemind] = useState("30");
  const [areaId, setAreaId] = useState("");
  useEffect(() => {
    if (!value) return;
    setTitle(ev?.title ?? "");
    setDate(ev?.date ?? localToday());
    setTime(ev?.time ?? "");
    setLocation(ev?.location ?? "");
    setRemind(ev ? (ev.remindMinutes == null ? "" : String(ev.remindMinutes)) : "30");
    setAreaId(ev?.areaId ?? "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(() => {
    const body = { title, date, time: time || null, location: location || null, remindMinutes: remind === "" ? null : Number(remind), areaId: areaId || null };
    return ev ? api(`/events/${ev.id}`, { method: "PATCH", body }) : api("/events", { body });
  });
  const remove = useAction(() => api(`/events/${ev!.id}`, { method: "DELETE" }));
  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={ev ? "Editar compromisso" : "Novo compromisso"}
      footer={
        <div className="flex gap-2">
          {ev ? <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm("Apagar este compromisso?") && remove.mutate(undefined, { onSuccess: onClose })}>Apagar</Button> : null}
          <Button size="lg" className="flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="O quê"><Input autoFocus={!ev} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: reunião com o cliente" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Field label="Onde"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Opcional" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lembrete">
            <Select value={remind} onChange={(e) => setRemind(e.target.value)} disabled={!time}>
              {remindOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </Select>
          </Field>
          <Field label="Frente"><AreaSelect value={areaId} onChange={setAreaId} /></Field>
        </div>
        {!time ? <p className="text-[13px] text-ink-3">Coloque a hora para receber o lembrete.</p> : null}
        <ErrorNote error={save.error} />
      </div>
    </Sheet>
  );
}

/* ===================== Lembretes recorrentes ===================== */

export function RemindersPage() {
  const { data: reminders, isLoading } = useList<Reminder>("reminders");
  const { data: areas = [] } = useAreas();
  const [editing, setEditing] = useState<Reminder | "new" | null>(null);
  usePlusAction("Novo lembrete", () => setEditing("new"));
  const today = localToday();
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const sorted = [...(reminders ?? [])].sort((a, b) => nextMonthlyOccurrence(a.dayOfMonth, today).localeCompare(nextMonthlyOccurrence(b.dayOfMonth, today)));

  if (isLoading) return <Skeleton className="h-60" />;
  return (
    <div>
      <div className="mb-4 hidden justify-end md:flex"><AddButton onClick={() => setEditing("new")}>Novo lembrete</AddButton></div>
      {sorted.length === 0 ? <Empty title="Nenhum lembrete recorrente." hint='Regras do tipo "todo dia 17: pagar a conta". O app avisa na véspera e no dia.' /> : (
        <List>
          {sorted.map((r) => {
            const next = nextMonthlyOccurrence(r.dayOfMonth, today);
            return (
              <Row
                key={r.id}
                onClick={() => setEditing(r)}
                leading={<IconBubble><Repeat /></IconBubble>}
                title={<span className={cx(!r.active && "text-ink-3")}>{r.title}</span>}
                subtitle={`Todo dia ${r.dayOfMonth}${r.areaId ? ` · ${areaName.get(r.areaId) ?? ""}` : ""}${r.notifyEve ? " · avisa na véspera" : ""}`}
                trailing={!r.active ? <Chip>Pausado</Chip> : next === today ? <Chip tone="warn">Hoje</Chip> : <span className="text-[13px] text-ink-2">{shortDate(next)}</span>}
              />
            );
          })}
        </List>
      )}
      <ReminderSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ReminderSheet({ value, onClose }: { value: Reminder | "new" | null; onClose: () => void }) {
  const r = value && value !== "new" ? value : null;
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [eve, setEve] = useState(true);
  const [active, setActive] = useState(true);
  const [areaId, setAreaId] = useState("");
  useEffect(() => {
    if (!value) return;
    setTitle(r?.title ?? "");
    setDay(r ? String(r.dayOfMonth) : "");
    setEve(r?.notifyEve ?? true);
    setActive(r?.active ?? true);
    setAreaId(r?.areaId ?? "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(() => {
    const body = { title, dayOfMonth: Number(day), notifyEve: eve, active, areaId: areaId || null };
    return r ? api(`/reminders/${r.id}`, { method: "PATCH", body }) : api("/reminders", { body });
  });
  const remove = useAction(() => api(`/reminders/${r!.id}`, { method: "DELETE" }));
  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={r ? "Editar lembrete" : "Novo lembrete"}
      footer={
        <div className="flex gap-2">
          {r ? <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm("Apagar este lembrete?") && remove.mutate(undefined, { onSuccess: onClose })}>Apagar</Button> : null}
          <Button size="lg" className="flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Lembrar de"><Input autoFocus={!r} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: ler o medidor de água" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Todo dia" hint="Dia 31 cai no último dia dos meses curtos.">
            <Input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="17" />
          </Field>
          <Field label="Frente"><AreaSelect value={areaId} onChange={setAreaId} /></Field>
        </div>
        <Toggle label="Avisar também na véspera" checked={eve} onChange={setEve} />
        {r ? <Toggle label="Ativo" checked={active} onChange={setActive} /> : null}
        <ErrorNote error={save.error} />
      </div>
    </Sheet>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-sunken px-3.5 py-3">
      <span className="text-[15px] font-medium">{label}</span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className="relative h-7 w-12 rounded-full bg-line transition-colors peer-checked:bg-good peer-focus-visible:outline-2 peer-focus-visible:outline-ink after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-surface after:shadow-card after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

/* ===================== Prazos importantes ===================== */

export function DeadlinesPage() {
  const { data: deadlines, isLoading } = useList<Deadline>("deadlines");
  const { data: areas = [] } = useAreas();
  const [editing, setEditing] = useState<Deadline | "new" | null>(null);
  usePlusAction("Novo prazo", () => setEditing("new"));
  const today = localToday();
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const open = (deadlines ?? []).filter((d) => !d.done);

  if (isLoading) return <Skeleton className="h-60" />;
  return (
    <div>
      <div className="mb-4 hidden justify-end md:flex"><AddButton onClick={() => setEditing("new")}>Novo prazo</AddButton></div>
      {open.length === 0 ? <Empty title="Nenhum prazo cadastrado." hint="Validade de documentos, prazos de processos e renovações que não são conta a pagar." /> : (
        <List>
          {open.map((d) => {
            const days = Math.round((Date.parse(d.date) - Date.parse(today)) / 86_400_000);
            const tone = days < 0 ? "bad" : days <= Math.min(7, d.alertDaysBefore) ? "warn" : days <= d.alertDaysBefore ? "neutral" : null;
            return (
              <Row
                key={d.id}
                onClick={() => setEditing(d)}
                leading={<IconBubble tone={tone === "bad" ? "bad" : tone === "warn" ? "warn" : "neutral"}><Hourglass /></IconBubble>}
                title={d.title}
                subtitle={`${shortDate(d.date)}${d.areaId ? ` · ${areaName.get(d.areaId) ?? ""}` : ""} · alerta ${d.alertDaysBefore} dias antes`}
                trailing={tone ? <Chip tone={tone}>{days < 0 ? "Venceu" : relativeDay(d.date, today)}</Chip> : <span className="text-[13px] text-ink-2">{relativeDay(d.date, today)}</span>}
              />
            );
          })}
        </List>
      )}
      <DeadlineSheet value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function DeadlineSheet({ value, onClose }: { value: Deadline | "new" | null; onClose: () => void }) {
  const d = value && value !== "new" ? value : null;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [alert, setAlert] = useState("30");
  const [areaId, setAreaId] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (!value) return;
    setTitle(d?.title ?? "");
    setDate(d?.date ?? "");
    setAlert(String(d?.alertDaysBefore ?? 30));
    setAreaId(d?.areaId ?? "");
    setNotes(d?.notes ?? "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(() => {
    const body = { title, date, alertDaysBefore: Number(alert) || 0, areaId: areaId || null, notes: notes || null };
    return d ? api(`/deadlines/${d.id}`, { method: "PATCH", body }) : api("/deadlines", { body });
  });
  const finish = useAction(() => api(`/deadlines/${d!.id}`, { method: "PATCH", body: { done: true } }));
  const remove = useAction(() => api(`/deadlines/${d!.id}`, { method: "DELETE" }));
  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={d ? "Editar prazo" : "Novo prazo"}
      footer={
        <div className="flex flex-wrap gap-2">
          {d ? <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm("Apagar este prazo?") && remove.mutate(undefined, { onSuccess: onClose })}>Apagar</Button> : null}
          {d ? <Button variant="secondary" loading={finish.isPending} onClick={() => finish.mutate(undefined, { onSuccess: onClose })}>Resolvido</Button> : null}
          <Button size="lg" className="min-w-40 flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="O que vence"><Input autoFocus={!d} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: CNH, passaporte, prazo do processo" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Avisar quantos dias antes">
            <Input inputMode="numeric" value={alert} onChange={(e) => setAlert(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          </Field>
        </div>
        <Field label="Frente"><AreaSelect value={areaId} onChange={setAreaId} /></Field>
        <Field label="Observações"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>
        <ErrorNote error={save.error} />
      </div>
    </Sheet>
  );
}

/* ===================== Pendências por frente ===================== */

export function AreasPage() {
  const { data, isLoading } = usePendencias();
  const today = localToday();
  if (isLoading || !data) return <Skeleton className="h-60" />;
  return (
    <div className="space-y-3">
      {data.map((g) => (
        <Card key={g.area.id || "none"} as="div" className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            <h2 className="text-[17px] font-bold tracking-[-0.01em]">{g.area.name}</h2>
            <div className="flex gap-1.5">
              {g.overdue ? <Chip tone="bad">{g.overdue} atrasada{g.overdue > 1 ? "s" : ""}</Chip> : null}
              <Chip>{g.open ? `${g.open} aberto${g.open > 1 ? "s" : ""}` : "Em dia"}</Chip>
            </div>
          </div>
          {g.open === 0 ? (
            <p className="px-4 pb-4 text-[14px] text-ink-2">Nada aberto nesta frente.</p>
          ) : (
            <ul className="divide-y divide-line">
              {g.tasks.slice(0, 6).map((t) => (
                <li key={t.id}><TaskRow task={t} today={today} /></li>
              ))}
              {g.deadlines.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <Hourglass className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{d.title}</span>
                  <span className={cx("text-[13px]", d.daysLeft < 0 ? "font-semibold text-bad" : "text-ink-2")}>{d.daysLeft < 0 ? "venceu" : relativeDay(d.date, today)}</span>
                </li>
              ))}
              {g.tasks.length > 6 ? <li className="px-4 py-2.5 text-[13px] text-ink-2">e mais {g.tasks.length - 6} tarefas</li> : null}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
