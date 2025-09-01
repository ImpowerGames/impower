import { filterImage } from "@impower/sparkdown/src/utils/filterImage";
import { sortFilteredName } from "@impower/sparkdown/src/utils/sortFilteredName";
import { Clock } from "../../../core/classes/Clock";
import type { Game } from "../../../core/classes/Game";
import { EventMessage } from "../../../core/classes/messages/EventMessage";
import { Module } from "../../../core/classes/Module";
import { Event } from "../../../core/types/Event";
import { EventMap } from "../../../core/types/EventMap";
import {
  ImageInstruction,
  TextInstruction,
} from "../../../core/types/Instruction";
import { NotificationMessage } from "../../../core/types/NotificationMessage";
import { getAllProperties } from "../../../core/utils/getAllProperties";
import { getTimeValue } from "../../../core/utils/getTimeValue";
import { Animation } from "../types/Animation";
import { ElementContent } from "../types/ElementContent";
import { ElementState } from "../types/ElementState";
import { Image } from "../types/Image";
import { ImageState } from "../types/ImageState";
import { TextState } from "../types/TextState";
import { UIBuiltins, uiBuiltinDefinitions } from "../uiBuiltinDefinitions";
import { getImageVarName } from "../utils/getImageVarName";
import { Element } from "./helpers/Element";
import {
  AnimateElementsMessage,
  AnimateElementsMessageMap,
} from "./messages/AnimateElementsMessage";
import {
  CreateElementMessage,
  CreateElementMessageMap,
} from "./messages/CreateElementMessage";
import {
  DestroyElementMessage,
  DestroyElementMessageMap,
} from "./messages/DestroyElementMessage";
import {
  ObserveElementMessage,
  ObserveElementMessageMap,
} from "./messages/ObserveElementMessage";
import {
  SetThemeMessage,
  SetThemeMessageMap,
} from "./messages/SetThemeMessage";
import {
  UnobserveElementMessage,
  UnobserveElementMessageMap,
} from "./messages/UnobserveElementMessage";
import {
  UpdateElementMessage,
  UpdateElementMessageMap,
} from "./messages/UpdateElementMessage";

export interface UIState {
  text?: Record<string, TextState[]>;
  image?: Record<string, ImageState[]>;
  style?: Record<string, Record<string, string | null>>;
  attributes?: Record<string, Record<string, string | null>>;
}

export type UIMessageMap = AnimateElementsMessageMap &
  CreateElementMessageMap &
  DestroyElementMessageMap &
  ObserveElementMessageMap &
  SetThemeMessageMap &
  UnobserveElementMessageMap &
  UpdateElementMessageMap;

export class UIModule extends Module<UIState, UIMessageMap, UIBuiltins> {
  protected _firstUpdate = true;

  protected _root?: Element;

  protected _events: Partial<
    Record<string, Record<string, (event: Event) => void>>
  > = {};

  protected _clearOnContinue: Set<string> = new Set();

  constructor(game: Game) {
    super(game);
  }

  override getBuiltins() {
    return uiBuiltinDefinitions();
  }

  override getStored(): string[] {
    return [];
  }

  override onInit() {
    this._root = this.getOrCreateRootElement();
    this.loadStyles();
    this.loadUI();
    this.loadTheme();
  }

  override async onRestore() {
    if (this._state.text) {
      for (const [target] of Object.entries(this._state.text)) {
        this.text.restore(target);
      }
    }
    if (this._state.image) {
      for (const [target] of Object.entries(this._state.image)) {
        this.image.restore(target);
      }
    }
    if (this._state.style) {
      for (const [target] of Object.entries(this._state.style)) {
        this.style.restore(target);
      }
    }
    if (this._state.attributes) {
      for (const [target] of Object.entries(this._state.attributes)) {
        this.attributes.restore(target);
      }
    }
  }

  override onUpdate(time: Clock) {
    if (this._firstUpdate) {
      this._firstUpdate = false;
      this.reveal();
    }
    return super.onUpdate(time);
  }

  override onPreview() {
    this.reveal();
    return super.onPreview();
  }

  override onDestroy(): void {
    super.onDestroy();
    if (this._root) {
      this.destroyElement(this._root);
    }
  }

  protected generateId() {
    // Id must start with a letter
    return "e-" + this.context.system.uuid();
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
    const breakpoints = this.context.config?.ui?.breakpoints;
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
        breakpoints,
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
    this.updateElement(element, {
      content: { text: "" },
    });
    for (const child of element.children) {
      this.destroyElement(child);
    }
  }

