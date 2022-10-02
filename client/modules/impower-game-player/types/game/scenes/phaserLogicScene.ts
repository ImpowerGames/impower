import Phaser, { GameObjects } from "phaser";
import * as Tone from "tone";
import { SparkContext } from "../../../../../../spark-engine";
import { RecursivePartial } from "../../../../impower-core";

export const LOGIC_SCENE_KEY = "PhaserLogicScene";

export type Instrument =
  | Tone.PolySynth<Tone.MetalSynth>
  | Tone.PolySynth
  | Tone.NoiseSynth
  | Tone.PluckSynth
  | Tone.DuoSynth
  | Tone.Sampler;

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

export class PhaserLogicScene extends Phaser.Scene {
  private _sparkContext: SparkContext;

  public get sparkContext(): SparkContext {
    return this._sparkContext;
  }

  private parts: Record<string, Tone.Part> = {};

  instruments: Record<string, Instrument> = {};

  constructor(
    config: string | Phaser.Types.Scenes.SettingsConfig,
    sparkContext: SparkContext
  ) {
    super(config);
    this._sparkContext = sparkContext;
  }

  preload(): void {
    Tone.start();
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
    this.input.on("pointerdown", (e, g) => this.onPointerDown(e, g));
    this.input.on("pointerup", (e, g) => this.onPointerUp(e, g));
  }

  onPointerDown(
    event: PointerEvent,
    gameObjects: GameObjects.GameObject[]
  ): void {
    this.sparkContext.game.input.pointerDown({
      button: event.button,
      targets: gameObjects.map((x) => x.name),
    });
  }

  onPointerUp(
    event: PointerEvent,
    gameObjects: GameObjects.GameObject[]
  ): void {
    this.sparkContext.game.input.pointerUp({
      button: event.button,
      targets: gameObjects.map((x) => x.name),
    });
  }

  update(time: number, delta: number): void {
    this.sparkContext.loadedBlockIds.forEach((blockId) => {
      if (!this.sparkContext.update(blockId, time, delta)) {
        this.game.destroy(true);
      }
    });
  }

  destroy(): void {
    this.sparkContext.game.audio.events.onConfigureInstrument.removeAllListeners();
    this.sparkContext.game.audio.events.onAttackNote.removeAllListeners();
    this.sparkContext.game.audio.events.onReleaseNote.removeAllListeners();
    this.sparkContext.game.audio.events.onPlayNotes.removeAllListeners();
    Tone.Transport.cancel();
    Tone.Transport.stop();
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
      this.instruments[key] = new Tone.PolySynth().toDestination();
    }
    if (type === "am") {
      this.instruments[key] = new Tone.PolySynth(Tone.AMSynth).toDestination();
    }
    if (type === "fm") {
      this.instruments[key] = new Tone.PolySynth(Tone.FMSynth).toDestination();
    }
    if (type === "membrane") {
      this.instruments[key] = new Tone.PolySynth(
        Tone.MembraneSynth
      ).toDestination();
    }
    if (type === "metal") {
      this.instruments[key] = new Tone.PolySynth(
        Tone.MetalSynth
      ).toDestination();
    }
    if (type === "mono") {
      this.instruments[key] = new Tone.PolySynth(
        Tone.MonoSynth
      ).toDestination();
    }
    if (type === "noise") {
      this.instruments[key] = new Tone.NoiseSynth().toDestination();
    }
    if (type === "pluck") {
      this.instruments[key] = new Tone.PluckSynth().toDestination();
    }
    if (type === "duo") {
      this.instruments[key] = new Tone.DuoSynth().toDestination();
    }
    if (type === "sampler") {
      this.instruments[key] = new Tone.Sampler().toDestination();
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
    const part = new Tone.Part((time, value) => {
      if (index === 0) {
        startTime = time;
      }
      const relativeTime = time - startTime;
      if (index === 0) {
        Tone.Draw.schedule(() => data.onStart?.(relativeTime), time);
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
      Tone.Draw.schedule(() => data.onDraw?.(relativeTime), time);
      if (index === data.notes.length - 1) {
        Tone.Draw.schedule(() => data.onFinished?.(relativeTime), time);
      }
      index += 1;
    }, data.notes).start(0);

    Tone.Transport.start("+0.1");

    this.parts[data.partId] = part;
  }

  stopNotes(): void {
    Object.values(this.parts).forEach((part) => {
      part.mute = true;
    });
    Tone.Transport.cancel();
    Tone.Transport.stop();
  }
}
