import { type ChangeDesc, type Text } from "@codemirror/state";
import { type Tree } from "@lezer/common";
import {
  collectDefineTypeNameOccurrences,
  type DefineTypeNameOccurrence,
} from "../utils/collectDefineTypeNames";

type Occurrence = DefineTypeNameOccurrence;

export interface DefineTypeNameIndexSnapshot {
  occurrences: Occurrence[];
  names: Set<string>;
  established: boolean;
}

export class DefineTypeNameIndex {
  protected _occurrences: Occurrence[] = [];

  protected _names = new Set<string>();

  protected _established = false;

  get names(): ReadonlySet<string> | undefined {
    return this._established ? this._names : undefined;
  }

  invalidate(): void {
    this._established = false;
    this._occurrences = [];
    this._names = new Set();
  }

  snapshot(): DefineTypeNameIndexSnapshot {
    return {
      occurrences: this._occurrences,
      names: this._names,
      established: this._established,
    };
  }

  restore(snapshot: DefineTypeNameIndexSnapshot): void {
    this._occurrences = snapshot.occurrences;
    this._names = snapshot.names;
    this._established = snapshot.established;
  }

  rebuild(tree: Tree, text: Text): void {
    this._occurrences = collectDefineTypeNameOccurrences(tree, (from, to) =>
      text.sliceString(from, to),
    );
    this._recomputeNames();
    this._established = true;
  }

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
      const covered = mappedTo >= from && mappedFrom <= to;
      if (covered) {
        continue;
      }
      if (changes.touchesRange(occurrence.from, occurrence.to) !== false) {
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
