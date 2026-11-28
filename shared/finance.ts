/**
 * Regras financeiras puras (sem banco, sem rede), usadas pelo Worker e pelo app.
 * Tudo em centavos e datas YYYY-MM-DD.
 */
import { addDays, addMonths, clampedDate, daysBetween, parts, type ISODate } from "./dates";
import { splitInstallments } from "./money";

/**
 * Os quatro baldes do dinheiro (não-cartão):
 * - checking: conta corrente (entra no gasto por dia)
 * - cash: carteira em dinheiro (entra, mas aparece separada)
 * - saved: guardado (não entra)
 * - invested: investido (não entra de jeito nenhum)
 */
export type Bucket = "checking" | "cash" | "saved" | "invested";
export const BUCKETS: Bucket[] = ["checking", "cash", "saved", "invested"];
/** Só estes baldes entram no "gasto por dia" e no "Posso comprar isso?". */
export const SPENDABLE_BUCKETS: Bucket[] = ["checking", "cash"];

export interface AccountLike {
  id: string;
  name: string;
  kind: "checking" | "card";
  /** Balde do dinheiro (só vale para conta, não para cartão). Padrão: conta corrente. */
  bucket?: Bucket;
  openingBalance: number;
  creditLimit: number | null;
  closingDay: number | null;
  dueDay: number | null;
  archived?: boolean;
}

export interface TxLike {
  id: string;
  type: "expense" | "income" | "transfer";
  amount: number;
  accountId: string;
  toAccountId: string | null;
  date: ISODate;
  installmentsTotal: number;
  installmentCurrent: number;
}

export interface BillLike {
  id: string;
  name: string;
  amount: number | null;
  dueDate: ISODate;
  status: "pending" | "paid";
  recurrence: "none" | "monthly" | "yearly";
}

/* ===================== Saldo de conta ===================== */

export const bucketOf = (a: AccountLike): Bucket => (a.kind === "card" ? "checking" : (a.bucket ?? "checking"));

/** Saldo de cada balde (contas não arquivadas, sem cartão). */
export function bucketBalances(accounts: AccountLike[], txs: TxLike[]): Record<Bucket, number> {
  const out: Record<Bucket, number> = { checking: 0, cash: 0, saved: 0, invested: 0 };
  for (const a of accounts) {
    if (a.archived || a.kind === "card") continue;
    out[bucketOf(a)] += checkingBalance(a, txs);
  }
  return out;
}

/** Saldo atual de uma conta corrente/carteira. */
export function checkingBalance(account: AccountLike, txs: TxLike[]): number {
  let balance = account.openingBalance;
  for (const t of txs) {
    if (t.type === "income" && t.accountId === account.id) balance += t.amount;
    else if (t.type === "expense" && t.accountId === account.id) balance -= t.amount;
    else if (t.type === "transfer") {
      if (t.accountId === account.id) balance -= t.amount;
      if (t.toAccountId === account.id) balance += t.amount;
    }
  }
  return balance;
}

/* ===================== Cartão e faturas ===================== */

export interface Invoice {
  /** Data de fechamento: identifica a fatura. */
  closingDate: ISODate;
  dueDate: ISODate;
  total: number;
  paid: number;
  remaining: number;
  status: "open" | "closed" | "paid" | "overdue";
  /** Parcelas e compras que compõem esta fatura. */
  items: { txId: string; installment: number; of: number; amount: number }[];
}

function requireCardDays(card: AccountLike): { closingDay: number; dueDay: number } {
  return { closingDay: card.closingDay ?? 1, dueDay: card.dueDay ?? 10 };
}

/**
 * Fechamento da fatura em que cai uma compra feita em `date`.
 * Compra no dia do fechamento (ou depois) já vai para a fatura seguinte.
 */
export function closingDateFor(card: AccountLike, date: ISODate): ISODate {
  const { closingDay } = requireCardDays(card);
  const { y, m } = parts(date);
  const thisMonth = clampedDate(y, m, closingDay);
  return date < thisMonth ? thisMonth : clampedDate(y, m + 1, closingDay);
}

/** Vencimento da fatura que fecha em `closingDate`: o próximo dia `dueDay` depois do fechamento. */
export function dueDateFor(card: AccountLike, closingDate: ISODate): ISODate {
  const { dueDay } = requireCardDays(card);
  const { y, m } = parts(closingDate);
  const same = clampedDate(y, m, dueDay);
  return same > closingDate ? same : clampedDate(y, m + 1, dueDay);
}

