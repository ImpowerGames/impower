import type { Instructions } from "../types/Instructions";
import type { RollTarget } from "../types/RunHistory";

export interface RunBeat {
  readonly checkpoint: number;
  readonly shown: Instructions;
  readonly menus: number;
  chosen?: number;
  held?: boolean;
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

  protected _moves = 0;
  get moves(): number {
    return this._moves;
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
    this._moves += 1;
  }

  record(beat: RunBeat): void {
    this._beats.push(beat);
    this._at = this._beats.length - 1;
    this._moves += 1;
  }

  markHeld(): void {
    const beat = this.current;
    if (beat) {
      beat.held = true;
    }
  }

  moveTo(index: number): void {
    this._at = index;
    this._moves += 1;
  }

  truncateAfterCurrent(): void {
    this._beats.length = this._at + 1;
  }

  backFrom(to: RollTarget): number | null {
    if (!this.canRollBack) {
      return null;
    }
    if (to !== "beat") {
      const found = TARGETS[to];
      for (let i = this._at - 1; i > 0; i -= 1) {
        if (found(this._beats[i]!)) {
          return i;
        }
      }
      return 0;
    }
    return this._at - 1;
  }

  get heldChoices(): number[] {
    return this._beats.filter(TARGETS.choice).map((beat) => beat.checkpoint);
  }

  backToChoice(checkpoint: number): number | null {
    for (let i = this._at; i >= 0; i -= 1) {
      const beat = this._beats[i]!;
      if (beat.checkpoint === checkpoint) {
        return TARGETS.choice(beat) ? i : null;
      }
    }
    return null;
  }

  forwardFrom(to: RollTarget): number | null {
    if (!this.canRollForward) {
      return null;
    }
    const last = this._beats.length - 1;
    if (to !== "beat") {
      const found = TARGETS[to];
      for (let i = this._at + 1; i < last; i += 1) {
        if (found(this._beats[i]!)) {
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
    if (this.current !== current) {
      this._moves += 1;
    }
  }
}

const TARGETS: Record<
  Exclude<RollTarget, "beat">,
  (beat: RunBeat) => boolean
> = {
  choice: (beat) => (beat.shown.choices?.length ?? 0) > 0,
  breakpoint: (beat) => beat.held === true,
};
