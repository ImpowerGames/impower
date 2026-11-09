import type { Instructions } from "../types/Instructions";
import type { RollTarget } from "../types/RunHistory";

export interface RunBeat {
  readonly checkpoint: number;
  readonly shown: Instructions;
  readonly menus: number;
  chosen?: number;
}

export class RunRecord {
  protected _beats: RunBeat[] = [];
  get beats(): readonly RunBeat[] {
    return this._beats;
  }

  protected _at = -1;
  get at(): number {
    return this._at;
  }

  get current(): RunBeat | undefined {
    return this._beats[this._at];
  }

  get first(): RunBeat | undefined {
    return this._beats[0];
  }

  get behindLatest(): boolean {
    return this._at < this._beats.length - 1;
  }

  get canRollBack(): boolean {
    return this._at > 0;
  }

  get canRollForward(): boolean {
    return this.behindLatest;
  }

  clear(): void {
    this._beats = [];
    this._at = -1;
  }

  record(beat: RunBeat): void {
    this._beats.push(beat);
    this._at = this._beats.length - 1;
  }

  moveTo(index: number): void {
    this._at = index;
  }

  truncateAfterCurrent(): void {
    this._beats.length = this._at + 1;
  }

  backFrom(to: RollTarget): number | null {
    if (!this.canRollBack) {
      return null;
    }
    if (to === "choice") {
      for (let i = this._at - 1; i > 0; i -= 1) {
        if (isMenu(this._beats[i]!)) {
          return i;
        }
      }
      return 0;
    }
    return this._at - 1;
  }

  forwardFrom(to: RollTarget): number | null {
    if (!this.canRollForward) {
      return null;
    }
    const last = this._beats.length - 1;
    if (to === "choice") {
      for (let i = this._at + 1; i < last; i += 1) {
        if (isMenu(this._beats[i]!)) {
          return i;
        }
      }
      return last;
    }
    return this._at + 1;
  }

  drop(checkpoints: ReadonlySet<number>): void {
    const current = this.current;
    const kept = this._beats.filter((beat) => !checkpoints.has(beat.checkpoint));
    this._beats = kept;
    this._at = current ? kept.indexOf(current) : kept.length - 1;
  }
}

const isMenu = (beat: RunBeat): boolean => (beat.shown.choices?.length ?? 0) > 0;
