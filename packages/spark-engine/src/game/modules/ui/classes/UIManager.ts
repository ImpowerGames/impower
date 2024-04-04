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
import { Animation } from "../types/Animation";
import { ElementContent } from "../types/ElementContent";
import { ElementState } from "../types/ElementState";
import { ImageState } from "../types/ImageState";
import { TextState } from "../types/TextState";
import { AnimateElementMessage } from "./messages/AnimateElementMessage";
import { CreateElementMessage } from "./messages/CreateElementMessage";
import { DestroyElementMessage } from "./messages/DestroyElementMessage";
import { ObserveElementMessage } from "./messages/ObserveElementMessage";
import { SetThemeMessage } from "./messages/SetThemeMessage";
import { UnobserveElementMessage } from "./messages/UnobserveElementMessage";
import { UpdateElementMessage } from "./messages/UpdateElementMessage";

const INVALID_VAR_NAME_CHAR = /[^_a-zA-Z0-9]/g;
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

export interface UIConfig {
  ignore?: string[];
  style_element_name?: string;
  ui_element_name?: string;
}

export interface UIState {
  text?: Record<string, TextState[]>;
  image?: Record<string, ImageState[]>;
  style?: Record<string, Record<string, string | null>>;
  attributes?: Record<string, Record<string, string | null>>;
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
    if (this._state.text) {
      Object.entries(this._state.text).forEach(([target]) => {
        this.text.restore(target);
      });
    }
    if (this._state.image) {
      Object.entries(this._state.image).forEach(([target]) => {
        this.image.restore(target);
      });
    }
    if (this._state.style) {
      Object.entries(this._state.style).forEach(([target]) => {
        this.style.restore(target);
      });
    }
    if (this._state.attributes) {
      Object.entries(this._state.attributes).forEach(([target]) => {
        this.attributes.restore(target);
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
        element: id,
        type,
        name,
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
        element: element.id,
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
        element: element.id,
        content,
        style,
        attributes,
      })
    );
  }

  protected animateElement(element: Element, animations: Animation[]): void {
    this.emit(
      AnimateElementMessage.type.request({
        element: element.id,
        animations,
      })
    );
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
    return `--image_${name.replaceAll(INVALID_VAR_NAME_CHAR, "_")}`;
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
    // Process Styles
    const validStructNames = [...Object.keys(this._context?.["style"] || {})];
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

  protected findElements(target: string): Element[] {
    const [name, instance] = target.split("#");
    const found: Element[] = [];
    if (this._root && name) {
      const elements = this.searchForAll(this._root, name, found);
      if (instance) {
        const instanceIndex = Number(instance);
        if (Number.isInteger(instanceIndex) && instanceIndex >= 0) {
          const element = elements.at(instanceIndex);
          if (element) {
            return [element];
          }
        }
        return [];
      }
      return elements;
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

  protected getContentElement(
    element: Element,
    tag: "image" | "text"
  ): Element | undefined {
    return element.findChild(tag);
  }

  protected getOrCreateContentElement(
    element: Element,
    tag: "image" | "text"
  ): Element {
    const contentChild = element.findChild(tag);
    if (contentChild) {
      return contentChild;
    }
    return this.createElement(element, { name: tag, type: "div" });
  }

  findIds(target: string): string[] {
    return this.findElements(target).map((c) => c.id);
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

  queueAnimationEvent(
    event: TextEvent | ImageEvent,
    instant: boolean,
    animations: Animation[]
  ): void {
    const showAnimationName = "show";
    const hideAnimationName = "hide";
    const controlAfter = instant ? 0 : event.after;
    const controlOver = instant ? 0 : event.over;
    const exitAfter = instant ? 0 : event.exit;
    if (animations) {
      const animationEvents: { name: string; after?: number; over?: number }[] =
        [];
      const controlAnimationName =
        event.control === "show"
          ? showAnimationName
          : event.control === "hide"
          ? hideAnimationName
          : undefined;
      if (controlAnimationName) {
        animationEvents.push({
          name: controlAnimationName,
          after: controlAfter,
          over: controlOver,
        });
      }
      if (event.exit) {
        animationEvents.push({
          name: hideAnimationName,
          after: exitAfter,
          over: controlOver,
        });
      }
      if (event.with) {
        animationEvents.push({
          name: event.with,
          after: event.withAfter ?? controlAfter,
          over: event.withOver,
        });
      }
      animationEvents.forEach(({ name, after, over }) => {
        const delayOverride = `${after ?? 0}s`;
        const durationOverride = over != null ? `${over}s` : null;
        const animationName = name;
        const animation = this._context["animation"]?.[
          animationName
        ] as Animation;
        const delay = delayOverride ?? animation.timing.delay ?? "0s";
        const duration = durationOverride ?? animation.timing.duration ?? "0s";
        const iterations = animation.timing.iterations ?? 1;
        const easing = animation.timing.easing ?? "ease";
        const fill = animation.timing.fill ?? "none";
        const direction = animation.timing.direction ?? "normal";
        animations.push({
          keyframes: animation.keyframes,
          timing: { delay, duration, iterations, easing, fill, direction },
        });
      });
    }
  }

  protected setEventListener<T extends keyof EventMap>(
    event: T,
    target: string,
    callback: ((event: EventMap[T]) => any) | null,
    stopPropagation = true,
    once = false
  ): boolean {
    const targetEls = this.findElements(target);
    targetEls.forEach((targetEl) => {
      const style = { pointer_events: "auto" };
      this.updateElement(targetEl, { style });
      this.emit(
        UpdateElementMessage.type.request({
          element: targetEl.id,
          style,
        })
      );
      if (callback) {
        this.emit(
          ObserveElementMessage.type.request({
            element: targetEl.id,
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
            element: targetEl.id,
            event,
          })
        );
      }
    });
    return targetEls.length > 0;
  }

  observe<T extends keyof EventMap>(
    event: T,
    target: string,
    callback: (event: EventMap[T]) => any,
    stopPropagation = true,
    once = false
  ): boolean {
    return this.setEventListener(
      event,
      target,
      callback,
      stopPropagation,
      once
    );
  }

  unobserve<T extends keyof EventMap>(event: T, target: string): boolean {
    return this.setEventListener(event, target, null);
  }

  Text = (($) => {
    class Text {
      protected saveState(target: string, sequence: TextEvent[] | null) {
        $._state.text ??= {};
        $._state.text[target] ??= [];
        const state = $._state.text[target]!;
        if (sequence) {
          sequence.forEach((e) => {
            if (!e.exit) {
              const prev = state.at(-1);
              if (
                prev &&
                JSON.stringify(prev.style || {}) ===
                  JSON.stringify(e.style || {}) &&
                prev.with === e.with
              ) {
                prev.text = (prev.text ?? "") + e.text;
              } else {
                const s: TextState = { text: e.text };
                if (e.with) {
                  s.with = e.with;
                }
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

      restore(target: string) {
        const state = $._state.text?.[target];
        if (state) {
          this.applyChanges(target, state, true);
        }
      }

      protected applyChanges(
        target: string,
        sequence: TextEvent[] | null,
        instant: boolean
      ): void {
        const elementAnimations = new Map<Element, Animation[]>();
        $.findElements(target).forEach((targetEl) => {
          if (targetEl) {
            $.updateElement(targetEl, {
              style: { display: null },
            });
            let targetShown = false;
            // Enqueue text events
            if (sequence) {
              let blockWrapper:
                | { element: Element; style: Record<string, string | null> }
                | undefined = undefined;
              sequence.forEach((e) => {
                const contentEl = $.getOrCreateContentElement(targetEl, "text");
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
                const style = {
                  ...(e.style || {}),
                  display: null,
                  opacity: "0",
                };
                const spanEl = $.createElement(parentEl, {
                  type: "span",
                  content: { text },
                  style,
                });
                if (!elementAnimations.has(spanEl)) {
                  elementAnimations.set(spanEl, []);
                }
                const spanAnimations = elementAnimations.get(spanEl)!;
                $.queueAnimationEvent(e, instant, spanAnimations);
                if (e.control === "show" && !targetShown) {
                  if (!elementAnimations.has(targetEl)) {
                    elementAnimations.set(targetEl, []);
                  }
                  const targetAnimations = elementAnimations.get(targetEl)!;
                  $.queueAnimationEvent(e, instant, targetAnimations);
                  targetShown = true;
                }
              });
            } else {
              const contentEl = $.getContentElement(targetEl, "text");
              if (contentEl) {
                $.clearElement(contentEl);
                $.updateElement(targetEl, {
                  style: { display: "none", opacity: "0" },
                });
              }
            }
          }
        });
        // Animate elements
        elementAnimations.forEach((animations, element) => {
          $.animateElement(element, animations);
        });
      }

      clearContent(target: string): void {
        this.saveState(target, null);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
          this.applyChanges(target, null, true);
        }
      }

      clearStaleContent(): void {
        this.getTargets().forEach((target) => {
          if (!$._context?.["style"]?.[target]?.preserve_text) {
            this.clearContent(target);
          }
        });
      }

      write(target: string, sequence: TextEvent[], instant = false): void {
        this.saveState(target, sequence);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
          this.applyChanges(target, sequence, instant);
        }
      }

      set(target: string, text: string): void {
        this.clearContent(target);
        this.write(target, [{ text }], true);
      }

      getTargets(): string[] {
        const targets = new Set<string>();
        if ($._state.text) {
          Object.entries($._state.text).forEach(([target]) => {
            targets.add(target);
          });
        }
        $.findElements("text").forEach((textEl) => {
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
      protected saveState(target: string, sequence: ImageEvent[] | null) {
        $._state.image ??= {};
        $._state.image[target] ??= [];
        const state = $._state.image[target]!;
        if (sequence) {
          sequence.forEach((e) => {
            if (!e.exit) {
              const prev = state.at(-1);
              if (prev) {
                prev.assets = e.assets;
                prev.with = e.with;
              } else {
                const s: ImageState = {
                  control: e.control,
                  assets: e.assets,
                  with: e.with,
                  over: 0,
                };
                state.push(s);
              }
            }
          });
        } else {
          state.length = 0;
        }
      }

      restore(target: string) {
        const state = $._state.image?.[target];
        if (state) {
          this.applyChanges(target, state, true);
        }
      }

      protected applyChanges(
        target: string,
        sequence: ImageEvent[] | null,
        instant: boolean
      ): void {
        const elementAnimations = new Map<Element, Animation[]>();
        $.findElements(target).forEach((targetEl) => {
          if (targetEl) {
            $.updateElement(targetEl, {
              style: { display: null },
            });
            let targetShown = false;
            // Enqueue image events
            if (sequence) {
              sequence.forEach((e) => {
                if (e.assets && e.assets.length > 0) {
                  // We are affecting the image
                  const contentEl = $.getOrCreateContentElement(
                    targetEl,
                    "image"
                  );
                  const style: Record<string, string | null> = {
                    ...(e.style || {}),
                    display: null,
                    opacity: "0",
                  };
                  const combinedBackgroundImage = $.getImageAssetNames(e.assets)
                    .map((n) => $.getImageVar(n))
                    .reverse()
                    .join(", ");
                  style["background_image"] = combinedBackgroundImage;
                  const spanEl = $.createElement(contentEl, {
                    type: "span",
                    style,
                  });
                  if (!elementAnimations.has(spanEl)) {
                    elementAnimations.set(spanEl, []);
                  }
                  const spanAnimations = elementAnimations.get(spanEl)!;
                  $.queueAnimationEvent(e, instant, spanAnimations);
                  if (e.control === "show" && !targetShown) {
                    if (!elementAnimations.has(targetEl)) {
                      elementAnimations.set(targetEl, []);
                    }
                    const targetAnimations = elementAnimations.get(targetEl)!;
                    $.queueAnimationEvent(e, instant, targetAnimations);
                    targetShown = true;
                  }
                } else {
                  // We are affecting the image wrapper
                  if (!elementAnimations.has(targetEl)) {
                    elementAnimations.set(targetEl, []);
                  }
                  const targetAnimations = elementAnimations.get(targetEl)!;
                  $.queueAnimationEvent(e, instant, targetAnimations);
                }
              });
            } else {
              const contentEl = $.getContentElement(targetEl, "image");
              if (contentEl) {
                $.clearElement(contentEl);
                $.updateElement(targetEl, {
                  style: { display: "none", opacity: "0" },
                });
              }
            }
          }
        });
        // Animate elements
        elementAnimations.forEach((animations, element) => {
          $.animateElement(element, animations);
        });
      }

      clearContent(target: string): void {
        this.saveState(target, null);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
          this.applyChanges(target, null, true);
        }
      }

      clearStaleContent(): void {
        this.getTargets().forEach((target) => {
          if (!$._context?.["style"]?.[target]?.preserve_image) {
            this.clearContent(target);
          }
        });
      }

      write(target: string, sequence: ImageEvent[], instant = false): void {
        this.saveState(target, sequence);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
          this.applyChanges(target, sequence, instant);
        }
      }

      set(target: string, image: string[]): void {
        this.clearContent(target);
        this.write(target, [{ control: "show", assets: image }], true);
      }

      getTargets(): string[] {
        const targets = new Set<string>();
        if ($._state.image) {
          Object.entries($._state.image).forEach(([target]) => {
            targets.add(target);
          });
        }
        $.findElements("image").forEach((imageEl) => {
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
        target: string,
        style: Record<string, string | null> | null
      ) {
        $._state.style ??= {};
        $._state.style[target] ??= {};
        const state = $._state.style[target]!;
        if (style) {
          Object.entries(style).forEach(([k, v]) => {
            if (v) {
              state[k] = v;
            } else {
              delete state[k];
            }
          });
        } else {
          $._state.style[target] = {};
        }
      }

      restore(target: string) {
        const state = $._state.style?.[target];
        if (state) {
          this.applyChanges(target, state);
        }
      }

      protected applyChanges(
        target: string,
        style: Record<string, string | null> | null
      ): void {
        $.findElements(target).forEach((targetEl) => {
          if (targetEl) {
            $.updateElement(targetEl, { style });
          }
        });
      }

      update(
        target: string,
        style: Record<string, string | null> | null
      ): void {
        this.saveState(target, style);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
          this.applyChanges(target, style);
        }
      }
    }
    return Style;
  })(this);

  Attributes = (($) => {
    class Attributes {
      protected saveState(
        target: string,
        attributes: Record<string, string | null> | null
      ) {
        $._state.attributes ??= {};
        $._state.attributes[target] ??= {};
        const state = $._state.attributes[target]!;
        if (attributes) {
          Object.entries(attributes).forEach(([k, v]) => {
            if (v) {
              state[k] = v;
            } else {
              delete state[k];
            }
          });
        } else {
          $._state.attributes[target] = {};
        }
      }

      restore(target: string) {
        const state = $._state.attributes?.[target];
        if (state) {
          this.applyChanges(target, state);
        }
      }

      protected applyChanges(
        target: string,
        attributes: Record<string, string | null> | null
      ): void {
        $.findElements(target).forEach((targetEl) => {
          if (targetEl) {
            $.updateElement(targetEl, { attributes });
          }
        });
      }

      update(
        target: string,
        attributes: Record<string, string | null> | null
      ): void {
        this.saveState(target, attributes);
        if ($._context?.system?.previewing || !$._context?.system?.simulating) {
          this.applyChanges(target, attributes);
        }
      }
    }
    return Attributes;
  })(this);

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
