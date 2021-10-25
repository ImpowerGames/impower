import { Optional, Color, Activable, Vector2 } from "../../../../impower-core";
import { Bounds } from "../bounds";
import { Size } from "../size";
import { CameraTransformConfig } from "./cameraTransformConfig";

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

export const isCameraConfig = (obj: unknown): obj is CameraConfig => {
  if (!obj) {
    return false;
  }
  const cameraConfig = obj as CameraConfig;
  return (
    cameraConfig.pixelPerfect !== undefined &&
    cameraConfig.position !== undefined &&
    cameraConfig.size !== undefined &&
    cameraConfig.transform !== undefined &&
    cameraConfig.scroll !== undefined &&
    cameraConfig.backgroundColor !== undefined &&
    cameraConfig.bounds !== undefined
  );
};

export const createCameraConfig = (
  obj?: Partial<CameraConfig>
): CameraConfig => ({
  pixelPerfect: true,
  position: {
    x: 0,
    y: 0,
  },
  size: {
    useDefault: true,
    value: { width: 200, height: 200 },
  },
  transform: {
    rotation: 0,
    zoom: 1,
  },
  scroll: {
    x: 0,
    y: 0,
  },
  backgroundColor: {
    active: false,
    value: { h: 0, s: 0, l: 0, a: 1 },
  },
  bounds: {
    active: false,
    value: {
      position: { x: 0, y: 0 },
      size: { width: 200, height: 200 },
    },
  },
  ...obj,
});
