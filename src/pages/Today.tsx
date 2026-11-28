import { useState } from "react";
import { Link } from "react-router";
import { CalendarClock, Check, Clock, CreditCard, Hourglass, Repeat, Settings, Users } from "lucide-react";
import { api, BUCKET_HINT, BUCKET_LABEL, useAction, useMe, useToday, type Bill, type Bucket, type Task, type TodayData } from "@/lib/api";
import { formatBRL, greeting, longDate, relativeDay, shortDate } from "@/lib/format";
import { Chip, Empty, IconBubble, List, Money, Row, Section, Skeleton, cx } from "@/components/ui";
import { PayBill } from "@/components/PayBill";
import { SetupGuide } from "@/components/Setup";
import { HouseTaskRow } from "./House";

export function TodayPage() {
  const { data: me } = useMe();
  const { data: t, isLoading, error } = useToday();
  const [paying, setPaying] = useState<Bill | null>(null);

  if (isLoading || !t) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-40" />
        <Skeleton className="h-28" />
        {error ? <p className="text-bad">{(error as Error).message}</p> : null}
      </div>
    );
  }

  const toPay = [...t.bills.overdue, ...t.bills.today];
  const tasks = [...t.tasks.overdue, ...t.tasks.today];
  const nothing =
    toPay.length + t.invoices.length + tasks.length + t.events.today.length + t.reminders.today.length + t.deadlines.length === 0 &&
    !(t.house && t.house.bills.overdue.length + t.house.bills.today.length + t.house.tasks.length + t.house.events.length);
  const firstName = me?.name?.split(" ")[0];

  return (
    <div>
      <header className="relative mb-5 pt-2 pr-10 max-[374px]:mb-4 max-[374px]:pt-0 md:pr-0">
        <Link to="/ajustes" aria-label="Ajustes" className="absolute top-0 -right-2 grid size-11 place-items-center rounded-full text-ink-2 hover:bg-sunken active:bg-sunken md:hidden">
          <Settings className="size-[22px]" aria-hidden />
        </Link>
        <p className="text-[15px] font-medium text-ink-2 first-letter:uppercase max-[374px]:text-[14px]">{longDate(t.today)}</p>
        <h1 className="mt-0.5 text-[30px] leading-[1.1] font-extrabold tracking-[-0.03em] max-[374px]:text-[25px]">
          {greeting()}{firstName ? `, ${firstName}` : ""}.
        </h1>
      </header>

      <PerDay money={t.money} />

      {nothing ? (
        <div className="mt-8">
          <Empty title="Nada pendente para hoje." hint="Sem contas vencendo, tarefas, compromissos ou lembretes. Use o + para registrar algo." />
        </div>
      ) : null}

      {toPay.length + t.invoices.length > 0 ? (
        <Section title="Para pagar" action={<Link to="/financas/contas" className="-my-3 inline-flex h-11 items-center text-[14px] font-semibold text-ink-2 hover:text-ink active:text-ink">Ver contas</Link>}>
          <List>
            {toPay.map((b) => {
              const late = b.dueDate < t.today;
              return (
                <Row
                  key={b.id}
                  onClick={() => setPaying(b)}
                  leading={<IconBubble tone={late ? "bad" : "neutral"}><Repeat /></IconBubble>}
                  title={b.name}
                  subtitle={late ? `Venceu ${relativeDay(b.dueDate, t.today)}` : "Vence hoje"}
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      {b.amount != null ? <Money cents={b.amount} className="text-[15px] font-semibold" /> : <span className="text-[13px] text-ink-2">valor a confirmar</span>}
                      {late ? <Chip tone="bad">Vencida</Chip> : <Chip tone="warn">Hoje</Chip>}
                    </div>
                  }
                />
              );
            })}
            {t.invoices.map((inv) => (
              <Row
                key={inv.cardId + inv.dueDate}
                to={`/financas/cartao/${inv.cardId}`}
                leading={<IconBubble tone={inv.status === "overdue" ? "bad" : "neutral"}><CreditCard /></IconBubble>}
                title={`Fatura ${inv.cardName}`}
                subtitle={inv.status === "overdue" ? `Venceu ${relativeDay(inv.dueDate, t.today)}` : inv.dueDate === t.today ? "Vence hoje" : "Vence amanhã"}
                trailing={<Money cents={inv.remaining} className="text-[15px] font-semibold" />}
              />
            ))}
          </List>
          {t.bills.tomorrow.length ? (
            <p className="mt-2 px-1 text-[13.5px] text-ink-2">
              Amanhã: {t.bills.tomorrow.map((b) => `${b.name}${b.amount != null ? ` (${formatBRL(b.amount)})` : ""}`).join(", ")}
            </p>
          ) : null}
        </Section>
      ) : null}

      {t.events.today.length ? (
        <Section title="Agenda">
          <List>
            {t.events.today.map((e) => (
              <Row
                key={e.id}
                to="/vida/agenda"
                leading={<IconBubble><Clock /></IconBubble>}
                title={e.title}
                subtitle={[e.location, e.areaName].filter(Boolean).join(" · ") || undefined}
                trailing={<span className="num text-[15px] font-semibold">{e.time ?? "Dia todo"}</span>}
              />
            ))}
          </List>
        </Section>
      ) : null}

      {tasks.length ? (
        <Section title="Tarefas" action={<Link to="/vida" className="-my-3 inline-flex h-11 items-center text-[14px] font-semibold text-ink-2 hover:text-ink active:text-ink">Ver todas</Link>}>
          <List>
            {tasks.map((task) => <TaskRow key={task.id} task={task} today={t.today} />)}
          </List>
        </Section>
      ) : null}

      {t.reminders.today.length ? (
        <Section title="Lembretes">
          <List>
            {t.reminders.today.map((r) => <ReminderRow key={r.id} id={r.id} title={r.title} subtitle={r.areaName ?? `Todo dia ${r.dayOfMonth}`} />)}
          </List>
        </Section>
      ) : null}

      {t.deadlines.length ? (
        <Section title="Prazos chegando">
          <List>
            {t.deadlines.map((d) => (
              <Row
                key={d.id}
                to="/vida/prazos"
                leading={<IconBubble tone={d.daysLeft < 0 ? "bad" : d.daysLeft <= 7 ? "warn" : "neutral"}><Hourglass /></IconBubble>}
                title={d.title}
                subtitle={`${shortDate(d.date)}${d.areaName ? ` · ${d.areaName}` : ""}`}
                trailing={<Chip tone={d.daysLeft < 0 ? "bad" : d.daysLeft <= 7 ? "warn" : "neutral"}>{d.daysLeft < 0 ? "Venceu" : relativeDay(d.date, t.today)}</Chip>}
              />
            ))}
          </List>
        </Section>
      ) : null}

      {t.events.tomorrow.length + t.reminders.tomorrow.length > 0 ? (
        <Section title="Amanhã">
          <List>
            {t.events.tomorrow.map((e) => (
              <Row key={e.id} to="/vida/agenda" leading={<IconBubble><CalendarClock /></IconBubble>} title={e.title} trailing={<span className="num text-[14px] text-ink-2">{e.time ?? ""}</span>} />
            ))}
            {t.reminders.tomorrow.map((r) => (
              <Row key={r.id} to="/vida/lembretes" leading={<IconBubble><Repeat /></IconBubble>} title={r.title} subtitle="Lembrete" />
            ))}
          </List>
        </Section>
      ) : null}

      {t.house ? <HouseToday house={t.house} today={t.today} /> : null}

      {me?.isDemo ? null : <SetupGuide />}

      <PayBill bill={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

/** A parte da casa no Hoje: contas (se pode ver as finanças), tarefas suas ou sem responsável e agenda. */
function HouseToday({ house, today }: { house: NonNullable<TodayData["house"]>; today: string }) {
  const bills = [...house.bills.overdue, ...house.bills.today];
  if (bills.length + house.tasks.length + house.events.length === 0) return null;
  return (
    <Section title={house.name} action={<Link to="/casa" className="-my-3 inline-flex h-11 items-center text-[14px] font-semibold text-ink-2 hover:text-ink active:text-ink">Abrir</Link>}>
      <List>
        {bills.map((b) => {
          const late = b.dueDate < today;
          return (
            <Row
              key={b.id}
              to="/casa/contas"
              leading={<IconBubble tone={late ? "bad" : "neutral"}><Users /></IconBubble>}
              title={b.name}
              subtitle={late ? `Conta da casa · venceu ${relativeDay(b.dueDate, today)}` : "Conta da casa · vence hoje"}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  {b.amount != null ? <Money cents={b.amount} className="text-[15px] font-semibold" /> : <span className="text-[13px] text-ink-2">a confirmar</span>}
                  {late ? <Chip tone="bad">Vencida</Chip> : <Chip tone="warn">Hoje</Chip>}
                </div>
              }
            />
          );
        })}
        {house.events.map((e) => (
          <Row key={e.id} to="/casa/agenda" leading={<IconBubble><Clock /></IconBubble>} title={e.title} subtitle={e.location ?? "Compromisso da casa"} trailing={<span className="num text-[15px] font-semibold">{e.time ?? "Dia todo"}</span>} />
        ))}
        {house.tasks.map((task) => <HouseTaskRow key={task.id} task={task} today={today} />)}
      </List>
    </Section>
  );
}

