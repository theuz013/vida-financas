import { useMutation, useQuery, useQueryClient, QueryClient } from "@tanstack/react-query";
import type { CardSummary, Forecast, Invoice, CanBuyOption } from "@shared/finance";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) queryClient.setQueryData(["me"], null);
    throw new ApiError((data as { error?: string; message?: string }).error ?? (data as { message?: string }).message ?? "Algo deu errado.", res.status);
  }
  return data as T;
}

/* ---------- tipos ---------- */

export type { Bucket } from "@shared/finance";
import type { Bucket } from "@shared/finance";
export const BUCKET_LABEL: Record<Bucket, string> = {
  checking: "Conta corrente",
  cash: "Carteira em dinheiro",
  saved: "Guardado",
  invested: "Investido",
};
export const BUCKET_HINT: Record<Bucket, string> = {
  checking: "Entra no gasto por dia",
  cash: "Entra no gasto por dia",
  saved: "Não entra no gasto por dia",
  invested: "Não entra no gasto por dia",
};

export interface Account {
  id: string;
  name: string;
  kind: "checking" | "card";
  bucket: Bucket;
  openingBalance: number;
  creditLimit: number | null;
  closingDay: number | null;
  dueDay: number | null;
  archived: boolean;
  balance?: number;
  card?: CardSummary;
}
export interface Category {
  id: string;
  name: string;
  emoji: string;
  kind: "expense" | "income";
}
export interface Transaction {
  id: string;
  type: "expense" | "income" | "transfer";
  amount: number;
  description: string;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  date: string;
  installmentsTotal: number;
  installmentCurrent: number;
  source: "manual" | "whatsapp" | "import" | "bill";
}
export interface Bill {
  id: string;
  name: string;
  amount: number | null;
  dueDate: string;
  recurrence: "none" | "monthly" | "yearly";
  accountId: string | null;
  categoryId: string | null;
  status: "pending" | "paid";
  paidAt: number | null;
  source: string;
}
export interface Area {
  id: string;
  name: string;
  sort: number;
}
export interface Task {
  id: string;
  title: string;
  areaId: string | null;
  areaName?: string | null;
  dueDate: string | null;
  priority: "low" | "normal" | "high";
  done: boolean;
  remindAt: number | null;
}
export interface CalEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  remindMinutes: number | null;
  areaId: string | null;
  areaName?: string | null;
}
export interface Reminder {
  id: string;
  title: string;
  dayOfMonth: number;
  notifyEve: boolean;
  active: boolean;
  areaId: string | null;
  areaName?: string | null;
  lastDoneDate: string | null;
}
export interface Deadline {
  id: string;
  title: string;
  date: string;
  alertDaysBefore: number;
  areaId: string | null;
  areaName?: string | null;
  done: boolean;
  notes: string | null;
  daysLeft?: number;
}
export interface Settings {
  timezone: string;
  nextPayday: string | null;
  expectedIncome: number | null;
  monthlyLimit: number | null;
}
export interface TodayData {
  today: string;
  bills: { today: Bill[]; overdue: Bill[]; tomorrow: Bill[] };
  invoices: { cardId: string; cardName: string; dueDate: string; remaining: number; status: Invoice["status"] }[];
  tasks: { today: Task[]; overdue: Task[] };
  events: { today: CalEvent[]; tomorrow: CalEvent[] };
  reminders: { today: Reminder[]; tomorrow: Reminder[] };
  deadlines: (Deadline & { daysLeft: number })[];
  money: {
    perDay: number;
    free: number;
    payday: string;
    paydayAssumed: boolean;
    days: number;
    hasData: boolean;
    /** Os quatro baldes, separados. */
    buckets: Record<Bucket, number>;
    /** Gastável: corrente + carteira em dinheiro. */
    spendable: number;
  };
  house: HouseToday | null;
}
export interface Summary {
  month: string;
  income: number;
  expense: number;
  balance: number;
  count: number;
  categories: { categoryId: string | null; name: string; emoji: string; total: number; share: number }[];
  monthlyLimit: number | null;
}
export type { Forecast, Invoice, CanBuyOption, CardSummary };
export interface InvoiceDetail {
  card: Account;
  summary: CardSummary;
  invoices: (Omit<Invoice, "items"> & { items: (Invoice["items"][number] & { description: string; date?: string })[] })[];
}
export interface Pendencia {
  area: Area;
  tasks: Task[];
  deadlines: (Deadline & { daysLeft: number })[];
  overdue: number;
  open: number;
}

/* ---------- consultas ---------- */

