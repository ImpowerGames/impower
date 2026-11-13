import { signal, type ReadonlySignal } from "@preact/signals";
import type { SoundFile } from "./SoundPeaks";

export interface SoundLengthsPorts {
  probe(src: string): Promise<number>;
}

export type SoundLengthsOptions = { limit: number; concurrency: number };

type Waiting = { key: string; src: string; wanted: number };

const keyOf = (file: SoundFile) => `${file.size}\n${file.src}`;

export default class SoundLengths {
  protected readonly _lengths = new Map<string, number | null>();

  protected readonly _waiting = new Map<string, Waiting>();

  protected readonly _reading = new Set<string>();

  protected readonly _settled = signal(0);

  constructor(
    protected readonly _ports: SoundLengthsPorts,
    protected readonly _options: SoundLengthsOptions,
  ) {}

  get settled(): ReadonlySignal<number> {
    return this._settled;
  }

  peek(file: SoundFile): number | null | undefined {
    return this._lengths.get(keyOf(file));
  }

  request(file: SoundFile): () => void {
    const key = keyOf(file);
    if (this._lengths.has(key) || this._reading.has(key)) {
      return () => {};
    }
    const waiting = this._waiting.get(key) ?? { key, src: file.src, wanted: 0 };
    waiting.wanted += 1;
    this._waiting.set(key, waiting);
    this.next();
    let dropped = false;
    return () => {
      if (dropped) {
        return;
      }
      dropped = true;
      const still = this._waiting.get(key);
      if (still && --still.wanted <= 0) {
        this._waiting.delete(key);
      }
    };
  }

  protected next(): void {
    while (this._reading.size < this._options.concurrency) {
      const first = this._waiting.values().next();
      if (first.done) {
        return;
      }
      const { key, src } = first.value;
      this._waiting.delete(key);
      this._reading.add(key);
      void this._ports.probe(src).then(
        (seconds) => this.settle(key, Number.isFinite(seconds) ? seconds : null),
        () => this.settle(key, null),
      );
    }
  }

  protected settle(key: string, seconds: number | null): void {
    this._reading.delete(key);
    this._lengths.set(key, seconds);
    while (this._lengths.size > this._options.limit) {
      this._lengths.delete(this._lengths.keys().next().value!);
    }
    this._settled.value += 1;
    this.next();
  }
}
