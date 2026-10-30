import type { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ErrorType } from "../../../core/enums/ErrorType";
import { resolveImageLayers } from "@impower/sparkdown/src/compiler/utils/resolveImageLayers";
import { resolveImageReference } from "@impower/sparkdown/src/compiler/utils/resolveImageReference";
import { sortFilteredName } from "@impower/sparkdown/src/compiler/utils/sortFilteredName";
import { morphRefsForStruct } from "@impower/sparkdown/src/morph/channel";
import { cssList } from "@impower/sparkdown/src/morph/cssList";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import {
  MorphArtifactMessage,
  type MorphArtifactParams,
} from "./messages/MorphArtifactMessage";
import { MorphNeedMessage } from "./messages/MorphNeedMessage";
import { hashText } from "@impower/sparkdown/src/morph/hash";
import type { MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import { default_morph } from "../constructors/default_morph";
import { ambientReads } from "@impower/sparkdown/src/runtime/AmbientReads";
import {
  BOOLEAN_ATTRIBUTES,
  DISPLAY_TARGET_ATTRIBUTE,
  DISPLAY_TARGETS,
  HANDLER_ATTRIBUTE,
  isAttributeProp,
  isReservedAttribute,
  toDataAttributeName,
  WIDGET_CONTROL_ATTRIBUTE,
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
} from "@impower/sparkdown/src/runtime/Value";
import type { Game } from "../../../core/classes/Game";
import type { Instructions } from "../../../core/types/Instructions";
import { EventMessage } from "../../../core/classes/messages/EventMessage";
import { SUPERSEDED } from "../../../core/classes/Connection";
import { Module } from "../../../core/classes/Module";
import type { Event } from "../../../core/types/Event";
import type { EventMap } from "../../../core/types/EventMap";
import type {
CutsceneInstruction,
ImageInstruction,
LayoutInstruction,
TextInstruction,
} from "../../../core/types/Instruction";
import { getAllProperties } from "../../../core/utils/getAllProperties";
import { getTimeValue } from "../../../core/utils/getTimeValue";
import type { Animation } from "../types/Animation";
import type { Ease } from "../types/Ease";
import type { ElementContent } from "../types/ElementContent";
import type { ElementState } from "../types/ElementState";
import type { Image } from "../types/Image";
import type { ImageState } from "../types/ImageState";
import type { TextState } from "../types/TextState";
import { type UIBuiltins, uiBuiltinDefinitions } from "../uiBuiltinDefinitions";
import { getVarName } from "../utils/getVarName";
import {
  isPlainRun,
  parseRichText,
  type RichTextRun,
} from "../utils/parseRichText";
import { Element } from "./helpers/Element";
import {
  AnimateElementsMessage,
  type AnimateElementsMessageMap,
} from "./messages/AnimateElementsMessage";
import {
  BatchElementsMessage,
  type BatchElementsMessageMap,
} from "./messages/BatchElementsMessage";
import {
  BeatMessage,
  type BeatMessageMap,
} from "./messages/BeatMessage";
import {
  BeginReconcileMessage,
  type BeginReconcileMessageMap,
} from "./messages/BeginReconcileMessage";
import {
  CreateElementMessage,
  type CreateElementMessageMap,
} from "./messages/CreateElementMessage";
import {
  DestroyElementMessage,
  type DestroyElementMessageMap,
} from "./messages/DestroyElementMessage";
import {
  MoveElementMessage,
  type MoveElementMessageMap,
} from "./messages/MoveElementMessage";
import {
  ObserveElementMessage,
  type ObserveElementMessageMap,
} from "./messages/ObserveElementMessage";
import {
  PlayCutsceneMessage,
  type PlayCutsceneMessageMap,
  type PlayCutsceneParams,
} from "./messages/PlayCutsceneMessage";
import {
  SetThemeMessage,
  type SetThemeMessageMap,
} from "./messages/SetThemeMessage";
import {
  SkipCutsceneMessage,
  type SkipCutsceneMessageMap,
} from "./messages/SkipCutsceneMessage";
import {
  SweepReconcileMessage,
  type SweepReconcileMessageMap,
} from "./messages/SweepReconcileMessage";
import {
  UnobserveElementMessage,
  type UnobserveElementMessageMap,
} from "./messages/UnobserveElementMessage";
import {
  UpdateElementMessage,
  type UpdateElementMessageMap,
} from "./messages/UpdateElementMessage";
import {
  type MorphImageContent,
  type MorphLayerPlay,
  type WriteImageInstruction,
  WriteImageMessage,
  type WriteImageMessageMap,
} from "./messages/WriteImageMessage";
import {
  WriteTextMessage,
  type WriteTextMessageMap,
} from "./messages/WriteTextMessage";

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) {
    return false;
  }
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => sameValue(v, b[i]))
    );
  }
  if (Array.isArray(b)) {
    return false;
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  return (
    keys.length === Object.keys(y).length &&
    keys.every((k) => k in y && sameValue(x[k], y[k]))
  );
}

interface Retirement {
  element: Element;
  epoch: number;
  pin?: string;
}

interface Composition {
  kind: "display" | "beat";
  messages: IMessage[];
  realizing: { done: boolean }[];
  afterSent: (() => void)[];
  expected: (string | number)[];
  ending?: boolean;
  time?: number;
  sweep?: boolean;
  standing?: StandingScreen;
  empty?: { text: Set<Element>; image: Set<Element> };
}

interface UITree {
  build: number;
  program: Game["program"];
  declarations: number;
  calls: boolean;
  pure: boolean;
  pictures: Map<string, string>;
}

export interface StandingScreen {
  build: number;
  program: Game["program"];
  contentOnly: boolean;
  pictures: string[];
  holding: { text: string[]; image: string[] };
}

export interface UIState {
  text?: Record<string, TextState[]>;
  image?: Record<string, ImageState[]>;
  style?: Record<string, Record<string, string | null>>;
  attributes?: Record<string, Record<string, string | null>>;
  layout?: { name: string; screen?: string }[];
}

type ReactiveEnv = Record<string, unknown>;

type ReactiveDeps = { globals: Set<string>; tables: Set<object> };

interface ReactiveText {
  element: Element;
  content: ContentPart[];
  last: string;
  deps: ReactiveDeps;
}

interface ReactiveAttr {
  element: Element;
  prop: string;
  propValue: PropValue;
  boolean: boolean;
  last: string | null;
  deps: ReactiveDeps;
}

interface ReactiveSliderFill {
  element: Element;
  value: PropValue;
  min: PropValue;
  max: PropValue;
  last: string;
  deps: ReactiveDeps;
}

interface ReactiveStyle {
  element: Element;
  prop: string;
  propValue: PropValue;
  last: string | null;
  deps: ReactiveDeps;
}

type ReactiveItem = { el: Element } | { region: ReactiveRegion };
type ReactiveGroup = ReactiveItem[];

interface CondRegion {
  kind: "cond";
  parent: Element;
  node: IfNode | MatchNode;
  active: number;
  scope: ReactiveScope;
  deps: ReactiveDeps;
  siblings: ReactiveGroup;
  content: ReactiveGroup;
  owner?: ReactiveRegion;
}

interface ForIteration {
  key: unknown;
  scope: ReactiveScope;
  content: ReactiveGroup;
}

interface ForRegion {
  kind: "for";
  parent: Element;
  node: ForNode;
  iterations: ForIteration[];
  siblings: ReactiveGroup;
  elseScope?: ReactiveScope;
  elseContent?: ReactiveGroup;
  slots?: SlotMap;
  owner?: ReactiveRegion;
}

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

interface SlotRegion {
  kind: "slot";
  parent: Element;
  content: ReactiveGroup;
  siblings: ReactiveGroup;
  owner?: ReactiveRegion;
}

type ReactiveRegion = CondRegion | ForRegion | ComponentRegion | SlotRegion;

type SlotMap = Map<string, { children: BodyNode[]; scope: ReactiveScope }>;

interface ReactiveScope {
  env: ReactiveEnv;
  texts: ReactiveText[];
  regions: ReactiveRegion[];
  attrs: ReactiveAttr[];
  styles: ReactiveStyle[];
  sliderFills: ReactiveSliderFill[];
  slots?: SlotMap;
}

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

const ELEMENT_TAGS: Record<string, string> = {
  link: "a",
  button: "button",
  label: "label",
  span: "span",
  divider: "hr",
  list: "ul",
  ordered_list: "ol",
  item: "li",
  table: "table",
  table_header: "thead",
  table_body: "tbody",
  table_footer: "tfoot",
  table_row: "tr",
  head: "th",
  cell: "td",
  strong: "strong",
  emphasis: "em",
  quote: "blockquote",
  citation: "cite",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  code: "code",
  kbd: "kbd",
  preformatted: "pre",
  paragraph: "p",
  small: "small",
  sub: "sub",
  sup: "sup",
  figure: "figure",
  caption: "figcaption",
  picture: "img",
  article: "article",
  section: "section",
  header: "header",
  footer: "footer",
  form: "form",
  fieldset: "fieldset",
  legend: "legend",
  foldout: "details",
  modal: "dialog",
  progress: "progress",
};

