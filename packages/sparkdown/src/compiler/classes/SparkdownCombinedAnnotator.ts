import {
  ChangeSet,
  ChangeSpec,
  Range,
  RangeSet,
  Text,
} from "@codemirror/state";
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { Tree } from "@lezer/common";
import { CharacterAnnotator } from "./annotators/CharacterAnnotator";
import { ColorAnnotator } from "./annotators/ColorAnnotator";
import { CompilationAnnotator } from "./annotators/CompilationAnnotator";
import { DeclarationAnnotator } from "./annotators/DeclarationAnnotator";
import { FormattingAnnotator } from "./annotators/FormattingAnnotator";
import { ImplicitAnnotator } from "./annotators/ImplicitAnnotator";
import { LensAnnotator } from "./annotators/LensAnnotator";
import { LinkAnnotator } from "./annotators/LinkAnnotator";
import { ReferenceAnnotator } from "./annotators/ReferenceAnnotator";
import { SemanticAnnotator } from "./annotators/SemanticAnnotator";
import { ValidationAnnotator } from "./annotators/ValidationAnnotator";
import { SparkdownAnnotation } from "./SparkdownAnnotation";
import { SparkdownAnnotator } from "./SparkdownAnnotator";

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Stable identity for an annotation's payload, used to match a re-emitted
 * annotation against the copy it supersedes. String and `undefined` payloads
 * compare directly; object payloads are freshly allocated on every pass, so
 * they only match by value. A payload that cannot be serialized gets a key
 * that matches nothing, which keeps the caller conservative — it declines to
 * delete rather than risk dropping a distinct annotation.
 */
let uncomparableCounter = 0;
function annotationValueKey(value: SparkdownAnnotation<any>): string {
  const type = value?.type;
  // `p:` / `o:` keep a string payload from ever colliding with the
  // serialization of an object payload that happens to spell the same thing.
  if (type == null || typeof type !== "object") {
    return `p:${String(type)}`;
  }
  try {
    const key = JSON.stringify(type);
    if (key !== undefined) {
      return `o:${key}`;
    }
  } catch {
    // Cyclic or otherwise unserializable - fall through.
  }
  // Unique per call, so it matches nothing and the caller declines to delete
  // rather than risk dropping a distinct annotation.
  uncomparableCounter += 1;
  return `!:${uncomparableCounter}`;
}

export type SparkdownAnnotationRanges = {
  [K in keyof SparkdownAnnotators]: Writeable<
    NonNullable<
      Parameters<SparkdownAnnotators[K]["current"]["update"]>[0]["add"]
    >
  >;
};

export type SparkdownAnnotations = {
  [K in keyof SparkdownAnnotators]: SparkdownAnnotators[K]["current"];
};

export type SparkdownAnnotatorConfigs = {
  [K in keyof SparkdownAnnotators]?: SparkdownAnnotators[K]["config"];
};

export interface SparkdownAnnotators {
  colors: ColorAnnotator;
  characters: CharacterAnnotator;
  declarations: DeclarationAnnotator;
  compilations: CompilationAnnotator;
  references: ReferenceAnnotator;
  validations: ValidationAnnotator;
  implicits: ImplicitAnnotator;
  formatting: FormattingAnnotator;
  links: LinkAnnotator;
  lenses: LensAnnotator;
  semantics: SemanticAnnotator;
}

export class SparkdownCombinedAnnotator {
  current: SparkdownAnnotators;

  protected _config?: SparkdownAnnotatorConfigs;

  protected _currentEntries: [string, SparkdownAnnotator][];

  constructor(config?: SparkdownAnnotatorConfigs) {
    this._config = config;
    this.current = {
      colors: new ColorAnnotator(),
      characters: new CharacterAnnotator(),
      declarations: new DeclarationAnnotator(),
      compilations: new CompilationAnnotator(config?.compilations),
      references: new ReferenceAnnotator(),
      validations: new ValidationAnnotator(),
      implicits: new ImplicitAnnotator(),
      formatting: new FormattingAnnotator(),
      links: new LinkAnnotator(),
      lenses: new LensAnnotator(),
      semantics: new SemanticAnnotator(),
    };
    this._currentEntries = Object.entries(this.current) as [
      string,
      SparkdownAnnotator,
    ][];
  }

  get(): SparkdownAnnotations {
    return {
      colors: this.current.colors.current,
      characters: this.current.characters.current,
      declarations: this.current.declarations.current,
      compilations: this.current.compilations.current,
      references: this.current.references.current,
      validations: this.current.validations.current,
      implicits: this.current.implicits.current,
      formatting: this.current.formatting.current,
      links: this.current.links.current,
      lenses: this.current.lenses.current,
      semantics: this.current.semantics.current,
    };
  }

