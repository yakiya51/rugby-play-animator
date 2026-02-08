import React, { useRef, useEffect, useCallback, useMemo } from "react";
import { useStore } from "../store";
import { FPS, TICK_PX, TRACK_H, RULER_H, LABEL_W } from "../types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Play, Pause, SkipBack, Undo2, Redo2 } from "lucide-react";

export default function Timeline() {
  const totalTicks = useStore((s) => s.totalTicks);
  const tracks = useStore((s) => s.tracks);
  const isPlaying = useStore((s) => s.isPlaying);
  const isRecording = useStore((s) => s.recordingPlayerId !== null);
  const recordingPlayerId = useStore((s) => s.recordingPlayerId);
  const recordingStartTick = useStore((s) => s.recordingStartTick);
  const selectedPlayerId = useStore((s) => s.selectedPlayerId);
  const selectedSegment = useStore((s) => s.selectedSegment);
  const selectPlayer = useStore((s) => s.selectPlayer);
  const setTick = useStore((s) => s.setTick);
  const setPlaying = useStore((s) => s.setPlaying);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const prevRef = useRef(0);

  const contentW = totalTicks * TICK_PX;
  const totalH = RULER_H + tracks.length * TRACK_H;

  // Playback loop
  useEffect(() => {
    if (!isPlaying && !isRecording) return;
    prevRef.current = performance.now();
    const step = (now: number) => {
      const dt = now - prevRef.current;
      prevRef.current = now;
      const s = useStore.getState();
      const next = s.currentTick + (dt / 1000) * FPS;
      if (s.recordingPlayerId) {
        const track = s.tracks.find((t) => t.id === s.recordingPlayerId);
        if (track) {
          const boundary = track.segments
            .filter((seg) => seg.startTick > s.recordingStartTick)
            .reduce((min, seg) => Math.min(min, seg.startTick), Infinity);
          if (next >= boundary) {
            s.setTick(boundary);
            s.stopRecording();
            return;
          }
        }
      }
      if (next >= s.totalTicks) {
        s.setTick(s.totalTicks);
        useStore.setState({ isPlaying: false });
        return;
      }
      s.setTick(next);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, isRecording]);

  // Auto-scroll playhead into view
  useEffect(() => {
    return useStore.subscribe((state) => {
      const el = scrollRef.current;
      if (!el || (!state.isPlaying && !state.recordingPlayerId)) return;
      const x = state.currentTick * TICK_PX + LABEL_W;
      if (x > el.scrollLeft + el.clientWidth - 50) {
        el.scrollLeft = x - el.clientWidth / 3;
      }
    });
  }, []);

  // Seek helpers
  const seek = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const relX = clientX - rect.left;
      if (relX < LABEL_W) return;
      const x = relX + el.scrollLeft - LABEL_W;
      setTick(Math.round(x / TICK_PX));
    },
    [setTick]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      useStore.getState().selectSegment(null);
      seek(e.clientX);
      const onMove = (me: MouseEvent) => seek(me.clientX);
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [seek]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying(!s.isPlaying);
      } else if (e.code === "ArrowLeft") setTick(s.currentTick - 1);
      else if (e.code === "ArrowRight") setTick(s.currentTick + 1);
      else if (e.code === "Home") setTick(0);
      else if (e.code === "Escape") {
        useStore.getState().selectPlayer(null);
        useStore.getState().selectSegment(null);
      } else if (e.code === "Delete" || e.code === "Backspace") {
        s.deleteSelectedSegment();
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && e.shiftKey) {
        e.preventDefault();
        s.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") {
        e.preventDefault();
        s.redo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setTick, setPlaying]);

  // Ruler marks
  const rulerMarks = useMemo(() => {
    const m: React.ReactNode[] = [];
    const secs = totalTicks / FPS;
    for (let s = 0; s <= secs; s++) {
      m.push(
        <div
          key={s}
          className="absolute top-0 h-full border-l border-zinc-600"
          style={{ left: s * FPS * TICK_PX }}
        >
          <span className="ml-0.5 text-[10px] leading-none text-zinc-400">
            {s}s
          </span>
        </div>
      );
    }
    for (let t = 0; t <= totalTicks; t += 15) {
      if (t % FPS === 0) continue;
      m.push(
        <div
          key={`h${t}`}
          className="absolute bottom-0 h-2/5 border-l border-zinc-700/50"
          style={{ left: t * TICK_PX }}
        />
      );
    }
    return m;
  }, [totalTicks]);

  const gridBg = `repeating-linear-gradient(90deg,transparent,transparent ${
    FPS * TICK_PX - 1
  }px,rgba(255,255,255,0.04) ${FPS * TICK_PX - 1}px,rgba(255,255,255,0.04) ${
    FPS * TICK_PX
  }px)`;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full bg-zinc-900 select-none">
        <div className="flex items-center gap-1 px-2 py-1 bg-zinc-800 border-b border-zinc-700 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setTick(0)}>
                <SkipBack className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rewind (Home)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPlaying(!isPlaying)}
              >
                {isPlaying ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isPlaying ? "Pause" : "Play"} (Space)
            </TooltipContent>
          </Tooltip>
          <TimeDisplay />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => useStore.getState().undo()}
              >
                <Undo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => useStore.getState().redo()}
              >
                <Redo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
          {isRecording && (
            <span className="ml-2 flex items-center gap-1 text-xs text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              REC
            </span>
          )}
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-auto"
          onMouseDown={onMouseDown}
        >
          <div
            className="relative"
            style={{ width: contentW + LABEL_W, height: totalH }}
          >
            {/* Ruler */}
            <div className="sticky top-0 z-20 flex" style={{ height: RULER_H }}>
              <div
                className="sticky left-0 z-30 bg-zinc-800 border-b border-r border-zinc-700"
                style={{ width: LABEL_W, minWidth: LABEL_W }}
              />
              <div
                className="relative bg-zinc-800 border-b border-zinc-700"
                style={{ width: contentW }}
              >
                {rulerMarks}
              </div>
            </div>

            {/* Tracks */}
            {tracks.map((track, i) => {
              const isSel = track.id === selectedPlayerId;
              const isRec = track.id === recordingPlayerId;
              return (
                <div
                  key={track.id}
                  className="flex"
                  style={{ height: TRACK_H }}
                >
                  <div
                    className={`sticky left-0 z-10 flex items-center px-2 text-xs font-medium border-r border-b border-zinc-700 shrink-0 cursor-pointer ${
                      track.type === "ball"
                        ? "text-amber-400"
                        : isSel
                        ? "text-white"
                        : "text-zinc-300"
                    } ${isSel ? "bg-zinc-700" : "bg-zinc-800"}`}
                    style={{ width: LABEL_W, minWidth: LABEL_W }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      selectPlayer(isSel ? null : track.id);
                    }}
                  >
                    {track.label}
                  </div>
                  <div
                    className={`relative border-b border-zinc-800 ${
                      isSel ? "bg-zinc-700/20" : i % 2 ? "bg-zinc-800/30" : ""
                    }`}
                    style={{ width: contentW, backgroundImage: gridBg }}
                  >
                    {track.segments.map((seg, j) => (
                      <DraggableSegment
                        key={j}
                        trackId={track.id}
                        segIndex={j}
                        startTick={seg.startTick}
                        endTick={seg.endTick}
                        type={track.type}
                        selected={
                          selectedSegment?.trackId === track.id &&
                          selectedSegment?.segIndex === j
                        }
                      />
                    ))}
                    {isRec && (
                      <RecordingSegment startTick={recordingStartTick} />
                    )}
                  </div>
                </div>
              );
            })}

            <Playhead height={totalH} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Playhead({ height }: { height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      ref.current.style.transform = `translateX(${
        useStore.getState().currentTick * TICK_PX + LABEL_W
      }px)`;
    };
    update();
    return useStore.subscribe(update);
  }, []);
  return (
    <div
      ref={ref}
      className="absolute top-0 left-0 pointer-events-none z-40"
      style={{ height }}
    >
      <div
        className="w-3 h-3 -ml-1.5 bg-red-500"
        style={{ clipPath: "polygon(0 0,100% 0,50% 100%)" }}
      />
      <div
        className="w-0.5 -ml-px bg-red-500"
        style={{ height: height - 12 }}
      />
    </div>
  );
}