const IMPLICIT_LABEL_TAGS: Record<string, { type: string; name: string }> = {
  foldout: { type: "summary", name: "foldout_label" },
};


const CUTSCENE_MUSIC_FADE = 0.5;

export type UIMessageMap = AnimateElementsMessageMap &
  BatchElementsMessageMap &
  BeatMessageMap &
  BeginReconcileMessageMap &
  CreateElementMessageMap &
  DestroyElementMessageMap &
  MoveElementMessageMap &
  ObserveElementMessageMap &
  PlayCutsceneMessageMap &
  SetThemeMessageMap &
  SkipCutsceneMessageMap &
  SweepReconcileMessageMap &
  UnobserveElementMessageMap &
  UpdateElementMessageMap &
  WriteImageMessageMap &
  WriteTextMessageMap;

export class UIModule extends Module<UIState, UIMessageMap, UIBuiltins> {
  protected _root?: Element;

  protected _uiBatch: IMessage[] = [];
  protected _uiBatchScheduled = false;

  protected _compose?: Composition;

  protected _mountOwners = new Map<Promise<void>, Composition>();

  protected _pendingOpens = new Map<string, Set<{ cancelled: boolean }>>();

  protected _retiring = new Set<Retirement>();

  protected _realizationChange?: { promise: Promise<void>; resolve: () => void };

  protected _events: Partial<
    Record<string, Record<string, (event: Event) => void>>
  > = {};

  protected _clearOnContinue: Set<string> = new Set();

  protected _reactive = false;

  protected _refreshAll = false;

  protected _screenEdits = 0;

  protected _displayTargetsChanged = false;

  protected _displayTargetMarks = new WeakMap<Element, string | null>();

  protected _refreshing = false;

  protected _tree?: UITree;

  protected _treeBuilds = 0;

  protected _building?: UITree & { writes: boolean };

  protected _restoredEdits?: number;

  protected _standing?: StandingScreen;

  protected _clearedPictures?: Record<string, ImageState[]>;

  protected _uiOps = 0;

  protected _standingOps?: number;

  constructor(game: Game) {
    super(game);
    this.initLayouts();
  }

  override onStart(): void {
    this._refreshAll = true;
  }

  protected evalBinding(binding: Binding, env?: ReactiveEnv): unknown {
    const exprId = binding?.exprId;
    if (!exprId) {
      return undefined;
    }
    const story = this._game.story;
    if (!story.HasFunction(exprId)) {
      return undefined;
    }
    const args = (binding.params ?? []).map((name) => env?.[name]);
    const reported = this._game.runtimeErrorsReported;
    try {
      return story.EvaluateFunction(exprId, args);
    } catch (e) {
      if (this._building) {
        this._building.writes = true;
      }
      this.reportRuntimeError(
        `Error evaluating \`${binding.source ?? exprId}\``,
        e,
        reported,
      );
      return undefined;
    }
  }

  protected reportRuntimeError(
    what: string,
    e: unknown,
    reportedBefore?: number,
  ): void {
    if (
      reportedBefore !== undefined &&
      this._game.runtimeErrorsReported !== reportedBefore
    ) {
      return;
    }
    const detail = e instanceof Error ? e.message : String(e);
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
    this._morphEpoch += 1;
    this._clearedPictures = undefined;
  }

  override async onLoad() {
    this._morphEpoch += 1;
    this._clearedPictures = undefined;
  }

  override onPreview() {
    this._clearedPictures = undefined;
  }

  protected keptTargets(
    beat: Pick<Instructions, "image" | "extended">,
  ): string[] {
    const cleared = this._clearedPictures;
    if (!cleared) {
      return [];
    }
    const image = beat.image ?? {};
    return Object.keys(cleared).filter(
      (target) =>
        (beat.extended || image[target]) &&
        !image[target]?.some(
          (event) => event.control === "show" && event.assets?.length,
        ),
    );
  }

  clearedPictureNames(
    beat: Pick<Instructions, "image" | "extended">,
  ): string[] {
    const names: string[] = [];
    const cleared = this._clearedPictures;
    if (cleared) {
      for (const target of this.keptTargets(beat)) {
        for (const event of cleared[target] ?? []) {
          if (event.control !== "hide" && event.assets?.length) {
            names.push(...event.assets);
          }
        }
      }
    }
    return names;
  }

  protected clearTransientPictures(targets: string[]): Promise<void> {
    const cleared: Record<string, ImageState[]> = {};
    for (const target of targets) {
      const state = this._state.image?.[target];
      if (state?.length) {
        cleared[target] = state;
      }
    }
    this._clearedPictures = cleared;
    return this.image.clearAll(targets);
  }

  override onRestart() {
    this._morphEpoch += 1;
  }

  forgetDisplayedImages() {
    delete this._state.image;
  }

  sweepReconcile() {
    const standing = this.standingScreen();
    if (this._compose) {
      this._compose.standing = standing;
      void this.endCompose({ sweep: true });
      return;
    }
    this.flushUIBatch();
    this.emit(SweepReconcileMessage.type.notification({}));
    this._standing = standing;
    this._standingOps = this._uiOps;
  }

  protected standingScreen(): StandingScreen | undefined {
    const tree = this._tree;
    if (!tree || this._restoredEdits === undefined) {
      return undefined;
    }
    const waiting = [...this._pendingOpens.values()].some((s) => s.size > 0);
    return {
      holding: {
        text: Object.keys(this._state.text ?? {}),
        image: Object.keys(this._state.image ?? {}),
      },
      build: tree.build,
      program: this._game.program,
      contentOnly:
        this._screenEdits === this._restoredEdits &&
        this._retiring.size === 0 &&
        !waiting &&
        this._mountOwners.size === 0,
      pictures: this.restoredPictureNames(),
    };
  }

  get standing(): StandingScreen | undefined {
    return this._standing;
  }

  restoredPictureNames(): string[] {
    const names: string[] = [];
    const imageState = this._state.image;
    if (imageState) {
      const cleared = new Set(this.getTransientTargets());
      for (const [target, events] of Object.entries(imageState)) {
        if (cleared.has(target)) {
          continue;
        }
        for (const event of events ?? []) {
          if (event.control === "show" && event.assets?.length) {
            names.push(...event.assets);
          }
        }
      }
    }
    return names;
  }

  beatOnlyRefusal(): string | null {
    const standing = this._standing;
    const tree = this._tree;
    if (!standing || !tree || standing.build !== tree.build) {
      return "unshown";
    }
    if (!standing.contentOnly || this._uiOps !== this._standingOps) {
      return "screen";
    }
    if (tree.calls) {
      return "calls";
    }
    if (!tree.pure) {
      return "bindings";
    }
    const before = tree.program;
    const after = this._game.program;
    if (tree.declarations !== this._game.declarationsRun) {
      return "declarations";
    }
    const base = (program: Game["program"]) => {
      const revision = program?.contextRevision;
      return revision ? revision.slice(0, revision.lastIndexOf(":")) : undefined;
    };
    if (before !== after && (base(before) === undefined || base(before) !== base(after))) {
      return "context";
    }
    const sameTrees = (
      a: Record<string, unknown> | undefined,
      b: Record<string, unknown> | undefined,
    ) => {
      if (a === b) {
        return true;
      }
      const keys = Object.keys(a ?? {});
      return (
        keys.length === Object.keys(b ?? {}).length &&
        keys.every((k) => sameValue(a?.[k], b?.[k]))
      );
    };
    if (
      !sameTrees(before.sparkle?.layouts, after.sparkle?.layouts) ||
      !sameTrees(before.sparkle?.screens, after.sparkle?.screens) ||
      !sameTrees(before.sparkle?.components, after.sparkle?.components) ||
      before.styles !== after.styles ||
      before.layouts !== after.layouts ||
      before.components !== after.components ||
      before.screens !== after.screens
    ) {
      return "layouts";
    }
    for (const [name, resolved] of tree.pictures) {
      if (JSON.stringify(this.getImageSrcsByName(name)) !== resolved) {
        return "layouts";
      }
    }
    return null;
  }

  async onRedisplay() {
    const standing = this._standing;
    this.discardCompose();
    this._standing = undefined;
    this._building = undefined;
    this._restoredEdits = undefined;
    const previewing = this.context?.system?.previewing;
    if (previewing != null && previewing !== false) {
      this.beginCompose("display");
    }
    const transient = this.getTransientTargets();
    const holding = standing?.holding ?? { text: transient, image: transient };
    const c = this._compose;
    if (c && standing) {
      const elementsOf = (targets: string[]) =>
        targets.flatMap((target) => this.findElements(target, true));
      const held = new Set([
        ...elementsOf(holding.text),
        ...elementsOf(holding.image),
      ]);
      const emptyOf = (holds: string[]) =>
        new Set(
          elementsOf(transient.filter((t) => !holds.includes(t))).filter(
            (el) => !held.has(el),
          ),
        );
      c.empty = { text: emptyOf(holding.text), image: emptyOf(holding.image) };
    }
    this.flushUIBatch();
    this.emit(BeginReconcileMessage.type.notification({ content: true }));
    this._game.story.variablesState.takeReactiveChanges();
    await Promise.all([
      this.text.clearAll(transient.filter((t) => holding.text.includes(t))),
      this.clearTransientPictures(
        transient.filter((t) => holding.image.includes(t)),
      ),
    ]);
  }

