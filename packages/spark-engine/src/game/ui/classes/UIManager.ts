import { GameEvent1 } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { ManagerUpdate } from "../../core/classes/ManagerUpdate";
import { Environment } from "../../core/types/Environment";
import { RequestMessage } from "../../core/types/RequestMessage";
import { getAllProperties } from "../../core/utils/getAllProperties";
import { uuid } from "../../core/utils/uuid";
import { ElementState } from "../types/ElementState";
import { IElement } from "../types/IElement";
import { ImageEvent } from "../types/ImageEvent";
import { ImageState } from "../types/ImageState";
import { TextEvent } from "../types/TextEvent";
import { TextState } from "../types/TextState";
import { getHash } from "../utils/getHash";
import { Element } from "./Element";

const DEFAULT_ROOT_CLASS_NAME = "spark-root";
const DEFAULT_UI_CLASS_NAME = "spark-ui";
const DEFAULT_STYLE_CLASS_NAME = "spark-style";
const DEFAULT_CREATE_ELEMENT = (
  type: string,
  id: string,
  name: string,
  text?: string,
  style?: Record<string, string | null>,
  attributes?: Record<string, string | null>
) => new Element(type, id, name, text, style, attributes);
const DEFAULT_BREAKPOINTS = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};
const DEFAULT_BASE_CLASS_NAMES = ["default", "text", "image"];
const isAsset = (obj: unknown): obj is { type: string; src: string } => {
  const asset = obj as { type: string; src: string };
  return asset && Boolean(asset.type && asset.src);
};

const isAssetLeaf = (_: string, v: unknown) =>
  isAsset(v) || (Array.isArray(v) && v.every((x) => isAsset(x)));

export interface UIEvents extends Record<string, GameEvent> {
  onUpdate: GameEvent1<RequestMessage[]>;
}

export interface UIConfig {
  baseClassNames: string[];
  styleClassName: string;
  uiClassName: string;
  root: IElement;
  createElement: (
    type: string,
    id: string,
    name: string,
    text?: string,
    style?: Record<string, string | null>,
    attributes?: Record<string, string | null>
  ) => IElement;
}

export interface UIState {
  instance: Record<string, number>;
  text: Record<string, TextState[]>;
  image: Record<string, ImageState[]>;
  style: Record<string, Record<string, string | null>>;
  attributes: Record<string, Record<string, string | null>>;
}

export class UIManagerUpdate extends ManagerUpdate {
  append(
    parent: string,
    id: string,
    name: string,
    text?: string,
    style?: Record<string, string | null>
  ) {
    this.request("ui/append", { parent, id, name, text, style });
  }

  remove(id: string) {
    this.request("ui/remove", { id });
  }

  text(id: string, text: string) {
    this.request("ui/text", { id, text });
  }

  style(id: string, style: Record<string, string | null>) {
    this.request("ui/style", { id, style });
  }

  attributes(id: string, attributes: Record<string, string | null>) {
    this.request("ui/attributes", { id, attributes });
  }
}

export class UIManager extends Manager<UIEvents, UIConfig, UIState> {
  protected _disposeSizeObservers: (() => void)[] = [];

  constructor(
    environment: Environment,
    config?: Partial<UIConfig>,
    state?: Partial<UIState>
  ) {
    const initialEvents: UIEvents = {
      onUpdate: new GameEvent1<RequestMessage[]>(),
    };
    const initialConfig: UIConfig = {
      baseClassNames: DEFAULT_BASE_CLASS_NAMES,
      styleClassName: DEFAULT_STYLE_CLASS_NAME,
      uiClassName: DEFAULT_UI_CLASS_NAME,
      root: DEFAULT_CREATE_ELEMENT(
        "div",
        DEFAULT_ROOT_CLASS_NAME,
        DEFAULT_ROOT_CLASS_NAME
      ),
      createElement: DEFAULT_CREATE_ELEMENT,
      ...(config || {}),
    };
    const initialState: UIState = {
      instance: {},
      text: {},
      image: {},
      style: {},
      attributes: {},
      ...(state || {}),
    };
    super(environment, initialEvents, initialConfig, initialState);
  }

