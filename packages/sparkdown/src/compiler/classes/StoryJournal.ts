import { ChoicePoint } from "../../inkjs/engine/ChoicePoint";
import { Container } from "../../inkjs/engine/Container";
import { Divert } from "../../inkjs/engine/Divert";
import { activation } from "../../inkjs/engine/StoryActivation";
import { DivertTargetValue } from "../../inkjs/engine/Value";
import { VariableAssignment } from "../../inkjs/engine/VariableAssignment";
import { VariableReference } from "../../inkjs/engine/VariableReference";

type Fields = Record<string, unknown>;

/** Every field a compile writes into a runtime object it carries over from an
 *  earlier compile: what resolution derives from the rest of the story, and
 *  the count flags the reconcile pass re-derives. A carried object's parent
 *  is recorded where a container of the new story takes it. */
const CARRIED_FIELDS: [new (...args: any[]) => object, readonly string[]][] = [
  [Container, ["visitsShouldBeCounted", "turnIndexShouldBeCounted", "countingAtStartOnly"]],
  [Divert, ["_targetPath", "variableDivertName", "pushesToStack", "stackPushType", "isExternal", "externalArgs", "isConditional"]],
  [ChoicePoint, ["_pathOnChoice", "hasCondition", "hasStartContent", "hasChoiceOnlyContent", "isInvisibleDefault", "onceOnly"]],
  [VariableReference, ["name", "pathForCount"]],
  [VariableAssignment, ["isGlobal"]],
  [DivertTargetValue, ["value"]],
];

const PARENT = ["parent"] as const;

const fieldsOf =(obj: object): readonly string[] | undefined => {
  for (const [type, fields] of CARRIED_FIELDS) {
    if (obj instanceof type) {
      return fields;
    }
  }
  return undefined;
};

/**
 * Keeps earlier runtime stories runnable after later compiles.
 *
 * An incremental compile carries the unchanged flows of the story before it
 * into the new one: the same runtime objects, moved under the new root, with
 * this compile's resolution written into them. Every story shares those
 * objects, and the values they hold are the values of whichever story is
 * active. For each story it keeps, the journal holds the values of every
 * shared object whose values have since been overwritten; an object it holds
 * nothing for already has that story's values. Activating a story writes its
 * values back, recording the values it replaces for the others, and moves
 * `activation.epoch` so every path, pointer and leaf path cached through the
 * old parents is resolved again.
 *
 * Recording costs one entry per carried object per kept story, taken once, and
 * activation costs one assignment per object the stories disagree on. A
 * compile with nothing kept but the newest story records nothing.
 */
export class StoryJournal {
  /** The newest story, which the compiler's incremental state describes. */
  protected _latest: object | undefined;

  /** The story whose values the shared objects hold. */
  protected _active: object | undefined;

  /** The stories a caller asked to keep. */
  protected _kept = new Set<object>();

  /** For each kept story and the newest one, the values it needs back. */
  protected _tables = new Map<object, Map<object, Fields>>();

  /** Where a compile in progress records, or null when nothing needs it. */
  protected _recording: Map<object, Fields>[] | null = null;

  get latest() {
    return this._latest;
  }

  get active() {
    return this._active;
  }

  /** Keep `story` runnable across later compiles. Only the newest story, or
   *  one already kept, can be kept: an earlier one's values are gone. */
  keep(story: object): boolean {
    if (!this._tables.has(story)) {
      return false;
    }
    this._kept.add(story);
    return true;
  }

  /** Stop keeping `story`. */
  release(story: object): void {
    this._kept.delete(story);
    if (story !== this._latest) {
      this._tables.delete(story);
      if (this._active === story) {
        this._active = undefined;
      }
    }
  }

  isKept(story: object): boolean {
    return this._kept.has(story);
  }

  /** Make `story` the one whose values the shared objects hold. Answers
   *  whether anything had to change. */
  activate(story: object): boolean {
    if (this._active === story) {
      return false;
    }
    const table = this._tables.get(story);
    if (!table) {
      throw new Error("A story the journal does not keep cannot be activated");
    }
    const others: Map<object, Fields>[] = [];
    for (const [other, otherTable] of this._tables) {
      if (other !== story) {
        others.push(otherTable);
      }
    }
    for (const [obj, fields] of table) {
      StoryJournal.remember(others, obj, Object.keys(fields));
      Object.assign(obj, fields);
    }
    table.clear();
    this._active = story;
    activation.epoch += 1;
    return true;
  }

  /** A compile is starting: the compiler's incremental state describes the
   *  newest story, so that is the one its carried objects must hold. */
  beginCompile(): void {
    if (this._latest) {
      this.activate(this._latest);
    }
    const recording: Map<object, Fields>[] = [];
    for (const [story, table] of this._tables) {
      if (story !== this._latest || this._kept.has(story)) {
        recording.push(table);
      }
    }
    this._recording = recording.length > 0 ? recording : null;
  }

  /** Whether the compile in progress records carried objects. */
  get recording(): boolean {
    return this._recording != null;
  }

  /** Record a carried object before a container of this compile takes it
   *  (`activation.reparent`): its parent, and what resolution will write into
   *  it. Only an object an earlier story holds already has a parent, so
   *  nothing this compile creates is recorded. */
  recordParent(obj: object): void {
    const recording = this._recording;
    if (recording) {
      StoryJournal.remember(recording, obj, PARENT);
      if (!(obj instanceof Container)) {
        const fields = fieldsOf(obj);
        if (fields) {
          StoryJournal.remember(recording, obj, fields);
        }
      }
    }
  }

  /** Record a carried container, and every object it holds directly, before
   *  resolution writes this compile's values into them. */
  recordCarried(container: Container): void {
    const recording = this._recording;
    if (!recording) {
      return;
    }
    StoryJournal.remember(recording, container, fieldsOf(container)!);
    for (const obj of container.content) {
      if (!(obj instanceof Container)) {
        const fields = fieldsOf(obj);
        if (fields) {
          StoryJournal.remember(recording, obj, fields);
        }
      }
    }
  }

  /** The compile produced `story`, which is now the newest and the active one. */
  endCompile(story: object | undefined): void {
    this._recording = null;
    if (!story) {
      return;
    }
    const previous = this._latest;
    if (previous && !this._kept.has(previous)) {
      this._tables.delete(previous);
    }
    this._tables.set(story, new Map());
    this._latest = story;
    this._active = story;
  }

  /** The compile produced no story. The newest story stays the newest, but
   *  the compile may have written into its carried objects, so the next
   *  activation writes every kept story's values back. */
  abortCompile(): void {
    this._recording = null;
    this._active = undefined;
  }

  /** Record the current values of `fields` of `obj` in every table that holds
   *  nothing yet for them. */
  protected static remember(
    tables: Map<object, Fields>[],
    obj: object,
    fields: readonly string[],
  ): void {
    for (const table of tables) {
      let entry = table.get(obj);
      if (!entry) {
        entry = {};
        table.set(obj, entry);
      }
      for (const field of fields) {
        if (!(field in entry)) {
          entry[field] = (obj as Fields)[field];
        }
      }
    }
  }
}
