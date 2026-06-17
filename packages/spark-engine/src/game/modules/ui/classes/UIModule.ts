import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { sortFilteredName } from "@impower/sparkdown/src/compiler/utils/sortFilteredName";
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
import { Ease } from "../types/Ease";
import { ElementContent } from "../types/ElementContent";
import { ElementState } from "../types/ElementState";
import { Image } from "../types/Image";
import { ImageState } from "../types/ImageState";
import { TextState } from "../types/TextState";
import { UIBuiltins, uiBuiltinDefinitions } from "../uiBuiltinDefinitions";
import { getVarName } from "../utils/getVarName";
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
import {
  WriteImageInstruction,
  WriteImageMessage,
  WriteImageMessageMap,
} from "./messages/WriteImageMessage";
import {
  WriteTextMessage,
  WriteTextMessageMap,
} from "./messages/WriteTextMessage";

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
  UpdateElementMessageMap &
  WriteImageMessageMap &
  WriteTextMessageMap;

export class UIModule extends Module<UIState, UIMessageMap, UIBuiltins> {
  protected _root?: Element;

  protected _events: Partial<
    Record<string, Record<string, (event: Event) => void>>
  > = {};

  protected _clearOnContinue: Set<string> = new Set();

  constructor(game: Game) {
    super(game);
    this.initScreens();
  }

  override getBuiltins() {
    return uiBuiltinDefinitions();
  }

  override getStored(): string[] {
    return [];
  }

  override onReset() {
    this._events = {};
  }

