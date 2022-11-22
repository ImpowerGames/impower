import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { IElement } from "../types/IElement";
import { getCSSPropertyKeyValue } from "../utils/getCSSPropertyKeyValue";
import { getHash } from "../utils/getHash";
import { setupDefaultStyle } from "../utils/setupDefaultStyle";
import { Element } from "./Element";

const DEFAULT_ROOT_CLASS_NAME = "spark-root";
const DEFAULT_UI_CLASS_NAME = "spark-ui";
const DEFAULT_STYLE_CLASS_NAME = "spark-style";
const DEFAULT_CREATE_ELEMENT = (id: string) => new Element(id);

export interface UIEvents extends Record<string, GameEvent> {
  onCreateElement: GameEvent<{ id: string; type: string }>;
}

export interface UIConfig {
  styleClassName: string;
  uiClassName: string;
  root: IElement;
  createElement: (type: string) => IElement;
}

export interface UIState {}

export class UIManager extends Manager<UIEvents, UIConfig, UIState> {
  constructor(config?: Partial<UIConfig>, state?: Partial<UIState>) {
    const initialEvents: UIEvents = {
      onCreateElement: new GameEvent<{
        id: string;
        type: string;
      }>(),
    };
    const initialConfig: UIConfig = {
      styleClassName: DEFAULT_STYLE_CLASS_NAME,
      uiClassName: DEFAULT_UI_CLASS_NAME,
      root: DEFAULT_CREATE_ELEMENT(DEFAULT_ROOT_CLASS_NAME),
      createElement: DEFAULT_CREATE_ELEMENT,
      ...(config || {}),
    };
    const initialState: UIState = { ...(state || {}) };
    super(initialEvents, initialConfig, initialState);
  }

  protected getId(...path: string[]): string {
    return path.join(".");
  }

  protected getPath(id: string): string[] {
    return id.split(".");
  }

  protected getName(id: string): string {
    return this.getId(...this.getPath(id).slice(-1));
  }

  protected getParentPath(id: string): string[] {
    return this.getPath(id).slice(0, -1);
  }

  getElement(path: string[]): IElement | undefined {
    if (this.getId(...path) === this._config.root.id) {
      return this._config.root;
    }
    let el: IElement | undefined = this._config.root;
    for (let i = 1; i < path.length; i += 1) {
      const part = path[i];
      const nextEl: IElement | undefined = el
        ?.getChildren()
        .find((c) => this.getName(c.id) === part);
      if (!nextEl) {
        return undefined;
      }
      el = nextEl;
    }
    return el;
  }

  getParent(el: IElement): IElement | undefined {
    return this.getElement(this.getParentPath(el.id));
  }

  getUIPath(...path: string[]): string[] {
    return [this._config.root.id, this._config.uiClassName, ...path];
  }

  getStylePath(...path: string[]): string[] {
    return [this._config.root.id, this._config.styleClassName, ...path];
  }

  loadStyles(objectMap: Record<string, Record<string, unknown>>): void {
    const styleEl = this.getOrCreateStyleRoot();
    if (!objectMap) {
      return;
    }
    const imports = Object.values(objectMap?.["import"] || {});
    let content = "";
    content += `${imports.map((x) => `\n@import url("${x}");`)}`;
    const animationStructNames = Object.keys(objectMap?.["animation"] || {});
    animationStructNames.forEach((structName) => {
      if (content) {
        content += "\n";
      }
      const struct = objectMap[structName];
      const fieldMap: Record<string, string[]> = {};
      if (struct) {
        content += `@keyframes ${structName} {\n`;
        Object.entries(struct || {}).forEach(([fk, fv]) => {
          if (fk.includes(".")) {
            const [keyframe, propName] = fk.split(".");
            if (keyframe && propName) {
              if (!fieldMap[keyframe]) {
                fieldMap[keyframe] = [];
              }
              const [cssProp, cssValue] = getCSSPropertyKeyValue(propName, fv);
              fieldMap[keyframe]?.push(`${cssProp}: ${cssValue};`);
            }
          }
        });
        Object.entries(fieldMap || {}).forEach(([keyframe, fields]) => {
          const fieldsContent = `{\n  ${fields.join(`\n  `)}\n}`;
          content += `${keyframe} ${fieldsContent}`;
        });
        content += `\n}`;
      }
    });
    const styleStructNames = Object.keys(objectMap?.["style"] || {});
    styleStructNames.forEach((structName) => {
      if (content) {
        content += "\n";
      }
      const struct = objectMap[structName];
      const breakpointMap: Record<string, string[]> = {};
      Object.entries(struct || {}).forEach(([fk, fv]) => {
        if (fk.includes(".")) {
          const [breakpoint, propName] = fk.split(".");
          if (breakpoint && propName) {
            if (!breakpointMap[breakpoint]) {
              breakpointMap[breakpoint] = [];
            }
            const [cssProp, cssValue] = getCSSPropertyKeyValue(propName, fv);
            breakpointMap[breakpoint]?.push(`${cssProp}: ${cssValue};`);
          }
        } else {
          if (!breakpointMap[""]) {
            breakpointMap[""] = [];
          }
          const [cssProp, cssValue] = getCSSPropertyKeyValue(fk, fv);
          breakpointMap[""].push(`${cssProp}: ${cssValue};`);
        }
      });
      Object.entries(breakpointMap || {}).forEach(([breakpoint, fields]) => {
        const fieldsContent = `{\n  ${fields.join(`\n  `)}\n}`;
        if (content) {
          content += "\n";
        }
        if (breakpoint) {
          content += `.${breakpoint} #${this.config.root.id} .${structName} ${fieldsContent}`;
        } else {
          content += `#${this.config.root.id} .${structName} ${fieldsContent}`;
        }
      });
    });
    if (styleEl.textContent !== content) {
      styleEl.textContent = content;
    }
  }

