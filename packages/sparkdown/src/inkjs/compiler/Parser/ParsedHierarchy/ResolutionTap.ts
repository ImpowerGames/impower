import type { DebugMetadata } from "../../../engine/DebugMetadata";
import type { ParsedObject } from "./Object";

/**
 * Where the program path's resolver (`ProgramResolver`) listens while it
 * resolves one statement (docs/engine/binary-program.md, What is built, The
 * incremental passes).
 *
 * A statement's resolution reads names out of the story's tables (its
 * declarations, constants, lists, structs, externals, flows and labels) and
 * does a few things the story keeps for the rest of the compile: it declares
 * the globals and locals it writes, adds the externals it declares, makes a
 * global of a bare assignment's name, and notes a divert that a builtin's
 * global captures. The resolver records the names read, so that a statement
 * is resolved again only when a name it read is declared otherwise; and it
 * records the rest as events, which it repeats, in the story's order, for a
 * statement it does not resolve again, since every compile builds the story's
 * tables anew. (A message that prints the position of another object,
 * `already exists on line 4`, reads that position, which an edit above the
 * object moves; the resolver hears those through `DebugMetadata.onPrinted`.)
 *
 * Nothing listens outside the resolver: the current engine's `ExportRuntime`
 * runs with no tap.
 */
export interface ResolutionTap {
  /** A name the resolution in progress looked up. A name that starts with
   *  `*` stands for every name of a table it went through whole. */
  read(key: string): void;
  /** Declares `declaration` where its kind puts it, through `register`. */
  declare(declaration: ParsedObject, register: () => void): void;
  /** Adds an external declaration to the story, through `register`. */
  external(declaration: ParsedObject, register: () => void): void;
  /** Makes a global of a bare assignment's name, through `register`, which
   *  the story repeats only while the name is still undeclared there. */
  autoGlobal(assignment: ParsedObject, register: () => void): void;
  /** Notes a divert a builtin's global captures, through `register`. */
  builtinDivert(entry: unknown, register: () => void): void;
  /** An object whose runtime object was generated (`generated`) or whose
   *  references were resolved, which the resolver counts. */
  visited(obj: ParsedObject, generated: boolean): void;
  /** A diagnostic raised as `raiser.Error(message, source, isWarning)`, or
   *  as the story's own `Error` when `raiser` is null: one the story
   *  reported (`emitted`), at `position`, or one an earlier diagnostic of
   *  the same source kept back (`ParsedObject.Error`, one error and one
   *  warning per object a compile). The resolver raises it again for a
   *  statement it does not resolve again, so that which of them the story
   *  reports is decided in the story's order, as in a cold compile. */
  diagnostic(
    raiser: ParsedObject | null,
    message: string,
    source: unknown,
    isWarning: boolean,
    position: DebugMetadata | null,
    emitted: boolean,
  ): void;
}

let active: ResolutionTap | null = null;

/** Makes `tap` the one the parsed hierarchy reports to, and returns the one
 *  it replaces, which the caller restores. */
export const tapResolution = (tap: ResolutionTap | null): ResolutionTap | null => {
  const previous = active;
  active = tap;
  return previous;
};

/** The tap the parsed hierarchy reports to, if any. */
export const resolutionTap = (): ResolutionTap | null => active;

/** Reports that the resolution in progress looked up `key`. */
export const recordRead = (key: string): void => {
  active?.read(key);
};

/**
 * A table of the story whose lookups the resolution in progress reports:
 * `get` and `has` report the key, and going through the table whole reports
 * `*` and the table's kind (`*lists`, `*flows:<flow>`), which every
 * declaration of that kind changes.
 */
export class RecordingMap<K, V> extends Map<K, V> {
  constructor(
    readonly kind: () => string,
    entries?: Iterable<readonly [K, V]> | null,
  ) {
    super();
    if (entries) {
      for (const [k, v] of entries) {
        super.set(k, v);
      }
    }
  }

  override get(key: K): V | undefined {
    if (active) {
      active.read(String(key));
    }
    return super.get(key);
  }

  override has(key: K): boolean {
    if (active) {
      active.read(String(key));
    }
    return super.has(key);
  }

  protected wholly(): void {
    if (active) {
      active.read(`*${this.kind()}`);
    }
  }

  override entries(): MapIterator<[K, V]> {
    this.wholly();
    return super.entries();
  }

  override keys(): MapIterator<K> {
    this.wholly();
    return super.keys();
  }

  override values(): MapIterator<V> {
    this.wholly();
    return super.values();
  }

  override forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: unknown,
  ): void {
    this.wholly();
    super.forEach(callbackfn, thisArg);
  }

  override [Symbol.iterator](): MapIterator<[K, V]> {
    this.wholly();
    return super.entries();
  }
}

/** A set of names of the story whose lookups the resolution in progress
 *  reports, as a `RecordingMap`'s are. */
export class RecordingSet<T> extends Set<T> {
  override has(value: T): boolean {
    if (active) {
      active.read(String(value));
    }
    return super.has(value);
  }
}
