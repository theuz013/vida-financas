import { useEffect, useState } from "react";
import { api, useAccounts, useAction, type Bill } from "@/lib/api";
import { centsToInput, formatBRL, localToday, parseBRL, shortDate } from "@/lib/format";
import { Button, ErrorNote, Field, Input, MoneyInput, Select, Sheet } from "./ui";
import { useToast } from "./Toast";

/** Marcar conta como paga: escolhe a conta usada e confirma o valor. */
export function PayBill({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const checking = accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localToday());

  useEffect(() => {
    if (!bill) return;
    setAccountId(bill.accountId ?? checking.find((a) => a.kind === "checking")?.id ?? "");
    setAmount(centsToInput(bill.amount));
    setDate(localToday());
  }, [bill]); // eslint-disable-line react-hooks/exhaustive-deps

  const toast = useToast();
  const unpay = useAction((id: string) => api(`/bills/${id}/unpay`, { body: {} }));
  const pay = useAction(() =>
    api(`/bills/${bill!.id}/pay`, { body: { accountId, amount: parseBRL(amount) ?? undefined, date } }),
  );

  return (
    <Sheet
      open={bill !== null}
      onClose={onClose}
      title={bill ? `Pagar ${bill.name}` : "Pagar"}
      footer={
        <Button size="lg" loading={pay.isPending} onClick={() =>
            pay.mutate(undefined, {
              onSuccess: () => {
                const b = bill!;
                onClose();
                toast(`${b.name} marcada como paga.`, { label: "Desfazer", run: () => unpay.mutateAsync(b.id) });
              },
            })
          }>
          Marcar como paga
        </Button>
      }
    >
      {bill ? (
        <div className="space-y-4">
          <p className="text-[14px] text-ink-2">
            Vence {shortDate(bill.dueDate)}
            {bill.recurrence !== "none" ? ". Ao pagar, a próxima já fica agendada." : "."}
          </p>
          <Field label="Valor pago" hint={bill.amount == null ? "Esta conta tem valor variável: informe o desta vez." : `Previsto: ${formatBRL(bill.amount)}`}>
            <MoneyInput value={amount} onChange={setAmount} autoFocus={bill.amount == null} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pago com">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Escolha</option>
                {checking.map((a) => (
                  <option key={a.id} value={a.id}>{a.kind === "card" ? `${a.name} (crédito)` : a.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Data">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <ErrorNote error={pay.error} />
        </div>
      ) : null}
    </Sheet>
  );
}
