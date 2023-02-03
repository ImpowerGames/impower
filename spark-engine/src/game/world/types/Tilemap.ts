import { Transform } from "./Transform";

interface Tile {
  s: string;
  x: number;
  y: number;
}

export interface Tilemap {
  transform: Transform;
  plane: "xz" | "zy" | "xy";
  flip: "x" | "y" | "z";
  tiles: Tile[];
}
