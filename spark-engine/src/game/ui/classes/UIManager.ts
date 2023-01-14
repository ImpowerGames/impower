import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { getAllProperties } from "../../core/utils/getAllProperties";
import { IElement } from "../types/IElement";
import { Theme } from "../types/Theme";
import { getHash } from "../utils/getHash";
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
  unregisterRootObserver?: () => void;

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
    const initialState: UIState = { theme: "", ...(state || {}) };
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

  protected overrideStyle(
    element: IElement,
    properties: Record<string, any>
  ): void {
    Object.entries(properties).forEach(([k, v]) => {
      element.style[k] = v;
    });
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

  getStylePath(...path: string[]): string[] {
    return [this._config.root.id, this._config.styleClassName, ...path];
  }

  getUIPath(...path: string[]): string[] {
    return [this._config.root.id, this._config.uiClassName, ...path];
  }

  loadTheme(objectMap: { [type: string]: Record<string, any> }): void {
    const theme = objectMap?.["theme"]?.[""] as Theme;
    if (theme) {
      this.unregisterRootObserver?.();
      this.unregisterRootObserver = this._config.root.observeSize(
        theme.breakpoints
      );
    }
  }

  loadStyles(
    objectMap: { [type: string]: Record<string, any> },
    ...structNames: string[]
  ): void {
    const styleRootEl = this.getOrCreateStyleRoot();
    if (!styleRootEl || !objectMap) {
      return;
    }

    const styleStructNames = new Set<string>();
    const validStructNames =
      structNames?.length > 0
        ? structNames
        : [
            ...Object.keys(objectMap?.["import"] || {}),
            ...Object.keys(objectMap?.["animation"] || {}),
            ...Object.keys(objectMap?.["style"] || {}),
          ];
    validStructNames.forEach((structName) => {
      if (structName) {
        if (structName === "import") {
          const importStructObj = objectMap?.["import"]?.[structName];
          if (importStructObj) {
            const structEl = this.constructStyleElement(
              structName,
              importStructObj
            );
            if (structEl) {
              const properties = getAllProperties(importStructObj);
              structEl.setImportContent(properties);
            }
          }
        }
        const styleStructObj = objectMap?.["style"]?.[structName];
        if (styleStructObj) {
          const structEl = this.constructStyleElement(
            structName,
            styleStructObj
          );
          if (structEl) {
            const properties = getAllProperties(styleStructObj);
            structEl.setStyleContent(properties, objectMap);
          }
        }
        const animationStructObj = objectMap?.["animation"]?.[structName];
        if (animationStructObj) {
          const structEl = this.constructStyleElement(
            structName,
            animationStructObj
          );
          if (structEl) {
            const properties = getAllProperties(animationStructObj);
            structEl.setAnimationContent(properties, objectMap);
          }
        }
        const uiStructObj = objectMap?.["ui"]?.[structName];
        if (uiStructObj) {
          const properties = getAllProperties(uiStructObj);
          Object.keys(properties).forEach((fk) => {
            const uiPath = fk.split(".");
            uiPath.forEach((styleStructName) => {
              styleStructNames.add(styleStructName);
            });
          });
        }
      }
    });
    styleStructNames.forEach((styleStructName) => {
      this.loadStyles(objectMap, styleStructName);
    });
  }

  loadUI(
    objectMap: { [type: string]: Record<string, any> },
    ...structNames: string[]
  ): void {
    const uiRootEl = this.getOrCreateUIRoot();
    if (!uiRootEl || !objectMap) {
      return;
    }
    const rootStyleProperties = {
      position: "absolute",
      top: "0",
      bottom: "0",
      left: "0",
      right: "0",
      display: "flex",
      flexDirection: "column",
    };
    const uiRootStyleProperties = {
      fontFamily: "Courier Prime Sans",
      fontSize: "1em",
      ...rootStyleProperties,
    };
    this.overrideStyle(uiRootEl, uiRootStyleProperties);
    const validStructNames =
      structNames?.length > 0
        ? structNames
        : Object.keys(objectMap?.["ui"] || {});
    validStructNames.forEach((structName) => {
      if (structName) {
        const structObj = objectMap?.["ui"]?.[structName];
        if (structObj) {
          const properties = getAllProperties(structObj);
          const structEl = this.constructUIElement(structName, properties);
          this.overrideStyle(structEl, rootStyleProperties);
          Object.entries(properties).forEach(([k, v]) => {
            const fieldEl =
              this.getUIElement(structName, ...k.split(".")) ||
              this.constructElement(
                "div",
                this.getUIPath(),
                structName,
                ...k.split(".")
              );
            if (fieldEl && v && typeof v === "string") {
              fieldEl.textContent = v;
            }
          });
        }
      }
    });
  }

  createElement(type: string, ...path: string[]): IElement {
    const newEl = this._config.createElement(type);
    if (path?.length > 0) {
      newEl.id = this.getId(...path);
      if (type !== "style") {
        newEl.className = this.getName(newEl.id);
      }
    }
    this._events.onCreateElement.emit({ type, id: newEl.id });
    return newEl;
  }

  getOrCreateStyleRoot(): IElement {
    const root = this._config.root;
    const path = this.getStylePath();
    const newEl = this.getElement(path) || this.createElement("div", ...path);
    if (!root.getChildren().find((c) => c.id === newEl.id)) {
      root.appendChild(newEl);
    }
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

  getStyleElement(
    structName: string,
    ...childPath: string[]
  ): IElement | undefined {
    return this.getElement(this.getStylePath(structName, ...childPath));
  }

  getUIElement(
    structName: string,
    ...childPath: string[]
  ): IElement | undefined {
    return this.getElement(this.getUIPath(structName, ...childPath));
  }

  constructElement(
    type: string,
    rootPath: string[],
    structName: string,
    ...childPath: string[]
  ): IElement {
    const currPath: string[] = [...rootPath];
    [structName, ...childPath].forEach((part) => {
      if (part) {
        const parent = this.getElement(currPath);
        currPath.push(part);
        if (parent && !this.getElement(currPath)) {
          parent.appendChild(this.createElement(type, ...currPath));
        }
      }
    });
    return this.getElement([...rootPath, structName, ...childPath]) as IElement;
  }

  constructStyleElement(
    structName: string,
    fields?: unknown
  ): IElement | undefined {
    const hash = getHash(fields).toString();
    const existingStructEl = this.getStyleElement(structName);
    if (!existingStructEl) {
      const structEl = this.constructElement(
        "style",
        this.getStylePath(),
        structName
      );
      structEl.dataset["hash"] = hash;
      return structEl;
    }
    if (existingStructEl.dataset["hash"] !== hash) {
      // Content of existing element has changed, needs update
      existingStructEl.replaceChildren();
      existingStructEl.dataset["hash"] = hash;
      return existingStructEl;
    }
    // Content of existing element is the same, no need to construct
    return undefined;
  }

  constructUIElement(structName: string, fields: unknown): IElement {
    const hash = getHash(fields).toString();
    const existingStructEl = this.getUIElement(structName);
    if (existingStructEl && existingStructEl.dataset["hash"] !== hash) {
      existingStructEl.replaceChildren();
    }
    const structEl =
      existingStructEl ||
      this.constructElement("div", this.getUIPath(), structName);
    if (structEl.dataset["hash"] !== hash) {
      structEl.dataset["hash"] = hash;
    }
    return structEl;
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
}
