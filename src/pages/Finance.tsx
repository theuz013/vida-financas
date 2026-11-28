import { useEffect, useState } from "react";
import { Calculator, CreditCard, List as ListIcon, PieChart, Plus, Receipt, Wallet } from "lucide-react";
import { api, BUCKET_HINT, BUCKET_LABEL, useAccounts, useAction, useForecast, useSettings, type Account, type Bucket } from "@/lib/api";
import { centsToInput, formatBRL, parseBRL, shortDate } from "@/lib/format";
import { Button, Card, Chip, ErrorNote, Field, IconBubble, Input, List, Money, MoneyInput, PageHeader, Row, Section, Segmented, Select, Sheet, Skeleton } from "@/components/ui";

export function FinancePage() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: fc } = useForecast();
  const [editing, setEditing] = useState<Account | "new-checking" | "new-card" | null>(null);
  const [paydayOpen, setPaydayOpen] = useState(false);

  const active = (accounts ?? []).filter((a) => !a.archived);
  const checking = active.filter((a) => a.kind === "checking");
  const cards = active.filter((a) => a.kind === "card");
  const total = checking.reduce((s, a) => s + (a.balance ?? 0), 0);

  return (
    <div>
      <PageHeader title="Finanças" subtitle={<>Total em contas: <Money cents={total} className="font-semibold text-ink" /></>} />

      {fc ? (
        <Card className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-ink-2">Até o próximo salário</p>
              <p className="num mt-1 text-[26px] font-extrabold tracking-[-0.03em]">
                {fc.free < 0 ? <span className="text-bad">− {formatBRL(-fc.free)}</span> : <>{formatBRL(fc.perDay)}<span className="text-[16px] font-semibold text-ink-2"> / dia</span></>}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setPaydayOpen(true)}>
              {fc.paydayAssumed ? "Informar salário" : shortDate(fc.payday)}
            </Button>
          </div>
          <dl className="num mt-4 space-y-2 border-t border-line pt-3 text-[14px]">
            <div className="flex justify-between"><dt className="text-ink-2">Conta corrente</dt><dd className="font-semibold">{formatBRL(fc.buckets.checking)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Carteira em dinheiro</dt><dd className="font-semibold">{formatBRL(fc.buckets.cash)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2"><dt className="font-semibold">Gastável</dt><dd className="font-bold">{formatBRL(fc.cash)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Contas e faturas até {shortDate(fc.payday)}</dt><dd className="font-semibold">− {formatBRL(fc.committed)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Sobra</dt><dd className="font-bold">{formatBRL(fc.free)}</dd></div>
          </dl>
          <p className="mt-3 text-[13px] text-ink-2">Guardado ({formatBRL(fc.buckets.saved)}) e investido ({formatBRL(fc.buckets.invested)}) não entram nessa conta.</p>
          {fc.unknownBills ? <p className="mt-3 text-[13px] text-warn">{fc.unknownBills === 1 ? "1 conta" : `${fc.unknownBills} contas`} com valor a confirmar ainda não entra na conta.</p> : null}
          {fc.paydayAssumed ? <p className="mt-3 text-[13px] text-ink-2">Sem a data do próximo recebimento, conto até o dia 1º do mês que vem.</p> : null}
        </Card>
      ) : <Skeleton className="h-44" />}

      <Section title="Ferramentas">
        <List>
          <Row to="/financas/posso-comprar" leading={<IconBubble><Calculator /></IconBubble>} title="Posso comprar isso?" subtitle="Simule no Pix, débito ou parcelado" />
          <Row to="/financas/contas" leading={<IconBubble><Receipt /></IconBubble>} title="Contas a pagar" subtitle="Vencimentos e recorrentes" />
          <Row to="/financas/resumo" leading={<IconBubble><PieChart /></IconBubble>} title="Resumo do mês" subtitle="Entradas, saídas e categorias" />
          <Row to="/financas/lancamentos" leading={<IconBubble><ListIcon /></IconBubble>} title="Lançamentos" subtitle="Tudo o que entrou e saiu" />
        </List>
      </Section>

      <Section title="Contas" action={<AddLink onClick={() => setEditing("new-checking")} label="Nova conta" />}>
        {isLoading ? <Skeleton className="h-20" /> : (
          <List>
            {checking.length === 0 ? <Row title="Nenhuma conta" subtitle="Cadastre onde seu dinheiro fica." /> : null}
          </List>
        )}
        {(["checking", "cash", "saved", "invested"] as Bucket[]).map((k) => {
          const list = checking.filter((a) => a.bucket === k);
          if (!list.length) return null;
          return (
            <div key={k} className="mt-4">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-[14px] font-semibold">{BUCKET_LABEL[k]}</span>
                <span className="text-[12.5px] text-ink-2">{BUCKET_HINT[k]}</span>
              </div>
              <List>
                {list.map((a) => (
                  <Row key={a.id} to={`/financas/conta/${a.id}`} leading={<IconBubble><Wallet /></IconBubble>} title={a.name} trailing={<Money cents={a.balance ?? 0} className={`text-[15px] font-semibold ${(a.balance ?? 0) < 0 ? "text-bad" : ""}`} />} />
                ))}
              </List>
            </div>
          );
        })}
      </Section>

      <Section title="Cartões" action={<AddLink onClick={() => setEditing("new-card")} label="Novo cartão" />}>
        {cards.length === 0 && !isLoading ? (
          <Card className="px-5 py-5 text-[14px] text-ink-2">Cadastre um cartão para ver fatura, parcelas e limite.</Card>
        ) : (
          <div className="space-y-3">
            {cards.map((c) => <CardTile key={c.id} card={c} />)}
          </div>
        )}
      </Section>

      <AccountSheet value={editing} onClose={() => setEditing(null)} />
      <PaydaySheet open={paydayOpen} onClose={() => setPaydayOpen(false)} />
    </div>
  );
}

function AddLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="-my-3 inline-flex h-11 items-center gap-1 text-[14px] font-semibold text-ink-2 hover:text-ink active:text-ink">
      <Plus className="size-4" aria-hidden /> {label}
    </button>
  );
}

function CardTile({ card }: { card: Account }) {
  const s = card.card!;
  const usedShare = s.limit ? Math.min(1, s.used / s.limit) : 0;
  const cur = s.current;
  const overdue = s.unpaidClosed.find((i) => i.status === "overdue");
  return (
    <Card as="div">
      <Row
        to={`/financas/cartao/${card.id}`}
        leading={<IconBubble tone={overdue ? "bad" : "neutral"}><CreditCard /></IconBubble>}
        title={card.name}
        subtitle={`Fecha ${card.closingDay} · vence ${card.dueDay}`}
        trailing={
          <div>
            <div className="text-[12px] text-ink-2">Fatura atual</div>
            <Money cents={cur?.remaining ?? 0} className="text-[15px] font-semibold" />
          </div>
        }
      />
      <div className="px-4 pb-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <div className="h-full rounded-full bg-ink-2" style={{ width: `${usedShare * 100}%` }} />
        </div>
        <div className="num mt-2 flex justify-between text-[13px] text-ink-2">
          <span>Disponível <strong className="font-semibold text-ink">{formatBRL(s.available)}</strong></span>
          <span>de {formatBRL(s.limit)}</span>
        </div>
        {overdue ? <div className="mt-2"><Chip tone="bad">Fatura vencida: {formatBRL(overdue.remaining)}</Chip></div> : null}
      </div>
    </Card>
  );
}

