import { ChoicePoint } from "../../inkjs/engine/ChoicePoint";
import { Container } from "../../inkjs/engine/Container";
import type { DebugMetadata } from "../../inkjs/engine/DebugMetadata";
import { Divert } from "../../inkjs/engine/Divert";
import { activation } from "../../inkjs/engine/StoryActivation";
import { DivertTargetValue } from "../../inkjs/engine/Value";
import { VariableAssignment } from "../../inkjs/engine/VariableAssignment";
import { VariableReference } from "../../inkjs/engine/VariableReference";

type Fields = Record<string, unknown>;

/** The values a kept story needs written back, and the compile generation
 *  that produced the story (`activation.generation`). */
interface Table {
  generation: number;
  entries: Map<object, Fields>;
}

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

/** What a compile rewrites in the debug metadata of a chunk it carries: the
 *  source position the chunk now sits at, and the document it is in. The
 *  runtime objects of every story that holds the chunk share the metadata. */
const DEBUG_METADATA_FIELDS = [
  "startLineNumber",
  "endLineNumber",
  "sourceStartLineNumber",
  "sourceEndLineNumber",
  "version",
  "fileName",
  "filePath",
] as const;

/** Where a carried object sits: its parent, and its own debug metadata, which
 *  flattening a container of the new story gives the object that has none. */
const PLACEMENT = ["parent", "_debugMetadata"] as const;

const fieldsOf = (obj: object): readonly string[] | undefined => {
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
 * this compile's resolution written into them and this compile's source
 * positions written into their debug metadata. Every story shares those
 * objects, and the values they hold are the values of whichever story is
 * active. For each story it keeps, the journal holds the values of every
 * shared object whose values have since been overwritten; an object it holds
 * nothing for already has that story's values. Activating a story writes its
 * values back, recording the values it replaces for the others, and moves
 * `activation.epoch` so every path, pointer and leaf path cached through the
 * old parents is resolved again.
 *
 * A table records only objects of its own story, which are the objects born
 * no later than the compile that produced it (`activation.generation`): an
 * entry for any other object would be unused, and its recorded parent would
 * keep a discarded story alive.
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
  protected _tables = new Map<object, Table>();

  /** Where a compile in progress records, or null when nothing needs it. */
  protected _recording: Table[] | null = null;

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
    const others: Table[] = [];
    for (const [other, otherTable] of this._tables) {
      if (other !== story) {
        others.push(otherTable);
      }
    }
    for (const [obj, fields] of table.entries) {
      StoryJournal.remember(others, obj, Object.keys(fields));
      Object.assign(obj, fields);
    }
    table.entries.clear();
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
    const recording: Table[] = [];
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
   *  (`activation.reparent`): its placement, and what resolution will write
   *  into it. Only an object an earlier story holds already has a parent, so
   *  nothing this compile creates is recorded. */
  recordParent(obj: object): void {
    const recording = this._recording;
    if (recording) {
      StoryJournal.remember(recording, obj, PLACEMENT);
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

  /** Record a chunk's debug metadata before this compile restamps its
   *  source position. */
  recordDebugMetadata(metadata: DebugMetadata): void {
    const recording = this._recording;
    if (recording) {
      StoryJournal.remember(recording, metadata, DEBUG_METADATA_FIELDS);
    }
  }

  /** The compile produced `story`, which is now the newest and the active one. */
  endCompile(story: object | undefined): void {
    this._recording = null;
    const generation = activation.generation;
    activation.generation += 1;
    if (!story) {
      return;
    }
    const previous = this._latest;
    if (previous && !this._kept.has(previous)) {
      this._tables.delete(previous);
    }
    this._tables.set(story, { generation, entries: new Map() });
    this._latest = story;
    this._active = story;
  }

  /** The compile produced no story. The newest story stays the newest, but
   *  the compile may have written into its carried objects, so the next
   *  activation writes every kept story's values back. */
  abortCompile(): void {
    this._recording = null;
    activation.generation += 1;
    this._active = undefined;
  }

  /** Record the current values of `fields` of `obj` in every table of a
   *  story that holds `obj` and has nothing recorded for them yet. */
  protected static remember(
    tables: Table[],
    obj: object,
    fields: readonly string[],
  ): void {
    const birth = (obj as { _birth?: number })._birth;
    for (const table of tables) {
      if (birth !== undefined && birth > table.generation) {
        continue;
      }
      let entry = table.entries.get(obj);
      if (!entry) {
        entry = {};
        table.entries.set(obj, entry);
      }
      for (const field of fields) {
        if (!(field in entry)) {
          entry[field] = (obj as Fields)[field];
        }
      }
    }
  }
}
