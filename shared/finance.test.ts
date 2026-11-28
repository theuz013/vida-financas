import { describe, expect, it } from "vitest";
import {
  bucketBalances,
  canBuy,
  cardInvoices,
  cardSummary,
  checkingBalance,
  closingDateFor,
  dueDateFor,
  forecast,
  nextDueDate,
  type AccountLike,
  type BillLike,
  type TxLike,
} from "./finance";
import { addMonths, monthlyRuleOccursOn, nextMonthlyOccurrence, todayIn } from "./dates";
import { parseBRL, splitInstallments } from "./money";

const wallet: AccountLike = {
  id: "w",
  name: "Carteira",
  kind: "checking",
  openingBalance: 100_000,
  creditLimit: null,
  closingDay: null,
  dueDay: null,
};
const card: AccountLike = {
  id: "c",
  name: "Nubank",
  kind: "card",
  openingBalance: 0,
  creditLimit: 500_000,
  closingDay: 3,
  dueDay: 10,
};

let n = 0;
const tx = (p: Partial<TxLike>): TxLike => ({
  id: `t${n++}`,
  type: "expense",
  amount: 0,
  accountId: "w",
  toAccountId: null,
  date: "2026-11-27",
  installmentsTotal: 1,
  installmentCurrent: 1,
  ...p,
});
const bill = (p: Partial<BillLike>): BillLike => ({
  id: `b${n++}`,
  name: "Conta",
  amount: 0,
  dueDate: "2026-11-30",
  status: "pending",
  recurrence: "monthly",
  ...p,
});

describe("dinheiro", () => {
  it("entende valores em formato brasileiro", () => {
    expect(parseBRL("67,54")).toBe(6754);
    expect(parseBRL("R$ 1.234,56")).toBe(123456);
    expect(parseBRL("1.234")).toBe(123400);
    expect(parseBRL("68.03")).toBe(6803);
    expect(parseBRL("50")).toBe(5000);
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL(12.5)).toBe(1250);
  });
  it("divide parcelas sem perder centavos", () => {
    expect(splitInstallments(10_000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10_000, 3).reduce((a, b) => a + b)).toBe(10_000);
  });
});

describe("datas", () => {
  it("ajusta dia 31 em meses curtos", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(nextMonthlyOccurrence(31, "2026-02-10")).toBe("2026-02-28");
    expect(monthlyRuleOccursOn(31, "2026-04-30")).toBe(true);
    expect(monthlyRuleOccursOn(17, "2026-04-17")).toBe(true);
    expect(monthlyRuleOccursOn(17, "2026-04-16")).toBe(false);
  });
  it("calcula hoje no fuso de Brasília", () => {
    // 01:30 UTC do dia 28 ainda é dia 27 em São Paulo
    expect(todayIn("America/Sao_Paulo", new Date("2026-11-28T01:30:00Z"))).toBe("2026-11-27");
  });
  it("conta recorrente avança um mês", () => {
    expect(nextDueDate("2026-11-26", "monthly")).toBe("2026-12-26");
    expect(nextDueDate("2026-11-26", "yearly")).toBe("2027-11-26");
    expect(nextDueDate("2026-11-26", "none")).toBeNull();
  });
});

describe("saldo de conta", () => {
  it("soma receitas, desconta gastos e considera transferências", () => {
    const txs = [
      tx({ type: "income", amount: 50_000 }),
      tx({ type: "expense", amount: 20_000 }),
      tx({ type: "transfer", amount: 10_000, toAccountId: "c" }),
    ];
    expect(checkingBalance(wallet, txs)).toBe(120_000);
  });
});

