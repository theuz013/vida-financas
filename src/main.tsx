import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import "./styles.css";
import { queryClient, useMe } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Skeleton } from "@/components/ui";
import { ToastProvider } from "@/components/Toast";
import { TodayPage } from "@/pages/Today";
import { FinancePage } from "@/pages/Finance";
import { AccountPage, BillsPage, CanBuyPage, CardPage, SummaryPage, TransactionsPage } from "@/pages/FinanceTools";
import { AgendaPage, AreasPage, DeadlinesPage, LifeLayout, RemindersPage, TasksPage } from "@/pages/Life";
import { PrivacyPage, SettingsPage } from "@/pages/Settings";
import { LoginPage } from "@/pages/Login";
import { HouseAgendaPage, HouseBillsPage, HouseIndex, HouseLayout, HouseMembersPage, HouseShoppingListPage, HouseShoppingPage, HouseTasksPage } from "@/pages/House";

function RequireAuth() {
  const { data: me, isLoading, error } = useMe();
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-10">
        <Skeleton className="h-16" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (error) return <p className="p-6 text-bad">Sem conexão com o servidor. Tente de novo em instantes.</p>;
  if (!me) return <Navigate to="/entrar" replace />;
  return <Outlet />;
}

function NotFound() {
  return (
    <div className="pt-10 text-center">
      <p className="text-[17px] font-semibold">Página não encontrada.</p>
      <a href="/" className="mt-3 inline-block text-[15px] font-semibold text-ink-2 underline">Voltar para Hoje</a>
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/entrar", element: <LoginPage /> },
  { path: "/privacidade", element: <PrivacyPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <TodayPage /> },
          { path: "financas", element: <FinancePage /> },
          { path: "financas/lancamentos", element: <TransactionsPage /> },
          { path: "financas/contas", element: <BillsPage /> },
          { path: "financas/cartao/:id", element: <CardPage /> },
          { path: "financas/conta/:id", element: <AccountPage /> },
          { path: "financas/resumo", element: <SummaryPage /> },
          { path: "financas/posso-comprar", element: <CanBuyPage /> },
          {
            path: "vida",
            element: <LifeLayout />,
            children: [
              { index: true, element: <TasksPage /> },
              { path: "agenda", element: <AgendaPage /> },
              { path: "lembretes", element: <RemindersPage /> },
              { path: "prazos", element: <DeadlinesPage /> },
              { path: "frentes", element: <AreasPage /> },
            ],
          },
          {
            path: "casa",
            element: <HouseLayout />,
            children: [
              { index: true, element: <HouseIndex /> },
              { path: "contas", element: <HouseBillsPage /> },
              { path: "tarefas", element: <HouseTasksPage /> },
              { path: "agenda", element: <HouseAgendaPage /> },
              { path: "compras", element: <HouseShoppingPage /> },
              { path: "compras/:listId", element: <HouseShoppingListPage /> },
              { path: "membros", element: <HouseMembersPage /> },
            ],
          },
          { path: "ajustes", element: <SettingsPage /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
