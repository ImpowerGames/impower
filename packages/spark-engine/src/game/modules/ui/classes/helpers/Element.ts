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

  constructor(parent: Element | null, id: string, type: string, name: string) {
    this._parent = parent;
    this._id = id;
    this._type = type;
    this._name = name;
    parent?.appendChild(this);
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
      classes.every((c) => child.name.split(" ").includes(c))
    );
  }

  findChildren(selector: string): Element[] {
    const classes = selector.split(" ");
    return this._children.filter((child) =>
      classes.every((c) => child.name.split(" ").includes(c))
    );
  }

  appendChild(child: Element): Element {
    this._children.push(child);
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
}