describe("cartão", () => {
  it("compra antes do fechamento cai na fatura do mês; no dia do fechamento, na seguinte", () => {
    expect(closingDateFor(card, "2026-11-02")).toBe("2026-11-03");
    expect(closingDateFor(card, "2026-11-03")).toBe("2026-12-03");
    expect(dueDateFor(card, "2026-12-03")).toBe("2026-12-10");
    // cartão que vence antes do dia de fechamento: vencimento no mês seguinte
    const late = { ...card, closingDay: 25, dueDay: 5 };
    expect(dueDateFor(late, "2026-11-25")).toBe("2026-12-05");
  });

  it("distribui parcelas nas faturas seguintes e calcula limite disponível", () => {
    const txs = [tx({ accountId: "c", amount: 30_000, installmentsTotal: 3, date: "2026-11-27" })];
    const inv = cardInvoices(card, txs, "2026-11-27");
    const withValue = inv.filter((i) => i.total > 0).map((i) => [i.closingDate, i.total]);
    expect(withValue).toEqual([
      ["2026-12-03", 10_000],
      ["2027-01-03", 10_000],
      ["2027-02-03", 10_000],
    ]);
    const s = cardSummary(card, txs, "2026-11-27");
    expect(s.used).toBe(30_000);
    expect(s.available).toBe(470_000);
    expect(s.current?.total).toBe(10_000);
    expect(s.upcoming).toHaveLength(2);
  });

  it("compra já parcelada (parcela 3 de 5) só lança as que faltam", () => {
    const txs = [
      tx({ accountId: "c", amount: 50_000, installmentsTotal: 5, installmentCurrent: 3 }),
    ];
    const s = cardSummary(card, txs, "2026-11-27");
    expect(s.used).toBe(30_000);
  });

  it("pagamento de fatura libera limite e marca a fatura como paga", () => {
    const txs = [
      tx({ accountId: "c", amount: 20_000, date: "2026-10-15" }),
      tx({ type: "transfer", amount: 20_000, accountId: "w", toAccountId: "c", date: "2026-11-09" }),
    ];
    const inv = cardInvoices(card, txs, "2026-11-27").find((i) => i.closingDate === "2026-11-03");
    expect(inv?.status).toBe("paid");
    expect(cardSummary(card, txs, "2026-11-27").available).toBe(500_000);
  });

  it("fatura fechada e não paga depois do vencimento fica vencida", () => {
    const txs = [tx({ accountId: "c", amount: 20_000, date: "2026-10-15" })];
    const inv = cardInvoices(card, txs, "2026-11-27").find((i) => i.closingDate === "2026-11-03");
    expect(inv?.status).toBe("overdue");
  });
});

describe("gasto por dia até o próximo salário", () => {
  it("desconta contas e faturas que vencem antes do salário", () => {
    const txs = [tx({ accountId: "c", amount: 20_000, date: "2026-11-20" })]; // fatura fecha 03/12, vence 10/12
    const bills = [
      bill({ name: "Internet", amount: 6754, dueDate: "2026-11-26" }), // vencida, ainda conta
      bill({ name: "Energia", amount: 6803, dueDate: "2026-11-27" }),
      bill({ name: "Água", amount: null, dueDate: "2026-12-05" }),
      bill({ name: "Depois do salário", amount: 99_999, dueDate: "2026-12-20" }),
      bill({ name: "Já paga", amount: 50_000, status: "paid" }),
    ];
    const fc = forecast({
      accounts: [wallet, card],
      txs,
      bills,
      today: "2026-11-27",
      nextPayday: "2026-12-15",
    });
    expect(fc.cash).toBe(100_000);
    expect(fc.committed).toBe(6754 + 6803 + 20_000);
    expect(fc.free).toBe(100_000 - 33_557);
    expect(fc.days).toBe(18);
    expect(fc.perDay).toBe(Math.floor(66_443 / 18));
    expect(fc.unknownBills).toBe(1);
    expect(fc.paydayAssumed).toBe(false);
  });

  it("sem data de salário, assume o início do mês seguinte e avisa", () => {
    const fc = forecast({ accounts: [wallet], txs: [], bills: [], today: "2026-11-27", nextPayday: null });
    expect(fc.payday).toBe("2026-12-01");
    expect(fc.paydayAssumed).toBe(true);
  });
});