  override destroy(): void {
    super.destroy();
    this._disposeSizeObservers.forEach((dispose) => {
      dispose();
    });
    const uiRoot = this.getElement(this.getUIPath());
    if (uiRoot) {
      uiRoot.clear();
    }
    const styleRoot = this.getElement(this.getStylePath());
    if (styleRoot) {
      styleRoot.clear();
    }
  }

  protected getId(...path: string[]): string {
    return path.join(".");
  }

  protected getPath(id: string): string[] {
    return id.split(".");
  }

  protected getParentPath(id: string): string[] {
    return this.getPath(id).slice(0, -1);
  }

  protected getElement(path: string[]): IElement | undefined {
    const id = this.getId(...path);
    if (id === this._config.root.id) {
      return this._config.root;
    }
    let el: IElement | undefined = this._config.root;
    for (let i = 1; i < path.length; i += 1) {
      const part = path[i] || "";
      const match = el.getChild(id);
      if (match) {
        return match;
      }
      const nextEl: IElement | undefined = el.findChild(part);
      if (!nextEl) {
        return undefined;
      }
      el = nextEl;
    }
    return el;
  }

  protected getParentElement(el: IElement): IElement | undefined {
    return this.getElement(this.getParentPath(el.id));
  }

  getStylePath(...path: string[]): string[] {
    return [this._config.root.id, this._config.styleClassName, ...path];
  }

  getUIPath(...path: string[]): string[] {
    return [this._config.root.id, this._config.uiClassName, ...path];
  }

  getImageVarName(name: string) {
    return `--image_${name}`;
  }

  getImageVarValue(src: string) {
    return `url('${src}')`;
  }

  getImageVar(name: string) {
    return `var(${this.getImageVarName(name)})`;
  }

  loadTheme(valueMap: { [type: string]: Record<string, any> }): void {
    const images = valueMap?.["image"];
    if (images) {
      Object.entries(images).forEach(([name, image]) => {
        if (image.src) {
          this._config.root.updateStyle({
            [this.getImageVarName(name)]: this.getImageVarValue(image.src),
          });
        }
      });
    }
    const breakpoints = valueMap?.["breakpoint"] || DEFAULT_BREAKPOINTS;
    if (breakpoints) {
      this._disposeSizeObservers.push(
        this._config.root.observeSize(breakpoints)
      );
    }
  }

  loadStyles(valueMap: { [type: string]: Record<string, any> }): void {
    // Get or create style root
    const styleRootEl = this.getOrCreateStyleRoot();
    if (!styleRootEl || !valueMap) {
      return;
    }
    // Process Imports
    const cssStructObj = valueMap?.["css"];
    if (cssStructObj) {
      if (cssStructObj) {
        const structEl = this.constructStyleElement("css", cssStructObj);
        if (structEl) {
          const properties = getAllProperties(cssStructObj);
          structEl.setImportContent(properties);
        }
      }
    }
    // Process Style and Animation
    const validStructNames = [
      ...Object.keys(valueMap?.["animation"] || {}),
      ...Object.keys(valueMap?.["style"] || {}),
    ];
    validStructNames.forEach((structName) => {
      if (structName) {
        const styleStructObj = valueMap?.["style"]?.[structName];
        if (styleStructObj) {
          const structEl = this.constructStyleElement(
            structName,
            styleStructObj
          );
          if (structEl) {
            const properties = getAllProperties(styleStructObj, isAssetLeaf);
            const breakpoints = valueMap?.["breakpoint"] || DEFAULT_BREAKPOINTS;
            structEl.setStyleContent(structName, properties, breakpoints);
          }
        }
        const animationStructObj = valueMap?.["animation"]?.[structName];
        if (animationStructObj) {
          const structEl = this.constructStyleElement(
            structName,
            animationStructObj
          );
          if (structEl) {
            const properties = getAllProperties(animationStructObj);
            structEl.setAnimationContent(structName, properties);
          }
        }
      }
    });
  }

