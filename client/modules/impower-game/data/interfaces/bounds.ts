import { Vector2 } from "../../../impower-core";
import { Size } from "./size";

export interface Bounds {
  /**
   * The top-left position of the bounds.
   */
  position: Vector2;
  /**
   * The size of the bounds.
   */
  size: Size;
}

export const createBounds = (data?: Partial<Bounds>): Bounds => ({
  position: { x: 0, y: 0 },
  size: { width: 200, height: 200 },
  ...data,
});
