import { Clock } from "@impower/spark-engine/src/game/core/classes/Clock";
import { Renderer } from "pixi.js";
import { Camera, CameraOrbitControl } from "./plugins/projection";

export interface IApplication {
  screen: { width: number; height: number; resolution: number };
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  dolly: CameraOrbitControl;
  camera: Camera;
  clock: Clock;
  context: any;
}
