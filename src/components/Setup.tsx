import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { Card, IconButton, cx } from "./ui";

interface SetupStatus {
  balances: boolean;
  cards: boolean;
  payday: boolean;
  notifications: boolean;
  assistant: boolean;
}

const steps: { key: keyof SetupStatus; title: string; hint: string; to: string }[] = [
  { key: "balances", title: "Cadastrar contas e saldos", hint: "Onde o dinheiro está hoje: banco, carteira.", to: "/financas" },
  { key: "cards", title: "Cadastrar cartões", hint: "Com limite, fechamento e vencimento.", to: "/financas" },
  { key: "payday", title: "Informar o próximo salário", hint: "Base do gasto por dia.", to: "/ajustes" },
  { key: "notifications", title: "Ativar notificações", hint: "Resumo às 8h e lembretes.", to: "/ajustes" },
  { key: "assistant", title: "Conectar o assistente", hint: "Chave para registrar pelo WhatsApp.", to: "/ajustes" },
];

const KEY = "vf.setup.dismissed";

/** Guia de primeiro uso. Some quando tudo estiver feito ou quando ele fechar. */
export function SetupGuide() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const { data } = useQuery({ queryKey: ["setup"], queryFn: () => api<SetupStatus>("/setup"), enabled: !dismissed });
  if (dismissed || !data) return null;
  const done = steps.filter((s) => data[s.key]).length;
  if (done === steps.length) return null;

  return (
    <Card className="mt-8 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="text-[17px] font-bold tracking-[-0.01em]">Comece por aqui</h2>
          <p className="num mt-0.5 text-[13.5px] text-ink-2">{done} de {steps.length} feitos</p>
        </div>
        <IconButton
          label="Esconder o guia"
          className="-mt-1 -mr-2"
          onClick={() => {
            try {
              localStorage.setItem(KEY, "1");
            } catch {
              /* sem armazenamento: só esconde nesta sessão */
            }
            setDismissed(true);
          }}
        >
          <X className="size-5" />
        </IconButton>
      </div>
      <ol className="mt-2 divide-y divide-line">
        {steps.map((s) => {
          const ok = data[s.key];
          return (
            <li key={s.key}>
              <Link to={s.to} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
                <span
                  aria-hidden
                  className={cx("grid size-6 shrink-0 place-items-center rounded-full border-2", ok ? "border-good bg-good text-surface" : "border-line")}
                >
                  {ok ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-[15px] font-medium", ok && "text-ink-3 line-through")}>{s.title}</span>
                  {!ok ? <span className="block text-[13px] text-ink-2">{s.hint}</span> : null}
                </span>
                <span className="sr-only">{ok ? "feito" : "pendente"}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
