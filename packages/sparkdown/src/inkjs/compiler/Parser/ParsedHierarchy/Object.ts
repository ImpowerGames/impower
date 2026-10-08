import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { noteResolved } from "../../../../program/StatementWatch";
import { Container as RuntimeContainer } from "../../../engine/Container";
import { DebugMetadata } from "../../../../runtime/DebugMetadata";
import { InkObject as RuntimeObject } from "../../../../runtime/Object";
import { Path as RuntimePath } from "../../../../runtime/Path";
import { asOrNull } from "../../../../runtime/TypeAssertion";
import { currentCompileEpoch } from "./CompileEpoch";
import type { FindQueryFunc } from "./FindQueryFunc";
import { Identifier } from "./Identifier";
import { resolutionTap } from "./ResolutionTap";
import { Story } from "./Story";

/**
 * Subtrees that contain none of the types a `CollectByType` walk asked for.
 *
 * Module-level and keyed by node identity, which is what makes it safe across
 * compiles: the incremental pipeline carries unchanged parsed nodes forward by
 * identity and gives a re-lowered node a fresh one, so a changed subtree can
 * never hit a stale entry. `length` additionally catches content being
 * APPENDED to a carried-forward container during assembly, and `typesKey`
 * keeps one caller's answer from being served to a caller asking about
 * different types.
 */
const emptyCollectSubtrees = new WeakMap<
  object,
  { typesKey: string; length: number }
>();

/** Resolves `obj` as part of its parent's resolution, and reports it to the
 *  statement watch: a chunk kept for the object's statement recorded how
 *  the object resolved, and the watch reads it again here. */
export const resolveChild = (
  obj: ParsedObject,
  context: Story,
  program: boolean,
): void => {
  const tap = program ? resolutionTap() : null;
  if (tap) {
    tap.visited(obj, false);
    try {
      obj.ResolveWith(context, program);
    } finally {
      tap.left(obj, false);
    }
  } else {
    obj.ResolveWith(context, program);
  }
  noteResolved(obj);
};

export abstract class ParsedObject {
  public abstract readonly GenerateRuntimeObject: () => RuntimeObject | null;

  /** Writes this object's code into the statement chunk being emitted
   *  (docs/engine/binary-program.md, section 3). A class the binary program
   *  does not cover yet keeps this one, which stops the emission and names
   *  the class, so the compile falls back to the current engine. */
  public EmitProgram(emitter: ProgramEmitter): void {
    emitter.unsupported(this.typeName);
  }

  /** The qualified name of the binary program's symbol for this object as a
   *  divert target or a counted target (docs/engine/binary-program.md,
   *  section 2): a scene, a branch and a label have one; anything else has
   *  none. */
  get programSymbolName(): string | null {
    return null;
  }

  public identifier: Identifier | null = null;

  // Diagnostic-dedup state: the compile epoch (see CompileEpoch.ts) at which
  // this node last emitted an error/warning. Comparing against the CURRENT
  // epoch makes flags from a prior `ExportRuntime` stale automatically —
  // reused parsed nodes need no per-compile clearing walk.
  private _errorEpoch: number = 0;
  private _warningEpoch: number = 0;
  private _debugMetadata: DebugMetadata | null = null;
  private _runtimeObject: RuntimeObject | null = null;

  public content: ParsedObject[] = [];
  public parent: ParsedObject | null = null;

  get debugMetadata() {
    if (this._debugMetadata === null && this.parent) {
      return this.parent.debugMetadata;
    }

    return this._debugMetadata;
  }

  set debugMetadata(value: DebugMetadata | null) {
    this._debugMetadata = value;
  }

  get hasOwnDebugMetadata(): boolean {
    return Boolean(this.debugMetadata);
  }

