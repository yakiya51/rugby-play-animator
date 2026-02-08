import { useState, useEffect, useRef, useCallback } from "react";
import { Stage, Layer, Rect, Line, Text, Group } from "react-konva";
import type Konva from "konva";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ZoomIn, ZoomOut, RotateCcw, ArrowRightLeft } from "lucide-react";
import { useStore } from "../store";
import type { Keyframe } from "../types";
import Player from "./Player";

const FIELD_COLOR = "#2d6a1e";
const LINE_COLOR = "#ffffff";
const LINE_W = 2;
const PADDING = 20;

const FIELD_M = { width: 100, height: 70 };
const TRY_ZONE = 10;
const TOTAL_M = {
  width: FIELD_M.width + TRY_ZONE * 2,
  height: FIELD_M.height,
};
const FIELD_CENTER = { x: TOTAL_M.width / 2, y: TOTAL_M.height / 2 };

// --- Configurable zoom limits (fraction of fit-to-screen) ---
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.2;
const ZOOM_STEP = 0.1;

type Orientation = "horizontal" | "vertical";
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export default function FieldCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width: cw, height: ch } = useContainerSize(containerRef);
  const players = useStore((s) => s.players);
  const selectedPlayerId = useStore((s) => s.selectedPlayerId);
  const keyframes = useStore((s) => s.keyframes);

  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const isVert = orientation === "vertical";
  const fitW = isVert ? TOTAL_M.height : TOTAL_M.width;
  const fitH = isVert ? TOTAL_M.width : TOTAL_M.height;
  const baseScale =
    cw && ch ? Math.min((cw - PADDING) / fitW, (ch - PADDING) / fitH) : 1;
  const effScale = baseScale * zoom;
  const px = 1 / effScale;

  const clampPan = useCallback(
    (p: { x: number; y: number }) => ({
      x: clamp(p.x, -cw / 2, cw / 2),
      y: clamp(p.y, -ch / 2, ch / 2),
    }),
    [cw, ch]
  );

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const ptr = e.target.getStage()?.getPointerPosition();
      if (!ptr) return;
      const dir = e.evt.deltaY > 0 ? -1 : 1;
      const newZoom = clamp(zoom + dir * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
      const r = newZoom / zoom;
      setPan((prev) =>
        clampPan({
          x: prev.x * r + (ptr.x - cw / 2) * (1 - r),
          y: prev.y * r + (ptr.y - ch / 2) * (1 - r),
        })
      );
      setZoom(newZoom);
    },
    [zoom, cw, ch, clampPan]
  );

  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      let node: Konva.Node | null = e.target;
      while (node && node !== e.target.getStage()) {
        if (node.name() === "player") return;
        node = node.parent;
      }
      if (e.evt.button === 0 || e.evt.button === 1) {
        dragging.current = true;
        lastMouse.current = { x: e.evt.clientX, y: e.evt.clientY };
        e.evt.preventDefault();
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!dragging.current) return;
      const dx = e.evt.clientX - lastMouse.current.x;
      const dy = e.evt.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.evt.clientX, y: e.evt.clientY };
      setPan((prev) => clampPan({ x: prev.x + dx, y: prev.y + dy }));
    },
    [clampPan]
  );

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handlePlayerSelect = useCallback((id: string) => {
    useStore.getState().selectPlayer(id);
  }, []);

  const handlePlayerDragStart = useCallback((id: string) => {
    useStore.getState().startRecording(id);
  }, []);

  const handlePlayerDragMove = useCallback(
    (id: string, gx: number, gy: number) => {
      useStore.getState().movePlayer(id, gx - TRY_ZONE, gy);
    },
    []
  );

  const handlePlayerDragEnd = useCallback(() => {
    useStore.getState().stopRecording();
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const toggleOrientation = useCallback(() => {
    setOrientation((o) => (o === "horizontal" ? "vertical" : "horizontal"));
    resetView();
  }, [resetView]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-zinc-950">
      {cw > 0 && (
        <Stage
          width={cw}
          height={ch}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <Layer>
            <Group
              x={cw / 2 + pan.x}
              y={ch / 2 + pan.y}
              offsetX={FIELD_CENTER.x}
              offsetY={FIELD_CENTER.y}
              scaleX={effScale}
              scaleY={effScale}
              rotation={isVert ? -90 : 0}
            >
              <FieldLines px={px} labelRotation={isVert ? 90 : 0} />
              <PlayerPaths
                keyframes={keyframes}
                players={players}
                selectedPlayerId={selectedPlayerId}
                px={px}
              />
              {players.map((p) => (
                <Player
                  key={p.id}
                  id={p.id}
                  number={p.number}
                  x={X(p.x)}
                  y={p.y}
                  angle={p.angle}
                  color={p.color}
                  px={px}
                  selected={p.id === selectedPlayerId}
                  onSelect={handlePlayerSelect}
                  onDragStart={handlePlayerDragStart}
                  onDragMove={handlePlayerDragMove}
                  onDragEnd={handlePlayerDragEnd}
                />
              ))}
            </Group>
          </Layer>
        </Stage>
      )}

      <Toolbar
        zoom={zoom}
        isVert={isVert}
        onZoomIn={() =>
          setZoom((z) => clamp(z + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))
        }
        onZoomOut={() =>
          setZoom((z) => clamp(z - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))
        }
        onReset={resetView}
        onToggle={toggleOrientation}
      />
    </div>
  );
}

const X = (m: number) => m + TRY_ZONE;

function PlayerPaths({
  keyframes,
  players,
  selectedPlayerId,
  px,
}: {
  keyframes: Record<string, Keyframe[]>;
  players: { id: string; color: string }[];
  selectedPlayerId: string | null;
  px: number;
}) {
  return (
    <>
      {players.map((p) => {
        const kfs = keyframes[p.id];
        if (!kfs || kfs.length < 2) return null;
        const points = kfs.flatMap((k) => [X(k.x), k.y]);
        const selected = p.id === selectedPlayerId;
        return (
          <Line
            key={`path-${p.id}`}
            points={points}
            stroke={p.color}
            strokeWidth={selected ? 1.4 * px : 1 * px}
            opacity={selected ? 0.85 : selectedPlayerId ? 0.25 : 0.5}
            dash={[3 * px, 3 * px]}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        );
      })}
    </>
  );
}

function FieldLines({
  px,
  labelRotation,
}: {
  px: number;
  labelRotation: number;
}) {
  const lw = LINE_W * px;
  const thin = px;
  const dash = [6 * px, 4 * px];
  const fs = 10 * px;
  const H = TOTAL_M.height;
  const W = FIELD_M.width;

  return (
    <>
      <Rect x={0} y={0} width={TRY_ZONE} height={H} fill="#1e5416" />
      <Rect x={X(W)} y={0} width={TRY_ZONE} height={H} fill="#1e5416" />
      <Rect x={TRY_ZONE} y={0} width={W} height={H} fill={FIELD_COLOR} />
      <Rect
        x={0}
        y={0}
        width={TOTAL_M.width}
        height={H}
        stroke={LINE_COLOR}
        strokeWidth={lw}
      />

      {[0, W].map((x) => (
        <Line
          key={`try-${x}`}
          points={[X(x), 0, X(x), H]}
          stroke={LINE_COLOR}
          strokeWidth={lw}
        />
      ))}

      {[22, W - 22, W / 2].map((x) => (
        <Line
          key={`solid-${x}`}
          points={[X(x), 0, X(x), H]}
          stroke={LINE_COLOR}
          strokeWidth={lw}
        />
      ))}

      {[40, W - 40, 5, W - 5].map((x) => (
        <Line
          key={`dash-${x}`}
          points={[X(x), 0, X(x), H]}
          stroke={LINE_COLOR}
          strokeWidth={thin}
          dash={dash}
          opacity={0.4}
        />
      ))}

      <Line
        points={[X(W / 2 - 1), H / 2, X(W / 2 + 1), H / 2]}
        stroke={LINE_COLOR}
        strokeWidth={lw}
      />

      {[0, 22, W / 2, W - 22, W].map((xm) =>
        [5, 15, H - 15, H - 5].map((ym) => (
          <Line
            key={`t-${xm}-${ym}`}
            points={[X(xm) - 3 * px, ym, X(xm) + 3 * px, ym]}
            stroke={LINE_COLOR}
            strokeWidth={thin}
            opacity={0.5}
          />
        ))
      )}

      {[
        { x: TRY_ZONE / 2, label: "IGA" },
        { x: X(W) + TRY_ZONE / 2, label: "IGA" },
        { x: X(0), label: "0" },
        { x: X(22), label: "22" },
        { x: X(50), label: "50" },
        { x: X(78), label: "22" },
        { x: X(100), label: "0" },
      ].map(({ x, label }) => (
        <Text
          key={`lbl-${x}`}
          x={x}
          y={H + 4 * px}
          text={label}
          fontSize={fs}
          fill="#a1a1aa"
          align="center"
          offsetX={label.length * 3 * px}
          rotation={labelRotation}
        />
      ))}
    </>
  );
}

function Toolbar({
  zoom,
  isVert,
  onZoomIn,
  onZoomOut,
  onReset,
  onToggle,
}: {
  zoom: number;
  isVert: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1">
      <TooltipProvider delayDuration={300}>
        <span className="text-xs text-zinc-400 font-mono mr-1 select-none">
          {Math.round(zoom * 100)}%
        </span>
        <TBtn tip="Zoom In" onClick={onZoomIn}>
          <ZoomIn className="size-4" />
        </TBtn>
        <TBtn tip="Zoom Out" onClick={onZoomOut}>
          <ZoomOut className="size-4" />
        </TBtn>
        <TBtn tip="Reset View" onClick={onReset}>
          <RotateCcw className="size-4" />
        </TBtn>
        <TBtn
          tip={isVert ? "Switch to Horizontal" : "Switch to Vertical"}
          onClick={onToggle}
        >
          <ArrowRightLeft
            className={`size-4 transition-transform ${
              isVert ? "rotate-90" : ""
            }`}
          />
        </TBtn>
      </TooltipProvider>
    </div>
  );
}

function TBtn({
  children,
  tip,
  onClick,
}: {
  children: React.ReactNode;
  tip: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary" size="icon" onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
