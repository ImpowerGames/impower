import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { IElement } from "../types/IElement";
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

  protected getName(...path: string[]): string {
    return this.getId(...path.slice(-1));
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
      el = el.getChildren().find((c) => this.getName(c.id) === part);
      if (!el) {
        return undefined;
      }
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

  createElement(type: string, ...path: string[]): IElement {
    const newEl = this._config.createElement(type);
    if (path?.length > 0) {
      newEl.id = this.getId(...path);
      newEl.className = this.getName(...path);
    }
    this._events.onCreateElement.emit({ type, id: newEl.id });
    return newEl;
  }

  getOrCreateUIRoot(): IElement {
    const root = this._config.root;
    const path = this.getUIPath();
    const newEl = this.getElement(path) || this.createElement("div", ...path);
    if (!root.getChildren().includes(newEl)) {
      root.appendChild(newEl);
    }
    return newEl;
  }

  getOrCreateStyleRoot(): IElement {
    const root = this._config.root;
    const path = this.getStylePath();
    const newEl = this.getElement(path) || this.createElement("style", ...path);
    if (!root.getChildren().includes(newEl)) {
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

  protected _searchChildrenForFirst(
    parent: IElement,
    name: string
  ): IElement | undefined {
    if (parent) {
      const children = parent.getChildren();
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (child) {
          if (this.getName(child.id) === name) {
            return child;
          }
          return this._searchChildrenForFirst(child, name);
        }
      }
    }
    return undefined;
  }

  protected _searchChildrenForAll(
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
          this._searchChildrenForAll(child, name, found);
        }
      }
    }
    return found;
  }

  findAllUIElements(structName: string, childName: string): IElement[] {
    const found: IElement[] = [];
    const parent = this.getElement(this.getUIPath(structName));
    if (parent) {
      this._searchChildrenForAll(parent, childName, found);
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
    const found: IElement[] = [];
    if (parent) {
      this._searchChildrenForFirst(parent, childName);
    }
    return found[0];
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
