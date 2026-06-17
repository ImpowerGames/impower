import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { sortFilteredName } from "@impower/sparkdown/src/compiler/utils/sortFilteredName";
import type {
  Binding,
  BodyNode,
  ContentPart,
  ElementNode,
  EventBinding,
  ForNode,
  IfNode,
  MatchNode,
  ScreenNode,
} from "@impower/sparkdown/src/compiler/types/SparkleNode";
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
  MoveElementMessage,
  MoveElementMessageMap,
} from "./messages/MoveElementMessage";
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

/** Loop-variable bindings in effect for a scope: each enclosing `for` loop's
 *  variable name → its current iteration value. Empty at the screen root.
 *  Passed as args to a binding evaluator via {@link Binding.params}. The object
 *  reference is stable per for-iteration and mutated in place on re-eval, so
 *  event-handler closures read the latest values. */
type ReactiveEnv = Record<string, unknown>;

/** The globals + table identities a binding read, captured during its eval
 *  (Phase 4). A registration re-runs only when its deps intersect the turn's
 *  change-set — unless it's in a loop-iteration scope (its value depends on the
 *  per-iteration `env`, which isn't a tracked global/table), in which case it
 *  re-evaluates every turn (equality-gated). */
type ReactiveDeps = { globals: Set<string>; tables: Set<object> };

/** A reactive span: an inline element whose text comes (partly) from a `{expr}`
 *  binding, with the last resolved value for equality-gated updates + the deps
 *  that gate its re-eval. */
interface ReactiveText {
  element: Element;
  content: ContentPart[];
  last: string;
  deps: ReactiveDeps;
}

/** An if/match conditional: a persistent wrapper element + the currently-active
 *  branch index (`-1` = else/no-match, `-2` = not yet mounted) + the child scope
 *  holding that branch's registrations (dropped when the branch switches). */
interface CondRegion {
  kind: "cond";
  wrapper: Element;
  node: IfNode | MatchNode;
  active: number;
  scope: ReactiveScope;
  /** Deps of the branch-selection (the condition/expr/case-value reads), gating
   *  whether `selectBranch` is re-run on a turn. */
  deps: ReactiveDeps;
}

/** One rendered item of a reactive `for`: its reconciliation key (table identity
 *  for objects, scalar value for primitives, or the entry key for `k,v` loops),
 *  the per-iteration `display:contents` sub-wrapper holding its body (moved as a
 *  unit on reorder, destroyed when the item is dropped), and its child scope
 *  (whose `env` carries the loop var values, mutated in place on re-eval). */
interface ForIteration {
  key: unknown;
  wrapper: Element;
  scope: ReactiveScope;
}

/** A reactive `for`: a persistent wrapper element + the current iterations (in
 *  order), or — when the iterable is empty — the mounted `else` scope. */
interface ForRegion {
  kind: "for";
  wrapper: Element;
  node: ForNode;
  iterations: ForIteration[];
  elseScope?: ReactiveScope;
}

type ReactiveRegion = CondRegion | ForRegion;

/** Reactive registrations produced by one mount pass, mirroring the mount tree
 *  so a subtree's spans + nested regions can be torn down together. `env` holds
 *  the loop-var bindings in effect for everything registered in this scope. */
interface ReactiveScope {
  env: ReactiveEnv;
  texts: ReactiveText[];
  regions: ReactiveRegion[];
}

