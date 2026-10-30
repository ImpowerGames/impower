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

  add(value: RecencyEntry): this {
    const existing = this._nodes.get(value);
    if (existing) {
      if (existing === this._tail) {
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