  protected updateElement(element: Element, state?: ElementState): void {
    const content = state?.content;
    const style = state?.style;
    const attributes = state?.attributes;
    const breakpoints = this.context.config?.ui?.breakpoints;
    this.emit(
      UpdateElementMessage.type.request({
        element: element.id,
        content,
        style,
        attributes,
        breakpoints,
      })
    );
  }

  protected animateElements(
    effects: { element: Element; animations: Animation[] }[]
  ) {
    return this.emit(
      AnimateElementsMessage.type.request({
        effects: effects.map((e) => ({
          element: e.element.id,
          animations: e.animations,
        })),
      })
    );
  }

  protected conceal() {
    const target = this.context.config?.ui?.ui_element_name;
    if (target) {
      const uiRoot = this._root?.findChild(target);
      if (uiRoot) {
        this.updateElement(uiRoot, { style: { opacity: "0" } });
      }
    }
  }

  protected reveal() {
    const target = this.context.config?.ui.ui_element_name;
    if (target) {
      const uiRoot = this._root?.findChild(target);
      if (uiRoot) {
        this.updateElement(uiRoot, { style: { opacity: "1" } });
      }
    }
  }

  show(target: string): void {
    // TODO: use transition classes to apply show style instead
    for (const targetEl of this.findElements(target)) {
      this.updateElement(targetEl, { style: { display: "flex" } });
    }
  }

  showAll(targets: string[]): void {
    for (const target of targets) {
      this.show(target);
    }
  }

  hide(target: string): void {
    // TODO: use transition classes to apply hide style instead
    for (const targetEl of this.findElements(target)) {
      this.updateElement(targetEl, {
        style: { display: "none" },
      });
    }
  }

  hideAll(targets: string[]): void {
    for (const target of targets) {
      this.hide(target);
    }
  }

  getImageVarName(name: string) {
    return getImageVarName(name);
  }

  getUrl(src: string) {
    return `url("${src}")`;
  }

  getImageValue(name: string) {
    if (name === "none") {
      return name;
    }
    const imageName = name.includes("~") ? sortFilteredName(name) : name;
    if (this.context?.filtered_image?.[imageName]) {
      filterImage(this.context, this.context?.filtered_image?.[imageName]);
      if (this.context?.filtered_image?.[imageName].filtered_src) {
        return this.getUrl(
          this.context?.filtered_image?.[imageName].filtered_src
        );
      }
    }
    if (this.context?.layered_image?.[imageName]) {
      return this.getImageAssets("layered_image", imageName)
        .map((asset) => this.getUrl(asset.src))
        .reverse()
        .join(", ");
    }
    if (this.context?.image?.[imageName]) {
      return this.getUrl(this.context?.image?.[imageName].src);
    }
    return `var(${this.getImageVarName(imageName)})`;
  }

  getImageAssets(type: string, name: string) {
    if (!type) {
      const images: Image[] = [];
      images.push(...this.getImageAssets("filtered_image", name));
      images.push(...this.getImageAssets("layered_image", name));
      images.push(...this.getImageAssets("image", name));
      return images;
    }
    if (type === "image") {
      const image = this.context?.image?.[name];
      if (image) {
        return [image];
      }
    }
    if (type === "layered_image") {
      const layeredImage = this.context?.layered_image?.[name];
      if (layeredImage) {
        const images: Image[] = [];
        for (const image of Object.values(layeredImage.layers)) {
          images.push(...this.getImageAssets(image.$type, image.$name));
        }
        return images;
      }
    }
    if (type === "filtered_image") {
      const filteredImage = this.context?.filtered_image?.[name];
      if (filteredImage) {
        const images: Image[] = [];
        if (filteredImage.filtered_src) {
          images.push({
            $type: "image",
            $name: name,
            src: filteredImage.filtered_src,
          });
        }
        if (filteredImage.filtered_layers) {
          for (const layer of filteredImage.filtered_layers) {
            const image = this.context?.image?.[layer?.$name];
            if (image) {
              images.push(image);
            }
          }
        }
        return images;
      }
    }
    return [];
  }

  getBackgroundImageFromString(value: string) {
    return !value || value === "none"
      ? "none"
      : value.includes("gradient(") || value.includes("url(")
      ? value
      : `linear-gradient(${value},${value})`;
  }

