import { ElementState } from "../../../spark-engine/src/game/modules/ui/types/ElementState";
import { IElement } from "../../../spark-engine/src/game/modules/ui/types/IElement";
import { getAnimationContent } from "../utils/getAnimationContent";
import { getImportContent } from "../utils/getImportContent";
import { getStyleContent } from "../utils/getStyleContent";

export class SparkDOMElement implements IElement {
  protected _htmlElement?: HTMLElement;

  protected _type: string = "";
  get type(): string {
    return this._type;
  }

  protected _id: string = "";
  get id(): string {
    return this._id;
  }

  protected _name: string = "";
  get name(): string {
    return this._name;
  }

  protected _text = "";
  get text() {
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

  protected _children: SparkDOMElement[] = [];
  get children() {
    return this._children as Readonly<SparkDOMElement[]>;
  }

  protected _onclick: ((this: any, ev: any) => any) | null = null;
  get onclick(): ((this: any, ev: any) => any) | null {
    return this._onclick;
  }
  set onclick(value: ((this: any, ev: any) => any) | null) {
    this._onclick = value;
    if (this._htmlElement) {
      this._htmlElement.onclick = value;
    }
  }

  protected _onpointerdown: ((this: any, ev: any) => any) | null = null;
  get onpointerdown(): ((this: any, ev: any) => any) | null {
    return this._onpointerdown;
  }
  set onpointerdown(value: ((this: any, ev: any) => any) | null) {
    this._onpointerdown = value;
    if (this._htmlElement) {
      this._htmlElement.onpointerdown = value;
    }
  }

  protected _onpointerup: ((this: any, ev: any) => any) | null = null;
  get onpointerup(): ((this: any, ev: any) => any) | null {
    return this._onpointerup;
  }
  set onpointerup(value: ((this: any, ev: any) => any) | null) {
    this._onpointerup = value;
    if (this._htmlElement) {
      this._htmlElement.onpointerup = value;
    }
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
    if (type) {
      const el = document.createElement(type);
      if (id) {
        el.id = id;
      }
      if (name) {
        el.className = name;
      }
      if (text != null) {
        el.textContent = text;
      }
      if (style != null) {
        el.style.cssText = Object.entries(style)
          .map(([k, v]) => `${k}: ${v}`)
          .join(";");
      }
      if (attributes != null) {
        Object.entries(attributes).forEach(([k, v]) => {
          if (v != null) {
            el.setAttribute(k, v);
          }
        });
      }
      this._htmlElement = el;
    }
  }

  static wrap(htmlElement: HTMLElement, deep = false) {
    const wrapped = new SparkDOMElement("", "", "");
    wrapped._htmlElement = htmlElement;
    wrapped._type = htmlElement.tagName.toLowerCase();
    wrapped._id = htmlElement.id;
    wrapped._name = htmlElement.id.split(".").at(-1) ?? "";
    wrapped._text = htmlElement.textContent || "";
    wrapped._style = Array.from(htmlElement.style).reduce((s, name) => {
      const key = name as unknown as number;
      s[key] = htmlElement.style[key];
      return s;
    }, {} as Record<string | number, any>);
    for (let i = 0; i < htmlElement.attributes.length; i += 1) {
      const attr = htmlElement.attributes[i]!;
      wrapped._attributes[attr.nodeName] = attr.nodeValue;
    }
    if (deep) {
      htmlElement.childNodes.forEach((child) => {
        if (child instanceof HTMLElement) {
          wrapped._children.push(SparkDOMElement.wrap(child, deep));
        }
      });
    }
    wrapped._onclick = htmlElement.onclick;
    wrapped._onpointerdown = htmlElement.onpointerdown;
    wrapped._onpointerup = htmlElement.onpointerup;
    return wrapped;
  }

  update(state: ElementState) {
    this.updateText(state.text);
    this.updateStyle(state.style);
    this.updateAttributes(state.attributes);
    return this;
  }

  clear(): void {
    this.updateText("");
    [...this._children].forEach((child) => {
      this.removeChild(child);
    });
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

  cloneChild(index: number): IElement | undefined {
    const children = this.children;
    const targetIndex = index < 0 ? children.length + index : index;
    const validIndex = Math.max(0, Math.min(targetIndex, children.length - 1));
    const child = children[validIndex];
    if (child) {
      const childEl = child as SparkDOMElement;
      if (childEl._htmlElement) {
        const newEl = childEl._htmlElement.cloneNode(true) as HTMLElement;
        const newIndex = children.length.toString();
        const oldName = child.name;
        const newName = oldName
          .split(" ")
          .map((p) => (Number.isSafeInteger(Number(p)) ? newIndex : p))
          .join(" ");
        const uniqueName =
          newName === oldName ? oldName + " " + newIndex : newName;
        newEl.className = uniqueName;
        const oldId = child.id;
        const newId =
          oldId.split(".").slice(0, -1).join(".") + "." + uniqueName;
        newEl.id = newId;
        newEl.querySelectorAll("*").forEach((el) => {
          if (el.id.startsWith(oldId)) {
            el.id = newId + el.id.slice(oldId.length);
          }
        });
        const newChild = SparkDOMElement.wrap(newEl, true);
        this.appendChild(newChild);
        return newChild;
      }
    }
    return undefined;
  }

  appendChild(child: IElement): IElement {
    const el = child as SparkDOMElement;
    if (this._htmlElement && el._htmlElement) {
      if (el._htmlElement.tagName === "STYLE" && child.id.endsWith(".css")) {
        const head = document.documentElement.getElementsByTagName("head")?.[0];
        if (head) {
          const childHtmlElement = head.appendChild(el._htmlElement);
          el._htmlElement = childHtmlElement;
        }
      } else {
        const childHtmlElement = this._htmlElement.appendChild(el._htmlElement);
        el._htmlElement = childHtmlElement;
      }
    }
    this._children.push(el);
    return el;
  }

  removeChild(child: IElement): boolean {
    const el = child as SparkDOMElement;
    if (el._htmlElement) {
      el._htmlElement.remove();
    }
    const childIndex = this._children.indexOf(el);
    if (childIndex < 0) {
      return false;
    }
    this._children.splice(childIndex, 1);
    return true;
  }

  updateText(text: string | undefined): void {
    this._text = text || "";
    if (this._htmlElement) {
      this._htmlElement.textContent = text || "";
    }
  }

  updateStyle(style: Record<string, string | null> | null | undefined): void {
    if (!style) {
      this._style = {};
    } else {
      Object.entries(style).forEach(([k, v]) => {
        if (v == null) {
          delete this._style[k];
          if (this._htmlElement) {
            this._htmlElement.style.removeProperty(k);
          }
        } else {
          this._style[k] = v;
          if (this._htmlElement) {
            this._htmlElement.style.setProperty(k, v);
          }
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
          if (this._htmlElement) {
            this._htmlElement.removeAttribute(k);
          }
        } else {
          this._attributes[k] = v;
          if (this._htmlElement) {
            this._htmlElement.setAttribute(k, v);
          }
        }
      });
    }
  }

  observeSize(breakpoints: Record<string, number>): () => void {
    if (this._htmlElement) {
      const resizeObserver = new ResizeObserver(([entry]) => {
        if (entry) {
          const width = entry.contentRect?.width;
          const keys = Object.keys(breakpoints);
          let className = "";
          for (let i = 0; i < keys.length; i += 1) {
            const k = keys[i] || "";
            className += `${k} `;
            const b = breakpoints[k];
            if (b !== undefined) {
              if (b > width) {
                break;
              }
            }
          }
          className = className.trim();
          if (entry.target && entry.target.className !== className) {
            entry.target.className = className;
          }
        }
      });
      resizeObserver.observe(this._htmlElement);
      return () => resizeObserver.disconnect();
    }
    return () => null;
  }

  setImportContent(properties: Record<string, any>): void {
    this.updateText(getImportContent(properties));
  }

  setAnimationContent(
    animationName: string,
    properties: Record<string, any>
  ): void {
    this.updateText(getAnimationContent(animationName, properties));
  }

  setStyleContent(
    targetName: string,
    properties: Record<string, any>,
    breakpoints: Record<string, number>
  ): void {
    this.updateText(getStyleContent(targetName, properties, breakpoints));
  }

  getAttribute(attr: string): string | null {
    return this._attributes[attr] ?? null;
  }
}
