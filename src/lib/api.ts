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

export interface Account {
  id: string;
  name: string;
  kind: "checking" | "card";
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
  money: { perDay: number; free: number; payday: string; paydayAssumed: boolean; days: number };
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