  getBackgroundImageFromValue(value: unknown) {
    if (value != null && typeof value === "string") {
      return this.getBackgroundImageFromString(value);
    }
    if (
      value != null &&
      typeof value === "object" &&
      "$name" in value &&
      typeof value.$name === "string"
    ) {
      return this.getImageValue(value.$name);
    }
    return undefined;
  }

  getBackgroundImagesFromArgument(asset: string) {
    if (asset.at(0) === '"' && asset.at(-1) === '"') {
      const literalStringValue = asset.slice(1, -1);
      return this.getBackgroundImageFromString(literalStringValue);
    } else {
      return this.getImageValue(asset);
    }
  }

  getBackgroundImagesFromArguments(assets: string[]) {
    return assets.map((asset) => this.getBackgroundImagesFromArgument(asset));
  }

  createRootStyle() {
    const style: Record<string, string> = {
      position: "absolute",
      inset: "0",
    };
    const images = this.context?.image;
    if (images) {
      for (const [name, image] of Object.entries(images)) {
        if (!name.startsWith("$")) {
          const varName = this.getImageVarName(name);
          const varValue = this.getUrl(image.src);
          if (varValue) {
            style[varName] = varValue;
          }
        }
      }
    }
    return style;
  }

  getOrCreateRootElement(): Element {
    if (this._root) {
      return this._root;
    }
    const style = this.createRootStyle();
    return this.createElement(null, { style });
  }

  protected getOrCreateRootStyleElement(): Element {
    if (!this._root) {
      this._root = this.getOrCreateRootElement();
    }
    const target = this.context.config?.ui.style_element_name;
    const existingElement = target ? this._root.findChild(target) : undefined;
    return (
      existingElement ||
      this.createElement(this._root, {
        name: target,
      })
    );
  }