/** Todas as faturas do cartão (passadas e futuras), com pagamentos alocados da mais antiga para a mais nova. */
export function cardInvoices(card: AccountLike, txs: TxLike[], today: ISODate): Invoice[] {
  const { closingDay } = requireCardDays(card);
  const byClosing = new Map<ISODate, Invoice>();
  const get = (closingDate: ISODate) => {
    let inv = byClosing.get(closingDate);
    if (!inv) {
      inv = {
        closingDate,
        dueDate: dueDateFor(card, closingDate),
        total: 0,
        paid: 0,
        remaining: 0,
        status: "open",
        items: [],
      };
      byClosing.set(closingDate, inv);
    }
    return inv;
  };

  let credits = 0;
  for (const t of txs) {
    if (t.type === "expense" && t.accountId === card.id) {
      const parcels = splitInstallments(t.amount, t.installmentsTotal);
      const first = closingDateFor(card, t.date);
      for (let k = t.installmentCurrent; k <= t.installmentsTotal; k++) {
        const closing = addMonths(first, k - t.installmentCurrent, closingDay);
        const inv = get(closing);
        inv.total += parcels[k - 1];
        inv.items.push({ txId: t.id, installment: k, of: t.installmentsTotal, amount: parcels[k - 1] });
      }
    } else if (t.type === "transfer" && t.toAccountId === card.id) {
      credits += t.amount; // pagamento de fatura
    } else if (t.type === "income" && t.accountId === card.id) {
      credits += t.amount; // estorno / crédito no cartão
    }
  }

  // garante que a fatura atual exista, mesmo vazia
  get(closingDateFor(card, today));

  const list = [...byClosing.values()].sort((a, b) => a.closingDate.localeCompare(b.closingDate));
  for (const inv of list) {
    inv.paid = Math.min(inv.total, credits);
    credits -= inv.paid;
    inv.remaining = inv.total - inv.paid;
    if (inv.remaining === 0 && inv.total > 0) inv.status = "paid";
    else if (inv.closingDate > today) inv.status = "open";
    else if (inv.dueDate < today) inv.status = inv.remaining > 0 ? "overdue" : "paid";
    else inv.status = inv.remaining > 0 ? "closed" : "paid";
  }
  return list;
}

export interface CardSummary {
  cardId: string;
  limit: number;
  used: number;
  available: number;
  current: Invoice | undefined;
  upcoming: Invoice[];
  unpaidClosed: Invoice[];
}

export function cardSummary(card: AccountLike, txs: TxLike[], today: ISODate): CardSummary {
  const invoices = cardInvoices(card, txs, today);
  const used = invoices.reduce((s, i) => s + i.remaining, 0);
  const limit = card.creditLimit ?? 0;
  const currentClosing = closingDateFor(card, today);
  return {
    cardId: card.id,
    limit,
    used,
    available: limit - used,
    current: invoices.find((i) => i.closingDate === currentClosing),
    upcoming: invoices.filter((i) => i.closingDate > currentClosing && i.remaining > 0),
    unpaidClosed: invoices.filter((i) => i.closingDate < currentClosing && i.remaining > 0),
  };
}

/* ===================== Até o próximo salário ===================== */

export interface Commitment {
  kind: "bill" | "invoice";
  id: string;
  name: string;
  dueDate: ISODate;
  amount: number;
  /** Conta com valor ainda a confirmar (ex.: água, luz). */
  unknownAmount?: boolean;
}

export interface Forecast {
  today: ISODate;
  payday: ISODate;
  /** true quando o usuário não informou a data do próximo recebimento (usa o fim do mês). */
  paydayAssumed: boolean;
  days: number;
  /** Gastável: corrente + carteira em dinheiro. */
  cash: number;
  /** Os quatro baldes, para a tela mostrar separado. */
  buckets: Record<Bucket, number>;
  commitments: Commitment[];
  committed: number;
  free: number;
  perDay: number;
  unknownBills: number;
}

/**
 * Quanto dá para gastar até o próximo salário.
 * Dinheiro disponível nas contas − contas a pagar e faturas que vencem antes do salário.
 */
export function forecast(input: {
  accounts: AccountLike[];
  txs: TxLike[];
  bills: BillLike[];
  today: ISODate;
  nextPayday: ISODate | null;
}): Forecast {
  const { accounts, txs, bills, today } = input;
  let payday = input.nextPayday;
  let paydayAssumed = false;
  if (!payday || payday <= today) {
    const { y, m } = parts(today);
    payday = addDays(clampedDate(y, m + 1, 1), 0); // dia 1 do mês seguinte
    paydayAssumed = true;
  }

  const active = accounts.filter((a) => !a.archived);
  const buckets = bucketBalances(active, txs);
  // gastável = corrente + carteira em dinheiro; guardado e investido ficam de fora
  const cash = SPENDABLE_BUCKETS.reduce((s, b) => s + buckets[b], 0);

  const commitments: Commitment[] = [];
  for (const b of bills) {
    if (b.status !== "pending" || b.dueDate >= payday) continue;
    commitments.push({
      kind: "bill",
      id: b.id,
      name: b.name,
      dueDate: b.dueDate,
      amount: b.amount ?? 0,
      unknownAmount: b.amount == null,
    });
  }
  for (const card of active.filter((a) => a.kind === "card")) {
    for (const inv of cardInvoices(card, txs, today)) {
      if (inv.remaining > 0 && inv.dueDate < payday) {
        commitments.push({
          kind: "invoice",
          id: `${card.id}:${inv.closingDate}`,
          name: `Fatura ${card.name}`,
          dueDate: inv.dueDate,
          amount: inv.remaining,
        });
      }
    }
  }
  commitments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const committed = commitments.reduce((s, c) => s + c.amount, 0);
  const free = cash - committed;
  const days = Math.max(1, daysBetween(today, payday));
  return {
    today,
    payday,
    paydayAssumed,
    days,
    cash,
    buckets,
    commitments,
    committed,
    free,
    perDay: Math.floor(free / days),
    unknownBills: commitments.filter((c) => c.unknownAmount).length,
  };
}