describe("posso comprar isso?", () => {
  const base = {
    accounts: [wallet, card],
    txs: [] as TxLike[],
    bills: [bill({ amount: 60_000, dueDate: "2026-12-05" })],
    today: "2026-11-27",
    nextPayday: "2026-12-15",
  };

  it("Pix: cabe, aperta ou não cabe", () => {
    expect(canBuy({ ...base, amount: 30_000, method: "pix" }).options[0].verdict).toBe("cabe");
    expect(canBuy({ ...base, amount: 50_000, method: "pix" }).options[0].verdict).toBe("aperta");
    expect(canBuy({ ...base, amount: 150_000, method: "pix" }).options[0].verdict).toBe("nao_cabe");
  });

  it("crédito: parcela que vence antes do salário pesa no caixa", () => {
    // hoje 27/11, fatura atual fecha 03/12 e vence 10/12 (antes do salário 15/12)
    const r = canBuy({ ...base, amount: 120_000, method: "credit", installments: 3 });
    const opt = r.options[0];
    expect(opt.installmentAmount).toBe(40_000);
    expect(opt.impactBeforePayday).toBe(40_000);
    expect(opt.verdict).toBe("cabe");
    const big = canBuy({ ...base, amount: 120_000, method: "credit", installments: 1 });
    expect(big.options[0].verdict).toBe("aperta");
    const over = canBuy({ ...base, amount: 600_000, method: "credit", installments: 10 });
    expect(over.options[0].verdict).toBe("nao_cabe");
  });
});

describe("quatro baldes", () => {
  const corrente: AccountLike = { ...wallet, id: "cc", name: "Corrente", kind: "checking", bucket: "checking", openingBalance: 100_000 };
  const carteira: AccountLike = { ...wallet, id: "cw", name: "Carteira em dinheiro", kind: "checking", bucket: "cash", openingBalance: 20_000 };
  const guardado: AccountLike = { ...wallet, id: "cg", name: "Caixinha", kind: "checking", bucket: "saved", openingBalance: 300_000 };
  const investido: AccountLike = { ...wallet, id: "ci", name: "Tesouro", kind: "checking", bucket: "invested", openingBalance: 900_000 };
  const all = [corrente, carteira, guardado, investido];

  it("separa o saldo em quatro baldes", () => {
    const b = bucketBalances(all, []);
    expect(b).toEqual({ checking: 100_000, cash: 20_000, saved: 300_000, invested: 900_000 });
  });

  it("gasto por dia = (corrente + carteira − contas e faturas) ÷ dias; guardado e investido ficam de fora", () => {
    const fc = forecast({
      accounts: all,
      txs: [],
      bills: [bill({ amount: 30_000, dueDate: "2026-12-05" })],
      today: "2026-11-27",
      nextPayday: "2026-12-07",
    });
    // (100.000 + 20.000 − 30.000) ÷ 10 dias = 9.000 por dia
    expect(fc.cash).toBe(120_000);
    expect(fc.free).toBe(90_000);
    expect(fc.perDay).toBe(9_000);
    expect(fc.buckets.saved).toBe(300_000);
    expect(fc.buckets.invested).toBe(900_000);
  });

  it("guardado e investido nunca entram, nem com valor muito alto", () => {
    const fc = forecast({ accounts: [guardado, investido], txs: [], bills: [], today: "2026-11-27", nextPayday: "2026-12-07" });
    expect(fc.cash).toBe(0);
    expect(fc.perDay).toBe(0);
  });

  it("Posso comprar (pix/débito) olha só o que é gastável", () => {
    // 500 reais: só a carteira (200) + a corrente (1000) são gastáveis
    const r = canBuy({
      amount: 150_000,
      method: "pix",
      accounts: all,
      txs: [],
      bills: [],
      today: "2026-11-27",
      nextPayday: "2026-12-07",
    });
    const names = r.options.map((o) => o.accountName);
    expect(names).toEqual(expect.arrayContaining(["Corrente", "Carteira em dinheiro"]));
    expect(names).not.toContain("Caixinha");
    expect(names).not.toContain("Tesouro");
    // guardado de 3.000 não pode fazer a compra de 1.500 caber na Caixinha
    expect(r.options.find((o) => o.accountName === "Carteira em dinheiro")?.verdict).toBe("nao_cabe");
  });
});
