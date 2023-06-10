import { IElement } from "../../../spark-engine/src";
import { getCSSPropertyKeyValue } from "../utils/getCSSPropertyKeyValue";
import { getCSSPropertyName } from "../utils/getCSSPropertyName";

export class SparkDOMElement implements IElement {
  protected _children: SparkDOMElement[] = [];

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

  constructor(htmlElement: HTMLElement, ...children: SparkDOMElement[]) {
    this._htmlElement = htmlElement;
    this._children = children;
  }

  cloneChild(index: number): IElement | undefined {
    const children = this.getChildren();
    const validIndex = Math.max(0, Math.min(index, children.length - 1));
    const child = children[validIndex];
    if (child) {
      const newEl = (child as SparkDOMElement)._htmlElement.cloneNode(
        true
      ) as HTMLElement;
      const newChild = new SparkDOMElement(newEl);
      this.appendChild(newChild);
      return newChild;
    }
    return undefined;
  }

  getChildren(): IElement[] {
    return this._children as IElement[];
  }

  appendChild(child: IElement): void {
    const el = child as SparkDOMElement;
    this._htmlElement.appendChild(el._htmlElement);
    this._children.push(el);
  }

  removeChild(child: IElement): void {
    const el = child as SparkDOMElement;
    this._htmlElement.removeChild(el._htmlElement);
    this._children = this._children.filter((x) => x !== child);
  }

  replaceChildren(...children: IElement[]): void {
    const newEls = children.map((x) => x as SparkDOMElement);
    this._htmlElement.replaceChildren(...newEls.map((x) => x._htmlElement));
    this._children = newEls;
  }

  observeSize(breakpoints: Record<string, number>): () => void {
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
        if (
          entry.target.parentElement &&
          entry.target.parentElement.className !== className
        ) {
          entry.target.parentElement.className = className;
        }
      }
    });
    resizeObserver.observe(this._htmlElement);
    return resizeObserver.disconnect;
  }

  setImportContent(properties: Record<string, any>): void {
    let textContent = "";
    Object.entries(properties).forEach(([, v]) => {
      if (v && typeof v === "string") {
        textContent += `@import url('${v}');`;
      }
    });
    this.textContent = textContent;
  }

  setAnimationContent(
    animationName: string,
    properties: Record<string, any>,
    objectMap: { [type: string]: Record<string, any> }
  ): void {
    const groupMap: Record<string, Record<string, unknown>> = {};
    Object.entries(properties).forEach(([fk, fv]) => {
      const [, keyframe, propName] = fk.split(".");
      if (keyframe && propName) {
        if (!groupMap[keyframe]) {
          groupMap[keyframe] = {};
        }
        const m = groupMap[keyframe];
        if (m) {
          m[propName] = fv;
        }
      }
    });
    let textContent = "";
    textContent += `@keyframes ${animationName} {\n`;
    Object.entries(groupMap || {}).forEach(([keyframe, fields]) => {
      const content = Object.entries(fields)
        .map(([k, v]) => {
          const [cssProp, cssValue] = getCSSPropertyKeyValue(k, v, objectMap);
          return `${cssProp}: ${cssValue};`;
        })
        .join(`\n  `);
      const fieldsContent = `{\n    ${content}\n  }`;
      textContent += `  ${keyframe} ${fieldsContent}\n`;
    });
    textContent += `}`;
    this.textContent = textContent;
  }

  setStyleContent(
    targetName: string,
    properties: Record<string, any>,
    objectMap: { [type: string]: Record<string, any> }
  ): void {
    const groupMap: Record<string, Record<string, unknown>> = {};
    Object.entries(properties).forEach(([fk, fv]) => {
      const fieldPath = fk.split(".");
      const propName = fieldPath[2] || fieldPath[1];
      const group = fieldPath[2] ? fieldPath[1] : undefined;
      if (propName) {
        if (group) {
          if (!groupMap[group]) {
            groupMap[group] = {};
          }
          const m = groupMap[group];
          if (m) {
            m[propName] = fv;
          }
        } else {
          if (!groupMap[""]) {
            groupMap[""] = {};
          }
          const m = groupMap[""];
          if (m) {
            m[propName] = fv;
          }
        }
      }
    });
    let textContent = "";
    Object.entries(groupMap || {}).forEach(([groupName, fields]) => {
      const content = Object.entries(fields)
        .map(([k, v]) => {
          const [cssProp, cssValue] = getCSSPropertyKeyValue(k, v, objectMap);
          return `${cssProp}: ${cssValue};`;
        })
        .join(`\n  `);
      const fieldsContent = `{\n  ${content}\n}`;
      const theme = objectMap?.["theme"]?.[""];
      const isBreakpointGroup = groupName && theme.breakpoints[groupName];
      const rootId = this.id?.split(".")?.[0] || "";
      const target = targetName === "*" ? targetName : `.${targetName}`;
      if (isBreakpointGroup) {
        textContent += `#${rootId}.${groupName} ${target} ${fieldsContent}\n`;
      } else if (groupName) {
        const cssPseudoName = getCSSPropertyName(groupName);
        textContent += `#${rootId} ${target}:${cssPseudoName} ${fieldsContent}\n`;
      } else {
        textContent += `#${rootId} ${target} ${fieldsContent}\n`;
      }
    });
    this.textContent = textContent;
  }

  setStyleProperty(propName: string, propValue: unknown): void {
    this._htmlElement.style.setProperty(propName, String(propValue));
  }

  hasState(state: string): boolean {
    return this._htmlElement.classList.contains(state);
  }

  addState(state: string): void {
    this._htmlElement.classList.add(state);
  }

  removeState(state: string): void {
    this._htmlElement.classList.remove(state);
  }
}
