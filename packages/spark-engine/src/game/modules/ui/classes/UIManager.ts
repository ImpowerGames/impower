import { Connection } from "../../../core/classes/Connection";
import { Manager } from "../../../core/classes/Manager";
import { EventMessage } from "../../../core/classes/messages/EventMessage";
import { Event } from "../../../core/types/Event";
import { EventMap } from "../../../core/types/EventMap";
import { GameContext } from "../../../core/types/GameContext";
import { NotificationMessage } from "../../../core/types/NotificationMessage";
import { ImageEvent, TextEvent } from "../../../core/types/SequenceEvent";
import { getAllProperties } from "../../../core/utils/getAllProperties";
import { Element } from "../classes/Element";
import { ElementContent } from "../types/ElementContent";
import { ElementState } from "../types/ElementState";
import { ImageState } from "../types/ImageState";
import { TextState } from "../types/TextState";
import { CloneElementMessage } from "./messages/CloneElementMessage";
import { CreateElementMessage } from "./messages/CreateElementMessage";
import { DestroyElementMessage } from "./messages/DestroyElementMessage";
import { ObserveElementMessage } from "./messages/ObserveElementMessage";
import { SetThemeMessage } from "./messages/SetThemeMessage";
import { UnobserveElementMessage } from "./messages/UnobserveElementMessage";
import { UpdateElementMessage } from "./messages/UpdateElementMessage";

const DEFAULT_UI_CLASS_NAME = "game-ui";
const DEFAULT_STYLE_CLASS_NAME = "game-style";
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

const NOP = () => null;

export interface UIConfig {
  ignore?: string[];
  style_element_name?: string;
  ui_element_name?: string;
}

export interface UIState {
  instance?: Record<string, Record<string, number>>;
  text?: Record<string, Record<string, TextState[]>>;
  image?: Record<string, Record<string, ImageState[]>>;
  style?: Record<string, Record<string, Record<string, string | null>>>;
  attributes?: Record<string, Record<string, Record<string, string | null>>>;
}

export class UIManager extends Manager<UIState> {
  protected _firstUpdate = true;

  protected _config: Required<UIConfig>;

  protected _root?: Element;

  protected _events: Partial<
    Record<string, Record<string, (event: Event) => void>>
  > = {};

  constructor(context: GameContext, connection: Connection) {
    super(context, connection);
    this._config = {
      ignore: DEFAULT_BASE_CLASS_NAMES,
      style_element_name: DEFAULT_STYLE_CLASS_NAME,
      ui_element_name: DEFAULT_UI_CLASS_NAME,
      ...(context?.config?.["ui"] || {}),
    };
  }

  override async onInit() {
    this._root = this.getOrCreateRootElement();
    this.loadStyles();
    this.loadUI();
    this.loadTheme();
  }

  override async onRestore() {
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
    if (this._root) {
      this.destroyElement(this._root);
    }
  }

  protected generateId() {
    // Id must start with a letter
    return "e-" + this._context.system.uuid();
  }

  protected createElement(
    parent: Element | null,
    state?: ElementState
  ): Element {
    const id = this.generateId();
    const index = parent?.children?.length ?? 0;
    const name = state?.name || "";
    const type = state?.type || "div";
    const content = state?.content;
    const style = state?.style;
    const attributes = state?.attributes;
    const el = new Element(parent, id, type, name);
    const isRootElement = !parent;
    if (isRootElement) {
      this._root = el;
    }
    this.emit(
      CreateElementMessage.type.request({
        parent: parent?.id ?? null,
        id,
        type,
        name,
        index,
        content,
        style,
        attributes,
      })
    );
    return el;
  }

  protected destroyElement(element: Element) {
    const isRootElement = !element.parent;
    if (isRootElement) {
      this._root = undefined;
    }
    element.remove();
    this.emit(
      DestroyElementMessage.type.request({
        id: element.id,
      })
    );
  }

  protected clearElement(element: Element) {
    this.updateElement(element, { content: { text: "" } });
    element.children.forEach((child) => {
      this.destroyElement(child);
    });
  }

