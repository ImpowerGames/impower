/**
 * An insertion-ordered string set whose entries move to the end when re-added,
 * and which can undo every change made since a mark in O(changes).
 *
 * `Set` already gives the first half: `delete` + `add` moves an entry to the
 * end, so iteration order is "least recently added first". What it cannot do is
 * cheaply UNDO those moves — restoring an entry to its former position requires
 * rebuilding the whole set. The ink runtime takes a state snapshot around every
 * lookahead, so a set that grows for the length of a simulation was copied once
 * per beat: N copies of an N-entry set, which is why previewing deep inside a
 * long scene allocated gigabytes and killed the renderer (#376).
 *
 * Entries live in a doubly-linked list keyed by a `Map`, so an add or a move is
 * O(1) and — while a snapshot window is open — each one records the neighbours
 * it had beforehand. Undoing walks that journal backwards, re-linking each node
 * where it was, which restores membership AND order exactly.
 */

interface RecencyNode {
  value: string;
  prev: RecencyNode | null;
  next: RecencyNode | null;
}

type UndoRecord =
  /** The value was absent before the change — undo by removing it. */
  | { kind: "added"; node: RecencyNode }
  /** The value moved from between `prev` and `next` — undo by re-linking. */
  | {
      kind: "moved";
      node: RecencyNode;
      prev: RecencyNode | null;
      next: RecencyNode | null;
    };

export class RecencySet implements Iterable<string> {
  protected _nodes = new Map<string, RecencyNode>();
  protected _head: RecencyNode | null = null;
  protected _tail: RecencyNode | null = null;
  /** Non-null only while a snapshot window is open. */
  protected _journal: UndoRecord[] | null = null;

  /** Build from an ordered list. Duplicates keep their FIRST position, which
   *  is what `new Set(values)` did — deserialization runs through here, so it
   *  must not reorder a saved collection. */
  static from(values: Iterable<string>): RecencySet {
    const set = new RecencySet();
    for (const value of values) {
      if (!set.has(value)) {
        set.add(value);
      }
    }
    return set;
  }

  get size(): number {
    return this._nodes.size;
  }

  has(value: string): boolean {
    return this._nodes.has(value);
  }

  /** Add `value`, or move it to the end when it is already present. */
  add(value: string): this {
    const existing = this._nodes.get(value);
    if (existing) {
      if (existing === this._tail) {
        // Already the most recent entry: nothing moves, so nothing to undo.
        return this;
      }
      this._journal?.push({
        kind: "moved",
        node: existing,
        prev: existing.prev,
        next: existing.next,
      });
      this.unlink(existing);
      this.append(existing);
      return this;
    }
    const node: RecencyNode = { value, prev: null, next: null };
    this._nodes.set(value, node);
    this.append(node);
    this._journal?.push({ kind: "added", node });
    return this;
  }

  // Deliberately no `delete` or `clear`. Nothing removes from this collection
  // (it accumulates for a frame and is replaced wholesale), and a removal
  // inside an open snapshot window would corrupt the rewind silently: the
  // journal holds direct references to neighbour nodes, so undoing a move
  // would relink a node that is no longer in the list — resurrecting the
  // removed value and leaving `size` disagreeing with iteration. If removal is
  // ever needed, journal it rather than adding a bare `delete`.

  forEach(callback: (value: string) => void): void {
    for (const value of this) {
      callback(value);
    }
  }

  toArray(): string[] {
    return Array.from(this);
  }

  *[Symbol.iterator](): IterableIterator<string> {
    for (let node = this._head; node; node = node.next) {
      yield node.value;
    }
  }

  // --- snapshot window ------------------------------------------------------

  /** Begin recording undo information. A second call replaces the window,
   *  matching the previous copy-on-save behaviour. */
  beginSnapshot(): void {
    this._journal = [];
  }

  /** Undo every change since {@link beginSnapshot}. Idempotent: restoring
   *  twice leaves the same state, as re-assigning a copied set did. */
  restoreSnapshot(): void {
    const journal = this._journal;
    if (!journal) {
      return;
    }
    for (let i = journal.length - 1; i >= 0; i -= 1) {
      const record = journal[i]!;
      this.unlink(record.node);
      if (record.kind === "added") {
        this._nodes.delete(record.node.value);
      } else {
        this.link(record.node, record.prev, record.next);
      }
    }
    // Undone, but still inside the window: a second restore is a no-op.
    this._journal = [];
  }

  /** Close the window and keep the changes. */
  discardSnapshot(): void {
    this._journal = null;
  }

  // --- list plumbing --------------------------------------------------------

  protected append(node: RecencyNode): void {
    this.link(node, this._tail, null);
  }

  protected link(
    node: RecencyNode,
    prev: RecencyNode | null,
    next: RecencyNode | null,
  ): void {
    node.prev = prev;
    node.next = next;
    if (prev) {
      prev.next = node;
    } else {
      this._head = node;
    }
    if (next) {
      next.prev = node;
    } else {
      this._tail = node;
    }
  }

  protected unlink(node: RecencyNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else if (this._head === node) {
      this._head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else if (this._tail === node) {
      this._tail = node.prev;
    }
    node.prev = null;
    node.next = null;
  }
}
