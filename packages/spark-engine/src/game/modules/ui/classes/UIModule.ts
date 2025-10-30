import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { sortFilteredName } from "@impower/sparkdown/src/compiler/utils/sortFilteredName";
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
    this.initLayouts();
  }

  override getBuiltins() {
    return uiBuiltinDefinitions();
  }

  override getStored(): string[] {
    return [];
  }

  override onReset() {
    this._firstUpdate = true;
    this._events = {};
  }

  override onConnected() {
    this._root = undefined;
    this._root = this.getOrCreateRootElement();
    this.constructStyles();
    this.constructLayouts();
    this.loadTheme();
    const transientTargets = this.getTransientTargets();
    this.text.clearAll(transientTargets);
    this.image.clearAll(transientTargets);
  }

  override async onRestore() {
    const tasks: Promise<void>[] = [];
    if (this._state.text) {
      for (const [target] of Object.entries(this._state.text)) {
        tasks.push(this.text.restore(target));
      }
    }
    if (this._state.image) {
      for (const [target] of Object.entries(this._state.image)) {
        tasks.push(this.image.restore(target));
      }
    }
    if (this._state.style) {
      for (const [target] of Object.entries(this._state.style)) {
        tasks.push(this.style.restore(target));
      }
    }
    if (this._state.attributes) {
      for (const [target] of Object.entries(this._state.attributes)) {
        tasks.push(this.attributes.restore(target));
      }
    }
    await Promise.all(tasks);
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

  protected async animateElements(
    effects: { element: Element; animations: Animation[] }[]
  ) {
    if (effects.length === 0) {
      return [];
    }
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
    const target = this.context.config?.ui?.layouts_element_name;
    if (target) {
      const uiRoot = this._root?.findChild(target);
      if (uiRoot) {
        this.updateElement(uiRoot, { style: { opacity: "0" } });
      }
    }
  }

  protected reveal() {
    const target = this.context.config?.ui.layouts_element_name;
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
        for (const image of Object.values(layeredImage.assets)) {
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
    const target = this.context.config?.ui.styles_element_name;
    const existingElement = target ? this._root.findChild(target) : undefined;
    return (
      existingElement ||
      this.createElement(this._root, {
        name: target,
      })
    );
  }

  protected getOrCreateRootLayoutElement(): Element {
    const style = {
      position: "absolute",
      inset: "0",
      font_size: "1em",
      opacity: "0",
    };
    if (!this._root) {
      this._root = this.getOrCreateRootElement();
    }
    const target = this.context.config?.ui.layouts_element_name;
    const existingElement = target ? this._root.findChild(target) : undefined;
    return (
      existingElement ||
      this.createElement(this._root, {
        name: target,
        style,
      })
    );
  }

  protected getLayoutElement(uiName: string): Element | undefined {
    const rootLayoutElement = this.getOrCreateRootLayoutElement();
    return rootLayoutElement.findChild(uiName);
  }

  constructStyles(): void {
    // Process Fonts
    const fonts = this.context?.font;
    if (fonts) {
      this.constructStyle("fonts", { fonts });
    }
    // Process Animations
    const animations = this.context?.animation;
    if (animations) {
      this.constructStyle("animations", { animations });
    }
    const styles = this.context?.style;
    if (styles) {
      this.constructStyle("styles", { styles });
    }
  }

  protected constructStyle(
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

  constructLayouts(...structNames: string[]): void {
    const targetAllStructs = !structNames || structNames.length === 0;
    const validStructNames = targetAllStructs
      ? Object.keys(this.context?.layout || {})
      : structNames;
    for (const structName of validStructNames) {
      if (structName && !structName.startsWith("$")) {
        const layout = this.context.layout?.[structName];
        if (layout) {
          this.constructLayout(layout);
        }
      }
    }
  }

  protected constructLayout(layout: Record<string, any>): Element {
    const structName = layout["$name"];
    const properties = getAllProperties(layout);
    const parent = this.getOrCreateRootLayoutElement();
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
          const child = cursor.children.find((c) => c.name === name);
          if (child) {
            cursor = child;
          } else {
            cursor = this.createElement(cursor, {
              type: "div",
              name,
            });
            const isLast = i === path.length - 1;
            const parent = path.at(-1);
            const parentClasses = parent?.split(" ") || [];
            const isText = parentClasses.includes("text");
            const isStroke = parentClasses.includes("stroke");
            const isImage = parentClasses.includes("image");
            const isMask = parentClasses.includes("mask");
            const text =
              isLast && (isText || isStroke) && typeof v === "string"
                ? v
                : undefined;
            const background_image =
              isLast && isImage
                ? this.getBackgroundImageFromValue(v)
                : undefined;
            const mask_image =
              isLast && isMask
                ? this.getBackgroundImageFromValue(v)
                : undefined;
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

  initLayouts(): void {
    for (const structName of Object.keys(this.context?.layout || {})) {
      if (structName && !structName.startsWith("$")) {
        const layout = this.context.layout?.[structName];
        if (layout) {
          this.initLayout(layout);
        }
      }
    }
  }

  initLayout(layout: Record<string, any>) {
    const properties = getAllProperties(layout);
    for (const [k, v] of Object.entries(properties)) {
      const path = k.startsWith(".") ? k.split(".").slice(1) : k.split(".");
      const isValidNode = !path.at(-1)?.startsWith("$");
      if (isValidNode) {
        for (let i = 0; i < path.length; i += 1) {
          const parent = path.at(-1);
          const parentClasses = parent?.split(" ") || [];
          const isText = parentClasses.includes("text");
          const isStroke = parentClasses.includes("stroke");
          const isImage = parentClasses.includes("image");
          const isMask = parentClasses.includes("mask");
          if (isText || isStroke || isImage || isMask) {
            if (v && typeof v === "object" && Object.keys(v).length === 0) {
              const grandParent = path.at(-2);
              if (grandParent) {
                this._clearOnContinue.add(grandParent);
              }
            }
          }
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

  hideLayout(...structNames: string[]): void {
    for (const structName of structNames) {
      if (structName) {
        const structEl = this.getLayoutElement(structName);
        if (structEl) {
          this.updateElement(structEl, { attributes: { hidden: "" } });
        }
      }
    }
  }

  showLayout(...structNames: string[]): void {
    for (const structName of structNames) {
      if (structName) {
        const structEl = this.getLayoutElement(structName);
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
      const definition = this.getAnimationDefinition(eventInstance);
      if (definition) {
        if (instant) {
          definition.timing.delay = "0s";
          definition.timing.duration = "0s";
        }
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
        if (sequence) {
          $._state.text ??= {};
          $._state.text[target] ??= [];
          const state = $._state.text[target]!;
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
          delete $._state.text?.[target];
        }
      }

      async restore(target: string) {
        const state = $._state.text?.[target];
        if (state) {
          await this.applyChanges(target, state, true);
        }
      }

      protected process(
        contentEl: Element,
        sequence: TextInstruction[],
        instant: boolean,
        enterElements: Map<Element, Animation[]>,
        _exitElements: Map<Element, Animation[]>
      ) {
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
        }
      }

      protected async applyChanges(
        target: string,
        sequence: TextInstruction[] | null,
        instant: boolean
      ) {
        const enterContentAnimationMap = new Map<Element, Animation[]>();
        const exitContentAnimationMap = new Map<Element, Animation[]>();
        for (const targetEl of $.findElements(target)) {
          if (targetEl) {
            const textEls = $.getContentElements(targetEl, "text");
            const strokeEls = $.getContentElements(targetEl, "stroke");
            if (sequence) {
              $.updateElement(targetEl, {
                style: { display: null },
                attributes: {
                  text: sequence?.map((t) => t.text).join("") ?? null,
                },
              });
              // Create and set text
              for (const textEl of textEls) {
                this.process(
                  textEl,
                  sequence,
                  instant,
                  enterContentAnimationMap,
                  exitContentAnimationMap
                );
              }
              // Create and set stroke
              for (const strokeEl of strokeEls) {
                this.process(
                  strokeEl,
                  sequence,
                  instant,
                  enterContentAnimationMap,
                  exitContentAnimationMap
                );
              }
            } else {
              // Clear text and stroke
              for (const textEl of textEls) {
                $.clearElement(textEl);
              }
              for (const strokeEl of strokeEls) {
                $.clearElement(strokeEl);
              }
              $.updateElement(targetEl, {
                style: { display: "none" },
                attributes: {
                  text: null,
                },
              });
            }
          }
        }
        const enterContentEffects = Array.from(enterContentAnimationMap).map(
          ([element, animations]) => ({ element, animations })
        );
        const exitContentEffects = Array.from(exitContentAnimationMap).map(
          ([element, animations]) => ({ element, animations })
        );
        // Animate in and out content
        await Promise.all([
          $.animateElements(enterContentEffects),
          $.animateElements(exitContentEffects),
        ]);
        // Then destroy exited content
        for (const e of exitContentEffects) {
          $.destroyElement(e.element);
        }
      }

      async clear(target: string) {
        this.saveState(target, null);
        if (!$.context?.system?.simulating) {
          await this.applyChanges(target, null, true);
        }
      }

      async clearAll(targets: string[]) {
        await Promise.all(targets.map((target) => this.clear(target)));
      }

      async write(
        target: string,
        sequence: TextInstruction[],
        instant = false
      ) {
        this.saveState(target, sequence);
        if (!$.context?.system?.simulating) {
          await this.applyChanges(target, sequence, instant);
        }
      }
    }
    return Text;
  })(this);

  Image = (($) => {
    class Image {
      protected saveState(target: string, sequence: ImageInstruction[] | null) {
        if (sequence) {
          $._state.image ??= {};
          $._state.image[target] ??= [];
          let state = $._state.image[target];
          for (const event of sequence) {
            const targetingContent = Boolean(event.assets?.length);
            if (targetingContent) {
              if (event.control === "show") {
                // Clear all previous hide target events
                state = state.filter(
                  (e) => !(e.control === "hide" && !e.assets?.length)
                );
                // Clear all previous content events
                state = state.filter((e) => !e.assets?.length);
                $._state.image ??= {};
                $._state.image[target] = state;
              }
              // TODO: If animate with none, clear all previous animation events
              state.push({
                control: event.control,
                with: event.with,
                assets: event.assets,
                over: 0,
              });
            } else {
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
            }
          }
        } else {
          delete $._state.image?.[target];
        }
      }

      async restore(target: string) {
        const state = $._state.image?.[target];
        if (state) {
          await this.applyChanges(target, state, true);
        }
      }

      protected process(
        targetEl: Element,
        content: {
          element: Element;
          property: string;
        }[],
        sequence: ImageInstruction[],
        instant: boolean,
        enterContentAnimationMap: Map<Element, Animation[]>,
        exitContentAnimationMap: Map<Element, Animation[]>,
        targetAnimationMap: Map<Element, Animation[]>
      ) {
        for (const e of sequence) {
          // Reveal target before showing content
          const isFirstContentReveal =
            e.control === "show" && e.assets && e.assets.length > 0;
          if (isFirstContentReveal) {
            const showEvent = {
              name: "show",
              after: e.after,
              over: 0,
            };
            if (!targetAnimationMap.has(targetEl)) {
              targetAnimationMap.set(targetEl, []);
            }
            $.queueAnimationEvent(
              showEvent,
              instant,
              targetAnimationMap.get(targetEl)!
            );
          }
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
                    const animateEvent = {
                      name: animateWith,
                      after: e.after,
                      over: e.over,
                    };
                    if (!enterContentAnimationMap.has(el)) {
                      enterContentAnimationMap.set(el, []);
                    }
                    $.queueAnimationEvent(
                      animateEvent,
                      instant,
                      enterContentAnimationMap.get(el)!
                    );
                  }
                }
              }
            }
          }
          if (e.assets && e.assets.length > 0) {
            for (const c of content) {
              const contentElement = c.element;
              const contentProperty = c.property;
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
              style[contentProperty] = images;
              const prevSpanEls = [...contentElement.children];
              const newSpanEl = $.createElement(contentElement, {
                type: "span",
                style,
                attributes: {
                  image: imageNames,
                },
              });
              // 'show' is equivalent to calling 'hide' on all previous elements on the layer,
              // before calling 'show' on the new element
              if (e.control === "show") {
                // Hide previous elements
                for (const prevSpanEl of prevSpanEls) {
                  const hideEvent = {
                    name: hideWith,
                    after: hideAfter,
                    over: hideOver,
                  };
                  if (!exitContentAnimationMap.has(prevSpanEl)) {
                    exitContentAnimationMap.set(prevSpanEl, []);
                  }
                  $.queueAnimationEvent(
                    hideEvent,
                    instant,
                    exitContentAnimationMap.get(prevSpanEl)!
                  );
                }
                // Show new elements
                const showEvent = {
                  name: showWith,
                  after: showAfter,
                  over: showOver,
                };
                if (!enterContentAnimationMap.has(newSpanEl)) {
                  enterContentAnimationMap.set(newSpanEl, []);
                }
                $.queueAnimationEvent(
                  showEvent,
                  instant,
                  enterContentAnimationMap.get(newSpanEl)!
                );
              } else if (e.control === "hide") {
                const hideEvent = {
                  name: hideWith,
                  after: hideAfter,
                  over: hideOver,
                };
                if (!exitContentAnimationMap.has(newSpanEl)) {
                  exitContentAnimationMap.set(newSpanEl, []);
                }
                $.queueAnimationEvent(
                  hideEvent,
                  instant,
                  exitContentAnimationMap.get(newSpanEl)!
                );
              } else if (e.control === "animate") {
                const showEvent = {
                  name: showWith,
                  after: showAfter,
                  over: showOver,
                };
                if (!enterContentAnimationMap.has(newSpanEl)) {
                  enterContentAnimationMap.set(newSpanEl, []);
                }
                $.queueAnimationEvent(
                  showEvent,
                  instant,
                  enterContentAnimationMap.get(newSpanEl)!
                );
              }
            }
          } else {
            // We are affecting the image wrapper
            if (e.control === "hide") {
              const hideEvent = {
                name: hideWith,
                after: hideAfter,
                over: hideOver,
              };
              if (!targetAnimationMap.has(targetEl)) {
                targetAnimationMap.set(targetEl, []);
              }
              $.queueAnimationEvent(
                hideEvent,
                instant,
                targetAnimationMap.get(targetEl)!
              );
            } else if (e.control === "show") {
              const showEvent = {
                name: showWith,
                after: showAfter,
                over: showOver,
              };
              if (!targetAnimationMap.has(targetEl)) {
                targetAnimationMap.set(targetEl, []);
              }
              $.queueAnimationEvent(
                showEvent,
                instant,
                targetAnimationMap.get(targetEl)!
              );
            } else if (e.control === "animate") {
              if (e.with) {
                const animateEvent = {
                  name: e.with,
                  after: e.after,
                  over: e.over,
                };
                if (!targetAnimationMap.has(targetEl)) {
                  targetAnimationMap.set(targetEl, []);
                }
                $.queueAnimationEvent(
                  animateEvent,
                  instant,
                  targetAnimationMap.get(targetEl)!
                );
              }
            }
          }
        }
      }

      protected async applyChanges(
        target: string,
        sequence: ImageInstruction[] | null,
        instant: boolean
      ) {
        const enterContentAnimationMap = new Map<Element, Animation[]>();
        const exitContentAnimationMap = new Map<Element, Animation[]>();
        const targetAnimationMap = new Map<Element, Animation[]>();
        for (const targetEl of $.findElements(target)) {
          if (targetEl) {
            const imageEls = $.getContentElements(targetEl, "image");
            const maskEls = $.getContentElements(targetEl, "mask");
            // Enqueue image events
            if (sequence) {
              $.updateElement(targetEl, {
                style: { display: null },
              });
              this.process(
                targetEl,
                [
                  ...imageEls.map((element) => ({
                    element,
                    property: "background_image",
                  })),
                  ...maskEls.map((element) => ({
                    element,
                    property: "mask_image",
                  })),
                ],
                sequence,
                instant,
                enterContentAnimationMap,
                exitContentAnimationMap,
                targetAnimationMap
              );
            } else {
              for (const imageEl of imageEls) {
                $.clearElement(imageEl);
              }
              for (const maskEl of maskEls) {
                $.clearElement(maskEl);
              }
              $.updateElement(targetEl, {
                style: { display: "none" },
              });
            }
          }
        }
        const targetEffects = Array.from(targetAnimationMap).map(
          ([element, animations]) => ({ element, animations })
        );
        const enterContentEffects = Array.from(enterContentAnimationMap).map(
          ([element, animations]) => ({ element, animations })
        );
        const exitContentEffects = Array.from(exitContentAnimationMap).map(
          ([element, animations]) => ({ element, animations })
        );
        // Animate target
        await $.animateElements(targetEffects);
        // Animate in and out content
        await Promise.all([
          $.animateElements(enterContentEffects),
          $.animateElements(exitContentEffects),
        ]);
        // Then destroy exited content
        for (const e of exitContentEffects) {
          $.destroyElement(e.element);
        }
      }

      async clear(target: string) {
        this.saveState(target, null);
        if (!$.context?.system?.simulating) {
          await this.applyChanges(target, null, true);
        }
      }

      async clearAll(targets: string[]) {
        await Promise.all(targets.map((target) => this.clear(target)));
      }

      async write(
        target: string,
        sequence: ImageInstruction[],
        instant = false
      ) {
        this.saveState(target, sequence);
        if (!$.context?.system?.simulating) {
          await this.applyChanges(target, sequence, instant);
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

      async restore(target: string) {
        const state = $._state.style?.[target];
        if (state) {
          await this.applyChanges(target, state);
        }
      }

      protected async applyChanges(
        target: string,
        style: Record<string, string | null> | null
      ) {
        for (const targetEl of $.findElements(target)) {
          if (targetEl) {
            $.updateElement(targetEl, { style });
          }
        }
      }

      async update(
        target: string,
        style: Record<string, string | null> | null
      ) {
        this.saveState(target, style);
        if (!$.context?.system?.simulating) {
          await this.applyChanges(target, style);
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

      async restore(target: string) {
        const state = $._state.attributes?.[target];
        if (state) {
          await this.applyChanges(target, state);
        }
      }

      protected async applyChanges(
        target: string,
        attributes: Record<string, string | null> | null
      ) {
        for (const targetEl of $.findElements(target)) {
          if (targetEl) {
            $.updateElement(targetEl, { attributes });
          }
        }
      }

      async update(
        target: string,
        attributes: Record<string, string | null> | null
      ) {
        this.saveState(target, attributes);
        if (!$.context?.system?.simulating) {
          await this.applyChanges(target, attributes);
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
