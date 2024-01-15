import { GameEvent1 } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { ManagerUpdate } from "../../core/classes/ManagerUpdate";
import { GameContext } from "../../core/types/GameContext";
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
  instance?: Record<string, Record<string, number>>;
  text?: Record<string, Record<string, TextState[]>>;
  image?: Record<string, Record<string, ImageState[]>>;
  style?: Record<string, Record<string, Record<string, string | null>>>;
  attributes?: Record<string, Record<string, Record<string, string | null>>>;
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

  protected _firstUpdate = true;

  constructor(
    context: GameContext,
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
    super(context, initialEvents, initialConfig, state || {});
    this.loadTheme();
    this.loadStyles();
    this.loadUI();
    if (this._state.instance) {
      Object.entries(this._state.instance).forEach(([uiName, targets]) => {
        Object.entries(targets).forEach(([target]) => {
          this.instance.restore(uiName, target);
        });
      });
    }
    if (this._state.text) {
      Object.entries(this._state.text).forEach(([uiName, targets]) => {
        Object.entries(targets).forEach(([target]) => {
          this.text.restore(uiName, target);
        });
      });
    }
    if (this._state.image) {
      Object.entries(this._state.image).forEach(([uiName, targets]) => {
        Object.entries(targets).forEach(([target]) => {
          this.image.restore(uiName, target);
        });
      });
    }
    if (this._state.style) {
      Object.entries(this._state.style).forEach(([uiName, targets]) => {
        Object.entries(targets).forEach(([target]) => {
          this.style.restore(uiName, target);
        });
      });
    }
    if (this._state.attributes) {
      Object.entries(this._state.attributes).forEach(([uiName, targets]) => {
        Object.entries(targets).forEach(([target]) => {
          this.attributes.restore(uiName, target);
        });
      });
    }
  }

  override onUpdate(deltaMS: number) {
    if (this._firstUpdate) {
      this._firstUpdate = false;
      this.reveal();
    }
    return super.onUpdate(deltaMS);
  }

  override onPreview(checkpointId: string) {
    this.reveal();
    return super.onPreview(checkpointId);
  }

  override onDestroy(): void {
    super.onDestroy();
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

  protected reveal() {
    const uiRoot = this.getElement(this.getUIPath());
    uiRoot?.updateStyle({ opacity: "1" });
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

  loadTheme(): void {
    const images = this._context?.["image"];
    if (images) {
      Object.entries(images).forEach(([name, image]) => {
        if (
          image &&
          typeof image === "object" &&
          "src" in image &&
          typeof image.src === "string"
        ) {
          this._config.root.updateStyle({
            [this.getImageVarName(name)]: this.getImageVarValue(image.src),
          });
        }
      });
    }
    const breakpoints = this._context?.["breakpoint"] || DEFAULT_BREAKPOINTS;
    if (breakpoints) {
      this._disposeSizeObservers.push(
        this._config.root.observeSize(breakpoints)
      );
    }
  }

  loadStyles(): void {
    // Get or create style root
    const styleRootEl = this.getOrCreateStyleRoot();
    if (!styleRootEl) {
      return;
    }
    // Process Imports
    const cssStructObj = this._context?.["css"];
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
      ...Object.keys(this._context?.["animation"] || {}),
      ...Object.keys(this._context?.["style"] || {}),
    ];
    validStructNames.forEach((structName) => {
      if (structName) {
        const styleStructObj = this._context?.["style"]?.[structName];
        if (styleStructObj) {
          const structEl = this.constructStyleElement(
            structName,
            styleStructObj
          );
          if (structEl) {
            const properties = getAllProperties(styleStructObj, isAssetLeaf);
            const breakpoints =
              this._context?.["breakpoint"] || DEFAULT_BREAKPOINTS;
            structEl.setStyleContent(structName, properties, breakpoints);
          }
        }
        const animationStructObj = this._context?.["animation"]?.[structName];
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

  loadUI(...structNames: string[]): void {
    const uiRootEl = this.getOrCreateUIRoot();
    if (!uiRootEl) {
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
      opacity: "0",
    };
    uiRootEl.updateStyle(uiRootStyleProperties);
    const targetAllStructs = !structNames || structNames.length === 0;
    const validStructNames = targetAllStructs
      ? Object.keys(this._context?.["ui"] || {})
      : structNames;
    validStructNames.forEach((structName) => {
      if (structName && !this._config.baseClassNames.includes(structName)) {
        const structObj = this._context?.["ui"]?.[structName];
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
        $._state.instance ??= {};
        $._state.instance[uiName] ??= {};
        $._state.instance[uiName]![target] ??= 0;
        const validInstanceNumber = Math.max(1, instanceNumber);
        const instanceCount = $._state.instance[uiName]![target] ?? 0;
        if (validInstanceNumber > instanceCount) {
          $._state.instance[uiName]![target] = validInstanceNumber;
        }
      }

      restore(uiName: string, target: string) {
        const state = $._state.instance?.[uiName]?.[target];
        if (state) {
          this.get(uiName, target, state);
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
        $._state.text ??= {};
        $._state.text[uiName] ??= {};
        $._state.text[uiName]![target] ??= [];
        const state = $._state.text[uiName]![target]!;
        if (sequence) {
          sequence.forEach((e) => {
            if (!e.exit) {
              const prev = state.at(-1);
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
                state.push(s);
              }
            }
          });
        } else {
          state.length = 0;
        }
      }

      restore(uiName: string, target: string) {
        const state = $._state.text?.[uiName]?.[target];
        if (state) {
          this.applyChanges(uiName, target, state, true);
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
        if ($._context?.game?.previewing || !$._context?.game?.simulating) {
          this.applyChanges(uiName, target, null, true);
        }
      }

      write(
        uiName: string,
        target: string,
        sequence: TextEvent[],
        instant = false
      ): () => void {
        this.saveState(uiName, target, sequence);
        if ($._context?.game?.previewing || !$._context?.game?.simulating) {
          return this.applyChanges(uiName, target, sequence, instant);
        }
        return () => null;
      }

      set(uiName: string, target: string, text: string): void {
        this.clear(uiName, target);
        const triggerTransition = this.write(uiName, target, [{ text }], true);
        triggerTransition();
      }

      getTargets(uiName: string): string[] {
        const targets = new Set<string>();
        if ($._state.text?.[uiName]) {
          Object.entries($._state.text[uiName]!).forEach(([target]) => {
            targets.add(target);
          });
        }
        $.findElements(uiName, "text").forEach((textEl) => {
          const parent = $.getParentElement(textEl);
          if (parent) {
            targets.add(parent.name);
          }
        });
        return Array.from(targets);
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
        $._state.image ??= {};
        $._state.image[uiName] ??= {};
        $._state.image[uiName]![target] ??= [];
        const state = $._state.image[uiName]![target]!;
        if (sequence) {
          sequence.forEach((e) => {
            if (!e.exit) {
              const prev = state.at(-1);
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
                state.push(s);
              }
            }
          });
        } else {
          state.length = 0;
        }
      }

      restore(uiName: string, target: string) {
        const state = $._state.image?.[uiName]?.[target];
        if (state) {
          this.applyChanges(uiName, target, state, true);
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
        if ($._context?.game?.previewing || !$._context?.game?.simulating) {
          this.applyChanges(uiName, target, null, true);
        }
      }

      write(
        uiName: string,
        target: string,
        sequence: ImageEvent[],
        instant = false
      ): () => void {
        this.saveState(uiName, target, sequence);
        if ($._context?.game?.previewing || !$._context?.game?.simulating) {
          return this.applyChanges(uiName, target, sequence, instant);
        }
        return () => null;
      }

      getTargets(uiName: string): string[] {
        const targets = new Set<string>();
        if ($._state.image?.[uiName]) {
          Object.entries($._state.image[uiName]!).forEach(([target]) => {
            targets.add(target);
          });
        }
        $.findElements(uiName, "image").forEach((imageEl) => {
          const parent = $.getParentElement(imageEl);
          if (parent) {
            targets.add(parent.name);
          }
        });
        return Array.from(targets);
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
        $._state.style ??= {};
        $._state.style[uiName] ??= {};
        $._state.style[uiName]![target] ??= {};
        const state = $._state.style[uiName]![target]!;
        if (style) {
          Object.entries(style).forEach(([k, v]) => {
            if (v) {
              state[k] = v;
            } else {
              delete state[k];
            }
          });
        } else {
          $._state.style[uiName]![target] = {};
        }
      }

      restore(uiName: string, target: string) {
        const state = $._state.style?.[uiName]?.[target];
        if (state) {
          this.applyChanges(uiName, target, state);
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
        if ($._context?.game?.previewing || !$._context?.game?.simulating) {
          this.applyChanges(uiName, target, style);
        }
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
        $._state.attributes ??= {};
        $._state.attributes[uiName] ??= {};
        $._state.attributes[uiName]![target] ??= {};
        const state = $._state.attributes[uiName]![target]!;
        if (attributes) {
          Object.entries(attributes).forEach(([k, v]) => {
            if (v) {
              state[k] = v;
            } else {
              delete state[k];
            }
          });
        } else {
          $._state.attributes[uiName]![target] = {};
        }
      }

      restore(uiName: string, target: string) {
        const state = $._state.attributes?.[uiName]?.[target];
        if (state) {
          this.applyChanges(uiName, target, state);
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
        if ($._context?.game?.previewing || !$._context?.game?.simulating) {
          this.applyChanges(uiName, target, attributes);
        }
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
