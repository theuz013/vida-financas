import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { ArrowDownLeft, ArrowLeftRight, ChevronLeft, ChevronRight, MessageCircle, Plus, Repeat } from "lucide-react";
import { addMonths } from "@shared/dates";
import {
  api,
  useAccounts,
  useAction,
  useBills,
  useCategories,
  useInvoices,
  useSummary,
  useTransactions,
  useAccountTransactions,
  type Bill,
  type Transaction,
  type CanBuyOption,
  type Forecast,
  type InvoiceDetail,
} from "@/lib/api";
import { centsToInput, formatBRL, localToday, monthLabel, parseBRL, relativeDay, shortDate } from "@/lib/format";
import {
  Button,
  Card,
  Chip,
  Emoji,
  Empty,
  ErrorNote,
  Field,
  IconBubble,
  IconButton,
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
import { PayBill } from "@/components/PayBill";
import { usePlusAction, useQuickAdd } from "@/components/Layout";
import { AccountSheet } from "./Finance";

function useMonth() {
  const [month, setMonth] = useState(localToday().slice(0, 7));
  const shift = (n: number) => setMonth(addMonths(`${month}-01`, n).slice(0, 7));
  return { month, shift };
}

function MonthSwitch({ month, shift }: { month: string; shift: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Mês anterior" onClick={() => shift(-1)}><ChevronLeft className="size-5" /></IconButton>
      <span className="min-w-[8.5rem] text-center text-[15px] font-semibold first-letter:uppercase">{monthLabel(month)}</span>
      <IconButton label="Próximo mês" onClick={() => shift(1)}><ChevronRight className="size-5" /></IconButton>
    </div>
  );
}

/* ===================== Lançamentos ===================== */

type TxFilter = "all" | "expense" | "income" | "transfer";

export function TransactionsPage() {
  const { month, shift } = useMonth();
  const { data: txs, isLoading } = useTransactions(month);
  const quickAdd = useQuickAdd();
  const { data: cats = [] } = useCategories();
  const [q, setQ] = useState("");
  const [type, setType] = useState<TxFilter>("all");
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const term = norm(q);
  const filtered = (txs ?? []).filter(
    (t) => (type === "all" || t.type === type) && (!term || norm(t.description).includes(term) || norm(catName.get(t.categoryId ?? "") ?? "").includes(term)),
  );
  const total = filtered.reduce((s, t) => s + (t.type === "expense" ? -t.amount : t.type === "income" ? t.amount : 0), 0);

  return (
    <div>
      <PageHeader title="Lançamentos" back="/financas" action={<Button size="sm" onClick={() => quickAdd()}><Plus className="size-4" />Registrar</Button>} />
      <div className="mb-4 flex justify-center"><MonthSwitch month={month} shift={shift} /></div>
      <div className="mb-5 space-y-2.5">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por descrição ou categoria" aria-label="Buscar lançamentos" />
        <Segmented value={type} onChange={setType} options={[{ value: "all", label: "Todos" }, { value: "expense", label: "Gastos" }, { value: "income", label: "Receitas" }, { value: "transfer", label: "Transf." }]} />
        {(q || type !== "all") && filtered.length ? (
          <p className="num px-1 text-[13.5px] text-ink-2">{filtered.length} {filtered.length === 1 ? "lançamento" : "lançamentos"}{type !== "transfer" ? ` · ${total < 0 ? "−" : "+"} ${formatBRL(Math.abs(total))}` : ""}</p>
        ) : null}
      </div>
      {isLoading ? <Skeleton className="h-60" /> : filtered.length === 0 ? (
        txs?.length ? <Empty title="Nada encontrado." hint="Tente outra palavra ou outro filtro." /> : <Empty title="Nenhum lançamento neste mês." hint="Registre gastos e receitas pelo +, ou peça ao assistente no WhatsApp." />
      ) : (
        <TxList txs={filtered} />
      )}
    </div>
  );
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Lançamentos agrupados por dia. Tocar abre a edição. */
export function TxList({ txs, accountId }: { txs: Transaction[]; accountId?: string }) {
  const { data: cats = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const quickAdd = useQuickAdd();
  const catById = new Map(cats.map((c) => [c.id, c]));
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const byDay = new Map<string, Transaction[]>();
  for (const t of txs) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);

  return (
    <>
      {[...byDay.entries()].map(([day, list]) => (
        <Section key={day} title={relativeDay(day) === "hoje" ? "Hoje" : relativeDay(day) === "ontem" ? "Ontem" : shortDate(day)}>
          <List>
            {list.map((t) => {
              const cat = t.categoryId ? catById.get(t.categoryId) : undefined;
              const acc = accById.get(t.accountId);
              const incoming = t.type === "transfer" && accountId && t.toAccountId === accountId;
              const sub = [
                t.type === "transfer" ? `${acc?.name ?? ""} → ${accById.get(t.toAccountId ?? "")?.name ?? ""}` : accountId ? cat?.name : acc?.name,
                t.installmentsTotal > 1 ? (t.installmentCurrent > 1 ? `parcela ${t.installmentCurrent} de ${t.installmentsTotal}` : `${t.installmentsTotal}×`) : null,
              ].filter(Boolean).join(" · ");
              const signed = t.type === "expense" ? -t.amount : t.type === "income" ? t.amount : accountId ? (incoming ? t.amount : -t.amount) : t.amount;
              return (
                <Row
                  key={t.id}
                  onClick={() => quickAdd({ edit: t })}
                  leading={t.type === "transfer" ? <IconBubble><ArrowLeftRight /></IconBubble> : cat ? <Emoji>{cat.emoji}</Emoji> : <IconBubble><ArrowDownLeft /></IconBubble>}
                  title={
                    <span className="inline-flex max-w-full items-center gap-1.5">
                      <span className="truncate">{t.description}</span>
                      {t.source === "whatsapp" ? <MessageCircle className="size-3.5 shrink-0 text-ink-3" aria-label="Registrado pelo assistente" /> : null}
                    </span>
                  }
                  subtitle={sub || undefined}
                  trailing={
                    <Money
                      cents={signed}
                      signed={signed > 0}
                      className={cx("text-[15px] font-semibold", t.type === "income" && "text-good", t.type === "transfer" && "text-ink-2")}
                    />
                  }
                />
              );
            })}
          </List>
        </Section>
      ))}
    </>
  );
}

/* ===================== Conta (detalhe) ===================== */

export function AccountPage() {
  const { id = "" } = useParams();
  const { data: accounts, isLoading } = useAccounts();
  const { data: txs } = useAccountTransactions(id);
  const quickAdd = useQuickAdd();
  const [editing, setEditing] = useState(false);
  const account = accounts?.find((a) => a.id === id);
  if (isLoading) return <Skeleton className="h-60" />;
  if (!account) return <Empty title="Conta não encontrada." />;
  return (
    <div>
      <PageHeader
        title={account.name}
        subtitle={<>Saldo: <Money cents={account.balance ?? 0} className={cx("font-semibold text-ink", (account.balance ?? 0) < 0 && "text-bad")} /></>}
        back="/financas"
        action={<Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Editar</Button>}
      />
      <div className="mb-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => quickAdd({ mode: "expense", accountId: id })}>Gasto</Button>
        <Button variant="secondary" onClick={() => quickAdd({ mode: "income", accountId: id })}>Receita</Button>
      </div>
      {!txs ? <Skeleton className="mt-6 h-40" /> : txs.length === 0 ? (
        <div className="mt-6"><Empty title="Nenhum lançamento nesta conta." /></div>
      ) : (
        <div className="mt-6"><TxList txs={txs} accountId={id} /></div>
      )}
      <AccountSheet value={editing ? account : null} onClose={() => setEditing(false)} />
    </div>
  );
}

/* ===================== Contas a pagar ===================== */

export function BillsPage() {
  const [tab, setTab] = useState<"pending" | "paid">("pending");
  const { data: bills, isLoading } = useBills(tab);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [editing, setEditing] = useState<Bill | "new" | null>(null);
  const today = localToday();
  usePlusAction("Nova conta a pagar", () => setEditing("new"));

  return (
    <div>
      <PageHeader title="Contas a pagar" back="/financas" action={<span className="hidden md:block"><Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" />Nova</Button></span>} />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: "pending", label: "A pagar" }, { value: "paid", label: "Pagas" }]} />
      {isLoading ? <Skeleton className="h-60" /> : !bills?.length ? (
        <Empty title={tab === "pending" ? "Nenhuma conta a pagar." : "Nenhuma conta paga ainda."} hint={tab === "pending" ? "Cadastre contas como internet, luz e água para o app avisar antes de vencer." : undefined} />
      ) : (
        <List>
          {bills.map((b) => {
            const late = b.status === "pending" && b.dueDate < today;
            const isToday = b.status === "pending" && b.dueDate === today;
            return (
              <Row
                key={b.id}
                onClick={() => setEditing(b)}
                leading={<IconBubble tone={late ? "bad" : b.status === "paid" ? "good" : "neutral"}><Repeat /></IconBubble>}
                title={b.name}
                subtitle={`${b.status === "paid" || late ? "Venceu" : "Vence"} ${shortDate(b.dueDate)}${b.recurrence === "monthly" ? " · todo mês" : b.recurrence === "yearly" ? " · todo ano" : ""}${b.source === "whatsapp" ? " · pelo assistente" : ""}`}
                trailing={
                  <div className="flex flex-col items-end gap-1">
                    {b.amount != null ? <Money cents={b.amount} className="text-[15px] font-semibold" /> : <span className="text-[13px] text-ink-2">a confirmar</span>}
                    {b.status === "paid" ? <Chip tone="good">Paga</Chip> : late ? <Chip tone="bad">Vencida</Chip> : isToday ? <Chip tone="warn">Hoje</Chip> : <span className="text-[12.5px] text-ink-2">{relativeDay(b.dueDate, today)}</span>}
                  </div>
                }
              />
            );
          })}
        </List>
      )}
      <BillSheet value={editing} onClose={() => setEditing(null)} onPay={(b) => { setEditing(null); setPaying(b); }} />
      <PayBill bill={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

function BillSheet({ value, onClose, onPay }: { value: Bill | "new" | null; onClose: () => void; onPay: (b: Bill) => void }) {
  const bill = value && value !== "new" ? value : null;
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(localToday());
  const [recurrence, setRecurrence] = useState<Bill["recurrence"]>("monthly");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    if (!value) return;
    setName(bill?.name ?? "");
    setAmount(centsToInput(bill?.amount));
    setDueDate(bill?.dueDate ?? localToday());
    setRecurrence(bill?.recurrence ?? "monthly");
    setAccountId(bill?.accountId ?? "");
    setCategoryId(bill?.categoryId ?? "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction(() => {
    const body = { name, amount: amount ? parseBRL(amount) : null, dueDate, recurrence, accountId: accountId || null, categoryId: categoryId || null };
    return bill ? api(`/bills/${bill.id}`, { method: "PATCH", body }) : api("/bills", { body });
  });
  const remove = useAction(() => api(`/bills/${bill!.id}`, { method: "DELETE" }));
  const unpay = useAction(() => api(`/bills/${bill!.id}/unpay`, { body: {} }));

  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={bill ? bill.name : "Nova conta a pagar"}
      footer={
        <div className="flex flex-wrap gap-2">
          {bill ? <Button variant="danger" loading={remove.isPending} onClick={() => window.confirm("Apagar esta conta?") && remove.mutate(undefined, { onSuccess: onClose })}>Apagar</Button> : null}
          {bill?.status === "pending" ? <Button variant="secondary" onClick={() => onPay(bill)}>Pagar</Button> : null}
          {bill?.status === "paid" ? (
            <Button variant="secondary" loading={unpay.isPending} onClick={() => unpay.mutate(undefined, { onSuccess: onClose })}>
              Desfazer pagamento
            </Button>
          ) : null}
          <Button size="lg" className="min-w-40 flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">
          <Input autoFocus={!bill} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: internet" />
        </Field>
        <Field label="Valor" hint="Deixe em branco se o valor muda todo mês (água, luz).">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vencimento">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Repete">
            <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Bill["recurrence"])}>
              <option value="monthly">Todo mês</option>
              <option value="yearly">Todo ano</option>
              <option value="none">Não repete</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pagar com">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Escolher na hora</option>
              {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {cats.filter((c) => c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </Select>
          </Field>
        </div>
        <ErrorNote error={save.error ?? remove.error ?? unpay.error} />
      </div>
    </Sheet>
  );
}

/* ===================== Cartão ===================== */

const invoiceTone = { open: "neutral", closed: "warn", paid: "good", overdue: "bad" } as const;
const invoiceLabel = { open: "Aberta", closed: "Fechada", paid: "Paga", overdue: "Vencida" } as const;

export function CardPage() {
  const { id = "" } = useParams();
  const { data, isLoading } = useInvoices(id);
  const { data: accounts = [] } = useAccounts();
  const [payOpen, setPayOpen] = useState(false);
  const [fromId, setFromId] = useState("");
  const [amount, setAmount] = useState("");
  const today = localToday();

  const relevant = (data?.invoices ?? []).filter((i) => i.total > 0 || i.closingDate === data?.summary.current?.closingDate);
  const upcoming = relevant.filter((i) => i.closingDate >= (data?.summary.current?.closingDate ?? today));
  const past = relevant.filter((i) => i.closingDate < (data?.summary.current?.closingDate ?? today)).reverse();
  const owed = (data?.invoices ?? []).filter((i) => i.remaining > 0 && i.closingDate <= today);
  const suggested = owed.reduce((s, i) => s + i.remaining, 0) || data?.summary.current?.remaining || 0;

  const pay = useAction(() => api(`/cards/${id}/pay`, { body: { fromAccountId: fromId, amount: parseBRL(amount) } }));

  if (isLoading || !data) return <Skeleton className="h-80" />;
  const s = data.summary;
  return (
    <div>
      <PageHeader title={data.card.name} subtitle={`Fecha dia ${data.card.closingDay} · vence dia ${data.card.dueDay}`} back="/financas" />
      <Card className="px-5 py-4">
        <dl className="num grid grid-cols-3 gap-3 text-[13px]">
          <div><dt className="text-ink-2">Limite</dt><dd className="mt-0.5 text-[16px] font-bold">{formatBRL(s.limit)}</dd></div>
          <div><dt className="text-ink-2">Usado</dt><dd className="mt-0.5 text-[16px] font-bold">{formatBRL(s.used)}</dd></div>
          <div><dt className="text-ink-2">Disponível</dt><dd className={cx("mt-0.5 text-[16px] font-bold", s.available < 0 && "text-bad")}>{formatBRL(s.available)}</dd></div>
        </dl>
        <Button
          className="mt-4 w-full"
          variant="secondary"
          onClick={() => {
            setFromId(accounts.find((a) => a.kind === "checking" && !a.archived)?.id ?? "");
            setAmount(centsToInput(suggested));
            setPayOpen(true);
          }}
        >
          Pagar fatura
        </Button>
      </Card>

      <Section title="Faturas">
        <div className="space-y-3">
          {upcoming.map((inv) => <InvoiceCard key={inv.closingDate} inv={inv} current={inv.closingDate === s.current?.closingDate} />)}
        </div>
      </Section>
      {past.length ? (
        <Section title="Anteriores">
          <div className="space-y-3">{past.map((inv) => <InvoiceCard key={inv.closingDate} inv={inv} />)}</div>
        </Section>
      ) : null}

      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title={`Pagar fatura ${data.card.name}`} footer={<Button size="lg" loading={pay.isPending} onClick={() => pay.mutate(undefined, { onSuccess: () => setPayOpen(false) })}>Confirmar pagamento</Button>}>
        <div className="space-y-4">
          <p className="text-[14px] text-ink-2">O pagamento sai da conta escolhida e libera o limite. Não conta como gasto: as compras já foram contadas.</p>
          <Field label="Valor"><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Field label="Pago com">
            <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {accounts.filter((a) => a.kind === "checking" && !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <ErrorNote error={pay.error} />
        </div>
      </Sheet>
    </div>
  );
}

function InvoiceCard({ inv, current }: { inv: InvoiceDetail["invoices"][number]; current?: boolean }) {
  const [open, setOpen] = useState(Boolean(current));
  return (
    <Card as="div" className="overflow-hidden">
      <Row
        onClick={() => setOpen(!open)}
        title={current ? "Fatura atual" : `Vence ${shortDate(inv.dueDate)}`}
        subtitle={`Fecha ${shortDate(inv.closingDate)}${current ? ` · vence ${shortDate(inv.dueDate)}` : ""} · ${inv.items.length} ${inv.items.length === 1 ? "item" : "itens"}`}
        trailing={
          <div className="flex flex-col items-end gap-1">
            <Money cents={inv.total} className="text-[15px] font-semibold" />
            <Chip tone={invoiceTone[inv.status]}>{invoiceLabel[inv.status]}</Chip>
          </div>
        }
      />
      {open && inv.items.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {inv.items.map((it) => (
            <li key={it.txId + it.installment} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
              <span className="min-w-0 truncate">
                {it.description}
                {it.of > 1 ? <span className="text-ink-2"> · {it.installment}/{it.of}</span> : null}
              </span>
              <Money cents={it.amount} className="text-ink-2" />
            </li>
          ))}
          {inv.paid > 0 && inv.remaining > 0 ? (
            <li className="flex justify-between px-4 py-2.5 text-[14px] font-semibold"><span>Falta pagar</span><Money cents={inv.remaining} /></li>
          ) : null}
        </ul>
      ) : null}
    </Card>
  );
}

/* ===================== Resumo do mês ===================== */

export function SummaryPage() {
  const { month, shift } = useMonth();
  const { data, isLoading } = useSummary(month);
  return (
    <div>
      <PageHeader title="Resumo do mês" back="/financas" />
      <div className="mb-4 flex justify-center"><MonthSwitch month={month} shift={shift} /></div>
      {isLoading || !data ? <Skeleton className="h-60" /> : (
        <>
          <Card className="px-5 py-4">
            <dl className="num space-y-2.5 text-[15px]">
              <div className="flex justify-between"><dt className="text-ink-2">Entrou</dt><dd className="font-semibold text-good">+ {formatBRL(data.income)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Saiu</dt><dd className="font-semibold">− {formatBRL(data.expense)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2.5"><dt className="font-semibold">Saldo do mês</dt><dd className={cx("text-[18px] font-extrabold", data.balance < 0 && "text-bad")}>{data.balance < 0 ? "− " : ""}{formatBRL(Math.abs(data.balance))}</dd></div>
            </dl>
            {data.monthlyLimit ? (
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                  <div className={cx("h-full rounded-full", data.expense > data.monthlyLimit ? "bg-bad" : data.expense > data.monthlyLimit * 0.8 ? "bg-warn" : "bg-ink-2")} style={{ width: `${Math.min(100, (data.expense / data.monthlyLimit) * 100)}%` }} />
                </div>
                <p className="num mt-2 text-[13px] text-ink-2">{formatBRL(data.expense)} de {formatBRL(data.monthlyLimit)} do limite do mês</p>
              </div>
            ) : null}
            <p className="mt-3 text-[12.5px] text-ink-3">Compras no cartão contam no mês da compra. Transferências e pagamento de fatura não entram.</p>
          </Card>
          <Section title="Onde foi o dinheiro">
            {data.categories.length === 0 ? <Empty title="Nenhum gasto neste mês." /> : (
              <Card className="space-y-4 px-4 py-4">
                {data.categories.map((c) => (
                  <div key={c.categoryId ?? "none"}>
                    <div className="flex items-center gap-3">
                      <span aria-hidden className="text-[20px] leading-none">{c.emoji}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px]">{c.name}</span>
                      <Money cents={c.total} className="text-[15px] font-semibold" />
                    </div>
                    <div className="mt-2 ml-8 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                      <div className="h-full rounded-full bg-ink-2" style={{ width: `${Math.max(2, c.share * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/* ===================== Posso comprar isso? ===================== */

const verdictTone = { cabe: "good", aperta: "warn", nao_cabe: "bad" } as const;
const verdictLabel = { cabe: "Cabe", aperta: "Aperta", nao_cabe: "Não cabe" } as const;

export function CanBuyPage() {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"pix" | "debit" | "credit">("pix");
  const [installments, setInstallments] = useState(1);
  const sim = useAction((body: { amount: number; method: string; installments: number }) =>
    api<{ forecast: Forecast; options: CanBuyOption[] }>("/can-buy", { body }),
  );
  const cents = parseBRL(amount);

  const run = () => {
    if (!cents || cents <= 0) return;
    sim.mutate({ amount: cents, method, installments: method === "credit" ? installments : 1 });
  };

  return (
    <div>
      <PageHeader title="Posso comprar isso?" subtitle="Usa só o gastável (conta corrente e carteira) e o limite do cartão. Guardado e investido não entram." back="/financas" />
      <Card className="space-y-4 px-5 py-5">
        <MoneyInput large autoFocus value={amount} onChange={setAmount} aria-label="Valor da compra" onKeyDown={(e) => e.key === "Enter" && run()} />
        <Segmented value={method} onChange={setMethod} options={[{ value: "pix", label: "Pix" }, { value: "debit", label: "Débito" }, { value: "credit", label: "Crédito" }]} />
        {method === "credit" ? (
          <Field label="Parcelas">
            <Select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? "À vista" : `${n}× de ${cents ? formatBRL(Math.floor(cents / n)) : "—"}`}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Button size="lg" onClick={run} loading={sim.isPending} disabled={!cents}>Simular</Button>
      </Card>

      <ErrorNote error={sim.error} />

      {sim.data ? (
        <Section title="Resultado">
          {sim.data.options.length === 0 ? (
            <Empty title={method === "credit" ? "Nenhum cartão cadastrado." : "Nenhuma conta cadastrada."} />
          ) : (
            <div className="space-y-3">
              {sim.data.options.map((o) => (
                <Card key={o.accountId} as="div" className="px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[16px] font-bold">{o.accountName}</span>
                    <Chip tone={verdictTone[o.verdict]}>{verdictLabel[o.verdict]}</Chip>
                  </div>
                  <p className="mt-1.5 text-[14px] text-ink-2">{o.reason}</p>
                  {o.verdict !== "nao_cabe" ? (
                    <p className="num mt-3 border-t border-line pt-3 text-[14px]">
                      Depois da compra: <strong className={cx(o.freeAfter < 0 && "text-bad")}>{o.freeAfter < 0 ? `faltam ${formatBRL(-o.freeAfter)} até o salário` : `${formatBRL(o.perDayAfter)} por dia`}</strong>
                      {o.method === "credit" && o.impactBeforePayday > 0 ? <span className="text-ink-2"> · {formatBRL(o.impactBeforePayday)} vencem antes do salário</span> : null}
                    </p>
                  ) : null}
                </Card>
              ))}
              <p className="num px-1 text-[13px] text-ink-2">
                Hoje: {formatBRL(sim.data.forecast.perDay)} por dia até {shortDate(sim.data.forecast.payday)}
                {sim.data.forecast.paydayAssumed ? " (data do salário não informada)" : ""}.
              </p>
            </div>
          )}
        </Section>
      ) : null}
    </div>
  );
}
