import type AudioMixer from "../../../../spark-dom/src/classes/AudioMixer";
import type { AudioLevels } from "../../../../spark-dom/src/classes/AudioMixer";

export interface AudioProbeReading extends AudioLevels {
  /**
   * `performance.now()` of the last frame this mixer was audible, or null if
   * it has not made a sound yet. This is the field that makes the probe
   * useful after the fact: a level read a moment too late is zero, but this
   * still says "it played, 40ms ago".
   */
  lastNonSilentAt: number | null;
}

export type AudioProbeSnapshot = Record<string, AudioProbeReading>;

/**
 * Anything below this is treated as silence. Digital silence is exactly 0
 * and speech renders around 0.26 RMS, so this is far clear of both; it exists
 * to ignore denormal noise, not to set a meaningful floor.
 */
const SILENCE_THRESHOLD = 1e-4;

/**
 * Samples every mixer's output once a frame and remembers when each last made
 * a sound (#273).
 *
 * The point is that the readings are NUMBERS, not a drawing. A waveform can
 * only be eyeballed by whoever is sitting in front of it; a number can be
 * asserted on, polled from the console, and compared between runs -- which is
 * what makes "are the beeps playing?" answerable by someone (or something)
 * that cannot hear.
 *
 * Reading an AnalyserNode is a copy of its current window, so this is cheap
 * and allocation-free per frame, but it still only runs while started.
 */
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

  /** The latest reading for every mixer that has existed since `start()`. */
  snapshot(): AudioProbeSnapshot {
    return JSON.parse(JSON.stringify(this._readings));
  }

  /** Takes one reading. Exposed so a caller can poll without the rAF loop. */
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

  stop(): void {
    if (this._frame != null) {
      cancelAnimationFrame(this._frame);
      this._frame = null;
    }
  }
}
