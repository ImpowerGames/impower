import type AudioMixer from "../../../../spark-dom/src/classes/AudioMixer";
import type { AudioLevels } from "../../../../spark-dom/src/classes/AudioMixer";
import { OnsetTap, type OnsetTapOptions } from "./OnsetTap";

let onsetTapEnabled = false;

export const enableOnsetTap = (): void => {
  onsetTapEnabled = true;
};

export interface AudioProbeReading extends AudioLevels {
  lastNonSilentAt: number | null;
}

export type AudioProbeSnapshot = Record<string, AudioProbeReading>;

const SILENCE_THRESHOLD = 1e-4;

export default class AudioProbe {
  protected _readings: AudioProbeSnapshot = {};

  protected _frame: number | null = null;

  protected _getMixers: () => Iterable<[string, AudioMixer]>;

  protected _now: () => number;

  constructor(
    getMixers: () => Iterable<[string, AudioMixer]>,
    now: () => number = () => performance.now(),
  ) {
    this._getMixers = getMixers;
    this._now = now;
  }

  get running(): boolean {
    return this._frame != null;
  }

  snapshot(): AudioProbeSnapshot {
    return JSON.parse(JSON.stringify(this._readings));
  }

  sample(): AudioProbeSnapshot {
    const now = this._now();
    for (const [name, mixer] of this._getMixers()) {
      const levels = mixer.readLevels();
      const previous = this._readings[name];
      const audible = levels.rms > SILENCE_THRESHOLD;
      this._readings[name] = {
        peak: levels.peak,
        rms: levels.rms,
        lastNonSilentAt: audible ? now : (previous?.lastNonSilentAt ?? null),
      };
    }
    return this._readings;
  }

  start(): void {
    if (this._frame != null || typeof requestAnimationFrame !== "function") {
      return;
    }
    const tick = () => {
      this.sample();
      this._frame = requestAnimationFrame(tick);
    };
    this._frame = requestAnimationFrame(tick);
  }

  protected _onsetTap?: Promise<OnsetTap>;

  startOnsetTap(
    mixer = "main",
    options?: Partial<OnsetTapOptions>,
  ): Promise<OnsetTap> {
    if (!onsetTapEnabled) {
      return Promise.reject(
        new Error("the onset tap is available in development builds only"),
      );
    }
    if (!this._onsetTap) {
      const found = [...this._getMixers()].find(([name]) => name === mixer);
      if (!found) {
        return Promise.reject(new Error(`there is no ${mixer} mixer yet`));
      }
      const [, audioMixer] = found;
      const tap = OnsetTap.create(
        audioMixer.context,
        audioMixer.analyser,
        options,
      );
      this._onsetTap = tap;
      tap.catch(() => {
        if (this._onsetTap === tap) {
          this._onsetTap = undefined;
        }
      });
    }
    return this._onsetTap;
  }

  stop(): void {
    if (this._frame != null) {
      cancelAnimationFrame(this._frame);
      this._frame = null;
    }
    this._onsetTap?.then(
      (tap) => tap.dispose(),
      () => {},
    );
    this._onsetTap = undefined;
  }
}
