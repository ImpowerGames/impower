import { type Container, type Renderer } from "pixi.js";
import { type Message } from "../../../jsonrpc/src/common/types/Message";
import { type RequestMessage } from "../../../jsonrpc/src/common/types/RequestMessage";
import { type Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import type { AudioClock } from "./AudioClock";
import type AssetManager from "./managers/AssetManager";
import type AudioManager from "./managers/AudioManager";
import type UIManager from "./managers/UIManager";
import { type AssetCache } from "./assets/AssetCache";
import { type Camera, type CameraOrbitControl } from "./plugins/projection";

export interface IApplication {
  assetCache?: AssetCache;
  screen: { width: number; height: number; resolution: number };
  clock: Clock;
  view: HTMLElement;
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  stage: Container;
  overlay: HTMLElement | null;
  paused?: boolean;
  audioContext?: AudioContext;
  audioClock: AudioClock;
  dolly: CameraOrbitControl;
  camera: Camera;
  ui: UIManager;
  audio: AudioManager;
  assets?: AssetManager;
  emit: (message: Message, transfer?: ArrayBuffer[]) => void;
  answer: (message: RequestMessage, work: Promise<unknown>) => void;
}
