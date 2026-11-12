import { signal, type ReadonlySignal } from "@preact/signals";

export type PlaybackFailure = "unreadable" | "too_large";

export const PLAYBACK_FAILURES: Record<PlaybackFailure, string> = {
  unreadable: "Can't play this file here.",
  too_large: "This file is too large to play here.",
};

export type PlaybackStatus = "loading" | "playing" | "ready" | "failed";

export type Playback = {
  owner: string;
  src: string;
  status: PlaybackStatus;
  duration: number | null;
  failure?: PlaybackFailure;
};

export type Sound = {
  owner: string;
  src: string;
  size?: number;
};

export interface SessionAudio extends EventTarget {
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
}

export interface AudioSessionPorts {
  audio(): SessionAudio;
  maxBytes: number;
}

export const MAX_SOUND_BYTES = 32 * 1024 * 1024;

const lengthOf = (seconds: number) => (Number.isFinite(seconds) && seconds > 0 ? seconds : null);

export default class AudioSession {
  protected readonly _playback = signal<Playback | null>(null);

  protected readonly _time = signal(0);

  protected _audio: SessionAudio | undefined;

  protected _pendingSeek: number | null = null;

  constructor(protected readonly _ports: AudioSessionPorts) {}

  get playback(): ReadonlySignal<Playback | null> {
    return this._playback;
  }

  get time(): ReadonlySignal<number> {
    return this._time;
  }

  protected get audio(): SessionAudio {
    if (!this._audio) {
      const audio = this._ports.audio();
      audio.addEventListener("playing", () => {
        if (!audio.paused) {
          this.update({ status: "playing" });
        }
      });
      audio.addEventListener("pause", () => {
        if (audio.paused && this._playback.peek()?.status === "playing") {
          this.stop();
        }
      });
      audio.addEventListener("timeupdate", () => {
        if (this._playback.peek()) {
          this._time.value = audio.currentTime;
        }
      });
      const measured = () => {
        if (!this._playback.peek()) {
          return;
        }
        this.update({ duration: lengthOf(audio.duration) });
        if (this._pendingSeek !== null) {
          const to = this._pendingSeek;
          this._pendingSeek = null;
          this.place(to);
        }
      };
      audio.addEventListener("loadedmetadata", measured);
      audio.addEventListener("durationchange", measured);
      audio.addEventListener("ended", () => this.stop());
      audio.addEventListener("error", () => {
        if (this._playback.peek()) {
          this.update({ status: "failed", failure: "unreadable" });
        }
      });
      this._audio = audio;
    }
    return this._audio;
  }

  protected update(change: Partial<Playback>) {
    const current = this._playback.peek();
    if (current) {
      this._playback.value = { ...current, ...change };
    }
  }

  protected isCurrent(sound: Sound) {
    const current = this._playback.peek();
    return !!current && current.owner === sound.owner && current.src === sound.src && current.status !== "failed";
  }

  protected load(sound: Sound): boolean {
    if (this.isCurrent(sound)) {
      return true;
    }
    this.release();
    if (sound.size !== undefined && sound.size > this._ports.maxBytes) {
      this._playback.value = { owner: sound.owner, src: sound.src, status: "failed", duration: null, failure: "too_large" };
      return false;
    }
    this._playback.value = { owner: sound.owner, src: sound.src, status: "ready", duration: null };
    const audio = this.audio;
    audio.src = sound.src;
    audio.currentTime = 0;
    return true;
  }

  protected place(seconds: number) {
    const audio = this.audio;
    const length = lengthOf(audio.duration);
    const to = Math.max(0, length === null ? seconds : Math.min(length, seconds));
    audio.currentTime = to;
    this._time.value = to;
  }

  play(sound: Sound) {
    const current = this._playback.peek();
    if (this.isCurrent(sound) && current!.status !== "ready") {
      return;
    }
    if (!this.load(sound)) {
      return;
    }
    const src = sound.src;
    this.update({ status: "loading" });
    this.audio.play().catch((error: unknown) => {
      const now = this._playback.peek();
      if (now?.src !== src) {
        return;
      }
      if (error instanceof DOMException && error.name === "NotSupportedError") {
        this.update({ status: "failed", failure: "unreadable" });
      } else if (now.status === "loading") {
        this.update({ status: "ready" });
      }
    });
  }

  toggle(sound: Sound) {
    const current = this._playback.peek();
    if (this.isCurrent(sound) && current!.status !== "ready") {
      this.stop();
      return;
    }
    this.play(sound);
  }

  seek(sound: Sound, seconds: number) {
    if (!this.load(sound)) {
      return;
    }
    if (lengthOf(this.audio.duration) === null) {
      this._pendingSeek = seconds;
      this._time.value = Math.max(0, seconds);
      return;
    }
    this.place(seconds);
  }

  stopUnless(keep: (owner: string, src: string) => boolean) {
    const current = this._playback.peek();
    if (current && !keep(current.owner, current.src)) {
      this.stop();
    }
  }

  stop() {
    this.release();
  }

  protected release() {
    this._pendingSeek = null;
    const had = this._playback.peek();
    this._playback.value = null;
    this._time.value = 0;
    const audio = this._audio;
    if (!had || !audio) {
      return;
    }
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
}
