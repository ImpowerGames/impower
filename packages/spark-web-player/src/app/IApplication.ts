import { type Container, type Renderer } from "pixi.js";
import { type Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { type Message } from "../../../spark-engine/src/game/core/types/Message";
import type AudioManager from "./managers/AudioManager";
import type EventManager from "./managers/EventManager";
import type UIManager from "./managers/UIManager";
import type WorldManager from "./managers/WorldManager";
import { type Camera, type CameraOrbitControl } from "./plugins/projection";

export interface IApplication {
  screen: { width: number; height: number; resolution: number };
  clock: Clock;
  view: HTMLElement;
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  stage: Container;
  overlay: HTMLElement | null;
  audioContext?: AudioContext;
  dolly: CameraOrbitControl;
  camera: Camera;
  context: any;
  manager: {
    ui: UIManager;
    audio: AudioManager;
    world: WorldManager;
    event: EventManager;
  };
  emit: (message: Message, transfer?: ArrayBuffer[]) => void;
}
