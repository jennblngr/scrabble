import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { GameState, MoveResult, PlacedTile, Player, RackTile } from "@scrabble/shared";
import { getSocket } from "../api/socket";
import { subscribeToPush } from "../push";
import { ZoomableBoard } from "../components/ZoomableBoard";
import { Rack } from "../components/Rack";
import { Tile } from "../components/Tile";
import { ThemeToggle } from "../components/ThemeToggle";
import { isThirdSeat } from "../players";

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

// Timing for the "move just validated" score counter: it ticks up one step
// per newly placed tile, in sequence, rather than jumping straight to the
// final total.
const TILE_STAGGER_MS = 130;
const TILE_ANIM_MS = 550;

// Duration of the halo/badge animations around the played word and the score
// pill (see `score-halo`, `score-plus`, `word-box-dismiss` in styles.css).
const HALO_MS = 1600;

// Duration of the exchanged tiles' shrink-and-fade (see `tile--exchanging` in
// styles.css) and of the bag count's confirmation flash (`game__bag-count--blink`).
const EXCHANGE_TILE_ANIM_MS = 450;
const BAG_BLINK_MS = 800;
// Duration of a replacement tile's grow-and-fade-in once it takes over the
// slot its predecessor just vacated (see `tile--appearing` in styles.css).
const EXCHANGE_APPEAR_MS = 350;

function waveDuration(tileCount: number) {
  return Math.max(tileCount - 1, 0) * TILE_STAGGER_MS + TILE_ANIM_MS;
}

interface ScoreAnim {
  username: string;
  from: number;
  to: number;
  tileCount: number;
}

// Bumps the displayed score up one step per placed tile, staggered by
// TILE_STAGGER_MS, landing on `anim.to` once the last step fires.
function useDisplayedScore(value: number, anim: ScoreAnim | null) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!anim) {
      setDisplay(value);
      return;
    }
    const { from, to, tileCount } = anim;
    setDisplay(from);
    const timeouts = Array.from({ length: tileCount }, (_, i) => {
      const peakAt = i * TILE_STAGGER_MS + TILE_ANIM_MS / 2;
      const stepValue = from + Math.round(((to - from) * (i + 1)) / tileCount);
      return setTimeout(() => setDisplay(stepValue), peakAt);
    });
    return () => timeouts.forEach(clearTimeout);
  }, [anim, value]);

  return display;
}

