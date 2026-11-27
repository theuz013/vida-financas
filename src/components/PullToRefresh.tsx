import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cx } from "./ui";

const TRIGGER = 72;

/**
 * Puxar para atualizar. Instalado na tela de início, o iPhone não oferece isso,
 * então o app faz: no topo da página, puxar para baixo recarrega os dados.
 */
export function PullToRefresh() {
  const qc = useQueryClient();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || busy || document.querySelector("dialog[open]")) return;
      start.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current == null) return;
      const d = e.touches[0].clientY - start.current;
      if (d <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      pullRef.current = Math.min(110, d * 0.5);
      setPull(pullRef.current);
    };
    const onEnd = async () => {
      if (start.current == null) return;
      start.current = null;
      const hit = pullRef.current >= TRIGGER;
      pullRef.current = 0;
      setPull(0);
      if (!hit) return;
      setBusy(true);
      await qc.invalidateQueries().finally(() => setBusy(false));
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [busy, qc]);

  const visible = pull > 8 || busy;
  return (
    <div
      aria-hidden={!busy}
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.5rem)] z-20 flex justify-center md:hidden"
      style={{ transform: `translateY(${busy ? 24 : pull * 0.6}px)`, opacity: visible ? 1 : 0, transition: pull ? "none" : "transform 200ms, opacity 200ms" }}
    >
      <span className="grid size-9 place-items-center rounded-full bg-surface text-ink-2 shadow-card">
        <RotateCw
          className={cx("size-4", busy && "animate-spin", pull >= TRIGGER && "text-ink")}
          style={busy ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
        {busy ? <span className="sr-only">Atualizando</span> : null}
      </span>
    </div>
  );
}