/* ===================== Posso comprar isso? ===================== */

export type PayMethod = "pix" | "debit" | "credit";

export interface CanBuyOption {
  accountId: string;
  accountName: string;
  method: PayMethod;
  /** cabe = sobra dinheiro até o salário; aperta = dá para pagar, mas falta para as contas; nao_cabe = sem saldo/limite. */
  verdict: "cabe" | "aperta" | "nao_cabe";
  reason: string;
  /** Quanto sai antes do próximo salário por causa desta compra. */
  impactBeforePayday: number;
  perDayAfter: number;
  /** Quanto sobra até o salário depois da compra (negativo = falta). */
  freeAfter: number;
  installmentAmount: number;
}

export function canBuy(input: {
  amount: number;
  method: PayMethod;
  installments?: number;
  accounts: AccountLike[];
  txs: TxLike[];
  bills: BillLike[];
  today: ISODate;
  nextPayday: ISODate | null;
}): { forecast: Forecast; options: CanBuyOption[] } {
  const fc = forecast(input);
  const { amount, method, today } = input;
  const installments = method === "credit" ? Math.max(1, input.installments ?? 1) : 1;
  const parcels = splitInstallments(amount, installments);
  const options: CanBuyOption[] = [];
  const active = input.accounts.filter((a) => !a.archived);

  const judge = (impact: number) => {
    const freeAfter = fc.free - impact;
    return { freeAfter, perDayAfter: Math.floor(freeAfter / fc.days) };
  };

  if (method === "pix" || method === "debit") {
    for (const acc of active.filter((a) => a.kind === "checking" && SPENDABLE_BUCKETS.includes(bucketOf(a)))) {
      const balance = checkingBalance(acc, input.txs);
      const { freeAfter, perDayAfter } = judge(amount);
      let verdict: CanBuyOption["verdict"];
      let reason: string;
      if (balance < amount) {
        verdict = "nao_cabe";
        reason = "Saldo da conta não cobre a compra.";
      } else if (freeAfter < 0) {
        verdict = "aperta";
        reason = "Tem saldo, mas falta dinheiro para as contas até o próximo salário.";
      } else {
        verdict = "cabe";
        reason = "Cabe no saldo e sobra para as contas até o próximo salário.";
      }
      options.push({
        accountId: acc.id,
        accountName: acc.name,
        method,
        verdict,
        reason,
        impactBeforePayday: amount,
        perDayAfter,
        freeAfter,
        installmentAmount: amount,
      });
    }
  } else {
    for (const card of active.filter((a) => a.kind === "card")) {
      const summary = cardSummary(card, input.txs, today);
      const closing = closingDateFor(card, today);
      const { closingDay } = requireCardDays(card);
      // parcelas desta compra que vencem antes do salário
      let impact = 0;
      for (let k = 0; k < installments; k++) {
        const due = dueDateFor(card, addMonths(closing, k, closingDay));
        if (due < fc.payday) impact += parcels[k];
      }
      const { freeAfter, perDayAfter } = judge(impact);
      let verdict: CanBuyOption["verdict"];
      let reason: string;
      if (summary.available < amount) {
        verdict = "nao_cabe";
        reason = "Limite disponível do cartão não cobre a compra.";
      } else if (freeAfter < 0) {
        verdict = "aperta";
        reason = "Cabe no limite, mas a parcela vence antes do salário e falta dinheiro.";
      } else {
        verdict = "cabe";
        reason =
          impact > 0
            ? "Cabe no limite e dá para pagar a parcela que vence antes do salário."
            : "Cabe no limite e a primeira parcela só vence depois do salário.";
      }
      options.push({
        accountId: card.id,
        accountName: card.name,
        method,
        verdict,
        reason,
        impactBeforePayday: impact,
        perDayAfter,
        freeAfter,
        installmentAmount: parcels[0],
      });
    }
  }

  const rank = { cabe: 0, aperta: 1, nao_cabe: 2 } as const;
  options.sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.perDayAfter - a.perDayAfter);
  return { forecast: fc, options };
}

/* ===================== Contas recorrentes ===================== */

export function nextDueDate(dueDate: ISODate, recurrence: BillLike["recurrence"]): ISODate | null {
  if (recurrence === "monthly") return addMonths(dueDate, 1);
  if (recurrence === "yearly") return addMonths(dueDate, 12);
  return null;
}
