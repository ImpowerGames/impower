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
}

export class MainScene extends Scene {
  private parts: Record<string, TONE.Part> = {};

  instruments: Record<string, Instrument> = {};

  container: PROJECTION.Container2d;

  surfaceHandle: PIXI.Sprite;

  surface: PROJECTION.Sprite2d;

  playerHandle: PROJECTION.Sprite2d;

  player: AnimatedSVG | DragObject;

  textures: Partial<Record<"int_albany", PIXI.Texture>> = {};

  svgs: Partial<Record<"a_player", SVGSVGElement>> = {};

  async init(): Promise<void> {
    const [int_albany] = await Promise.all([
      PIXI.Texture.fromURL(
        "http://localhost:9199/v0/b/impowergames-dev.appspot.com/o/users%2FV4sRAooDsDCBeCVT1w8Dzv7k17VM%2FbyUSJyNk5ZAqYbiMunNSmY?alt=media&token=1665209364552"
      ),
    ]);
    this.textures.int_albany = int_albany;

    const [a_player] = await Promise.all([
      this.svgLoader.load(
        this.sparkContext.contexts[""].valueMap.a_player as string
      ),
    ]);
    this.svgs.a_player = a_player;
  }

  start(): void {
    const surfaceHandleTexture = new PIXI.Texture(
      PIXI.Texture.WHITE.baseTexture
    );
    surfaceHandleTexture.orig.width = 25;
    surfaceHandleTexture.orig.height = 25;

    const playerHandleTexture = new PIXI.Texture(
      PIXI.Texture.WHITE.baseTexture
    );
    playerHandleTexture.orig.width = 50;
    playerHandleTexture.orig.height = 50;

    this.surface = new PROJECTION.Sprite2d(this.textures.int_albany);
    this.surface.anchor.set(0.5, 1.0); // Center Bottom
    this.surface.width = this.app.screen.width;
    this.surface.height = this.app.screen.height;
    this.surface.interactiveChildren = false;

    this.surfaceHandle = new PIXI.Sprite(surfaceHandleTexture);
    this.surfaceHandle.anchor.set(0.5); // Center
    this.surfaceHandle.position.set(this.app.screen.width / 2, 50);
    this.surfaceHandle.tint = 0xff0000;

    this.container = new PROJECTION.Container2d();
    this.container.position.set(
      this.app.screen.width / 2,
      this.app.screen.height
    );

    this.playerHandle = new PROJECTION.Sprite2d(playerHandleTexture);
    this.playerHandle.anchor.set(0.5, 0.0); // Center Top
    this.playerHandle.position.set(
      -this.app.screen.width / 4,
      -this.app.screen.height / 2
    );
    this.playerHandle.proj.affine = PROJECTION.AFFINE.AXIS_X;
    this.playerHandle.tint = 0x0000ff;
    this.playerHandle.interactiveChildren = false;

    this.player = new AnimatedSVG(this.svgs.a_player);
    this.player.anchor.set(0.5, 1.0); // Center Bottom

    this.app.stage.addChild(this.surfaceHandle, this.container);
    this.container.addChild(this.surface, this.playerHandle);
    this.playerHandle.addChild(this.player);

    // === CLICKS AND SNAP ===

    // changes axis factor
    const toggle = (obj: DragObject): void => {
      if (obj !== this.player && obj.tint !== undefined) {
        obj.tint = 0xff0033;
      }
    };

    const snap = (obj: DragObject): void => {
      if (obj === this.player) {
        obj.position.set(0);
      } else if (obj === (this.playerHandle as unknown as DragObject)) {
        // plane bounds
        obj.position.x = Math.min(
          Math.max(obj.position.x, -this.app.screen.width / 2 + 10),
          this.app.screen.width / 2 - 10
        );
        obj.position.y = Math.min(
          Math.max(obj.position.y, -this.app.screen.height + 10),
          10
        );
      } else {
        // far
        obj.position.x = Math.min(
          Math.max(obj.position.x, 0),
          this.app.screen.width
        );
        obj.position.y = Math.min(
          Math.max(obj.position.y, 0),
          this.app.screen.height
        );
      }
    };

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

    const onDragEnd = (event: PIXI.InteractionEvent): void => {
      const obj = event.currentTarget as DragObject;
      if (!obj.dragging) {
        return;
      }
      if (obj.dragging === 1) {
        toggle(obj);
      } else {
        snap(obj);
      }

      obj.dragging = 0;
      obj.dragData = null;

      event.stopPropagation();
      // set the interaction data to null
    };

    const addInteraction = (obj): void => {
      obj.interactive = true;
      obj
        .on("pointerdown", onDragStart)
        .on("pointerup", onDragEnd)
        .on("pointerupoutside", onDragEnd)
        .on("pointermove", onDragMove);
    };

    addInteraction(this.surfaceHandle);
    addInteraction(this.playerHandle);

    // SETUP

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
    this.app.stage.on("pointerdown", (e, g) => this.onPointerDown(e, g));
    this.app.stage.on("pointerup", (e, g) => this.onPointerUp(e, g));
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

    this.sparkContext.loadedBlockIds.forEach((blockId) => {
      if (!this.sparkContext.update(blockId, time, delta)) {
        this.app.destroy(true);
      }
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
