export const FPS = 30;
export const TICK_PX = 4;
export const TRACK_H = 32;
export const RULER_H = 28;
export const LABEL_W = 64;

export const PLAYER_RADIUS = 2;
export const FOV_LEN = 4;
export const FOV_ANGLE = 40;

export interface Segment {
  startTick: number;
  endTick: number;
}

export interface Track {
  id: string;
  type: "player" | "ball";
  label: string;
  segments: Segment[];
}

export interface Keyframe {
  tick: number;
  x: number;
  y: number;
  angle: number;
}

export interface PlayerData {
  id: string;
  number: number;
  x: number;
  y: number;
  angle: number;
  color: string;
}