/** Gasto por dia: só corrente + carteira. Abaixo, os quatro baldes separados. */
function PerDay({ money }: { money: TodayData["money"] }) {
  const negative = money.free < 0;
  const b = money.buckets;
  const rows: Bucket[] = ["checking", "cash", "saved", "invested"];
  return (
    <div className="space-y-3">
      {!money.hasData ? (
        <Link to="/financas" className="block rounded-[var(--radius-card)] bg-hero px-5 py-5 text-on-hero shadow-cta transition-opacity hover:opacity-95">
          <p className="text-[14px] font-semibold text-on-hero-2">Pode gastar por dia</p>
          <p className="mt-1.5 text-[22px] leading-tight font-bold tracking-[-0.02em]">Cadastre seus saldos para ver quanto dá para gastar.</p>
          <p className="mt-2 text-[14px] text-on-hero-2">Conta corrente e carteira entram; guardado e investido não.</p>
        </Link>
      ) : (
        <Link to="/financas" className="block rounded-[var(--radius-card)] bg-hero px-5 pt-5 pb-4 text-on-hero shadow-cta transition-opacity hover:opacity-95 active:opacity-90 max-[374px]:px-4 max-[374px]:pt-4 max-[374px]:pb-3.5">
          <p className="text-[14px] font-semibold text-on-hero-2">Pode gastar por dia</p>
          <p className={cx("num mt-1 text-[44px] leading-none font-extrabold tracking-[-0.035em] max-[374px]:text-[38px]", negative && "text-bad")}>
            {negative ? "R$ 0" : formatBRL(money.perDay)}
          </p>
          <p className="num mt-3 text-[14px] leading-snug text-on-hero-2">
            {negative ? (
              <>Faltam {formatBRL(-money.free)} para as contas até {shortDate(money.payday)}.</>
            ) : (
              <>
                ({formatBRL(money.spendable)} gastável − contas e faturas) ÷ {money.days} {money.days === 1 ? "dia" : "dias"} até {shortDate(money.payday)}.
              </>
            )}
          </p>
          {money.paydayAssumed ? (
            <p className="mt-3 border-t border-white/10 pt-3 text-[13.5px] font-medium">Contando até o dia 1º. Informe a data do próximo recebimento em Finanças.</p>
          ) : null}
        </Link>
      )}
      <List>
        {rows.map((k) => (
          <Row
            key={k}
            to="/financas"
            title={BUCKET_LABEL[k]}
            subtitle={BUCKET_HINT[k]}
            trailing={<Money cents={b[k]} className={cx("text-[15px] font-semibold", (k === "saved" || k === "invested") && "text-ink-2")} />}
          />
        ))}
      </List>
    </div>
  );
}