export type UIMessageMap = AnimateElementsMessageMap &
  CreateElementMessageMap &
  DestroyElementMessageMap &
  MoveElementMessageMap &
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

  // Phase 3 reactive runtime: render screens from program.sparkle (the typed AST)
  // instead of the static context.screen struct, with coarse per-turn binding
  // re-eval. OFF by default — the static path stays the golden-master fallback
  // until the AST path reaches parity. Flipped per-increment / via config.
  protected _reactive = false;

  constructor(game: Game) {
    super(game);
    this.initScreens();
  }

  /**
   * Evaluate a reactive {@link Binding} to its live value by calling the hoisted
   * nullary evaluator the compiler emitted (`__binding_<offset>() return <expr>
   * end`, lowerSparkleBody.ts). Guarded by HasFunction so a snapshot-only /
   * never-hoisted binding returns `undefined` instead of throwing. MUST only be
   * called between turns (EvaluateFunction asserts IfAsyncWeCant). The story
   * already saves/restores its output stream around the call, so a pure binding
   * read can't leak narrative text.
   */
  protected evalBinding(binding: Binding, env?: ReactiveEnv): unknown {
    const exprId = binding?.exprId;
    if (!exprId) {
      return undefined;
    }
    const story = this._game.story;
    if (!story.HasFunction(exprId)) {
      return undefined;
    }
    // For a binding inside a `for` loop, the evaluator takes the enclosing loop
    // variables as parameters; pass their current values (raw runtime InkObjects
    // for table elements are accepted directly — see StoryState
    // .PassArgumentsToEvaluationStack). Non-loop bindings are nullary.
    const args = (binding.params ?? []).map((name) => env?.[name]);
    return story.EvaluateFunction(exprId, args);
  }

  override getBuiltins() {
    return uiBuiltinDefinitions();
  }

  override getStored(): string[] {
    return [];
  }

  override onReset() {
    this._events = {};
    this._rootScopes = [];
  }

  override async onConnected() {
    this._root = undefined;
    this._root = this.getOrCreateRootElement();
    // Reactive render path: opt in via `config.ui.reactive = true`, OR via the
    // flag set directly before connect (the test harness). OR-in so an explicit
    // harness flag isn't clobbered and the static path stays the default.
    this._reactive = this._reactive || !!this.context.config?.ui?.reactive;
    this.constructStyles();
    if (this._reactive && this._game.program?.sparkle?.screens) {
      this.constructScreensFromAst();
    } else {
      this.constructScreens();
    }
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

  /** Move an existing element to sit immediately before `before` among its
   *  siblings (or to the end when `before` is null), emitting `ui/move`. Used by
   *  keyed `for` reconciliation to relocate a retained item's subtree instead of
   *  rebuilding it (preserving focus / scroll / in-flight animation). */
  protected moveElement(element: Element, before: Element | null): void {
    const parent = element.parent;
    if (!parent) {
      return;
    }
    parent.moveChildBefore(element, before);
    this.emit(
      MoveElementMessage.type.request({
        element: element.id,
        before: before?.id ?? null,
      }),
    );
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

  // ---------------------------------------------------------------------------
  // Reactive runtime (Phase 3): mount screens from the typed Sparkle AST
  // (program.sparkle.screens) instead of the flattened context.screen struct.
  //
  // I1 — static mount: reproduce constructScreen's element tree byte-for-byte
  // (named structural divs; text/stroke → inline span; image/mask → background
  // span) so flag-ON output matches the static golden when no `{expr}` bindings
  // are present.
  // I2 — one-way binding eval: `{expr}` content is evaluated to its live value at
  // mount, the bound span is registered, and `refreshScreens()` re-evaluates +
  // updates changed spans on the coarse per-turn boundary (Coordinator.display).
  // I3 — if/match: each conditional mounts a PERSISTENT, layout-transparent
  // wrapper (`display: contents`) that reserves its sibling position. Only the
  // active branch's children live inside it; when the condition changes, the
  // wrapper's contents are torn down and the new branch is mounted in place —
  // so ordering survives even though ui/create is append-only. Reactive
  // registrations are kept in a scope TREE that mirrors the mount tree, so a
  // branch's spans/nested-regions are dropped together on unmount.
  // I4 — for: a persistent wrapper holds one rendered item per iterable element.
  // Loop-body bindings can't read loop vars as globals, so the compiler emits
  // them as evaluator PARAMETERS (Binding.params) and each iteration's scope
  // carries an `env` (loop var → value) passed as eval args. Reconcile is
  // POSITIONAL for now (slot i renders element i; reorder = in-place content
  // update, grow = append, shrink = drop tail) — keyed reconcile + MoveElement
  // are Phase 4. slot/fill and #prop bindings land later.
  // ---------------------------------------------------------------------------

  /** One {@link ReactiveScope} per mounted screen — the roots of the scope tree
   *  walked each turn by {@link refreshScreens}. Rebuilt on every mount. */
  protected _rootScopes: ReactiveScope[] = [];

  constructScreensFromAst(...structNames: string[]): void {
    this._rootScopes = [];
    const screens = this._game.program?.sparkle?.screens;
    if (!screens) {
      return;
    }
    // Enable fine-grained dependency tracking for the whole reactive lifetime;
    // mount captures each binding's read deps (Phase 4).
    this._game.story.variablesState.reactiveDepsEnabled = true;
    const targetAllScreens = !structNames || structNames.length === 0;
    const validScreenNames = targetAllScreens
      ? Object.keys(screens)
      : structNames;
    for (const screenName of validScreenNames) {
      if (screenName && !screenName.startsWith("$")) {
        const screen = screens[screenName];
        if (screen) {
          this.constructScreenFromAst(screen);
        }
      }
    }
    // Discard load-time change residue so the first per-turn refresh only sees
    // changes produced after mount.
    this._game.story.variablesState.takeReactiveChanges();
  }

  protected constructScreenFromAst(screen: ScreenNode): Element {
    const parent = this.getOrCreateRootScreenElement();
    const uiEl = this.createElement(parent, {
      type: "div",
      name: screen.name,
      style: {
        position: "absolute",
        inset: "0",
        display: "flex",
        flex_direction: "column",
      },
    });
    const scope: ReactiveScope = { env: {}, texts: [], regions: [] };
    this._rootScopes.push(scope);
    for (const child of screen.children) {
      this.mountNode(uiEl, child, scope);
    }
    return uiEl;
  }

  protected mountNode(
    parent: Element,
    node: BodyNode,
    scope: ReactiveScope,
  ): void {
    if (node.kind === "element") {
      this.mountElement(parent, node, scope);
    } else if (node.kind === "if" || node.kind === "match") {
      this.mountCondRegion(parent, node, scope);
    } else if (node.kind === "for") {
      this.mountForRegion(parent, node, scope);
    }
    // slot/fill are mounted in a later increment (component slot/fill).
  }

  protected mountElement(
    parent: Element,
    node: ElementNode,
    scope: ReactiveScope,
  ): Element {
    // Element name = builtin tag joined with its bare-word classes, matching the
    // static path's dotted-segment naming ("mask shadow_1", "text", "stage").
    const name = [node.tag, ...node.classes].join(" ");
    const el = this.createElement(parent, { type: "div", name });
    // Builtin leaf semantics: image/mask render a background span; everything
    // else with adjacency content (text/stroke, but also button/label/…) renders
    // it as an inline span. Content-less structural elements get no span
    // (mountTextContent no-ops), preserving constructScreen parity.
    if (node.tag === "image") {
      this.mountImageContent(el, node.content, "background_image", scope.env);
    } else if (node.tag === "mask") {
      this.mountImageContent(el, node.content, "mask_image", scope.env);
    } else {
      this.mountTextContent(el, node.content, scope);
    }
    for (const ev of node.events) {
      this.mountEvent(el, ev, scope);
    }
    for (const child of node.children) {
      this.mountNode(el, child, scope);
    }
    return el;
  }

  /** Wire a `@event=handler` on a mounted element: observe the DOM event and run
   *  the handler when it fires, then flush reactive screens. `@e=name` calls the
   *  named Luau function; `@e=expr(args)` evaluates the call expression (its
   *  side effects persist). Inline closures (`@e={ … }`) are a follow-up. The
   *  callback is keyed by element id in `_events`, the same registry the static
   *  `observe()` path and `onReceiveNotification` use. The handler reads
   *  `scope.env` at fire time (mutated in place per for-iteration), so a handler
   *  inside a `for` uses that row's current loop values. */
  protected mountEvent(el: Element, ev: EventBinding, scope: ReactiveScope): void {
    const handler = ev.handler;
    const callback = (): void => {
      if (handler.kind === "ref") {
        this.runHandlerFunction(handler.name);
      } else {
        // call / closure: evaluate the hoisted handler binding for its effects.
        this.evalBinding(handler.binding, scope.env);
      }
      this.refreshScreens();
    };
    this._events[ev.event] ??= {};
    this._events[ev.event]![el.id] = callback;
    // Make the element clickable + ask the renderer to forward the DOM event
    // (mirrors setEventListener's observe).
    this.updateElement(el, { style: { pointer_events: "auto" } });
    this.emit(
      ObserveElementMessage.type.request({
        element: el.id,
        event: ev.event as keyof EventMap,
        stopPropagation: true,
        once: false,
      }),
    );
  }

  /** Run a named Luau function (an `@event` `ref` handler) for its side effects,
   *  guarded by HasFunction. Safe between turns (EvaluateFunction asserts
   *  IfAsyncWeCant); events fire when the story is idle. */
  protected runHandlerFunction(name: string): void {
    const story = this._game.story;
    if (story.HasFunction(name)) {
      story.EvaluateFunction(name, []);
    }
  }

  /** Mount a text/stroke leaf's inline span. A content-less leaf creates no span
   *  (matching constructScreen's `typeof v === "string"` guard); content with a
   *  reactive `{expr}` binding registers the span in `scope` for per-turn
   *  re-eval. */
  protected mountTextContent(
    parent: Element,
    content: ContentPart[] | undefined,
    scope: ReactiveScope,
  ): void {
    if (!content || content.length === 0) {
      return;
    }
    const { text, deps } = this.resolveContentTracked(content, scope.env);
    const span = this.createElement(parent, {
      type: "span",
      content: { text },
      style: { display: "inline" },
    });
    if (this.contentHasBinding(content)) {
      scope.texts.push({ element: span, content, last: text, deps });
    }
  }

  /** Resolve content while capturing the union of its bindings' read deps, so
   *  the span re-evaluates only when one of those deps changes (Phase 4). */
  protected resolveContentTracked(
    content: ContentPart[],
    env: ReactiveEnv,
  ): { text: string; deps: ReactiveDeps } {
    const vs = this._game.story.variablesState;
    vs.beginReactiveRead();
    const text = this.resolveContent(content, env);
    const deps = vs.endReactiveRead();
    return { text, deps };
  }

  /** Mount an image/mask leaf's background span. Content (literal or `{expr}`)
   *  is resolved to the asset value at mount; a content-less leaf yields the
   *  empty background constructScreen also produces. (Per-turn re-eval of image
   *  sources is deferred — image rebuild differs from a content update.) */
  protected mountImageContent(
    parent: Element,
    content: ContentPart[] | undefined,
    property: string,
    env: ReactiveEnv,
  ): void {
    const value =
      content && content.length > 0
        ? this.resolveContent(content, env)
        : undefined;
    this.createImage(parent, [value], property);
  }

  // --- if / match -----------------------------------------------------------

  /** Mount an if/match conditional. A persistent `display: contents` wrapper
   *  reserves the sibling position; the active branch's children are mounted
   *  into it via a child scope (inheriting the parent's loop env), recorded as a
   *  region of the parent scope. */
  protected mountCondRegion(
    parent: Element,
    node: IfNode | MatchNode,
    scope: ReactiveScope,
  ): void {
    const wrapper = this.createWrapper(parent);
    const region: CondRegion = {
      kind: "cond",
      wrapper,
      node,
      active: -2, // nothing mounted yet
      scope: { env: scope.env, texts: [], regions: [] },
      deps: { globals: new Set(), tables: new Set() },
    };
    scope.regions.push(region);
    this.activateBranch(region);
  }

  /** Mount the currently-selected branch of a region into its wrapper, recording
   *  `active` so refresh can detect a change + capturing the branch-selection's
   *  read deps so refresh can skip re-selecting when nothing it reads changed.
   *  `-1` = else/no-match (renders `else` children, or nothing). */
  protected activateBranch(region: CondRegion): void {
    const vs = this._game.story.variablesState;
    vs.beginReactiveRead();
    const selected = this.selectBranch(region.node, region.scope.env);
    region.deps = vs.endReactiveRead();
    region.active = selected;
    const children = this.branchChildren(region.node, selected);
    for (const child of children) {
      this.mountNode(region.wrapper, child, region.scope);
    }
  }

  /** Index of the active branch: the first truthy `if`/`elseif` condition, the
   *  first matching `match` case, or `-1` for else/no-match. */
  protected selectBranch(node: IfNode | MatchNode, env: ReactiveEnv): number {
    if (node.kind === "if") {
      for (let i = 0; i < node.branches.length; i += 1) {
        if (this.isTruthy(this.evalBinding(node.branches[i]!.condition, env))) {
          return i;
        }
      }
      return -1;
    }
    const value = this.evalBinding(node.expr, env);
    for (let i = 0; i < node.cases.length; i += 1) {
      if (this.evalBinding(node.cases[i]!.value, env) === value) {
        return i;
      }
    }
    return -1;
  }

  /** Children of the selected branch (`-1` → `else` arm, or empty). */
  protected branchChildren(
    node: IfNode | MatchNode,
    selected: number,
  ): BodyNode[] {
    if (selected < 0) {
      return node.else ?? [];
    }
    return node.kind === "if"
      ? node.branches[selected]!.children
      : node.cases[selected]!.children;
  }

  // --- for ------------------------------------------------------------------

  /** Mount a reactive `for`: a persistent wrapper holding one rendered item per
   *  iterable element, recorded as a region of the parent scope. Numeric `for`
   *  (no `each`) is a follow-up. */
  protected mountForRegion(
    parent: Element,
    node: ForNode,
    scope: ReactiveScope,
  ): void {
    const wrapper = this.createWrapper(parent);
    const region: ForRegion = { kind: "for", wrapper, node, iterations: [] };
    scope.regions.push(region);
    this.populateFor(region, scope.env);
  }

  /** Initial mount of every iteration (or the `else` arm if the iterable is
   *  empty), using the enclosing `parentEnv`. */
  protected populateFor(region: ForRegion, parentEnv: ReactiveEnv): void {
    if (!region.node.each) {
      return; // numeric `for i = a, b` is a follow-up
    }
    const entries = this.iterableEntries(
      this.evalBinding(region.node.each, parentEnv),
    );
    if (entries.length === 0) {
      this.mountForElse(region, parentEnv);
      return;
    }
    for (const [entryKey, value] of entries) {
      region.iterations.push(
        this.mountIteration(region, parentEnv, entryKey, value),
      );
    }
  }

  /** Mount the `for`'s `else` arm into its wrapper (when the iterable is empty). */
  protected mountForElse(region: ForRegion, parentEnv: ReactiveEnv): void {
    const elseChildren = region.node.else;
    if (!elseChildren || elseChildren.length === 0) {
      return;
    }
    region.elseScope = { env: parentEnv, texts: [], regions: [] };
    for (const child of elseChildren) {
      this.mountNode(region.wrapper, child, region.elseScope);
    }
  }

  /** Mount one iteration's body into its own `display:contents` sub-wrapper
   *  (appended to the loop wrapper), binding the loop variable(s) in a fresh
   *  per-iteration scope env. Returns the iteration (caller positions/records
   *  it) — one wrapper element so keyed reconcile can move it as a unit. */
  protected mountIteration(
    region: ForRegion,
    parentEnv: ReactiveEnv,
    entryKey: unknown,
    value: unknown,
  ): ForIteration {
    const env: ReactiveEnv = { ...parentEnv };
    this.bindLoopVars(region.node.bindings, env, entryKey, value);
    const scope: ReactiveScope = { env, texts: [], regions: [] };
    const wrapper = this.createWrapper(region.wrapper);
    for (const child of region.node.children) {
      this.mountNode(wrapper, child, scope);
    }
    return {
      key: this.keyForEntry(region.node, entryKey, value),
      wrapper,
      scope,
    };
  }

  /** Reconciliation key for one iterable entry: the explicit `key` clause is a
   *  follow-up, so default to the entry KEY for `k, v` loops (stable map key),
   *  else the value's identity — a table by its backing Map (so reordering the
   *  SAME objects reuses+moves their elements), a scalar by its value (so a
   *  reordered `{a, b}` of equal scalars still matches). */
  protected keyForEntry(
    node: ForNode,
    entryKey: unknown,
    value: unknown,
  ): unknown {
    if (node.bindings.length >= 2) {
      return entryKey;
    }
    const payload = (value as { value?: unknown } | null)?.value;
    return payload !== undefined ? payload : value;
  }

  /** Bind a `for`'s loop variable(s) into `env`: `[v]` → value; `[k, v]` → key +
   *  value (Luau pairs/ipairs style). Mutates `env` in place. */
  protected bindLoopVars(
    bindings: string[],
    env: ReactiveEnv,
    key: unknown,
    value: unknown,
  ): void {
    if (bindings.length === 1) {
      env[bindings[0]!] = value;
    } else if (bindings.length >= 2) {
      env[bindings[0]!] = key;
      env[bindings[1]!] = value;
    }
  }

  /** Normalize a `for` iterable's evaluated value to ordered `[key, value]`
   *  entries. Luau tables come back as a `Map`; arrays are 1-indexed; plain
   *  objects use their entries; anything else iterates as empty. */
  protected iterableEntries(collection: unknown): [unknown, unknown][] {
    if (collection instanceof Map) {
      return [...collection.entries()];
    }
    if (Array.isArray(collection)) {
      return collection.map((v, i) => [i + 1, v]);
    }
    if (collection && typeof collection === "object") {
      return Object.entries(collection as Record<string, unknown>);
    }
    return [];
  }

  // --- shared ---------------------------------------------------------------

  /** A persistent, layout-transparent (`display: contents`) wrapper that
   *  reserves a control-flow region's sibling position; its contents swap as the
   *  region reconciles, but the wrapper itself never moves. */
  protected createWrapper(parent: Element): Element {
    return this.createElement(parent, {
      type: "div",
      name: "",
      style: { display: "contents" },
    });
  }

  /** Luau truthiness: everything except `nil` and `false` is truthy (0 and ""
   *  are truthy). */
  protected isTruthy(value: unknown): boolean {
    return value != null && value !== false;
  }

  protected contentHasBinding(content: ContentPart[]): boolean {
    return content.some((p) => p.kind === "binding");
  }

  /** Resolve ordered literal + `{expr}` content to a flat string. Each binding
   *  is evaluated live via {@link evalBinding} with the scope's loop `env`; a
   *  nullish result contributes the empty string. */
  protected resolveContent(content: ContentPart[], env: ReactiveEnv): string {
    let text = "";
    for (const part of content) {
      if (part.kind === "literal") {
        text += part.text;
      } else {
        const value = this.evalBinding(part.binding, env);
        text += value == null ? "" : String(value);
      }
    }
    return text;
  }

  // --- per-turn refresh -----------------------------------------------------

  /** Per-turn re-eval over the scope tree, called on the existing per-beat
   *  boundary (Coordinator.display → updateUI). Fine-grained (Phase 4): the
   *  turn's change-set (globals + tables written since the last refresh) is
   *  taken once, and a binding re-evaluates only when its read deps intersect it
   *  — EXCEPT inside a loop-iteration scope, where a binding's value comes from
   *  the per-iteration `env` (not a tracked global/table), so it re-evaluates
   *  every turn (equality-gated). The story is settled here, so
   *  {@link evalBinding}'s EvaluateFunction is safe. No-op unless reactive. */
  refreshScreens(): void {
    if (!this._reactive) {
      return;
    }
    const changes = this._game.story.variablesState.takeReactiveChanges();
    for (const scope of this._rootScopes) {
      this.refreshScope(scope, changes);
    }
  }

  protected refreshScope(scope: ReactiveScope, changes: ReactiveDeps): void {
    // A loop-iteration scope's bindings depend on the per-iteration env, which
    // isn't a tracked global/table — re-evaluate them every turn (equality-
    // gated). Top-level / conditional scopes dep-gate per registration.
    const envScope = this.scopeHasEnv(scope);
    for (const entry of scope.texts) {
      if (envScope || this.depsChanged(entry.deps, changes)) {
        const { text, deps } = this.resolveContentTracked(
          entry.content,
          scope.env,
        );
        entry.deps = deps;
        if (text !== entry.last) {
          entry.last = text;
          this.updateElement(entry.element, { content: { text } });
        }
      }
    }
    for (const region of scope.regions) {
      if (region.kind === "for") {
        this.refreshForRegion(region, scope.env, changes);
      } else {
        this.refreshCondRegion(region, changes, envScope);
      }
    }
  }

  protected refreshCondRegion(
    region: CondRegion,
    changes: ReactiveDeps,
    envScope: boolean,
  ): void {
    // Re-run branch selection only when the condition's deps changed (or it's in
    // a loop scope). When nothing it reads changed, the active branch can't have
    // changed — skip the selectBranch eval and just refresh the live children.
    if (envScope || this.depsChanged(region.deps, changes)) {
      const vs = this._game.story.variablesState;
      vs.beginReactiveRead();
      const next = this.selectBranch(region.node, region.scope.env);
      region.deps = vs.endReactiveRead();
      if (next !== region.active) {
        // Branch switched: tear down the old subtree + its registrations, mount
        // the new branch into the same persistent wrapper (position preserved,
        // env reference reused so an enclosing for-iteration's values stay live).
        this.clearWrapper(region.wrapper);
        region.scope = { env: region.scope.env, texts: [], regions: [] };
        region.active = next;
        for (const child of this.branchChildren(region.node, next)) {
          this.mountNode(region.wrapper, child, region.scope);
        }
        return;
      }
    }
    // Same branch still active — recurse to refresh its inner scope.
    this.refreshScope(region.scope, changes);
  }

  /** Keyed `for` reconcile (Phase 4 I9): re-evaluate the iterable and match new
   *  entries to existing iterations BY KEY — reuse a matched iteration (update
   *  its env + refresh its scope), create for new keys, destroy unmatched ones —
   *  then move retained sub-wrappers into the new order (only the displaced ones)
   *  via `ui/move`. So reordering the same objects preserves their element
   *  subtrees (focus / scroll / in-flight animation), and changing an object's
   *  field reuses its iteration (identity-stable) for an in-place update. */
  protected refreshForRegion(
    region: ForRegion,
    parentEnv: ReactiveEnv,
    changes: ReactiveDeps,
  ): void {
    if (!region.node.each) {
      return;
    }
    const entries = this.iterableEntries(
      this.evalBinding(region.node.each, parentEnv),
    );

    if (entries.length === 0) {
      // Becoming empty: drop all iterations, then show the `else` arm.
      for (const it of region.iterations) {
        this.destroyIteration(it);
      }
      region.iterations = [];
      if (region.elseScope) {
        this.refreshScope(region.elseScope, changes);
      } else {
        this.mountForElse(region, parentEnv);
      }
      return;
    }

    // Non-empty: drop the `else` arm if it was showing.
    if (region.elseScope) {
      this.clearWrapper(region.wrapper);
      region.elseScope = undefined;
    }

    // Index existing iterations by key (FIFO queues handle duplicate keys).
    const oldByKey = new Map<unknown, ForIteration[]>();
    for (const it of region.iterations) {
      const q = oldByKey.get(it.key);
      if (q) {
        q.push(it);
      } else {
        oldByKey.set(it.key, [it]);
      }
    }

    // Build the new ordered list, reusing matched keys + creating the rest.
    const next: ForIteration[] = [];
    for (const [entryKey, value] of entries) {
      const key = this.keyForEntry(region.node, entryKey, value);
      const q = oldByKey.get(key);
      const reused = q && q.length > 0 ? q.shift() : undefined;
      if (reused) {
        this.bindLoopVars(
          region.node.bindings,
          reused.scope.env,
          entryKey,
          value,
        );
        this.refreshScope(reused.scope, changes);
        next.push(reused);
      } else {
        next.push(this.mountIteration(region, parentEnv, entryKey, value));
      }
    }

    // Destroy iterations whose keys are gone.
    for (const q of oldByKey.values()) {
      for (const it of q) {
        this.destroyIteration(it);
      }
    }

    // Reorder sub-wrappers into `next` order, moving only displaced ones.
    for (let i = 0; i < next.length; i += 1) {
      const it = next[i]!;
      if (region.wrapper.children[i] !== it.wrapper) {
        this.moveElement(it.wrapper, region.wrapper.children[i] ?? null);
      }
    }

    region.iterations = next;
  }

  /** Does any global/table dep intersect the turn's change-set? */
  protected depsChanged(deps: ReactiveDeps, changes: ReactiveDeps): boolean {
    for (const g of deps.globals) {
      if (changes.globals.has(g)) {
        return true;
      }
    }
    for (const t of deps.tables) {
      if (changes.tables.has(t)) {
        return true;
      }
    }
    return false;
  }

  /** True for a loop-iteration scope (its env binds loop variables). */
  protected scopeHasEnv(scope: ReactiveScope): boolean {
    for (const _ in scope.env) {
      return true;
    }
    return false;
  }

  /** Destroy one for-iteration's sub-wrapper (cascading its body subtree).
   *  Dropping the iteration from `region.iterations` discards its scope. */
  protected destroyIteration(it: ForIteration): void {
    this.destroyElement(it.wrapper);
  }

  /** Destroy everything inside a control-flow wrapper (the wrapper persists). */
  protected clearWrapper(wrapper: Element): void {
    for (const child of [...wrapper.children]) {
      this.destroyElement(child);
    }
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