export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await api<{ user: { id: string; name: string; email: string; isDemo?: boolean } | null }>("/me");
      return r.user;
    },
    staleTime: 5 * 60_000,
  });

export const useToday = () => useQuery({ queryKey: ["today"], queryFn: () => api<TodayData>("/today") });
export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/accounts") });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories") });
export const useAreas = () => useQuery({ queryKey: ["areas"], queryFn: () => api<Area[]>("/areas") });
export const useTransactions = (month: string) =>
  useQuery({ queryKey: ["transactions", month], queryFn: () => api<Transaction[]>(`/transactions?month=${month}`) });
export const useAccountTransactions = (accountId: string) =>
  useQuery({ queryKey: ["transactions", "account", accountId], queryFn: () => api<Transaction[]>(`/transactions?accountId=${accountId}`) });
export const useBills = (status: "pending" | "paid") =>
  useQuery({ queryKey: ["bills", status], queryFn: () => api<Bill[]>(`/bills?status=${status}`) });
export const useForecast = () => useQuery({ queryKey: ["forecast"], queryFn: () => api<Forecast>("/forecast") });
export const useSummary = (month: string) =>
  useQuery({ queryKey: ["summary", month], queryFn: () => api<Summary>(`/summary?month=${month}`) });
export const useInvoices = (cardId: string) =>
  useQuery({ queryKey: ["invoices", cardId], queryFn: () => api<InvoiceDetail>(`/cards/${cardId}/invoices`) });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });
export const useList = <T,>(path: "tasks" | "events" | "reminders" | "deadlines") =>
  useQuery({ queryKey: [path], queryFn: () => api<T[]>(`/${path}`) });
export const usePendencias = () => useQuery({ queryKey: ["pendencias"], queryFn: () => api<Pendencia[]>("/pendencias") });

/** Mutação que, ao terminar, recarrega tudo (os números do app são interligados). */
export function useAction<V = void, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" }),
  });
}

/* ---------- casa (vertente familiar) ---------- */

export interface HouseMember {
  id: string;
  userId: string;
  name: string;
  email?: string;
  role: "admin" | "member";
  isChild: boolean;
  canFinance: boolean;
  canCreateTasks: boolean;
  canShopping: boolean;
  permissions: { finance: boolean; createTasks: boolean; shopping: boolean };
}
export interface HouseData {
  household: { id: string; name: string } | null;
  me?: HouseMember;
  members?: HouseMember[];
  invite?: { code: string; expiresAt: number } | null;
}
export interface HouseBill extends Bill {
  householdId: string;
  paidBy: string | null;
  paidByName: string | null;
}
export interface HouseTask extends Task {
  assigneeId: string | null;
  assigneeName: string | null;
}
export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string | null;
  checked: boolean;
  addedBy: string | null;
  addedByName: string | null;
}
export interface HouseSummary {
  month: string;
  total: number;
  paid: number;
  pending: number;
  unknown: number;
  byMember: { userId: string; name: string; total: number }[];
}
export interface HouseToday {
  name: string;
  canFinance: boolean;
  bills: { today: Bill[]; overdue: Bill[]; tomorrow: Bill[] };
  tasks: HouseTask[];
  events: CalEvent[];
}

export const useHouse = () => useQuery({ queryKey: ["household"], queryFn: () => api<HouseData>("/household") });
export const useHouseBills = (status: "pending" | "paid", enabled = true) =>
  useQuery({ queryKey: ["household", "bills", status], queryFn: () => api<HouseBill[]>(`/household/bills?status=${status}`), enabled });
export const useHouseSummary = (enabled = true) =>
  useQuery({ queryKey: ["household", "summary"], queryFn: () => api<HouseSummary>("/household/bills/summary"), enabled });
export const useHouseTasks = () => useQuery({ queryKey: ["household", "tasks"], queryFn: () => api<HouseTask[]>("/household/tasks") });
export const useHouseEvents = () => useQuery({ queryKey: ["household", "events"], queryFn: () => api<CalEvent[]>("/household/events") });
export interface ShoppingList {
  id: string;
  name: string;
  date: string;
  total: number;
  open: number;
}
export interface ShoppingListDetail extends Omit<ShoppingList, "total" | "open"> {
  items: ShoppingItem[];
  canEdit: boolean;
}
export const useShoppingLists = () => useQuery({ queryKey: ["household", "shopping-lists"], queryFn: () => api<ShoppingList[]>("/household/shopping-lists") });
export const useShoppingList = (id: string) =>
  useQuery({ queryKey: ["household", "shopping-lists", id], queryFn: () => api<ShoppingListDetail>(`/household/shopping-lists/${id}`) });
