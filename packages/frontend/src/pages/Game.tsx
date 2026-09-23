import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { GameState, MoveResult, PlacedTile, RackTile } from "@scrabble/shared";
import { getSocket } from "../api/socket";
import { subscribeToPush } from "../push";
import { ZoomableBoard } from "../components/ZoomableBoard";
import { Rack } from "../components/Rack";
import { Tile } from "../components/Tile";
import { ThemeToggle } from "../components/ThemeToggle";

interface GameProps {
  username: string;
  gameId: string;
  onBack: () => void;
}

type DragPayload =
  | { source: "rack"; rackTileId: string }
  | { source: "board"; fromRow: number; fromCol: number };

interface PendingDrag {
  payload: DragPayload;
  letter: string;
  isBlank: boolean;
  pointerId: number;
  startX: number;
  startY: number;
}

interface DragVisual {
  letter: string;
  isBlank: boolean;
  x: number;
  y: number;
  // Set when dragging out of the rack, so that slot can show the empty
  // placeholder instead of the letter, which is already shown by the ghost.
  rackTileId?: string;
}

// A move shorter than this (in px) is treated as a tap, not a drag, so it
// doesn't briefly flash a ghost tile on ordinary taps/clicks.
const DRAG_THRESHOLD = 6;

export function Game({ username, gameId, onBack }: GameProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PlacedTile[]>([]);
  const [preview, setPreview] = useState<MoveResult | null>(null);
  const [mode, setMode] = useState<"place" | "exchange" | "pass">("place");
  const [exchangeSelection, setExchangeSelection] = useState<Set<string>>(new Set());
  const [rackOrder, setRackOrder] = useState<string[]>([]);
  const [drag, setDrag] = useState<DragVisual | null>(null);
  const dragPendingRef = useRef<PendingDrag | null>(null);
  const [justPlayed, setJustPlayed] = useState<string | null>(null);
  // Guards against flashing the score box for the lastMove already present in
  // the very first game:state received after (re)joining, which may be stale
  // (e.g. from before a page reload) rather than a move just played now.
  const hasReceivedStateRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    setState(null);
    setError(null);
    setPending([]);
    setPreview(null);
    setJustPlayed(null);
    hasReceivedStateRef.current = false;

    socket.on("game:state", (s) => {
      setState((prev) => {
        const lastMoveChanged =
          hasReceivedStateRef.current &&
          s.lastMove &&
          (prev?.lastMove?.username !== s.lastMove.username ||
            prev?.lastMove?.score !== s.lastMove.score ||
            prev?.lastMove?.words.join("|") !== s.lastMove.words.join("|"));
        if (lastMoveChanged) setJustPlayed(s.lastMove!.username);
        return s;
      });
      hasReceivedStateRef.current = true;
      setPending([]);
      setPreview(null);
    });
    socket.on("game:error", (msg) => setError(msg));
    socket.on("game:preview", (result) => setPreview(result));

    socket.emit("game:join", gameId);

    subscribeToPush().catch(() => {
      /* notifications are a nice-to-have; ignore failures (e.g. permission denied) */
    });

    return () => {
      socket.off("game:state");
      socket.off("game:error");
      socket.off("game:preview");
      socket.emit("game:leave", gameId);
    };
  }, [gameId]);

  useEffect(() => {
    if (pending.length === 0) {
      setPreview(null);
      return;
    }
    getSocket().emit("game:preview", { gameId, tiles: pending });
  }, [pending, gameId]);

  const [errorFading, setErrorFading] = useState(false);

  useEffect(() => {
    if (!error) return;
    setErrorFading(false);
    const fadeTimeout = setTimeout(() => setErrorFading(true), 5000);
    const clearTimeout_ = setTimeout(() => setError(null), 5300);
    return () => {
      clearTimeout(fadeTimeout);
      clearTimeout(clearTimeout_);
    };
  }, [error]);

  useEffect(() => {
    if (!justPlayed) return;
    const timeout = setTimeout(() => setJustPlayed(null), 5000);
    return () => clearTimeout(timeout);
  }, [justPlayed]);

  const me = useMemo(() => state?.players.find((p) => p.username === username) ?? null, [state, username]);
  const opponent = useMemo(() => state?.players.find((p) => p.username !== username) ?? null, [state, username]);
  const isMyTurn = state?.currentPlayerId === username;

  const lastMoveText = useMemo(() => {
    const lastMove = state?.lastMove;
    if (!lastMove) return null;
    const isMe = lastMove.username === username;
    return (
      <>
        <strong>{isMe ? "Vous" : lastMove.username}</strong> {isMe ? "avez" : "a"} joué{" "}
        <strong className="game__status-word">{lastMove.words.join(" + ")}</strong> pour{" "}
        <strong>{lastMove.score} points</strong>
      </>
    );
  }, [state, username]);

  useEffect(() => {
    if (!me) return;
    setRackOrder((prev) => {
      const known = new Set(me.rack.map((t) => t.id));
      const kept = prev.filter((id) => known.has(id));
      const newIds = me.rack.map((t) => t.id).filter((id) => !kept.includes(id));
      return [...kept, ...newIds];
    });
  }, [me]);

  // Each id keeps the rack slot it was drawn into: a tile placed on the
  // board (pending) becomes an empty slot rather than being removed, so the
  // other tiles don't shift/recenter as the rack empties out.
  const visibleRack = useMemo(() => {
    if (!me) return [];
    const usedIds = new Set(pending.map((t) => t.rackTileId));
    const byId = new Map(me.rack.map((t) => [t.id, t]));
    return rackOrder
      .map((id) => byId.get(id))
      .filter((t): t is RackTile => !!t)
      .map((t) => ({ id: t.id, tile: usedIds.has(t.id) ? null : t }));
  }, [me, pending, rackOrder]);

  const availableRackCount = useMemo(
    () => visibleRack.filter((slot) => slot.tile !== null).length,
    [visibleRack]
  );

  function recallTiles() {
    setPending([]);
  }

  function shuffleRack() {
    setRackOrder((prev) => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
  }

  function handleSelectTile(tileId: string) {
    if (mode !== "exchange") return;
    setExchangeSelection((prev) => {
      const next = new Set(prev);
      if (next.has(tileId)) next.delete(tileId);
      else next.add(tileId);
      return next;
    });
  }

  function placeTileAt(row: number, col: number, rackTileId: string) {
    if (!me) return;
    const rackTile = me.rack.find((t) => t.id === rackTileId);
    if (!rackTile) return;

    let letter = rackTile.letter;
    let isBlank = false;
    if (letter === "") {
      const chosen = window.prompt("Cette tuile est un joker : quelle lettre veux-tu jouer ?");
      if (!chosen) return;
      letter = chosen.trim().toUpperCase().slice(0, 1);
      if (!letter) return;
      isBlank = true;
    }

    setPending((prev) => [...prev, { row, col, letter, isBlank, rackTileId: rackTile.id }]);
  }

  // Drag & drop is implemented with Pointer Events (not the HTML5 drag-and-drop
  // API) because native drag-and-drop has no touch support on mobile browsers.
  // Pointer Events fire uniformly for mouse, touch, and pen.
  function finishDrag(clientX: number, clientY: number, payload: DragPayload) {
    const targetEl = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-drop-target]");
    const target = targetEl?.dataset.dropTarget;
    if (!target) return;

    if (target.startsWith("cell:")) {
      const [, rowStr, colStr] = target.split(":");
      const row = Number(rowStr);
      const col = Number(colStr);
      if (payload.source === "rack") {
        placeTileAt(row, col, payload.rackTileId);
      } else {
        setPending((prev) => {
          const moved = prev.find((t) => t.row === payload.fromRow && t.col === payload.fromCol);
          if (!moved) return prev;
          return [
            ...prev.filter((t) => !(t.row === payload.fromRow && t.col === payload.fromCol)),
            { ...moved, row, col },
          ];
        });
      }
      return;
    }

    if (target === "rack") {
      if (payload.source === "board") {
        setPending((prev) => prev.filter((t) => !(t.row === payload.fromRow && t.col === payload.fromCol)));
        return;
      }
      // Dropped on the rack but not on a specific tile: send it to the end.
      setRackOrder((prev) => [...prev.filter((id) => id !== payload.rackTileId), payload.rackTileId]);
      return;
    }

    if (target.startsWith("rack-tile:")) {
      if (payload.source === "board") {
        setPending((prev) => prev.filter((t) => !(t.row === payload.fromRow && t.col === payload.fromCol)));
        return;
      }
      const targetTileId = target.slice("rack-tile:".length);
      reorderRack(payload.rackTileId, targetTileId);
    }
  }

  // Moves rackTileId next to targetTileId. If the target slot is empty (its
  // tile is pending on the board), the two slots swap so the gap tracks the
  // tile that vacated it. If the target holds another letter, the tiles
  // between the two positions shift over by one, like a normal sortable list.
  function reorderRack(rackTileId: string, targetTileId: string) {
    if (rackTileId === targetTileId) return;
    const usedIds = new Set(pending.map((t) => t.rackTileId));

    setRackOrder((prev) => {
      const from = prev.indexOf(rackTileId);
      const to = prev.indexOf(targetTileId);
      if (from === -1 || to === -1 || from === to) return prev;

      if (usedIds.has(targetTileId)) {
        const next = [...prev];
        [next[from], next[to]] = [next[to], next[from]];
        return next;
      }

      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // Live reorder preview while dragging a rack tile over another rack slot,
  // so tiles shift/swap out of the way on hover instead of only on drop.
  function liveReorderRack(clientX: number, clientY: number, payload: DragPayload) {
    if (payload.source !== "rack") return;
    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-drop-target]")
      ?.dataset.dropTarget;
    if (!target?.startsWith("rack-tile:")) return;
    reorderRack(payload.rackTileId, target.slice("rack-tile:".length));
  }

  // Pointer capture is deliberately NOT used here: live-reordering the rack
  // mid-drag (see liveReorderRack) moves the dragged tile's own DOM node to
  // reflect its new slot, and moving a node that holds pointer capture makes
  // the browser silently release that capture, freezing the drag. Tracking
  // the pointer via window-level listeners keyed by pointerId sidesteps this
  // entirely, since it doesn't matter which element the pointer is over.
  function bindDrag(payload: DragPayload, letter: string, isBlank: boolean) {
    return {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        const pointerId = e.pointerId;
        const startX = e.clientX;
        const startY = e.clientY;
        let started = false;

        const handleMove = (ev: globalThis.PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          if (!started) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            started = true;
          }
          setDrag({
            letter,
            isBlank,
            x: ev.clientX,
            y: ev.clientY,
            rackTileId: payload.source === "rack" ? payload.rackTileId : undefined,
          });
          liveReorderRack(ev.clientX, ev.clientY, payload);
        };

        const handleUp = (ev: globalThis.PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          cleanup();
          setDrag(null);
          // Hit-test at the same point the ghost tile is shown, so the drop
          // lands exactly where the ghost was.
          finishDrag(ev.clientX, ev.clientY, payload);
        };

        const handleCancel = (ev: globalThis.PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          cleanup();
          setDrag(null);
        };

        function cleanup() {
          window.removeEventListener("pointermove", handleMove);
          window.removeEventListener("pointerup", handleUp);
          window.removeEventListener("pointercancel", handleCancel);
          dragPendingRef.current = null;
        }

        dragPendingRef.current = { payload, letter, isBlank, pointerId, startX, startY };
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
        window.addEventListener("pointercancel", handleCancel);
      },
    };
  }

  function rackDragHandlers(tileId: string, letter: string, isBlank: boolean) {
    return bindDrag({ source: "rack", rackTileId: tileId }, letter, isBlank);
  }

  function boardDragHandlers(row: number, col: number, letter: string, isBlank: boolean) {
    return bindDrag({ source: "board", fromRow: row, fromCol: col }, letter, isBlank);
  }

  function submitPlace() {
    if (!gameId || pending.length === 0) return;
    setError(null);
    getSocket().emit("game:place", { gameId, tiles: pending });
  }

  function submitPass() {
    if (!gameId) return;
    setError(null);
    getSocket().emit("game:pass", { gameId });
    setMode("place");
  }

  function submitExchange() {
    if (!gameId || exchangeSelection.size === 0) return;
    setError(null);
    getSocket().emit("game:exchange", { gameId, rackTileIds: [...exchangeSelection] });
    setExchangeSelection(new Set());
    setMode("place");
  }

  if (!state) {
    return <div className="game-loading">{error ?? "Chargement de la partie..."}</div>;
  }

  return (
    <div className="game">
      <header className="game__header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Retour aux parties" title="Retour aux parties">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <div
          className={`game__status${error ? ` game__status--error${errorFading ? " game__status--error-fading" : ""}` : ""}`}
        >
          {error
            ? error
            : state.status === "finished"
            ? "Partie terminée"
            : lastMoveText ??
              (isMyTurn ? (
                <>
                  À <strong>toi</strong> de jouer
                </>
              ) : (
                "En attente de l'adversaire"
              ))}
        </div>
        <div className="game__header-actions">
          <ThemeToggle />
        </div>
      </header>

      <div className="scores">
        <div
          className={`scores__col${
            justPlayed === username ? " scores__col--success" : isMyTurn ? " scores__col--active" : ""
          }`}
        >
          <span className="scores__name">Vous</span>
          <span className="scores__value">{me?.score ?? 0}</span>
        </div>
        <div
          className={`scores__col scores__col--right${
            justPlayed === opponent?.username ? " scores__col--success" : !isMyTurn ? " scores__col--active" : ""
          }`}
        >
          <span className="scores__name">{opponent?.username}</span>
          <span className="scores__value">{opponent?.score ?? 0}</span>
        </div>
      </div>

      <div className="game__board-area">
        <ZoomableBoard board={state.board} pending={pending} preview={preview} dragHandlers={boardDragHandlers} />
      </div>

      <p className="game__bag">Tuiles restantes dans le sac : {state.bagCount}</p>

      <Rack
        tiles={visibleRack}
        exchangeSelection={exchangeSelection}
        mode={mode === "exchange" ? "exchange" : "place"}
        onSelect={handleSelectTile}
        dragHandlers={rackDragHandlers}
        draggedTileId={drag?.rackTileId}
      />

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <Tile letter={drag.letter} isBlank={drag.isBlank} />
        </div>
      )}

      <div className="game__actions">
        {mode === "place" ? (
          <>
            <button type="button" disabled={!isMyTurn} onClick={() => setMode("pass")}>
              Passer
            </button>
            <button type="button" disabled={!isMyTurn} onClick={() => setMode("exchange")}>
              Échanger des tuiles
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setExchangeSelection(new Set());
              setMode("place");
            }}
          >
            Annuler
          </button>
        )}
      </div>

      <div className="game__validate-row">
        <button
          type="button"
          className="icon-btn"
          onClick={shuffleRack}
          disabled={availableRackCount < 2}
          aria-label="Mélanger mes lettres"
          title="Mélanger mes lettres"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8"></polyline>
            <line x1="4" y1="20" x2="21" y2="3"></line>
            <polyline points="21 16 21 21 16 21"></polyline>
            <line x1="15" y1="15" x2="21" y2="21"></line>
            <line x1="4" y1="4" x2="9" y2="9"></line>
          </svg>
        </button>

        {mode === "place" ? (
          <button type="button" className="primary" disabled={!isMyTurn || pending.length === 0} onClick={submitPlace}>
            Valider
          </button>
        ) : mode === "exchange" ? (
          <button type="button" className="primary" disabled={exchangeSelection.size === 0} onClick={submitExchange}>
            Confirmer (échanger) ({exchangeSelection.size})
          </button>
        ) : (
          <button type="button" className="primary" onClick={submitPass}>
            Confirmer (passer)
          </button>
        )}

        <button
          type="button"
          className="icon-btn"
          onClick={recallTiles}
          disabled={pending.length === 0}
          aria-label="Reprendre mes tuiles"
          title="Reprendre mes tuiles"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        </button>
      </div>
    </div>
  );
}
