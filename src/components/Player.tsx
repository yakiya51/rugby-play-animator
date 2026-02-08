import { Group, Circle, Text, Line } from "react-konva";
import { PLAYER_RADIUS, FOV_LEN, FOV_ANGLE } from "../types";

interface Props {
  id: string;
  number: number;
  x: number;
  y: number;
  angle: number;
  color: string;
  px: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string) => void;
}

const deg2rad = (d: number) => (d * Math.PI) / 180;

export default function Player({
  id,
  number,
  x,
  y,
  angle,
  color,
  px,
  selected,
  onSelect,
  onDragStart: onDS,
  onDragMove: onDM,
  onDragEnd: onDE,
}: Props) {
  const r = PLAYER_RADIUS;
  const halfFov = deg2rad(FOV_ANGLE / 2);
  const aRad = deg2rad(angle);
  const fovPts = [
    0,
    0,
    Math.cos(aRad - halfFov) * FOV_LEN,
    Math.sin(aRad - halfFov) * FOV_LEN,
    Math.cos(aRad) * FOV_LEN * 0.7,
    Math.sin(aRad) * FOV_LEN * 0.7,
    Math.cos(aRad + halfFov) * FOV_LEN,
    Math.sin(aRad + halfFov) * FOV_LEN,
    0,
    0,
  ];
  const fs = Math.max(1.8, r * 1.2);

  return (
    <Group
      x={x}
      y={y}
      draggable
      name="player"
      onClick={() => onSelect(id)}
      onTap={() => onSelect(id)}
      onDragStart={() => onDS(id)}
      onDragMove={(e) => onDM(id, e.target.x(), e.target.y())}
      onDragEnd={() => onDE(id)}
    >
      {selected && (
        <Circle radius={r + px * 2} stroke="#fbbf24" strokeWidth={px * 2} />
      )}
      <Line points={fovPts} fill={color} opacity={0.18} closed />
      <Circle
        radius={r}
        fill={color}
        stroke={selected ? "#fbbf24" : "#fff"}
        strokeWidth={px * 1.5}
      />
      <Text
        text={String(number)}
        fontSize={fs}
        fill="#fff"
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        width={r * 2}
        height={r * 2}
        offsetX={r}
        offsetY={r}
      />
    </Group>
  );
}
