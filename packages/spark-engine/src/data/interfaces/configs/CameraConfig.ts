import { Activable } from "../Activable";
import { Bounds } from "../Bounds";
import { Color } from "../Color";
import { Optional } from "../Optional";
import { Size } from "../Size";
import { Vector2 } from "../Vector2";
import { CameraTransformConfig } from "./CameraTransformConfig";

export interface CameraConfig {
  /**
   * Should the Camera round pixels before rendering?
   */
  pixelPerfect: boolean;
  /**
   * The position of the Camera viewport, relative to the top-left of the game canvas.
   */
  position: Vector2;
  /**
   * The size of the Camera viewport.
   *
   * Defaults to the same size as your game, if not specified.
   */
  size: Optional<Size>;
  /**
   * The default zoom level and rotation of the Camera.
   */
  transform: CameraTransformConfig;
  /**
   * The scroll position of the Camera.
   */
  scroll: Vector2;
  /**
   * A CSS color string controlling the Camera background color.
   */
  backgroundColor: Activable<Color>;
  /**
   * Defines the Camera bounds.
   */
  bounds: Activable<Bounds>;
}
