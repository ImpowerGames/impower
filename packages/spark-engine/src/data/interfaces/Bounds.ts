import { Size } from "./Size";
import { Vector2 } from "./Vector2";

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