  // Returns the object's OWN debug metadata only, without walking
  // the parent chain. Used by `appendBlockContent` to detect when a
  // statement-level Weave wrapper's metadata should be carried down
  // to its unwrapped children — they typically have no own metadata
  // and would otherwise inherit the function-level metadata via the
  // parent-chain walk after re-parenting.
  get ownDebugMetadata(): DebugMetadata | null {
    return this._debugMetadata;
  }

  get typeName(): string {
    return "ParsedObject";
  }

  public readonly GetType = (): string => this.typeName;

  get story(): Story {
    let ancestor: ParsedObject = this;
    while (ancestor.parent) {
      ancestor = ancestor.parent;
    }

    return ancestor as Story;
  }

  get runtimeObject(): RuntimeObject {
    if (!this._runtimeObject) {
      const tap = resolutionTap();
      if (tap) {
        tap.visited(this, true);
        try {
          this._runtimeObject = this.GenerateRuntimeObject();
        } finally {
          tap.left(this, true);
        }
      } else {
        this._runtimeObject = this.GenerateRuntimeObject();
      }
      if (this._runtimeObject) {
        this._runtimeObject.debugMetadata = this.debugMetadata;
      }
    }

    return this._runtimeObject as RuntimeObject;
  }

  set runtimeObject(value: RuntimeObject | null) {
    this._runtimeObject = value;
  }

  /**
   * Prepares the object for the program path's resolution, as `runtimeObject`
   * generates it for the current engine, and builds nothing (#705): the
   * object's `Prepare` does what its `GenerateRuntimeObject` does besides
   * building runtime objects (the declarations it makes, the diagnostics it
   * reports, the early resolution of a divert's target, the parsed fields a
   * resolution or the writer reads afterwards) and prepares the children
   * generation generates, in its order. The resolver taps hear it as they
   * hear a generation (`visited`, `left`), and an object is prepared once, as
   * a generated object keeps its runtime object, until `ResetRuntime`; one
   * whose generation makes no runtime object (a global's declaration) is
   * prepared again each time it is asked, as it is generated again.
   */
  public prepare(): void {
    if (this._prepared) {
      return;
    }
    const tap = resolutionTap();
    let made: boolean;
    if (tap) {
      tap.visited(this, true);
      try {
        made = this.Prepare();
      } finally {
        tap.left(this, true);
      }
    } else {
      made = this.Prepare();
    }
    this._prepared = made;
  }

  /** What a direct call of `GenerateRuntimeObject` does on the program path
   *  (a divert target's divert, a choice's contents, an onward return's
   *  divert): `Prepare`, heard by no tap and kept by nothing, as such a
   *  generation is. */
  public PrepareUncached(): boolean {
    return this.Prepare();
  }

  /** Whether the object has been prepared since its last `ResetRuntime`. */
  get isPrepared(): boolean {
    return this._prepared;
  }

  /** What generating the object does on the program path, without the
   *  runtime objects (`prepare`); whether its generation makes a runtime
   *  object. Each class that generates says what its generation does. */
  protected Prepare(): boolean {
    throw new Error(`${this.typeName} has no preparation for the program path`);
  }

  private _prepared = false;

  get runtimePath(): RuntimePath {
    if (!this.runtimeObject.path) {
      throw new Error();
    }

    return this.runtimeObject.path;
  }

  // When counting visits and turns since, different object
  // types may have different containers that needs to be counted.
  // For most it'll just be the object's main runtime object,
  // but for e.g. choices, it'll be the target container.
  get containerForCounting(): RuntimeContainer | null {
    return this.runtimeObject as RuntimeContainer;
  }

  get ancestry(): ParsedObject[] {
    let result = [];

    let ancestor = this.parent;
    while (ancestor) {
      result.push(ancestor);
      ancestor = ancestor.parent;
    }

    result = result.reverse();

    return result;
  }

