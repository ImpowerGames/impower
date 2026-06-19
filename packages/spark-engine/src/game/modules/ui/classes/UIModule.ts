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
  PropValue,
  ScreenNode,
} from "@impower/sparkdown/src/compiler/types/SparkleNode";
import {
  AbstractValue,
  BoolValue,
  FloatValue,
  IntValue,
  ObjectValue,
  StringValue,
} from "@impower/sparkdown/src/inkjs/engine/Value";
import type { Game } from "../../../core/classes/Game";
import { EventMessage } from "../../../core/classes/messages/EventMessage";
import { Module } from "../../../core/classes/Module";
import { Event } from "../../../core/types/Event";
import { EventMap } from "../../../core/types/EventMap";
import {
  ImageInstruction,
  ScreenInstruction,
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

/** A reactive element attribute (an input widget's `value`/`checked`) bound to a
 *  `{expr}` — one-way (UI follows state); user write-back is via `@input`/
 *  `@change`. `last` is the last applied value for equality-gated updates. */
interface ReactiveAttr {
  element: Element;
  prop: string;
  binding: Binding;
  boolean: boolean;
  last: string | null;
  deps: ReactiveDeps;
}

/** A slider's engine-computed `--_fill-percentage` (spec §10.1): the filled
 *  fraction derived from its value/min/max props, re-applied when any of those
 *  change (so a custom track gradient can follow the value without an inline
 *  `oninput`). Registered only when at least one of value/min/max is bound. */
interface ReactiveSliderFill {
  element: Element;
  value: PropValue;
  min: PropValue;
  max: PropValue;
  last: string;
  deps: ReactiveDeps;
}

/** Wrapperless reactive regions (if/for/match) mount their content DIRECTLY
 *  into the real parent — no `display:contents` wrapper — so a constrained
 *  parent like `<select>` sees its `<option>`s as direct children. Positioning
 *  + teardown work off these ordered groups instead of a wrapper element. */

/** An ordered child slot of a mount group: a concrete element or a nested
 *  region. `firstLiveElement` resolves a slot to its leading DOM element (for
 *  insertion anchors); `collectNodes` flattens a group's elements (for
 *  teardown). */
type ReactiveItem = { el: Element } | { region: ReactiveRegion };
type ReactiveGroup = ReactiveItem[];

/** An if/match conditional (wrapperless). The active branch's children are
 *  mounted directly into `parent` at the region's slot; `siblings` is the group
 *  this region lives in (to resolve its insertion anchor — the next live element
 *  after it); `content` is the active branch's items (torn down + rebuilt on
 *  switch). `active` is the branch index (`-1` = else/no-match, `-2` = unmounted). */
interface CondRegion {
  kind: "cond";
  parent: Element;
  node: IfNode | MatchNode;
  active: number;
  scope: ReactiveScope;
  /** Deps of the branch-selection (the condition/expr/case-value reads), gating
   *  whether `selectBranch` is re-run on a turn. */
  deps: ReactiveDeps;
  siblings: ReactiveGroup;
  content: ReactiveGroup;
  /** The region whose content group this region lives in (set when nested in
   *  another region's branch/iteration). `anchorFor` escalates to the owner's
   *  anchor when nothing live follows in the local group. Undefined at a
   *  real-element parent (screen / element / `<select>` children), where a null
   *  anchor correctly means append-to-parent. */
  owner?: ReactiveRegion;
}

/** One rendered item of a reactive `for`: its reconciliation key (table identity
 *  for objects, scalar value for primitives, or the entry key for `k,v` loops),
 *  its child scope (whose `env` carries the loop var values, mutated in place on
 *  re-eval), and `content` — its body's ordered items, moved as a contiguous run
 *  on reorder and destroyed when the item is dropped. */
interface ForIteration {
  key: unknown;
  scope: ReactiveScope;
  content: ReactiveGroup;
}

/** A reactive `for` (wrapperless): iterations mounted directly into `parent` at
 *  the region's slot, or — when the iterable is empty — the `else` arm. */
interface ForRegion {
  kind: "for";
  parent: Element;
  node: ForNode;
  iterations: ForIteration[];
  siblings: ReactiveGroup;
  elseScope?: ReactiveScope;
  elseContent?: ReactiveGroup;
  /** See {@link CondRegion.owner}. */
  owner?: ReactiveRegion;
}

type ReactiveRegion = CondRegion | ForRegion;

/** Reactive registrations produced by one mount pass, mirroring the mount tree
 *  so a subtree's spans + nested regions can be torn down together. `env` holds
 *  the loop-var bindings in effect for everything registered in this scope. */
interface ReactiveScope {
  env: ReactiveEnv;
  texts: ReactiveText[];
  regions: ReactiveRegion[];
  attrs: ReactiveAttr[];
  sliderFills: ReactiveSliderFill[];
}

/** Builtin form-control tags → the `<input>` type they render as. Their props
 *  (value/checked/min/max/placeholder/…) become attributes; value/checked also
 *  bind one-way + write back via @input/@change. */
const INPUT_WIDGETS: Record<string, { inputType: string }> = {
  field: { inputType: "text" },
  input: { inputType: "text" },
  slider: { inputType: "range" },
  checkbox: { inputType: "checkbox" },
};

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
    this._mountedScreens = new Map();
  }

  override async onConnected() {
    this._root = undefined;
    this._root = this.getOrCreateRootElement();
    // Reactive screens are the ONLY render path now (the `config.ui.reactive`
    // opt-in was retired once `main` auto-opens and `[[open/close]]` mount the
    // rest). The static `constructScreens` path remains only as a fallback when a
    // program somehow ships no Sparkle AST (program.sparkle.screens) at all.
    this._reactive = true;
    this.constructStyles();
    if (this._game.program?.sparkle?.screens) {
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

  /** Reduce an element's `name`/`type` to a path-segment token: only
   *  `[A-Za-z0-9_]` survive (runs of anything else collapse to `_`), so a
   *  segment can never contain the `-` we use as the path separator. */
  protected sanitizeIdPart(s: string): string {
    return s.trim().replace(/[^A-Za-z0-9]+/g, "_") || "el";
  }

  /** Deterministic, structural element id (NOT a random uuid). An element's id
   *  is its parent's id + a path segment derived from its `tag.classes` name
   *  (idiomorph-style: identity follows tag+classes), disambiguated by a
   *  monotonic per-base index from the parent. Because the index is a pure
   *  function of the create-call sequence (not of which siblings are currently
   *  live), a deterministic replay assigns the SAME ids every time — which is
   *  what lets the player reconcile a live-preview re-render against the existing
   *  DOM (reuse unchanged nodes) instead of tearing the whole tree down on every
   *  edit. Content (dialogue/image) is keyed separately by stable target name,
   *  so editing prose never perturbs these.
   *
   *  Format `parent-<base>-<index>` (index always present) is collision-free:
   *  segments strictly alternate base/index after the `e` root, a base can never
   *  contain `-`, and the index never repeats for a given (parent, base) — so
   *  distinct elements always map to distinct ids, even under `for`/`if`
   *  reconcile that mounts a new node before destroying the displaced one. */
  protected generateId(parent: Element | null, name: string, type: string): string {
    if (!parent) {
      // Root element. Must start with a letter.
      return "e";
    }
    const base = this.sanitizeIdPart(name || type);
    const index = parent.nextChildIndex(base);
    return `${parent.id}-${base}-${index}`;
  }

  protected createElement(
    parent: Element | null,
    state?: ElementState,
    before?: Element | null,
  ): Element {
    const name = state?.name || "";
    const type = state?.type || "div";
    const id = this.generateId(parent, name, type);
    const content = state?.content;
    const style = state?.style;
    const attributes = state?.attributes;
    const breakpoints = this.context.config?.ui?.breakpoints;
    const el = new Element(parent, id, type, name, before);
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
        ...(before ? { before: before.id } : {}),
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
    // No-op when already in place — the element immediately precedes `before`
    // (or is already last when `before` is null). Keeps an unchanged `for` order
    // from emitting redundant `ui/move`s during reconcile.
    const siblings = parent.children;
    const idx = siblings.indexOf(element);
    const beforeIdx = before ? siblings.indexOf(before) : siblings.length;
    if (idx >= 0 && idx + 1 === beforeIdx) {
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

  /** Screens that are currently MOUNTED (have live DOM + a reactive scope),
   *  keyed by name. This is the source of truth for the reactive lifecycle:
   *  `main` is mounted by default (auto-open); every other screen is mounted by
   *  `[[open X]]` and removed by `[[close X]]` (true spawn/destroy). The roots of
   *  the scope tree walked each turn by {@link refreshScreens} are the `scope`s
   *  of every entry. Designed to hold >1 screen so a future goto/navigate can
   *  layer screens. */
  protected _mountedScreens: Map<
    string,
    { element: Element; scope: ReactiveScope; container?: string }
  > = new Map();

  /** Test/preview convenience: when set, {@link constructScreensFromAst} mounts
   *  EVERY screen at connect (instant, no transition) instead of just `main`.
   *  Off in production — only `main` auto-opens; everything else needs `[[open]]`.
   *  The harness sets this so existing reactive tests keep their "screen is
   *  mounted at connect" assumption. */
  _autoOpenAll = false;

  constructScreensFromAst(...structNames: string[]): void {
    this._mountedScreens = new Map();
    const screens = this._game.program?.sparkle?.screens;
    if (!screens) {
      return;
    }
    // Enable fine-grained dependency tracking for the whole reactive lifetime;
    // mount captures each binding's read deps (Phase 4).
    this._game.story.variablesState.reactiveDepsEnabled = true;
    const targetAllScreens = !structNames || structNames.length === 0;
    // Default: ONLY `main` is mounted/visible from the start (implicit auto-open).
    // Every other screen stays unmounted (zero DOM / zero binding cost) until an
    // explicit `[[open X]]`. The `_autoOpenAll` test flag mounts them all.
    const validScreenNames = !targetAllScreens
      ? structNames
      : this._autoOpenAll
        ? Object.keys(screens)
        : Object.keys(screens).filter((name) => name === "main");
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
    const scope = this.makeScope({});
    this._mountedScreens.set(screen.name, {
      element: uiEl,
      scope,
      ...(screen.container ? { container: screen.container } : {}),
    });
    this.mountChildren(uiEl, screen.children, scope, null);
    return uiEl;
  }

  /** A fresh reactive scope with the given loop env. */
  protected makeScope(env: ReactiveEnv): ReactiveScope {
    return { env, texts: [], regions: [], attrs: [], sliderFills: [] };
  }

  protected mountNode(
    parent: Element,
    node: BodyNode,
    scope: ReactiveScope,
    before: Element | null,
  ): Element | ReactiveRegion | undefined {
    if (node.kind === "element") {
      return this.mountElement(parent, node, scope, before);
    }
    if (node.kind === "if" || node.kind === "match") {
      return this.mountCondRegion(parent, node, scope, before);
    }
    if (node.kind === "for") {
      return this.mountForRegion(parent, node, scope, before);
    }
    // slot/fill are mounted in a later increment (component slot/fill).
    return undefined;
  }

  /** Mount an ordered list of body nodes into `parent`, building the sibling
   *  group (elements + nested regions, in source order) that positional
   *  anchoring (`anchorFor`) and teardown (`collectNodes`) operate on. Each
   *  top-level node is inserted before `before` (null = append), so a whole
   *  group can be placed at a region's slot with no wrapper. */
  protected mountChildren(
    parent: Element,
    children: BodyNode[],
    scope: ReactiveScope,
    before: Element | null,
    owner?: ReactiveRegion,
  ): ReactiveGroup {
    const group: ReactiveGroup = [];
    for (const child of children) {
      const created = this.mountNode(parent, child, scope, before);
      if (created instanceof Element) {
        group.push({ el: created });
      } else if (created) {
        created.siblings = group;
        // When this group is a region's content (owner set), a nested region
        // that has nothing live after it locally escalates to the owner's anchor.
        created.owner = owner;
        group.push({ region: created });
      }
    }
    return group;
  }

  protected mountElement(
    parent: Element,
    node: ElementNode,
    scope: ReactiveScope,
    before: Element | null,
  ): Element {
    // Element name = builtin tag joined with its bare-word classes, matching the
    // static path's dotted-segment naming ("mask shadow_1", "text", "stage").
    const name = [node.tag, ...node.classes].join(" ");
    // Input widgets (field/slider/checkbox) render a real <input> with their
    // value-surface props as attributes (and reactive value/checked).
    const widget = INPUT_WIDGETS[node.tag];
    if (widget) {
      return this.mountInputWidget(parent, node, scope, name, widget, before);
    }
    // dropdown/option render as a real <select>/<option> (not void inputs):
    // the dropdown carries option children and a selected `value`.
    if (node.tag === "dropdown") {
      return this.mountDropdown(parent, node, scope, name, before);
    }
    if (node.tag === "option") {
      return this.mountOption(parent, node, scope, name, before);
    }
    const el = this.createElement(parent, { type: "div", name }, before);
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
    // Children mount INTO this fresh element (always append — before=null).
    this.mountChildren(el, node.children, scope, null);
    return el;
  }

  /** Mount a form-control widget as a real `<input>`: its props become initial
   *  attributes, and `value`/`checked` bindings register for one-way reactive
   *  updates (UI follows state; write-back is via the element's `@input`/
   *  `@change` handler). Inputs are void — no content/children are mounted. */
  protected mountInputWidget(
    parent: Element,
    node: ElementNode,
    scope: ReactiveScope,
    name: string,
    widget: { inputType: string },
    before: Element | null,
  ): Element {
    const vs = this._game.story.variablesState;
    const attributes: Record<string, string | null> = { type: widget.inputType };
    const reactive: Omit<ReactiveAttr, "element">[] = [];
    for (const [prop, propValue] of Object.entries(node.props)) {
      const boolean = prop === "checked";
      vs.beginReactiveRead();
      const resolved = this.resolveProp(propValue, scope.env);
      const deps = vs.endReactiveRead();
      const attrVal = this.propToAttr(resolved, boolean);
      attributes[prop] = attrVal;
      if (propValue.kind === "binding") {
        reactive.push({ prop, binding: propValue.binding, boolean, last: attrVal, deps });
      }
    }
    const el = this.createElement(parent, { type: "input", name, attributes }, before);
    for (const r of reactive) {
      scope.attrs.push({ element: el, ...r });
    }
    // A range control also exposes `--_fill-percentage` (value/min/max → filled
    // fraction), computed engine-side so a custom track can follow the value.
    if (widget.inputType === "range") {
      this.mountSliderFill(el, node, scope);
    }
    for (const ev of node.events) {
      this.mountEvent(el, ev, scope);
    }
    return el;
  }

  /** Compute a slider's `--_fill-percentage` from its value/min/max and set it
   *  as a style; register a reactive entry when any of those is bound so the
   *  fill follows the value (spec §10.1 — engine-computed, not inline oninput). */
  protected mountSliderFill(
    el: Element,
    node: ElementNode,
    scope: ReactiveScope,
  ): void {
    const value = node.props["value"];
    const min = node.props["min"];
    const max = node.props["max"];
    if (!value) return; // no value surface → nothing to fill
    const minP: PropValue = min ?? { kind: "literal", value: 0 };
    const maxP: PropValue = max ?? { kind: "literal", value: 100 };
    const vs = this._game.story.variablesState;
    vs.beginReactiveRead();
    const pct = this.computeFillPercentage(value, minP, maxP, scope.env);
    const deps = vs.endReactiveRead();
    this.updateElement(el, { style: { "--_fill-percentage": pct } });
    if (
      value.kind === "binding" ||
      minP.kind === "binding" ||
      maxP.kind === "binding"
    ) {
      scope.sliderFills.push({
        element: el,
        value,
        min: minP,
        max: maxP,
        last: pct,
        deps,
      });
    }
  }

  /** `((value - min) / (max - min)) * 100`, clamped to 0–100, as a `%` string.
   *  A zero range (or non-numeric input) yields `0%`. */
  protected computeFillPercentage(
    value: PropValue,
    min: PropValue,
    max: PropValue,
    env: ReactiveEnv,
  ): string {
    const num = (p: PropValue): number => {
      const n = Number(this.resolveProp(p, env));
      return Number.isNaN(n) ? 0 : n;
    };
    const v = num(value);
    const lo = num(min);
    const hi = num(max);
    const pct = hi === lo ? 0 : ((v - lo) / (hi - lo)) * 100;
    return `${Math.max(0, Math.min(100, pct))}%`;
  }

  /** Mount a `dropdown` as a real `<select>`: non-value props become initial
   *  attributes (reactive if bound), the `<option>` children are mounted, and
   *  THEN the selected `value` is applied (a `<select>`'s value only selects an
   *  option once its children exist) — one-way bound + written back via
   *  `@change`. */
  protected mountDropdown(
    parent: Element,
    node: ElementNode,
    scope: ReactiveScope,
    name: string,
    before: Element | null,
  ): Element {
    const vs = this._game.story.variablesState;
    const attributes: Record<string, string | null> = {};
    const reactive: Omit<ReactiveAttr, "element">[] = [];
    let selected: { binding?: Binding; last: string | null; deps: ReactiveDeps } | null = null;
    for (const [prop, propValue] of Object.entries(node.props)) {
      vs.beginReactiveRead();
      const resolved = this.resolveProp(propValue, scope.env);
      const deps = vs.endReactiveRead();
      const attrVal = this.propToAttr(resolved, false);
      if (prop === "value") {
        // Defer until options are mounted (a <select>.value can't select an
        // option that doesn't exist yet).
        selected = {
          ...(propValue.kind === "binding" ? { binding: propValue.binding } : {}),
          last: attrVal,
          deps,
        };
        continue;
      }
      attributes[prop] = attrVal;
      if (propValue.kind === "binding") {
        reactive.push({ prop, binding: propValue.binding, boolean: false, last: attrVal, deps });
      }
    }
    const el = this.createElement(parent, { type: "select", name, attributes }, before);
    // Options (incl. those produced by `for`/`if`) mount as DIRECT children of
    // the <select> — wrapperless, so HTMLSelectElement.options enumerates them.
    this.mountChildren(el, node.children, scope, null);
    if (selected) {
      this.updateElement(el, { attributes: { value: selected.last } });
      if (selected.binding) {
        scope.attrs.push({
          element: el,
          prop: "value",
          binding: selected.binding,
          boolean: false,
          last: selected.last,
          deps: selected.deps,
        });
      }
    }
    for (const r of reactive) {
      scope.attrs.push({ element: el, ...r });
    }
    for (const ev of node.events) {
      this.mountEvent(el, ev, scope);
    }
    return el;
  }

  /** Mount an `<option>` (a `dropdown` child). Its `value` attribute defaults to
   *  the visible label text (so `dropdown #value={x}` matches `option "Easy"` by
   *  text) unless an explicit `#value` is given; the label renders as content. */
  protected mountOption(
    parent: Element,
    node: ElementNode,
    scope: ReactiveScope,
    name: string,
    before: Element | null,
  ): Element {
    const vs = this._game.story.variablesState;
    const attributes: Record<string, string | null> = {};
    const reactive: Omit<ReactiveAttr, "element">[] = [];
    let hasValue = false;
    for (const [prop, propValue] of Object.entries(node.props)) {
      const boolean = prop === "selected" || prop === "disabled";
      vs.beginReactiveRead();
      const resolved = this.resolveProp(propValue, scope.env);
      const deps = vs.endReactiveRead();
      const attrVal = this.propToAttr(resolved, boolean);
      attributes[prop] = attrVal;
      if (prop === "value") hasValue = true;
      if (propValue.kind === "binding") {
        reactive.push({ prop, binding: propValue.binding, boolean, last: attrVal, deps });
      }
    }
    if (!hasValue && node.content) {
      // Default the value to the visible label. When the label is a single
      // reactive `{expr}`, keep the value in lock-step with it (reuse the attr
      // reactive path) so the selected value never desyncs from the shown text.
      const only = node.content.length === 1 ? node.content[0] : undefined;
      if (only && only.kind === "binding") {
        vs.beginReactiveRead();
        const resolved = this.resolveProp({ kind: "binding", binding: only.binding }, scope.env);
        const deps = vs.endReactiveRead();
        const attrVal = this.propToAttr(resolved, false);
        attributes["value"] = attrVal;
        reactive.push({ prop: "value", binding: only.binding, boolean: false, last: attrVal, deps });
      } else {
        attributes["value"] = this.resolveContent(node.content, scope.env);
      }
    }
    const el = this.createElement(parent, { type: "option", name, attributes }, before);
    this.mountTextContent(el, node.content, scope);
    for (const r of reactive) {
      scope.attrs.push({ element: el, ...r });
    }
    for (const ev of node.events) {
      this.mountEvent(el, ev, scope);
    }
    return el;
  }

  /** Resolve a `#prop=value` to its current value (literal, or a live binding
   *  eval with the scope's loop env). */
  protected resolveProp(propValue: PropValue, env: ReactiveEnv): unknown {
    return propValue.kind === "literal"
      ? propValue.value
      : this.evalBinding(propValue.binding, env);
  }

  /** Map a resolved prop value to an attribute string: a boolean (checkbox
   *  `checked`) becomes a presence attribute (`""`/absent); everything else is
   *  stringified (nullish → absent). */
  protected propToAttr(resolved: unknown, boolean: boolean): string | null {
    if (boolean) {
      return this.isTruthy(resolved) ? "" : null;
    }
    return resolved == null ? null : String(resolved);
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
    const callback = (event: Event): void => {
      // Build a Luau `event` table from the DOM event payload so write-back
      // handlers can read event.value / event.checked / event.key (two-way
      // binding). Bare refs receive it as their first arg; call/closure handlers
      // read it via the reserved `event` evaluator param.
      const eventTable = this.buildEventTable(event);
      if (handler.kind === "ref") {
        this.runHandlerFunction(handler.name, eventTable);
      } else {
        // call / closure: evaluate the hoisted handler binding for its effects,
        // with `event` available alongside any enclosing loop vars.
        this.evalBinding(handler.binding, { ...scope.env, event: eventTable });
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
   *  guarded by HasFunction. The DOM `event` table is passed as the first arg
   *  (a bare `@input=set_name` implicitly receives it; a no-param function just
   *  ignores it). Safe between turns (EvaluateFunction asserts IfAsyncWeCant);
   *  events fire when the story is idle. */
  protected runHandlerFunction(name: string, event?: AbstractValue): void {
    const story = this._game.story;
    if (story.HasFunction(name)) {
      story.EvaluateFunction(name, event !== undefined ? [event] : []);
    }
  }

  /** Build a Luau `event` table (ObjectValue) from a DOM event payload, exposing
   *  value / checked / key / type for write-back handlers. */
  protected buildEventTable(event: Event | undefined): ObjectValue {
    const payload = (event ?? {}) as {
      value?: unknown;
      checked?: unknown;
      key?: unknown;
      type?: unknown;
    };
    const map = new Map<string, AbstractValue>();
    if (payload.value != null) {
      // Preserve the control's value TYPE: a range/number input sends a JS
      // number (getEventData), so `value = event.value` keeps a numeric store
      // numeric instead of flipping it to a string (which would make ordered
      // comparisons lexicographic). Text inputs send a string.
      map.set("value", this.toLuauValue(payload.value));
    }
    if (payload.checked != null) {
      map.set("checked", new BoolValue(Boolean(payload.checked)));
    }
    if (payload.key != null) {
      map.set("key", new StringValue(String(payload.key)));
    }
    if (payload.type != null) {
      map.set("type", new StringValue(String(payload.type)));
    }
    return new ObjectValue(map);
  }

  /** Wrap a DOM-payload scalar in the matching Luau value, preserving type:
   *  number → Int/Float, boolean → Bool, everything else → String. */
  protected toLuauValue(value: unknown): AbstractValue {
    if (typeof value === "number") {
      return Number.isInteger(value) ? new IntValue(value) : new FloatValue(value);
    }
    if (typeof value === "boolean") {
      return new BoolValue(value);
    }
    return new StringValue(String(value));
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

  /** Mount an if/match conditional (wrapperless). The active branch's children
   *  are mounted directly into `parent` at this region's slot (before `before`),
   *  via a child scope inheriting the parent's loop env, and the region is
   *  recorded in the parent scope. Returns the region so the caller records it in
   *  its sibling group (for anchor resolution). */
  protected mountCondRegion(
    parent: Element,
    node: IfNode | MatchNode,
    scope: ReactiveScope,
    before: Element | null,
  ): CondRegion {
    const region: CondRegion = {
      kind: "cond",
      parent,
      node,
      active: -2, // nothing mounted yet
      scope: this.makeScope(scope.env),
      deps: { globals: new Set(), tables: new Set() },
      siblings: [],
      content: [],
    };
    scope.regions.push(region);
    this.activateBranch(region, before);
    return region;
  }

  /** Mount the currently-selected branch into `region.parent` before `before`,
   *  recording `active` + the branch's content group + the branch-selection's
   *  read deps (so refresh can skip re-selecting when nothing it reads changed).
   *  `-1` = else/no-match (renders `else` children, or nothing). */
  protected activateBranch(region: CondRegion, before: Element | null): void {
    const vs = this._game.story.variablesState;
    vs.beginReactiveRead();
    const selected = this.selectBranch(region.node, region.scope.env);
    region.deps = vs.endReactiveRead();
    region.active = selected;
    const children = this.branchChildren(region.node, selected);
    region.content = this.mountChildren(
      region.parent,
      children,
      region.scope,
      before,
      region,
    );
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

  /** Mount a reactive `for` (wrapperless): one rendered run per iterable element,
   *  mounted directly into `parent` at the region's slot. Returns the region so
   *  the caller records it in its sibling group. Numeric `for` (no `each`) is a
   *  follow-up. */
  protected mountForRegion(
    parent: Element,
    node: ForNode,
    scope: ReactiveScope,
    before: Element | null,
  ): ForRegion {
    const region: ForRegion = {
      kind: "for",
      parent,
      node,
      iterations: [],
      siblings: [],
    };
    scope.regions.push(region);
    this.populateFor(region, scope.env, before);
    return region;
  }

  /** Initial mount of every iteration (or the `else` arm if the iterable is
   *  empty), into `region.parent` before `before`. */
  protected populateFor(
    region: ForRegion,
    parentEnv: ReactiveEnv,
    before: Element | null,
  ): void {
    if (!region.node.each) {
      return; // numeric `for i = a, b` is a follow-up
    }
    const entries = this.iterableEntries(
      this.evalBinding(region.node.each, parentEnv),
    );
    if (entries.length === 0) {
      this.mountForElse(region, parentEnv, before);
      return;
    }
    for (const [entryKey, value] of entries) {
      region.iterations.push(
        this.mountIteration(region, parentEnv, entryKey, value, before),
      );
    }
  }

  /** Mount the `for`'s `else` arm (when the iterable is empty) into `parent`. */
  protected mountForElse(
    region: ForRegion,
    parentEnv: ReactiveEnv,
    before: Element | null,
  ): void {
    const elseChildren = region.node.else;
    if (!elseChildren || elseChildren.length === 0) {
      return;
    }
    region.elseScope = this.makeScope(parentEnv);
    region.elseContent = this.mountChildren(
      region.parent,
      elseChildren,
      region.elseScope,
      before,
      region,
    );
  }

  /** Mount one iteration's body directly into `region.parent` before `before`,
   *  binding the loop variable(s) in a fresh per-iteration scope env. Returns the
   *  iteration with its content group (a contiguous run reconcile moves as a
   *  unit). */
  protected mountIteration(
    region: ForRegion,
    parentEnv: ReactiveEnv,
    entryKey: unknown,
    value: unknown,
    before: Element | null,
  ): ForIteration {
    const env: ReactiveEnv = { ...parentEnv };
    this.bindLoopVars(region.node.bindings, env, entryKey, value);
    const scope = this.makeScope(env);
    const content = this.mountChildren(
      region.parent,
      region.node.children,
      scope,
      before,
      region,
    );
    return {
      key: this.keyForEntry(region.node, entryKey, value),
      scope,
      content,
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

  // --- wrapperless positioning ----------------------------------------------

  /** The DOM element a region's content must be inserted before to land at the
   *  region's slot: the first live element of the next sibling after the region
   *  in its group. `null` (append) when nothing live follows. */
  protected anchorFor(region: ReactiveRegion): Element | null {
    const group = region.siblings;
    const idx = group.findIndex(
      (it) => "region" in it && it.region === region,
    );
    for (let i = idx + 1; i < group.length; i += 1) {
      const live = this.firstLiveElement(group[i]!);
      if (live) {
        return live;
      }
    }
    // Nothing live follows us locally, so our slot IS the enclosing region's
    // slot (we share its real parent — wrapperless) — escalate to the owner's
    // anchor. At a real-element parent (no owner) null means append-to-parent.
    return region.owner ? this.anchorFor(region.owner) : null;
  }

  /** The leading live DOM element of a group item: a concrete element, or the
   *  first live element of a nested region's current content. `null` if nothing
   *  is live (an empty branch / empty `for`). */
  protected firstLiveElement(item: ReactiveItem): Element | null {
    if ("el" in item) {
      return item.el;
    }
    const region = item.region;
    if (region.kind === "cond") {
      return this.firstLiveOfGroup(region.content);
    }
    for (const it of region.iterations) {
      const live = this.firstLiveOfGroup(it.content);
      if (live) {
        return live;
      }
    }
    return region.elseContent
      ? this.firstLiveOfGroup(region.elseContent)
      : null;
  }

  protected firstLiveOfGroup(group: ReactiveGroup): Element | null {
    for (const it of group) {
      const live = this.firstLiveElement(it);
      if (live) {
        return live;
      }
    }
    return null;
  }

  /** Flatten a group to its top-level DOM elements (recursing nested regions'
   *  content), for teardown — destroying each cascades its own subtree. */
  protected collectNodes(group: ReactiveGroup): Element[] {
    const out: Element[] = [];
    for (const it of group) {
      if ("el" in it) {
        out.push(it.el);
        continue;
      }
      const region = it.region;
      if (region.kind === "cond") {
        out.push(...this.collectNodes(region.content));
      } else {
        for (const iter of region.iterations) {
          out.push(...this.collectNodes(iter.content));
        }
        if (region.elseContent) {
          out.push(...this.collectNodes(region.elseContent));
        }
      }
    }
    return out;
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
    for (const { scope } of this._mountedScreens.values()) {
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
    for (const entry of scope.attrs) {
      if (envScope || this.depsChanged(entry.deps, changes)) {
        const vs = this._game.story.variablesState;
        vs.beginReactiveRead();
        const resolved = this.resolveProp(
          { kind: "binding", binding: entry.binding },
          scope.env,
        );
        entry.deps = vs.endReactiveRead();
        const next = this.propToAttr(resolved, entry.boolean);
        if (next !== entry.last) {
          entry.last = next;
          this.updateElement(entry.element, {
            attributes: { [entry.prop]: next },
          });
        }
      }
    }
    for (const entry of scope.sliderFills) {
      if (envScope || this.depsChanged(entry.deps, changes)) {
        const vs = this._game.story.variablesState;
        vs.beginReactiveRead();
        const pct = this.computeFillPercentage(
          entry.value,
          entry.min,
          entry.max,
          scope.env,
        );
        entry.deps = vs.endReactiveRead();
        if (pct !== entry.last) {
          entry.last = pct;
          this.updateElement(entry.element, {
            style: { "--_fill-percentage": pct },
          });
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
        // Branch switched: tear down the old branch's elements + registrations,
        // mount the new branch at the region's slot (anchored before the next
        // live sibling). The env reference is reused so an enclosing
        // for-iteration's values stay live.
        for (const el of this.collectNodes(region.content)) {
          this.destroyElement(el);
        }
        region.scope = this.makeScope(region.scope.env);
        region.active = next;
        region.content = this.mountChildren(
          region.parent,
          this.branchChildren(region.node, next),
          region.scope,
          this.anchorFor(region),
          // This region owns the new branch's content (same as activateBranch),
          // so a grandchild region toggled later escalates to THIS region's anchor.
          region,
        );
        return;
      }
    }
    // Same branch still active — recurse to refresh its inner scope.
    this.refreshScope(region.scope, changes);
  }

  /** Keyed `for` reconcile (Phase 4 I9): re-evaluate the iterable and match new
   *  entries to existing iterations BY KEY — reuse a matched iteration (update
   *  its env + refresh its scope), create for new keys, destroy unmatched ones —
   *  then move retained element-runs into the new order (only the displaced ones,
   *  via `ui/move`). So reordering the same objects preserves their element
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
        this.mountForElse(region, parentEnv, this.anchorFor(region));
      }
      return;
    }

    // Non-empty: drop the `else` arm if it was showing.
    if (region.elseScope && region.elseContent) {
      for (const el of this.collectNodes(region.elseContent)) {
        this.destroyElement(el);
      }
      region.elseScope = undefined;
      region.elseContent = undefined;
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
        // New iterations mount at the region's slot; the reorder below settles
        // their final position.
        next.push(
          this.mountIteration(
            region,
            parentEnv,
            entryKey,
            value,
            this.anchorFor(region),
          ),
        );
      }
    }

    // Destroy iterations whose keys are gone.
    for (const q of oldByKey.values()) {
      for (const it of q) {
        this.destroyIteration(it);
      }
    }

    // Reorder element-runs into `next` order. Process iterations last→first and,
    // WITHIN each run, elements last→first — moving each element before the
    // sliding anchor (which becomes the element just placed). Moving relative to
    // the run's own next element (not all to one outer anchor) means a run that's
    // already contiguous + correctly placed emits zero moves (the no-op guard
    // fires for every element), so a stable multi-element list doesn't churn.
    let anchor = this.anchorFor(region);
    for (let i = next.length - 1; i >= 0; i -= 1) {
      const run = this.collectNodes(next[i]!.content);
      for (let j = run.length - 1; j >= 0; j -= 1) {
        this.moveElement(run[j]!, anchor);
        anchor = run[j]!;
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

  /** Destroy one for-iteration's element run (each cascades its subtree).
   *  Dropping the iteration from `region.iterations` discards its scope. */
  protected destroyIteration(it: ForIteration): void {
    for (const el of this.collectNodes(it.content)) {
      this.destroyElement(el);
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

  // ---------------------------------------------------------------------------
  // Screen lifecycle ([[open SCREEN]] / [[close SCREEN]])
  //
  // True spawn/destroy on the reactive render path: `[[open X]]` MOUNTS screen X
  // (constructs its element tree, captures its reactive deps, registers its scope
  // for per-turn refresh) and plays an enter transition; `[[close X]]` plays an
  // exit transition then DESTROYS X's whole element subtree and drops its scope
  // (so refreshScreens stops touching it — zero binding cost while closed). `main`
  // is auto-opened at connect; openScreen/closeScreen stay independent primitives
  // (multiple screens can be open) to leave room for a future goto/navigate.
  // ---------------------------------------------------------------------------

  /** Resolve a screen's enter (`open`) or exit (`close`) animation from the
   *  directive clauses, exactly like the image path: a `with` that names a
   *  `transition` uses its `on_show`/`on_hide`; a `with` that names an `animation`
   *  (or a bare directive defaulting to the builtin `show`/`hide`) uses it
   *  directly. Returns the resolved {@link Animation} (with after/over/ease
   *  overrides applied) or undefined when nothing animatable resolves. */
  protected resolveScreenAnimation(
    direction: "enter" | "exit",
    clauses: { with?: string; after?: number; over?: number; ease?: string },
    instant: boolean,
  ): Animation | undefined {
    const withName = clauses.with || "";
    const transition = this.context?.transition?.[withName];
    let name: string;
    if (transition) {
      const arm = direction === "enter" ? transition.on_show : transition.on_hide;
      name =
        (typeof arm === "string" ? arm : arm?.$name) ||
        (direction === "enter" ? "show" : "hide");
    } else {
      // A bare `with X` names an animation directly; with no `with`, fall back to
      // the builtin `show`/`hide` reveal animations.
      name = withName || (direction === "enter" ? "show" : "hide");
    }
    return this.getAnimationDefinition(
      {
        name,
        after: clauses.after,
        over: clauses.over,
        ease: clauses.ease,
      },
      instant,
    );
  }

  /** Mount + reveal a screen (`[[open X]]`). No-op if already mounted. With
   *  clauses, plays the resolved enter transition on the screen root; a bare
   *  `[[open X]]` (or `instant`) just mounts + shows. The screen root is revealed
   *  through the normal `reveal()` flow (root opacity). Returns once the enter
   *  transition has settled, so a `wait` directive can block story advance. */
  async openScreen(
    name: string,
    clauses?: { with?: string; after?: number; over?: number; ease?: string },
    instant = false,
  ): Promise<void> {
    if (!this._reactive) {
      // Static path: screens are all constructed at connect; just toggle hidden.
      this.showScreen(name);
      return;
    }
    if (!name) {
      return;
    }
    if (this._mountedScreens.has(name)) {
      // Already open — no-op (a future goto/navigate may re-run the transition).
      return;
    }
    const screens = this._game.program?.sparkle?.screens;
    const screen = screens?.[name];
    if (!screen) {
      return;
    }
    // Mount captures the screen's reactive deps; settle the load-time change
    // residue afterwards so the first per-turn refresh only sees post-mount
    // changes (mirrors constructScreensFromAst).
    const element = this.constructScreenFromAst(screen);
    this._game.story.variablesState.takeReactiveChanges();
    // The screens layer's root opacity is revealed on the first beat anyway, but
    // open it here too so a screen opened before any dialogue is visible.
    this.reveal();
    const enter = this.resolveScreenAnimation("enter", clauses ?? {}, instant);
    if (enter && !instant) {
      await this.animateElements([{ element, animations: [enter] }]);
    }
  }

  /** Play the exit transition then DESTROY a screen (`[[close X]]`): tears down
   *  its whole DOM subtree (one `ui/destroy` on the root removes the children)
   *  and drops its reactive scope so refreshScreens no longer touches it. No-op
   *  if not mounted. A bare `[[close X]]` (or `instant`) destroys immediately.
   *  Returns once the exit transition has settled, so `wait` can block advance. */
  async closeScreen(
    name: string,
    clauses?: { with?: string; after?: number; over?: number; ease?: string },
    instant = false,
  ): Promise<void> {
    if (!this._reactive) {
      // Static path: screens are never torn down; just toggle hidden.
      this.hideScreen(name);
      return;
    }
    const entry = name ? this._mountedScreens.get(name) : undefined;
    if (!entry) {
      return;
    }
    const exit = this.resolveScreenAnimation("exit", clauses ?? {}, instant);
    if (exit && !instant) {
      await this.animateElements([{ element: entry.element, animations: [exit] }]);
    }
    // Destroy the whole subtree (root destroy drops children) + drop the scope so
    // refreshScreens stops walking it. Closed = zero DOM + zero binding cost.
    this.destroyElement(entry.element);
    this._mountedScreens.delete(name);
  }

  /** Navigate within a container (`[[navigate <container> to <name>]]`): play
   *  the exit transition on + destroy every currently-open screen IN THAT
   *  CONTAINER except the target, then open the target (its enter transition).
   *  Screens in other containers (and uncategorized screens like a persistent
   *  HUD) are left untouched. Composed from the open/close primitives — clauses
   *  drive both the outgoing exit and the incoming enter (so a `with` transition
   *  gives a crossfade). With no `container`, falls back to replacing the whole
   *  stack (close every open screen except the target). A missing target (an
   *  incomplete `[[navigate <container>]]`) is a no-op — the LSP warns. */
  async navigateScreen(
    name: string,
    container?: string,
    clauses?: { with?: string; after?: number; over?: number; ease?: string },
    instant = false,
  ): Promise<void> {
    if (!this._reactive) {
      // Static path: just show the target (screens are all constructed at connect).
      if (name) {
        this.showScreen(name);
      }
      return;
    }
    if (!name) {
      // Incomplete `[[navigate <container>]]` — nothing to open. The LSP flags
      // this; the runtime stays a no-op rather than dismissing the container.
      return;
    }
    // Close the open screens this navigate replaces: scoped to `container` when
    // given (leave other containers/uncategorized screens alone), else the whole
    // stack. The target is always spared (it gets opened, not torn down).
    const toClose = [...this._mountedScreens.entries()]
      .filter(([n, entry]) =>
        n !== name && (container ? entry.container === container : true),
      )
      .map(([n]) => n);
    await Promise.all([
      ...toClose.map((n) => this.closeScreen(n, clauses, instant)),
      this.openScreen(name, clauses, instant),
    ]);
  }

  /** Apply a beat's `[[open/close/navigate SCREEN]]` directives (Coordinator
   *  fan-out), mirroring `image.write`/`audio.schedule`. Awaits all transitions so
   *  a beat with a `wait` directive can hold advance until they settle. */
  async applyScreenInstructions(
    instructions: ScreenInstruction[],
    instant: boolean,
  ): Promise<void> {
    await Promise.all(
      instructions.map((e) => {
        const clauses = {
          with: e.with,
          after: e.after,
          over: e.over,
          ease: e.ease,
        };
        if (e.control === "close") {
          return this.closeScreen(e.name, clauses, instant);
        }
        if (e.control === "navigate") {
          return this.navigateScreen(e.name, e.container, clauses, instant);
        }
        return this.openScreen(e.name, clauses, instant);
      }),
    );
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
