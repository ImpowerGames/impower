import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { ProgramChoice } from "@impower/sparkdown/src/program/ProgramStoryState";
import type { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { RecencySet, type RecencyEntry } from "./RecencySet";

export interface SerializableRuntimeState {
  pathsExecutedThisFrame: RecencyEntry[];
  choicesEncountered: {
    options: string[];
    selected: number;
  }[];
  conditionsEncountered: {
    selected: boolean;
  }[];
}

/** Per-beat delta of the runtime collections (the checkpoints' images). */
export interface RuntimeDelta {
  // Paths executed this beat, in recency order (delete-then-add semantics).
  pe: RecencyEntry[];
  // Choices / conditions appended this beat.
  ce: { options: string[]; selected: number }[];
  cde: { selected: boolean }[];
}

export class RuntimeState {
  /** Every path executed since the frame began, least-recent first. */
  pathsExecutedThisFrame: RecencySet = new RecencySet();

  choicesEncountered: {
    options: string[];
    selected: number;
  }[] = [];

  conditionsEncountered: {
    selected: boolean;
  }[] = [];

  // --- Checkpoint delta tracking ---
  //
  // `pathsExecutedThisFrame` grows ~1 entry/beat and re-orders on revisit
  // (delete+add), so a full copy per checkpoint is O(n^2). We mirror the
  // per-beat executions into `executedSinceCheckpoint` (same delete+add recency
  // semantics) and drain it at each checkpoint (one per beat), so a checkpoint
  // stores one beat's worth of paths.
  // `choicesEncountered` / `conditionsEncountered` are append-only, so a
  // slice from a drain mark is exact.
  executedSinceCheckpoint: Set<RecencyEntry> = new Set();
  protected _choiceDrainMark = 0;
  protected _conditionDrainMark = 0;
  // Whether a checkpoint has drained this record. One that has not is a
  // record the game started again or loaded since the last checkpoint (an
  // ordinary continue starts a new record every beat), so the changes it
  // drains do not extend the record the last checkpoint held (#1701).
  protected _drained = false;

  /** Records the address of a position the story ran. */
  recordExecution(address: ProgramAddress) {
    // Both collections keep the most recently executed address last.
    // `RecencySet.add` moves an existing entry itself; the plain Set still
    // needs the delete-then-add spelling.
    this.pathsExecutedThisFrame.add(address);
    this.executedSinceCheckpoint.delete(address);
    this.executedSinceCheckpoint.add(address);
  }

  recordChoice(story: ProgramStory, choice: ProgramChoice) {
    this.choicesEncountered.push({
      options: story.currentChoices.map((c) => c.text),
      selected: story.currentChoices.indexOf(choice),
    });
  }

  recordCondition(value: boolean) {
    this.conditionsEncountered.push({
      selected: value,
    });
  }

  /** The record as a save holds it, with the executed positions written by
   *  `entries` when it is given (a durable save on the program engine,
   *  whose addresses a later process does not give again). */
  toJSON(entries?: (executed: RecencyEntry[]) => RecencyEntry[]) {
    const record = this.toSerializable();
    if (entries) {
      record.pathsExecutedThisFrame = entries(record.pathsExecutedThisFrame);
    }
    return JSON.stringify(record);
  }

  /** Like `toJSON()` but with the three unbounded collections emptied. The
   *  CheckpointStore stores this constant body for delta beats and re-injects
   *  the (delta-reconstructed) collections to rebuild a byte-identical save. */
  toJSONWithoutCollections() {
    return JSON.stringify({
      pathsExecutedThisFrame: [],
      choicesEncountered: [],
      conditionsEncountered: [],
    });
  }

  /** Full ordered snapshot of all three collections (seeds a delta keyframe). */
  snapshotFull(): RuntimeDelta {
    return {
      pe: this.pathsExecutedThisFrame.toArray(),
      ce: this.choicesEncountered.slice(),
      cde: this.conditionsEncountered.slice(),
    };
  }

  /** The collection changes committed since the last drain, or null when
   *  this record was never drained (it replaced the record the last drain
   *  read, so it holds no changes to that record), and advance the drain
   *  marks. Called once per captured beat. */
  drainDeltas(): RuntimeDelta | null {
    const pe = Array.from(this.executedSinceCheckpoint);
    this.executedSinceCheckpoint.clear();
    const ce = this.choicesEncountered.slice(this._choiceDrainMark);
    this._choiceDrainMark = this.choicesEncountered.length;
    const cde = this.conditionsEncountered.slice(this._conditionDrainMark);
    this._conditionDrainMark = this.conditionsEncountered.length;
    if (!this._drained) {
      this._drained = true;
      return null;
    }
    return { pe, ce, cde };
  }

  protected toSerializable(): SerializableRuntimeState {
    return {
      pathsExecutedThisFrame: this.pathsExecutedThisFrame.toArray(),
      choicesEncountered: this.choicesEncountered,
      conditionsEncountered: this.conditionsEncountered,
    };
  }

  protected fromSerializable(serializable: SerializableRuntimeState) {
    this.pathsExecutedThisFrame = RecencySet.from(
      serializable.pathsExecutedThisFrame,
    );
    this.choicesEncountered = serializable.choicesEncountered;
    this.conditionsEncountered = serializable.conditionsEncountered;
    // A freshly-loaded state is the new delta baseline — no pending changes,
    // marks sit at the loaded collection lengths.
    this.executedSinceCheckpoint = new Set();
    this._choiceDrainMark = this.choicesEncountered.length;
    this._conditionDrainMark = this.conditionsEncountered.length;
    return;
  }

  /** Reads a runtime record, or throws when it is not one: three lists,
   *  of paths, of choices met (their options and the one selected) and of
   *  conditions met (the verdict), as `toJSON` writes them. */
  static read(json: string): RuntimeState {
    const record = JSON.parse(json) as Partial<SerializableRuntimeState> | null;
    const isList = <T>(value: unknown, item: (v: any) => boolean): value is T[] =>
      Array.isArray(value) && value.every(item);
    if (
      typeof record !== "object" ||
      record === null ||
      !isList<RecencyEntry>(
        record.pathsExecutedThisFrame,
        (p) => typeof p === "string" || typeof p === "number",
      ) ||
      !isList(
        record.choicesEncountered,
        (c) =>
          typeof c === "object" &&
          c !== null &&
          isList<string>(c.options, (o) => typeof o === "string") &&
          typeof c.selected === "number",
      ) ||
      !isList(
        record.conditionsEncountered,
        (c) => typeof c === "object" && c !== null && typeof c.selected === "boolean",
      )
    ) {
      throw new Error("The runtime record is not one");
    }
    const obj = new RuntimeState();
    obj.fromSerializable(record as SerializableRuntimeState);
    return obj;
  }

  /** A record holding the given collections, as a load of the record they
   *  make (`read`) holds them: lists of its own, each choice and condition
   *  copied, with nothing drained since. A checkpoint's collections are
   *  shared with the store that replays them, and a load of its full save
   *  shares nothing with it (#1758). */
  static of(collections: RuntimeDelta): RuntimeState {
    const obj = new RuntimeState();
    obj.fromSerializable({
      pathsExecutedThisFrame: collections.pe,
      choicesEncountered: collections.ce.map((c) => ({
        options: c.options.slice(),
        selected: c.selected,
      })),
      conditionsEncountered: collections.cde.map((c) => ({
        selected: c.selected,
      })),
    });
    return obj;
  }

  static clone(state: RuntimeState) {
    const cloned = new RuntimeState();
    if (state) {
      cloned.pathsExecutedThisFrame = RecencySet.from(
        state.pathsExecutedThisFrame,
      );
      cloned.choicesEncountered = JSON.parse(
        JSON.stringify(state.choicesEncountered),
      );
      cloned.conditionsEncountered = JSON.parse(
        JSON.stringify(state.conditionsEncountered),
      );
    }
    return cloned;
  }

  static fromJSON(json: string) {
    const obj = new RuntimeState();
    const serializable = JSON.parse(json);
    obj.fromSerializable(serializable);
    return obj;
  }
}