  loadUI(
    valueMap: { [type: string]: Record<string, any> },
    ...structNames: string[]
  ): void {
    const uiRootEl = this.getOrCreateUIRoot();
    if (!uiRootEl || !valueMap) {
      return;
    }
    const rootStyleProperties = {
      position: "absolute",
      top: "0",
      bottom: "0",
      left: "0",
      right: "0",
      display: "flex",
      "flex-direction": "column",
    };
    const uiRootStyleProperties = {
      position: "absolute",
      top: "0",
      bottom: "0",
      left: "0",
      right: "0",
      "font-family": "Courier Prime Sans",
      "font-size": "1em",
    };
    uiRootEl.updateStyle(uiRootStyleProperties);
    const targetAllStructs = !structNames || structNames.length === 0;
    const validStructNames = targetAllStructs
      ? Object.keys(valueMap?.["ui"] || {})
      : structNames;
    validStructNames.forEach((structName) => {
      if (structName && !this._config.baseClassNames.includes(structName)) {
        const structObj = valueMap?.["ui"]?.[structName];
        if (structObj) {
          const properties = getAllProperties(structObj);
          const structEl = this.constructUI(structName, properties);
          structEl.updateStyle(rootStyleProperties);
          Object.entries(properties).forEach(([k, v]) => {
            const childPath = k.split(".").filter((f) => f);
            const fieldEl =
              this.getUIElement(structName, ...childPath) ||
              this.constructElement(
                "div",
                this.getUIPath(),
                structName,
                ...childPath
              );
            if (fieldEl && v && typeof v === "string") {
              fieldEl.updateText(v);
            }
          });
        }
      }
    });
  }

  protected getOrCreateStyleRoot(): IElement {
    const root = this._config.root;
    const path = this.getStylePath();
    const newEl = this.getElement(path) || this.createElement("div", ...path);
    if (!root.children.find((c) => c.id === newEl.id)) {
      root.appendChild(newEl);
    }
    return newEl;
  }

  protected getOrCreateUIRoot(): IElement {
    const root = this._config.root;
    const path = this.getUIPath();
    const newEl = this.getElement(path) || this.createElement("div", ...path);
    if (!root.children.find((c) => c.id === newEl.id)) {
      root.appendChild(newEl);
    }
    return newEl;
  }

  protected getStyleElement(
    structName: string,
    ...childPath: string[]
  ): IElement | undefined {
    return this.getElement(this.getStylePath(structName, ...childPath));
  }

  protected getUIElement(
    structName: string,
    ...childPath: string[]
  ): IElement | undefined {
    return this.getElement(this.getUIPath(structName, ...childPath));
  }

