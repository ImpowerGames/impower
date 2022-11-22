import { IElement } from "../types/IElement";

export class Element implements IElement {
  protected _id: string;

  protected _className: string;

  protected _textContent: string = "";

  protected _style: Record<string, string> = {};

  protected _dataset: Record<string, string> = {};

  protected _children: IElement[] = [];

  protected _onclick: ((this: any, ev: any) => any) | null = null;

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get className(): string {
    return this._className;
  }

  set className(value: string) {
    this._className = value;
  }

  get textContent(): string {
    return this._textContent;
  }

  set textContent(value: string) {
    this._textContent = value;
  }

  get style(): Record<string, string> {
    return this._style;
  }

  get dataset(): Record<string, string> {
    return this._dataset;
  }

  get onclick(): ((this: any, ev: any) => any) | null {
    return this._onclick;
  }

  set onclick(listener: ((this: any, ev: any) => any) | null) {
    this._onclick = listener;
  }

  constructor(
    id: string,
    textContent?: string,
    style?: Record<string, string>,
    dataset?: Record<string, string>
  ) {
    this._id = id;
    this._className = id.split(".").slice(-1).join();
    this._textContent = textContent || this._textContent;
    this._style = { ...(style || this._style) };
    this._dataset = { ...(dataset || this._dataset) };
  }

  cloneChild(index: number): IElement | undefined {
    const children = this.getChildren();
    const validIndex = Math.max(0, Math.min(index, children.length - 1));
    const child = children[validIndex];
    if (child) {
      const newChild = new Element(
        this._id,
        this._textContent,
        this._style,
        this._dataset
      );
      this.appendChild(newChild);
      return newChild;
    }
    return undefined;
  }

  getChildren(): IElement[] {
    return this._children;
  }

  appendChild(child: IElement): void {
    this._children.push(child);
  }

  removeChild(child: IElement): void {
    this._children = this._children.filter((x) => x !== child);
  }

  replaceChildren(...children: IElement[]): void {
    this._children = children;
  }
}
