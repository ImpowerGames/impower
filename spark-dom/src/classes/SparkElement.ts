import { IElement } from "../../../spark-engine";

export class SparkElement implements IElement {
  protected _children: SparkElement[] = [];

  protected _htmlElement: HTMLElement;

  get id(): string {
    return this._htmlElement.id;
  }

  set id(value: string) {
    this._htmlElement.id = value;
  }

  get className(): string {
    return this._htmlElement.className;
  }

  set className(value: string) {
    this._htmlElement.className = value;
  }

  get textContent(): string {
    return this._htmlElement.textContent || "";
  }

  set textContent(value: string) {
    this._htmlElement.textContent = value;
  }

  get style(): Record<string, string> {
    return this._htmlElement.style as unknown as Record<string, string>;
  }

  get dataset(): Record<string, string | undefined> {
    return this._htmlElement.dataset;
  }

  get onclick(): ((this: any, ev: any) => any) | null {
    return this._htmlElement.onclick;
  }

  set onclick(listener: ((this: any, ev: any) => any) | null) {
    this._htmlElement.onclick = listener;
  }

  constructor(htmlElement: HTMLElement) {
    this._htmlElement = htmlElement;
  }

  cloneChild(index: number): IElement | undefined {
    const children = this.getChildren();
    const validIndex = Math.max(0, Math.min(index, children.length - 1));
    const child = children[validIndex];
    if (child) {
      const newEl = this._htmlElement.cloneNode(true) as HTMLElement;
      const newChild = new SparkElement(newEl);
      this.appendChild(newChild);
      return newChild;
    }
    return undefined;
  }

  getChildren(): IElement[] {
    return this._children as IElement[];
  }

  appendChild(child: IElement): void {
    const el = child as SparkElement;
    this._htmlElement.appendChild(el._htmlElement);
    this._children.push(el);
  }

  removeChild(child: IElement): void {
    const el = child as SparkElement;
    this._htmlElement.removeChild(el._htmlElement);
    this._children = this._children.filter((x) => x !== child);
  }

  replaceChildren(...children: IElement[]): void {
    const newEls = children.map((x) => x as SparkElement);
    this._htmlElement.replaceChildren(...newEls.map((x) => x._htmlElement));
    this._children = newEls;
  }
}
