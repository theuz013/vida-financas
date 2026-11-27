import { useEffect, useMemo, useState } from "react";
import { api, useAccounts, useAction, useAreas, useCategories, type Transaction } from "@/lib/api";
import { localToday, parseBRL, centsToInput } from "@/lib/format";
import { Button, ErrorNote, Field, Input, MoneyInput, Select, Sheet, cx } from "./ui";
import { useToast } from "./Toast";
import { formatBRL } from "@/lib/format";

export interface QuickAddPreset {
  mode?: Mode;
  edit?: Transaction;
  accountId?: string;
}
type Mode = "expense" | "income" | "transfer" | "task";

const modes: { value: Mode; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferir" },
  { value: "task", label: "Tarefa" },
];

/** Registro rápido: valor, categoria, conta e pronto. */
export function QuickAdd({ preset, onClose }: { preset: QuickAddPreset | null; onClose: () => void }) {
  const open = preset !== null;
  const edit = preset?.edit;
  const [mode, setMode] = useState<Mode>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [date, setDate] = useState(localToday());
  const [installments, setInstallments] = useState(1);
  const [current, setCurrent] = useState(1);
  const [areaId, setAreaId] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: areas = [] } = useAreas();
  const active = accounts.filter((a) => !a.archived);

  useEffect(() => {
    if (!preset) return;
    setFormError(null);
    if (preset.edit) {
      const t = preset.edit;
      setMode(t.type);
      setAmount(centsToInput(t.amount));
      setDescription(t.description);
      setCategoryId(t.categoryId);
      setAccountId(t.accountId);
      setToAccountId(t.toAccountId ?? "");
      setDate(t.date);
      setInstallments(t.installmentsTotal);
      setCurrent(t.installmentCurrent);
    } else {
      setMode(preset.mode ?? "expense");
      setAmount("");
      setDescription("");
      setCategoryId(null);
      setAccountId(preset.accountId ?? "");
      setToAccountId("");
      setDate(localToday());
      setInstallments(1);
      setCurrent(1);
      setAreaId("");
      setPriority("normal");
    }
  }, [preset]);

  // conta padrão: primeira corrente (gasto/receita) ou a escolhida
  useEffect(() => {
    if (!open || accountId || active.length === 0) return;
    setAccountId((active.find((a) => a.kind === "checking") ?? active[0]).id);
  }, [open, accountId, active]);

  const account = active.find((a) => a.id === accountId);
  const isCard = account?.kind === "card";
  const cats = useMemo(() => categories.filter((c) => c.kind === (mode === "income" ? "income" : "expense")), [categories, mode]);
  const sourceAccounts = mode === "income" ? active.filter((a) => a.kind === "checking") : active;

  const save = useAction(async () => {
    if (mode === "task") {
      if (!description.trim()) throw new Error("Escreva o que precisa ser feito.");
      return api("/tasks", { body: { title: description.trim(), dueDate: date || null, areaId: areaId || null, priority } });
    }
    const cents = parseBRL(amount);
    if (!cents || cents <= 0) throw new Error("Informe o valor.");
    if (!accountId) throw new Error("Escolha a conta.");
    const cat = cats.find((c) => c.id === categoryId);
    const body = {
      type: mode,
      amount: cents,
      description: description.trim() || cat?.name || (mode === "transfer" ? "Transferência" : "Sem descrição"),
      categoryId: mode === "transfer" ? null : categoryId,
      accountId,
      toAccountId: mode === "transfer" ? toAccountId : null,
      date,
      installmentsTotal: mode === "expense" && isCard ? installments : 1,
      installmentCurrent: mode === "expense" && isCard ? Math.min(current, installments) : 1,
    };
    if (mode === "transfer" && !toAccountId) throw new Error("Escolha a conta de destino.");
    return edit ? api(`/transactions/${edit.id}`, { method: "PATCH", body }) : api<{ id: string; amount: number }>("/transactions", { body });
  });
  const toast = useToast();
  const undo = useAction((id: string) => api(`/transactions/${id}`, { method: "DELETE" }));

  const remove = useAction(async () => {
    if (edit && window.confirm("Apagar este lançamento?")) await api(`/transactions/${edit.id}`, { method: "DELETE" });
  });

  const submit = async () => {
    setFormError(null);
    try {
      const created = (await save.mutateAsync()) as { id?: string; amount?: number; title?: string } | undefined;
      onClose();
      if (mode === "task") toast("Tarefa criada.");
      else if (edit) toast("Lançamento atualizado.");
      else if (created?.id) {
        const label = mode === "income" ? "Receita" : mode === "transfer" ? "Transferência" : "Gasto";
        toast(`${label} de ${formatBRL(created.amount ?? 0)} registrado.`, { label: "Desfazer", run: () => undo.mutateAsync(created.id!) });
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Não deu para salvar.");
    }
  };

  const title = edit ? "Editar lançamento" : "Registrar";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          {edit ? (
            <Button variant="danger" onClick={async () => { await remove.mutateAsync(); onClose(); }} loading={remove.isPending}>
              Apagar
            </Button>
          ) : null}
          <Button size="lg" onClick={submit} loading={save.isPending} className="flex-1">
            {mode === "task" ? "Salvar tarefa" : edit ? "Salvar" : mode === "income" ? "Registrar receita" : mode === "transfer" ? "Transferir" : "Registrar gasto"}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!edit ? (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="radiogroup" aria-label="Tipo">
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => { setMode(m.value); setCategoryId(null); }}
                className={cx(
                  "h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold transition-colors",
                  mode === m.value ? "bg-accent text-on-accent" : "bg-sunken text-ink-2 hover:text-ink",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : null}

        {mode === "task" ? (
          <>
            <Field label="O que precisa ser feito">
              <Input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: levar o carro na revisão" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prazo">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Frente">
                <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                  <option value="">Sem frente</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Prioridade">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                <option value="high">Alta</option>
                <option value="normal">Normal</option>
                <option value="low">Baixa</option>
              </Select>
            </Field>
          </>
        ) : (
          <>
            <MoneyInput large autoFocus={!edit} value={amount} onChange={setAmount} aria-label="Valor" />

            {mode !== "transfer" ? (
              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold text-ink-2">Categoria</legend>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {cats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={categoryId === c.id}
                      onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                      className={cx(
                        "flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11.5px] font-medium leading-tight transition-colors",
                        categoryId === c.id ? "bg-accent text-on-accent" : "bg-sunken text-ink-2 hover:text-ink",
                      )}
                    >
                      <span aria-hidden className="text-[20px] leading-none">{c.emoji}</span>
                      <span className="line-clamp-2 text-center">{c.name}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <Field label="Descrição" hint={mode !== "transfer" ? "Opcional. Sem descrição, fica o nome da categoria." : undefined}>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={mode === "income" ? "Ex.: salário" : "Ex.: padaria"} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={mode === "transfer" ? "De" : mode === "income" ? "Entrou em" : "Pago com"}>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {sourceAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.kind === "card" ? `${a.name} (crédito)` : a.name}</option>
                  ))}
                </Select>
              </Field>
              {mode === "transfer" ? (
                <Field label="Para">
                  <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                    <option value="">Escolha</option>
                    {active.filter((a) => a.id !== accountId).map((a) => (
                      <option key={a.id} value={a.id}>{a.kind === "card" ? `${a.name} (pagar fatura)` : a.name}</option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Data">
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              )}
            </div>

            {mode === "transfer" ? (
              <Field label="Data">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            ) : null}

            {mode === "expense" && isCard ? (
              <Field label="Parcelas" hint={installments > 1 && parseBRL(amount) ? `${installments}× de ${centsToInput(Math.floor((parseBRL(amount) ?? 0) / installments))}` : undefined}>
                <Select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n === 1 ? "À vista" : `${n}×`}</option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {mode === "expense" && isCard && installments > 1 ? (
              <Field label="Parcela atual" hint="Para compra antiga: em qual parcela ela está hoje. Só as que faltam entram nas faturas.">
                <Select value={current} onChange={(e) => setCurrent(Number(e.target.value))}>
                  {Array.from({ length: installments }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n === 1 ? "Compra nova (1ª parcela)" : `${n}ª de ${installments}`}</option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {active.length === 0 ? <p className="text-[14px] text-ink-2">Cadastre uma conta em Finanças para registrar.</p> : null}
          </>
        )}
        <ErrorNote error={formError ? new Error(formError) : null} />
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
