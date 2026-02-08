import { create } from "zustand";
import type { Track, PlayerData, Keyframe } from "./types";
import { FPS } from "./types";

const RED = "#dc2626";
const BLUE = "#2563eb";

const defaultPlayers: PlayerData[] = [
  { id: "p1", number: 1, x: 40, y: 25, angle: 90, color: RED },
  { id: "p2", number: 2, x: 40, y: 35, angle: 90, color: RED },
  { id: "p3", number: 3, x: 40, y: 45, angle: 90, color: RED },
  { id: "p4", number: 4, x: 38, y: 29, angle: 90, color: RED },
  { id: "p5", number: 5, x: 38, y: 41, angle: 90, color: RED },
  { id: "p6", number: 6, x: 36, y: 23, angle: 90, color: RED },
  { id: "p7", number: 7, x: 36, y: 47, angle: 90, color: RED },
  { id: "p8", number: 8, x: 34, y: 35, angle: 90, color: RED },
  { id: "p9", number: 9, x: 32, y: 35, angle: 90, color: BLUE },
  { id: "p10", number: 10, x: 28, y: 35, angle: 90, color: BLUE },
  { id: "p11", number: 11, x: 20, y: 10, angle: 90, color: BLUE },
  { id: "p12", number: 12, x: 24, y: 28, angle: 90, color: BLUE },
  { id: "p13", number: 13, x: 22, y: 42, angle: 90, color: BLUE },
  { id: "p14", number: 14, x: 20, y: 60, angle: 90, color: BLUE },
  { id: "p15", number: 15, x: 15, y: 35, angle: 90, color: BLUE },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function interpolateAt(
  kfs: Keyframe[],
  tick: number
): { x: number; y: number; angle: number } | null {
  if (kfs.length === 0) return null;
  if (tick <= kfs[0].tick) return kfs[0];
  if (tick >= kfs[kfs.length - 1].tick) return kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (tick >= kfs[i].tick && tick <= kfs[i + 1].tick) {
      const t = (tick - kfs[i].tick) / (kfs[i + 1].tick - kfs[i].tick);
      return {
        x: lerp(kfs[i].x, kfs[i + 1].x, t),
        y: lerp(kfs[i].y, kfs[i + 1].y, t),
        angle: lerp(kfs[i].angle, kfs[i + 1].angle, t),
      };
    }
  }
  return kfs[kfs.length - 1];
}

interface Snapshot {
  tracks: Track[];
  players: PlayerData[];
  keyframes: Record<string, Keyframe[]>;
}

const MAX_HISTORY = 100;

export interface SelectedSegment {
  trackId: string;
  segIndex: number;
}

interface State {
  currentTick: number;
  totalTicks: number;
  tracks: Track[];
  players: PlayerData[];
  keyframes: Record<string, Keyframe[]>;
  isPlaying: boolean;
  selectedPlayerId: string | null;
  selectedSegment: SelectedSegment | null;
  recordingPlayerId: string | null;
  recordingStartTick: number;
  _past: Snapshot[];
  _future: Snapshot[];
  setTick: (t: number) => void;
  setPlaying: (p: boolean) => void;
  movePlayer: (id: string, x: number, y: number) => void;
  rotatePlayer: (id: string, angle: number) => void;
  selectPlayer: (id: string | null) => void;
  selectSegment: (seg: SelectedSegment | null) => void;
  deleteSelectedSegment: () => void;
  startRecording: (playerId: string) => void;
  stopRecording: () => void;
  moveSegment: (
    trackId: string,
    segIndex: number,
    newStartTick: number
  ) => void;
  resizeSegment: (
    trackId: string,
    segIndex: number,
    edge: "start" | "end",
    newTick: number
  ) => void;
  applyKeyframesAtTick: (tick: number) => void;
  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;
}

function snap(s: State): Snapshot {
  return { tracks: s.tracks, players: s.players, keyframes: s.keyframes };
}

