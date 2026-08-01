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
   * Drop re-emissions that the delete-filter would not have removed.
   *
   * The incremental update deletes every existing annotation overlapping the
   * re-annotated window `[keptFrom, keptTo]` and re-adds whatever the partial
   * `tree.iterate` produced. The DELETE half is exact: Lezer only enters a node
   * that overlaps the iterate range, so an annotation carrying its node's own
   * `[from, to]` overlaps the window too and is always removed before it can be
   * re-added.
   *
   * Annotations anchored somewhere OTHER than the node's full range escape
   * that. A zero-width mark at a node's START (`top_level_begin`) sits before
   * `keptFrom` whenever the parser restarts at an in-block split point, and a
   * mark at a node's END (`frontmatter_end`, `keyword_separator`) can sit past
   * `keptTo`; either way the node is still entered, so the old copy is KEPT
   * *and* an identical fresh copy is added. `RangeSet` does not dedup, so the
   * set grows by one entry per keystroke, unbounded, for as long as typing
   * continues inside one block (#322).
   *
   * So: for a candidate outside the window, keep it only to the extent that
   * the surviving copies do not already account for it. Prune is by COUNT, not
   * by presence: if this pass emits K identical out-of-window annotations and
   * M survive, keep `K - M` of them. Testing presence alone would collapse a
   * legitimate 1 → K increase down to M (cold parses really do emit identical
   * duplicate `formatting` marks — e.g. two `separator`s at the same offset).
   *
   * Value identity is `===` on `type`. That covers the annotators whose `type`
   * is a string or `undefined` — `formatting`, `declarations`, `characters`,
   * `links`. The rest (`semantics`, `colors`, `references`, `lenses`,
   * `compilations`, `validations`, `implicits`) carry a freshly allocated
   * object per `enter`, so `===` never holds and this guard is a no-op for
   * them. That is deliberately conservative — never dropping something that
   * might not be a duplicate.
   *
   * What this does NOT fix, all pre-existing and tracked in #326:
   * - `references` and `validations` also emit non-node-anchored ranges, and
   *   being object-valued they keep the #322 growth shape.
   * - The RE-ADD half of the window is not exact in the other direction
   *   either: a partial pass is not the cold pass restricted to the window,
   *   because annotators carry cross-window state that `begin()` resets
   *   (`SemanticAnnotator.scopeStack`, `FormattingAnnotator.processedLineFrom`).
   *   An in-block window can therefore DROP annotations a cold parse emits.
   * - Nothing removes an out-of-window annotation the new parse no longer
   *   emits; the filter keeps it and the partial iterate never visits it.
   * - A set that already carries N stale copies stays pinned at N: this stops
   *   the growth, it does not repair a set that has already grown.
   */
  protected pruneRedundant<T extends SparkdownAnnotation<any>>(
    add: Range<T>[],
    current: RangeSet<T>,
    keptFrom: number,
    keptTo: number,
  ): Range<T>[] {
    let redundant: Set<number> | undefined;
    // How many identical copies this pass has already pruned, so a second
    // identical candidate is measured against the survivors the first one did
    // not already account for.
    let prunedSoFar: Map<string, number> | undefined;
    for (let i = 0; i < add.length; i++) {
      const candidate = add[i]!;
      if (candidate.to >= keptFrom && candidate.from <= keptTo) {
        // Inside the window: the old copy is deleted, so this is the only one.
        continue;
      }
      let survivors = 0;
      current.between(candidate.from, candidate.to, (from, to, value) => {
        if (
          from === candidate.from &&
          to === candidate.to &&
          value.type === candidate.value.type
        ) {
          survivors += 1;
        }
        return undefined;
      });
      if (survivors === 0) {
        continue;
      }
      const key = `${candidate.from}:${candidate.to}:${String(
        candidate.value.type,
      )}`;
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
    if (reparsedTo == null) {
      // Only rebuild annotations after `editStart`
      for (const [key, add] of Object.entries(
        this.annotate(tree, editStart, undefined, annotate),
      )) {
        if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
          const annotator = this.current[key as keyof SparkdownAnnotators];
          if (annotator) {
            const removed: Range<typeof annotator._annotationType>[] = [];
            annotator.current = annotator.current.map(changeDesc);
            // `end()` receives `kept`, not `add`, so it sees what actually
            // entered the set. Note `CompilationAnnotator.end` pairs
            // `added[i]` with `removed[i]` POSITIONALLY; pruning is a no-op
            // for `compilations` (node-anchored, and object-valued so `===`
            // never holds), so that pairing is unchanged. Anything that makes
            // compilation values comparable by value has to revisit this.
            const kept = this.pruneRedundant(
              add as any,
              annotator.current,
              editStart,
              Infinity,
            );
            annotator.current = annotator.current.update({
              filter: (from, to, value) => {
                if (to < editStart) {
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
    // Only rebuild annotations between `editStart` and reparsedTo
    for (const [key, add] of Object.entries(
      this.annotate(tree, editStart, reparsedTo, annotate),
    )) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        const annotator = this.current[key as keyof SparkdownAnnotators];
        if (annotator) {
          const removed: Range<typeof annotator._annotationType>[] = [];
          annotator.current = annotator.current.map(changeDesc);
          // See the note on the `reparsedTo == null` branch above about
          // `end()` receiving `kept` and `CompilationAnnotator`'s positional
          // `added[i]`/`removed[i]` pairing.
          const kept = this.pruneRedundant(
            add as any,
            annotator.current,
            editStart,
            reparsedTo,
          );
          annotator.current = annotator.current.update({
            filter: (from, to, value) => {
              if (to < editStart || from > reparsedTo) {
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
