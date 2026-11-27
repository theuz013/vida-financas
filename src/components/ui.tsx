import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatBRL } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------- botões ---------- */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const btn: Record<BtnVariant, string> = {
  primary: "bg-accent text-on-accent shadow-cta hover:opacity-90 active:opacity-75",
  secondary: "bg-sunken text-ink hover:bg-line/70 active:bg-line",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink active:bg-sunken",
  danger: "bg-bad-soft text-bad hover:opacity-85 active:opacity-70",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 font-semibold transition-[opacity,background-color,color] duration-150 disabled:opacity-45 disabled:pointer-events-none",
        size === "lg" && "h-14 rounded-full px-6 text-[17px] w-full",
        size === "md" && "h-11 rounded-xl px-4 text-[15px]",
        size === "sm" && "hit h-10 rounded-xl px-3.5 text-[14px]",
        btn[variant],
        className,
      )}
    >
      {loading ? <span className="size-4 rounded-full border-2 border-current border-r-transparent animate-spin" /> : null}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={cx("inline-grid size-11 place-items-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink active:bg-sunken transition-colors", className)}
    >
      {children}
    </button>
  );
}

/* ---------- superfícies ---------- */

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "li" }) {
  return <As className={cx("rounded-[var(--radius-card)] bg-surface shadow-card", className)}>{children}</As>;
}

export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mt-8 first:mt-0", className)}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Linha de lista: título à esquerda, valor à direita (como no PingDin). */
export function Row({
  leading,
  title,
  subtitle,
  trailing,
  to,
  onClick,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const inner = (
    <>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        {subtitle ? <div className="mt-0.5 truncate text-[13px] text-ink-2">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="shrink-0 text-right">{trailing}</div> : null}
      {to ? <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden /> : null}
    </>
  );
  const cls = cx("flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-left", (to || onClick) && "hover:bg-sunken/60 active:bg-sunken transition-colors", className);
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cx("divide-y divide-line overflow-hidden", className)}>{children}</Card>;
}

/* ---------- textos e números ---------- */

export function Money({ cents, className, signed }: { cents: number; className?: string; signed?: boolean }) {
  const text = formatBRL(Math.abs(cents));
  const sign = signed ? (cents > 0 ? "+ " : cents < 0 ? "− " : "") : cents < 0 ? "− " : "";
  return <span className={cx("num whitespace-nowrap", className)}>{sign}{text}</span>;
}

type Tone = "neutral" | "bad" | "good" | "warn";
const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  bad: "bg-bad-soft text-bad",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
};
export function Chip({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function Emoji({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span aria-hidden className={cx("grid size-10 place-items-center rounded-full bg-sunken text-[19px] leading-none", className)}>
      {children}
    </span>
  );
}

export function IconBubble({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={cx("grid size-10 place-items-center rounded-full [&>svg]:size-[18px]", tones[tone])}>{children}</span>;
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <Card className="px-5 py-7 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-[34ch] text-[14px] text-ink-2">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-[var(--radius-card)] bg-sunken", className)} />;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : "Algo deu errado.";
  return <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[14px] font-medium text-bad">{msg}</p>;
}

/* ---------- cabeçalho de página ---------- */

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 pt-2">
      {back ? (
        <Link to={back} className="-ml-2 mb-1 inline-flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1 text-[15px] font-medium text-ink-2 hover:text-ink active:text-ink">
          <ChevronLeft className="size-5" aria-hidden />
          Voltar
        </Link>
      ) : null}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.03em] max-[374px]:text-[26px]">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-[15px] text-ink-2">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </header>
  );
}

/* ---------- formulário ---------- */

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[12.5px] text-ink-3">{hint}</span> : null}
    </label>
  );
}

const control =
  "h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[16px] text-ink outline-none transition-colors focus:border-ink-2 disabled:opacity-60";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return <input {...rest} className={cx(control, className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(control, "appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
      {children}
    </select>
  );
}

/** Campo de dinheiro: teclado numérico, aceita "67,54". */
export function MoneyInput({ value, onChange, autoFocus, large, ...rest }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; large?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className={cx("flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 focus-within:border-ink-2", large ? "h-16" : "h-12")}>
      <span className={cx("font-semibold text-ink-3", large ? "text-[22px]" : "text-[16px]")}>R$</span>
      <input
        {...rest}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        className={cx("num min-w-0 flex-1 bg-transparent outline-none", large ? "text-[30px] font-bold tracking-[-0.02em]" : "text-[16px]")}
      />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div role="radiogroup" className={cx("grid gap-1 rounded-xl bg-sunken p-1", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-10 rounded-lg text-[14px] font-semibold transition-colors",
            "hit",
            value === o.value ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- folha (bottom sheet) ---------- */

/**
 * Folha que sobe do rodapé (celular) ou janela central (computador).
 * No celular: alça para arrastar e fechar, e sobe junto com o teclado do iPhone
 * para o botão de salvar continuar visível.
 */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    setDy(0);
  }, [open]);

  // teclado do iOS: o visualViewport encolhe; levanta a folha pela diferença
  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) return;
    const update = () => setKeyboard(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setKeyboard(0);
    };
  }, [open]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("button")) return;
    drag.current = { y: e.clientY, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    setDy(drag.current.dy);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const close = drag.current.dy > 90;
    drag.current = null;
    setDy(0);
    if (close) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      style={{
        marginBottom: keyboard ? keyboard : undefined,
        translate: dy ? `0 ${dy}px` : undefined,
        transition: dy ? "none" : undefined,
        maxHeight: keyboard ? `calc(100dvh - ${keyboard}px - 8px)` : undefined,
      }}
    >
      {open ? (
        <div className="flex flex-col" style={{ maxHeight: keyboard ? `calc(100dvh - ${keyboard}px - 8px)` : "92dvh" }}>
          <div className="touch-none select-none md:touch-auto" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line md:hidden" />
            <div className="flex items-center justify-between gap-3 px-5 pt-2 pb-2 md:pt-4">
              <h2 className="text-[19px] font-bold tracking-[-0.02em]">{title}</h2>
              <IconButton label="Fechar" onClick={onClose} className="-mr-2">
                <X className="size-5" />
              </IconButton>
            </div>
          </div>
          <div className="overscroll-contain overflow-y-auto px-5 pt-2 pb-4">{children}</div>
          {footer ? <div className={cx("border-t border-line px-5 pt-3", keyboard ? "pb-3" : "safe-bottom")}>{footer}</div> : <div className={keyboard ? "pb-3" : "safe-bottom"} />}
        </div>
      ) : null}
    </dialog>
  );
}

/** Confirmação curta antes de algo que não dá para desfazer. */
export function useConfirm() {
  return (message: string) => window.confirm(message);
}