  override async onConnected() {
    this._root = undefined;
    this._root = this.getOrCreateRootElement();
    this.constructStyles();
    this.constructScreens();
    this.loadTheme();
    const transientTargets = this.getTransientTargets();
    await Promise.all([
      this.text.clearAll(transientTargets),
      this.image.clearAll(transientTargets),
    ]);
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

  protected generateId() {
    // Id must start with a letter
    return "e-" + this.context.system.uuid();
  }

  protected createElement(
    parent: Element | null,
    state?: ElementState,
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
      }),
    );
    return el;
  }

  protected createImage(
    parent: Element | null,
    imageAssets: unknown[],
    property: string,
    state?: ElementState,
  ): Element {
    const background = imageAssets
      .map((a) => this.getBackgroundImageFromValue(a))
      .reverse()
      .join(", ");
    const el = this.createElement(parent, {
      name: "instance",
      type: "span",
      ...state,
      style: { ...(state?.style || {}), [property]: background },
    });
    const src = imageAssets.flatMap((a) => this.getImageSrcsFromValue(a))[0];
    if (src) {
      this.createElement(el, {
        name: "object",
        type: "img",
        attributes: { src },
      });
    }
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
      }),
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
      }),
    );
  }

  protected async animateElements(
    effects: { element: Element; animations: Animation[] }[],
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
      }),
    );
  }

  protected conceal() {
    const target = this.context.config?.ui?.screens_element_name;
    if (target) {
      const uiRoot = this._root?.findChild(target);
      if (uiRoot) {
        this.updateElement(uiRoot, { style: { opacity: "0" } });
      }
    }
  }

  reveal() {
    const target = this.context.config?.ui.screens_element_name;
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

  getUrl(src: string) {
    return `url("${src}")`;
  }

  getTimingFunction(ease: Ease) {
    return `${ease.function}(${ease.parameters.join(",")})`;
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
        // `assets` can be missing/empty for a malformed or not-yet-populated
        // layered_image — guard so one bad struct doesn't throw
        // `Object.values(undefined)` and abort the whole UI restore.
        for (const image of Object.values(layeredImage.assets ?? {})) {
          if (image && typeof image === "object") {
            images.push(...this.getImageAssets(image.$type, image.$name));
          }
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

  getImageSrcsByName(name: string) {
    const imageName = name.includes("~") ? sortFilteredName(name) : name;
    if (this.context?.filtered_image?.[imageName]) {
      filterImage(this.context, this.context?.filtered_image?.[imageName]);
      if (this.context?.filtered_image?.[imageName].filtered_src) {
        return [this.context?.filtered_image?.[imageName].filtered_src];
      }
    }
    if (this.context?.layered_image?.[imageName]) {
      return this.getImageAssets("layered_image", imageName).map(
        (asset) => asset.src,
      );
    }
    if (this.context?.image?.[imageName]) {
      return [this.context?.image?.[imageName].src];
    }
    return null;
  }

  getImageSrcsFromValue(value: unknown) {
    if (value != null && typeof value === "string") {
      return this.getImageSrcsByName(value);
    }
    if (
      value != null &&
      typeof value === "object" &&
      "$name" in value &&
      typeof value.$name === "string"
    ) {
      return this.getImageSrcsByName(value.$name);
    }
    return undefined;
  }

  getBackgroundImageFromLiteral(value: string) {
    if (value === "none" || value.includes("(")) {
      return value;
    }
    return `linear-gradient(${value})`;
  }

  getBackgroundImageFromString(value: string) {
    if (value.at(0) === '"' && value.at(-1) === '"') {
      const literalStringValue = value.slice(1, -1);
      return this.getBackgroundImageFromLiteral(literalStringValue);
    }
    const srcs = this.getImageSrcsByName(value);
    if (srcs) {
      return srcs
        .map((src) => this.getUrl(src))
        .reverse()
        .join(", ");
    }
    return this.getBackgroundImageFromLiteral(value);
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
      return this.getBackgroundImageFromString(value.$name);
    }
    return undefined;
  }

  createRootStyle() {
    const style: Record<string, string> = {
      position: "absolute",
      inset: "0",
    };
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

  protected getOrCreateRootScreenElement(): Element {
    const style = {
      position: "absolute",
      inset: "0",
      font_size: "1em",
      opacity: "0",
    };
    if (!this._root) {
      this._root = this.getOrCreateRootElement();
    }
    const target = this.context.config?.ui.screens_element_name;
    const existingElement = target ? this._root.findChild(target) : undefined;
    return (
      existingElement ||
      this.createElement(this._root, {
        name: target,
        style,
      })
    );
  }

  protected getScreenElement(uiName: string): Element | undefined {
    const rootScreenElement = this.getOrCreateRootScreenElement();
    return rootScreenElement.findChild(uiName);
  }

  constructStyles(): void {
    const variablesStyle: Record<string, string> = {};
    const images = this.context?.image;
    if (images) {
      for (const [name, image] of Object.entries(images)) {
        if (!name.startsWith("$")) {
          const varName = getVarName("image", name);
          const varValue = this.getUrl(image.src);
          if (varValue) {
            variablesStyle[varName] = varValue;
          }
        }
      }
    }
    const colors = this.context?.color;
    if (colors) {
      for (const [name, color] of Object.entries(colors)) {
        if (!name.startsWith("$")) {
          const varName = getVarName("color", name);
          const varValue = color.value;
          if (varValue) {
            variablesStyle[varName] = varValue;
          }
        }
      }
    }
    const eases = this.context?.ease;
    if (eases) {
      for (const [name, ease] of Object.entries(eases)) {
        if (!name.startsWith("$")) {
          const varName = getVarName("ease", name);
          const varValue = this.getTimingFunction(ease);
          if (varValue) {
            variablesStyle[varName] = varValue;
          }
        }
      }
    }
    const fonts = this.context?.font;
    if (fonts) {
      for (const [name] of Object.entries(fonts)) {
        if (!name.startsWith("$")) {
          const varName = getVarName("font", name);
          const varValue = name;
          if (varValue) {
            variablesStyle[varName] = varValue;
          }
        }
      }
    }
    this.constructStyle("variables", {
      styles: {
        "": variablesStyle,
      },
    });
    // Process Fonts
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
    content: ElementContent,
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

  constructScreens(...structNames: string[]): void {
    const targetAllStructs = !structNames || structNames.length === 0;
    const validStructNames = targetAllStructs
      ? Object.keys(this.context?.screen || {})
      : structNames;
    for (const structName of validStructNames) {
      if (structName && !structName.startsWith("$")) {
        const screen = this.context.screen?.[structName];
        if (screen) {
          this.constructScreen(screen);
        }
      }
    }
  }

  protected constructScreen(screen: Record<string, any>): Element {
    const structName = screen["$name"];
    const properties = getAllProperties(screen);
    const parent = this.getOrCreateRootScreenElement();
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
        let stack: Element[] = [uiEl];
        for (let i = 0; i < path.length; i += 1) {
          const name = path[i]!;
          const child = stack.at(-1)!.children.find((c) => c.name === name);
          if (child) {
            stack.push(child);
          } else {
            stack.push(
              this.createElement(stack.at(-1)!, {
                type: "div",
                name,
              }),
            );
            const parent = stack.at(-1)!;
            const isLast = i === path.length - 1;
            if (isLast) {
              const parentName = path.at(-1);
              const parentClasses = parentName?.split(" ") || [];
              const isText = parentClasses.includes("text");
              const isStroke = parentClasses.includes("stroke");
              const isImage = parentClasses.includes("image");
              const isMask = parentClasses.includes("mask");
              const text =
                (isText || isStroke) && typeof v === "string" ? v : undefined;
              if (text) {
                this.createElement(parent, {
                  type: "span",
                  content: { text },
                  style: { display: "inline" },
                });
              }
              if (isImage) {
                this.createImage(parent, [v], "background_image");
              }
              if (isMask) {
                this.createImage(parent, [v], "mask_image");
              }
            }
          }
        }
      }
    }
    return uiEl;
  }

  initScreens(): void {
    for (const structName of Object.keys(this.context?.screen || {})) {
      if (structName && !structName.startsWith("$")) {
        const screen = this.context.screen?.[structName];
        if (screen) {
          this.initScreen(screen);
        }
      }
    }
  }

  initScreen(screen: Record<string, any>) {
    const properties = getAllProperties(screen);
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
        }),
      );
    }
  }

  hideScreen(...structNames: string[]): void {
    for (const structName of structNames) {
      if (structName) {
        const structEl = this.getScreenElement(structName);
        if (structEl) {
          this.updateElement(structEl, { attributes: { hidden: "" } });
        }
      }
    }
  }

  showScreen(...structNames: string[]): void {
    for (const structName of structNames) {
      if (structName) {
        const structEl = this.getScreenElement(structName);
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
    found: Element[] = [],
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
    tag: "image" | "text" | "mask" | "stroke",
  ): Element[] {
    return element.findChildren(tag);
  }

  findIds(target: string): string[] {
    return this.findElements(target).map((c) => c.id);
  }

  getTransientTargets() {
    return Array.from(this._clearOnContinue.values());
  }

  getAnimationDefinition(
    event: {
      name: string;
      after?: number;
      over?: number;
      ease?: string;
      loop?: boolean;
    },
    instant: boolean,
  ): Animation | undefined {
    const { name, after, over, ease, loop } = event;
    const delayOverride = `${after ?? 0}s`;
    const durationOverride = over != null ? `${over}s` : null;
    const easeDefinition = ease ? this.context?.ease?.[ease] : null;
    const easingOverride =
      easeDefinition != null ? this.getTimingFunction(easeDefinition) : null;
    const loopOverride =
      loop === true ? "infinite" : loop === false ? 1 : undefined;
    const animation = this.context?.animation?.[name] as Animation;
    if (animation) {
      const delay = delayOverride ?? animation?.timing?.delay ?? "0s";
      const duration = durationOverride ?? animation?.timing?.duration ?? "0s";
      const iterations = loopOverride ?? animation?.timing?.iterations ?? 1;
      const easing = easingOverride ?? animation?.timing?.easing ?? "ease";
      // `fill`/`direction` (and the timing fields above) come from the
      // animation's resolved `timing`, which is inherited from the `animation`
      // type's `$default` at compile time (see
      // SparkdownCompiler.populateDefinedDefaultProperties). So an authored
      // `define pan_right as animation with keyframes = {...}` already carries
      // `fill: "both"` here without needing a per-consumer default. These `??`
      // are only a defensive floor for a context with no resolved timing.
      const fill = animation?.timing?.fill ?? "none";
      const direction = animation?.timing?.direction ?? "normal";
      // Authored `define X as animation with keyframes = {...}` lowers to a
      // single keyframe OBJECT, not an array (e.g. pan_left/pan_right's
      // `{ background_position: "left" }`). AnimationPlayer expects an array, so
      // wrap a lone keyframe into a one-element array.
      const rawKeyframes = animation?.keyframes;
      const keyframes = Array.isArray(rawKeyframes)
        ? rawKeyframes
        : rawKeyframes != null
          ? [rawKeyframes]
          : [];
      const timing = {
        delay,
        duration,
        iterations,
        easing,
        fill,
        direction,
      };
      if (instant) {
        timing.delay = "0s";
        timing.duration = "0s";
      }
      return {
        $type: animation.$type,
        $name: animation.$name,
        // `target` is optional when authoring (e.g. `define pan_left as
        // animation with keyframes = {...}`), so default it to the animated
        // element itself — matching `default_animation`.
        target: animation.target ?? { $type: "layer", $name: "self" },
        keyframes,
        timing,
      };
    }
    return undefined;
  }

  enqueueAnimation(
    element: Element,
    animation: Animation,
    animationMap: Map<Element, Animation[]>,
  ) {
    const selector = animation.target?.$name ?? "self";
    const animateEls =
      selector === "self" || element.isMatch(selector)
        ? [element]
        : this.searchForAll(element, selector);
    for (const animateEl of animateEls) {
      if (!animationMap.has(animateEl)) {
        animationMap.set(animateEl, []);
      }
      animationMap.get(animateEl)!.push(animation);
    }
  }

  protected setEventListener<T extends keyof EventMap>(
    event: T,
    target: string,
    callback: ((event: EventMap[T]) => any) | null,
    stopPropagation = true,
    once = false,
  ): boolean {
    const targetEls = this.findElements(target);
    for (const targetEl of targetEls) {
      const style = { pointer_events: "auto" };
      this.updateElement(targetEl, { style });
      if (callback) {
        this.emit(
          ObserveElementMessage.type.request({
            element: targetEl.id,
            event,
            stopPropagation,
            once,
          }),
        );
        this._events[event] ??= {};
        this._events[event]![targetEl.id] = callback as (event: Event) => any;
      } else {
        delete this._events[event]?.[targetEl.id];
        this.emit(
          UnobserveElementMessage.type.request({
            element: targetEl.id,
            event,
          }),
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
    once = false,
  ): boolean {
    return this.setEventListener(
      event,
      target,
      callback,
      stopPropagation,
      once,
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

      protected async applyChanges(
        target: string,
        sequence: TextInstruction[] | null,
        instant: boolean,
      ) {
        // [D14] The engine no longer builds per-glyph spans or per-letter
        // reveal animations. It still owns the structural target element tree
        // (so it can keep the flattened a11y `text` attribute + the reveal
        // target's `display` toggle authoritative), but it delegates the
        // span/whitespace/text-align decomposition AND the per-char reveal of
        // the `text`/`stroke` content children to the consumer via a single
        // `ui/write-text` message per target.
        const targetEls = $.findElements(target);
        for (const targetEl of targetEls) {
          if (targetEl) {
            if (sequence) {
              $.updateElement(targetEl, {
                style: { display: null },
                attributes: {
                  text: sequence?.map((t) => t.text).join("") ?? null,
                },
              });
            } else {
              $.updateElement(targetEl, {
                style: { display: "none" },
                attributes: {
                  text: null,
                },
              });
            }
          }
        }
        if (targetEls.length === 0) {
          return;
        }
        // One message per write — the consumer rebuilds the `text`/`stroke`
        // children and drives the reveal from each instruction's after/over
        // timing. `await` here preserves the prior `await animateElements()`
        // lifecycle: the write completes only once the reveal has finished.
        await $.emit(
          WriteTextMessage.type.request({
            target,
            instructions: sequence ?? [],
            instant,
          }),
        );
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
        instant = false,
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
                  (e) => !(e.control === "hide" && !e.assets?.length),
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
                (e) => !e.assets?.length && e.control !== "animate",
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

      /**
       * [D15] Resolve an `ImageInstruction[]` into a renderer-agnostic
       * `WriteImageInstruction[]`. This keeps ALL engine-context lookups
       * (transition resolution, `getAnimationDefinition`,
       * `getBackgroundImageFromString`/src resolution) engine-side — it just
       * ships the resolved CSS strings + `Animation` objects instead of
       * building DOM and emitting per-element `ui/create`/`ui/animate`/
       * `ui/destroy`. The consumer realizes the `instance` span(s) + drives the
       * enter/exit/destroy lifecycle. Mirrors D14 (`getRevealAnimation`).
       */
      protected resolve(
        sequence: ImageInstruction[],
        instant: boolean,
      ): WriteImageInstruction[] {
        const instructions: WriteImageInstruction[] = [];
        for (const e of sequence) {
          const out: WriteImageInstruction = { control: e.control };
          const targetAnimations: Animation[] = [];
          const affected: { target: string; animations: Animation[] }[] = [];
          // Reveal target before showing content
          const isFirstContentReveal =
            e.control === "show" && e.assets && e.assets.length > 0;
          if (isFirstContentReveal) {
            const showEvent = {
              name: "show",
              after: e.after,
              over: 0,
              ease: e.ease,
            };
            const animation = $.getAnimationDefinition(showEvent, instant);
            if (animation) {
              targetAnimations.push(animation);
            }
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
              (a) => getTimeValue(a.timing.duration) ?? 0,
            ),
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
          const showEase = e.ease;
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
          const hideEase = e.ease;
          // Animate any other elements affected by the transition. These are
          // arbitrary class selectors (e.g. `transitional`) → animation, so the
          // consumer re-resolves the selector against the live DOM.
          if (transition) {
            for (const [k, v] of Object.entries(transition)) {
              if (!k.startsWith("$") && !k.startsWith("on_")) {
                const animateWith = typeof v === "string" ? v : v?.$name;
                if (animateWith) {
                  const animateEvent = {
                    name: animateWith,
                    after: e.after,
                    over: e.over,
                    ease: e.ease,
                  };
                  const animation = $.getAnimationDefinition(
                    animateEvent,
                    instant,
                  );
                  if (animation) {
                    affected.push({ target: k, animations: [animation] });
                  }
                }
              }
            }
          }
          if (e.assets && e.assets.length > 0) {
            // Resolve the content layer once (identical for image + mask
            // content elements; only the CSS property differs, picked
            // consumer-side). The consumer creates the `instance` span(s).
            const imageNames = e.assets.join(" ");
            const background = e.assets
              .map((a) => $.getBackgroundImageFromString(a))
              .reverse()
              .join(", ");
            const src = e.assets.flatMap((a) =>
              $.getImageSrcsFromValue(a),
            )[0];
            const content: WriteImageInstruction["content"] = {
              background,
              imageNames,
            };
            if (src != null) {
              content.src = src;
            }
            if (e.control === "show") {
              const showEvent = {
                name: showWith,
                after: showAfter,
                over: showOver,
                ease: showEase,
              };
              const enterAnimation = $.getAnimationDefinition(
                showEvent,
                instant,
              );
              if (enterAnimation) {
                content.enterAnimation = enterAnimation;
              }
              const hideEvent = {
                name: hideWith,
                after: hideAfter,
                over: hideOver,
                ease: hideEase,
              };
              const previousHideAnimation = $.getAnimationDefinition(
                hideEvent,
                instant,
              );
              if (previousHideAnimation) {
                content.previousHideAnimation = previousHideAnimation;
              }
            } else if (e.control === "hide") {
              const hideEvent = {
                name: hideWith,
                after: hideAfter,
                over: hideOver,
                ease: hideEase,
              };
              const exitAnimation = $.getAnimationDefinition(
                hideEvent,
                instant,
              );
              if (exitAnimation) {
                content.exitAnimation = exitAnimation;
              }
            } else if (e.control === "animate") {
              const showEvent = {
                name: showWith,
                after: showAfter,
                over: showOver,
                ease: showEase,
              };
              const enterAnimation = $.getAnimationDefinition(
                showEvent,
                instant,
              );
              if (enterAnimation) {
                content.enterAnimation = enterAnimation;
              }
            }
            out.content = content;
          } else {
            // We are affecting the image wrapper (no assets): show/hide/animate
            // the target element itself.
            if (e.control === "hide") {
              const hideEvent = {
                name: hideWith,
                after: hideAfter,
                over: hideOver,
                ease: hideEase,
              };
              const animation = $.getAnimationDefinition(hideEvent, instant);
              if (animation) {
                targetAnimations.push(animation);
              }
            } else if (e.control === "show") {
              const showEvent = {
                name: showWith,
                after: showAfter,
                over: showOver,
                ease: showEase,
              };
              const animation = $.getAnimationDefinition(showEvent, instant);
              if (animation) {
                targetAnimations.push(animation);
              }
            } else if (e.control === "animate") {
              if (e.with) {
                const animateEvent = {
                  name: e.with,
                  after: e.after,
                  over: e.over,
                  ease: e.ease,
                };
                const animation = $.getAnimationDefinition(
                  animateEvent,
                  instant,
                );
                if (animation) {
                  targetAnimations.push(animation);
                }
              }
            }
          }
          if (targetAnimations.length > 0) {
            out.targetAnimations = targetAnimations;
          }
          if (affected.length > 0) {
            out.affected = affected;
          }
          instructions.push(out);
        }
        return instructions;
      }

      protected async applyChanges(
        target: string,
        sequence: ImageInstruction[] | null,
        instant: boolean,
      ) {
        // [D15] The engine no longer builds the per-layer `instance` span DOM,
        // the crossfade enter/exit animations, or the prior-layer destroys. It
        // still owns the structural target element tree (the `display` toggle on
        // the `backdrop`/`portrait` wrapper) but delegates the image-layer
        // realization + animation lifecycle to the consumer via a single
        // `ui/write-image` carrying a fully-resolved `WriteImageInstruction[]`.
        const targetEls = $.findElements(target);
        for (const targetEl of targetEls) {
          if (targetEl) {
            if (sequence) {
              $.updateElement(targetEl, {
                style: { display: null },
              });
            } else {
              $.updateElement(targetEl, {
                style: { display: "none" },
              });
            }
          }
        }
        if (targetEls.length === 0) {
          return;
        }
        // One message per write — the consumer rebuilds the image/mask content
        // children and drives the enter/exit/destroy lifecycle. `await` here
        // preserves the prior `await animateElements()` lifecycle: the write
        // completes only once the crossfade animations have finished (so
        // auto-advance still waits on the reveal).
        await $.emit(
          WriteImageMessage.type.request({
            target,
            instructions: sequence ? this.resolve(sequence, instant) : [],
            instant,
          }),
        );
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
        instant = false,
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
        style: Record<string, string | null> | null,
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
        style: Record<string, string | null> | null,
      ) {
        for (const targetEl of $.findElements(target)) {
          if (targetEl) {
            $.updateElement(targetEl, { style });
          }
        }
      }

      async update(
        target: string,
        style: Record<string, string | null> | null,
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
        attributes: Record<string, string | null> | null,
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
        attributes: Record<string, string | null> | null,
      ) {
        for (const targetEl of $.findElements(target)) {
          if (targetEl) {
            $.updateElement(targetEl, { attributes });
          }
        }
      }

      async update(
        target: string,
        attributes: Record<string, string | null> | null,
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
