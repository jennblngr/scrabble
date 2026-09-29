import { useEffect, useRef, useState } from "react";

export type ToastState = { message: string; variant: "success" | "error" } | null;

interface ToastProps {
  toast: ToastState;
  onDismiss: () => void;
}

const SWIPE_DISMISS_THRESHOLD_PX = 80;
const AUTO_DISMISS_MS = 2000;

export function Toast({ toast, onDismiss }: ToastProps) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);

  // Remet le toast à sa position d'origine quand un nouveau message arrive,
  // sans quoi il réapparaîtrait décalé après un swipe précédent.
  useEffect(() => {
    if (toast) setDragX(0);
  }, [toast]);

  // Disparition automatique, mise en pause tant que l'utilisateur interagit
  // avec le toast (swipe en cours).
  useEffect(() => {
    if (!toast || dragging) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dragging, onDismiss]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    startXRef.current = e.clientX - dragX;
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragX(e.clientX - startXRef.current);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) > SWIPE_DISMISS_THRESHOLD_PX) {
      const direction = dragX > 0 ? 1 : -1;
      setDragX(direction * (e.currentTarget.offsetWidth + 40));
      setTimeout(onDismiss, 200);
    } else {
      setDragX(0);
    }
  }

  const isError = toast?.variant === "error";

  return (
    <div
      className={`toast${toast ? " toast--visible" : ""}${dragging ? " toast--dragging" : ""}${isError ? " toast--error" : ""}`}
      role="status"
      aria-live="polite"
      aria-hidden={!toast}
      style={{ "--toast-drag-x": `${dragX}px` } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {isError ? (
        <svg className="toast__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      ) : (
        <svg className="toast__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      )}
      <span>{toast?.message}</span>
    </div>
  );
}