  loadUI(
    objectMap: Record<string, Record<string, unknown>>,
    ...uiStructNames: string[]
  ): void {
    const uiEl = this.getOrCreateUIRoot();
    uiEl.style["fontFamily"] = "Courier Prime Sans";
    uiEl.style["fontSize"] = "1em";
    setupDefaultStyle(uiEl);
    if (!objectMap) {
      return;
    }
    uiStructNames.forEach((structName) => {
      const fields = objectMap[structName];
      const hash = getHash(fields).toString();
      const existingStructEl = this.getUIElement(structName);
      if (existingStructEl && existingStructEl.dataset["hash"] !== hash) {
        existingStructEl.replaceChildren();
      }
      const structEl =
        existingStructEl || this.constructUIElement("div", structName);
      if (structEl.dataset["hash"] !== hash) {
        structEl.dataset["hash"] = hash;
      }
      setupDefaultStyle(structEl);
      if (fields) {
        Object.entries(fields).forEach(([k, v]) => {
          const curr =
            this.getUIElement(structName, ...k.split(".")) ||
            this.constructUIElement("div", structName, ...k.split("."));
          if (curr && v && typeof v === "string") {
            curr.textContent = v;
          }
        });
      }
    });
  }

  createElement(type: string, ...path: string[]): IElement {
    const newEl = this._config.createElement(type);
    if (path?.length > 0) {
      newEl.id = this.getId(...path);
      newEl.className = this.getName(newEl.id);
    }
    this._events.onCreateElement.emit({ type, id: newEl.id });
    return newEl;
  }

  getOrCreateUIRoot(): IElement {
    const root = this._config.root;
    const path = this.getUIPath();
    const newEl = this.getElement(path) || this.createElement("div", ...path);
    if (!root.getChildren().find((c) => c.id === newEl.id)) {
      root.appendChild(newEl);
    }
    return newEl;
  }

  getOrCreateStyleRoot(): IElement {
    const root = this._config.root;
    const path = this.getStylePath();
    const newEl = this.getElement(path) || this.createElement("style", ...path);
    if (!root.getChildren().find((c) => c.id === newEl.id)) {
      root.appendChild(newEl);
    }
    return newEl;
  }

  getUIElement(
    structName: string,
    ...childPath: string[]
  ): IElement | undefined {
    return this.getElement(this.getUIPath(structName, ...childPath));
  }

  protected _searchForFirst(
    parent: IElement,
    name: string
  ): IElement | undefined {
    if (this.getName(parent.id) === name) {
      return parent;
    }
    const children = parent.getChildren();
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child) {
        let result = this._searchForFirst(child, name);
        if (result) {
          return result;
        }
      }
    }
    return undefined;
  }

  protected _searchForAll(
    parent: IElement,
    name: string,
    found: IElement[]
  ): IElement[] {
    if (parent) {
      const children = parent.getChildren();
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (child) {
          if (this.getName(child.id) === name) {
            found.push(child);
          }
          this._searchForAll(child, name, found);
        }
      }
    }
    return found;
  }

  findAllUIElements(structName: string, childName: string): IElement[] {
    const found: IElement[] = [];
    const parent = this.getElement(this.getUIPath(structName));
    if (parent) {
      this._searchForAll(parent, childName, found);
    }
    return found;
  }

  findFirstUIElement(
    structName: string,
    childName?: string
  ): IElement | undefined {
    const parent = this.getElement(this.getUIPath(structName));
    if (!childName) {
      return parent;
    }
    if (parent) {
      return this._searchForFirst(parent, childName);
    }
    return undefined;
  }

  constructUIElement(
    type: string,
    structName: string,
    ...childPath: string[]
  ): IElement {
    const uiPath = this.getUIPath();
    const currPath: string[] = [...uiPath];
    [structName, ...childPath].forEach((part) => {
      if (part) {
        const parent = this.getElement(currPath);
        currPath.push(part);
        if (parent && !this.getElement(currPath)) {
          parent.appendChild(this.createElement(type, ...currPath));
        }
      }
    });
    return this.getElement([...uiPath, structName, ...childPath]) as IElement;
  }
}
