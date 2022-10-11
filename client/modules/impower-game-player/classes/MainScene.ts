import * as PROJECTION from "pixi-projection";
import * as PIXI from "pixi.js";
import { DisplayObject } from "pixi.js";
import * as TONE from "tone";
import { RecursivePartial } from "../../impower-core";
import { AnimatedSVG } from "./AnimatedSVG";
import { Scene } from "./Scene";

export type Instrument =
  | TONE.PolySynth<TONE.MetalSynth>
  | TONE.PolySynth
  | TONE.NoiseSynth
  | TONE.PluckSynth
  | TONE.DuoSynth
  | TONE.Sampler;

export type InstrumentType =
  | "default"
  | "am"
  | "duo"
  | "fm"
  | "membrane"
  | "metal"
  | "mono"
  | "noise"
  | "pluck"
  | "sampler";

interface DragObject extends DisplayObject {
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
  obj: (DragObject | DisplayObject) & { height: number },
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
  private parts: Record<string, TONE.Part> = {};

  instruments: Record<string, Instrument> = {};

  surface: PROJECTION.Sprite2d;

  surfaceHandle: PIXI.Sprite;

  container: PROJECTION.Container2d;

  sprites: Record<string, AnimatedSVG> = {};

  spriteHandles: Record<string, PROJECTION.Sprite2d> = {};

  graphics: Record<string, SVGSVGElement> = {};