  /*
  get descriptionOfScope(): string {
    const locationNames: string[] = [];

    let ancestor: ParsedObject | null = this;
    while (ancestor) {
      var ancestorFlow = ancestor as FlowBase;
      if (ancestorFlow && ancestorFlow.name != null) {
        locationNames.push(`'${ancestorFlow.name}'`);
      }
      ancestor = ancestor.parent;
    }

    let scopeSB = '';
    if (locationNames.length > 0) {
      const locationsListStr = locationNames.join(', ');
      scopeSB += `${locationsListStr} and`;
    }

    scopeSB += 'at top scope';

    return scopeSB;
  }
*/

  // Return the object so that method can be chained easily
  public readonly AddContent = <T extends ParsedObject, V extends T | T[]>(
    subContent: V,
  ) => {
    if (this.content === null) {
      this.content = [];
    }

    const sub = Array.isArray(subContent) ? subContent : [subContent];

    // Make resilient to content not existing, which can happen
    // in the case of parse errors where we've already reported
    // an error but still want a valid structure so we can
    // carry on parsing.
    for (const ss of sub) {
      if (ss.hasOwnProperty("parent")) {
        ss.parent = this;
      }
      this.content.push(ss);
    }

    if (Array.isArray(subContent)) {
      return;
    } else {
      return subContent;
    }
  };

  public readonly InsertContent = <T extends ParsedObject>(
    index: number,
    subContent: T,
  ): T => {
    if (this.content === null) {
      this.content = [];
    }

    subContent.parent = this;
    this.content.splice(index, 0, subContent);

    return subContent;
  };

  public readonly Find =
    <T extends ParsedObject>(
      type: (new (...arg: any[]) => T) | (Function & { prototype: T }),
    ) =>
    (queryFunc: FindQueryFunc<T> | null = null): T | null => {
      let tObj = asOrNull(this, type) as any as T;
      if (tObj !== null && (queryFunc === null || queryFunc(tObj) === true)) {
        return tObj;
      }

      if (this.content === null) {
        return null;
      }

      for (const obj of this.content) {
        let nestedResult = obj.Find && obj.Find(type)(queryFunc);
        if (nestedResult) {
          return nestedResult as T;
        }
      }

      return null;
    };

  public readonly FindAll =
    <T extends ParsedObject>(
      type: (new (...arg: any[]) => T) | (Function & { prototype: T }),
    ) =>
    (queryFunc?: FindQueryFunc<T>, foundSoFar?: T[]): T[] => {
      const found = Array.isArray(foundSoFar) ? foundSoFar : [];

      const tObj = asOrNull(this, type);
      if (tObj !== null && (!queryFunc || queryFunc(tObj) === true)) {
        found.push(tObj);
      }

      if (this.content === null) {
        return [];
      }

      for (const obj of this.content) {
        obj.FindAll && obj.FindAll(type)(queryFunc, found);
      }

      return found;
    };

  // Single-pass equivalent of calling `FindAll` once per type: walks the tree
  // a single time, pushing each object into the bucket of every type it is an
  // instance of. `types[i]` matches into `buckets[i]`. Preserves the same
  // depth-first pre-order FindAll produces, so per-type results are identical
  // to separate FindAll passes — but with one traversal instead of N.
  /**
   * Collect every node matching each of `types` into the matching bucket.
   *
   * Returns whether this subtree matched anything, which drives the
   * skip-cache: this walk covers the whole story on every compile, and the
   * vast majority of a screenplay is display content containing none of the
   * declaration types ever asked for. `typesKey` is computed once at the root
   * and threaded down so the cache can be keyed by WHICH types were asked
   * for — without it, a caller passing a different set would be wrongly told
   * a subtree is empty.
   */
  public readonly CollectByType = (
    types: Array<Function>,
    buckets: ParsedObject[][],
    typesKey: string = types.map((t) => t.name).join(","),
  ): boolean => {
    const marked = emptyCollectSubtrees.get(this);
    if (
      marked &&
      marked.typesKey === typesKey &&
      marked.length === (this.content?.length ?? 0)
    ) {
      return false;
    }
    let found = false;
    for (let i = 0; i < types.length; i += 1) {
      if (this instanceof (types[i] as any)) {
        buckets[i]!.push(this);
        found = true;
      }
    }
    if (this.content !== null) {
      for (const obj of this.content) {
        if (obj.CollectByType && obj.CollectByType(types, buckets, typesKey)) {
          found = true;
        }
      }
    }
    if (!found) {
      emptyCollectSubtrees.set(this, {
        typesKey,
        length: this.content?.length ?? 0,
      });
    }
    return found;
  };

