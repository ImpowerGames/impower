import { type ChangeDesc, type Text } from "@codemirror/state";
import { type Tree } from "@lezer/common";
import {
  collectDefineTypeNameOccurrences,
  type DefineTypeNameOccurrence,
} from "../utils/collectDefineTypeNames";

type Occurrence = DefineTypeNameOccurrence;

/**
 * One document's set of names used as a define TYPE — an `as`-parent (`define D
 * as X`) or a `new X()` target — kept across edits.
 *
 * The set is needed in full before any chunk of the document lowers, because a
 * name entering or leaving it changes how chunks elsewhere in the document
 * lower, so it cannot be assembled chunk by chunk as lowering proceeds.
 * Collecting it needs a full traversal (a `new X()` sits deep inside a function
 * body), which on a long document costs more than the reparse that prompted it.
 *
 * So the index keeps every occurrence with its position instead of the bare
 * set. An edit maps those positions through the change, discards the ones the
 * re-annotated window covers, walks only that window of the new tree, and
 * rebuilds the set from the result. Positions outside the window address text
 * the parser reused verbatim, which is the same contract the annotation
 * reconciliation in `SparkdownCombinedAnnotator` already rests on. Anything the
 * edit touched but the window does not cover falls back to a full walk.
 */
export class DefineTypeNameIndex {
  protected _occurrences: Occurrence[] = [];

  protected _names = new Set<string>();

  /** False until a full walk has established a baseline to map forward. */
  protected _established = false;

  /** The names currently in the document. Callers must not mutate it. */
  get names(): Set<string> {
    return this._names;
  }

  /** Discard everything and walk the whole tree. */
  rebuild(tree: Tree, text: Text): void {
    this._occurrences = collectDefineTypeNameOccurrences(tree, (from, to) =>
      text.sliceString(from, to),
    );
    this._recomputeNames();
    this._established = true;
  }

  /**
   * Carry the index through one edit. `from`/`to` are the window of the new
   * tree that is being re-examined, in new-document coordinates — the same
   * window the annotators re-run over.
   */
  update(
    tree: Tree,
    text: Text,
    changes: ChangeDesc,
    from: number,
    to: number,
  ): void {
    if (!this._established) {
      this.rebuild(tree, text);
      return;
    }
    const before: Occurrence[] = [];
    const after: Occurrence[] = [];
    for (const occurrence of this._occurrences) {
      const mappedFrom = changes.mapPos(occurrence.from, 1);
      const mappedTo = changes.mapPos(occurrence.to, -1);
      // `Tree.iterate` enters every node whose range meets the window at either
      // end, so an occurrence meeting it the same way is one the walk below
      // re-collects.
      const covered = mappedTo >= from && mappedFrom <= to;
      if (covered) {
        continue;
      }
      if (changes.touchesRange(occurrence.from, occurrence.to) !== false) {
        // Changed text the window does not cover: the position no longer
        // addresses what it did, and nothing is going to look at it again.
        this.rebuild(tree, text);
        return;
      }
      const moved: Occurrence = {
        from: mappedFrom,
        to: mappedTo,
        name: occurrence.name,
      };
      if (mappedTo < from) {
        before.push(moved);
      } else {
        after.push(moved);
      }
    }
    const rebuilt = collectDefineTypeNameOccurrences(
      tree,
      (start, end) => text.sliceString(start, end),
      Math.max(0, from),
      Math.min(tree.length, to),
    );
    this._occurrences = [...before, ...rebuilt, ...after];
    this._recomputeNames();
  }

  protected _recomputeNames(): void {
    const names = new Set<string>();
    for (const occurrence of this._occurrences) {
      names.add(occurrence.name);
    }
    this._names = names;
  }
}
