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
 * objects. The values they hold when the newest story is active are the base;
 * for each story it keeps, the journal holds that story's values of every
 * shared object whose base has since been overwritten, and an object it holds
 * nothing for has that story's values in the base.
 *
 * Activating a story puts the base back from the undo record, then writes the
 * story's values over it, saving the base values it replaces in the undo
 * record, and moves `activation.epoch` so every path, pointer and leaf path
 * cached through the old parents is resolved again. Activation copies nothing
 * between stories' tables.
 *
 * Only a compile records, and it records a runtime object only into the table
 * of a story that holds it. A compile carries only what the newest story
 * holds, and a story
 * holds an object the newest one holds exactly when the object was created no
 * later than the compile that produced it (`activation.generation`), since an
 * object leaves the chain of stories once a compile does not carry it. An entry
 * for any other object would be unused, and its recorded parent would keep a
 * discarded story alive. Debug metadata is recorded only once a runtime object
 * holds it, since metadata only a parsed object holds is part of no story; a
 * kept story's record can still hold the metadata of a runtime object that an
 * earlier compile replaced while a parsed chunk kept the metadata, which costs
 * an entry and restores nothing it does not hold.
 *
 * Recording costs one entry per carried object per kept story, taken once, and
 * activation costs one assignment per entry of the story it leaves and of the
 * one it makes active. A compile with nothing kept but the newest story
 * records nothing.
 */
export class StoryJournal {
  /** The newest story, which the compiler's incremental state describes, and
   *  whose values are the base. */
  protected _latest: object | undefined;

  /** The story whose values the shared objects hold. */
  protected _active: object | undefined;

  /** The stories a caller asked to keep. */
  protected _kept = new Set<object>();

  /** For each kept story and the newest one, its values where they differ
   *  from the base. The newest story's table is empty unless it is kept and a
   *  compile is recording. */
  protected _tables = new Map<object, Table>();

  /** The base values the active story's values replaced. */
  protected _undo = new Map<object, Fields>();

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
      if (this._active === story && this._latest) {
        this.activate(this._latest);
      }
      this._tables.delete(story);
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
    for (const [obj, fields] of this._undo) {
      Object.assign(obj, fields);
    }
    this._undo.clear();
    if (story !== this._latest) {
      for (const [obj, fields] of table.entries) {
        const base: Fields = {};
        for (const field in fields) {
          base[field] = (obj as Fields)[field];
        }
        this._undo.set(obj, base);
        Object.assign(obj, fields);
      }
    }
    this._active = story;
    activation.epoch += 1;
    return true;
  }

  /** A compile is starting: the compiler's incremental state describes the
   *  newest story, so the base is what its carried objects must hold. */
  beginCompile(): void {
    if (this._latest) {
      this.activate(this._latest);
    }
    // Any kept story needs the compile recorded; the newest story's table is
    // then recorded too, kept or not, so an aborted compile can be taken back.
    let needed = false;
    for (const story of this._tables.keys()) {
      if (story !== this._latest || this._kept.has(story)) {
        needed = true;
      }
    }
    this._recording = needed ? [...this._tables.values()] : null;
  }

  /** Whether the compile in progress records carried objects. */
  get recording(): boolean {
    return this._recording != null;
  }

  /** Record a carried object before a container of this compile takes it or
   *  gives it new debug metadata (`activation.reparent`): its placement, and
   *  what resolution will write into it. Only an object an earlier story holds
   *  already has a parent, so nothing this compile creates is recorded. */
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
   *  source position, when a runtime object holds it: metadata only a parsed
   *  object holds is part of no story. */
  recordDebugMetadata(metadata: DebugMetadata): void {
    const recording = this._recording;
    if (recording && metadata._heldAtRuntime) {
      StoryJournal.remember(recording, metadata, DEBUG_METADATA_FIELDS);
    }
  }

  /** The compile produced `story`, which is now the newest and the active one,
   *  and whose values are the base. */
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

  /** The compile produced no story, and the newest story stays the newest.
   *  What the compile wrote into its carried objects is taken back from the
   *  newest story's record, which a compile records whenever any story is
   *  kept. */
  abortCompile(): void {
    this._recording = null;
    activation.generation += 1;
    const latest = this._latest;
    const table = latest ? this._tables.get(latest) : undefined;
    if (table) {
      for (const [obj, fields] of table.entries) {
        Object.assign(obj, fields);
      }
      table.entries.clear();
      activation.epoch += 1;
    }
    this._active = latest;
  }

  /** Record the base values of `fields` of `obj` in every table of a story
   *  that holds `obj` and has nothing recorded for them yet. */
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
