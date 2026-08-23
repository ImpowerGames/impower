import { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { ErrorType } from "../../../core/enums/ErrorType";
import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { sortFilteredName } from "@impower/sparkdown/src/compiler/utils/sortFilteredName";
import {
  ATTRIBUTE_PROPS,
  BOOLEAN_ATTRIBUTES,
  isAliasedAttributeProp,
  isAttributeProp,
  toDataAttributeName,
} from "@impower/sparkdown/src/compiler/constants/dataAttributeProps";
import type {
  Binding,
  BodyNode,
  ComponentNode,
  ContentPart,
  ElementNode,
  EventBinding,
  ForNode,
  IfNode,
  MatchNode,
  PropValue,
  SlotNode,
  LayoutNode,
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
  LayoutInstruction,
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
import {
  isPlainRun,
  parseRichText,
  RichTextRun,
} from "../utils/parseRichText";
import { Element } from "./helpers/Element";
import {
  AnimateElementsMessage,
  AnimateElementsMessageMap,
} from "./messages/AnimateElementsMessage";
import {
  BatchElementsMessage,
  BatchElementsMessageMap,
} from "./messages/BatchElementsMessage";
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
  /**
   * The currently-open reactive layouts, in mount order (layering). Author
   * `[[open/close/navigate]]` directives mutate the in-memory {@link
   * UIModule._mountedLayouts}, which is NOT serializable; this mirror IS part of
   * the serialized state, so a checkpoint/scrub-preview restore can re-mount the
   * same layouts via {@link UIModule.onRestore} — exactly how `image` rides
   * save/restore. `main` is excluded (it auto-mounts at connect). Each entry
   * keeps only `name` (+ `screen` for diagnostics); the DOM is rebuilt from
   * the layout AST + current reactive state, so nothing else needs persisting.
   */
  layout?: { name: string; screen?: string }[];
}

/** Loop-variable bindings in effect for a scope: each enclosing `for` loop's
 *  variable name → its current iteration value. Empty at the layout root.
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
 *  `{expr}` or an interpolated `"…{expr}…"` string — one-way (UI follows state);
 *  user write-back is via `@input`/`@change`. `propValue` is the whole bound
 *  value (a `binding` or interpolated `content`) re-resolved through
 *  {@link UIModule.resolveProp}. `last` is the last applied value for
 *  equality-gated updates. */
interface ReactiveAttr {
  element: Element;
  prop: string;
  propValue: PropValue;
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

/** An inline `#prop=value` on a GENERIC element (row/column/box/text/button/…),
 *  applied as an inline STYLE (spec §4.2: "#prop=value — the inline equivalent
 *  of a style rule"). The prop keeps its authored sparkle name; the renderer
 *  de-aliases + prop→CSS (+ px-ifies bare numeric lengths) via
 *  getCSSPropertyKeyValue/getCssEquivalent. Registered only when the value is a
 *  binding, so `#background-color={team_color}` re-applies when its deps change. */
interface ReactiveStyle {
  element: Element;
  prop: string;
  propValue: PropValue;
  last: string | null;
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
   *  real-element parent (layout / element / `<select>` children), where a null
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
  /** The enclosing component body's slot map, carried so a `slot` inside this
   *  loop still resolves. `ForRegion` holds no scope object to walk up to. */
  slots?: SlotMap;
  /** See {@link CondRegion.owner}. */
  owner?: ReactiveRegion;
}

/** An authored-component instance (`card("x")`, spec §4.7), wrapperless like
 *  cond/for: the component's body is mounted directly into `parent` at the
 *  region's slot, in `scope` (whose `env` holds the param values, evaluated in
 *  the CALLER's env and mutated in place on re-eval). `node` is the call element
 *  (its `params` are the arg bindings; its children are the default-slot content
 *  + `fill`s, exposed to the body via `scope.slots`). */
interface ComponentRegion {
  kind: "component";
  parent: Element;
  node: ElementNode;
  comp: ComponentNode;
  scope: ReactiveScope;
  content: ReactiveGroup;
  siblings: ReactiveGroup;
  owner?: ReactiveRegion;
}

/** A `slot` placeholder inside a component body: the caller's matching content
 *  (default children or a named `fill`) mounted at this position but registered
 *  in the CALLER's scope (so it reads caller vars, and refreshes with the
 *  caller, not the component). Structurally static — refresh is a no-op here. */
interface SlotRegion {
  kind: "slot";
  parent: Element;
  content: ReactiveGroup;
  siblings: ReactiveGroup;
  owner?: ReactiveRegion;
}

type ReactiveRegion = CondRegion | ForRegion | ComponentRegion | SlotRegion;

/** Caller-supplied content for a component's slots, keyed by slot name (`""` =
 *  the default slot). Mounted in the CALLER's scope at each matching `slot`. */
type SlotMap = Map<string, { children: BodyNode[]; scope: ReactiveScope }>;

/** Reactive registrations produced by one mount pass, mirroring the mount tree
 *  so a subtree's spans + nested regions can be torn down together. `env` holds
 *  the loop-var bindings in effect for everything registered in this scope.
 *  `slots` is set only on a component body scope (caller content per slot). */
interface ReactiveScope {
  env: ReactiveEnv;
  texts: ReactiveText[];
  regions: ReactiveRegion[];
  attrs: ReactiveAttr[];
  styles: ReactiveStyle[];
  sliderFills: ReactiveSliderFill[];
  slots?: SlotMap;
}

/** Builtin form-control tags → the `<input>` type they render as, plus any
 *  fixed attributes that define the control. Their props
 *  (value/checked/min/max/placeholder/…) become attributes; value/checked also
 *  bind one-way + write back via @input/@change.
 *
 *  `switch` is a checkbox carrying `role="switch"` — the same shape Pico styles
 *  as a toggle. Authored props are applied AFTER these, so `input #type="email"`
 *  (and the other HTML input types Pico styles: password, number, search, tel,
 *  url, date, time, color, …) narrows the generic `input` without needing a
 *  dedicated tag per type. */
const INPUT_WIDGETS: Record<
  string,
  { inputType: string; attributes?: Record<string, string> }
> = {
  input: { inputType: "text" },
  slider: { inputType: "range" },
  checkbox: { inputType: "checkbox" },
  radio: { inputType: "radio" },
  switch: { inputType: "checkbox", attributes: { role: "switch" } },
};

/**
 * Builtin tag → the real DOM tag it renders as. Anything absent renders as a
 * `<div>` (the overlay's default box), which is still what `text`, `box`,
 * `image`, `mask` and the layout containers want.
 *
 * Names are READABLE rather than HTML jargon (`list`/`item`, not `ul`/`li`),
 * matching the rest of the vocabulary (`input`, `dropdown`, `slider`,
 * `divider`, `modal`). HTML tag names buy nothing for portability anyway — UI
 * Toolkit has no `ul`/`table`, so a Unity renderer maps `list`/`item` just as
 * easily, and readable names keep the model from biasing toward HTML.
 *
 * VISUAL inline styling is deliberately NOT here. `bold`, `italic`,
 * `underline`, `highlight` … are style CLASSES (`text bold "…"`, like
 * `text h1`), and styling WITHIN a line is done with rich-text tags
 * (`text "a <b>bold</b> word"` — see ui/utils/parseRichText.ts).
 *
 * SEMANTIC inline elements are the exception: `strong` and `emphasis` are tags,
 * because <strong>/<em> convey meaning to assistive tech while <b>/<i> are
 * explicitly stylistic-only. Same word, different job — `strong "Vital"` says
 * it matters, `text bold "Vital"` just makes it heavy.
 *
 * A name existing as a style CLASS is NOT a reason to keep it out. This comment
 * used to claim promoting one "would turn existing authoring like
 * `text small "…"` into a two-tags-on-one-line warning". It does not, and no
 * such diagnostic exists: the lookup below reads `node.tag`, the FIRST token on
 * the line, and every later token is a class it never consults. `strong` has
 * been in both roles all along — `text strong "A"` renders `<div class="text
 * strong">` with no complaint. Promoting a name is purely ADDITIVE, which is
 * why `h1`-`h6`, `small` and `code` could move here without touching a single
 * existing call site.
 *
 * Still genuinely not listed: LAYOUT classes (`nav`, `group`, `grid`, `muted`,
 * `container`, …). Those describe arrangement or appearance, not meaning, so
 * there is no element for them to be — `nav` is the one arguable case, and it
 * is deliberately a class because ours is a styled row, not a <nav> landmark.
 */
const ELEMENT_TAGS: Record<string, string> = {
  // Interactive / semantic controls
  link: "a",
  button: "button",
  label: "label",
  span: "span",
  divider: "hr",
  // Lists
  list: "ul",
  ordered_list: "ol",
  item: "li",
  // Tables. `table_row` rather than `row`, which is taken by the flex class.
  table: "table",
  table_header: "thead",
  table_body: "tbody",
  table_footer: "tfoot",
  table_row: "tr",
  head: "th",
  cell: "td",
  // Text structure. `strong`/`emphasis` are ELEMENTS because they carry
  // MEANING a screen reader acts on (importance / stress emphasis). Purely
  // visual weight and slant are the `bold` / `italic` CLASSES instead — the
  // same split HTML itself draws between <strong>/<em> and <b>/<i>.
  strong: "strong",
  emphasis: "em",
  quote: "blockquote",
  citation: "cite",
  // Headings. A heading is the single element assistive tech navigates BY —
  // jump-to-next-heading is how a screen-reader user skims a page at all — and
  // a `<div class="h2">` supports none of it, nor does it contribute to the
  // document outline. The visual size was never the point.
  //
  // These names already existed as style CLASSES, and still work as classes:
  // the tag lookup below reads the FIRST token only, so `text h2 "…"` still
  // renders a div and picks up `.h2`. Promoting is purely additive. An element
  // also carries its own name as a class, so `h2 "…"` gets `<h2 class="h2">`
  // and the existing `style h2` applies with no change.
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  // Inline semantics, same reasoning as strong/emphasis: each conveys meaning
  // a screen reader acts on that no styling can carry.
  code: "code",
  // `kbd` is user INPUT (keys to press); `code` is source.
  kbd: "kbd",
  preformatted: "pre",
  // A real <p>, and the ONE element that ships with a bottom margin.
  //
  // `text` stays a margin-free div and remains the workhorse: it takes any
  // children and gets its rhythm from a container's `child-gap`. `paragraph` is
  // the opt-in document element for prose, where the space below is part of
  // what a paragraph IS, not a layout decision made by its parent. Both rhythm
  // models are available and each is explicit at the call site.
  //
  // <p> cannot legally contain BLOCK children. The DOM accepts it (we build by
  // appendChild, not by parsing), so a `text` inside a `paragraph` renders --
  // but it serializes to HTML that re-parses differently, which is exactly what
  // the showcase dump does. Keep its children inline.
  paragraph: "p",
  // `<small>` is side comment / fine print — legally, the small print. Ours is
  // used for form hints and footnotes, which is that.
  small: "small",
  // `sub`/`sup`/`kbd` keep the HTML spelling rather than following the
  // spelled-out convention above (`emphasis`, `citation`, `picture`). Those
  // renames buy clarity because the HTML name is cryptic or already taken;
  // these three are the names everyone already knows, and the same spellings
  // are what an author writes inline as `<sub>`/`<sup>` rich-text tags. Two
  // names for one thing is the worse cost here.
  sub: "sub",
  sup: "sup",
  // A figure is the captioned-media pairing, so `caption` is only meaningful
  // inside one. The authored element is `picture`, NOT `image`: `image` is
  // already the engine's own name for a backdrop LAYER, which is a container
  // with children — mapping it to the void `<img>` silently reparents those
  // children out of existence.
  figure: "figure",
  caption: "figcaption",
  picture: "img",
  // Structure
  article: "article",
  section: "section",
  header: "header",
  footer: "footer",
  form: "form",
  fieldset: "fieldset",
  legend: "legend",
  foldout: "details",
  // Authored as `modal`; still a real <dialog>. Named `modal` so it cannot be
  // confused with the SCREENPLAY `dialogue` style (speech), which is a
  // completely different thing one letter away.
  modal: "dialog",
  progress: "progress",
};

/**
 * Props that are HTML ATTRIBUTES rather than styling, on an otherwise generic
 * element. `#prop` normally lowers to an inline style (spec §4.2), which is
 * right for `#padding` / `#child-gap` / `#background-color` — but meaningless
 * for `#href` on a link or `#colspan` on a cell. Everything here (plus any
 * `aria-*` / `data-*`) is routed to an attribute instead.
 */
/** Tags whose text content is a LABEL for their children rather than inline
 *  text, mounted as a real element of its own (see constructElement). */
const IMPLICIT_LABEL_TAGS: Record<string, { type: string; name: string }> = {
  foldout: { type: "summary", name: "foldout_label" },
};


export type UIMessageMap = AnimateElementsMessageMap &
  BatchElementsMessageMap &
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

  // Fire-and-forget UI ops (create/update/destroy/move/observe/unobserve/
  // set-theme) accumulate here and flush as a single `ui/batch` notification —
  // cutting the per-turn message volume the reactive runtime emits. A microtask
  // is armed when the buffer goes empty→non-empty as a safety-net flush; the hot
  // paths also flush synchronously (end of refreshLayouts, and before each
  // AWAITED op so create-before-use ordering holds). See enqueueUI/flushUIBatch.
  protected _uiBatch: IMessage[] = [];
  protected _uiBatchScheduled = false;

  protected _events: Partial<
    Record<string, Record<string, (event: Event) => void>>
  > = {};

  protected _clearOnContinue: Set<string> = new Set();

  // Phase 3 reactive runtime: render layouts from program.sparkle (the typed AST)
  // instead of the static context.layout struct, with coarse per-turn binding
  // re-eval. OFF by default — the static path stays the golden-master fallback
  // until the AST path reaches parity. Flipped per-increment / via config.
  protected _reactive = false;

  // One-shot dep-gate override for the first refresh after `start()` (see
  // onStart). Cleared at the end of the next refreshLayouts walk.
  protected _refreshAll = false;

  constructor(game: Game) {
    super(game);
    this.initLayouts();
  }

  /** Between `connect` (which re-mounts layouts on a reused game) and
   *  `start()`, `system.simulating` is still set from the route simulation,
   *  so every paint the mount produces is suppressed while each entry's
   *  equality memo (`last`) records the freshly evaluated value. The renderer
   *  is left showing the ABANDONED run's pixels, and the dep-gated per-beat
   *  refresh can never repair that: it trusts `last`, which already matches
   *  the new state. On a STOP → PLAY the game looked frozen at the old values
   *  until handlers happened to walk the number past the stale paint (#365's
   *  restart face). So the first refresh after a start re-evaluates AND
   *  repaints every binding, ignoring both gates once. */
  override onStart(): void {
    this._refreshAll = true;
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
    // A binding that THROWS must not abort the mount. `text "{player.stats.hp}"`
    // with `player.stats` nil compiles with zero diagnostics and then threw out
    // of mountTextContent -> constructLayoutsFromAst -> onConnected ->
    // Game.connect -> buildApp, with no try/catch anywhere on that chain: the
    // whole preview went blank, nothing reached the wire, and no error was
    // surfaced. The identical expression in DIALOGUE degrades gracefully, so
    // the same text was fatal in one position and harmless in the other.
    //
    // `undefined` is already the not-evaluable answer here (see the guards
    // above) and every consumer handles it.
    try {
      return story.EvaluateFunction(exprId, args);
    } catch (e) {
      this.reportRuntimeError(`Error evaluating \`${binding.source ?? exprId}\``, e);
      return undefined;
    }
  }

  /** Surface a runtime error without unwinding the caller.
   *
   *  `story.onError` is the channel `Game.setupStory` wires to its own runtime
   *  error notification, so this reaches the editor exactly like an ink runtime
   *  error rather than dying silently in a console. */
  protected reportRuntimeError(what: string, e: unknown): void {
    const detail = e instanceof Error ? e.message : String(e);
    // No SourceMetadata: a binding evaluation failure has no single ink source
    // location to point at (the handler wires the message through unchanged).
    this._game.story.onError?.(`${what}: ${detail}`, ErrorType.Error, null);
  }

  override getBuiltins() {
    return uiBuiltinDefinitions();
  }

  override getStored(): string[] {
    return [];
  }

  override onReset() {
    this._events = {};
    this._mountedLayouts = new Map();
  }

  override async onConnected() {
    this._root = undefined;
    this._root = this.getOrCreateRootElement();
    // Dropping the root restarts the deterministic structural id counters, so
    // every id this connect mints has been used before. `_events` is keyed by
    // those ids and was cleared only in `onReset()` — and this branch reuses
    // the `Game` across live-preview edits, so from the second edit onward
    // (the first still takes the `simulation === "fail"` reset path; later
    // same-beat edits return early and reset nothing) a handler the author had
    // DELETED kept firing under a re-minted id. Clearing here is safe because
    // `mountEvent` re-registers every live handler during the replay below.
    this._events = {};
    // Reactive layouts are the ONLY render path now (the `config.ui.reactive`
    // opt-in was retired once `main` auto-opens and `[[open/close]]` mount the
    // rest). The static `constructLayouts` path remains only as a fallback when a
    // program somehow ships no Sparkle AST (program.sparkle.layouts) at all.
    this._reactive = true;
    this.constructStyles();
    if (this._game.program?.sparkle?.layouts) {
      this.constructLayoutsFromAst();
    } else {
      this.constructLayouts();
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
    // Re-mount author-opened reactive layouts recorded in the serialized state
    // (mirrors image.restore). `onConnected` already mounted `main`; here we add
    // the layouts that `[[open/navigate]]` opened on earlier beats, so a
    // checkpoint/scrub-preview shows the correct layout set instead of just
    // `main`. Mount instantly via constructLayoutFromAst (NOT openLayout) so no
    // enter transition replays during a scrub. The story state is already loaded,
    // so each layout's reactive bindings resolve against the restored values.
    if (this._state.layout) {
      let remounted = false;
      for (const { name } of this._state.layout) {
        if (name && name !== "main" && !this._mountedLayouts.has(name)) {
          const layout = this._game.program?.sparkle?.layouts?.[name];
          if (layout) {
            this.constructLayoutFromAst(layout);
            remounted = true;
          }
        }
      }
      if (remounted) {
        // Settle load-time reactive residue (as openLayout does) and reveal the
        // layouts layer so the re-mounted layouts are visible.
        this._game.story.variablesState.takeReactiveChanges();
        this.reveal();
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

  /** Buffer a fire-and-forget UI op for the next `ui/batch` flush. Arms a
   *  microtask safety-net flush on the empty→non-empty transition so an op never
   *  lingers past the synchronous turn even on a path that forgets to flush. */
  protected enqueueUI(msg: IMessage): void {
    this._uiBatch.push(msg);
    if (!this._uiBatchScheduled) {
      this._uiBatchScheduled = true;
      queueMicrotask(() => this.flushUIBatch());
    }
  }

  /** Emit the buffered ops as one `ui/batch` notification, in order. Called
   *  synchronously at the hot boundaries (end of refreshLayouts; before each
   *  AWAITED op, so the consumer applies create/update before a write/animate
   *  targets them) and by the microtask net. No-op when the buffer is empty. */
  protected flushUIBatch(): void {
    this._uiBatchScheduled = false;
    if (this._uiBatch.length === 0) {
      return;
    }
    const messages = this._uiBatch;
    this._uiBatch = [];
    this.emit(BatchElementsMessage.type.notification({ messages }));
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
    this.enqueueUI(
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
    // Drop any `@event` handlers registered for this element, and tell the
    // renderer to detach its DOM listener.
    //
    // The static `setEventListener` path already cleans up (it deletes on a null
    // callback); the reactive `mountEvent` path had no counterpart, so every
    // destroy leaked. And structural ids are MONOTONIC — `Element.nextChildIndex`
    // never reuses a number even after removal — so the orphan is never
    // overwritten by a later element. Each one retains its `scope.env` (loop
    // values included) and, through the handler, the Story. A keyed `for` that
    // drops rows, a conditional that switches branch, or a layout that closes
    // therefore grew `_events` without bound; `onReset` clears it, but that only
    // fires on a full game reset, not on the incremental churn this path exists
    // to serve.
    for (const [event, byId] of Object.entries(this._events)) {
      if (byId && element.id in byId) {
        delete byId[element.id];
        this.enqueueUI(
          UnobserveElementMessage.type.notification({
            element: element.id,
            event,
          }),
        );
      }
    }
    element.remove();
    this.enqueueUI(
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
    this.enqueueUI(
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
    this.enqueueUI(
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
    // Flush pending create/update ops so the elements this animation targets
    // exist on the consumer before the animate request arrives.
    this.flushUIBatch();
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
    const target = this.context.config?.ui?.layouts_element_name;
    if (target) {
      const uiRoot = this._root?.findChild(target);
      if (uiRoot) {
        this.updateElement(uiRoot, { style: { opacity: "0" } });
      }
    }
  }

  reveal() {
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

  getUrl(src: string) {
    return `url("${src}")`;
  }

  getTimingFunction(ease: Ease) {
    return `${ease.function}(${ease.parameters.join(",")})`;
  }

  getImageAssets(type: string, name: string, visited = new Set<string>()) {
    // `a` -> filtered `a` -> `a` is authorable, and the untyped fan-out below
    // re-enters this method, so without a guard a cycle recurses until the
    // stack blows rather than rendering a missing image.
    const visitKey = `${type}:${name}`;
    if (visited.has(visitKey)) {
      return [];
    }
    visited.add(visitKey);
    if (!type) {
      const images: Image[] = [];
      images.push(...this.getImageAssets("filtered_image", name, visited));
      images.push(...this.getImageAssets("layered_image", name, visited));
      images.push(...this.getImageAssets("image", name, visited));
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
            // Branch the guard per layer: it exists to stop cycles along one
            // path, and sharing it would drop a layer that legitimately
            // reuses an asset an earlier layer already used.
            images.push(
              ...this.getImageAssets(image.$type, image.$name, new Set(visited)),
            );
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
            if (layer && typeof layer === "object") {
              // Resolve each surviving layer the same way the layered_image
              // branch does: a layer can itself be a group, and the compiler
              // emits bare references with an empty `$type`, so a direct
              // `context.image` lookup would silently drop it.
              images.push(
                ...this.getImageAssets(
                  layer.$type,
                  layer.$name,
                  new Set(visited),
                ),
              );
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
      const filteredImage = this.context.filtered_image[imageName];
      filterImage(this.context, filteredImage);
      if (filteredImage.filtered_src) {
        return [filteredImage.filtered_src];
      }
      // A layered root yields no single flattened src — it filters down to the
      // subset of layers that survived, which still has to be composited.
      // Only claim the lookup when something survived: an empty array would
      // join into a trailing empty `background-image` component, which
      // invalidates the whole declaration and blanks sibling images too.
      if (filteredImage.filtered_layers?.length) {
        const srcs = this.getImageAssets("filtered_image", imageName).map(
          (asset) => asset.src,
        );
        if (srcs.length > 0) {
          return srcs;
        }
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
    // Process Animations. `$`-prefixed entries are type metadata, not
    // authored animations — the runtime define channel carries the type's
    // `$default` (for `lookupContextValue` fallbacks), and emitting it here
    // would generate a pointless empty `@keyframes` block for "$default".
    const animations = this.context?.animation;
    if (animations) {
      const authored = Object.fromEntries(
        Object.entries(animations).filter(([name]) => !name.startsWith("$")),
      );
      this.constructStyle("animations", { animations: authored });
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
  // Reactive runtime (Phase 3): mount layouts from the typed Sparkle AST
  // (program.sparkle.layouts) instead of the flattened context.layout struct.
  //
  // I1 — static mount: reproduce constructLayout's element tree byte-for-byte
  // (named structural divs; text/stroke → inline span; image/mask → background
  // span) so flag-ON output matches the static golden when no `{expr}` bindings
  // are present.
  // I2 — one-way binding eval: `{expr}` content is evaluated to its live value at
  // mount, the bound span is registered, and `refreshLayouts()` re-evaluates +
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

  /** Layouts that are currently MOUNTED (have live DOM + a reactive scope),
   *  keyed by name. This is the source of truth for the reactive lifecycle:
   *  `main` is mounted by default (auto-open); every other layout is mounted by
   *  `[[open X]]` and removed by `[[close X]]` (true spawn/destroy). The roots of
   *  the scope tree walked each turn by {@link refreshLayouts} are the `scope`s
   *  of every entry. Each entry records its navigation `screen` (the `in SCREEN`
   *  group) so `navigate` can close only the layouts in that screen. */
  protected _mountedLayouts: Map<
    string,
    { element: Element; scope: ReactiveScope; screen?: string }
  > = new Map();

  /** Test/preview convenience: when set, {@link constructLayoutsFromAst} mounts
   *  EVERY layout at connect (instant, no transition) instead of just `main`.
   *  Off in production — only `main` auto-opens; everything else needs `[[open]]`.
   *  The harness sets this so existing reactive tests keep their "layout is
   *  mounted at connect" assumption. */
  _autoOpenAll = false;

  constructLayoutsFromAst(...structNames: string[]): void {
    this._mountedLayouts = new Map();
    const layouts = this._game.program?.sparkle?.layouts;
    if (!layouts) {
      return;
    }
    // Enable fine-grained dependency tracking for the whole reactive lifetime;
    // mount captures each binding's read deps (Phase 4).
    this._game.story.variablesState.reactiveDepsEnabled = true;
    const targetAllLayouts = !structNames || structNames.length === 0;
    // Default: ONLY `main` is mounted/visible from the start (implicit auto-open).
    // Every other layout stays unmounted (zero DOM / zero binding cost) until an
    // explicit `[[open X]]`. The `_autoOpenAll` test flag mounts them all.
    const validLayoutNames = !targetAllLayouts
      ? structNames
      : this._autoOpenAll
        ? Object.keys(layouts)
        : Object.keys(layouts).filter((name) => name === "main");
    for (const layoutName of validLayoutNames) {
      if (layoutName && !layoutName.startsWith("$")) {
        const layout = layouts[layoutName];
        if (layout) {
          this.constructLayoutFromAst(layout);
        }
      }
    }
    // Discard load-time change residue so the first per-turn refresh only sees
    // changes produced after mount.
    this._game.story.variablesState.takeReactiveChanges();
  }

  protected constructLayoutFromAst(layout: LayoutNode): Element {
    const parent = this.getOrCreateRootLayoutElement();
    const uiEl = this.createElement(parent, {
      type: "div",
      name: layout.name,
      style: {
        position: "absolute",
        inset: "0",
        display: "flex",
        flex_direction: "column",
      },
    });
    const scope = this.makeScope({});
    this._mountedLayouts.set(layout.name, {
      element: uiEl,
      scope,
      ...(layout.screen ? { screen: layout.screen } : {}),
    });
    this.mountChildren(uiEl, layout.children, scope, null);
    return uiEl;
  }

  /** A fresh reactive scope with the given loop env.
   *
   *  `parent` exists so the SLOT MAP survives a nested region. Only
   *  `mountComponent` ever assigns `slots`, and it assigns it to the component
   *  BODY's scope — so a `slot` sitting inside an `if`/`for`/`match` within that
   *  body was looked up on a fresh, slot-less child scope, found nothing, and
   *  rendered empty. There is no parent link on `ReactiveScope` to walk, so the
   *  map has to be carried down at construction.
   *
   *  A nested component call must NOT inherit: it gets its own slot map from its
   *  own caller, which is why `mountComponent` passes nothing here. */
  protected makeScope(env: ReactiveEnv, slots?: SlotMap): ReactiveScope {
    return {
      env,
      texts: [],
      regions: [],
      attrs: [],
      styles: [],
      sliderFills: [],
      ...(slots ? { slots } : {}),
    };
  }

  protected mountNode(
    parent: Element,
    node: BodyNode,
    scope: ReactiveScope,
    before: Element | null,
  ): Element | ReactiveRegion | undefined {
    if (node.kind === "element") {
      // An element whose tag resolves to an authored `component` is an instance:
      // expand its body (with the call's args as params + children as slots).
      if (this._game.program?.sparkle?.components?.[node.tag]) {
        return this.mountComponent(parent, node, scope, before);
      }
      return this.mountElement(parent, node, scope, before);
    }
    if (node.kind === "if" || node.kind === "match") {
      return this.mountCondRegion(parent, node, scope, before);
    }
    if (node.kind === "for") {
      return this.mountForRegion(parent, node, scope, before);
    }
    if (node.kind === "slot") {
      return this.mountSlot(parent, node, scope, before);
    }
    // `fill` is consumed at the call site (into the component's slot map), never
    // mounted standalone.
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
    // textarea is a real (non-void) element whose value is a live PROPERTY, so
    // it can't ride the <input> path — but its props/binding surface is the same.
    if (node.tag === "textarea") {
      return this.mountTextarea(parent, node, scope, name, before);
    }
    if (node.tag === "option") {
      return this.mountOption(parent, node, scope, name, before);
    }
    // Inline `#prop=value` on a generic element → an inline STYLE (spec §4.2:
    // "the inline equivalent of a style rule"). The widget mounters route props
    // to ATTRIBUTES; a plain container/leaf routes them to `style` instead (the
    // spec's HUD/settings examples use `#gap`, `#background-color`,
    // `#child-justify`, `#width` on containers). The renderer de-aliases +
    // prop→CSS + px-ifies via getCSSPropertyKeyValue/getCssEquivalent, so the
    // authored sparkle name is passed through as-is. Reactive props re-apply on
    // refresh (scope.styles), mirroring scope.attrs.
    //
    // EXCEPT the props that are HTML ATTRIBUTES rather than styling: a `link`
    // needs `#href`, `details`/`dialog` need `#open`, a `td` needs `#colspan`,
    // and anything can carry `#role` / `#aria-*` / `#data-*`. Those have no
    // meaning as CSS, so they're routed to attributes (and tracked in
    // scope.attrs so a bound one stays live).
    const style: Record<string, string | null> = {};
    const attributes: Record<string, string | null> = {};
    const reactiveStyles: Omit<ReactiveStyle, "element">[] = [];
    const reactiveAttrs: Omit<ReactiveAttr, "element">[] = [];
    const propEntries = Object.entries(node.props);
    if (propEntries.length > 0) {
      const vs = this._game.story.variablesState;
      for (const [prop, propValue] of propEntries) {
        vs.beginReactiveRead();
        const resolved = this.resolveProp(propValue, scope.env);
        const deps = vs.endReactiveRead();
        if (isAttributeProp(prop)) {
          const boolean = BOOLEAN_ATTRIBUTES.has(prop);
          const attrVal = this.propToAttr(resolved, boolean);
          // A non-standard prop is authored bare (`#tooltip`) but written as
          // `data-tooltip`, so the DOM stays conforming.
          const attr = toDataAttributeName(prop);
          attributes[attr] = attrVal;
          if (this.isReactiveProp(propValue)) {
            reactiveAttrs.push({
              prop: attr,
              propValue,
              boolean,
              last: attrVal,
              deps,
            });
          }
          continue;
        }
        const val = resolved == null ? null : String(resolved);
        style[prop] = val;
        if (this.isReactiveProp(propValue)) {
          reactiveStyles.push({ prop, propValue, last: val, deps });
        }
      }
    }
    // Most builtins are boxes; the semantic ones (a / button / li / td / …)
    // render as their real HTML tag so the tree is navigable and Pico's
    // element-level expectations hold. Unlisted tags stay a <div>.
    const type = ELEMENT_TAGS[node.tag] ?? "div";
    const el = this.createElement(
      parent,
      {
        type,
        name,
        ...(Object.keys(style).length > 0 ? { style } : {}),
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      },
      before,
    );
    for (const r of reactiveStyles) {
      scope.styles.push({ element: el, ...r });
    }
    for (const r of reactiveAttrs) {
      scope.attrs.push({ element: el, ...r });
    }
    // Builtin leaf semantics: image/mask render a background span; everything
    // else with adjacency content (text/stroke, but also button/label/…) renders
    // it as an inline span. Content-less structural elements get no span
    // (mountTextContent no-ops), preserving constructLayout parity.
    // An element whose CONTENT is a label for the children it reveals — the
    // author writes `foldout "Label": …` rather than a separate label
    // builtin, exactly as `button "Save"` labels a button. The label becomes a
    // real <summary>, so the disclosure works natively.
    const implicitLabel = IMPLICIT_LABEL_TAGS[node.tag];
    if (implicitLabel && node.content && node.content.length > 0) {
      const labelEl = this.createElement(el, {
        name: implicitLabel.name,
        type: implicitLabel.type,
      });
      this.mountTextContent(labelEl, node.content, scope);
    } else if (node.tag === "image") {
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
    widget: { inputType: string; attributes?: Record<string, string> },
    before: Element | null,
  ): Element {
    const vs = this._game.story.variablesState;
    // The control's defining attributes first, so authored props can still
    // narrow them (`input #type="email"`).
    const attributes: Record<string, string | null> = {
      type: widget.inputType,
      ...widget.attributes,
    };
    const reactive: Omit<ReactiveAttr, "element">[] = [];
    // A control takes STYLE props too, exactly as a container does. Every prop
    // used to become an attribute here, so `#margin-bottom=18` on an input
    // emitted a literal `margin-bottom="18"` attribute -- valid-looking markup
    // that the browser ignores entirely. It failed silently: no warning, no
    // style, and an attribute sitting in the DOM to suggest it had worked.
    //
    // This matters because form controls carry no margin of their own (see
    // builtins.sd), so stating the spacing at the call site is the ONLY way to
    // space one -- and it was the one thing that could not be done.
    const style: Record<string, string | null> = {};
    const reactiveStyles: Omit<ReactiveStyle, "element">[] = [];
    for (const [prop, propValue] of Object.entries(node.props)) {
      // Every presence-semantics attribute, not just `checked`. HTML reads
      // `disabled="false"` as DISABLED, so `#disabled={locked}` with
      // `locked = false` produced a control that could never be enabled — and
      // because `entry.boolean` is reused by `refreshScope`, flipping the store
      // back could not clear it either.
      const boolean = BOOLEAN_ATTRIBUTES.has(prop);
      vs.beginReactiveRead();
      const resolved = this.resolveProp(propValue, scope.env);
      const deps = vs.endReactiveRead();
      if (!isAttributeProp(prop)) {
        const val = resolved == null ? null : String(resolved);
        style[prop] = val;
        if (this.isReactiveProp(propValue)) {
          reactiveStyles.push({ prop, propValue, last: val, deps });
        }
        continue;
      }
      const attrVal = this.propToAttr(resolved, boolean);
      attributes[toDataAttributeName(prop)] = attrVal;
      if (this.isReactiveProp(propValue)) {
        reactive.push({ prop, propValue, boolean, last: attrVal, deps });
      }
    }
    const el = this.createElement(
      parent,
      {
        type: "input",
        name,
        attributes,
        ...(Object.keys(style).length > 0 ? { style } : {}),
      },
      before,
    );
    for (const r of reactiveStyles) {
      scope.styles.push({ element: el, ...r });
    }
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
  /** `textarea #value={notes} @input=set_notes` → a real `<textarea>`. Same
   *  prop/binding surface as the `<input>` widgets (props become attributes,
   *  `value` is routed to the live property by the renderer), but it is a
   *  non-void element so it gets its own mounter rather than INPUT_WIDGETS. */
  protected mountTextarea(
    parent: Element,
    node: ElementNode,
    scope: ReactiveScope,
    name: string,
    before: Element | null,
  ): Element {
    const vs = this._game.story.variablesState;
    const attributes: Record<string, string | null> = {};
    const style: Record<string, string | null> = {};
    const reactiveStyles: Omit<ReactiveStyle, "element">[] = [];
    const reactive: Omit<ReactiveAttr, "element">[] = [];
    for (const [prop, propValue] of Object.entries(node.props)) {
      vs.beginReactiveRead();
      const resolved = this.resolveProp(propValue, scope.env);
      const deps = vs.endReactiveRead();
      // A style prop is a STYLE, not an attribute. Routing everything to
      // attributes emitted things like `margin-bottom="18"` into the DOM:
      // markup that looks deliberate and does nothing at all.
      if (!isAttributeProp(prop)) {
        const val = resolved == null ? null : String(resolved);
        style[prop] = val;
        if (this.isReactiveProp(propValue)) {
          reactiveStyles.push({ prop, propValue, last: val, deps });
        }
        continue;
      }
      // `readonly`/`disabled`/`required` are presence-semantics: passing them
      // through as the string "false" READS AS TRUE in HTML.
      const boolean = BOOLEAN_ATTRIBUTES.has(prop);
      const attrVal = this.propToAttr(resolved, boolean);
      attributes[toDataAttributeName(prop)] = attrVal;
      if (this.isReactiveProp(propValue)) {
        reactive.push({ prop, propValue, boolean, last: attrVal, deps });
      }
    }
    const el = this.createElement(
      parent,
      {
        type: "textarea",
        name,
        attributes,
        ...(Object.keys(style).length > 0 ? { style } : {}),
      },
      before,
    );
    for (const r of reactive) {
      scope.attrs.push({ element: el, ...r });
    }
    for (const r of reactiveStyles) {
      scope.styles.push({ element: el, ...r });
    }
    for (const ev of node.events) {
      this.mountEvent(el, ev, scope);
    }
    return el;
  }

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
    const style: Record<string, string | null> = {};
    const reactiveStyles: Omit<ReactiveStyle, "element">[] = [];
    let selected: { propValue?: PropValue; last: string | null; deps: ReactiveDeps } | null = null;
    for (const [prop, propValue] of Object.entries(node.props)) {
      vs.beginReactiveRead();
      const resolved = this.resolveProp(propValue, scope.env);
      const deps = vs.endReactiveRead();
      // A style prop is a STYLE, not an attribute. Routing everything to
      // attributes emitted things like `margin-bottom="18"` into the DOM:
      // markup that looks deliberate and does nothing at all.
      if (!isAttributeProp(prop)) {
        const val = resolved == null ? null : String(resolved);
        style[prop] = val;
        if (this.isReactiveProp(propValue)) {
          reactiveStyles.push({ prop, propValue, last: val, deps });
        }
        continue;
      }
      // `multiple`/`disabled`/`required` on a <select> are presence-semantics;
      // `value` never is, and is deferred below regardless.
      const attrVal = this.propToAttr(resolved, BOOLEAN_ATTRIBUTES.has(prop));
      if (prop === "value") {
        // Defer until options are mounted (a <select>.value can't select an
        // option that doesn't exist yet).
        selected = {
          ...(this.isReactiveProp(propValue) ? { propValue } : {}),
          last: attrVal,
          deps,
        };
        continue;
      }
      attributes[prop] = attrVal;
      if (this.isReactiveProp(propValue)) {
        reactive.push({
          prop,
          propValue,
          boolean: BOOLEAN_ATTRIBUTES.has(prop),
          last: attrVal,
          deps,
        });
      }
    }
    const el = this.createElement(
      parent,
      {
        type: "select",
        name,
        attributes,
        ...(Object.keys(style).length > 0 ? { style } : {}),
      },
      before,
    );
    for (const r of reactiveStyles) {
      scope.styles.push({ element: el, ...r });
    }
    // Options (incl. those produced by `for`/`if`) mount as DIRECT children of
    // the <select> — wrapperless, so HTMLSelectElement.options enumerates them.
    this.mountChildren(el, node.children, scope, null);
    if (selected) {
      this.updateElement(el, { attributes: { value: selected.last } });
      if (selected.propValue) {
        scope.attrs.push({
          element: el,
          prop: "value",
          propValue: selected.propValue,
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
      const boolean = BOOLEAN_ATTRIBUTES.has(prop);
      vs.beginReactiveRead();
      const resolved = this.resolveProp(propValue, scope.env);
      const deps = vs.endReactiveRead();
      const attrVal = this.propToAttr(resolved, boolean);
      attributes[prop] = attrVal;
      if (prop === "value") hasValue = true;
      if (this.isReactiveProp(propValue)) {
        reactive.push({ prop, propValue, boolean, last: attrVal, deps });
      }
    }
    if (!hasValue && node.content) {
      // Default the value to the visible label. When the label is a single
      // reactive `{expr}`, keep the value in lock-step with it (reuse the attr
      // reactive path) so the selected value never desyncs from the shown text.
      const only = node.content.length === 1 ? node.content[0] : undefined;
      if (only && only.kind === "binding") {
        const propValue: PropValue = { kind: "binding", binding: only.binding };
        vs.beginReactiveRead();
        const resolved = this.resolveProp(propValue, scope.env);
        const deps = vs.endReactiveRead();
        const attrVal = this.propToAttr(resolved, false);
        attributes["value"] = attrVal;
        reactive.push({ prop: "value", propValue, boolean: false, last: attrVal, deps });
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
    if (propValue.kind === "literal") {
      return propValue.value;
    }
    if (propValue.kind === "content") {
      // Interpolated quoted string (`"Score is {score}"`): concatenate the
      // literal + `{expr}` parts to a string, exactly like element display
      // content (resolveContent). Each binding was lowered with the caller's
      // loop vars, so it evaluates against the same `env` passed here.
      return this.resolveContent(propValue.content, env);
    }
    return this.evalBinding(propValue.binding, env);
  }

  /** A prop is reactive (needs a {@link ReactiveAttr} so it re-resolves on
   *  refresh) when it holds a live `{expr}` binding or an interpolated
   *  `"…{expr}…"` content string — a plain literal never changes. */
  protected isReactiveProp(propValue: PropValue): boolean {
    return propValue.kind === "binding" || propValue.kind === "content";
  }

  /** Map a resolved prop value to an attribute string: a presence-semantics
   *  attribute ({@link BOOLEAN_ATTRIBUTES}) becomes `""`/absent; everything
   *  else is stringified (nullish → absent).
   *
   *  Stringifying a presence attribute is never merely imprecise — HTML reads
   *  `disabled="false"` as disabled, so `false` would produce exactly the
   *  state it denies. */
  protected propToAttr(resolved: unknown, boolean: boolean): string | null {
    if (boolean) {
      return this.isTruthy(resolved) ? "" : null;
    }
    return resolved == null ? null : String(resolved);
  }

  /** Wire a `@event=handler` on a mounted element: observe the DOM event and run
   *  the handler when it fires, then flush reactive layouts. `@e=name` calls the
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
      this.refreshLayouts();
    };
    this._events[ev.event] ??= {};
    this._events[ev.event]![el.id] = callback;
    // Make the element clickable + ask the renderer to forward the DOM event
    // (mirrors setEventListener's observe).
    this.updateElement(el, { style: { pointer_events: "auto" } });
    this.enqueueUI(
      ObserveElementMessage.type.notification({
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
      // Same containment as `evalBinding`: a handler that throws must not take
      // down the click that ran it (and, through `refreshLayouts`, the rest of
      // the UI).
      try {
        story.EvaluateFunction(name, event !== undefined ? [event] : []);
      } catch (e) {
        this.reportRuntimeError(`Error running handler \`${name}\``, e);
      }
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
   *  (matching constructLayout's `typeof v === "string"` guard); content with a
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
    // Inline rich-text tags (`<b>`, `<color=…>`, … — UI Toolkit's vocabulary)
    // split the content into styled RUNS. Plain text parses to a single
    // unstyled run and renders exactly as before (one span carrying the text),
    // so only tagged content pays for child spans.
    const runs = parseRichText(text);
    const span = this.createElement(
      parent,
      isPlainRun(runs)
        ? {
            type: "span",
            content: { text: runs[0]?.text ?? "" },
            style: { display: "inline" },
          }
        : { type: "span", style: { display: "inline" } },
    );
    if (!isPlainRun(runs)) {
      this.mountRichTextRuns(span, runs);
    }
    if (this.contentHasBinding(content)) {
      scope.texts.push({ element: span, content, last: text, deps });
    }
  }

  /** Render `text` into an already-mounted text span, as either a plain string
   *  or a set of styled run children. Used on mount and on reactive refresh —
   *  a bound value can change the TAG STRUCTURE, not just the characters, so
   *  the previous runs are always torn down first. */
  protected renderRichText(el: Element, text: string): void {
    const runs = parseRichText(text);
    for (const child of [...el.children]) {
      this.destroyElement(child);
    }
    if (isPlainRun(runs)) {
      this.updateElement(el, { content: { text: runs[0]?.text ?? "" } });
      return;
    }
    // Clear any plain text the span was carrying before mounting runs.
    this.updateElement(el, { content: { text: "" } });
    this.mountRichTextRuns(el, runs);
  }

  /** Realize parsed runs as inline child spans. */
  protected mountRichTextRuns(parent: Element, runs: RichTextRun[]): void {
    for (const run of runs) {
      this.createElement(parent, {
        // A semantic run (`<sub>`) mounts as its real element; everything else
        // is a styled span. `display: inline` still applies to both — the
        // universal `display: flex` would otherwise break the run onto its own
        // line — but the semantic tags take their sizing and baseline offset
        // from the normalize sheet, so nothing else is forced here.
        type: run.tag ?? "span",
        content: { text: run.text },
        style: { display: "inline", ...(run.style ?? {}) },
      });
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
   *  empty background constructLayout also produces. (Per-turn re-eval of image
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
      scope: this.makeScope(scope.env, scope.slots),
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
      // Carried so a `slot` inside the loop body still resolves — every
      // iteration builds a fresh scope, and there is no parent link to walk.
      slots: scope.slots,
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
    const entries = this.forEntries(region.node, parentEnv);
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
    region.elseScope = this.makeScope(parentEnv, region.slots);
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
    const scope = this.makeScope(env, region.slots);
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

  /** Mount an authored-component instance (`card("Inventory")`, spec §4.7) into
   *  `parent`. The call's positional args are evaluated in the CALLER's scope and
   *  bound to the component's declared params in a fresh body scope `env`; the
   *  body's `{param}` bindings read them via that env (the runtime feeds each as
   *  the matching evaluator arg — same mechanism as `for`-loop vars). The call's
   *  children (default content + `fill`s) become the body's slot map. Returns a
   *  region (the body is wrapperless — multiple top-level nodes), or undefined if
   *  the tag isn't a component (caller falls back to a plain element). */
  protected mountComponent(
    parent: Element,
    node: ElementNode,
    callerScope: ReactiveScope,
    before: Element | null,
  ): ComponentRegion | undefined {
    const comp = this._game.program?.sparkle?.components?.[node.tag] as
      | ComponentNode
      | undefined;
    if (!comp) {
      return undefined;
    }
    const env: ReactiveEnv = {};
    this.applyComponentParams(comp, node, callerScope.env, env);
    const scope = this.makeScope(env);
    scope.slots = this.buildSlotMap(node, callerScope);
    const region: ComponentRegion = {
      kind: "component",
      parent,
      node,
      comp,
      scope,
      content: [],
      siblings: [],
    };
    callerScope.regions.push(region);
    region.content = this.mountChildren(
      parent,
      comp.children,
      scope,
      before,
      region,
    );
    return region;
  }

  /** Evaluate the call's positional args in the caller env and write them onto
   *  `env` keyed by the component's declared param names (extra args / missing
   *  args are ignored / left undefined). Mutates `env` IN PLACE so a re-eval
   *  keeps the same reference live for already-mounted body bindings/handlers. */
  protected applyComponentParams(
    comp: ComponentNode,
    node: ElementNode,
    callerEnv: ReactiveEnv,
    env: ReactiveEnv,
  ): void {
    const params = comp.params ?? [];
    for (let i = 0; i < params.length; i += 1) {
      const arg = node.params?.[i];
      env[params[i]!] = arg ? this.resolveProp(arg, callerEnv) : undefined;
    }
  }

  /** Build a component's slot map from the call's children: each `fill NAME`
   *  supplies the named slot; all other children supply the default slot (`""`).
   *  Content is paired with the CALLER scope so it renders with caller vars. */
  protected buildSlotMap(node: ElementNode, callerScope: ReactiveScope): SlotMap {
    const map: SlotMap = new Map();
    const defaultChildren: BodyNode[] = [];
    for (const child of node.children) {
      if (child.kind === "fill") {
        map.set(child.name ?? "", {
          children: child.children,
          scope: callerScope,
        });
      } else {
        defaultChildren.push(child);
      }
    }
    if (defaultChildren.length > 0) {
      map.set("", { children: defaultChildren, scope: callerScope });
    }
    return map;
  }

  /** Mount a `slot` placeholder: the caller's matching content (from the body
   *  scope's slot map), rendered in the CALLER's scope at this position. No
   *  caller content → an empty placeholder region. */
  protected mountSlot(
    parent: Element,
    node: SlotNode,
    scope: ReactiveScope,
    before: Element | null,
  ): SlotRegion {
    const region: SlotRegion = {
      kind: "slot",
      parent,
      content: [],
      siblings: [],
    };
    scope.regions.push(region);
    const slot = scope.slots?.get(node.name ?? "");
    if (slot) {
      region.content = this.mountChildren(
        parent,
        slot.children,
        slot.scope,
        before,
        region,
      );
    }
    return region;
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

  /** The ordered `[key, value]` entries a `for` iterates this turn — numeric
   *  (`for i = from, to[, step]`) or generic (`for … in expr`). Both feed the
   *  same keyed reconcile, so numeric `for` gets reuse/move/dep-gating for free. */
  protected forEntries(
    node: ForNode,
    env: ReactiveEnv,
  ): [unknown, unknown][] {
    if (node.numeric) {
      return this.numericEntries(node.numeric, env);
    }
    if (node.each) {
      return this.iterableEntries(this.evalBinding(node.each, env));
    }
    return [];
  }

  /** Expand a numeric range to `[i, i]` entries (key = value = the counter, so a
   *  single-binding `for i` binds `i` and reconciles by the number). `step`
   *  defaults to 1; a zero/non-finite bound yields no iterations. Capped to guard
   *  against an accidental runaway range mounting unbounded DOM. */
  protected numericEntries(
    numeric: NonNullable<ForNode["numeric"]>,
    env: ReactiveEnv,
  ): [unknown, unknown][] {
    const from = Number(this.evalBinding(numeric.from, env));
    const to = Number(this.evalBinding(numeric.to, env));
    const step = numeric.step ? Number(this.evalBinding(numeric.step, env)) : 1;
    const entries: [unknown, unknown][] = [];
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      !Number.isFinite(step) ||
      step === 0
    ) {
      return entries;
    }
    const CAP = 100000;
    if (step > 0) {
      for (let i = from; i <= to && entries.length < CAP; i += step) {
        entries.push([i, i]);
      }
    } else {
      for (let i = from; i >= to && entries.length < CAP; i += step) {
        entries.push([i, i]);
      }
    }
    return entries;
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
    const owner = region.owner;
    if (!owner) {
      return null;
    }
    if (owner.kind === "for") {
      // A `for`'s `siblings` is the group the LOOP lives in, so escalating
      // straight to it jumps over every remaining iteration. Walk the rest of
      // the loop first: `for x in list: text A; if x.visible: text B` toggled
      // on the first row landed `text B` after the whole `for` instead of in
      // its own row. (`firstLiveElement` already walks a for's iterations, but
      // only when probing the loop from OUTSIDE as a sibling — nothing walked
      // the later iterations when escalating from INSIDE one.)
      const idx = owner.iterations.findIndex(
        (it) => it.content === region.siblings,
      );
      if (idx >= 0) {
        for (let i = idx + 1; i < owner.iterations.length; i += 1) {
          const live = this.firstLiveOfGroup(owner.iterations[i]!.content);
          if (live) {
            return live;
          }
        }
        if (owner.elseContent) {
          const live = this.firstLiveOfGroup(owner.elseContent);
          if (live) {
            return live;
          }
        }
      }
    }
    return this.anchorFor(owner);
  }

  /** The leading live DOM element of a group item: a concrete element, or the
   *  first live element of a nested region's current content. `null` if nothing
   *  is live (an empty branch / empty `for`). */
  protected firstLiveElement(item: ReactiveItem): Element | null {
    if ("el" in item) {
      return item.el;
    }
    const region = item.region;
    if (region.kind !== "for") {
      // cond / component / slot: a single content group.
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
      if (region.kind === "for") {
        for (const iter of region.iterations) {
          out.push(...this.collectNodes(iter.content));
        }
        if (region.elseContent) {
          out.push(...this.collectNodes(region.elseContent));
        }
      } else {
        // cond / component / slot: a single content group.
        out.push(...this.collectNodes(region.content));
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
  refreshLayouts(): void {
    if (!this._reactive) {
      return;
    }
    if (this._game.context?.system?.simulating) {
      // Route simulation replays beats on THIS game (a PLAY reuses the Game
      // instance, layouts still mounted) with renderer paints suppressed.
      // Re-evaluating here would advance each entry's equality memo (`last`)
      // through the simulated values while the DOM never moves — wedging the
      // gate so the post-start refresh paints nothing (#365's stale-restart
      // face). Skip entirely; `onStart`'s force-all refresh trues the DOM up
      // once the real run begins.
      return;
    }
    const changes = this._game.story.variablesState.takeReactiveChanges();
    try {
      for (const { scope } of this._mountedLayouts.values()) {
        this.refreshScope(scope, changes);
      }
    } finally {
      this._refreshAll = false;
    }
    // Flush this turn's reactive ops synchronously so callers (and tests) see
    // the `ui/batch` immediately after the refresh, not on a later microtask.
    this.flushUIBatch();
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
        if (this._refreshAll || text !== entry.last) {
          entry.last = text;
          this.renderRichText(entry.element, text);
        }
      }
    }
    for (const entry of scope.attrs) {
      if (envScope || this.depsChanged(entry.deps, changes)) {
        const vs = this._game.story.variablesState;
        vs.beginReactiveRead();
        const resolved = this.resolveProp(entry.propValue, scope.env);
        entry.deps = vs.endReactiveRead();
        const next = this.propToAttr(resolved, entry.boolean);
        if (this._refreshAll || next !== entry.last) {
          entry.last = next;
          this.updateElement(entry.element, {
            attributes: { [entry.prop]: next },
          });
        }
      }
    }
    for (const entry of scope.styles) {
      if (envScope || this.depsChanged(entry.deps, changes)) {
        const vs = this._game.story.variablesState;
        vs.beginReactiveRead();
        const resolved = this.resolveProp(entry.propValue, scope.env);
        entry.deps = vs.endReactiveRead();
        const next = resolved == null ? null : String(resolved);
        if (this._refreshAll || next !== entry.last) {
          entry.last = next;
          this.updateElement(entry.element, {
            style: { [entry.prop]: next },
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
        if (this._refreshAll || pct !== entry.last) {
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
      } else if (region.kind === "component") {
        this.refreshComponentRegion(region, scope.env, changes);
      } else if (region.kind === "slot") {
        // Slot content is registered in the CALLER scope (this scope or an
        // ancestor) and refreshed there — nothing to do for the placeholder.
      } else {
        this.refreshCondRegion(region, changes, envScope);
      }
    }
  }

  /** Re-evaluate a component instance's args in the caller env and update its
   *  body `env` IN PLACE, then refresh the body scope. The body bindings are
   *  env-scoped (their values come from params, not tracked globals), so they
   *  re-evaluate every turn (equality-gated) and pick up the new param values —
   *  giving reactive params (`card(player.title)`) for free. Structure is fixed
   *  (params change values, not shape; any body `if`/`for` are regions inside the
   *  body scope and refresh recursively). */
  protected refreshComponentRegion(
    region: ComponentRegion,
    callerEnv: ReactiveEnv,
    changes: ReactiveDeps,
  ): void {
    this.applyComponentParams(region.comp, region.node, callerEnv, region.scope.env);
    this.refreshScope(region.scope, changes);
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
        region.scope = this.makeScope(region.scope.env, region.scope.slots);
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
    const entries = this.forEntries(region.node, parentEnv);

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
        // Re-sync the OUTER loop vars first. `mountIteration` snapshots the
        // enclosing env with a spread, so each iteration owns a private copy of
        // every outer variable; `bindLoopVars` below only rewrites this loop's
        // OWN bindings. Without this, a reused iteration keeps whatever the
        // outer value was at mount time — so replacing an outer collection
        // (`players = {…}`) leaves inner rows rendering the previous row's data,
        // silently and forever.
        //
        // A prototype chain (`Object.create(parentEnv)`) would be tidier but is
        // WRONG here: `mountEvent` spreads `{ ...scope.env, event }`, and a
        // spread copies own properties only, so every outer var would vanish
        // from event handlers inside the loop.
        for (const key of Object.keys(parentEnv)) {
          reused.scope.env[key] = parentEnv[key];
        }
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

  /** Does any global/table dep intersect the turn's change-set? While a
   *  force-all refresh is pending (see {@link onStart}) every dep counts as
   *  changed, so each binding re-evaluates (and repaints — the paint gates
   *  also honor `_refreshAll`, because a suppressed-paint mount leaves `last`
   *  matching the new value while the DOM shows the old one). */
  protected depsChanged(deps: ReactiveDeps, changes: ReactiveDeps): boolean {
    if (this._refreshAll) {
      return true;
    }
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
    const root_text_size = this.context?.config?.ui?.root_text_size;
    if (breakpoints) {
      this.enqueueUI(
        SetThemeMessage.type.request({
          breakpoints,
          root_text_size,
        }),
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

  // ---------------------------------------------------------------------------
  // Layout lifecycle ([[open LAYOUT]] / [[close LAYOUT]])
  //
  // True spawn/destroy on the reactive render path: `[[open X]]` MOUNTS layout X
  // (constructs its element tree, captures its reactive deps, registers its scope
  // for per-turn refresh) and plays an enter transition; `[[close X]]` plays an
  // exit transition then DESTROYS X's whole element subtree and drops its scope
  // (so refreshLayouts stops touching it — zero binding cost while closed). `main`
  // is auto-opened at connect; openLayout/closeLayout stay independent primitives
  // (multiple layouts can be open) to leave room for a future goto/navigate.
  // ---------------------------------------------------------------------------

  /** Resolve a layout's enter (`open`) or exit (`close`) animation from the
   *  directive clauses, exactly like the image path: a `with` that names a
   *  `transition` uses its `on_show`/`on_hide`; a `with` that names an `animation`
   *  (or a bare directive defaulting to the builtin `show`/`hide`) uses it
   *  directly. Returns the resolved {@link Animation} (with after/over/ease
   *  overrides applied) or undefined when nothing animatable resolves. */
  protected resolveLayoutAnimation(
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

  /** Mount + reveal a layout (`[[open X]]`). No-op if already mounted. With
   *  clauses, plays the resolved enter transition on the layout root; a bare
   *  `[[open X]]` (or `instant`) just mounts + shows. The layout root is revealed
   *  through the normal `reveal()` flow (root opacity). Returns once the enter
   *  transition has settled, so a `wait` directive can block story advance. */
  async openLayout(
    name: string,
    clauses?: { with?: string; after?: number; over?: number; ease?: string },
    instant = false,
  ): Promise<void> {
    if (!this._reactive) {
      // Static path: layouts are all constructed at connect; just toggle hidden.
      this.showLayout(name);
      return;
    }
    if (!name) {
      return;
    }
    if (this._mountedLayouts.has(name)) {
      // Already open — no-op (a future goto/navigate may re-run the transition).
      return;
    }
    const layouts = this._game.program?.sparkle?.layouts;
    const layout = layouts?.[name];
    if (!layout) {
      return;
    }
    // Mount captures the layout's reactive deps; settle the mount's own change
    // residue afterwards so the first per-turn refresh only sees post-mount
    // changes (mirrors constructLayoutsFromAst).
    //
    // But `takeReactiveChanges` is DESTRUCTIVE and this runs mid-beat:
    // `Coordinator` applies layout instructions BEFORE `refreshLayouts`, so
    // consuming the whole set here handed the refresh an empty one. A beat that
    // wrote a store and ran `[[open X]]` left every already-mounted layout
    // stale — permanently, because updates are equality-gated on the last
    // emitted value, so a dropped change is never re-derived. Take the beat's
    // changes aside, discard the mount's residue, hand them back.
    const vs = this._game.story.variablesState;
    const pending = vs.takeReactiveChanges();
    const element = this.constructLayoutFromAst(layout);
    vs.takeReactiveChanges();
    vs.restoreReactiveChanges(pending);
    // The layouts layer's root opacity is revealed on the first beat anyway, but
    // open it here too so a layout opened before any dialogue is visible.
    this.reveal();
    const enter = this.resolveLayoutAnimation("enter", clauses ?? {}, instant);
    if (enter && !instant) {
      await this.animateElements([{ element, animations: [enter] }]);
    }
  }

  /** Play the exit transition then DESTROY a layout (`[[close X]]`): tears down
   *  its whole DOM subtree (one `ui/destroy` on the root removes the children)
   *  and drops its reactive scope so refreshLayouts no longer touches it. No-op
   *  if not mounted. A bare `[[close X]]` (or `instant`) destroys immediately.
   *  Returns once the exit transition has settled, so `wait` can block advance. */
  async closeLayout(
    name: string,
    clauses?: { with?: string; after?: number; over?: number; ease?: string },
    instant = false,
  ): Promise<void> {
    if (!this._reactive) {
      // Static path: layouts are never torn down; just toggle hidden.
      this.hideLayout(name);
      return;
    }
    const entry = name ? this._mountedLayouts.get(name) : undefined;
    if (!entry) {
      return;
    }
    const exit = this.resolveLayoutAnimation("exit", clauses ?? {}, instant);
    if (exit && !instant) {
      await this.animateElements([{ element: entry.element, animations: [exit] }]);
    }
    // Destroy the whole subtree (root destroy drops children) + drop the scope so
    // refreshLayouts stops walking it. Closed = zero DOM + zero binding cost.
    this.destroyElement(entry.element);
    this._mountedLayouts.delete(name);
  }

  /** Navigate within a screen (`[[navigate <screen> to <layout>]]`): play
   *  the exit transition on + destroy every currently-open layout IN THAT
   *  SCREEN except the target, then open the target (its enter transition).
   *  Layouts in other screens (and uncategorized layouts like a persistent
   *  HUD) are left untouched. Composed from the open/close primitives — clauses
   *  drive both the outgoing exit and the incoming enter (so a `with` transition
   *  gives a crossfade). With no `screen`, falls back to replacing the whole
   *  stack (close every open layout except the target). A missing target (an
   *  incomplete `[[navigate <screen>]]`) is a no-op — the LSP warns. */
  async navigateScreen(
    name: string,
    screen?: string,
    clauses?: { with?: string; after?: number; over?: number; ease?: string },
    instant = false,
  ): Promise<void> {
    if (!this._reactive) {
      // Static path: just show the target (layouts are all constructed at connect).
      if (name) {
        this.showLayout(name);
      }
      return;
    }
    if (!name) {
      // Incomplete `[[navigate <screen>]]` — nothing to open. The LSP flags
      // this; the runtime stays a no-op rather than dismissing the screen.
      return;
    }
    // Close the open layouts this navigate replaces: scoped to `screen` when
    // given (leave other screens/uncategorized layouts alone), else the whole
    // stack. The target is always spared (it gets opened, not torn down).
    // `main` is never navigated away from: it auto-mounts at connect and holds
    // the primary subtree (textbox, stage, portrait, choices). Without this,
    // an unscoped navigate — which is what `[[navigate to menu]]` produces,
    // since `to` is consumed as the keyword and leaves `screen` empty — tore
    // the whole session's UI down mid-beat. `saveLayoutState.recordOpen`
    // already treats `main` as special; the asymmetry between the two was the
    // tell that one of them had forgotten the invariant.
    const toClose = [...this._mountedLayouts.entries()]
      .filter(([n, entry]) =>
        n !== name && n !== "main" && (screen ? entry.screen === screen : true),
      )
      .map(([n]) => n);
    await Promise.all([
      ...toClose.map((n) => this.closeLayout(n, clauses, instant)),
      this.openLayout(name, clauses, instant),
    ]);
  }

  /** Fold a layout directive into the serialized open-set (`_state.layout`),
   *  mirroring `Image.saveState`. Runs for EVERY directive regardless of
   *  `_reactive`/connection state — crucially, the route-simulation game that
   *  builds scrub checkpoints (workspace.worker) is never connected, so its
   *  `openLayout` short-circuits on the `!_reactive` guard and would never record
   *  the open-set here. Recording at the fan-out keeps the checkpoint correct so
   *  {@link onRestore} can re-mount the right layouts. `main` auto-mounts at
   *  connect and is never recorded. */
  protected saveLayoutState(e: LayoutInstruction): void {
    const layouts = this._game.program?.sparkle?.layouts;
    const recordOpen = (name: string) => {
      if (!name || name === "main" || !layouts?.[name]) {
        return;
      }
      const screen = layouts[name]?.screen;
      this._state.layout ??= [];
      if (!this._state.layout.some((s) => s.name === name)) {
        this._state.layout.push({
          name,
          ...(screen ? { screen } : {}),
        });
      }
    };
    if (e.control === "close") {
      if (this._state.layout) {
        this._state.layout = this._state.layout.filter((s) => s.name !== e.name);
      }
      return;
    }
    if (e.control === "navigate") {
      // Incomplete `[[navigate <screen>]]` (no destination) is a runtime
      // no-op — leave the set untouched (matches navigateScreen).
      if (!e.name) {
        return;
      }
      // Close the open layouts this navigate replaces: scoped to the screen
      // when given (the target is spared), else the whole stack (legacy).
      if (this._state.layout) {
        this._state.layout = this._state.layout.filter((s) =>
          e.screen ? s.screen !== e.screen || s.name === e.name : s.name === e.name,
        );
      }
      recordOpen(e.name);
      return;
    }
    recordOpen(e.name); // open
  }

  /** Apply a beat's `[[open/close/navigate]]` directives (Coordinator fan-out),
   *  mirroring `image.write`/`audio.schedule`. Awaits all transitions so a beat
   *  with a `wait` directive can hold advance until they settle. */
  async applyLayoutInstructions(
    instructions: LayoutInstruction[],
    instant: boolean,
  ): Promise<void> {
    // Fold the open-set into serialized state FIRST (in directive order), so the
    // checkpoint reflects the net result even when the (unconnected) simulation
    // game can't run the reactive mount primitives below.
    for (const e of instructions) {
      this.saveLayoutState(e);
    }
    const run = (e: LayoutInstruction): Promise<void> => {
      const clauses = {
        with: e.with,
        after: e.after,
        over: e.over,
        ease: e.ease,
      };
      if (e.control === "close") {
        return this.closeLayout(e.name, clauses, instant);
      }
      if (e.control === "navigate") {
        return this.navigateScreen(e.name, e.screen, clauses, instant);
      }
      return this.openLayout(e.name, clauses, instant);
    };
    // Directives for the SAME layout run in authored order; different layouts
    // still run concurrently. `[[close X]] [[open X]]` in one beat used to
    // race: `openLayout` tests `_mountedLayouts.has(name)` synchronously, so it
    // no-opped while the close's exit animation was still awaiting, and the
    // close then removed X. The DOM ended without X while the serialized state
    // — folded sequentially above — recorded it open. It self-healed on
    // restore, which is exactly what made the live beat's miss easy to miss.
    // A `navigate` is additionally a BARRIER across names: it replaces the
    // screen STACK, computing what to tear down from a live read of the whole
    // `_mountedLayouts` set — so racing it against a concurrently-running
    // `open`/`close` for a DIFFERENT layout made the outcome depend on how far
    // that group's await chain had progressed (the same defect class the
    // per-name grouping fixed, one level up). Everything before a navigate
    // settles first, the navigate runs alone, then the remainder proceeds.
    const segments: LayoutInstruction[][] = [[]];
    for (const e of instructions) {
      if (e.control === "navigate") {
        segments.push([e], []);
      } else {
        segments[segments.length - 1]!.push(e);
      }
    }
    for (const segment of segments) {
      if (segment.length === 0) {
        continue;
      }
      if (segment.length === 1 && segment[0]!.control === "navigate") {
        await run(segment[0]!);
        continue;
      }
      const byLayout = new Map<string, LayoutInstruction[]>();
      for (const e of segment) {
        const key = e.name ?? "";
        const group = byLayout.get(key);
        if (group) {
          group.push(e);
        } else {
          byLayout.set(key, [e]);
        }
      }
      await Promise.all(
        [...byLayout.values()].map(async (group) => {
          for (const e of group) {
            await run(e);
          }
        }),
      );
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
        this.enqueueUI(
          ObserveElementMessage.type.notification({
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
        this.enqueueUI(
          UnobserveElementMessage.type.notification({
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
        // Flush pending create/update ops first so the target exists before the
        // (awaited) write arrives.
        $.flushUIBatch();
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
        // auto-advance still waits on the reveal). Flush pending create/update
        // ops first so the target exists before the (awaited) write arrives.
        $.flushUIBatch();
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
