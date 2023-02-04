import { Tile } from "./Tile";
import { Transform } from "./Transform";

export interface Tilemap {
  transform: Transform;
  plane: "xz" | "zy" | "xy";
  flip: "x" | "y" | "z";
  tiles: Tile[];
}