  protected knownEmpty(kind: "text" | "image", elements: Element[]): boolean {
    const empty = this._compose?.empty?.[kind];
    return (
      empty !== undefined &&
      elements.length > 0 &&
      elements.every((el) => empty.has(el))
    );
  }

  protected noteContent(
    kind: "text" | "image",
    elements: Element[],
    empty: boolean,
  ): void {
    const set = this._compose?.empty?.[kind];
    if (set) {
      for (const el of elements) {
        if (empty) {
          set.add(el);
        } else {
          set.delete(el);
        }
      }
    }
  }

  markRestored() {
    const building = this._building;
    if (building) {
      this._building = undefined;
      this._tree = {
        build: building.build,
        program: building.program,
        declarations: building.declarations,
        calls: building.calls,
        pure: !building.writes,
        pictures: building.pictures,
      };
    }
    this._restoredEdits = this._screenEdits;
  }

  protected _buildWatch?: { unmarked: string; ambient: number; calls: number };

  protected watchBuild() {
    const vs = this._game.story.variablesState;
    vs.takeReactiveChanges();
    vs.TakeWrites();
    vs.trackWrites = true;
    this._buildWatch = {
      unmarked: this.unmarkedState(),
      ambient: ambientReads.count,
      calls: this._game.story.callsMade,
    };
  }

  protected unmarkedState(): string {
    const story = this._game.story;
    const state = story.state;
    return [
      state.storySeed,
      state.previousRandom,
      state.visitsMade,
      story.currentErrors?.length ?? 0,
      story.currentWarnings?.length ?? 0,
      this._game.runtimeErrorsReported,
    ].join(":");
  }

  protected noteBuildWrites(changes: {
    globals: Set<string>;
    tables: Set<object>;
  }) {
    const building = this._building;
    const watch = this._buildWatch;
    this._buildWatch = undefined;
    if (!building) {
      return;
    }
    const vs = this._game.story.variablesState;
    const writes = vs.TakeWrites();
    if (!watch || this._game.story.callsMade !== watch.calls) {
      building.calls = true;
    }
    if (
      !watch ||
      changes.globals.size > 0 ||
      changes.tables.size > 0 ||
      writes.tables.size > 0 ||
      writes.cells.size > 0 ||
      this.unmarkedState() !== watch.unmarked ||
      ambientReads.count !== watch.ambient
    ) {
      building.writes = true;
    }
  }

  override async onConnected() {
    this._morphSent.clear();
    this._morphWritten.clear();
    this._morphBaking = new Set();
    this.discardCompose();
    this._standing = undefined;
    this._restoredEdits = undefined;
    this._tree = undefined;
    this._building = {
      build: ++this._treeBuilds,
      program: this._game.program,
      declarations: this._game.declarationsRun,
      calls: false,
      pure: true,
      pictures: new Map(),
      writes: false,
    };
    const previewing = this.context?.system?.previewing;
    if (previewing != null && previewing !== false) {
      this.beginCompose("display");
    }
    this.flushUIBatch();
    this.emit(BeginReconcileMessage.type.notification({}));
    for (const r of [...this._retiring]) {
      this._retiring.delete(r);
      this.destroyElement(r.element);
      if (r.pin) {
        this._game.module.assets?.releaseRetiredLayout(r.pin);
      }
    }
    const epoch = this._game.connection.epoch;
    this._root = undefined;
    this._root = this.getOrCreateRootElement();
    this._events = {};
    this._reactive = true;
    this.constructStyles();
    if (this._game.program?.sparkle?.layouts) {
      const fonts = this._game.module.assets?.prepareLayout("main");
      if (fonts) {
        await fonts;
        if (this.superseded(epoch)) {
          return;
        }
      }
      this.constructLayoutsFromAst();
    } else {
      void this._game.module.assets?.prepareLayout("main");
      this.constructLayouts();
    }
    this.loadTheme();
    const transientTargets = this.getTransientTargets();
    await Promise.all([
      this.text.clearAll(transientTargets),
      this.clearTransientPictures(transientTargets),
    ]);
  }

  override async onRestore() {
    const epoch = this._game.connection.epoch;
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
    if (this._state.layout) {
      let remounted = false;
      for (const { name } of this._state.layout) {
        if (
          name &&
          !UIModule.MANAGED_LAYOUTS.has(name) &&
          !this._mountedLayouts.has(name)
        ) {
          const layout = this._game.program?.sparkle?.layouts?.[name];
          if (layout) {
            const fonts = this._game.module.assets?.prepareLayout(name);
            if (fonts) {
              await fonts;
              if (this.superseded(epoch)) {
                return;
              }
            }
            const vs = this._game.story.variablesState;
            if (this._building) {
              this.watchBuild();
            }
            this.constructLayoutFromAst(layout);
            if (this._building) {
              this.noteBuildWrites(vs.takeReactiveChanges());
              vs.trackWrites = false;
            }
            remounted = true;
          }
        }
      }
      if (remounted) {
        this._game.story.variablesState.takeReactiveChanges();
        this.reveal();
      }
    }
    await Promise.all(tasks);
  }

  protected sanitizeIdPart(s: string): string {
    return s.trim().replace(/[^A-Za-z0-9]+/g, "_") || "el";
  }

  protected generateId(parent: Element | null, name: string, type: string): string {
    if (!parent) {
      return "e";
    }
    const base = this.sanitizeIdPart(name || type);
    const index = parent.nextChildIndex(base);
    return `${parent.id}-${base}-${index}`;
  }

  protected enqueueUI(msg: IMessage): void {
    if (this._game.replaying) {
      return;
    }
    this._uiBatch.push(msg);
    if (!this._uiBatchScheduled) {
      this._uiBatchScheduled = true;
      queueMicrotask(() => this.flushUIBatch());
    }
  }

  protected flushUIBatch(): void {
    this._uiBatchScheduled = false;
    this.markDisplayTargets();
    if (this._uiBatch.length === 0) {
      return;
    }
    const messages = this._uiBatch;
    this._uiBatch = [];
    this.emit(BatchElementsMessage.type.notification({ messages }));
  }

  protected displayTargetElements(root: Element, target: string): Element[] {
    if (target !== "choice") {
      return this.findElements(target, true);
    }
    const indexes = new Set<string>();
    for (const element of this.searchForAll(root, target)) {
      for (const c of element.name.split(" ")) {
        if (/^\d+$/.test(c)) {
          indexes.add(c);
        }
      }
    }
    return [...indexes].flatMap((i) =>
      this.findElements(`${target} ${i}`, true),
    );
  }

  protected carriesDisplayTarget(element: Element): boolean {
    return element.name.split(" ").some((c) => DISPLAY_TARGETS.includes(c));
  }

  protected markDisplayTargets(): void {
    if (!this._displayTargetsChanged || this._game.replaying) {
      return;
    }
    this._displayTargetsChanged = false;
    const root = this._root;
    if (!root) {
      return;
    }
    const reached = new Map<Element, string[]>();
    for (const target of DISPLAY_TARGETS) {
      for (const element of this.displayTargetElements(root, target)) {
        const targets = reached.get(element);
        if (targets) {
          if (!targets.includes(target)) {
            targets.push(target);
          }
        } else {
          reached.set(element, [target]);
        }
      }
    }
    const visit = (element: Element) => {
      if (this.carriesDisplayTarget(element)) {
        const mark = reached.get(element)?.join(" ") ?? null;
        if (this._displayTargetMarks.get(element) !== mark) {
          this._displayTargetMarks.set(element, mark);
          this._uiBatch.push(
            UpdateElementMessage.type.request({
              element: element.id,
              attributes: { [DISPLAY_TARGET_ATTRIBUTE]: mark },
            }),
          );
        }
      }
      for (const child of element.children) {
        visit(child);
      }
    };
    visit(root);
  }

  beginCompose(kind: "display" | "beat" = "beat"): boolean {
    if (
      !this.context?.system?.composeBeats ||
      this._game.replaying ||
      this.context?.system?.simulating
    ) {
      return false;
    }
    const open = this._compose;
    if (open && (open.kind === "display" || !open.ending)) {
      return false;
    }
    this.flushUIBatch();
    const next: Composition = {
      kind,
      messages: [],
      realizing: [],
      afterSent: [],
      expected: [],
    };
    if (open) {
      next.realizing.push(...open.realizing.filter((e) => !e.done));
      for (const [mount, owner] of this._mountOwners) {
        if (owner === open) {
          this._mountOwners.set(mount, next);
        }
      }
      this.sendCompose(open);
    }
    this._compose = next;
    return true;
  }

