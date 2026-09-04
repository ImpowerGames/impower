import { type Container, type Renderer } from "pixi.js";
import { type Message } from "../../../jsonrpc/src/common/types/Message";
import { type Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import type AssetManager from "./managers/AssetManager";
import type AudioManager from "./managers/AudioManager";
import type UIManager from "./managers/UIManager";
import { type AssetCache } from "./assets/AssetCache";
import { type Camera, type CameraOrbitControl } from "./plugins/projection";

export interface IApplication {
  /**
   * The asset cache this application loads through, shared across the
   * applications a page builds.
   */
  assetCache?: AssetCache;
  /**
   * The rendering screen info.
   */
  screen: { width: number; height: number; resolution: number };
  /**
   * The application clock used for timing.
   */
  clock: Clock;
  /**
   * The element that contains the canvas.
   */
  view: HTMLElement;
  /**
   * The canvas element used for rendering.
   */
  canvas: HTMLCanvasElement;
  /**
   * The PixiJS renderer.
   */
  renderer: Renderer;
  /**
   * The application's main stage.
   */
  stage: Container;
  /**
   * The element that contains ui.
   */
  overlay: HTMLElement | null;
  /**
   * The audio context.
   */
  audioContext?: AudioContext;
  /**
   * The orbit control used for manipulating the camera (e.g. drag-to-rotate).
   */
  dolly: CameraOrbitControl;
  /**
   * The main projection camera.
   */
  camera: Camera;
  /**
   * The game's context.
   */
  context: any;
  /**
   * Manages the ui.
   */
  ui: UIManager;
  /**
   * Manages the audio.
   */
  audio: AudioManager;
  /**
   * Manages what is resident ahead of need.
   */
  assets?: AssetManager;
  /**
   * Emit a message to communicate with the game.
   */
  emit: (message: Message, transfer?: ArrayBuffer[]) => void;
}
