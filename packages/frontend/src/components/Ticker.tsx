import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Reading speed of the scroll, and how long the text rests at each end.
const SCROLL_PX_PER_S = 40;
const PAUSE_MS = 1500;

interface TickerProps {
  children: ReactNode;
  /** Changes whenever the text changes, to re-measure and restart the scroll. */
  contentKey: string;
  className?: string;
}

/**
 * One line of text that, when it doesn't fit, scrolls slowly to its end,
 * rests, then starts over. Text that fits stays still and centered. With
 * reduced motion, overflowing text wraps onto several lines instead.
 */
export function Ticker({ children, contentKey, className }: TickerProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [reducedMotion] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || reducedMotion) return;
    const measure = () => setOverflow(Math.max(0, Math.ceil(inner.scrollWidth - outer.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    // border-box: the padding added while scrolling counts in the overflow.
    observer.observe(inner, { box: "border-box" });
    return () => observer.disconnect();
  }, [contentKey, reducedMotion]);

  const scrolling = overflow > 0 && !reducedMotion;

  useEffect(() => {
    const inner = innerRef.current;
    if (!scrolling || !inner) return;
    const scrollMs = (overflow / SCROLL_PX_PER_S) * 1000;
    const total = PAUSE_MS + scrollMs + PAUSE_MS;
    const animation = inner.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(0)", offset: PAUSE_MS / total },
        { transform: `translateX(-${overflow}px)`, offset: (PAUSE_MS + scrollMs) / total },
        { transform: `translateX(-${overflow}px)` },
      ],
      { duration: total, iterations: Infinity, easing: "linear" }
    );
    return () => animation.cancel();
  }, [scrolling, overflow, contentKey]);

  const stateClass = reducedMotion ? " ticker--wrap" : scrolling ? " ticker--scrolling" : "";
  return (
    <div ref={outerRef} className={`ticker${stateClass}${className ? ` ${className}` : ""}`}>
      <span ref={innerRef} className="ticker__content">
        {children}
      </span>
    </div>
  );
}
