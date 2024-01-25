import { ElementState } from "../types/ElementState";
import { IElement } from "../types/IElement";

export class Element implements IElement {
  protected _type: string;
  get type(): string {
    return this._type;
  }

  protected _id: string;
  get id(): string {
    return this._id;
  }

  protected _name: string;
  get name(): string {
    return this._name;
  }

  protected _text: string = "";
  get text(): string {
    return this._text;
  }

  protected _style: Record<string, string | null> = {};
  get style() {
    return this._style as Readonly<Record<string, string | null>>;
  }

  protected _attributes: Record<string, string | null> = {};
  get attributes() {
    return this._attributes as Readonly<Record<string, string | null>>;
  }

  protected _children: IElement[] = [];
  get children() {
    return this._children as Readonly<IElement[]>;
  }

  protected _onclick: ((this: any, ev: any) => any) | null = null;
  get onclick(): ((this: any, ev: any) => any) | null {
    return this._onclick;
  }
  set onclick(listener: ((this: any, ev: any) => any) | null) {
    this._onclick = listener;
  }

  protected _onpointerdown: ((this: any, ev: any) => any) | null = null;
  get onpointerdown(): ((this: any, ev: any) => any) | null {
    return this._onpointerdown;
  }
  set onpointerdown(listener: ((this: any, ev: any) => any) | null) {
    this._onpointerdown = listener;
  }

  protected _onpointerup: ((this: any, ev: any) => any) | null = null;
  get onpointerup(): ((this: any, ev: any) => any) | null {
    return this._onpointerup;
  }
  set onpointerup(listener: ((this: any, ev: any) => any) | null) {
    this._onpointerup = listener;
  }

  constructor(
    type: string,
    id: string,
    name: string,
    text?: string,
    style?: Record<string, string | null>,
    attributes?: Record<string, string | null>
  ) {
    this._type = type;
    this._id = id;
    this._name = name;
    this._text = text || this._text;
    this._style = { ...(style || this._style) };
    this._attributes = { ...(attributes || this._attributes) };
  }

  update(state: ElementState) {
    this.updateText(state.text);
    this.updateStyle(state.style);
    this.updateAttributes(state.attributes);
    return this;
  }

  cloneChild(index: number): IElement | undefined {
    const children = this.children;
    const targetIndex = index < 0 ? children.length + index : index;
    const validIndex = Math.max(0, Math.min(targetIndex, children.length - 1));
    const child = children[validIndex];
    if (child) {
      const newChild = new Element(
        child.type,
        child.id,
        child.name,
        child.text,
        child.style,
        child.attributes
      );
      this.appendChild(newChild);
      return newChild;
    }
    return undefined;
  }

  getChild(id: string): IElement | undefined {
    return this._children.find((child) => child.id === id);
  }

  findChild(name: string): IElement | undefined {
    return this._children.find(
      (child) => child.name === name || child.name.split(" ").includes(name)
    );
  }

  findChildren(...names: string[]): IElement[] {
    return this._children.filter(
      (child) =>
        names.includes(child.name) ||
        child.name.split(" ").some((n) => names.includes(n))
    );
  }

  appendChild(child: IElement): IElement {
    this._children.push(child);
    return child;
  }

  removeChild(child: IElement): boolean {
    const childIndex = this._children.indexOf(child);
    if (childIndex < 0) {
      return false;
    }
    this._children.splice(childIndex, 1);
    return true;
  }

  clear(): void {
    this._children = [];
    this._text = "";
  }

  observeSize(_breakpoints: Record<string, number>): () => void {
    return () => null;
  }

  setImportContent(_properties: Record<string, any>): void {}

  setStyleContent(
    _targetName: string,
    _properties: Record<string, any>,
    _breakpoints: Record<string, number>
  ): void {}

  setAnimationContent(
    _animationName: string,
    _properties: Record<string, any>
  ): void {}

  updateText(text: string | undefined) {
    this._text = text || "";
  }

  updateStyle(style: Record<string, string | null> | null | undefined): void {
    if (!style) {
      this._style = {};
    } else {
      Object.entries(style).forEach(([k, v]) => {
        if (v == null) {
          delete this._style[k];
        } else {
          this._style[k] = v;
        }
      });
    }
  }

  updateAttributes(
    attributes: Record<string, string | null> | null | undefined
  ): void {
    if (!attributes) {
      this._attributes = {};
    } else {
      Object.entries(attributes).forEach(([k, v]) => {
        if (v == null) {
          delete this._attributes[k];
        } else {
          this._attributes[k] = v;
        }
      });
    }
  }

  getAttribute(attr: string): string | null {
    return this._attributes[attr] ?? null;
  }
}
