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

export interface RuntimeDelta {
  pe: RecencyEntry[];
  ce: { options: string[]; selected: number }[];
  cde: { selected: boolean }[];
}

export class RuntimeState {
  pathsExecutedThisFrame: RecencySet = new RecencySet();

  choicesEncountered: {
    options: string[];
    selected: number;
  }[] = [];

  conditionsEncountered: {
    selected: boolean;
  }[] = [];

  executedSinceCheckpoint: Set<RecencyEntry> = new Set();
  protected _choiceDrainMark = 0;
  protected _conditionDrainMark = 0;
  protected _drained = false;

  recordExecution(address: ProgramAddress) {
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

  toJSON(entries?: (executed: RecencyEntry[]) => RecencyEntry[]) {
    const record = this.toSerializable();
    if (entries) {
      record.pathsExecutedThisFrame = entries(record.pathsExecutedThisFrame);
    }
    return JSON.stringify(record);
  }

  toJSONWithoutCollections() {
    return JSON.stringify({
      pathsExecutedThisFrame: [],
      choicesEncountered: [],
      conditionsEncountered: [],
    });
  }

  snapshotFull(): RuntimeDelta {
    return {
      pe: this.pathsExecutedThisFrame.toArray(),
      ce: this.choicesEncountered.slice(),
      cde: this.conditionsEncountered.slice(),
    };
  }

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
    this.executedSinceCheckpoint = new Set();
    this._choiceDrainMark = this.choicesEncountered.length;
    this._conditionDrainMark = this.conditionsEncountered.length;
    return;
  }

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
