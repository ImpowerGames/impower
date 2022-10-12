import * as PROJECTION from "pixi-projection";
import * as PIXI from "pixi.js";
import { AnimatedSVG } from "./AnimatedSVG";
import { Scene } from "./Scene";
import { SVGLoader } from "./SVGLoader";

interface DragObject extends PIXI.DisplayObject {
  dragData: PIXI.InteractionData;
  dragging: number;
  dragPointerStart: PIXI.DisplayObject;
  dragObjStart: PIXI.Point;
  dragGlobalStart: PIXI.Point;
  tint?: number;
  width: number;
  height: number;
}

// === INTERACTION CODE  ===

const onDragStart = (event: PIXI.InteractionEvent): void => {
  const obj = event.currentTarget as DragObject;
  obj.dragData = event.data;
  obj.dragging = 1;
  obj.dragPointerStart = event.data.getLocalPosition(obj.parent);
  obj.dragObjStart = new PIXI.Point();
  obj.dragObjStart.copyFrom(obj.position);
  obj.dragGlobalStart = new PIXI.Point();
  obj.dragGlobalStart.copyFrom(event.data.global);
  event.stopPropagation();
};

const onDragMove = (event: PIXI.InteractionEvent): void => {
  const obj = event.currentTarget as DragObject;
  if (!obj.dragging) {
    return;
  }
  event.stopPropagation();
  const data = obj.dragData; // it can be different pointer!
  if (obj.dragging === 1) {
    // click or drag?
    const dragAmount =
      Math.abs(data.global.x - obj.dragGlobalStart.x) +
      Math.abs(data.global.y - obj.dragGlobalStart.y);
    const dragThreshold = 3;
    if (dragAmount >= dragThreshold) {
      // DRAG
      obj.dragging = 2;
    }
  }
  if (obj.dragging === 2) {
    const dragPointerEnd = data.getLocalPosition(obj.parent);
    // DRAG
    obj.position.set(
      obj.dragObjStart.x + (dragPointerEnd.x - obj.dragPointerStart.x),
      obj.dragObjStart.y + (dragPointerEnd.y - obj.dragPointerStart.y)
    );
  }
};

const snap = (
  obj: (DragObject | PIXI.DisplayObject) & { height: number },
  app: PIXI.Application,
  surfaceHandle: PIXI.Sprite
): void => {
  if (obj === (surfaceHandle as unknown as DragObject)) {
    // surface handle
    obj.position.x = Math.min(Math.max(obj.position.x, 0), app.screen.width);
    obj.position.y = Math.min(Math.max(obj.position.y, 0), app.screen.height);
  } else {
    // sprite handle
    obj.position.x = Math.min(
      Math.max(obj.position.x, -app.screen.width / 2),
      app.screen.width / 2
    );
    obj.position.y = Math.min(
      Math.max(obj.position.y, -app.screen.height),
      -obj.height
    );
  }
};

export class MainScene extends Scene {
  private _surface: PROJECTION.Sprite2d;

  private _surfaceHandle: PIXI.Sprite;

  private _container: PROJECTION.Container2d;

  private _sprites: Record<string, AnimatedSVG> = {};

  private _spriteHandles: Record<string, PROJECTION.Sprite2d> = {};

  private _graphics: Record<string, SVGSVGElement> = {};

  async init(): Promise<void> {
    const svgEntries = Object.entries(
      this.sparkContext?.game?.logic?.blockMap?.[""]?.variables || {}
    ).filter(([, v]) => v.type === "graphic");
    const graphics = await Promise.all(
      svgEntries.map(([, v]) => SVGLoader.instance.load(v.value as string))
    );
    graphics.forEach((v, i) => {
      const [, asset] = svgEntries[i];
      this._graphics[asset.name] = v;
    });
  }

