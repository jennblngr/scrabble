import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Board as BoardType, MoveResult, PlacedTile } from "@scrabble/shared";
import { Board } from "./Board";

interface ZoomableBoardProps {
  board: BoardType;
  pending: PlacedTile[];
  preview: MoveResult | null;
  dragHandlers: (
    row: number,
    col: number,
    letter: string,
    isBlank: boolean
  ) => {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  };
  // Maps "row,col" of a just-placed tile to its wave animation delay (ms).
  waveCells?: Map<string, number>;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const DOUBLE_TAP_MS = 300;

interface Point {
  x: number;
  y: number;
}

interface Gesture {
  mode: "pinch" | "pan";
  startDistance: number;
  startZoom: number;
  startPan: Point;
  startCenter: Point;
}

// Native browser pinch-zoom (via the CSS `touch-action: pinch-zoom` value) is
// inconsistently supported across mobile browsers, so zooming on the board is
// implemented by hand with Pointer Events and a CSS transform instead. The
// rest of the page stays non-zoomable via `touch-action: pan-x pan-y` on
// `body` (see styles.css); this container fully opts out of native touch
// handling (`touch-action: none`) and drives pan/zoom itself.
export function ZoomableBoard({ board, pending, preview, dragHandlers, waveCells }: ZoomableBoardProps) {
  const [zoom, setZoomState] = useState(1);
  const [pan, setPanState] = useState<Point>({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Window-level pointer listeners live for the duration of a single gesture
  // and are never re-attached on re-render, so they close over stale state.
  // Refs give them a way to always read (and write) the live zoom/pan.
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const gestureRef = useRef<Gesture | null>(null);
  const lastTapRef = useRef(0);

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function clampPan(nextPan: Point, nextZoom: number): Point {
    const el = viewportRef.current;
    if (!el || nextZoom <= 1) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const maxX = (rect.width * (nextZoom - 1)) / 2;
    const maxY = (rect.height * (nextZoom - 1)) / 2;
    return { x: clamp(nextPan.x, -maxX, maxX), y: clamp(nextPan.y, -maxY, maxY) };
  }

  function commit(nextZoom: number, nextPan: Point) {
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const clampedPan = clampPan(nextPan, clampedZoom);
    zoomRef.current = clampedZoom;
    panRef.current = clampedPan;
    setZoomState(clampedZoom);
    setPanState(clampedPan);
  }

  // Keeps the content point under `focal` fixed on screen while zooming from
  // (baseZoom, basePan) to nextZoom.
  function zoomAt(nextZoom: number, focal: Point, baseZoom: number, basePan: Point) {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mid = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const contentX = (focal.x - mid.x - basePan.x) / baseZoom;
    const contentY = (focal.y - mid.y - basePan.y) / baseZoom;
    commit(clampedZoom, {
      x: focal.x - mid.x - contentX * clampedZoom,
      y: focal.y - mid.y - contentY * clampedZoom,
    });
  }

  function resetZoom() {
    commit(1, { x: 0, y: 0 });
  }

  function endGesture() {
    window.removeEventListener("pointermove", handleWindowMove);
    window.removeEventListener("pointerup", handleWindowUp);
    window.removeEventListener("pointercancel", handleWindowUp);
    gestureRef.current = null;
  }

  function handleWindowMove(ev: globalThis.PointerEvent) {
    if (!pointersRef.current.has(ev.pointerId)) return;
    pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.mode === "pinch" && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoomAt((gesture.startZoom * distance) / gesture.startDistance, center, gesture.startZoom, gesture.startPan);
      return;
    }

    if (gesture.mode === "pan") {
      const [p] = [...pointersRef.current.values()];
      const dx = p.x - gesture.startCenter.x;
      const dy = p.y - gesture.startCenter.y;
      commit(zoomRef.current, { x: gesture.startPan.x + dx, y: gesture.startPan.y + dy });
    }
  }

  function handleWindowUp(ev: globalThis.PointerEvent) {
    pointersRef.current.delete(ev.pointerId);
    if (pointersRef.current.size === 0) {
      endGesture();
      return;
    }
    // Dropping from two fingers to one: keep going as a pan with whichever finger remains.
    const [p] = [...pointersRef.current.values()];
    gestureRef.current = {
      mode: "pan",
      startDistance: 0,
      startZoom: zoomRef.current,
      startPan: panRef.current,
      startCenter: p,
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return;
    // A finger already driving a tile drag belongs to that gesture, not this one.
    if ((e.target as HTMLElement).closest(".tile--draggable")) return;

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      gestureRef.current = {
        mode: "pinch",
        startDistance: Math.hypot(a.x - b.x, a.y - b.y),
        startZoom: zoomRef.current,
        startPan: panRef.current,
        startCenter: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    } else if (pointersRef.current.size === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        pointersRef.current.clear();
        if (zoomRef.current > 1) resetZoom();
        else zoomAt(2, { x: e.clientX, y: e.clientY }, 1, { x: 0, y: 0 });
        return;
      }
      lastTapRef.current = now;
      if (zoomRef.current <= 1) return;
      e.preventDefault();
      gestureRef.current = {
        mode: "pan",
        startDistance: 0,
        startZoom: zoomRef.current,
        startPan: panRef.current,
        startCenter: { x: e.clientX, y: e.clientY },
      };
    } else {
      return;
    }

    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("pointercancel", handleWindowUp);
  }

  // Lets a trackpad pinch (delivered as a ctrl-modified wheel event) or
  // ctrl/cmd+scroll zoom the board on desktop too. Attached as a native,
  // non-passive listener: React attaches its own `onWheel` prop as passive
  // (for scroll performance), so `preventDefault()` inside it is silently
  // ignored by the browser and logs an "Unable to preventDefault inside
  // passive event listener" warning instead of actually stopping the page
  // from zooming/scrolling underneath the gesture.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.01);
      zoomAt(zoomRef.current * factor, { x: e.clientX, y: e.clientY }, zoomRef.current, panRef.current);
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div ref={viewportRef} className="board-viewport" onPointerDown={handlePointerDown}>
      <div
        className="board-viewport__inner"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        <Board board={board} pending={pending} preview={preview} dragHandlers={dragHandlers} waveCells={waveCells} />
      </div>

      {zoom > 1 && (
        <button
          type="button"
          className="icon-btn board-viewport__reset-zoom"
          onClick={resetZoom}
          aria-label="Réinitialiser le zoom"
          title="Réinitialiser le zoom"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
      )}
    </div>
  );
}