  protected updateElement(element: Element, state?: ElementState): void {
    const content = state?.content;
    const style = state?.style;
    const attributes = state?.attributes;
    this.emit(
      UpdateElementMessage.type.request({
        id: element.id,
        content,
        style,
        attributes,
      })
    );
  }

  protected _duplicateElement(element: Element): Element | undefined {
    const id = this.generateId();
    const type = element.type;
    const name = element.name;
    const el = new Element(element.parent, id, type, name);
    element.children.forEach((child) => {
      this._duplicateElement(child);
    });
    return el;
  }

  protected duplicateElement(
    element: Element | undefined
  ): Element | undefined {
    if (!element) {
      return undefined;
    }
    const clonedEl = this._duplicateElement(element);
    if (clonedEl) {
      this.emit(
        CloneElementMessage.type.request({
          targetId: element.id,
          newId: clonedEl.id,
        })
      );
      return clonedEl;
    }
    return undefined;
  }

  protected conceal() {
    const target = this._config.ui_element_name;
    const uiRoot = this._root?.findChild(target);
    if (uiRoot) {
      this.updateElement(uiRoot, { style: { opacity: "0" } });
    }
  }

  protected reveal() {
    const target = this._config.ui_element_name;
    const uiRoot = this._root?.findChild(target);
    if (uiRoot) {
      this.updateElement(uiRoot, { style: { opacity: "1" } });
    }
  }

  getImageVarName(name: string) {
    return `--image_${name}`;
  }

  getImageVarValue(src: string) {
    return `url("${src}")`;
  }

  getImageVar(name: string) {
    return `var(${this.getImageVarName(name)})`;
  }

  getOrCreateRootElement(): Element {
    if (this._root) {
      return this._root;
    }
    const style: Record<string, string> = {
      position: "absolute",
      inset: "0",
    };
    const images = this._context?.["image"];
    if (images) {
      Object.entries(images).forEach(([name, image]) => {
        if (
          image &&
          typeof image === "object" &&
          "src" in image &&
          typeof image.src === "string"
        ) {
          style[this.getImageVarName(name)] = this.getImageVarValue(image.src);
        }
      });
    }
    const imageGroups = this._context?.["image_group"];
    if (imageGroups) {
      Object.entries(imageGroups).forEach(([name, imageGroup]) => {
        if (
          imageGroup &&
          typeof imageGroup === "object" &&
          "src" in imageGroup &&
          typeof imageGroup.src === "string"
        ) {
          style[this.getImageVarName(name)] = this.getImageVarValue(
            imageGroup.src
          );
        }
      });
    }
    return this.createElement(null, { style });
  }

  protected getOrCreateRootStyleElement(): Element {
    if (!this._root) {
      this._root = this.getOrCreateRootElement();
    }
    const target = this._config.style_element_name;
    return (
      this._root.findChild(target) ||
      this.createElement(this._root, {
        name: target,
      })
    );
  }

  protected getOrCreateRootUIElement(): Element {
    const style = {
      position: "absolute",
      inset: "0",
      font_family: "Courier Prime Sans",
      font_size: "1em",
      opacity: "0",
    };
    if (!this._root) {
      this._root = this.getOrCreateRootElement();
    }
    const target = this._config.ui_element_name;
    return (
      this._root.findChild(target) ||
      this.createElement(this._root, {
        name: target,
        style,
      })
    );
  }

  protected getUIElement(uiName: string): Element | undefined {
    const rootUIElement = this.getOrCreateRootUIElement();
    return rootUIElement.findChild(uiName);
  }

  protected constructStyleElement(
    structName: string,
    content: ElementContent
  ): Element | undefined {
    const parent = this.getOrCreateRootStyleElement();
    return this.createElement(parent, {
      type: "style",
      name: "style-" + structName,
      content,
    });
  }