export const useStore = create<State>((set, get) => ({
  currentTick: 0,
  totalTicks: FPS * 30,
  tracks: [
    ...defaultPlayers.map((p) => ({
      id: p.id,
      type: "player" as const,
      label: `#${p.number}`,
      segments: [],
    })),
    { id: "ball", type: "ball" as const, label: "Ball", segments: [] },
  ],
  players: defaultPlayers,
  keyframes: {},
  selectedPlayerId: null,
  selectedSegment: null,
  recordingPlayerId: null,
  recordingStartTick: 0,
  isPlaying: false,
  _past: [],
  _future: [],

  pushSnapshot: () => {
    const s = get();
    set({
      _past: [...s._past.slice(-(MAX_HISTORY - 1)), snap(s)],
      _future: [],
    });
  },

  undo: () => {
    const s = get();
    if (s._past.length === 0) return;
    const prev = s._past[s._past.length - 1];
    set({
      _past: s._past.slice(0, -1),
      _future: [snap(s), ...s._future],
      tracks: prev.tracks,
      players: prev.players,
      keyframes: prev.keyframes,
      selectedSegment: null,
    });
    get().applyKeyframesAtTick(get().currentTick);
  },

  redo: () => {
    const s = get();
    if (s._future.length === 0) return;
    const next = s._future[0];
    set({
      _future: s._future.slice(1),
      _past: [...s._past, snap(s)],
      tracks: next.tracks,
      players: next.players,
      keyframes: next.keyframes,
      selectedSegment: null,
    });
    get().applyKeyframesAtTick(get().currentTick);
  },

  selectSegment: (seg) => set({ selectedSegment: seg }),

  deleteSelectedSegment: () => {
    const s = get();
    if (!s.selectedSegment) return;
    const { trackId, segIndex } = s.selectedSegment;
    const track = s.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const seg = track.segments[segIndex];
    if (!seg) return;
    s.pushSnapshot();
    const kfs = (s.keyframes[trackId] || []).filter(
      (k) => k.tick < seg.startTick || k.tick > seg.endTick
    );
    set({
      selectedSegment: null,
      tracks: s.tracks.map((t) =>
        t.id === trackId
          ? { ...t, segments: t.segments.filter((_, i) => i !== segIndex) }
          : t
      ),
      keyframes: { ...s.keyframes, [trackId]: kfs },
    });
    get().applyKeyframesAtTick(get().currentTick);
  },

  setTick: (t) => {
    const clamped = Math.max(0, Math.min(t, get().totalTicks));
    set({ currentTick: clamped });
    get().applyKeyframesAtTick(clamped);
  },

  setPlaying: (p) => set({ isPlaying: p }),

  movePlayer: (id, x, y) => {
    const s = get();
    const tick = Math.round(s.currentTick);
    const player = s.players.find((p) => p.id === id);
    if (!player) return;
    const kf: Keyframe = { tick, x, y, angle: player.angle };
    const existing = s.keyframes[id] || [];
    const filtered = existing.filter((k) => k.tick !== tick);
    filtered.push(kf);
    filtered.sort((a, b) => a.tick - b.tick);
    set({
      players: s.players.map((p) => (p.id === id ? { ...p, x, y } : p)),
      keyframes: { ...s.keyframes, [id]: filtered },
    });
  },

  rotatePlayer: (id, angle) =>
    set({
      players: get().players.map((p) => (p.id === id ? { ...p, angle } : p)),
    }),

  selectPlayer: (id) => set({ selectedPlayerId: id }),

  startRecording: (playerId) => {
    const s = get();
    const player = s.players.find((p) => p.id === playerId);
    if (!player) return;
    const tick = Math.round(s.currentTick);
    const track = s.tracks.find((t) => t.id === playerId);
    if (
      track?.segments.some((seg) => tick >= seg.startTick && tick < seg.endTick)
    )
      get().pushSnapshot();
    const kf: Keyframe = {
      tick,
      x: player.x,
      y: player.y,
      angle: player.angle,
    };
    const existing = s.keyframes[playerId] || [];
    const filtered = existing.filter((k) => k.tick !== tick);
    filtered.push(kf);
    filtered.sort((a, b) => a.tick - b.tick);
    set({
      selectedPlayerId: playerId,
      selectedSegment: null,
      recordingPlayerId: playerId,
      recordingStartTick: tick,
      keyframes: { ...s.keyframes, [playerId]: filtered },
    });
  },

  stopRecording: () => {
    const s = get();
    if (!s.recordingPlayerId) return;
    const endTick = Math.round(s.currentTick);
    const startTick = s.recordingStartTick;
    if (endTick <= startTick) {
      set({ recordingPlayerId: null });
      return;
    }
    set({
      recordingPlayerId: null,
      tracks: s.tracks.map((t) =>
        t.id === s.recordingPlayerId
          ? {
              ...t,
              segments: [...t.segments, { startTick, endTick }].sort(
                (a, b) => a.startTick - b.startTick
              ),
            }
          : t
      ),
    });
  },

  moveSegment: (trackId, segIndex, newStartTick) => {
    const s = get();
    const track = s.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const seg = track.segments[segIndex];
    if (!seg) return;
    const dur = seg.endTick - seg.startTick;
    let ns = Math.round(
      Math.max(0, Math.min(newStartTick, s.totalTicks - dur))
    );
    const others = track.segments.filter((_, i) => i !== segIndex);
    for (const o of others) {
      if (ns < o.endTick && ns + dur > o.startTick) {
        ns = newStartTick < seg.startTick ? o.endTick : o.startTick - dur;
      }
    }
    ns = Math.round(Math.max(0, Math.min(ns, s.totalTicks - dur)));
    if (others.some((o) => ns < o.endTick && ns + dur > o.startTick)) return;
    const delta = ns - seg.startTick;
    if (delta === 0) return;
    const oldStart = seg.startTick;
    const oldEnd = seg.endTick;
    const kfs = (s.keyframes[trackId] || [])
      .map((k) =>
        k.tick >= oldStart && k.tick <= oldEnd
          ? { ...k, tick: k.tick + delta }
          : k
      )
      .sort((a, b) => a.tick - b.tick);
    const newSegments = [...track.segments];
    newSegments[segIndex] = { startTick: ns, endTick: ns + dur };
    set({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, segments: newSegments } : t
      ),
      keyframes: { ...s.keyframes, [trackId]: kfs },
    });
  },

  resizeSegment: (trackId, segIndex, edge, newTick) => {
    const s = get();
    const track = s.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const seg = track.segments[segIndex];
    if (!seg) return;
    const others = track.segments.filter((_, i) => i !== segIndex);
    const MIN_DUR = 3;
    let start = seg.startTick;
    let end = seg.endTick;
    if (edge === "start") {
      start = Math.round(Math.max(0, Math.min(newTick, end - MIN_DUR)));
      for (const o of others) {
        if (start < o.endTick && end > o.startTick) start = o.endTick;
      }
    } else {
      end = Math.round(
        Math.max(start + MIN_DUR, Math.min(newTick, s.totalTicks))
      );
      for (const o of others) {
        if (start < o.endTick && end > o.startTick) end = o.startTick;
      }
    }
    if (start === seg.startTick && end === seg.endTick) return;
    const oldDur = seg.endTick - seg.startTick;
    const newDur = end - start;
    const kept = (s.keyframes[trackId] || []).filter(
      (k) => k.tick < seg.startTick || k.tick > seg.endTick
    );
    const stretched = (s.keyframes[trackId] || [])
      .filter((k) => k.tick >= seg.startTick && k.tick <= seg.endTick)
      .map((k) => {
        const t = oldDur > 0 ? (k.tick - seg.startTick) / oldDur : 0;
        return { ...k, tick: Math.round(start + t * newDur) };
      });
    const merged = [...kept, ...stretched].sort((a, b) => a.tick - b.tick);
    const newSegments = [...track.segments];
    newSegments[segIndex] = { startTick: start, endTick: end };
    set({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, segments: newSegments } : t
      ),
      keyframes: { ...s.keyframes, [trackId]: merged },
    });
  },

  applyKeyframesAtTick: (tick) => {
    const s = get();
    if (s.recordingPlayerId) return;
    let changed = false;
    const newPlayers = s.players.map((p) => {
      const kfs = s.keyframes[p.id];
      if (!kfs || kfs.length === 0) return p;
      const interp = interpolateAt(kfs, tick);
      if (!interp) return p;
      if (p.x !== interp.x || p.y !== interp.y || p.angle !== interp.angle) {
        changed = true;
        return { ...p, x: interp.x, y: interp.y, angle: interp.angle };
      }
      return p;
    });
    if (changed) set({ players: newPlayers });
  },
}));