function TimeDisplay() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const t = useStore.getState().currentTick / FPS;
      const m = Math.floor(t / 60);
      const s = t % 60;
      ref.current.textContent = `${m}:${s.toFixed(2).padStart(5, "0")}`;
    };
    update();
    return useStore.subscribe(update);
  }, []);
  return <span ref={ref} className="ml-2 font-mono text-xs text-zinc-300" />;
}

function RecordingSegment({ startTick }: { startTick: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const w =
        (Math.round(useStore.getState().currentTick) - startTick) * TICK_PX;
      ref.current.style.width = `${Math.max(0, w)}px`;
    };
    update();
    return useStore.subscribe(update);
  }, [startTick]);
  return (
    <div
      ref={ref}
      className="absolute top-1 bottom-1 rounded-sm bg-red-500/40"
      style={{ left: startTick * TICK_PX }}
    />
  );
}

function DraggableSegment({
  trackId,
  segIndex,
  startTick,
  endTick,
  type,
  selected,
}: {
  trackId: string;
  segIndex: number;
  startTick: number;
  endTick: number;
  type: string;
  selected: boolean;
}) {
  const handleBodyDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      useStore.getState().selectSegment({ trackId, segIndex });
      const startX = e.clientX;
      const origStart = startTick;
      let pushed = false;
      const onMove = (me: MouseEvent) => {
        if (!pushed) {
          useStore.getState().pushSnapshot();
          pushed = true;
        }
        const dx = me.clientX - startX;
        const newStart = origStart + Math.round(dx / TICK_PX);
        useStore.getState().moveSegment(trackId, segIndex, newStart);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [trackId, segIndex, startTick]
  );

  const handleEdgeDown = useCallback(
    (edge: "start" | "end", e: React.MouseEvent) => {
      e.stopPropagation();
      useStore.getState().selectSegment({ trackId, segIndex });
      const startX = e.clientX;
      const origTick = edge === "start" ? startTick : endTick;
      let pushed = false;
      const onMove = (me: MouseEvent) => {
        if (!pushed) {
          useStore.getState().pushSnapshot();
          pushed = true;
        }
        const dx = me.clientX - startX;
        const newTick = origTick + Math.round(dx / TICK_PX);
        useStore.getState().resizeSegment(trackId, segIndex, edge, newTick);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [trackId, segIndex, startTick, endTick]
  );

  const w = (endTick - startTick) * TICK_PX;
  const HANDLE_W = 6;
  return (
    <div
      className={`absolute top-1 bottom-1 rounded-sm cursor-grab active:cursor-grabbing ${
        type === "ball" ? "bg-amber-500/60" : "bg-blue-500/60"
      } ${selected ? "ring-1 ring-white" : ""}`}
      style={{
        left: startTick * TICK_PX,
        width: w,
      }}
      onMouseDown={handleBodyDown}
    >
      <div
        className="absolute left-0 top-0 bottom-0 cursor-ew-resize hover:bg-white/20 rounded-l-sm"
        style={{ width: HANDLE_W }}
        onMouseDown={(e) => handleEdgeDown("start", e)}
      />
      <div
        className="absolute right-0 top-0 bottom-0 cursor-ew-resize hover:bg-white/20 rounded-r-sm"
        style={{ width: HANDLE_W }}
        onMouseDown={(e) => handleEdgeDown("end", e)}
      />
    </div>
  );
}