  composeWait(work: Promise<unknown>): void {
    const settled = work.then(
      () => undefined,
      (e) => this.reportRuntimeError("Could not change the screen for this beat", e),
    );
    const c = this._compose;
    if (!c) {
      return;
    }
    const entry = { done: false };
    c.realizing.push(entry);
    void settled.finally(() => {
      entry.done = true;
      this.notifyRealization();
    });
  }

  afterCompose(work: () => void): void {
    const c = this._compose;
    if (c) {
      c.afterSent.push(work);
    } else {
      work();
    }
  }

  async endCompose(options: { time?: number; sweep?: boolean } = {}) {
    const c = this._compose;
    if (!c || c.ending) {
      return;
    }
    c.ending = true;
    c.time = options.time;
    c.sweep = options.sweep;
    await this.realized(c);
    if (this._compose !== c) {
      return;
    }
    this.sendCompose(c);
  }

  protected sendCompose(c: Composition) {
    if (this._compose === c) {
      this.flushUIBatch();
      this._compose = undefined;
    }
    void super.emit(
      BeatMessage.type.notification({
        messages: c.messages,
        ...(c.time != null ? { time: c.time } : {}),
        ...(c.sweep ? { sweep: true } : {}),
      }),
    );
    if (c.standing) {
      this._standing = c.standing;
      this._standingOps = this._uiOps;
    }
    this.runAfterSent(c);
  }

  protected discardCompose() {
    const c = this._compose;
    if (c) {
      this._compose = undefined;
      this._uiBatch = [];
      for (const id of c.expected.splice(0)) {
        this._game.connection.cancel(id, {
          code: SUPERSEDED,
          message: "the beat that carried it was dropped",
        });
      }
      for (const [mount, owner] of this._mountOwners) {
        if (owner === c) {
          this._mountOwners.delete(mount);
        }
      }
      this.runAfterSent(c);
    }
  }

  protected runAfterSent(c: Composition) {
    const work = c.afterSent.splice(0);
    for (const w of work) {
      w();
    }
  }

  protected mountsWaiting(c: Composition): boolean {
    for (const owner of this._mountOwners.values()) {
      if (owner === c) {
        return true;
      }
    }
    return false;
  }

  protected async realized(c: Composition): Promise<void> {
    for (;;) {
      if (this._compose !== c) {
        return;
      }
      if (!c.realizing.some((e) => !e.done) && !this.mountsWaiting(c)) {
        await Promise.resolve();
        if (!c.realizing.some((e) => !e.done) && !this.mountsWaiting(c)) {
          return;
        }
        continue;
      }
      await this.realizationChanged();
    }
  }