  async init(): Promise<void> {
    const svgEntries = Object.entries(
      this.sparkContext.game.logic.blockMap[""].variables || {}
    ).filter(([, v]) => v.type === "graphic");
    const graphics = await Promise.all(
      svgEntries.map(([, v]) => this.svgLoader.load(v.value as string))
    );
    graphics.forEach((svg, index) => {
      const [, asset] = svgEntries[index];
      this.graphics[asset.name] = svg;
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

    this.surface = new PROJECTION.Sprite2d(surfaceTexture);
    this.surface.anchor.set(0.5, 1.0); // Center Bottom
    this.surface.width = this.app.screen.width;
    this.surface.height = this.app.screen.height;
    this.surface.interactiveChildren = false;

    this.surfaceHandle = new PIXI.Sprite(surfaceHandleTexture);
    this.surfaceHandle.anchor.set(0.5); // Center
    this.surfaceHandle.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2
    );
    this.surfaceHandle.tint = 0xff0000;

    this.container = new PROJECTION.Container2d();
    this.container.position.set(
      this.app.screen.width / 2,
      this.app.screen.height
    );

    this.app.stage.addChild(this.surfaceHandle);
    this.app.stage.addChild(this.container);
    this.container.addChild(this.surface);

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
        snap(obj, this.app, this.surfaceHandle);
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

    addInteraction(this.surfaceHandle);

    Object.entries(this.graphics || {}).forEach(([k, svg]) => {
      const handle = new PROJECTION.Sprite2d(spriteHandleTexture);
      handle.anchor.set(0.5, 0.0); // Center Top
      handle.position.set(
        -this.app.screen.width / 4,
        -this.app.screen.height / 2
      );
      handle.proj.affine = PROJECTION.AFFINE.AXIS_X;
      handle.tint = 0x0000ff;
      handle.interactiveChildren = false;
      this.spriteHandles[k] = handle;

      const sprite = new AnimatedSVG(svg);
      sprite.anchor.set(0.5, 1.0); // Center Bottom
      this.sprites[k] = sprite;

      this.container.addChild(handle);
      handle.addChild(sprite);
      addInteraction(handle);
    });

    this.app.stage.on("pointerdown", (e, g) => this.onPointerDown(e, g));
    this.app.stage.on("pointerup", (e, g) => this.onPointerUp(e, g));

    // SETUP AUDIO
    TONE.start();
    this.sparkContext.game.audio.events.onConfigureInstrument.addListener(
      (data) => this.configureInstrument(data)
    );
    this.sparkContext.game.audio.events.onAttackNote.addListener((data) =>
      this.attackNote(data)
    );
    this.sparkContext.game.audio.events.onReleaseNote.addListener((data) =>
      this.releaseNote(data)
    );
    this.sparkContext.game.audio.events.onPlayNotes.addListener((data) =>
      this.playNotes(data)
    );
  }

  onPointerDown(event: PointerEvent, gameObjects: { name: string }[]): void {
    this.sparkContext.game.input.pointerDown({
      button: event.button,
      targets: gameObjects.map((x) => x.name),
    });
  }

  onPointerUp(event: PointerEvent, gameObjects: { name: string }[]): void {
    this.sparkContext.game.input.pointerUp({
      button: event.button,
      targets: gameObjects.map((x) => x.name),
    });
  }

  update(time: number, delta: number): void {
    // Match container projection to surface handle position
    // (Surface handle represents the vanishing point)
    if (this.container) {
      const pos = this.container.toLocal(
        this.surfaceHandle.position,
        undefined,
        undefined,
        undefined,
        PROJECTION.TRANSFORM_STEP.BEFORE_PROJ
      );
      pos.y = -pos.y;
      pos.x = -pos.x;
      this.container.proj.setAxisY(pos, -1);
    }
    // UPDATE BLOCKS
    this.sparkContext.loadedBlockIds.forEach((blockId) => {
      if (!this.sparkContext.update(blockId, time, delta)) {
        this.app.destroy(true);
      }
    });
  }

  resize(): void {
    if (this.surface) {
      this.surface.width = this.app.screen.width;
      this.surface.height = this.app.screen.height;
    }
    if (this.surfaceHandle) {
      this.surfaceHandle.position.set(
        this.app.screen.width / 2,
        this.app.screen.height / 2
      );
      snap(this.surfaceHandle, this.app, this.surfaceHandle);
    }
    if (this.container) {
      this.container.position.set(
        this.app.screen.width / 2,
        this.app.screen.height
      );
    }
    Object.values(this.spriteHandles || {}).forEach((s) => {
      snap(s, this.app, this.surfaceHandle);
    });
  }

  destroy(): void {
    this.sparkContext.game.audio.events.onConfigureInstrument.removeAllListeners();
    this.sparkContext.game.audio.events.onAttackNote.removeAllListeners();
    this.sparkContext.game.audio.events.onReleaseNote.removeAllListeners();
    this.sparkContext.game.audio.events.onPlayNotes.removeAllListeners();
    TONE.Transport.cancel();
    TONE.Transport.stop();
    window.setTimeout(() => {
      Object.values(this.instruments).forEach((instrument) =>
        instrument.dispose()
      );
    }, 100);
  }

  getInstrument(id: string, type?: string): Instrument {
    const key = `${id}/${type}`;
    if (this.instruments[key]) {
      return this.instruments[key];
    }
    if (type === "default") {
      this.instruments[key] = new TONE.PolySynth().toDestination();
    }
    if (type === "am") {
      this.instruments[key] = new TONE.PolySynth(TONE.AMSynth).toDestination();
    }
    if (type === "fm") {
      this.instruments[key] = new TONE.PolySynth(TONE.FMSynth).toDestination();
    }
    if (type === "membrane") {
      this.instruments[key] = new TONE.PolySynth(
        TONE.MembraneSynth
      ).toDestination();
    }
    if (type === "metal") {
      this.instruments[key] = new TONE.PolySynth(
        TONE.MetalSynth
      ).toDestination();
    }
    if (type === "mono") {
      this.instruments[key] = new TONE.PolySynth(
        TONE.MonoSynth
      ).toDestination();
    }
    if (type === "noise") {
      this.instruments[key] = new TONE.NoiseSynth().toDestination();
    }
    if (type === "pluck") {
      this.instruments[key] = new TONE.PluckSynth().toDestination();
    }
    if (type === "duo") {
      this.instruments[key] = new TONE.DuoSynth().toDestination();
    }
    if (type === "sampler") {
      this.instruments[key] = new TONE.Sampler().toDestination();
    }
    return this.instruments[key];
  }

  configureInstrument(data: {
    instrumentId: string;
    instrumentType: string;
    options: RecursivePartial<unknown>;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );
    instrument.set(data.options);
  }

  attackNote(data: {
    instrumentId: string;
    instrumentType: string;
    note: string;
    time?: number;
    velocity?: number;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );
    instrument.triggerAttack(data.note, data.time, data.velocity);
  }

  releaseNote(data: {
    instrumentId: string;
    instrumentType: string;
    time?: number;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );
    instrument.triggerRelease(data.time);
  }

  playNotes(data: {
    partId: string;
    instrumentId: string;
    instrumentType: string;
    notes: {
      note: string[];
      time: number;
      duration?: number[];
      velocity?: number[];
      offset?: number[];
    }[];
    onDraw?: (time: number) => void;
    onStart?: (time: number) => void;
    onFinished?: (time: number) => void;
  }): void {
    const instrument = this.getInstrument(
      data.instrumentId,
      data.instrumentType
    );

    this.stopNotes();

    let startTime = 0;
    let index = 0;
    const part = new TONE.Part((time, value) => {
      if (index === 0) {
        startTime = time;
      }
      const relativeTime = time - startTime;
      if (index === 0) {
        TONE.Draw.schedule(() => data.onStart?.(relativeTime), time);
      }
      if (value.note && value.duration) {
        const notes = value.note;
        const durations = value.duration;
        const velocities = value.velocity;
        const offsets = value.offset;
        for (let i = 0; i < notes.length; i += 1) {
          const noteTime = time + (offsets?.[i] || 0);
          instrument.triggerAttack(notes[i], noteTime, velocities?.[i] || 0);
          const d = durations[Math.min(i, durations.length - 1)];
          instrument.triggerRelease(notes[i], noteTime + d);
        }
      }
      TONE.Draw.schedule(() => data.onDraw?.(relativeTime), time);
      if (index === data.notes.length - 1) {
        TONE.Draw.schedule(() => data.onFinished?.(relativeTime), time);
      }
      index += 1;
    }, data.notes).start(0);

    TONE.Transport.start("+0.1");

    this.parts[data.partId] = part;
  }

  stopNotes(): void {
    Object.values(this.parts).forEach((part) => {
      part.mute = true;
    });
    TONE.Transport.cancel();
    TONE.Transport.stop();
  }
}