  protected constructElement(
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

  protected constructStyleElement(
    structName: string,
    fields?: unknown
  ): IElement | undefined {
    const styleName = "style-" + structName;
    const hash = getHash(fields).toString();
    const existingStructEl = this.getStyleElement(styleName);
    if (!existingStructEl) {
      const structEl = this.constructElement(
        "style",
        this.getStylePath(),
        styleName
      );
      structEl.updateAttributes({ hash });
      return structEl;
    }
    if (existingStructEl.getAttribute("hash") !== hash) {
      // Content of existing element has changed, needs update
      existingStructEl.clear();
      existingStructEl.updateAttributes({ hash });
      return existingStructEl;
    }
    // Content of existing element is the same, no need to construct
    return undefined;
  }

  protected constructUI(
    structName: string,
    fields: Record<string, unknown>
  ): IElement {
    const hash = getHash(fields).toString();
    const existingStructEl = this.getUIElement(structName);
    if (existingStructEl && existingStructEl.getAttribute("hash") !== hash) {
      existingStructEl.clear();
    }
    const structEl =
      existingStructEl ||
      this.constructElement("div", this.getUIPath(), structName);
    if (structEl.getAttribute("hash") !== hash) {
      structEl.updateAttributes({ hash });
    }
    if (!existingStructEl) {
      structEl.updateAttributes({ hidden: "" });
    }
    return structEl;
  }

  protected createElement(type: string, ...path: string[]): IElement {
    const id = this.getId(...path);
    const name = path.at(-1) || "";
    return this._config.createElement(type, id, name);
  }

  hideUI(...structNames: string[]): void {
    structNames.forEach((structName) => {
      if (structName) {
        const structEl = this.getUIElement(structName);
        if (structEl) {
          structEl.updateAttributes({ hidden: "" });
        }
      }
    });
  }

  showUI(...structNames: string[]): void {
    structNames.forEach((structName) => {
      if (structName) {
        const structEl = this.getUIElement(structName);
        if (structEl) {
          structEl.updateAttributes({ hidden: null });
        }
      }
    });
  }

  protected findElement(uiName: string, target?: string): IElement | undefined {
    const parent = this.getElement(this.getUIPath(uiName));
    if (!target) {
      return parent;
    }
    if (parent) {
      return this.searchForFirst(parent, target);
    }
    return undefined;
  }

  protected searchForFirst(
    parent: IElement,
    name: string
  ): IElement | undefined {
    if (parent.name === name) {
      return parent;
    }
    const child = parent.findChild(name);
    if (child) {
      return child;
    }
    for (let i = 0; i < parent.children.length; i += 1) {
      const child = parent.children[i];
      if (child) {
        const found = this.searchForFirst(child, name);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  protected findElements(uiName: string, target: string): IElement[] {
    if (!uiName) {
      return [this._config.root];
    }
    const found: IElement[] = [];
    const parent = this.getElement(this.getUIPath(uiName));
    if (parent) {
      this.searchForAll(parent, target, found);
    }
    return found;
  }

  protected searchForAll(
    parent: IElement,
    name: string,
    found: IElement[]
  ): IElement[] {
    if (parent) {
      const matchingChildren = parent.findChildren(name);
      found.push(...matchingChildren);
      for (let i = 0; i < parent.children.length; i += 1) {
        const child = parent.children[i];
        if (child) {
          this.searchForAll(child, name, found);
        }
      }
    }
    return found;
  }

  protected appendChildElement(
    parent: IElement,
    state: ElementState
  ): IElement | undefined {
    if (parent) {
      const type = state.type || "div";
      const name = state?.name || uuid();
      const id = this.getId(...this.getPath(parent.id), name);
      const newEl = this._config.createElement(type, id, name);
      const appendedChild = parent.appendChild(newEl);
      appendedChild.update(state);
      return appendedChild;
    }
    return undefined;
  }

  protected getStateKey(uiName: string, target: string): string {
    if (target) {
      return `${uiName}@${target}`;
    }
    return uiName;
  }

  protected getOrCreateContentElement(
    element: IElement,
    name: "image" | "text"
  ): IElement | undefined {
    const contentChild = element.findChild(name);
    if (contentChild) {
      return contentChild;
    }
    return this.appendChildElement(element, { name, type: "div" });
  }

  findIds(uiName: string, target: string): string[] {
    return this.findElements(uiName, target).map((c) => c.id);
  }

  getTransitionStyle(
    event: TextEvent | ImageEvent,
    instant: boolean
  ): Record<string, string | null> {
    const style: Record<string, string | null> = {};
    style["will-change"] = "opacity";
    if (instant) {
      style["opacity"] = "1";
      style["transition-property"] = "none";
      if (event.exit) {
        style["filter"] = "opacity(0)";
      }
    } else {
      style["opacity"] = !event.enter ? "1" : "0";
      style["transition-property"] = "opacity";
      style["transition-delay"] = `${event.enter ?? 0}s`;
      style["transition-timing-function"] = `linear`;
      if (event.exit) {
        style["position"] = "absolute";
        style["inset"] = "0";
        style["will-change"] += `, filter`;
        style["filter"] = "opacity(1)";
        style["transition-property"] += `, filter`;
        style["transition-delay"] += `, ${event.exit ?? 0}s`;
      }
    }
    return style;
  }

  // PUBLIC SETTER METHODS

  setOnClick(
    uiName: string,
    target: string,
    onclick: ((this: any, ev: any) => any) | null
  ): boolean {
    const targetEls = this.findElements(uiName, target);
    targetEls.forEach((targetEl) => {
      targetEl.onclick = onclick;
      targetEl.updateStyle({ "pointer-events": "auto" });
    });
    return targetEls.length > 0;
  }

  setOnPointerDown(
    uiName: string,
    target: string,
    onpointerdown: ((this: any, ev: any) => any) | null
  ): boolean {
    const targetEls = this.findElements(uiName, target);
    targetEls.forEach((targetEl) => {
      targetEl.onpointerup = onpointerdown;
      targetEl.updateStyle({ "pointer-events": "auto" });
    });
    return targetEls.length > 0;
  }

  setOnPointerUp(
    uiName: string,
    target: string,
    onpointerup: ((this: any, ev: any) => any) | null
  ): boolean {
    const targetEls = this.findElements(uiName, target);
    targetEls.forEach((targetEl) => {
      targetEl.onpointerup = onpointerup;
      targetEl.updateStyle({ "pointer-events": "auto" });
    });
    return targetEls.length > 0;
  }

  Instance = (($) => {
    class Instance {
      protected saveState(
        uiName: string,
        target: string,
        instanceNumber: number
      ) {
        const key = $.getStateKey(uiName, target);
        const validInstanceNumber = Math.max(1, instanceNumber);
        const instanceCount = $._state.instance[key] ?? 0;
        if (validInstanceNumber > instanceCount) {
          $._state.instance[key] = validInstanceNumber;
        }
      }

      get(
        uiName: string,
        target: string,
        instanceNumber: number
      ): string | undefined {
        // Save state
        this.saveState(uiName, target, instanceNumber);
        // Update ui
        const targetEls = $.findElements(uiName, target);
        const existingEl = targetEls[instanceNumber];
        if (existingEl) {
          return existingEl.name;
        }
        const firstEl = targetEls.at(0);
        if (firstEl) {
          const parentEl = $.getParentElement(firstEl);
          if (parentEl) {
            for (let i = 0; i < instanceNumber + 1; i += 1) {
              const el = targetEls?.[i] || parentEl.cloneChild(0);
              if (el) {
                if (instanceNumber === i) {
                  return el.name;
                }
              }
            }
          }
        }
        return undefined;
      }
    }
    return Instance;
  })(this);

  Text = (($) => {
    class Text {
      protected saveState(
        uiName: string,
        target: string,
        sequence: TextEvent[] | null
      ) {
        const key = $.getStateKey(uiName, target);
        if (sequence) {
          const textState = $._state.text[key] ?? [];
          sequence.forEach((e) => {
            if (!e.exit) {
              const prev = textState.at(-1);
              if (
                prev &&
                JSON.stringify(prev.params || {}) ===
                  JSON.stringify(e.params || {})
              ) {
                prev.text = (prev.text ?? "") + e.text;
              } else {
                const s: TextState = { text: e.text };
                if (e.params) {
                  s.params = e.params;
                }
                textState.push(s);
              }
            }
          });
          $._state.text[key] = textState;
        } else {
          delete $._state.text[key];
        }
      }

      protected applyChanges(
        uiName: string,
        target: string,
        sequence: TextEvent[] | null,
        instant: boolean
      ): () => void {
        const inElements: IElement[] = [];
        const outElements: IElement[] = [];
        const enterAt = sequence?.[0]?.enter ?? 0;
        $.findElements(uiName, target).forEach((targetEl) => {
          if (targetEl) {
            if (enterAt > 0) {
              targetEl.updateStyle({
                opacity: "0",
                transition: instant ? "none" : `opacity 0s linear ${enterAt}s`,
              });
              inElements.push(targetEl);
            }
            const contentEl = $.getOrCreateContentElement(targetEl, "text");
            if (contentEl) {
              if (sequence) {
                let blockEl: IElement | undefined = undefined;
                sequence.forEach((e) => {
                  const textAlign = e.params?.["text-align"];
                  if (textAlign) {
                    // text-align must be applied to a parent element
                    if (blockEl?.style["text-align"] !== textAlign) {
                      // Group consecutive spans that have the same text-alignment under the same block wrapper
                      const wrapperStyle: Record<string, string | null> = {};
                      wrapperStyle["display"] = "block";
                      wrapperStyle["text-align"] = textAlign;
                      blockEl = $.appendChildElement(contentEl, {
                        type: "div",
                        style: wrapperStyle,
                      });
                    }
                  } else {
                    blockEl = undefined;
                  }
                  const parentEl = blockEl || contentEl;
                  const name = parentEl.children.length.toString();
                  const text = e.text;
                  const style = { ...(e.params || {}) };
                  const transitionStyle = $.getTransitionStyle(e, instant);
                  const childEl = $.appendChildElement(parentEl, {
                    name,
                    type: "span",
                    text,
                    style: { ...style, ...transitionStyle },
                  });
                  if (childEl) {
                    inElements.push(childEl);
                    if (e.exit) {
                      outElements.push(childEl);
                    }
                  }
                });
              } else {
                contentEl.clear();
              }
            }
          }
        });
        return () => {
          // Transition in elements
          inElements.forEach((el) => {
            el.updateStyle({ opacity: "1" });
          });
          // Transition out elements
          outElements.forEach((el) => {
            el.updateStyle({ filter: "opacity(0)" });
          });
        };
      }

      clear(uiName: string, target: string): void {
        this.saveState(uiName, target, null);
        this.applyChanges(uiName, target, null, true);
      }

      write(
        uiName: string,
        target: string,
        sequence: TextEvent[],
        instant = false
      ): () => void {
        this.saveState(uiName, target, sequence);
        return this.applyChanges(uiName, target, sequence, instant);
      }

      set(uiName: string, target: string, text: string): void {
        this.clear(uiName, target);
        const triggerTransition = this.write(uiName, target, [{ text }], true);
        triggerTransition();
      }

      getTargets(uiName: string): string[] {
        const targets: string[] = [];
        $.findElements(uiName, "text").forEach((textEl) => {
          const parent = $.getParentElement(textEl);
          if (parent) {
            targets.push(parent.name);
          }
        });
        return targets;
      }
    }
    return Text;
  })(this);

  Image = (($) => {
    class Image {
      protected saveState(
        uiName: string,
        target: string,
        sequence: ImageEvent[] | null
      ) {
        const key = $.getStateKey(uiName, target);
        if (sequence) {
          const imageState = $._state.image[key] ?? [];
          sequence.forEach((e) => {
            if (!e.exit) {
              const prev = imageState.at(-1);
              if (
                prev &&
                JSON.stringify(prev.params || {}) ===
                  JSON.stringify(e.params || {})
              ) {
                prev.image = e.image;
              } else {
                const s: ImageState = { image: e.image };
                if (e.params) {
                  s.params = e.params;
                }
                imageState.push(s);
              }
            }
          });
          $._state.image[key] = imageState;
        } else {
          delete $._state.image[key];
        }
      }

      protected applyChanges(
        uiName: string,
        target: string,
        sequence: ImageEvent[] | null,
        instant: boolean
      ): () => void {
        const inElements: IElement[] = [];
        const outElements: IElement[] = [];
        const enterAt = sequence?.[0]?.enter ?? 0;
        $.findElements(uiName, target).forEach((targetEl) => {
          if (targetEl) {
            const contentEl = $.getOrCreateContentElement(targetEl, "image");
            if (contentEl) {
              if (enterAt > 0) {
                targetEl.updateStyle({
                  opacity: "0",
                  transition: instant
                    ? "none"
                    : `opacity 0s linear ${enterAt}s`,
                });
                inElements.push(targetEl);
              }
              if (sequence) {
                sequence.forEach((e) => {
                  const parentEl = contentEl;
                  const name = parentEl.children.length.toString();
                  const style = { ...(e.params || {}) };
                  if (e.image) {
                    const combinedBackgroundImage = e.image
                      .map((n) => $.getImageVar(n))
                      .join(", ");
                    style["background-image"] = combinedBackgroundImage;
                  }
                  const transitionStyle = $.getTransitionStyle(e, instant);
                  const childEl = $.appendChildElement(parentEl, {
                    name,
                    type: "span",
                    style: { ...style, ...transitionStyle },
                  });
                  if (childEl) {
                    inElements.push(childEl);
                    if (e.exit) {
                      outElements.push(childEl);
                    }
                  }
                });
              } else {
                contentEl.clear();
              }
            }
          }
        });
        return () => {
          // Transition in elements
          inElements.forEach((el) => {
            el.updateStyle({ opacity: "1" });
          });
          // Transition out elements
          outElements.forEach((el) => {
            el.updateStyle({ filter: "opacity(0)" });
          });
        };
      }

      clear(uiName: string, target: string): void {
        this.saveState(uiName, target, null);
        this.applyChanges(uiName, target, null, true);
      }

      write(
        uiName: string,
        target: string,
        sequence: ImageEvent[],
        instant = false
      ): () => void {
        this.saveState(uiName, target, sequence);
        return this.applyChanges(uiName, target, sequence, instant);
      }

      getTargets(uiName: string): string[] {
        const targets: string[] = [];
        $.findElements(uiName, "image").forEach((textEl) => {
          const parent = $.getParentElement(textEl);
          if (parent) {
            targets.push(parent.name);
          }
        });
        return targets;
      }
    }
    return Image;
  })(this);

  Style = (($) => {
    class Style {
      protected saveState(
        uiName: string,
        target: string,
        style: Record<string, string | null> | null
      ) {
        const key = $.getStateKey(uiName, target);
        if (style) {
          const styleState = $._state.style[key] ?? {};
          $._state.style[key] = styleState;
          Object.entries(style).forEach(([k, v]) => {
            if (v) {
              styleState[k] = v;
            } else {
              delete styleState[k];
            }
          });
          if (Object.entries(styleState).length === 0) {
            delete $._state.style[key];
          }
        } else {
          delete $._state.style[key];
        }
      }

      protected applyChanges(
        uiName: string,
        target: string,
        style: Record<string, string | null> | null
      ): void {
        $.findElements(uiName, target).forEach((targetEl) => {
          if (targetEl) {
            targetEl.updateStyle(style);
          }
        });
      }

      update(
        uiName: string,
        target: string,
        style: Record<string, string | null> | null
      ): void {
        this.saveState(uiName, target, style);
        this.applyChanges(uiName, target, style);
      }
    }
    return Style;
  })(this);

  Attributes = (($) => {
    class Attributes {
      protected saveState(
        uiName: string,
        target: string,
        attributes: Record<string, string | null> | null
      ) {
        const key = $.getStateKey(uiName, target);
        if (attributes) {
          const attributesState = $._state.attributes[key] ?? {};
          $._state.attributes[key] = attributesState;
          Object.entries(attributes).forEach(([k, v]) => {
            if (v) {
              attributesState[k] = v;
            } else {
              delete attributesState[k];
            }
          });
          if (Object.entries(attributesState).length === 0) {
            delete $._state.attributes[key];
          }
        } else {
          delete $._state.attributes[key];
        }
      }

      applyChanges(
        uiName: string,
        target: string,
        attributes: Record<string, string | null> | null
      ): void {
        $.findElements(uiName, target).forEach((targetEl) => {
          if (targetEl) {
            targetEl.updateAttributes(attributes);
          }
        });
      }

      update(
        uiName: string,
        target: string,
        attributes: Record<string, string | null> | null
      ): void {
        this.saveState(uiName, target, attributes);
        this.applyChanges(uiName, target, attributes);
      }
    }
    return Attributes;
  })(this);

  instance = new this.Instance();

  text = new this.Text();

  image = new this.Image();

  style = new this.Style();

  attributes = new this.Attributes();
}
