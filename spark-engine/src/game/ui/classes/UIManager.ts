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