  start(): void {
    const surfaceTexture = new PIXI.Texture(PIXI.Texture.WHITE.baseTexture);

    const surfaceHandleTexture = new PIXI.Texture(
      PIXI.Texture.WHITE.baseTexture
    );
    surfaceHandleTexture.orig.width = 25;
    surfaceHandleTexture.orig.height = 25;

    const spriteHandleTexture = new PIXI.Texture(
      PIXI.Texture.WHITE.baseTexture
    );
    spriteHandleTexture.orig.width = 50;
    spriteHandleTexture.orig.height = 50;

    this._surface = new PROJECTION.Sprite2d(surfaceTexture);
    this._surface.anchor.set(0.5, 1.0); // Center Bottom
    this._surface.width = this.app.screen.width;
    this._surface.height = this.app.screen.height;
    this._surface.interactiveChildren = false;

    this._surfaceHandle = new PIXI.Sprite(surfaceHandleTexture);
    this._surfaceHandle.anchor.set(0.5); // Center
    this._surfaceHandle.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2
    );
    this._surfaceHandle.tint = 0xff0000;

    this._container = new PROJECTION.Container2d();
    this._container.position.set(
      this.app.screen.width / 2,
      this.app.screen.height
    );

    this.app.stage.addChild(this._surfaceHandle);
    this.app.stage.addChild(this._container);
    this._container.addChild(this._surface);

    // SETUP INTERACTIONS

    // changes axis factor
    const toggle = (obj: DragObject): void => {
      if (obj.tint !== undefined) {
        obj.tint = 0xff0033;
      }
    };

    const onDragEnd = (event: PIXI.InteractionEvent): void => {
      const obj = event.currentTarget as DragObject;
      if (!obj.dragging) {
        return;
      }
      if (obj.dragging === 1) {
        toggle(obj);
      } else {
        snap(obj, this.app, this._surfaceHandle);
      }

      obj.dragging = 0;
      obj.dragData = null;

      event.stopPropagation();
      // set the interaction data to null
    };

    const addInteraction = (obj: PIXI.Sprite | PROJECTION.Sprite2d): void => {
      if (obj) {
        obj.interactive = true;
        obj
          .on("pointerdown", onDragStart)
          .on("pointermove", onDragMove)
          .on("pointerup", onDragEnd)
          .on("pointerupoutside", onDragEnd);
      }
    };

    addInteraction(this._surfaceHandle);

    Object.entries(this._graphics || {}).forEach(([k, svg]) => {
      const handle = new PROJECTION.Sprite2d(spriteHandleTexture);
      handle.anchor.set(0.5, 0.0); // Center Top
      handle.position.set(
        -this.app.screen.width / 4,
        -this.app.screen.height / 2
      );
      handle.proj.affine = PROJECTION.AFFINE.AXIS_X;
      handle.tint = 0x0000ff;
      handle.interactiveChildren = false;
      this._spriteHandles[k] = handle;

      const sprite = new AnimatedSVG(svg);
      sprite.anchor.set(0.5, 1.0); // Center Bottom
      this._sprites[k] = sprite;

      this._container.addChild(handle);
      handle.addChild(sprite);
      addInteraction(handle);
    });
  }

  update(_time: number, _delta: number): void {
    // Match container projection to surface handle position
    // (Surface handle represents the vanishing point)
    if (this._container) {
      const pos = this._container.toLocal(
        this._surfaceHandle.position,
        undefined,
        undefined,
        undefined,
        PROJECTION.TRANSFORM_STEP.BEFORE_PROJ
      );
      pos.y = -pos.y;
      pos.x = -pos.x;
      this._container.proj.setAxisY(pos, -1);
    }
  }

  resize(): void {
    if (this._surface) {
      this._surface.width = this.app.screen.width;
      this._surface.height = this.app.screen.height;
    }
    if (this._surfaceHandle) {
      this._surfaceHandle.position.set(
        this.app.screen.width / 2,
        this.app.screen.height / 2
      );
      snap(this._surfaceHandle, this.app, this._surfaceHandle);
    }
    if (this._container) {
      this._container.position.set(
        this.app.screen.width / 2,
        this.app.screen.height
      );
    }
    Object.values(this._spriteHandles || {}).forEach((s) => {
      snap(s, this.app, this._surfaceHandle);
    });
  }
}