  protected constructUI(
    structName: string,
    properties: Record<string, any>
  ): Element {
    const parent = this.getOrCreateRootUIElement();
    const uiEl = this.createElement(parent, {
      type: "div",
      name: structName,
      style: {
        position: "absolute",
        inset: "0",
        display: "flex",
        flex_direction: "column",
      },
    });
    Object.entries(properties).forEach(([k, v]) => {
      const path = k.startsWith(".") ? k.split(".").slice(1) : k.split(".");
      const isValidNode = !path.at(-1)?.startsWith("$");
      if (isValidNode) {
        let cursor: Element = uiEl;
        for (let i = 0; i < path.length; i += 1) {
          const part = path[i]!;
          const child = cursor.findChild(part);
          if (child) {
            cursor = child;
          } else {
            const isLast = i === path.length - 1;
            const text = isLast && v && typeof v === "string" ? v : undefined;
            cursor = this.createElement(cursor, {
              type: "div",
              name: part,
              content: text ? { text } : undefined,
            });
          }
        }
      }
    });
    return uiEl;
  }

  loadStyles(): void {
    // Process Imports
    const cssStructObj = this._context?.["css"];
    if (cssStructObj) {
      const properties = getAllProperties(cssStructObj);
      this.constructStyleElement("import", {
        import: properties,
      });
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
          const properties = getAllProperties(styleStructObj, isAssetLeaf);
          properties[".target"] ??= structName;
          this.constructStyleElement(structName, {
            style: properties,
          });
        }
        const animationStructObj = this._context?.["animation"]?.[structName];
        if (animationStructObj) {
          const properties = getAllProperties(animationStructObj);
          properties[".target"] ??= structName;
          this.constructStyleElement(structName, {
            animation: properties,
          });
        }
      }
    });
  }

  loadUI(...structNames: string[]): void {
    const targetAllStructs = !structNames || structNames.length === 0;
    const validStructNames = targetAllStructs
      ? Object.keys(this._context?.["ui"] || {})
      : structNames;
    validStructNames.forEach((structName) => {
      if (structName && !this._config.ignore.includes(structName)) {
        const structObj = this._context?.["ui"]?.[structName];
        if (structObj) {
          const properties = getAllProperties(structObj);
          this.constructUI(structName, properties);
        }
      }
    });
  }

  loadTheme(): void {
    const breakpoints = this._context?.["breakpoint"] || DEFAULT_BREAKPOINTS;
    if (breakpoints) {
      this.emit(
        SetThemeMessage.type.request({
          breakpoints,
        })
      );
    }
  }

  hideUI(...structNames: string[]): void {
    structNames.forEach((structName) => {
      if (structName) {
        const structEl = this.getUIElement(structName);
        if (structEl) {
          this.updateElement(structEl, { attributes: { hidden: "" } });
        }
      }
    });
  }

  showUI(...structNames: string[]): void {
    structNames.forEach((structName) => {
      if (structName) {
        const structEl = this.getUIElement(structName);
        if (structEl) {
          this.updateElement(structEl, { attributes: { hidden: null } });
        }
      }
    });
  }

  protected findElements(uiName: string, target: string): Element[] {
    if (!uiName && this._root) {
      return [this._root];
    }
    const found: Element[] = [];
    const uiElement = this.getUIElement(uiName);
    if (uiElement) {
      this.searchForAll(uiElement, target, found);
    }
    return found;
  }

  protected searchForAll(
    parent: Element,
    target: string,
    found: Element[]
  ): Element[] {
    if (parent) {
      const matchingChildren = parent.findChildren(target);
      found.push(...matchingChildren);
      for (let i = 0; i < parent.children.length; i += 1) {
        const child = parent.children[i];
        if (child) {
          this.searchForAll(child, target, found);
        }
      }
    }
    return found;
  }

  protected getOrCreateContentElement(
    element: Element,
    tag: "image" | "text"
  ): Element | undefined {
    const contentChild = element.findChild(tag);
    if (contentChild) {
      return contentChild;
    }
    return this.createElement(element, { name: tag, type: "div" });
  }

  findIds(uiName: string, target: string): string[] {
    return this.findElements(uiName, target).map((c) => c.id);
  }

  getImageAssetNames(assetNames: string[]) {
    const names: string[] = [];
    assetNames.forEach((assetName) => {
      if (assetName) {
        const value = (this._context?.["image_group"]?.[assetName] ||
          this._context?.["image"]?.[assetName] ||
          this._context?.["array"]?.[assetName]) as
          | { $name: string; src: string }
          | { assets: { $name: string; src: string }[] };
        const assets = Array.isArray(value) ? value : [value];
        assets.forEach((asset) => {
          if (asset) {
            names.push(asset.$name);
          }
        });
      }
    });
    return names;
  }

  getTransitionStyle(
    event: TextEvent | ImageEvent,
    instant: boolean
  ): Record<string, string | null> {
    const style: Record<string, string | null> = {};
    style["will_change"] = "opacity";
    if (instant) {
      style["opacity"] = "1";
      style["transition_property"] = "none";
      if (event.exit) {
        style["filter"] = "opacity(0)";
      }
    } else {
      style["opacity"] = event.after && event.after > 0 ? "0" : "1";
      style["transition_property"] = "opacity";
      style["transition_delay"] = `${event.after ?? 0}s`;
      style["transition_timing_function"] = `linear`;
      if (event.over) {
        style["transition_duration"] = `${event.over ?? 0}s`;
      }
      if (event.exit) {
        style["position"] = "absolute";
        style["inset"] = "0";
        style["will_change"] += `, filter`;
        style["filter"] = "opacity(1)";
        style["transition_property"] += `, filter`;
        style["transition_delay"] += `, ${event.exit ?? 0}s`;
      }
    }
    return style;
  }

  protected setEventListener<T extends keyof EventMap>(
    event: T,
    uiName: string,
    target: string,
    callback: ((event: EventMap[T]) => any) | null,
    stopPropagation = true,
    once = false
  ): boolean {
    const targetEls = this.findElements(uiName, target);
    targetEls.forEach((targetEl) => {
      const style = { pointer_events: "auto" };
      this.updateElement(targetEl, { style });
      this.emit(
        UpdateElementMessage.type.request({
          id: targetEl.id,
          style,
        })
      );
      if (callback) {
        this.emit(
          ObserveElementMessage.type.request({
            id: targetEl.id,
            event,
            stopPropagation,
            once,
          })
        );
        this._events[event] ??= {};
        this._events[event]![targetEl.id] = callback as (event: Event) => any;
      } else {
        delete this._events[event]?.[targetEl.id];
        this.emit(
          UnobserveElementMessage.type.request({
            id: targetEl.id,
            event,
          })
        );
      }
    });
    return targetEls.length > 0;
  }

  observe<T extends keyof EventMap>(
    event: T,
    uiName: string,
    target: string,
    callback: (event: EventMap[T]) => any,
    stopPropagation = true,
    once = false
  ): boolean {
    return this.setEventListener(
      event,
      uiName,
      target,
      callback,
      stopPropagation,
      once
    );
  }

  unobserve<T extends keyof EventMap>(
    event: T,
    uiName: string,
    target: string
  ): boolean {
    return this.setEventListener(event, uiName, target, null);
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

      protected applyChanges(
        uiName: string,
        target: string,
        instanceNumber: number
      ): void {
        const targetEls = $.findElements(uiName, target);
        const existingEl = targetEls[instanceNumber];
        if (existingEl) {
          return;
        }
        const firstEl = targetEls.at(0);
        if (firstEl) {
          const parentEl = firstEl.parent;
          if (parentEl) {
            for (let i = 0; i < instanceNumber + 1; i += 1) {
              const el =
                targetEls?.[i] || $.duplicateElement(parentEl?.children?.[0]);
              if (el) {
                if (instanceNumber === i) {
                  return;
                }
              }
            }
          }
        }
        return undefined;
      }

      restore(uiName: string, target: string): void {
        const state = $._state.instance?.[uiName]?.[target];
        if (state) {
          this.get(uiName, target, state);
        }
      }

      get(uiName: string, target: string, instanceNumber: number): number {
        this.saveState(uiName, target, instanceNumber);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
          this.applyChanges(uiName, target, instanceNumber);
        }
        const id = $.nextTriggerId();
        // TODO: await for scene to process changes
        $.enableTrigger(id, NOP);
        return id;
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
                JSON.stringify(prev.style || {}) ===
                  JSON.stringify(e.style || {})
              ) {
                prev.text = (prev.text ?? "") + e.text;
              } else {
                const s: TextState = { text: e.text };
                if (e.style) {
                  s.style = e.style;
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
        const inElements: Element[] = [];
        const outElements: Element[] = [];
        const enterAt = sequence?.[0]?.after ?? 0;
        $.findElements(uiName, target).forEach((targetEl) => {
          if (targetEl) {
            const style: Record<string, string | null> = { display: null };
            if (enterAt > 0) {
              style["opacity"] = instant ? "1" : "0";
              style["transition"] = instant
                ? "none"
                : `opacity 0s linear ${enterAt}s`;
              inElements.push(targetEl);
            }
            $.updateElement(targetEl, { style });
            const contentEl = $.getOrCreateContentElement(targetEl, "text");
            if (contentEl) {
              if (sequence) {
                let blockWrapper:
                  | { element: Element; style: Record<string, string | null> }
                  | undefined = undefined;
                sequence.forEach((e) => {
                  const textAlign = e.style?.["text_align"];
                  if (textAlign) {
                    // text_align must be applied to a parent element
                    if (blockWrapper?.style["text_align"] !== textAlign) {
                      // Group consecutive spans that have the same text alignment under the same block wrapper
                      const wrapperStyle: Record<string, string | null> = {};
                      wrapperStyle["display"] = "block";
                      wrapperStyle["text_align"] = textAlign;
                      blockWrapper = {
                        element: $.createElement(contentEl, {
                          type: "div",
                          style: wrapperStyle,
                        }),
                        style: wrapperStyle,
                      };
                    }
                  } else {
                    blockWrapper = undefined;
                  }
                  const parentEl = blockWrapper?.element || contentEl;
                  const text = e.text;
                  const style = { ...(e.style || {}) };
                  const transitionStyle = $.getTransitionStyle(e, instant);
                  const childEl = $.createElement(parentEl, {
                    type: "span",
                    content: { text },
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
                $.clearElement(contentEl);
                $.updateElement(targetEl, { style: { display: "none" } });
              }
            }
          }
        });
        return () => {
          // Transition in elements
          inElements.forEach((el) => {
            $.updateElement(el, { style: { opacity: "1" } });
          });
          // Transition out elements
          outElements.forEach((el) => {
            $.updateElement(el, { style: { filter: "opacity(0)" } });
          });
        };
      }

      clear(uiName: string, target: string): void {
        this.saveState(uiName, target, null);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
          this.applyChanges(uiName, target, null, true);
        }
      }

      clearAll(uiName: string, ignore?: string[]): void {
        this.getTargets(uiName).forEach((target) => {
          if (!ignore || !ignore.includes(target)) {
            this.clear(uiName, target);
          }
        });
      }

      write(
        uiName: string,
        target: string,
        sequence: TextEvent[],
        instant = false
      ): number {
        this.saveState(uiName, target, sequence);
        const transition =
          $._context?.system?.previewing || !$._context?.system?.simulating
            ? this.applyChanges(uiName, target, sequence, instant)
            : NOP;
        const id = $.nextTriggerId();
        // TODO: await for scene to process changes
        $.enableTrigger(id, transition);
        return id;
      }

      set(uiName: string, target: string, text: string): void {
        this.clear(uiName, target);
        this.write(uiName, target, [{ text }], true);
      }

      getTargets(uiName: string): string[] {
        const targets = new Set<string>();
        if ($._state.text?.[uiName]) {
          Object.entries($._state.text[uiName]!).forEach(([target]) => {
            targets.add(target);
          });
        }
        $.findElements(uiName, "text").forEach((textEl) => {
          const parent = textEl.parent;
          if (parent) {
            const mainTag = parent.name;
            if (mainTag) {
              targets.add(mainTag);
            }
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
              if (prev) {
                prev.assets = e.assets;
              } else {
                const s: ImageState = { control: e.control, assets: e.assets };
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
        const inElements: Element[] = [];
        const outElements: Element[] = [];
        const enterAt = sequence?.[0]?.after ?? 0;
        $.findElements(uiName, target).forEach((targetEl) => {
          if (targetEl) {
            const contentEl = $.getOrCreateContentElement(targetEl, "image");
            if (contentEl) {
              const style: Record<string, string | null> = { display: null };
              if (enterAt > 0) {
                style["opacity"] = instant ? "1" : "0";
                style["transition"] = instant
                  ? "none"
                  : `opacity 0s linear ${enterAt}s`;
                inElements.push(targetEl);
              }
              $.updateElement(targetEl, { style });
              if (sequence) {
                sequence.forEach((e) => {
                  const parentEl = contentEl;
                  const style: Record<string, string | null> = {};
                  // TODO: Support e.control === "hide"
                  if (e.assets) {
                    const combinedBackgroundImage = $.getImageAssetNames(
                      e.assets
                    )
                      .map((n) => $.getImageVar(n))
                      .reverse()
                      .join(", ");
                    style["background_image"] = combinedBackgroundImage;
                  }
                  const transitionStyle = $.getTransitionStyle(e, instant);
                  const childEl = $.createElement(parentEl, {
                    type: "span",
                    style: {
                      ...style,
                      ...transitionStyle,
                    },
                  });
                  if (childEl) {
                    inElements.push(childEl);
                    if (e.exit) {
                      outElements.push(childEl);
                    }
                  }
                });
              } else {
                $.clearElement(contentEl);
                $.updateElement(targetEl, { style: { display: "none" } });
              }
            }
          }
        });
        if (instant) {
          return NOP;
        }
        return () => {
          // Transition in elements
          inElements.forEach((el) => {
            $.updateElement(el, { style: { opacity: "1" } });
          });
          // Transition out elements
          outElements.forEach((el) => {
            $.updateElement(el, { style: { filter: "opacity(0)" } });
          });
        };
      }

      clear(uiName: string, target: string): void {
        this.saveState(uiName, target, null);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
          this.applyChanges(uiName, target, null, true);
        }
      }

      clearAll(uiName: string, ignore?: string[]): void {
        this.getTargets(uiName).forEach((target) => {
          if (!ignore || !ignore.includes(target)) {
            this.clear(uiName, target);
          }
        });
      }

      write(
        uiName: string,
        target: string,
        sequence: ImageEvent[],
        instant = false
      ): number {
        this.saveState(uiName, target, sequence);
        const transition =
          $._context?.system?.previewing || !$._context?.system?.simulating
            ? this.applyChanges(uiName, target, sequence, instant)
            : NOP;
        const id = $.nextTriggerId();
        // TODO: await for scene to process changes
        $.enableTrigger(id, transition);
        return id;
      }

      set(uiName: string, target: string, image: string[]): void {
        this.clear(uiName, target);
        this.write(uiName, target, [{ control: "show", assets: image }], true);
      }

      getTargets(uiName: string): string[] {
        const targets = new Set<string>();
        if ($._state.image?.[uiName]) {
          Object.entries($._state.image[uiName]!).forEach(([target]) => {
            targets.add(target);
          });
        }
        $.findElements(uiName, "image").forEach((imageEl) => {
          const parent = imageEl.parent;
          if (parent) {
            const mainTag = parent.name;
            if (mainTag) {
              targets.add(mainTag);
            }
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
            $.updateElement(targetEl, { style });
          }
        });
      }

      update(
        uiName: string,
        target: string,
        style: Record<string, string | null> | null
      ): void {
        this.saveState(uiName, target, style);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
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
            $.updateElement(targetEl, { attributes });
          }
        });
      }

      update(
        uiName: string,
        target: string,
        attributes: Record<string, string | null> | null
      ): void {
        this.saveState(uiName, target, attributes);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
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

  override onReceiveNotification(msg: NotificationMessage): void {
    if (EventMessage.type.isNotification(msg)) {
      const params = msg.params;
      if (params.currentTargetId) {
        const callback = this._events[params.type]?.[params.currentTargetId];
        if (callback) {
          callback(params);
        }
      }
    }
  }
}