function ScoreColumn({
  player,
  label,
  align,
  active,
  third,
  anim,
}: {
  player: Player;
  label: string;
  align: "left" | "center" | "right";
  active: boolean;
  third: boolean;
  anim: ScoreAnim | null;
}) {
  const displayScore = useDisplayedScore(player.score, anim);
  return (
    <div
      className={`scores__col${align === "left" ? "" : ` scores__col--${align}`}${third ? " scores__col--third" : ""}${
        active ? " scores__col--active" : ""
      }${anim ? " scores__col--halo" : ""}`}
    >
      <span className="scores__name">{label}</span>
      <span className="scores__value-row">
        <span className="scores__value">{displayScore}</span>
        {anim && <span className="scores__delta">+{anim.to - anim.from}</span>}
      </span>
    </div>
  );
}

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
  const [scoreAnim, setScoreAnim] = useState<ScoreAnim | null>(null);
  // "row,col" of each tile placed by the last move, used to halo the word on the board.
  const [waveCells, setWaveCells] = useState<Set<string>>(new Set());
  // "row,col" of the opponent's last move, shown as a small red dot instead of
  // the halo when that move is discovered on the very first game:state after
  // (re)opening the game (i.e. it was played while this player was away), as
  // opposed to a move seen live, which already gets the halo above.
  const [unseenOpponentCells, setUnseenOpponentCells] = useState<Set<string>>(new Set());
  // Rack tiles mid-exchange: kept around (with their pre-exchange letter) so
  // they can shrink and fade out in their own slot instead of instantly
  // vanishing once the server's reply drops them from the rack.
  const [exchangingTiles, setExchangingTiles] = useState<Map<string, RackTile>>(new Map());
  const [bagBlink, setBagBlink] = useState(false);
  // oldTileId -> newTileId, filled in as the server's replacement tiles
  // arrive while the old ones are still mid-animation. Applied to rackOrder
  // only once the old tile's animation finishes (see the exchangingTiles
  // cleanup effect below), so the new tile pops into the exact slot its
  // predecessor shrank out of instead of appearing elsewhere first.
  const replacementMapRef = useRef<Map<string, string>>(new Map());
  // Replacement tiles that just swapped into a vacated slot: grown/faded in
  // for a moment so their entrance reads as gradual too, instead of popping
  // in instantly right as the old tile's own fade finishes.
  const [appearingTileIds, setAppearingTileIds] = useState<Set<string>>(new Set());
  // Guards against flashing the score box for the lastMove already present in
  // the very first game:state received after (re)joining, which may be stale
  // (e.g. from before a page reload) rather than a move just played now.
  const hasReceivedStateRef = useRef(false);
  const stateRef = useRef<GameState | null>(null);

  useEffect(() => {
    const socket = getSocket();
    setState(null);
    setError(null);
    setPending([]);
    setPreview(null);
    setScoreAnim(null);
    setWaveCells(new Set());
    setUnseenOpponentCells(new Set());
    hasReceivedStateRef.current = false;
    stateRef.current = null;

    socket.on("game:state", (s) => {
      const prev = stateRef.current;
      const lastMoveChanged =
        !!s.lastMove &&
        (prev?.lastMove?.username !== s.lastMove.username ||
          prev?.lastMove?.score !== s.lastMove.score ||
          prev?.lastMove?.words.join("|") !== s.lastMove.words.join("|"));

      if (hasReceivedStateRef.current && lastMoveChanged) {
        const playerId = s.lastMove!.username;

        // Diff against the previous board to find the tiles this move just
        // placed, so only those get haloed (not tiles already on the board
        // from earlier moves).
        const newCells: { row: number; col: number }[] = [];
        if (prev) {
          for (const line of s.board) {
            for (const cell of line) {
              if (cell.letter !== null && prev.board[cell.row][cell.col].letter === null) {
                newCells.push({ row: cell.row, col: cell.col });
              }
            }
          }
        }
        newCells.sort((a, b) => a.row - b.row || a.col - b.col);

        const from = prev?.players.find((p) => p.username === playerId)?.score ?? s.lastMove!.score;
        const to = s.players.find((p) => p.username === playerId)?.score ?? from;
        const tileCount = Math.max(newCells.length, 1);

        setScoreAnim({ username: playerId, from, to, tileCount });
        setWaveCells(new Set(newCells.map((c) => `${c.row},${c.col}`)));
        // This move (live or not) supersedes whatever the "while you were
        // away" marker below was pointing at.
        setUnseenOpponentCells(new Set());
      }

      // The very first game:state after (re)opening the game: if the last
      // move on the board belongs to the opponent, it was necessarily played
      // while this player was away (a move played live gets the halo above
      // instead), so mark it with a dot rather than the halo/score animation.
      if (!hasReceivedStateRef.current && s.lastMove && s.lastMove.username !== username) {
        setUnseenOpponentCells(new Set(s.lastMove.cells.map((c) => `${c.row},${c.col}`)));
      }

      // A state re-sent after a reconnect, where nothing was played, must not
      // wipe the tiles the player is currently arranging on the board.
      const somethingPlayed =
        !prev || lastMoveChanged || prev.currentPlayerId !== s.currentPlayerId || prev.status !== s.status;
      stateRef.current = s;
      hasReceivedStateRef.current = true;
      setState(s);
      if (somethingPlayed) {
        setPending([]);
        setPreview(null);
      }
    });
    socket.on("game:error", (msg) => setError(msg));
    socket.on("game:preview", (result) => setPreview(result));

    // Socket.IO rooms don't survive a reconnection (e.g. the phone went to
    // sleep or the network dropped): re-join on every (re)connect, otherwise
    // this client stops receiving game:state and looks stuck after playing.
    const join = () => socket.emit("game:join", gameId);
    socket.on("connect", join);
    if (socket.connected) join();

    subscribeToPush().catch(() => {
      /* notifications are a nice-to-have; ignore failures (e.g. permission denied) */
    });

    return () => {
      socket.off("game:state");
      socket.off("game:error");
      socket.off("game:preview");
      socket.off("connect", join);
      socket.emit("game:leave", gameId);
    };
  }, [gameId]);

  useEffect(() => {
    if (pending.length === 0) {
      setPreview(null);
      return;
    }
    getSocket().emit("game:preview", { gameId, tiles: pending });
    // The player has started acting on the board, so the "while you were
    // away" dot has served its purpose.
    setUnseenOpponentCells(new Set());
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
    if (!scoreAnim) return;
    // Keep the animation state around at least as long as the halo/badge
    // animations (HALO_MS) need to finish, even for single-tile moves where
    // the score count-up itself is shorter.
    const timeout = setTimeout(() => {
      setScoreAnim(null);
      setWaveCells(new Set());
    }, Math.max(waveDuration(scoreAnim.tileCount) + 300, HALO_MS + 100));
    return () => clearTimeout(timeout);
  }, [scoreAnim]);

  useEffect(() => {
    if (exchangingTiles.size === 0) return;
    const timeout = setTimeout(() => {
      // Swap each old id for its replacement (if the server had already
      // replied by now) in the same rackOrder slot, so the new tile takes
      // over exactly where the old one just finished shrinking away.
      const replacements = replacementMapRef.current;
      if (replacements.size > 0) {
        setRackOrder((prev) => prev.map((id) => replacements.get(id) ?? id));
        setAppearingTileIds(new Set(replacements.values()));
        replacementMapRef.current = new Map();
      }
      setExchangingTiles(new Map());
    }, EXCHANGE_TILE_ANIM_MS);
    return () => clearTimeout(timeout);
  }, [exchangingTiles]);

  useEffect(() => {
    if (appearingTileIds.size === 0) return;
    const timeout = setTimeout(() => setAppearingTileIds(new Set()), EXCHANGE_APPEAR_MS);
    return () => clearTimeout(timeout);
  }, [appearingTileIds]);

  useEffect(() => {
    if (!bagBlink) return;
    const timeout = setTimeout(() => setBagBlink(false), BAG_BLINK_MS);
    return () => clearTimeout(timeout);
  }, [bagBlink]);

  const me = useMemo(() => state?.players.find((p) => p.username === username) ?? null, [state, username]);
  // In turn order, so the score columns read in the order players take turns.
  const opponents = useMemo(() => state?.players.filter((p) => p.username !== username) ?? [], [state, username]);
  const isMyTurn = state?.currentPlayerId === username;
  const players = state?.players ?? [];

  // Blue instead of red on the board while it highlights a move by the third
  // seat of a 3-player game: the just-played halo, or the "while you were
  // away" dots.
  const boardShowsThirdSeatMove =
    (!!scoreAnim && isThirdSeat(players, scoreAnim.username)) ||
    (unseenOpponentCells.size > 0 && isThirdSeat(players, state?.lastMove?.username));

  const lastMoveText = useMemo(() => {
    const lastMove = state?.lastMove;
    if (!lastMove) return null;
    const isMe = lastMove.username === username;
    const third = isThirdSeat(state.players, lastMove.username);
    return (
      <>
        <strong>{isMe ? "Vous" : lastMove.username}</strong> {isMe ? "avez" : "a"} joué{" "}
        <strong className={`game__status-word${third ? " game__status-word--third" : ""}`}>
          {lastMove.words.join(" + ")}
        </strong>{" "}
        pour{" "}
        <strong>{lastMove.score} points</strong>
      </>
    );
  }, [state, username]);

  useEffect(() => {
    if (!me) return;
    setRackOrder((prev) => {
      const known = new Set(me.rack.map((t) => t.id));
      // A tile mid-exchange keeps its slot even though the server has
      // already dropped it from the rack, so it can shrink/fade in place
      // instead of being yanked out the instant the new state arrives.
      const kept = prev.filter((id) => known.has(id) || exchangingTiles.has(id));

      // Ids the server just drew that aren't accounted for yet, excluding
      // ones already queued as a replacement for a still-animating tile.
      const alreadyQueued = new Set(replacementMapRef.current.values());
      const freshIds = me.rack.map((t) => t.id).filter((id) => !kept.includes(id) && !alreadyQueued.has(id));

      // Pair fresh ids with tiles still mid-exchange so each new tile pops
      // into the exact slot its predecessor shrank out of (applied once that
      // animation finishes, see the exchangingTiles cleanup effect above)
      // instead of appearing elsewhere while the old one is still fading.
      const awaitingReplacement = [...exchangingTiles.keys()].filter((id) => !replacementMapRef.current.has(id));
      const pairedCount = Math.min(awaitingReplacement.length, freshIds.length);
      for (let i = 0; i < pairedCount; i++) {
        replacementMapRef.current.set(awaitingReplacement[i], freshIds[i]);
      }

      return [...kept, ...freshIds.slice(pairedCount)];
    });
  }, [me, exchangingTiles]);

  // Each id keeps the rack slot it was drawn into: a tile placed on the
  // board (pending) becomes an empty slot rather than being removed, so the
  // other tiles don't shift/recenter as the rack empties out.
  const visibleRack = useMemo(() => {
    if (!me) return [];
    const usedIds = new Set(pending.map((t) => t.rackTileId));
    const byId = new Map(me.rack.map((t) => [t.id, t]));
    return rackOrder
      .map((id) => byId.get(id) ?? exchangingTiles.get(id))
      .filter((t): t is RackTile => !!t)
      .map((t) => ({ id: t.id, tile: usedIds.has(t.id) ? null : t }));
  }, [me, pending, rackOrder, exchangingTiles]);

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
    if (!gameId || exchangeSelection.size === 0 || !me) return;
    setError(null);
    const snapshot = new Map(me.rack.filter((t) => exchangeSelection.has(t.id)).map((t) => [t.id, t]));
    getSocket().emit("game:exchange", { gameId, rackTileIds: [...exchangeSelection] });
    setExchangingTiles(snapshot);
    setBagBlink(true);
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
              ) : opponents.length > 1 ? (
                <>
                  En attente de <strong>{state.currentPlayerId}</strong>
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
        {[me, ...opponents].map((player, i, all) =>
          player ? (
            <ScoreColumn
              key={player.username}
              player={player}
              label={player === me ? "Vous" : player.username}
              align={i === 0 ? "left" : i === all.length - 1 ? "right" : "center"}
              active={state.currentPlayerId === player.username}
              third={isThirdSeat(state.players, player.username)}
              anim={scoreAnim?.username === player.username ? scoreAnim : null}
            />
          ) : null
        )}
      </div>

      <div className={`game__board-area${boardShowsThirdSeatMove ? " game__board-area--third" : ""}`}>
        <ZoomableBoard
          board={state.board}
          pending={pending}
          preview={preview}
          dragHandlers={boardDragHandlers}
          waveCells={waveCells}
          moveScore={scoreAnim ? scoreAnim.to - scoreAnim.from : null}
          unseenOpponentCells={unseenOpponentCells}
        />
      </div>

      <div className="game__bag" aria-label={`Tuiles restantes dans le sac : ${state.bagCount}`}>
        <span
          className={`game__bag-count${bagBlink ? " game__bag-count--blink" : ""}`}
          aria-hidden="true"
        >
          {state.bagCount}
        </span>
        <svg
          className="game__bag-icon"
          aria-hidden="true"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8.5 9 L9.5 4 L14.5 4 L15.5 9" />
          <path d="M5 9 L19 9 L17 20 L7 20 Z" />
        </svg>
        <span className="game__bag-label" aria-hidden="true">
          Sac
        </span>
      </div>

      <Rack
        tiles={visibleRack}
        exchangeSelection={exchangeSelection}
        mode={mode === "exchange" ? "exchange" : "place"}
        onSelect={handleSelectTile}
        dragHandlers={rackDragHandlers}
        draggedTileId={drag?.rackTileId}
        exchangingIds={exchangingTiles.size > 0 ? new Set(exchangingTiles.keys()) : undefined}
        appearingIds={appearingTileIds.size > 0 ? appearingTileIds : undefined}
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