  /** Resolves the object's references for the current engine
   *  (`Story.ExportRuntime`), which also writes what its runtime tree reads:
   *  the runtime paths of diverts and choices, and the count flags of the
   *  containers a read count or a once-only choice counts. */
  public ResolveReferences(context: Story): void {
    this.ResolveWith(context, false);
  }

  /** The resolution both engines share, which a class overrides: with
   *  `program`, the program path's (`ProgramResolver`,
   *  docs/engine/binary-program.md, section 2), everything only the current
   *  engine's runtime tree reads is left out, so that resolving one statement
   *  reads no runtime object of another. Called on the object's content by
   *  its own resolution through `resolveChild`, which the program path's
   *  resolver calls on each object a statement holds at its top, and
   *  otherwise through `ResolveReferences`. */
  public ResolveWith(context: Story, program: boolean): void {
    if (this.content !== null) {
      for (const obj of this.content) {
        resolveChild(obj, context, program);
      }
    }
  }

  public Error(
    message: string,
    source: ParsedObject | Identifier | DebugMetadata | null = null,
    isWarning: boolean = false,
    // The node that RAISED this diagnostic, forwarded unchanged as the error
    // bubbles up to the Story. `source` is chosen for dedup//reporting and is
    // often an `Identifier` or raw `DebugMetadata` — neither has a parent
    // chain — so it can't be used to attribute the diagnostic to a flow. The
    // raiser always can. See `Story.Error`'s generation-phase attribution.
    raiser: ParsedObject = this,
  ): void {
    if (source === null) {
      source = this;
    }

    // Only allow a single parsed object to have a single error *directly* associated with it
    const keptBack =
      (source instanceof ParsedObject &&
        ((source._errorEpoch === currentCompileEpoch() && !isWarning) ||
          (source._warningEpoch === currentCompileEpoch() && isWarning))) ||
      (source instanceof Identifier &&
        ((source.alreadyHadError && !isWarning) ||
          (source.alreadyHadWarning && isWarning)));
    if (keptBack) {
      // Heard where it was raised, which a call bubbling up from a child is
      // not (`raiser`).
      if (raiser === this) {
        resolutionTap()?.diagnostic(
          this,
          message,
          source,
          isWarning,
          (source as ParsedObject | Identifier).debugMetadata ?? null,
          false,
        );
      }
      return;
    }

    if (this.parent) {
      this.parent.Error(message, source, isWarning, raiser);
    } else {
      throw new Error(`No parent object to send error to: ${message}`);
    }

    if (source instanceof ParsedObject) {
      if (isWarning) {
        source._warningEpoch = currentCompileEpoch();
      } else {
        source._errorEpoch = currentCompileEpoch();
      }
    }
    if (source instanceof Identifier) {
      if (isWarning) {
        source.alreadyHadWarning = true;
      } else {
        source.alreadyHadError = true;
      }
    }
  }

  public readonly Warning = (
    message: string,
    source: ParsedObject | Identifier | DebugMetadata | null = null,
  ): void => {
    this.Error(message, source, true);
  };

  public ResetRuntime() {
    this._runtimeObject = null;
    this._prepared = false;
    this._errorEpoch = 0;
    this._warningEpoch = 0;
    this.OnResetRuntime();
  }

  public OnResetRuntime() {}
}