  protected realizationChanged(): Promise<void> {
    if (!this._realizationChange) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      this._realizationChange = { promise, resolve };
    }
    return this._realizationChange.promise;
  }

  protected notifyRealization() {
    const change = this._realizationChange;
    this._realizationChange = undefined;
    change?.resolve();
  }

  override async emit<M extends string, P, R>(
    msg: RequestMessage<M, P, R> | NotificationMessage<M, P>,
    transfer?: ArrayBuffer[],
  ): Promise<R> {
    this._uiOps += 1;
    const c = this._compose;
    if (c) {
      const captured = this.capture(c, msg);
      if (captured) {
        return (await captured.result) as R;
      }
    }
    return super.emit(msg, transfer);
  }

  override async emitSettled<M extends string, P, R>(
    msg: RequestMessage<M, P, R>,
    transfer?: ArrayBuffer[],
  ): Promise<R | undefined> {
    this._uiOps += 1;
    const c = this._compose;
    if (c) {
      const captured = this.capture(c, msg);
      if (captured) {
        return this.settled(msg.method, Promise.resolve(captured.result as R));
      }
    }
    return super.emitSettled(msg, transfer);
  }

  protected capture(
    c: Composition,
    msg: IMessage,
  ): { result: unknown } | undefined {
    const params = (msg as { params?: any }).params;
    if (
      BatchElementsMessage.type.isNotification(msg as any) ||
      BeginReconcileMessage.type.isNotification(msg as any) ||
      ObserveElementMessage.type.isNotification(msg as any) ||
      UnobserveElementMessage.type.isNotification(msg as any)
    ) {
      c.messages.push(structuredClone(msg));
      return { result: undefined };
    }
    if (
      WriteTextMessage.type.isRequest(msg as any) ||
      WriteImageMessage.type.isRequest(msg as any)
    ) {
      c.messages.push(structuredClone(msg));
      return { result: params.target };
    }
    if (AnimateElementsMessage.type.isRequest(msg as any)) {
      c.messages.push(structuredClone(msg));
      c.expected.push((msg as RequestMessage).id);
      return {
        result: this._game.connection.expect(msg as RequestMessage),
      };
    }
    return undefined;
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
    this._screenEdits += 1;
    if (this.carriesDisplayTarget(el)) {
      this._displayTargetsChanged = true;
    }
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

  protected destroyElement(element: Element, retired = false) {
    this._screenEdits += 1;
    const isRootElement = !element.parent;
    if (isRootElement) {
      this._root = undefined;
    }
    const subtree: string[] = [];
    const collect = (el: Element) => {
      subtree.push(el.id);
      if (this.carriesDisplayTarget(el)) {
        this._displayTargetsChanged = true;
      }
      for (const child of el.children) {
        collect(child);
      }
    };
    collect(element);
    for (const [event, byId] of Object.entries(this._events)) {
      if (!byId) {
        continue;
      }
      for (const id of subtree) {
        if (id in byId) {
          delete byId[id];
          this.enqueueUI(
            UnobserveElementMessage.type.notification({
              element: id,
              event,
              ...(retired ? { retired } : {}),
            }),
          );
        }
      }
    }
    element.remove();
    this.enqueueUI(
      DestroyElementMessage.type.request({
        element: element.id,
        ...(retired ? { retired } : {}),
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

  protected moveElement(element: Element, before: Element | null): void {
    const parent = element.parent;
    if (!parent) {
      return;
    }
    const siblings = parent.children;
    const idx = siblings.indexOf(element);
    const beforeIdx = before ? siblings.indexOf(before) : siblings.length;
    if (idx >= 0 && idx + 1 === beforeIdx) {
      return;
    }
    parent.moveChildBefore(element, before);
    this._screenEdits += 1;
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
    if (this._refreshing) {
      this._screenEdits += 1;
    }
    const empty = this._compose?.empty;
    if (empty) {
      empty.text.delete(element);
      empty.image.delete(element);
    }
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
    if (effects.length === 0 || this._game.replaying) {
      return [];
    }
    this._screenEdits += 1;
    this.flushUIBatch();
    return this.emitSettled(
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

  getImageAssets(type: string, name: string): Image[] {
    const imageName = sortFilteredName(name);
    const image = resolveImageReference(this.context, { $type: type, $name: imageName });
    return resolveImageLayers(this.context, image).map((layer) => ({
      $type: "image", $name: imageName, src: layer.src,
    }));
  }

  getFontNamesForLayout(layoutName: string): string[] {
    const fonts = this.context?.font;
    if (!fonts) {
      return [];
    }
    const fontNames = Object.keys(fonts).filter((n) => !n.startsWith("$"));
    if (fontNames.length === 0) {
      return [];
    }
    const layout = this._game.program?.sparkle?.layouts?.[layoutName];
    const components = this._game.program?.sparkle?.components ?? {};
    const classes = new Set<string>(["layouts", "main", layoutName]);
    const propValues: string[] = [];
    const expanded = new Set<string>();
    const visit = (nodes: unknown[] | undefined) => {
      for (const node of nodes ?? []) {
        if (!node || typeof node !== "object") {
          continue;
        }
        const n = node as Record<string, any>;
        if (typeof n["tag"] === "string") {
          classes.add(n["tag"]);
          const body = components[n["tag"]];
          if (body && !expanded.has(n["tag"])) {
            expanded.add(n["tag"]);
            visit(body.children);
          }
        }
        if (typeof n["name"] === "string") {
          classes.add(n["name"]);
        }
        for (const cls of n["classes"] ?? []) {
          if (typeof cls === "string") {
            classes.add(cls);
          }
        }
        for (const prop of Object.values(n["props"] ?? {})) {
          const value = (prop as Record<string, unknown>)?.["value"];
          if (typeof value === "string") {
            propValues.push(value);
          }
        }
        visit(n["children"]);
        visit(n["else"]);
        for (const branch of n["branches"] ?? []) {
          visit(branch?.children);
        }
        for (const c of n["cases"] ?? []) {
          visit(c?.children);
        }
      }
    };
    visit(layout?.children);
    const byFamily = new Map<string, string[]>();
    for (const fontName of fontNames) {
      const family = fonts[fontName]?.font_family;
      if (typeof family === "string" && family) {
        const list = byFamily.get(family) ?? [];
        list.push(fontName);
        byFamily.set(family, list);
      }
    }
    const referenced = new Set<string>();
    const scan = (value: unknown, depth: number) => {
      if (depth > 8 || value == null) {
        return;
      }
      if (typeof value === "string") {
        if (fonts[value] && !value.startsWith("$")) {
          referenced.add(value);
          return;
        }
        const named = byFamily.get(value);
        if (named) {
          for (const fontName of named) {
            referenced.add(fontName);
          }
          return;
        }
        for (const fontName of fontNames) {
          if (value.includes(`--font-${fontName}`)) {
            referenced.add(fontName);
          }
        }
        return;
      }
      if (typeof value !== "object") {
        return;
      }
      const v = value as Record<string, unknown>;
      if (v["$type"] === "font" && typeof v["$name"] === "string") {
        referenced.add(v["$name"]);
        return;
      }
      for (const inner of Object.values(v)) {
        scan(inner, depth + 1);
      }
    };
    const styles = this.context?.style ?? {};
    for (const cls of classes) {
      const style = (styles as Record<string, unknown>)[cls];
      if (style) {
        scan(style, 0);
      }
    }
    for (const value of propValues) {
      scan(value, 0);
    }
    return [...referenced];
  }

  protected _morphEpoch = 0;

  protected _morphConflicts = new Set<string>();

  protected _morphHost?: MorphHost;

  protected _morphSent = new Set<string>();

  protected _morphWritten = new Map<string, MorphRef>();

  protected _morphBaking = new Set<string>();

  protected deliverMorphArtifact(ref: MorphRef, again = false) {
    if (ref.src) {
      return;
    }
    this._morphWritten.set(ref.key, ref);
    if (this._morphBaking.has(ref.key) || (this._morphSent.has(ref.key) && !again)) {
      return;
    }
    this._morphSent.add(ref.key);
    this._morphBaking.add(ref.key);
    this._morphHost ??= createMorphHost({
      service: new MorphBakeService(),
      channel: () => this._game.program?.morphs,
      readSource: inlineMorphSource(() => this.context as any),
    });
    const baking = this._morphBaking;
    const send = (params: MorphArtifactParams) => {
      baking.delete(ref.key);
      return this._game.connection.emit(MorphArtifactMessage.type.notification(params));
    };
    this._morphHost.resolve(ref).then(
      (handle) => {
        void send({ key: ref.key, artifact: JSON.parse(JSON.stringify(handle.artifact)) });
        handle.release();
      },
      (error) => {
        void send({ key: ref.key, error: error instanceof Error ? error.message : String(error) });
      },
    );
  }

  getMorphContent(assets: string[]): MorphImageContent | undefined {
    const channel = this._game.program?.morphs;
    if (!channel || !this.context) {
      return undefined;
    }
    const plays: MorphLayerPlay[] = [];
    let next = 0;
    for (const asset of assets) {
      const first = next;
      const count = cssList(this.getBackgroundImageFromString(asset)).length;
      next += count;
      if (asset.at(0) === '"' && asset.at(-1) === '"') {
        continue;
      }
      const imageName = sortFilteredName(asset);
      const image = resolveImageReference(this.context, { $type: "", $name: imageName });
      const resolved = resolveImageLayers(this.context, image);
      if (resolved.length !== count) {
        continue;
      }
      for (const [offset, layer] of resolved.entries()) {
        const index = first + offset;
        const refs = morphRefsForStruct(this.context, channel, layer.struct);
        if (refs.length > 1) {
          this.reportMorphConflict(layer.struct?.$name ?? asset, refs);
          continue;
        }
        const ref = refs[0];
        if (!ref) {
          continue;
        }
        this.deliverMorphArtifact(ref);
        const timing = { ...default_morph().timing, ...(this.context.morph?.[ref.morph]?.timing ?? {}) } as MorphTiming;
        plays.push({
          layer: index,
          ref,
          timing,
          definition: hashText(`${channel.recipes[ref.morph] ?? ""}\n${JSON.stringify(timing)}`),
        });
      }
    }
    return plays.length > 0 ? { plays, epoch: this._morphEpoch } : undefined;
  }

  protected reportMorphConflict(image: string, refs: MorphRef[]) {
    const names = refs.map((r) => r.morph).sort();
    const key = `${image}\n${names.join("\n")}`;
    if (this._morphConflicts.has(key)) {
      return;
    }
    this._morphConflicts.add(key);
    const shared = refs[0]!.groups.filter((g) => refs.slice(1).some((r) => r.groups.includes(g)));
    const list = names.map((n) => `\`${n}\``).join(", ");
    this._game.log(
      shared.length > 0
        ? `\`${image}\` is claimed by ${list}, which all drive ${shared.map((g) => `\`${g}\``).join(", ")}; it stays still until only one morph plays on it.`
        : `\`${image}\` has more than one morph (${list}); one image plays one morph, so it stays still until only one plays on it.`,
      "warning",
    );
  }

  getImageSrcsByName(name: string) {
    const assets = this.getImageAssets("", name);
    const srcs = assets.length ? assets.map((asset) => asset.src) : null;
    this._building?.pictures.set(name, JSON.stringify(srcs));
    return srcs;
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

  getVideoSrcByName(name: string): string | undefined {
    if (this.getImageSrcsByName(name)) {
      return undefined;
    }
    const src = (this.context as Record<string, any>)?.["video"]?.[name]?.src;
    return typeof src === "string" && src ? src : undefined;
  }

  getMovieMixer(): { mixer: string; mixerGain: number } {
    const context = this.context as Record<string, any> | undefined;
    const named = context?.["channel"]?.["movie"]?.mixer;
    const mixer =
      (typeof named === "string" ? named : named?.$name) || "movie";
    const gain = context?.["mixer"]?.[mixer]?.gain;
    return { mixer, mixerGain: typeof gain === "number" ? gain : 1 };
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

  protected _mountedLayouts: Map<
    string,
    { element: Element; scope: ReactiveScope; screen?: string }
  > = new Map();

  _autoOpenAll = false;

  static readonly MANAGED_LAYOUTS = new Set(["main", "loading"]);

  constructLayoutsFromAst(...structNames: string[]): void {
    this._mountedLayouts = new Map();
    const layouts = this._game.program?.sparkle?.layouts;
    if (!layouts) {
      return;
    }
    const vs = this._game.story.variablesState;
    vs.reactiveDepsEnabled = true;
    if (this._building) {
      this.watchBuild();
    }
    const targetAllLayouts = !structNames || structNames.length === 0;
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
    const residue = vs.takeReactiveChanges();
    if (this._building) {
      this.noteBuildWrites(residue);
      vs.trackWrites = false;
    }
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
    return undefined;
  }

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
    const name = [node.tag, ...node.classes].join(" ");
    const widget = INPUT_WIDGETS[node.tag];
    if (widget) {
      return this.mountInputWidget(parent, node, scope, name, widget, before);
    }
    if (node.tag === "dropdown") {
      return this.mountDropdown(parent, node, scope, name, before);
    }
    if (node.tag === "textarea") {
      return this.mountTextarea(parent, node, scope, name, before);
    }
    if (node.tag === "option") {
      return this.mountOption(parent, node, scope, name, before);
    }
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
    this.mountChildren(el, node.children, scope, null);
    return el;
  }

  protected mountInputWidget(
    parent: Element,
    node: ElementNode,
    scope: ReactiveScope,
    name: string,
    widget: { inputType: string; attributes?: Record<string, string> },
    before: Element | null,
  ): Element {
    if (!node.content || node.content.length === 0) {
      return this.mountInputControl(parent, node, scope, name, widget, before);
    }
    const vs = this._game.story.variablesState;
    const style: Record<string, string | null> = {};
    const reactiveStyles: Omit<ReactiveStyle, "element">[] = [];
    const controlProps: ElementNode["props"] = {};
    for (const [prop, propValue] of Object.entries(node.props)) {
      if (isAttributeProp(prop)) {
        controlProps[prop] = propValue;
        continue;
      }
      vs.beginReactiveRead();
      const resolved = this.resolveProp(propValue, scope.env);
      const deps = vs.endReactiveRead();
      const val = resolved == null ? null : String(resolved);
      style[prop] = val;
      if (this.isReactiveProp(propValue)) {
        reactiveStyles.push({ prop, propValue, last: val, deps });
      }
    }
    const toggle = widget.inputType === "checkbox" || widget.inputType === "radio";
    const label = this.createElement(
      parent,
      {
        type: "label",
        name,
        ...(Object.keys(style).length > 0 ? { style } : {}),
      },
      before,
    );
    for (const r of reactiveStyles) {
      scope.styles.push({ element: label, ...r });
    }
    if (!toggle) {
      this.mountTextContent(label, node.content, scope);
    }
    this.mountInputControl(
      label,
      { ...node, props: controlProps },
      scope,
      "control",
      widget,
      null,
      true,
    );
    if (toggle) {
      this.mountTextContent(label, node.content, scope);
    }
    return label;
  }

  protected mountInputControl(
    parent: Element,
    node: ElementNode,
    scope: ReactiveScope,
    name: string,
    widget: { inputType: string; attributes?: Record<string, string> },
    before: Element | null,
    labelled = false,
  ): Element {
    const vs = this._game.story.variablesState;
    const attributes: Record<string, string | null> = {
      type: widget.inputType,
      ...widget.attributes,
      ...(labelled ? { [WIDGET_CONTROL_ATTRIBUTE]: "" } : {}),
    };
    const reactive: Omit<ReactiveAttr, "element">[] = [];
    const style: Record<string, string | null> = {};
    const reactiveStyles: Omit<ReactiveStyle, "element">[] = [];
    for (const [prop, propValue] of Object.entries(node.props)) {
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
    if (widget.inputType === "range") {
      this.mountSliderFill(el, node, scope);
    }
    for (const ev of node.events) {
      this.mountEvent(el, ev, scope);
    }
    return el;
  }

  protected mountSliderFill(
    el: Element,
    node: ElementNode,
    scope: ReactiveScope,
  ): void {
    const value = node.props["value"];
    const min = node.props["min"];
    const max = node.props["max"];
    if (!value) return;
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
      if (!isAttributeProp(prop)) {
        const val = resolved == null ? null : String(resolved);
        style[prop] = val;
        if (this.isReactiveProp(propValue)) {
          reactiveStyles.push({ prop, propValue, last: val, deps });
        }
        continue;
      }
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
      if (!isAttributeProp(prop)) {
        const val = resolved == null ? null : String(resolved);
        style[prop] = val;
        if (this.isReactiveProp(propValue)) {
          reactiveStyles.push({ prop, propValue, last: val, deps });
        }
        continue;
      }
      const attrVal = this.propToAttr(resolved, BOOLEAN_ATTRIBUTES.has(prop));
      if (prop === "value") {
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
      if (isReservedAttribute(prop)) {
        continue;
      }
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

  protected resolveProp(propValue: PropValue, env: ReactiveEnv): unknown {
    if (propValue.kind === "literal") {
      return propValue.value;
    }
    if (propValue.kind === "content") {
      return this.resolveContent(propValue.content, env);
    }
    return this.evalBinding(propValue.binding, env);
  }

  protected isReactiveProp(propValue: PropValue): boolean {
    return propValue.kind === "binding" || propValue.kind === "content";
  }

  protected propToAttr(resolved: unknown, boolean: boolean): string | null {
    if (boolean) {
      return this.isTruthy(resolved) ? "" : null;
    }
    return resolved == null ? null : String(resolved);
  }

  protected markHandler(el: Element): void {
    this.updateElement(el, { attributes: { [HANDLER_ATTRIBUTE]: "" } });
  }

  protected mountEvent(
    el: Element,
    ev: EventBinding,
    scope: ReactiveScope,
  ): void {
    const handler = ev.handler;
    const callback = (event: Event): void => {
      const eventTable = this.buildEventTable(event);
      if (handler.kind === "ref") {
        this.runHandlerFunction(handler.name, eventTable);
      } else {
        this.evalBinding(handler.binding, { ...scope.env, event: eventTable });
      }
      this.refreshLayouts();
    };
    this._events[ev.event] ??= {};
    this._events[ev.event]![el.id] = callback;
    this.markHandler(el);
    this.enqueueUI(
      ObserveElementMessage.type.notification({
        element: el.id,
        event: ev.event as keyof EventMap,
        stopPropagation: true,
        once: false,
      }),
    );
  }

  protected runHandlerFunction(name: string, event?: AbstractValue): void {
    const story = this._game.story;
    if (story.HasFunction(name)) {
      const reported = this._game.runtimeErrorsReported;
      try {
        story.EvaluateFunction(name, event !== undefined ? [event] : []);
      } catch (e) {
        this.reportRuntimeError(`Error running handler \`${name}\``, e, reported);
      }
    }
  }

  protected buildEventTable(event: Event | undefined): ObjectValue {
    const payload = (event ?? {}) as {
      value?: unknown;
      checked?: unknown;
      key?: unknown;
      type?: unknown;
    };
    const map = new Map<string, AbstractValue>();
    if (payload.value != null) {
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

  protected toLuauValue(value: unknown): AbstractValue {
    if (typeof value === "number") {
      return Number.isInteger(value) ? new IntValue(value) : new FloatValue(value);
    }
    if (typeof value === "boolean") {
      return new BoolValue(value);
    }
    return new StringValue(String(value));
  }

  protected mountTextContent(
    parent: Element,
    content: ContentPart[] | undefined,
    scope: ReactiveScope,
  ): void {
    if (!content || content.length === 0) {
      return;
    }
    const { text, deps } = this.resolveContentTracked(content, scope.env);
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

  protected renderRichText(el: Element, text: string): void {
    const runs = parseRichText(text);
    for (const child of [...el.children]) {
      this.destroyElement(child);
    }
    if (isPlainRun(runs)) {
      this.updateElement(el, { content: { text: runs[0]?.text ?? "" } });
      return;
    }
    this.updateElement(el, { content: { text: "" } });
    this.mountRichTextRuns(el, runs);
  }

  protected mountRichTextRuns(parent: Element, runs: RichTextRun[]): void {
    for (const run of runs) {
      this.createElement(parent, {
        type: run.tag ?? "span",
        content: { text: run.text },
        style: { display: "inline", ...(run.style ?? {}) },
      });
    }
  }

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
      active: -2,
      scope: this.makeScope(scope.env, scope.slots),
      deps: { globals: new Set(), tables: new Set() },
      siblings: [],
      content: [],
    };
    scope.regions.push(region);
    this.activateBranch(region, before);
    return region;
  }

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
      slots: scope.slots,
    };
    scope.regions.push(region);
    this.populateFor(region, scope.env, before);
    return region;
  }

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
    const owner = region.owner;
    if (!owner) {
      return null;
    }
    if (owner.kind === "for") {
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

  protected firstLiveElement(item: ReactiveItem): Element | null {
    if ("el" in item) {
      return item.el;
    }
    const region = item.region;
    if (region.kind !== "for") {
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
        out.push(...this.collectNodes(region.content));
      }
    }
    return out;
  }

  protected isTruthy(value: unknown): boolean {
    return value != null && value !== false;
  }

  protected contentHasBinding(content: ContentPart[]): boolean {
    return content.some((p) => p.kind === "binding");
  }

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

  refreshLayouts(): void {
    if (!this._reactive) {
      return;
    }
    if (this._game.context?.system?.simulating) {
      return;
    }
    const changes = this._game.story.variablesState.takeReactiveChanges();
    this._refreshing = true;
    try {
      for (const { scope } of this._mountedLayouts.values()) {
        this.refreshScope(scope, changes);
      }
    } finally {
      this._refreshing = false;
      this._refreshAll = false;
    }
    this.flushUIBatch();
  }

  protected refreshScope(scope: ReactiveScope, changes: ReactiveDeps): void {
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
      } else {
        this.refreshCondRegion(region, changes, envScope);
      }
    }
  }

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
    if (envScope || this.depsChanged(region.deps, changes)) {
      const vs = this._game.story.variablesState;
      vs.beginReactiveRead();
      const next = this.selectBranch(region.node, region.scope.env);
      region.deps = vs.endReactiveRead();
      if (next !== region.active) {
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
          region,
        );
        return;
      }
    }
    this.refreshScope(region.scope, changes);
  }

  protected refreshForRegion(
    region: ForRegion,
    parentEnv: ReactiveEnv,
    changes: ReactiveDeps,
  ): void {
    const entries = this.forEntries(region.node, parentEnv);

    if (entries.length === 0) {
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

    if (region.elseScope && region.elseContent) {
      for (const el of this.collectNodes(region.elseContent)) {
        this.destroyElement(el);
      }
      region.elseScope = undefined;
      region.elseContent = undefined;
    }

    const oldByKey = new Map<unknown, ForIteration[]>();
    for (const it of region.iterations) {
      const q = oldByKey.get(it.key);
      if (q) {
        q.push(it);
      } else {
        oldByKey.set(it.key, [it]);
      }
    }

    const next: ForIteration[] = [];
    for (const [entryKey, value] of entries) {
      const key = this.keyForEntry(region.node, entryKey, value);
      const q = oldByKey.get(key);
      const reused = q && q.length > 0 ? q.shift() : undefined;
      if (reused) {
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

    for (const q of oldByKey.values()) {
      for (const it of q) {
        this.destroyIteration(it);
      }
    }

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

  protected scopeHasEnv(scope: ReactiveScope): boolean {
    for (const _ in scope.env) {
      return true;
    }
    return false;
  }

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

  async openLayout(
    name: string,
    clauses?: { with?: string; after?: number; over?: number; ease?: string },
    instant = false,
  ): Promise<void> {
    if (!this._reactive) {
      this.showLayout(name);
      return;
    }
    if (!name) {
      return;
    }
    if (
      name === "loading" &&
      (this.context.system.previewing || this.context.system.simulating)
    ) {
      return;
    }
    if (this._mountedLayouts.has(name)) {
      return;
    }
    const layouts = this._game.program?.sparkle?.layouts;
    const layout = layouts?.[name];
    if (!layout) {
      return;
    }
    const fonts = this._game.module.assets?.prepareLayout(name);
    let mounted: (() => void) | undefined;
    if (fonts) {
      const epoch = this._game.connection.epoch;
      const pendingOpen = { cancelled: false };
      const opens = this._pendingOpens.get(name) ?? new Set();
      opens.add(pendingOpen);
      this._pendingOpens.set(name, opens);
      const mount = new Promise<void>((resolve) => {
        mounted = () => {
          this._mountOwners.delete(mount);
          opens.delete(pendingOpen);
          if (opens.size === 0 && this._pendingOpens.get(name) === opens) {
            this._pendingOpens.delete(name);
          }
          this.notifyRealization();
          resolve();
        };
      });
      if (this._compose) {
        this._mountOwners.set(mount, this._compose);
      }
      this.notifyRealization();
      try {
        await fonts;
      } catch (error) {
        mounted?.();
        throw error;
      }
      if (
        pendingOpen.cancelled ||
        this.superseded(epoch) ||
        this._mountedLayouts.has(name) ||
        (name === "loading" && !this._loading)
      ) {
        mounted?.();
        if (
          pendingOpen.cancelled &&
          !this._mountedLayouts.has(name) &&
          !this._pendingOpens.get(name)?.size
        ) {
          this._game.module.assets?.releaseLayout(name);
        }
        return;
      }
    }
    let element: Element;
    try {
      const vs = this._game.story.variablesState;
      const pending = vs.takeReactiveChanges();
      element = this.constructLayoutFromAst(layout);
      vs.takeReactiveChanges();
      vs.restoreReactiveChanges(pending);
      this.notifyMounted(name);
      this.reveal();
    } finally {
      mounted?.();
    }
    const enter = this.resolveLayoutAnimation("enter", clauses ?? {}, instant);
    if (enter && !instant) {
      const entering = this.animateElements([{ element, animations: [enter] }]);
      if (this._compose) {
        void entering;
        return;
      }
      await entering;
    }
  }

  async closeLayout(
    name: string,
    clauses?: { with?: string; after?: number; over?: number; ease?: string },
    instant = false,
  ): Promise<void> {
    if (!this._reactive) {
      this.hideLayout(name);
      return;
    }
    const opens = name ? this._pendingOpens.get(name) : undefined;
    for (const open of opens ?? []) {
      open.cancelled = true;
    }
    const entry = name ? this._mountedLayouts.get(name) : undefined;
    if (!entry) {
      return;
    }
    const exit = this.resolveLayoutAnimation("exit", clauses ?? {}, instant);
    if (exit && !instant && this._compose) {
      const retiring: Retirement = {
        element: entry.element,
        epoch: this._game.connection.epoch,
        pin: this._game.module.assets?.retireLayout(name),
      };
      this._mountedLayouts.delete(name);
      entry.element.remove();
      this._retiring.add(retiring);
      void this.animateElements([
        { element: entry.element, animations: [exit] },
      ]).then(() => this.retire(retiring));
      return;
    }
    if (exit && !instant) {
      await this.animateElements([{ element: entry.element, animations: [exit] }]);
    }
    this.destroyElement(entry.element);
    this._mountedLayouts.delete(name);
    this._game.module.assets?.releaseLayout(name);
  }

  protected retire(r: Retirement): void {
    if (!this._retiring.delete(r)) {
      return;
    }
    if (!this.superseded(r.epoch)) {
      this.flushUIBatch();
      this.destroyElement(r.element, true);
      const messages = this._uiBatch;
      this._uiBatch = [];
      if (messages.length > 0) {
        this._uiOps += 1;
        void super.emit(BatchElementsMessage.type.notification({ messages }));
      }
    }
    if (r.pin) {
      this._game.module.assets?.releaseRetiredLayout(r.pin);
    }
  }

  protected _mountWaiters = new Map<string, Array<() => void>>();

  protected whenMounted(name: string): Promise<void> {
    if (this._mountedLayouts.has(name)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const waiters = this._mountWaiters.get(name) ?? [];
      waiters.push(resolve);
      this._mountWaiters.set(name, waiters);
    });
  }

  protected notifyMounted(name: string): void {
    const waiters = this._mountWaiters.get(name);
    if (!waiters) {
      return;
    }
    this._mountWaiters.delete(name);
    for (const resolve of waiters) {
      resolve();
    }
  }

  protected _loading?: {
    openedAt: number;
    transition?: string;
    opening?: Promise<void>;
  };

  protected _loadingReported?: string;

  protected setLoadingState(
    fields: Partial<{
      active: boolean;
      name: string;
      loaded: number;
      total: number;
      progress: number;
      percent: number;
    }>,
  ): void {
    const vs = this._game.story?.variablesState;
    const game = vs?.GetVariableWithName("game");
    const loading =
      game instanceof ObjectValue ? game.value?.get("loading") : undefined;
    if (!vs || !(loading instanceof ObjectValue) || !loading.value) {
      return;
    }
    for (const [key, raw] of Object.entries(fields)) {
      if (raw === undefined) {
        continue;
      }
      const value =
        typeof raw === "boolean"
          ? new BoolValue(raw)
          : typeof raw === "string"
            ? new StringValue(raw)
            : Number.isInteger(raw)
              ? new IntValue(raw)
              : new FloatValue(raw);
      loading.value.set(key, value);
    }
    vs.recordReactiveTableChange(loading.value);
  }

  beginLoading(transition?: string, scene?: string): void {
    if (this.context.system.previewing || this.context.system.simulating) {
      return;
    }
    const resolved =
      transition ?? this._game.module.assets?.config.loading_transition;
    this._loading = {
      openedAt: this.context.system.now(),
      transition: resolved,
    };
    this._loadingReported = undefined;
    this.setLoadingState({
      active: true,
      name: scene ?? "",
      loaded: 0,
      total: 0,
      progress: 0,
      percent: 0,
    });
    this.refreshLayouts();
    if (!this._mountedLayouts.has("loading")) {
      this._loading.opening = this.openLayout(
        "loading",
        resolved ? { with: resolved } : undefined,
        !this.context.system.transitions,
      ).catch((e) => {
        this.reportRuntimeError("Could not open the loading layout", e);
      });
    }
  }

  updateLoading(progress: { loaded: number; total: number }): void {
    if (!this._loading && !this._mountedLayouts.has("loading")) {
      return;
    }
    const reported = `${progress.loaded}/${progress.total}`;
    if (this._loadingReported === reported) {
      return;
    }
    this._loadingReported = reported;
    const ratio =
      progress.total > 0 ? Math.min(1, progress.loaded / progress.total) : 0;
    this.setLoadingState({
      loaded: progress.loaded,
      total: progress.total,
      progress: Math.round(ratio * 100) / 100,
      percent: Math.round(ratio * 100),
    });
    this.refreshLayouts();
  }

  async endLoading(): Promise<void> {
    const loading = this._loading;
    this._loading = undefined;
    if (!loading) {
      return;
    }
    if (loading.opening && !this._mountedLayouts.has("loading")) {
      await Promise.race([loading.opening, this.whenMounted("loading")]);
    }
    this.setLoadingState(
      this._loadingReported === undefined
        ? { active: false, progress: 1, percent: 100 }
        : { active: false },
    );
    this._loadingReported = undefined;
    this.refreshLayouts();
    const minSeconds = this._game.module.assets?.config.loading_min ?? 0;
    const elapsedMs = this.context.system.now() - loading.openedAt;
    const waitMs = Math.max(0, minSeconds * 1000 - elapsedMs);
    if (waitMs > 0) {
      await new Promise<void>((resolve) =>
        this.context.system.setTimeout(resolve, waitMs),
      );
    }
    await this.closeLayout(
      "loading",
      loading.transition ? { with: loading.transition } : undefined,
      !this.context.system.transitions,
    );
  }

  runCutscene(cutscene: CutsceneInstruction): number {
    const id = this.nextTriggerId();
    const src = this.getVideoSrcByName(cutscene.name);
    if (!src) {
      this.enableTrigger(id);
      return id;
    }
    const system = this.context.system;
    const previewing = system.previewing != null && system.previewing !== false;
    if (!previewing && this.context.config?.movie?.stop_music !== false) {
      this._game.module.audio.stopChannel(
        "music",
        undefined,
        CUTSCENE_MUSIC_FADE,
      );
    }
    if (system.simulating) {
      this.enableTrigger(id);
      return id;
    }
    const params: PlayCutsceneParams = {
      src,
      loop: Boolean(cutscene.loop),
      muted: Boolean(cutscene.mute),
      ...this.getMovieMixer(),
    };
    if (cutscene.with) {
      params.with = cutscene.with;
      if (!previewing) {
        const clauses = { with: cutscene.with };
        const enter = this.resolveLayoutAnimation("enter", clauses, false);
        const exit = this.resolveLayoutAnimation("exit", clauses, false);
        if (enter) {
          params.enter = enter;
        }
        if (exit) {
          params.exit = exit;
        }
      }
    }
    if (previewing) {
      params.preview = true;
    }
    void this.emitSettled(PlayCutsceneMessage.type.request(params)).then(() =>
      this.enableTrigger(id),
    );
    return id;
  }

  skipCutscene(): void {
    if (this.context.system.simulating) {
      return;
    }
    this.emit(SkipCutsceneMessage.type.notification({}));
  }

  async navigateScreen(
    name: string,
    screen?: string,
    clauses?: { with?: string; after?: number; over?: number; ease?: string },
    instant = false,
  ): Promise<void> {
    if (!this._reactive) {
      if (name) {
        this.showLayout(name);
      }
      return;
    }
    if (!name) {
      return;
    }
    const toClose = [...this._mountedLayouts.entries()]
      .filter(
        ([n, entry]) =>
          n !== name &&
          !UIModule.MANAGED_LAYOUTS.has(n) &&
          (screen ? entry.screen === screen : true),
      )
      .map(([n]) => n);
    await Promise.all([
      ...toClose.map((n) => this.closeLayout(n, clauses, instant)),
      this.openLayout(name, clauses, instant),
    ]);
  }

  protected saveLayoutState(e: LayoutInstruction): void {
    const layouts = this._game.program?.sparkle?.layouts;
    const recordOpen = (name: string) => {
      if (!name || UIModule.MANAGED_LAYOUTS.has(name) || !layouts?.[name]) {
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
      if (!e.name) {
        return;
      }
      if (this._state.layout) {
        this._state.layout = this._state.layout.filter((s) =>
          e.screen ? s.screen !== e.screen || s.name === e.name : s.name === e.name,
        );
      }
      recordOpen(e.name);
      return;
    }
    recordOpen(e.name);
  }

  async applyLayoutInstructions(
    instructions: LayoutInstruction[],
    instant: boolean,
  ): Promise<void> {
    for (const e of instructions) {
      this.saveLayoutState(e);
    }
    if (instructions.length > 0) {
      this._screenEdits += 1;
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
    if (this._game.replaying && instant) {
      for (const e of instructions) {
        void run(e);
      }
      return;
    }
    const epoch = this._game.connection.epoch;
    const segments: LayoutInstruction[][] = [[]];
    for (const e of instructions) {
      if (e.control === "navigate") {
        segments.push([e], []);
      } else {
        segments[segments.length - 1]!.push(e);
      }
    }
    for (const segment of segments) {
      if (this.superseded(epoch)) {
        return;
      }
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
            if (this.superseded(epoch)) {
              return;
            }
            await run(e);
          }
        }),
      );
    }
  }

  protected findElements(target: string, writes = false): Element[] {
    const [name, instance] = target.split("#");
    const found: Element[] = [];
    if (this._root && name) {
      const matches = this.searchForAll(this._root, name, found);
      const named = matches.filter((el) => el.name === name);
      const elements =
        named.length > 0
          ? named
          : writes
            ? matches.filter(
                (el) =>
                  !el.name
                    .split(" ")
                    .some((c) =>
                      ["text", "image", "stroke", "mask"].includes(c),
                    ),
              )
            : matches;
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
    return this.findElements(target, true).map((c) => c.id);
  }

  protected namesWriteElements(target: string, elements: Element[]): boolean {
    const name = target.split("#")[0];
    return (
      Boolean(this._compose) || elements.some((el) => el.name !== name)
    );
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
      const fill = animation?.timing?.fill ?? "none";
      const direction = animation?.timing?.direction ?? "normal";
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
      this.markHandler(targetEl);
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
        time?: number,
        shown = 0,
      ) {
        const targetEls = $.findElements(target, true);
        if (!sequence && $.knownEmpty("text", targetEls)) {
          return;
        }
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
        $.noteContent("text", targetEls, !sequence);
        if (targetEls.length === 0) {
          return;
        }
        $.flushUIBatch();
        await $.emitSettled(
          WriteTextMessage.type.request({
            target,
            instructions: sequence ?? [],
            instant,
            ...(time != null ? { time } : {}),
            ...(shown > 0 ? { shown } : {}),
            ...($.namesWriteElements(target, targetEls)
              ? { elements: targetEls.map((el) => el.id) }
              : {}),
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
        time?: number,
        shown = 0,
      ) {
        this.saveState(target, sequence);
        if (!$.context?.system?.simulating) {
          await this.applyChanges(target, sequence, instant, time, shown);
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
                state = state.filter(
                  (e) => !(e.control === "hide" && !e.assets?.length),
                );
                state = state.filter((e) => !e.assets?.length);
                $._state.image ??= {};
                $._state.image[target] = state;
              }
              state.push({
                control: event.control,
                with: event.with,
                assets: event.assets,
                over: 0,
                ...(event.loop ? { loop: true } : {}),
                ...(event.once ? { once: true } : {}),
                ...(event.mute ? { mute: true } : {}),
              });
            } else {
              const changingVisibility = event.control !== "animate";
              const latestLayerVisibilityEvent = state.findLast(
                (e) => !e.assets?.length && e.control !== "animate",
              );
              if (changingVisibility && latestLayerVisibilityEvent) {
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

      async restoreCleared(beat: Pick<Instructions, "image" | "extended">) {
        const cleared = $._clearedPictures;
        if (!cleared || $.context?.system?.simulating) {
          return;
        }
        const targets = $.keptTargets(beat);
        $._clearedPictures = undefined;
        await Promise.all(
          targets.map(async (target) => {
            const state = cleared[target];
            if (state) {
              $._state.image ??= {};
              $._state.image[target] = state;
              await this.applyChanges(target, state, true);
            }
          }),
        );
      }

      protected resolve(
        sequence: ImageInstruction[],
        instant: boolean,
      ): WriteImageInstruction[] {
        const instructions: WriteImageInstruction[] = [];
        for (const e of sequence) {
          const out: WriteImageInstruction = { control: e.control };
          const targetAnimations: Animation[] = [];
          const affected: { target: string; animations: Animation[] }[] = [];
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
            const imageNames = e.assets.join(" ");
            const videoSrcs = e.assets
              .map((a) => $.getVideoSrcByName(a))
              .filter((s): s is string => Boolean(s));
            const imageAssets = e.assets.filter(
              (a) => !$.getVideoSrcByName(a),
            );
            const background =
              imageAssets.length > 0
                ? imageAssets
                    .map((a) => $.getBackgroundImageFromString(a))
                    .reverse()
                    .join(", ")
                : "none";
            const src = imageAssets.flatMap((a) =>
              $.getImageSrcsFromValue(a),
            )[0];
            const srcs = [
              ...new Set([
                ...imageAssets
                  .flatMap((a) => $.getImageSrcsFromValue(a) ?? [])
                  .filter((s) => !s.startsWith("data:")),
                ...videoSrcs.slice(0, 1),
              ]),
            ];
            const content: WriteImageInstruction["content"] = {
              background,
              imageNames,
              srcs,
            };
            if (src != null) {
              content.src = src;
            }
            const videoSrc = videoSrcs[0];
            if (videoSrc) {
              const previewing = $.context?.system?.previewing;
              content.video = {
                src: videoSrc,
                loop: !e.once,
                muted: Boolean(e.mute),
                ...$.getMovieMixer(),
                ...(previewing != null && previewing !== false
                  ? { preview: true }
                  : {}),
              };
            }
            const morph = $.getMorphContent(imageAssets);
            if (morph) {
              content.morph = morph;
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
        time?: number,
      ) {
        const targetEls = $.findElements(target, true);
        if (!sequence && $.knownEmpty("image", targetEls)) {
          return;
        }
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
        $.noteContent("image", targetEls, !sequence);
        if (targetEls.length === 0) {
          return;
        }
        $.flushUIBatch();
        await $.emitSettled(
          WriteImageMessage.type.request({
            target,
            instructions: sequence ? this.resolve(sequence, instant) : [],
            instant,
            ...(time != null ? { time } : {}),
            ...($.namesWriteElements(target, targetEls)
              ? { elements: targetEls.map((el) => el.id) }
              : {}),
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
        time?: number,
      ) {
        this.saveState(target, sequence);
        if (!$.context?.system?.simulating) {
          await this.applyChanges(target, sequence, instant, time);
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
    if (MorphNeedMessage.type.isNotification(msg)) {
      const ref = this._morphWritten.get(msg.params.key);
      if (ref) {
        this.deliverMorphArtifact(ref, true);
      }
      return;
    }
    if (EventMessage.type.isNotification(msg)) {
      const params = msg.params;
      if (params.currentTargetId) {
        const callback = this._events[params.type]?.[params.currentTargetId];
        if (callback) {
          this._uiOps += 1;
          callback(params);
        }
      }
    }
  }
}