  protected annotate(
    tree: Tree,
    from?: number,
    to?: number,
    annotate?: Set<keyof SparkdownAnnotators>,
  ) {
    const ranges: SparkdownAnnotationRanges = {
      colors: [],
      characters: [],
      declarations: [],
      compilations: [],
      references: [],
      validations: [],
      implicits: [],
      formatting: [],
      links: [],
      lenses: [],
      semantics: [],
    };

    const iteratingFrom = from ?? 0;
    const iteratingTo = to ?? tree.length;

    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.begin(iteratingFrom, iteratingTo);
      }
    }
    tree.iterate({
      from,
      to,
      enter: (nodeRef) => {
        for (const [key, annotator] of this._currentEntries) {
          if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
            annotator.enter(
              ranges[key as keyof SparkdownAnnotators]!,
              nodeRef,
              iteratingFrom,
              iteratingTo,
            );
          }
        }
      },
      leave: (nodeRef) => {
        for (const [key, annotator] of this._currentEntries) {
          if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
            annotator.leave(
              ranges[key as keyof SparkdownAnnotators]!,
              nodeRef,
              iteratingFrom,
              iteratingTo,
            );
          }
        }
      },
    });
    return ranges;
  }

  /**
   * Drop re-emissions the delete-filter would not have removed.
   *
   * The filter only deletes what overlaps the re-annotated window, which is
   * exact for an annotation carrying its entered node's own `[from, to]`:
   * Lezer only enters a node overlapping the window, so such an annotation
   * overlaps it too and is always removed before it is re-added.
   *
   * An annotator may anchor elsewhere, though — a zero-width mark at a node's
   * edge, `ReferenceAnnotator`'s quote-stripped `[from + 1, to - 1]`, or
   * `ValidationAnnotator`'s diagnostics anchored on a *sibling* node. Lezer
   * still enters the node, so the pass re-emits while the filter keeps the old
   * copy: one duplicate per keystroke, unbounded (#322).
   *
   * So for a candidate outside the window, keep it only to the extent the
   * survivors do not already account for it. Two properties matter:
   *
   * - By COUNT, not presence. A cold parse really does emit identical
   *   duplicate marks at one offset, so collapsing K down to 1 would lose one.
   * - Drop the NEW copy rather than deleting the old one. They are
   *   interchangeable in content, but deleting and re-adding moves the
   *   annotation to the end of its position's insertion order, and zero-width
   *   marks share offsets — `top_level_begin` and `indent` both sit at a
   *   block's first column, and the formatter consumes them in order.
   *
   * Identity is the SERIALIZED payload, not `===`. Most annotators allocate a
   * fresh object per pass (`semantics`, `references`, `validations`, …), so a
   * reference comparison silently never matches and leaves them accumulating.
   * Serialization only runs for candidates already matched on position, so it
   * stays off the hot path, and a payload that cannot be serialized gets a key
   * that matches nothing — declining to prune rather than risking a drop.
   *
   * `CompilationAnnotator.end` pairs `added[i]` with `removed[i]` POSITIONALLY
   * to carry `uuid` forward, so a shortened `add` would misalign it. That is
   * safe only because compilation annotations carry their node's own
   * `[from, to]` and therefore always hit the in-window `continue` below —
   * never reaching the serialization, which on a `CompiledBlock` would also be
   * expensive. Anything that gives compilations an off-node anchor has to
   * revisit this.
   */
  protected pruneRedundant<T extends SparkdownAnnotation<any>>(
    add: Range<T>[],
    current: RangeSet<T>,
    windowFrom: number,
    windowTo: number,
  ): Range<T>[] {
    let redundant: Set<number> | undefined;
    // How many identical copies this pass has already pruned, so a second
    // identical candidate is measured against the survivors the first one did
    // not already account for.
    let prunedSoFar: Map<string, number> | undefined;
    for (let i = 0; i < add.length; i++) {
      const candidate = add[i]!;
      if (candidate.to >= windowFrom && candidate.from <= windowTo) {
        // Inside the window: the old copy is deleted, so this is the only one.
        continue;
      }
      const valueKey = annotationValueKey(candidate.value);
      let survivors = 0;
      current.between(candidate.from, candidate.to, (from, to, value) => {
        if (
          from === candidate.from &&
          to === candidate.to &&
          annotationValueKey(value) === valueKey
        ) {
          survivors += 1;
        }
        return undefined;
      });
      if (survivors === 0) {
        continue;
      }
      const key = `${candidate.from}:${candidate.to}:${valueKey}`;
      prunedSoFar ??= new Map();
      const alreadyPruned = prunedSoFar.get(key) ?? 0;
      if (alreadyPruned < survivors) {
        prunedSoFar.set(key, alreadyPruned + 1);
        (redundant ??= new Set()).add(i);
      }
    }
    if (!redundant) {
      return add;
    }
    return add.filter((_, i) => !redundant!.has(i));
  }

  protected remove<T>(
    from: number,
    to: number,
    value: SparkdownAnnotation<T>,
    annotate?: Set<keyof SparkdownAnnotators>,
  ) {
    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.remove(from, to, value);
      }
    }
  }

  create(tree: Tree, text: Text, annotate?: Set<keyof SparkdownAnnotators>) {
    return this.update(tree, text, undefined, undefined, annotate);
  }

  update(
    tree: Tree,
    text: Text,
    changes?: ChangeSpec[],
    length: number = 0,
    annotate?: Set<keyof SparkdownAnnotators>,
  ) {
    const cachedCompiler = tree.prop(cachedCompilerProp);
    const reparsedFrom = cachedCompiler?.reparsedFrom;
    const reparsedTo = cachedCompiler?.reparsedTo;
    const iteratingFrom = reparsedFrom ?? 0;
    const iteratingTo = reparsedTo ?? text.length;
    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.update(tree, text);
      }
    }
    if (!changes || reparsedFrom == null) {
      // Rebuild all annotations from scratch
      for (const [key, add] of Object.entries(
        this.annotate(tree, undefined, undefined, annotate),
      )) {
        if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
          const annotator = this.current[key as keyof SparkdownAnnotators];
          if (annotator) {
            annotator.current =
              add.length > 0 ? RangeSet.of(add, true) : RangeSet.empty;
            annotator.end(iteratingFrom, iteratingTo, add as any, []);
          }
        }
      }
      return this.current;
    }
    const changeDesc = ChangeSet.of(
      changes,
      Math.max(tree.length, length),
    ).desc;
    // The re-annotation lower bound must cover not only `reparsedFrom` (the
    // parser's reuse split-point) but also the START of the edit itself.
    // `reparsedFrom` is a CHUNK boundary the tokenizer can restart from; it can
    // legitimately land AFTER the edit's first changed character when the edit
    // sits inside a chunk that the reuse logic kept behind the split. In that
    // case the nodes between [editStart, reparsedFrom) are byte-identical in the
    // new tree (so the parse tree matches a cold parse) but their OLD
    // annotations were just deleted by `map(changeDesc)` (their source text was
    // replaced by the edit). If we only re-annotate from `reparsedFrom` onward,
    // those nodes get NEITHER a fresh annotation NOR a valid carried-forward one
    // — silently dropping e.g. a trailing `-> divert` chunk and shortening the
    // compiled output by a scene. Clamp the window down to the edit's new-doc
    // start so every node overlapping replaced text is re-annotated.
    let editStart = reparsedFrom;
    changeDesc.iterChangedRanges((_fromA, _toA, fromB) => {
      if (fromB < editStart) {
        editStart = fromB;
      }
    });
    // Shift position-keyed annotator state through the edit before anything
    // reads it. `begin` runs inside `annotate` below and consults offsets
    // (`SemanticAnnotator`'s cached symbol table), so they must already be in
    // new-document coordinates by then.
    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.mapState(changeDesc);
      }
    }
    // The delete window and the annotate window must stay identical, or the
    // reconciliation loses or duplicates annotations.
    //
    // Widening this window out to whole top-level nodes would ALSO give the
    // annotators the state a cold parse has at the boundary — but measured at
    // 7x the per-keystroke cost inside a large top-level Luau block (13.9ms ->
    // 97.2ms per edit event on a 21KB script), because it re-annotates the
    // whole block on every keystroke. Annotators that depend on preceding
    // context rebuild it in `begin()` instead; see `SemanticAnnotator`.
    const windowFrom = editStart;
    if (reparsedTo == null) {
      // Only rebuild annotations after `editStart`
      for (const [key, add] of Object.entries(
        this.annotate(tree, windowFrom, undefined, annotate),
      )) {
        if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
          const annotator = this.current[key as keyof SparkdownAnnotators];
          if (annotator) {
            const removed: Range<typeof annotator._annotationType>[] = [];
            annotator.current = annotator.current.map(changeDesc);
            const kept = this.pruneRedundant(
              add as any,
              annotator.current,
              windowFrom,
              Infinity,
            );
            annotator.current = annotator.current.update({
              filter: (from, to, value) => {
                if (to < windowFrom) {
                  return true;
                }
                removed.push(value.range(from, to));
                this.remove(from, to, value, annotate);
                return false;
              },
              add: kept,
              sort: true,
            });
            annotator.end(
              iteratingFrom,
              iteratingTo,
              kept as any,
              removed as any,
            );
          }
        }
      }
      return this.current;
    }
    // Only rebuild annotations between `windowFrom` and `windowTo`
    const windowTo = reparsedTo;
    for (const [key, add] of Object.entries(
      this.annotate(tree, windowFrom, windowTo, annotate),
    )) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        const annotator = this.current[key as keyof SparkdownAnnotators];
        if (annotator) {
          const removed: Range<typeof annotator._annotationType>[] = [];
          annotator.current = annotator.current.map(changeDesc);
          const kept = this.pruneRedundant(
            add as any,
            annotator.current,
            windowFrom,
            windowTo,
          );
          annotator.current = annotator.current.update({
            filter: (from, to, value) => {
              if (to < windowFrom || from > windowTo) {
                return true;
              }
              removed.push(value.range(from, to));
              this.remove(from, to, value, annotate);
              return false;
            },
            add: kept,
            sort: true,
          });
          annotator.end(
            iteratingFrom,
            iteratingTo,
            kept as any,
            removed as any,
          );
        }
      }
    }
    return this.current;
  }
}
