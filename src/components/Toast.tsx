import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastData {
  id: number;
  message: string;
  action?: { label: string; run: () => void | Promise<unknown> };
}

const Ctx = createContext<(message: string, action?: ToastData["action"]) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** Aviso curto no rodapé, com ação opcional ("Desfazer"). Some sozinho em 5s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((message: string, action?: ToastData["action"]) => {
    clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, action });
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 5000);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 flex justify-center px-4 md:bottom-8">
        {toast ? (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-md items-center gap-4 rounded-2xl bg-hero py-2.5 pr-2.5 pl-4 text-[14.5px] font-medium text-on-hero shadow-cta motion-safe:animate-[toast-in_220ms_cubic-bezier(0.16,1,0.3,1)]"
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="h-9 shrink-0 rounded-xl px-3 text-[14px] font-bold text-on-hero underline-offset-4 hover:bg-white/10"
                onClick={async () => {
                  const a = toast.action!;
                  setToast(null);
                  await a.run();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
