import { createContext, useContext, useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { House, ListChecks, Plus, Settings, Wallet } from "lucide-react";
import { cx } from "./ui";
import { QuickAdd, type QuickAddPreset } from "./QuickAdd";
import { useMe } from "@/lib/api";

const QuickAddCtx = createContext<(p?: QuickAddPreset) => void>(() => {});
export const useQuickAdd = () => useContext(QuickAddCtx);

const items = [
  { to: "/", label: "Hoje", icon: House, end: true },
  { to: "/financas", label: "Finanças", icon: Wallet },
  { to: "/vida", label: "Vida", icon: ListChecks },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
];

export function Layout() {
  const [preset, setPreset] = useState<QuickAddPreset | null>(null);
  const { data: me } = useMe();

  return (
    <QuickAddCtx.Provider value={(p) => setPreset(p ?? {})}>
      <div className="md:flex">
        {/* computador: menu lateral */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-sunken/50 px-3 py-6 md:flex">
          <div className="px-3 pb-6 text-[17px] font-extrabold tracking-[-0.02em]">Vida &amp; Finanças</div>
          <nav className="flex flex-col gap-0.5">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) =>
                  cx("flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors", isActive ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")
                }
              >
                <it.icon className="size-[18px]" aria-hidden />
                {it.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setPreset({})}
            className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-semibold text-on-accent shadow-cta hover:opacity-90"
          >
            <Plus className="size-[18px]" aria-hidden /> Registrar
          </button>
          {me?.isDemo ? <p className="mt-auto px-3 text-[12.5px] text-ink-3">Modo demonstração: dados de exemplo, apagados em 24h.</p> : null}
        </aside>

        <main className="mx-auto w-full max-w-3xl px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-32 md:px-8 md:pt-10 md:pb-16">
          {me?.isDemo ? (
            <p className="mb-4 rounded-xl bg-warn-soft px-3.5 py-2 text-[13px] font-medium text-warn md:hidden">Modo demonstração: dados de exemplo.</p>
          ) : null}
          <Outlet />
        </main>
      </div>

      {/* celular: barra de abas com o botão de registrar no meio */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-2 pt-1.5 backdrop-blur md:hidden" aria-label="Principal">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center">
          {items.slice(0, 2).map((it) => (
            <Tab key={it.to} {...it} />
          ))}
          <div className="grid place-items-center">
            <button
              type="button"
              aria-label="Registrar"
              onClick={() => setPreset({})}
              className="grid size-12 place-items-center rounded-full bg-accent text-on-accent shadow-cta active:scale-95 transition-transform"
            >
              <Plus className="size-6" aria-hidden />
            </button>
          </div>
          {items.slice(2).map((it) => (
            <Tab key={it.to} {...it} />
          ))}
        </div>
      </nav>

      <QuickAdd preset={preset} onClose={() => setPreset(null)} />
    </QuickAddCtx.Provider>
  );
}

function Tab({ to, label, icon: Icon, end }: (typeof items)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cx("flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold transition-colors", isActive ? "text-ink" : "text-ink-3")}
    >
      <Icon className="size-[22px]" aria-hidden strokeWidth={2} />
      {label}
    </NavLink>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
