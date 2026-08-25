import { Choice } from "@impower/sparkdown/src/inkjs/engine/Choice";
import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { RecencySet } from "./RecencySet";

export interface SerializableRuntimeState {
  pathsExecutedThisFrame: string[];
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
  pe: string[];
  // Choices / conditions appended this beat.
  ce: { options: string[]; selected: number }[];
  cde: { selected: boolean }[];
}

export class RuntimeState {
  /** Every path executed since the frame began, least-recent first.
   *  A {@link RecencySet} rather than a `Set` because the ink runtime snapshots
   *  and rewinds this collection around every lookahead, and it can undo those
   *  changes without copying itself (#376). */
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
  // semantics) and drain it at each checkpoint — its rewind-safety is handled by
  // Game's lookahead snapshot. That mirror stays a plain `Set`: it is emptied
  // at every checkpoint (one per beat), so copying it costs one beat's worth of
  // paths, unlike `pathsExecutedThisFrame` which spans the whole simulation.
  // That per-beat draining is load-bearing, not incidental: if checkpoints ever
  // become periodic rather than per-beat, this mirror grows for the whole
  // simulation and Game's per-lookahead copy of it becomes the O(n^2) term all
  // over again (#376). Give it the same journalling treatment if that changes.
  // `choicesEncountered` / `conditionsEncountered` are append-only and never
  // truncated below the last checkpoint, so a slice from a drain mark is exact
  // and needs no snapshot/restore.
  executedSinceCheckpoint: Set<string> = new Set();
  protected _choiceDrainMark = 0;
  protected _conditionDrainMark = 0;

  recordExecution(path: string) {
    if (!path.startsWith("global ")) {
      // Both collections keep the most recently executed path last.
      // `RecencySet.add` moves an existing entry itself; the plain Set still
      // needs the delete-then-add spelling.
      this.pathsExecutedThisFrame.add(path);
      this.executedSinceCheckpoint.delete(path);
      this.executedSinceCheckpoint.add(path);
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
