import { signal, type ReadonlySignal } from "@preact/signals";
import type { PlaybackFailure } from "./AudioSession";

export type SoundShape =
  | { ok: true; peaks: number[]; duration: number }
  | { ok: false; failure: PlaybackFailure };

export type SoundFile = { src: string; size: number };

export interface SoundPeaksPorts {
  read(src: string): Promise<ArrayBuffer>;
  decode(bytes: ArrayBuffer): Promise<{ channels: Float32Array[]; duration: number }>;
}

export type SoundPeaksOptions = { limit: number; maxBytes: number; count: number };

export const PEAK_COUNT = 200;

export const peaksOf = (channels: readonly Float32Array[], count: number): number[] => {
  const frames = channels[0]?.length ?? 0;
  if (!frames) {
    return [];
  }
  const peaks: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor((i * frames) / count);
    const to = Math.min(frames, Math.max(from + 1, Math.floor(((i + 1) * frames) / count)));
    let max = 0;
    for (const data of channels) {
      for (let j = from; j < to; j += 1) {
        const value = Math.abs(data[j]!);
        if (value > max) {
          max = value;
        }
      }
    }
    peaks.push(Math.min(100, Math.round(max * 100)));
  }
  return peaks;
};

const keyOf = (file: SoundFile) => `${file.size}\n${file.src}`;

export default class SoundPeaks {
  protected readonly _shapes = new Map<string, SoundShape>();

  protected readonly _reading = new Map<string, Promise<SoundShape>>();

  protected readonly _settled = signal(0);

  constructor(
    protected readonly _ports: SoundPeaksPorts,
    protected readonly _options: SoundPeaksOptions,
  ) {}

  get settled(): ReadonlySignal<number> {
    return this._settled;
  }

  peek(file: SoundFile): SoundShape | undefined {
    return this._shapes.get(keyOf(file));
  }

  load(file: SoundFile): Promise<SoundShape> {
    const key = keyOf(file);
    const known = this._shapes.get(key);
    if (known) {
      this._shapes.delete(key);
      this._shapes.set(key, known);
      return Promise.resolve(known);
    }
    let reading = this._reading.get(key);
    if (!reading) {
      reading = this.measure(file).then((shape) => {
        this._reading.delete(key);
        this._shapes.set(key, shape);
        while (this._shapes.size > this._options.limit) {
          this._shapes.delete(this._shapes.keys().next().value!);
        }
        this._settled.value += 1;
        return shape;
      });
      this._reading.set(key, reading);
    }
    return reading;
  }

  protected async measure(file: SoundFile): Promise<SoundShape> {
    if (file.size > this._options.maxBytes) {
      return { ok: false, failure: "too_large" };
    }
    try {
      const { channels, duration } = await this._ports.decode(await this._ports.read(file.src));
      return { ok: true, peaks: peaksOf(channels, this._options.count), duration };
    } catch {
      return { ok: false, failure: "unreadable" };
    }
  }
}
