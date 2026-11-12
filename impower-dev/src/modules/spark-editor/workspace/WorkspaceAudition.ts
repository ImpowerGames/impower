import type { InsertConstruct } from "@impower/codemirror-vscode-lsp-client/src/insert";
import { signal, type ReadonlySignal } from "@preact/signals";
import type AudioSession from "./AudioSession";

export type PictureAudition = {
  kind: "picture";
  filename: string;
  construct: InsertConstruct;
  name: string;
};

export type SoundAudition = { kind: "sound"; src: string };

export type AuditionTarget = PictureAudition | SoundAudition;

export const AUDITION_OWNER = "audition";

export interface AuditionPorts {
  preview(
    filename: string,
    shown: { construct: InsertConstruct; name: string } | null,
  ): Promise<unknown>;
  session: AudioSession;
}

export default class WorkspaceAudition {
  protected readonly _current = signal<AuditionTarget | null>(null);

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
      this._ports.session.play({ owner: AUDITION_OWNER, src: target.src });
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
    this._ports.session.stopUnless((owner) => owner !== AUDITION_OWNER);
  }
}