/** Criar ou editar conta/cartão. */
export function AccountSheet({ value, onClose }: { value: Account | "new-checking" | "new-card" | null; onClose: () => void }) {
  const editing = typeof value === "object" && value ? value : null;
  const [kind, setKind] = useState<"checking" | "card">("checking");
  const [bucket, setBucket] = useState<Bucket>("checking");
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [limit, setLimit] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");

  useEffect(() => {
    if (!value) return;
    const a = editing;
    setKind(a?.kind ?? (value === "new-card" ? "card" : "checking"));
    setBucket(a?.bucket ?? "checking");
    setName(a?.name ?? "");
    setBalance(a ? centsToInput(a.openingBalance) : "");
    setLimit(a ? centsToInput(a.creditLimit) : "");
    setClosingDay(a?.closingDay ? String(a.closingDay) : "");
    setDueDay(a?.dueDay ? String(a.dueDay) : "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAction(() => {
    const body =
      kind === "checking"
        ? { name, kind, bucket, openingBalance: parseBRL(balance || "0") ?? 0 }
        : { name, kind, creditLimit: parseBRL(limit || "0") ?? 0, closingDay: Number(closingDay) || null, dueDay: Number(dueDay) || null };
    return editing ? api(`/accounts/${editing.id}`, { method: "PATCH", body }) : api("/accounts", { body });
  });
  const archive = useAction(() => api(`/accounts/${editing!.id}`, { method: "PATCH", body: { archived: true } }));

  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={editing ? `Editar ${editing.name}` : kind === "card" ? "Novo cartão" : "Nova conta"}
      footer={
        <div className="flex gap-2">
          {editing ? (
            <Button variant="danger" loading={archive.isPending} onClick={() => window.confirm("Arquivar esta conta? Os lançamentos continuam no histórico.") && archive.mutate(undefined, { onSuccess: onClose })}>
              Arquivar
            </Button>
          ) : null}
          <Button size="lg" className="flex-1" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!editing ? (
          <Segmented value={kind} onChange={setKind} options={[{ value: "checking", label: "Conta" }, { value: "card", label: "Cartão de crédito" }]} />
        ) : null}
        <Field label="Nome">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "card" ? "Ex.: Nubank" : "Ex.: Inter"} />
        </Field>
        {kind === "checking" ? (
          <Field label="Tipo de dinheiro" hint={BUCKET_HINT[bucket]}>
            <Select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)}>
              {(["checking", "cash", "saved", "invested"] as Bucket[]).map((k) => (
                <option key={k} value={k}>{BUCKET_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        {kind === "checking" ? (
          <Field label={editing ? "Saldo inicial" : "Saldo de hoje"} hint="O saldo atual é este valor mais tudo o que você registrar depois.">
            <MoneyInput value={balance} onChange={setBalance} />
          </Field>
        ) : (
          <>
            <Field label="Limite total">
              <MoneyInput value={limit} onChange={setLimit} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dia do fechamento" hint="Compra nesse dia já vai para a fatura seguinte.">
                <Input inputMode="numeric" value={closingDay} onChange={(e) => setClosingDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="3" />
              </Field>
              <Field label="Dia do vencimento">
                <Input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="10" />
              </Field>
            </div>
          </>
        )}
        <ErrorNote error={save.error} />
      </div>
    </Sheet>
  );
}

/** Salário variável: o usuário diz quando vai receber de novo. */
export function PaydaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: s } = useSettings();
  const [date, setDate] = useState("");
  const [income, setIncome] = useState("");
  const [limit, setLimit] = useState("");
  useEffect(() => {
    if (!open || !s) return;
    setDate(s.nextPayday ?? "");
    setIncome(centsToInput(s.expectedIncome));
    setLimit(centsToInput(s.monthlyLimit));
  }, [open, s]);
  const save = useAction(() =>
    api("/settings", {
      method: "PATCH",
      body: { nextPayday: date || null, expectedIncome: income ? parseBRL(income) : null, monthlyLimit: limit ? parseBRL(limit) : null },
    }),
  );
  return (
    <Sheet open={open} onClose={onClose} title="Próximo salário" footer={<Button size="lg" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Salvar</Button>}>
      <div className="space-y-4">
        <p className="text-[14px] text-ink-2">Seu salário não tem data fixa. Diga quando deve entrar o próximo; o gasto por dia e o "Posso comprar?" contam até lá.</p>
        <Field label="Data do próximo recebimento">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Valor esperado" hint="Opcional, só para referência.">
          <MoneyInput value={income} onChange={setIncome} />
        </Field>
        <Field label="Limite de gastos do mês" hint="Opcional. Você recebe um aviso ao chegar em 80% e ao passar.">
          <MoneyInput value={limit} onChange={setLimit} />
        </Field>
        <ErrorNote error={save.error} />
      </div>
    </Sheet>
  );
}
