export class Element {
  protected _parent: Element | null;
  get parent() {
    return this._parent;
  }

  protected _children: Element[] = [];
  get children() {
    return this._children as Readonly<Element[]>;
  }

  protected _id: string;
  get id() {
    return this._id;
  }

  protected _type: string;
  get type() {
    return this._type;
  }

  protected _name: string;
  get name() {
    return this._name;
  }

  /** Monotonic id-sequence per child base name. Never reuses a number even after
   *  a child is removed, so structural ids stay collision-free under dynamic
   *  `for`/`if` reconcile (where a new iteration is mounted before the displaced
   *  one is destroyed). For a fresh build with no removals this is just the
   *  positional index, so two identical (re)builds assign identical ids. */
  protected _childSeqByBase: Map<string, number> = new Map();
  nextChildIndex(base: string): number {
    const n = this._childSeqByBase.get(base) ?? 0;
    this._childSeqByBase.set(base, n + 1);
    return n;
  }

  constructor(
    parent: Element | null,
    id: string,
    type: string,
    name: string,
    before?: Element | null,
  ) {
    this._parent = parent;
    this._id = id;
    this._type = type;
    this._name = name;
    if (before) {
      parent?.insertChildBefore(this, before);
    } else {
      parent?.appendChild(this);
    }
  }

  remove() {
    this._parent?.removeChild(this);
  }

  getChild(id: string): Element | undefined {
    return this._children.find((child) => child.id === id);
  }

  isMatch(selector: string): boolean {
    if (this.name === selector) {
      return true;
    }
    const classes = selector.split(" ");
    return classes.every((c) => this.name.split(" ").includes(c));
  }

  findChild(selector: string): Element | undefined {
    const exactMatch = this._children.find((child) => child.name === selector);
    if (exactMatch) {
      return exactMatch;
    }
    const classes = selector.split(" ");
    return this._children.find((child) =>
      classes.every((c) => child.name.split(" ").includes(c)),
    );
  }

  findChildren(selector: string): Element[] {
    const classes = selector.split(" ");
    return this._children.filter((child) =>
      classes.every((c) => child.name.split(" ").includes(c)),
    );
  }

  appendChild(child: Element): Element {
    this._children.push(child);
    return child;
  }

  /** Insert `child` immediately before sibling `before` (append if `before`
   *  isn't a child here). Mirrors the DOM's `insertBefore` for positional
   *  `ui/create`. */
  insertChildBefore(child: Element, before: Element | null): Element {
    const at = before ? this._children.indexOf(before) : -1;
    if (at < 0) {
      this._children.push(child);
    } else {
      this._children.splice(at, 0, child);
    }
    return child;
  }

  removeChild(child: Element): boolean {
    const childIndex = this._children.indexOf(child);
    if (childIndex < 0) {
      return false;
    }
    this._children.splice(childIndex, 1);
    return true;
  }

  /** Reorder an existing child to sit immediately before `before` (or to the end
   *  when `before` is null). No-op if `child` isn't a child here. Used by keyed
   *  `for` reconciliation to move a retained item's subtree. */
  moveChildBefore(child: Element, before: Element | null): boolean {
    const from = this._children.indexOf(child);
    if (from < 0) {
      return false;
    }
    this._children.splice(from, 1);
    const insertAt = before ? this._children.indexOf(before) : -1;
    if (insertAt < 0) {
      this._children.push(child);
    } else {
      this._children.splice(insertAt, 0, child);
    }
    return true;
  }
}