  protected getOrCreateRootUIElement(): Element {
    const style = {
      position: "absolute",
      inset: "0",
      font_size: "1em",
      opacity: "0",
    };
    if (!this._root) {
      this._root = this.getOrCreateRootElement();
    }
    const target = this.context.config?.ui.ui_element_name;
    const existingElement = target ? this._root.findChild(target) : undefined;
    return (
      existingElement ||
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
    const style = {
      // Required to prevent style content from rendering on screen on mobile
      display: "none",
    };
    const parent = this.getOrCreateRootStyleElement();
    return this.createElement(parent, {
      type: "style",
      name: "style-" + structName,
      content,
      style,
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
    for (const [k, v] of Object.entries(properties)) {
      const path = k.startsWith(".") ? k.split(".").slice(1) : k.split(".");
      const isValidNode = !path.at(-1)?.startsWith("$");
      if (isValidNode) {
        let cursor: Element = uiEl;
        for (let i = 0; i < path.length; i += 1) {
          const name = path[i]!;
          const child = cursor.findChild(name);
          if (child) {
            cursor = child;
          } else {
            const isLast = i === path.length - 1;
            const parent = path.at(-1);
            const parentClasses = parent?.split(" ") || [];
            const text =
              isLast &&
              (parentClasses.includes("text") ||
                parentClasses.includes("stroke")) &&
              typeof v === "string"
                ? v
                : undefined;
            const background_image =
              isLast && parentClasses.includes("image")
                ? this.getBackgroundImageFromValue(v)
                : undefined;
            const mask_image =
              isLast && parentClasses.includes("mask")
                ? this.getBackgroundImageFromValue(v)
                : undefined;
            cursor = this.createElement(cursor, {
              type: "div",
              name,
            });
            if (text) {
              cursor = this.createElement(cursor, {
                type: "span",
                content: { text },
                style: { display: "inline" },
              });
            }
            if (background_image) {
              cursor = this.createElement(cursor, {
                type: "span",
                style: { background_image },
              });
            }
            if (mask_image) {
              cursor = this.createElement(cursor, {
                type: "span",
                style: { mask_image },
              });
            }
          }
        }
      }
    }
    return uiEl;
  }

  loadStyles(): void {
    // Process Fonts
    const fonts = this.context?.font;
    if (fonts) {
      this.constructStyleElement("fonts", { fonts });
    }
    // Process Animations
    const animations = this.context?.animation;
    if (animations) {
      this.constructStyleElement("animations", { animations });
    }
    const styles = this.context?.style;
    if (styles) {
      this.constructStyleElement("styles", { styles });
    }
  }

  loadUI(...structNames: string[]): void {
    const targetAllStructs = !structNames || structNames.length === 0;
    const validStructNames = targetAllStructs
      ? Object.keys(this.context?.ui || {})
      : structNames;
    for (const structName of validStructNames) {
      if (structName && !structName.startsWith("$")) {
        const structObj = this.context?.ui?.[structName];
        if (structObj) {
          const properties = getAllProperties(structObj);
          this.constructUI(structName, properties);
        }
      }
    }
  }

  loadTheme(): void {
    const breakpoints = this.context?.config?.ui?.breakpoints;
    if (breakpoints) {
      this.emit(
        SetThemeMessage.type.request({
          breakpoints,
        })
      );
    }
  }

  hideUI(...structNames: string[]): void {
    for (const structName of structNames) {
      if (structName) {
        const structEl = this.getUIElement(structName);
        if (structEl) {
          this.updateElement(structEl, { attributes: { hidden: "" } });
        }
      }
    }
  }

  showUI(...structNames: string[]): void {
    for (const structName of structNames) {
      if (structName) {
        const structEl = this.getUIElement(structName);
        if (structEl) {
          this.updateElement(structEl, { attributes: { hidden: null } });
        }
      }
    }
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

  protected getContentElements(
    element: Element,
    tag: "image" | "text" | "mask" | "stroke"
  ): Element[] {
    return element.findChildren(tag);
  }

  protected getOrCreateContentElements(
    element: Element,
    tag: "image" | "text" | "mask" | "stroke"
  ): Element[] {
    const contentChildren = element.findChildren(tag);
    if (contentChildren.length > 0) {
      return contentChildren;
    }
    return [this.createElement(element, { name: tag, type: "div" })];
  }

  findIds(target: string): string[] {
    return this.findElements(target).map((c) => c.id);
  }

  getTransientTargets() {
    return Array.from(this._clearOnContinue.values());
  }

  queueAnimationEvent(
    event: { name: string; after?: number; over?: number },
    instant: boolean,
    animations: Animation[]
  ): void {
    if (animations) {
      const eventInstance = { ...event };
      if (instant) {
        if (eventInstance.after != null && eventInstance.after > 0) {
          eventInstance.after = 0;
        }
        if (eventInstance.over != null && eventInstance.over > 0) {
          eventInstance.over = 0;
        }
      }
      const definition = this.getAnimationDefinition(eventInstance);
      if (definition) {
        animations.push(definition);
      }
    }
  }

  getAnimationDefinition(event: {
    name: string;
    after?: number;
    over?: number;
    loop?: boolean;
  }): Animation | undefined {
    const { name, after, over, loop } = event;
    const delayOverride = `${after ?? 0}s`;
    const durationOverride = over != null ? `${over}s` : null;
    const loopOverride =
      loop === true ? "infinite" : loop === false ? 1 : undefined;
    const animation = this.context?.animation?.[name] as Animation;
    if (animation) {
      const delay = delayOverride ?? animation?.timing?.delay ?? "0s";
      const duration = durationOverride ?? animation?.timing?.duration ?? "0s";
      const iterations = loopOverride ?? animation?.timing?.iterations ?? 1;
      const easing = animation?.timing?.easing ?? "ease";
      const fill = animation?.timing?.fill ?? "none";
      const direction = animation?.timing?.direction ?? "normal";
      const keyframes = animation?.keyframes;
      const timing = {
        delay,
        duration,
        iterations,
        easing,
        fill,
        direction,
      };
      return {
        $type: animation.$type,
        $name: animation.$name,
        keyframes,
        timing,
      };
    }
    return undefined;
  }

  protected setEventListener<T extends keyof EventMap>(
    event: T,
    target: string,
    callback: ((event: EventMap[T]) => any) | null,
    stopPropagation = true,
    once = false
  ): boolean {
    const targetEls = this.findElements(target);
    for (const targetEl of targetEls) {
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
    }
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
      protected saveState(target: string, sequence: TextInstruction[] | null) {
        $._state.text ??= {};
        $._state.text[target] ??= [];
        const state = $._state.text[target]!;
        if (sequence) {
          for (const e of sequence) {
            const prev = state.at(-1);
            if (
              prev &&
              JSON.stringify(prev.style || {}) === JSON.stringify(e.style || {})
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

      protected process(
        targetEl: Element,
        contentEl: Element,
        sequence: TextInstruction[],
        instant: boolean,
        enterElements: Map<Element, Animation[]>,
        _exitElements: Map<Element, Animation[]>
      ) {
        let targetRevealed = false;
        let lineWrapperEl: Element | undefined = undefined;
        let wordWrapperEl: Element | undefined = undefined;
        let wasSpace: boolean | undefined = undefined;
        let wasNewline: boolean | undefined = undefined;
        let prevTextAlign: string | undefined = undefined;
        for (const e of sequence) {
          const text = e.text;
          // Wrap each line in a block div
          const isNewline = text === "\n";
          // Support transform animations and text-wrapping by wrapping each word in an inline-block span
          const isSpace = text === " " || text === "\t" || text === "\n";
          // Support aligning text by wrapping consecutive aligned chunks in a block div
          const textAlign = e.style?.text_align;
          const alignStyle = textAlign
            ? {
                text_align: textAlign,
              }
            : undefined;
          // text_align must be applied to a parent element
          if (textAlign !== prevTextAlign) {
            // Surround group consecutive spans that have the same text alignment a text_line div
            lineWrapperEl = $.createElement(contentEl, {
              type: "div",
              name: "text_line",
              style: alignStyle,
            });
          } else if (wasNewline === undefined || isNewline !== wasNewline) {
            // Surround each line in a text_line div
            lineWrapperEl = $.createElement(contentEl, {
              type: "div",
              name: "text_line",
            });
          }
          // Support consecutive whitespace collapsing
          const style: Record<string, string | number | null> = {
            display: null,
            opacity: "0",
            ...(e.style || {}),
          };
          if (text === "\n" || text === " " || text === "\t") {
            style["display"] = "inline";
          }
          if (text === "\n" || isSpace) {
            wordWrapperEl = $.createElement(lineWrapperEl || contentEl, {
              type: "span",
              name: "text_space",
              style: alignStyle,
            });
          } else if (
            wasSpace === undefined ||
            isSpace !== wasSpace ||
            textAlign !== prevTextAlign
          ) {
            // this is the start of a new word chunk so create a text_word span
            wordWrapperEl = $.createElement(lineWrapperEl || contentEl, {
              type: "span",
              name: "text_word",
              style: alignStyle,
            });
          }
          prevTextAlign = textAlign;
          wasNewline = isNewline;
          wasSpace = isSpace;
          // Append text to wordWrapper, blockWrapper, or content
          const textParentEl = wordWrapperEl || lineWrapperEl || contentEl;
          const newSpanEl =
            text === "\n"
              ? $.createElement(textParentEl, {
                  type: "span",
                  name: "text_letter",
                  content: { text: "" }, // text_line div already handles breaking up lines
                  style,
                })
              : $.createElement(textParentEl, {
                  type: "span",
                  name: "text_letter",
                  content: { text },
                  style,
                });
          if (!enterElements.has(newSpanEl)) {
            enterElements.set(newSpanEl, []);
          }
          const newSpanAnimations = enterElements.get(newSpanEl)!;
          $.queueAnimationEvent(
            { name: "show", after: e.after, over: e.over },
            instant,
            newSpanAnimations
          );
          if (
            (e.control === "show" || e.control === "set") &&
            !targetRevealed
          ) {
            if (!enterElements.has(targetEl)) {
              enterElements.set(targetEl, []);
            }
            const targetAnimations = enterElements.get(targetEl)!;
            $.queueAnimationEvent(
              { name: "show", after: e.after },
              instant,
              targetAnimations
            );
            targetRevealed = true;
          }
        }
      }

      protected applyChanges(
        target: string,
        sequence: TextInstruction[] | null,
        instant: boolean
      ): void {
        const enterElements = new Map<Element, Animation[]>();
        const exitElements = new Map<Element, Animation[]>();
        for (const targetEl of $.findElements(target)) {
          if (targetEl) {
            $.updateElement(targetEl, {
              style: { display: null },
              attributes: {
                text: sequence?.map((t) => t.text).join("") ?? null,
              },
            });
            if (sequence) {
              // Create and set text
              const textEls = $.getOrCreateContentElements(targetEl, "text");
              for (const textEl of textEls) {
                this.process(
                  targetEl,
                  textEl,
                  sequence,
                  instant,
                  enterElements,
                  exitElements
                );
              }
              // Set stroke (if stroke exists)
              const strokeEls = $.getContentElements(targetEl, "stroke");
              for (const strokeEl of strokeEls) {
                this.process(
                  targetEl,
                  strokeEl,
                  sequence,
                  instant,
                  enterElements,
                  exitElements
                );
              }
            } else {
              // Clear text and stroke
              const textEls = $.getContentElements(targetEl, "text");
              for (const textEl of textEls) {
                $.clearElement(textEl);
              }
              const strokeEls = $.getContentElements(targetEl, "stroke");
              for (const strokeEl of strokeEls) {
                $.clearElement(strokeEl);
              }
              $.updateElement(targetEl, {
                style: { display: "none", opacity: "0" },
              });
            }
          }
        }
        const enterEffects = Array.from(enterElements).map(
          ([element, animations]) => ({ element, animations })
        );
        const exitEffects = Array.from(exitElements).map(
          ([element, animations]) => ({ element, animations })
        );
        // Animate in elements
        $.animateElements(enterEffects);
        // Animate out elements
        $.animateElements(exitEffects).then(() => {
          // Then destroy exited elements
          for (const e of exitEffects) {
            $.destroyElement(e.element);
          }
        });
      }

      clear(target: string): void {
        this.saveState(target, null);
        if ($.context?.system?.previewing || !$.context?.system?.simulating) {
          this.applyChanges(target, null, true);
        }
      }

      clearAll(targets: string[]): void {
        for (const target of targets) {
          this.clear(target);
        }
      }

      write(
        target: string,
        sequence: TextInstruction[],
        instant = false
      ): void {
        if (
          sequence.some((e) => e.control === "set" || e.control === "show") &&
          !$.context.config?.ui.persistent.includes(target)
        ) {
          $._clearOnContinue.add(target);
        } else if ($.context.config?.ui.persistent.includes(target)) {
          this.saveState(target, sequence);
        }
        if ($.context?.system?.previewing || !$.context?.system?.simulating) {
          this.applyChanges(target, sequence, instant);
        }
      }
    }
    return Text;
  })(this);

  Image = (($) => {
    class Image {
      protected saveState(target: string, sequence: ImageInstruction[] | null) {
        $._state.image ??= {};
        $._state.image[target] ??= [];
        let state = $._state.image[target];
        if (sequence) {
          for (const event of sequence) {
            const targetingLayer = !event.assets?.length;
            if (targetingLayer) {
              // TODO: If animate with none, clear all previous animation events
              const changingVisibility = event.control !== "animate";
              const latestLayerVisibilityEvent = state.findLast(
                (e) => !e.assets?.length && e.control !== "animate"
              );
              if (changingVisibility && latestLayerVisibilityEvent) {
                // If we are just changing visibility, no need to create a new event
                latestLayerVisibilityEvent.control = event.control;
                latestLayerVisibilityEvent.with = event.with;
              } else {
                state.push({
                  control: event.control,
                  with: event.with,
                  over: 0,
                });
              }
            } else {
              // TODO: If animate with none, clear all previous animation events
              if (event.control === "set") {
                // Clear all previous content events
                state = state.filter((e) => !e.assets?.length);
                $._state.image ??= {};
                $._state.image[target] = state;
              }
              state.push({
                control: event.control,
                with: event.with,
                assets: event.assets,
                over: 0,
              });
            }
          }
        } else {
          delete $._state.image?.[target];
        }
      }

      restore(target: string) {
        const state = $._state.image?.[target];
        if (state) {
          this.applyChanges(target, state, true);
        }
      }

      protected process(
        targetEl: Element,
        contentEl: Element,
        property: "mask_image" | "background_image",
        sequence: ImageInstruction[],
        instant: boolean,
        enterElements: Map<Element, Animation[]>,
        exitElements: Map<Element, Animation[]>
      ) {
        let targetRevealed = false;
        for (const e of sequence) {
          const transitionWith = e.with || "";
          const transition = $.context?.transition?.[transitionWith];
          // Calculate transition speed
          const transitionAnimations: Animation[] = [];
          if (transition) {
            for (const [k, v] of Object.entries(transition)) {
              if (!k.startsWith("$") && v) {
                if (typeof v === "string") {
                  const transitionAnimation = $.context?.animation?.[v];
                  if (transitionAnimation) {
                    transitionAnimations.push(transitionAnimation);
                  }
                } else {
                  const transitionAnimation = $.context?.animation?.[v?.$name];
                  if (transitionAnimation) {
                    transitionAnimations.push(transitionAnimation);
                  }
                }
              }
            }
          }
          const transitionDuration = Math.max(
            ...transitionAnimations.map(
              (a) => getTimeValue(a.timing.duration) ?? 0
            )
          );
          const over = e.over;
          const transitionSpeed =
            transition && over != null && over > 0
              ? transitionDuration / over
              : 1;
          // Calculate show settings
          const showWith =
            (transition
              ? typeof transition?.on_show === "string"
                ? transition?.on_show
                : transition?.on_show?.$name
              : e.with) || "show";
          const showAnimation = $.context?.animation?.[showWith];
          const showAnimationDuration =
            getTimeValue(showAnimation?.timing?.duration) ?? 0;
          const showAfter = e.after;
          const showOver = transition
            ? showAnimationDuration / transitionSpeed
            : over;
          // Calculate hide settings
          const hideWith =
            (transition
              ? typeof transition?.on_hide === "string"
                ? transition?.on_hide
                : transition?.on_hide?.$name
              : e.with) || "hide";
          const hideAnimation = $.context?.animation?.[hideWith];
          const hideAnimationDuration =
            getTimeValue(hideAnimation?.timing?.duration) ?? 0;
          const hideAfter = e.after;
          const hideOver = transition
            ? hideAnimationDuration / transitionSpeed
            : over;
          // Animate any other elements affected by the transition
          if (transition) {
            for (const [k, v] of Object.entries(transition)) {
              if (!k.startsWith("$") && !k.startsWith("on_")) {
                const animateWith = typeof v === "string" ? v : v?.$name;
                if (animateWith) {
                  for (const el of $.findElements(k)) {
                    if (!enterElements.has(el)) {
                      enterElements.set(el, []);
                    }
                    const elAnimations = enterElements.get(el)!;
                    const animateEvent = {
                      name: animateWith,
                      after: e.after,
                      over: e.over,
                    };
                    $.queueAnimationEvent(animateEvent, instant, elAnimations);
                  }
                }
              }
            }
          }
          if (e.assets && e.assets.length > 0) {
            // We are affecting the image
            const style: Record<string, string | null> = {
              ...(e.style || {}),
              display: null,
              opacity: "0",
            };
            const imageNames = e.assets.join(" ");
            const images = $.getBackgroundImagesFromArguments(e.assets)
              .reverse()
              .join(", ");
            style[property] = images;
            const prevSpanEls = [...contentEl.children];
            const newSpanEl = $.createElement(contentEl, {
              type: "span",
              style,
              attributes: {
                image: imageNames,
              },
            });
            if (!enterElements.has(newSpanEl)) {
              enterElements.set(newSpanEl, []);
            }
            // 'set' is equivalent to calling 'hide' on all previous elements on the layer,
            // before calling 'show' on the new element
            if (e.control === "set") {
              // Hide previous elements
              for (const prevSpanEl of prevSpanEls) {
                if (!exitElements.has(prevSpanEl)) {
                  exitElements.set(prevSpanEl, []);
                }
                const hideEvent = {
                  name: hideWith,
                  after: hideAfter,
                  over: hideOver,
                };
                const prevSpanAnimations = exitElements.get(prevSpanEl)!;
                $.queueAnimationEvent(hideEvent, instant, prevSpanAnimations);
              }
              // Show new elements
              const showEvent = {
                name: showWith,
                after: showAfter,
                over: showOver,
              };
              const newSpanAnimations = enterElements.get(newSpanEl)!;
              $.queueAnimationEvent(showEvent, instant, newSpanAnimations);
            } else if (e.control === "hide") {
              const hideEvent = {
                name: hideWith,
                after: hideAfter,
                over: hideOver,
              };
              const newSpanAnimations = enterElements.get(newSpanEl)!;
              $.queueAnimationEvent(hideEvent, instant, newSpanAnimations);
            } else if (e.control === "show" || e.control === "animate") {
              const showEvent = {
                name: showWith,
                after: showAfter,
                over: showOver,
              };
              const newSpanAnimations = enterElements.get(newSpanEl)!;
              $.queueAnimationEvent(showEvent, instant, newSpanAnimations);
            }
            if (
              (e.control === "show" || e.control === "set") &&
              !targetRevealed
            ) {
              if (!enterElements.has(targetEl)) {
                enterElements.set(targetEl, []);
              }
              const targetAnimations = enterElements.get(targetEl)!;
              $.queueAnimationEvent(
                { name: "show", after: e.after },
                instant,
                targetAnimations
              );
              targetRevealed = true;
            }
          } else {
            // We are affecting the image wrapper
            if (!enterElements.has(targetEl)) {
              enterElements.set(targetEl, []);
            }
            const targetAnimations = enterElements.get(targetEl)!;
            if (e.control === "hide") {
              const hideEvent = {
                name: hideWith,
                after: hideAfter,
                over: hideOver,
              };
              $.queueAnimationEvent(hideEvent, instant, targetAnimations);
            } else if (e.control === "show" || e.control === "set") {
              const showEvent = {
                name: showWith,
                after: showAfter,
                over: showOver,
              };
              $.queueAnimationEvent(showEvent, instant, targetAnimations);
            } else if (e.control === "animate") {
              if (e.with) {
                const animateEvent = {
                  name: e.with,
                  after: e.after,
                  over: e.over,
                };
                $.queueAnimationEvent(animateEvent, instant, targetAnimations);
              }
            }
          }
        }
      }

      protected applyChanges(
        target: string,
        sequence: ImageInstruction[] | null,
        instant: boolean
      ): void {
        const enterElements = new Map<Element, Animation[]>();
        const exitElements = new Map<Element, Animation[]>();
        for (const targetEl of $.findElements(target)) {
          if (targetEl) {
            $.updateElement(targetEl, {
              style: { display: null },
            });
            // Enqueue image events
            if (sequence) {
              const imageEls = $.getOrCreateContentElements(targetEl, "image");
              for (const imageEl of imageEls) {
                this.process(
                  targetEl,
                  imageEl,
                  "background_image",
                  sequence,
                  instant,
                  enterElements,
                  exitElements
                );
              }
              const maskEls = $.getOrCreateContentElements(targetEl, "mask");
              for (const maskEl of maskEls) {
                this.process(
                  targetEl,
                  maskEl,
                  "mask_image",
                  sequence,
                  instant,
                  enterElements,
                  exitElements
                );
              }
            } else {
              const imageEls = $.getContentElements(targetEl, "image");
              for (const imageEl of imageEls) {
                $.clearElement(imageEl);
              }
              const maskEls = $.getContentElements(targetEl, "mask");
              for (const maskEl of maskEls) {
                $.clearElement(maskEl);
              }
            }
          }
        }
        const enterEffects = Array.from(enterElements).map(
          ([element, animations]) => ({ element, animations })
        );
        const exitEffects = Array.from(exitElements).map(
          ([element, animations]) => ({ element, animations })
        );
        // Animate in elements
        $.animateElements(enterEffects);
        // Animate out elements
        $.animateElements(exitEffects).then(() => {
          // Then destroy exited elements
          for (const e of exitEffects) {
            $.destroyElement(e.element);
          }
        });
      }

      clear(target: string): void {
        this.saveState(target, null);
        if ($.context?.system?.previewing || !$.context?.system?.simulating) {
          this.applyChanges(target, null, true);
        }
      }

      clearAll(targets: string[]): void {
        for (const target of targets) {
          this.clear(target);
        }
      }

      write(
        target: string,
        sequence: ImageInstruction[],
        instant = false
      ): void {
        if (
          sequence.some((e) => e.control === "set" || e.control === "show") &&
          !$.context.config?.ui.persistent.includes(target)
        ) {
          $._clearOnContinue.add(target);
        } else if ($.context.config?.ui.persistent.includes(target)) {
          this.saveState(target, sequence);
        }
        if ($.context?.system?.previewing || !$.context?.system?.simulating) {
          this.applyChanges(target, sequence, instant);
        }
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
          for (const [k, v] of Object.entries(style)) {
            if (v) {
              state[k] = v;
            } else {
              delete state[k];
            }
          }
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
        for (const targetEl of $.findElements(target)) {
          if (targetEl) {
            $.updateElement(targetEl, { style });
          }
        }
      }

      update(
        target: string,
        style: Record<string, string | null> | null
      ): void {
        this.saveState(target, style);
        if ($.context?.system?.previewing || !$.context?.system?.simulating) {
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
          for (const [k, v] of Object.entries(attributes)) {
            if (v) {
              state[k] = v;
            } else {
              delete state[k];
            }
          }
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
        for (const targetEl of $.findElements(target)) {
          if (targetEl) {
            $.updateElement(targetEl, { attributes });
          }
        }
      }

      update(
        target: string,
        attributes: Record<string, string | null> | null
      ): void {
        this.saveState(target, attributes);
        if ($.context?.system?.previewing || !$.context?.system?.simulating) {
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
