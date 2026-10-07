/**
 * An insertion-ordered set of addresses (`ProgramAddress`) whose entries move to the end when re-added,
 * so iteration order is "least recently added first".
 *
 * It holds and orders exactly what a `Set` holds when every `add` deletes the
 * value first, the spelling `RuntimeState.executedSinceCheckpoint` uses; here
 * `add` does both. Entries live in a doubly-linked list keyed by a `Map`, so
 * an add or a move is O(1).
 */

/** An address, as the engine that ran it names it. */
export type RecencyEntry = string | number;

interface RecencyNode {
  value: RecencyEntry;
  prev: RecencyNode | null;
  next: RecencyNode | null;
}

export class RecencySet implements Iterable<RecencyEntry> {
  protected _nodes = new Map<RecencyEntry, RecencyNode>();
  protected _head: RecencyNode | null = null;
  protected _tail: RecencyNode | null = null;

  /** Build from an ordered list. Duplicates keep their FIRST position, which
   *  is what `new Set(values)` did — deserialization runs through here, so it
   *  must not reorder a saved collection. */
  static from(values: Iterable<RecencyEntry>): RecencySet {
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

  has(value: RecencyEntry): boolean {
    return this._nodes.has(value);
  }

  /** Add `value`, or move it to the end when it is already present. */
  add(value: RecencyEntry): this {
    const existing = this._nodes.get(value);
    if (existing) {
      if (existing === this._tail) {
        // Already the most recent entry: nothing moves.
        return this;
      }
      this.unlink(existing);
      this.append(existing);
      return this;
    }
    const node: RecencyNode = { value, prev: null, next: null };
    this._nodes.set(value, node);
    this.append(node);
    return this;
  }

  // No `delete` or `clear`: nothing removes from this collection. It
  // accumulates for a frame and is replaced wholesale.

  forEach(callback: (value: RecencyEntry) => void): void {
    for (const value of this) {
      callback(value);
    }
  }

  toArray(): RecencyEntry[] {
    return Array.from(this);
  }

  *[Symbol.iterator](): IterableIterator<RecencyEntry> {
    for (let node = this._head; node; node = node.next) {
      yield node.value;
    }
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
