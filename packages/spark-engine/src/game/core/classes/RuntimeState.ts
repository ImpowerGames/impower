import { Choice } from "@impower/sparkdown/src/inkjs/engine/Choice";
import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
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

/** Per-beat delta of the runtime collections (incremental checkpoints). */
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

  // --- Incremental-checkpoint delta tracking ---
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

  /** Records the address of a position the story ran: an address of the
   *  program engine, or a runtime path of the current engine, whose global
   *  declarations' are none of a beat's. */
  recordExecution(address: RecencyEntry) {
    if (typeof address !== "string" || !address.startsWith("global ")) {
      // Both collections keep the most recently executed address last.
      // `RecencySet.add` moves an existing entry itself; the plain Set still
      // needs the delete-then-add spelling.
      this.pathsExecutedThisFrame.add(address);
      this.executedSinceCheckpoint.delete(address);
      this.executedSinceCheckpoint.add(address);
    }
  }

  recordChoice(story: Story, choice: Choice) {
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

  toJSON() {
    return JSON.stringify(this.toSerializable());
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

  /** The collection changes committed since the last drain, and advance the
   *  drain marks. Called once per captured beat. */
  drainDeltas(): RuntimeDelta {
    const pe = Array.from(this.executedSinceCheckpoint);
    this.executedSinceCheckpoint.clear();
    const ce = this.choicesEncountered.slice(this._choiceDrainMark);
    this._choiceDrainMark = this.choicesEncountered.length;
    const cde = this.conditionsEncountered.slice(this._conditionDrainMark);
    this._conditionDrainMark = this.conditionsEncountered.length;
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
