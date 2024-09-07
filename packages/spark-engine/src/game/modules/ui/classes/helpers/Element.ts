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

  protected _persistent: boolean;
  get persistent() {
    return this._persistent;
  }

  constructor(
    parent: Element | null,
    id: string,
    type: string,
    name: string,
    persistent: boolean
  ) {
    this._parent = parent;
    this._id = id;
    this._type = type;
    this._name = name;
    this._persistent = persistent;
    parent?.appendChild(this);
  }

  remove() {
    this._parent?.removeChild(this);
  }

  getChild(id: string): Element | undefined {
    return this._children.find((child) => child.id === id);
  }

  findChild(selector: string): Element | undefined {
    return this._children.find((child) => selector === child.name);
  }

  findChildren(...selectors: string[]): Element[] {
    return this._children.filter((child) =>
      selectors.some((name) => name === child.name)
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
