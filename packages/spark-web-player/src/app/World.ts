import { type ColorSource, Container } from "pixi.js";
import type { NotificationMessage } from "../../../jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "../../../jsonrpc/src/common/types/RequestMessage";
import type { ResponseError } from "../../../jsonrpc/src/common/types/ResponseError";
import { Clock } from "../../../spark-engine/src/game/core/classes/Clock";

import {
  attachInputEvents,
  createInputState,
  type InputState,
} from "./helpers/inputEvents";
import type { IApplication } from "./IApplication";
import {
  generateAnimatedSVGTextures,
  type GenerateAnimatedSVGTexturesOptions,
} from "./plugins/svg/utils/generateAnimatedSVGTextures";
import { parseSVG } from "./plugins/svg/utils/parseSVG";
import { generateSolidTexture } from "./plugins/texture/utils/generateSolidTexture";

export class World {
  private _inputState: InputState = createInputState();

  private _detachInputEvents?: () => void;

  private _onExit?: () => void;

  get app() {
    return this._app;
  }
  private _app: IApplication;

  get stage(): Container {
    return this._stage;
  }
  private _stage: Container;

  get pointerDown(): boolean {
    return this._pointerDown;
  }
  private _pointerDown = false;

  get pointerDownX(): number {
    return this._pointerDownX;
  }
  private _pointerDownX = 0;

  get pointerDownY(): number {
    return this._pointerDownY;
  }
  private _pointerDownY = 0;

  get pointerDragging(): boolean {
    return this._pointerDragging;
  }
  private _pointerDragging = false;

  get mouseDragThreshold(): number {
    return this._mouseDragThreshold;
  }
  set mouseDragThreshold(value: number) {
    this._mouseDragThreshold = value;
  }
  private _mouseDragThreshold = 1;

  get penDragThreshold(): number {
    return this._penDragThreshold;
  }
  set penDragThreshold(value: number) {
    this._penDragThreshold = value;
  }
  private _penDragThreshold = 2;

  get touchDragThreshold(): number {
    return this._touchDragThreshold;
  }
  set touchDragThreshold(value: number) {
    this._touchDragThreshold = value;
  }
  private _touchDragThreshold = 4;

  constructor(app: IApplication, onExit?: () => void) {
    this._app = app;
    this.bind();
    this._onExit = onExit;
    this._stage = new Container();
    this._stage.sortableChildren = true;
  }

  exit() {
    this.unbind();
    this.onDisconnected();
    this._onExit?.();
  }

  private bind(): void {
    this._detachInputEvents = attachInputEvents(
      this._app.canvas,
      this._inputState,
      {
        onDown: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onPointerDown(e);
          }
        },
        onMove: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onPointerMove(e);
          }
        },
        onUp: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onPointerUp(e);
          }
        },
        onTap: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onTap(e);
          }
        },
        onDragStart: (e: PointerEvent, t: number, dx: number, dy: number) => {
          if (this._app.clock.speed > 0) {
            this.onDragStart(e, t, dx, dy);
          }
        },
        onDrag: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onDrag(e);
          }
        },
        onDragEnd: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onDragEnd(e);
          }
        },
        onKeyDown: (e: KeyboardEvent) => {
          if (this._app.clock.speed > 0) {
            this.onKeyDown(e);
          }
        },
        onKeyUp: (e: KeyboardEvent) => {
          if (this._app.clock.speed > 0) {
            this.onKeyUp(e);
          }
        },
        onKeyPress: (e: KeyboardEvent) => {
          if (this._app.clock.speed > 0) {
            this.onKeyPress(e);
          }
        },
      },
    );
  }

  private unbind(): void {
    this._detachInputEvents?.();
  }

  async onLoad(): Promise<void> {}

  onConnected(): void {}

  onDisconnected(): void {}

  onStart(): void {}

  onUpdate(_time: Clock): void {}

  onSkip(_seconds: number): void {}

  onPause(): void {}

  onUnpause(): void {}

  onResize(): void {}

  protected onPointerDown(_event: PointerEvent): void {}

  protected onPointerMove(_event: PointerEvent): void {}

  protected onPointerUp(_event: PointerEvent): void {}

  protected onTap(_event: PointerEvent): void {}

  protected onDragStart(
    _event: PointerEvent,
    _dragThreshold: number,
    _distanceX: number,
    _distanceY: number,
  ): void {}

  protected onDrag(_event: PointerEvent): void {}

  protected onDragEnd(_event: PointerEvent): void {}

  protected onKeyDown(_event: KeyboardEvent): void {}

  protected onKeyUp(_event: KeyboardEvent): void {}

  protected onKeyPress(_event: KeyboardEvent): void {}

  public receiveNotification(msg: NotificationMessage): void {
    this.onReceiveNotification(msg);
  }

  protected onReceiveNotification(_msg: NotificationMessage): void {}

  public async receiveRequest(
    msg: RequestMessage,
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return this.onReceiveRequest(msg);
  }

  protected async onReceiveRequest(
    _msg: RequestMessage,
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return undefined;
  }

  generateSolidTexture(width: number, height: number, color?: ColorSource) {
    return generateSolidTexture(this._app.renderer, width, height, color);
  }

  generateSvgTextures(
    svg: string,
    options?: GenerateAnimatedSVGTexturesOptions,
  ) {
    const svgEl = parseSVG(svg);
    return generateAnimatedSVGTextures(this._app.renderer, svgEl, options);
  }
}
