import type { InsertConstruct } from "@impower/codemirror-vscode-lsp-client/src/insert";
import { signal, type ReadonlySignal } from "@preact/signals";

export type PictureAudition = {
  kind: "picture";
  filename: string;
  construct: InsertConstruct;
  name: string;
};

export type SoundAudition = { kind: "sound"; src: string };

export type AuditionTarget = PictureAudition | SoundAudition;

export interface AuditionAudio {
  src: string;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
}

export interface AuditionPorts {
  preview(
    filename: string,
    shown: { construct: InsertConstruct; name: string } | null,
  ): Promise<unknown>;
  audio(): AuditionAudio;
}

export default class WorkspaceAudition {
  protected readonly _current = signal<AuditionTarget | null>(null);

  protected _audio: AuditionAudio | undefined;

  constructor(protected readonly _ports: AuditionPorts) {}

  get current(): ReadonlySignal<AuditionTarget | null> {
    return this._current;
  }

  show(target: AuditionTarget) {
    const previous = this._current.peek();
    this._current.value = target;
    if (previous?.kind === "sound") {
      this.stop();
    }
    if (target.kind === "sound") {
      if (previous?.kind === "picture") {
        void this._ports.preview(previous.filename, null);
      }
      const audio = (this._audio ??= this._ports.audio());
      audio.src = target.src;
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
      return;
    }
    if (previous?.kind === "picture" && previous.filename !== target.filename) {
      void this._ports.preview(previous.filename, null);
    }
    void this._ports.preview(target.filename, {
      construct: target.construct,
      name: target.name,
    });
  }

  revert() {
    const previous = this._current.peek();
    this._current.value = null;
    if (previous?.kind === "sound") {
      this.stop();
    } else if (previous?.kind === "picture") {
      void this._ports.preview(previous.filename, null);
    }
  }

  commit() {
    const previous = this._current.peek();
    this._current.value = null;
    if (previous?.kind === "sound") {
      this.stop();
    }
  }

  protected stop() {
    const audio = this._audio;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
  }
}