export function TaskRow({ task, today, onOpen }: { task: Task; today: string; onOpen?: () => void }) {
  const toggle = useAction(() => api(`/tasks/${task.id}`, { method: "PATCH", body: { done: !task.done } }));
  const late = task.dueDate && task.dueDate < today && !task.done;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? "Reabrir tarefa" : "Concluir tarefa"}
        onClick={() => toggle.mutate()}
        className={cx(
          "hit-lg grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
          task.done ? "border-good bg-good text-surface" : "border-line hover:border-ink-2",
        )}
      >
        {task.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </button>
      <Wrap onOpen={onOpen}>
        <div className={cx("truncate text-[15px] font-medium", task.done && "text-ink-3 line-through")}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
          {task.areaName ? <span>{task.areaName}</span> : null}
          {task.areaName && task.dueDate ? <span aria-hidden>·</span> : null}
          {task.dueDate ? <span className={cx(late && "font-semibold text-bad")}>{late ? `Atrasada desde ${shortDate(task.dueDate)}` : relativeDay(task.dueDate, today)}</span> : null}
        </div>
      </Wrap>
      {task.priority === "high" && !task.done ? <Chip tone="warn">Alta</Chip> : null}
    </div>
  );
}

function Wrap({ onOpen, children }: { onOpen?: () => void; children: React.ReactNode }) {
  if (!onOpen) return <div className="min-w-0 flex-1">{children}</div>;
  return (
    <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-lg text-left">
      {children}
    </button>
  );
}

function ReminderRow({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  const done = useAction(() => api(`/reminders/${id}/done`, { body: {} }));
  return (
    <Row
      leading={<IconBubble><Repeat /></IconBubble>}
      title={title}
      subtitle={subtitle}
      trailing={
        <button type="button" onClick={() => done.mutate()} className="hit h-10 rounded-xl bg-sunken px-3.5 text-[14px] font-semibold text-ink hover:bg-line/70 active:bg-line">
          Feito
        </button>
      }
    />
  );
}
