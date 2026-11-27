import type { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { StartingDisplayMode } from "../../../core/classes/messages/SetStartingDisplayModeMessage";
import { ErrorType } from "../../../core/enums/ErrorType";
import {
  LAYOUT_VERBS,
  LayoutVerb,
  isLayoutVerb,
} from "@impower/sparkdown/language/sparkdown.layout-verbs";
import { resolveImageAttributes } from "@impower/sparkdown/src/compiler/utils/filterImage";
import type { ImageLayer } from "@impower/sparkdown/src/compiler/utils/resolveImageLayers";
import { resolveImageReference } from "@impower/sparkdown/src/compiler/utils/resolveImageReference";
import { sortFilteredName } from "@impower/sparkdown/src/compiler/utils/sortFilteredName";
import { resolvePictureLook, shownImageLayers, type PictureLook } from "@impower/sparkdown/src/morph/look";
import { morphOverlaps, morphPoseAt, morphRestPose, parseMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphTimeline } from "@impower/sparkdown/src/morph/timeline";
import { readMorphReplay } from "@impower/sparkdown/src/compiler/morph/morphSchema";
import { cssList } from "@impower/sparkdown/src/morph/cssList";
import { buildMorphMotion } from "@impower/sparkdown/src/morph/motion";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import {
  MorphArtifactMessage,
  type MorphArtifactParams,
} from "./messages/MorphArtifactMessage";
import { MorphNeedMessage } from "./messages/MorphNeedMessage";
import { MorphStillMessage, type MorphStillParams } from "./messages/MorphStillMessage";
import { hashText } from "@impower/sparkdown/src/morph/hash";
import type { MorphRecipe, MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import { linePick } from "@impower/sparkdown/src/compiler/utils/linePick";
import { default_morph } from "../constructors/default_morph";
import { ambientReads } from "@impower/sparkdown/src/runtime/AmbientReads";
import { SPEAKER_TARGETS } from "../../../core/classes/presenters/InteractiveFictionPresenter";
import { pageKey } from "../../../core/utils/pageKey";
import { ownEntry, ownList } from "../../../core/utils/ownEntry";
import {
  BOOLEAN_ATTRIBUTES,
  DISPLAY_TARGET_ATTRIBUTE,
  DISPLAY_TARGETS,
  HANDLER_ATTRIBUTE,
  isAttributeProp,
  isReservedAttribute,
  PRESENCE_ATTRIBUTE,
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
  ScreenNode,
  StreamNode,
} from "@impower/sparkdown/src/compiler/types/SparkleNode";
import {
  isCast,
  isStream,
  isTemplated,
  layoutCasts,
  layoutStreams,
} from "@impower/sparkdown/src/compiler/utils/layoutStreams";
import {
  AbstractValue,
  BoolValue,
  FloatValue,
  IntValue,
  ObjectValue,
  StringValue,
} from "@impower/sparkdown/src/runtime/Value";
import type { Game } from "../../../core/classes/Game";
import type { BeatSpeech, Instructions } from "../../../core/types/Instructions";
import type { ScriptLocation } from "../../../core/types/ScriptLocation";
import { EventMessage } from "../../../core/classes/messages/EventMessage";
import { SUPERSEDED } from "../../../core/classes/Connection";
import { Module } from "../../../core/classes/Module";
import type { Event } from "../../../core/types/Event";
import {
  TEXT_REASONS,
  type TextClearReason,
  type TextReason,
  type TextWriteReason,
} from "../types/TextReason";
import type { EventMap } from "../../../core/types/EventMap";
import type {
CutsceneInstruction,
ImageInstruction,
LayoutInstruction,
TextInstruction,
WithInstruction,
} from "../../../core/types/Instruction";
import type { StoryEnding } from "@impower/sparkdown/src/program/ProgramStory";
import { endingStatusText } from "../../../core/utils/endingStatusText";
import { getAllProperties } from "../../../core/utils/getAllProperties";
import { getTimeValue } from "../../../core/utils/getTimeValue";
import { BEAT_LEAD_MS } from "../../../core/utils/sharedClock";
import type { Animation } from "../types/Animation";
import { keyframeScale } from "../utils/keyframeScale";
import type { AnimationTiming } from "../types/AnimationTiming";
import type { Ease } from "../types/Ease";
import type { ElementContent } from "../types/ElementContent";
import type { ElementState } from "../types/ElementState";
import type { Image } from "../types/Image";
import type { ImageState } from "../types/ImageState";
import {
  PAGE_ENTRY_KINDS,
  type PageEntry,
  type PageRecord,
  type PageState,
} from "../types/PageState";
import type { StreamEntry, StreamState } from "../types/StreamState";
import type { CastEntry, CastLine, CastState } from "../types/CastState";
import type { TextState } from "../types/TextState";
import type { UIBuiltins } from "../types/UIBuiltins";
import builtinBreakpoints from "../builtinBreakpoints.json";
import {
  identName,
  parseComponentValues,
  significant,
  splitAt,
  tokenOf,
  TokenType,
} from "../../../../../../sparkle-style-transformer/src/utils/cssSyntax";
import { escapeCssIdentifier } from "../../../../../../sparkle-style-transformer/src/utils/themeVariableName";
import { getImageOwner } from "@impower/sparkdown/src/compiler/utils/getImageOwner";
import { bodyChildLists } from "../utils/bodyChildren";
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
  LayoutMotionMessage,
  type LayoutMotionMessageMap,
} from "./messages/LayoutMotionMessage";
import {
  PresenceElementsMessage,
  type PresenceElementsMessageMap,
  type PresenceMotion,
} from "./messages/PresenceElementsMessage";
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
  COLOR_SCHEME_SETTINGS,
  type ColorSchemeSetting,
} from "../../../core/classes/messages/SetSimulatedColorSchemeMessage";
import {
  ShowingMessage,
  type ShowingMessageMap,
} from "./messages/ShowingMessage";
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
  type MorphPictureStill,
  type MorphLayerPlay,
  type MorphPicture,
  type LayeredPicture,
  type MorphPlay,
  type PictureFraming,
  type PictureTravel,
  type WriteImageInstruction,
  WriteImageMessage,
  type WriteImageMessageMap,
  type WriteImageParams,
} from "./messages/WriteImageMessage";
import {
  WriteTextMessage,
  type WriteTextMessageMap,
  type WriteTextParams,
} from "./messages/WriteTextMessage";
import { SpeechMessage, type SpeechMessageMap } from "./messages/SpeechMessage";

function pictureFileName(file: { src: string; uri?: string; name?: string }): string {
  const path = file.uri ?? file.src;
  const leaf = path.slice(path.lastIndexOf("/") + 1).split(/[?#]/)[0] ?? "";
  const name = file.name ?? "";
  try {
    return decodeURIComponent(leaf) || name;
  } catch {
    return leaf || name;
  }
}

function isVectorFile(layer: ImageLayer): boolean {
  const ext = typeof layer.struct?.ext === "string" ? layer.struct.ext.toLowerCase() : "";
  return ext === "svg" || /^data:image\/svg\+xml/i.test(layer.src) || [layer.uri ?? "", layer.src].some((path) => /\.svg(?:[?#]|$)/i.test(path));
}

function isPictureFile(layer: ImageLayer): boolean {
  return layer.struct?.$type === "image" || (layer.struct?.$type === "filtered_image" && isVectorFile(layer));
}

function isImageFile(layer: ImageLayer): boolean {
  return layer.struct?.$type === "image" && !isVectorFile(layer);
}

function marksClear(node: ElementNode): boolean {
  const clear = node.props["clear"];
  return clear?.kind === "literal" && clear.value === true;
}

function nodeShape(
  node: BodyNode,
  components: Readonly<Record<string, ComponentNode | undefined>>,
  calls: readonly string[],
): unknown {
  if (node.kind === "element" && isTemplated(node)) {
    return [node.kind, node.tag, node.classes];
  }
  const head = node.kind === "element" ? [node.tag, node.classes, marksClear(node)] : ["name" in node ? (node.name ?? null) : null];
  const lists = bodyChildLists(node).map(([suffix, children]) => [
    suffix,
    (children ?? []).map((child) => nodeShape(child, components, calls)),
  ]);
  const comp = node.kind === "element" ? components[node.tag] : undefined;
  const body =
    comp && !calls.includes(comp.name)
      ? comp.children.map((child) => nodeShape(child, components, [...calls, comp.name]))
      : null;
  return [node.kind, ...head, lists, body];
}

function callBase(base: string, path: string, component: string): string {
  return `${base}${path}>${component}`;
}

function bodyShape(
  nodes: readonly BodyNode[] | undefined,
  components: Readonly<Record<string, ComponentNode | undefined>>,
): string {
  return JSON.stringify((nodes ?? []).map((node) => nodeShape(node, components, [])));
}

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

type ImagePick = string | ((layer: ImageLayer) => string | undefined);

interface PictureView {
  framing?: PictureFraming;
  picture: boolean;
  travelStart?: number;
  show?: ImageInstruction;
}

interface ShownPicture {
  asset: string;
  pick?: ImagePick;
}

interface LayoutClauses {
  with?: string;
  after?: number;
  over?: number;
  ease?: string;
  loop?: boolean;
}

interface Retirement {
  name?: string;
  held: Set<string>;
  element: Element;
  epoch: number;
  root: Element | undefined;
  pin?: string;
}

interface PictureExit {
  elements: Element[];
  epoch: number;
}

type ContentKind = "text" | "image";

type LeaveHide = (keepShown: boolean) => void;

interface Leave {
  kind: ContentKind;
  hide: LeaveHide;
  moves: boolean;
}

interface PresenceRecord {
  presence: PresenceMotion;
  leave?: Leave;
  retiring?: Retirement;
}

const PRESENCE_BLOCKS: Record<PresenceMotion, RegExp> = {
  show: /@(?:initial|show)(?![\p{L}\p{N}_-])/u,
  hide: /@hide(?![\p{L}\p{N}_-])/u,
};

const presenceAttributes = (mark: Record<string, string | null>) =>
  Object.keys(mark).length > 0 ? { attributes: mark } : {};

const pictureHide = (
  sequence: ImageInstruction[],
): "plain" | "timed" | undefined => {
  let hide: "plain" | "timed" | undefined;
  for (const e of sequence) {
    if (e.control === "show" && e.assets?.length) {
      hide = undefined;
    } else if (e.control === "hide" && !e.assets?.length) {
      hide = e.with?.length || e.after || e.over ? "timed" : "plain";
    }
  }
  return hide;
};

type MotionPhase = "leave" | "move" | "arrive";

interface OwnedMotion {
  phase: MotionPhase;
  removes?: boolean;
  started?: Promise<unknown>;
  start: () => Promise<unknown>;
  finish: () => void;
  settle: () => void;
}

interface LineWait {
  time: number;
  presenting: boolean;
  composition?: Composition;
  held: IMessage[];
  motions: OwnedMotion[];
  resolve: (time: number | null) => void;
}

const namesLayout = (value: string): boolean =>
  /(^|[\s,])layout([\s,]|$)/.test(value);

const moved = (result: unknown): boolean =>
  result instanceof Set
    ? result.size > 0
    : Array.isArray(result)
      ? result.length > 0
      : false;

interface Composition {
  kind: "display" | "beat";
  line?: LineWait;
  messages: IMessage[];
  realizing: { done: boolean }[];
  afterSent: (() => void)[];
  expected: (string | number)[];
  ending?: boolean;
  time?: number;
  sweep?: boolean;
  source?: ScriptLocation;
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

export interface LineLabels {
  variant?: string;
  speaker?: string;
}

export interface LineText extends LineLabels {
  text: TextState[];
}

export interface OpenLayout {
  name: string;
  screen?: string;
  auto?: true;
}

export interface UIState {
  text?: Record<string, TextState[]>;
  lineText?: Record<string, LineText[]>;
  line?: LineLabels;
  textLine?: number;
  textWritten?: Record<string, number>;
  textCleared?: Record<string, number>;
  pictureCleared?: string[];
  image?: Record<string, ImageState[]>;
  style?: Record<string, Record<string, string | null>>;
  attributes?: Record<string, Record<string, string | null>>;
  layout?: OpenLayout[];
  screensClosed?: string[];
  displayMode?: StartingDisplayMode;
  page?: PageState;
  streams?: Record<string, StreamState>;
  casts?: Record<string, CastState>;
}

const PAGE_COLUMN = "textstream_column";

const PAGE_SCROLLER = "textstream";

const streamKey = (layout: string, index: number) => `${layout}/${index}`;

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
  base?: string;
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

type SlotMap = Map<
  string,
  {
    children: BodyNode[];
    scope: ReactiveScope;
    host?: (region: SlotRegion) => void;
  }
>;

interface ScreenFrame {
  element: Element;
  scope: ReactiveScope;
  hosts: WeakSet<SlotRegion>;
  fallback?: SlotRegion;
}

const ENGINE_PROPS: ReadonlySet<string> = new Set(["clear"]);

const CONTENT_TAGS: ReadonlySet<string> = new Set(["text", "stroke", "image", "mask"]);

const isEmptyContent = (node: BodyNode): boolean =>
  node.kind === "element" &&
  CONTENT_TAGS.has(node.tag) &&
  !node.content?.length &&
  !node.params?.length &&
  !node.children.length &&
  Object.keys(node.props).length === 0;

const isStruct = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const renderedProps = (node: ElementNode) =>
  Object.entries(node.props).filter(([prop]) => !ENGINE_PROPS.has(prop));

interface ReactiveScope {
  env: ReactiveEnv;
  texts: ReactiveText[];
  regions: ReactiveRegion[];
  attrs: ReactiveAttr[];
  styles: ReactiveStyle[];
  sliderFills: ReactiveSliderFill[];
  streams: MountedStream[];
  casts: MountedCast[];
  slots?: SlotMap;
  base?: string;
}

interface StreamEntryView {
  group: ReactiveGroup;
  scope: ReactiveScope;
}

interface Presented {
  time?: number;
  complete: boolean;
}

interface PresentedText extends Presented {
  sequence: TextInstruction[];
  shown: number;
  current: TextInstruction[];
  currentShown: number;
  line?: LineLabels;
}

interface CastEntryView {
  group: ReactiveGroup;
  scope: ReactiveScope;
  written: Map<string, string>;
  marks: string;
}

interface MountedCast {
  key: string;
  element: Element;
  node: StreamNode;
  scope: ReactiveScope;
  views: Map<number, CastEntryView>;
}

interface CastWrite {
  key: string;
  only?: "marked" | "unmarked";
  id: number;
  kind: "image" | "text";
  target: string;
  image?: ImageInstruction[] | null;
  text?: TextInstruction[] | null;
  view?: PictureView;
  exits?: boolean;
  shown?: number;
}

interface MountedStream {
  key: string;
  element: Element;
  node: StreamNode;
  scope: ReactiveScope;
  entries: StreamEntryView[];
  rendered: string[];
  latest?: StreamEntryView;
}

export const INPUT_WIDGETS: Record<
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

const SHOWING_CONDITION =
  /@showing\(\s*([_\p{L}][\p{L}\p{N}_-]*(?:@[\p{L}\p{N}_][\p{L}\p{N}_-]*)*)\s*\)/gu;

const LINE_CONDITION = /@(variant|speaker)\(/gu;

export const UNKNOWN_COLOR_SCHEME_MESSAGE =
  "ui.color_scheme must be system, light or dark. Using system.";

export type UIMessageMap = AnimateElementsMessageMap &
  BatchElementsMessageMap &
  BeatMessageMap &
  BeginReconcileMessageMap &
  CreateElementMessageMap &
  DestroyElementMessageMap &
  MoveElementMessageMap &
  ObserveElementMessageMap &
  PlayCutsceneMessageMap &
  PresenceElementsMessageMap &
  LayoutMotionMessageMap &
  SetThemeMessageMap &
  ShowingMessageMap &
  SkipCutsceneMessageMap &
  SpeechMessageMap &
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

  protected _pendingOpens = new Map<
    string,
    Set<{ cancelled: boolean; cancel: () => void }>
  >();

  protected _retiring = new Set<Retirement>();

  protected _exits = new Set<PictureExit>();

  protected _exitReports = new WeakMap<IMessage, Promise<unknown>>();

  protected _motion = false;

  protected _still = false;

  protected _contents = new WeakMap<Element, Set<ContentKind>>();

  protected _slots = new WeakMap<Element, Element[]>();

  protected _presence = new Map<Element, PresenceRecord>();

  protected _leaving = new Map<Element, Leave>();

  protected _leavingScheduled = false;

  protected _line?: LineWait;

  protected _layoutStyles?: { styles: unknown; layout: boolean };

  protected _inlineLayout = false;

  protected _lineRemovals = false;

  protected _lineTimed = new WeakSet<IMessage>();

  protected _presenceStyles?: {
    styles: unknown;
    blocks: Record<PresenceMotion, boolean>;
  };

  protected _realizationChange?: { promise: Promise<void>; resolve: () => void };

  protected _events: Partial<
    Record<string, Record<string, (event: Event) => void>>
  > = {};

  protected _clearOnContinue: Set<string> = new Set();

  protected _keptThroughConnect: string[] = [];

  protected _contentSlots: Set<string> = new Set();

  protected _slotPaths: Set<string> = new Set();

  protected _clearPaths: Map<string, string[]> = new Map();

  protected _unmarkedKeys: Set<string> = new Set();

  protected _nodePaths = new WeakMap<object, string>();

  protected _elementPaths = new WeakMap<Element, string>();

  protected _roots: Map<string, string> = new Map();

  protected _showingStyles?: unknown;

  protected _showingWatched: ReadonlySet<string> = new Set();

  protected _showingSent?: Map<string, number>;

  protected _showingHidden = new WeakSet<Element>();

  protected _showingContent = new WeakSet<Element>();

  protected _lineWatched: ReadonlySet<string> = new Set();

  protected _lineSent?: string;

  protected _limits = new WeakMap<Element, LineLabels>();

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

  protected _reconcileLayouts = false;

  protected _standing?: StandingScreen;

  protected _clearedPictures?: Record<string, ImageState[]>;

  protected _uiOps = 0;

  protected _standingOps?: number;

  constructor(game: Game) {
    super(game);
    this.initLayouts();
  }

  override onProgramUpdate(): void {
    this.initLayouts();
  }

  override onStart(): void {
    this._refreshAll = true;
    this.page.started();
    this.casts.forget();
    this.casts.started();
    this.streams.started();
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

  protected get breakpoints(): Record<string, number> {
    return this.context.config?.ui?.breakpoints ?? builtinBreakpoints;
  }

  override getStored(): string[] {
    return [];
  }

  override onReset() {
    this.settleLine();
    this._exits.clear();
    this._inlineLayout = false;
    this._events = {};
    this._mountedLayouts = new Map();
    this._mountedScreens = new Map();
    this._morphEpoch += 1;
    this._clearedPictures = undefined;
  }

  override async onLoad() {
    this._morphEpoch += 1;
    this._clearedPictures = undefined;
    this.page.loaded();
    this.streams.loaded();
    this.casts.loaded();
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
    return this.image.clearMarked(targets);
  }

  override onRestart() {
    this._morphEpoch += 1;
  }

  forgetDisplayedImages() {
    delete this._state.image;
  }

  protected reconcileRoutedLayouts(): void {
    if (!this._reconcileLayouts) {
      return;
    }
    this._reconcileLayouts = false;
    const edits = this._screenEdits;
    const open = new Set((this._state.layout ?? []).map((s) => s.name));
    for (const name of [...this._mountedLayouts.keys()]) {
      if (!UIModule.MANAGED_LAYOUTS.has(name) && !open.has(name)) {
        void this.closeLayout(name, undefined, true, true);
      }
    }
    const missing = [...open].filter((name) => !this._mountedLayouts.has(name));
    if (missing.length > 0) {
      const epoch = this._game.connection.epoch;
      const presentation = this._presentation;
      const mounted = this.applyLayoutInstructions(
        missing.map((name) => ({ control: LayoutVerb.open, name, auto: true })),
        true,
      );
      void mounted.then(() => {
        if (!this.superseded(epoch) && this.isCurrentPresentation(presentation)) {
          void Promise.all(this.restoreTexts());
        }
      });
    }
    this._screenEdits = edits;
  }

  sweepReconcile() {
    this.reconcileRoutedLayouts();
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
    names.push(...this.casts.pictureNames());
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
    this.setMotion(false);
    this._presentation += 1;
    this._standing = undefined;
    this._building = undefined;
    this._restoredEdits = undefined;
    const previewing = this.context?.system?.previewing;
    if (previewing != null && previewing !== false) {
      this.beginCompose("display");
    }
    this._reconcileLayouts = true;
    const transient = this.getTransientTargets();
    const holding = standing?.holding ?? { text: transient, image: transient };
    const c = this._compose;
    const heldText = this.savedElements({ text: holding.text, image: [] });
    if (c && standing) {
      const held = this.savedElements(holding);
      const emptyOf = (holds: (target: string) => boolean) =>
        new Set(
          transient
            .filter((t) => !holds(t))
            .flatMap((t) => this.textElements(t))
            .filter((el) => !held.has(el)),
        );
      c.empty = {
        text: emptyOf((t) => this.holdsSaved(t, heldText)),
        image: emptyOf((t) => holding.image.includes(t)),
      };
    }
    this.flushUIBatch();
    this.emit(BeginReconcileMessage.type.notification({ content: true }));
    this._game.story.variablesState.takeReactiveChanges();
    await Promise.all([
      this.text.change(
        "redisplay",
        transient.filter((t) => this.holdsSaved(t, heldText)),
      ),
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
    this._showingSent = undefined;
    this._lineSent = undefined;
    this.forgetPresence();
    this._standing = undefined;
    this._restoredEdits = undefined;
    this._reconcileLayouts = false;
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
    this._exits.clear();
    const epoch = this._game.connection.epoch;
    const themeVariables = this.getThemeVariables();
    this.loadTheme(themeVariables);
    this._root = undefined;
    this.page.forget();
    this.streams.forget();
    this.casts.unmount();
    this._root = this.getOrCreateRootElement();
    this._events = {};
    this._reactive = true;
    this.constructStyles(themeVariables);
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
    const kept = this._keptThroughConnect;
    this._keptThroughConnect = [];
    const transientTargets = this.getTransientTargets().filter(
      (target) => !kept.includes(target),
    );
    const saved = this.savedElements();
    const emptySlots = [...this._contentSlots].filter(
      (target) => !this.holdsSaved(target, saved),
    );
    await Promise.all([
      this.text.change("connect reset", transientTargets),
      this.text.change("unwritten slot", emptySlots),
      this.clearTransientPictures(transientTargets),
      this.image.clearAll(emptySlots.filter((target) => !this._clearOnContinue.has(target))),
    ]);
  }

  override async onRestore() {
    const epoch = this._game.connection.epoch;
    if (this._state.layout && this._reactive) {
      let remounted = false;
      for (const { name, auto } of this._state.layout) {
        if (
          name &&
          !UIModule.MANAGED_LAYOUTS.has(name) &&
          !this._mountedLayouts.has(name) &&
          !(auto && this._reconcileLayouts)
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
            this.hideUnwrittenTargets(this.constructLayoutFromAst(layout));
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
    this.text.settle();
    const tasks: Promise<void>[] = [...this.restoreTexts()];
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
    this.page.restore();
    this.streams.restore();
    this.casts.restore();
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
    this.noteShowing();
    this.noteLine();
    if (this._uiBatch.length === 0) {
      return;
    }
    const messages = this._uiBatch;
    this._uiBatch = [];
    this.emit(BatchElementsMessage.type.notification({ messages }));
  }

  protected showingWatched(): ReadonlySet<string> {
    const styles = this.context?.style;
    if (styles !== this._showingStyles) {
      this._showingStyles = styles;
      const watched = new Set<string>();
      const lineWatched = new Set<string>();
      const scan = (value: unknown) => {
        if (!value || typeof value !== "object") {
          return;
        }
        for (const [key, inner] of Object.entries(value)) {
          for (const match of key.matchAll(SHOWING_CONDITION)) {
            watched.add(match[1]!);
          }
          for (const match of key.matchAll(LINE_CONDITION)) {
            lineWatched.add(match[1]!);
          }
          scan(inner);
        }
      };
      scan(styles);
      this._showingWatched = watched;
      this._lineWatched = lineWatched;
    }
    return this._showingWatched;
  }

  protected lineWatched(): ReadonlySet<string> {
    this.showingWatched();
    return this._lineWatched;
  }

  line(instructions: Instructions): void {
    const targets = Object.keys(instructions.text ?? {});
    if (!targets.some((target) => !instructions.choices?.includes(target))) {
      return;
    }
    const line: LineLabels = {};
    if (instructions.variant) line.variant = instructions.variant;
    if (instructions.speaker?.character) line.speaker = instructions.speaker.character;
    if (line.variant || line.speaker) {
      this._state.line = line;
    } else {
      delete this._state.line;
    }
  }

  protected limit(element: Element, props: Record<string, unknown>): void {
    const labels: LineLabels = {};
    for (const key of ["variant", "speaker"] as const) {
      const value = props[key];
      if (value != null && value !== "") labels[key] = String(value);
    }
    if (labels.variant || labels.speaker) {
      this._limits.set(element, labels);
    }
  }

  protected relimit(element: Element, attribute: string, value: string | null): void {
    for (const key of ["variant", "speaker"] as const) {
      if (attribute === toDataAttributeName(key)) {
        const labels: LineLabels = { ...this._limits.get(element) };
        if (value) {
          labels[key] = value;
        } else {
          delete labels[key];
        }
        if (labels.variant || labels.speaker) {
          this._limits.set(element, labels);
        } else {
          this._limits.delete(element);
        }
      }
    }
  }

  protected admits(element: Element, line: LineLabels | undefined): boolean {
    const limit = this._limits.get(element);
    return (
      !limit ||
      ((!limit.variant || limit.variant === line?.variant) &&
        (!limit.speaker || limit.speaker === line?.speaker))
    );
  }

  protected limited(element: Element): boolean {
    return this._limits.has(element);
  }

  protected textFor(target: string, element: Element): TextState[] | undefined {
    if (!this.limited(element)) {
      return ownEntry(this._state.text, target);
    }
    const admitted = (ownEntry(this._state.lineText, target) ?? []).filter((written) =>
      this.admits(element, written),
    );
    return admitted.length > 0 ? admitted.flatMap((written) => written.text) : undefined;
  }

  protected noteLine(): void {
    if (this._game.replaying || this.context?.system?.simulating) {
      return;
    }
    const watched = this.lineWatched();
    if (watched.size === 0 && this._lineSent === undefined) {
      return;
    }
    const line = this._state.line;
    const marks: LineLabels = {};
    if (watched.has("variant") && line?.variant) marks.variant = line.variant;
    if (watched.has("speaker") && line?.speaker) marks.speaker = line.speaker;
    const key = JSON.stringify(marks);
    if (key === this._lineSent) {
      return;
    }
    this._lineSent = key;
    this._uiBatch.push(ShowingMessage.type.notification({ changes: {}, line: marks }));
  }

  protected pictureShown(events: ImageState[] | undefined): boolean {
    const picture = events?.findLast((e) => e.assets?.length);
    const layer = events?.findLast(
      (e) => !e.assets?.length && e.control !== "animate",
    );
    return picture?.control === "show" && layer?.control !== "hide";
  }

  showingNames(): string[] {
    return [...this.showingClaims().keys()].sort();
  }

  protected showingClaims(): Map<string, number> {
    const watched = this.showingWatched();
    const claims = new Map<string, number>();
    const claim = (names: Iterable<string>) => {
      for (const name of new Set(names)) {
        if (watched.has(name)) {
          claims.set(name, (claims.get(name) ?? 0) + 1);
        }
      }
    };
    claim([
      ...this._mountedLayouts.keys(),
      ...(this._root ? this.heldNames(this._root) : []),
    ]);
    for (const retiring of this._retiring) {
      claim(retiring.name ? [retiring.name, ...retiring.held] : [...retiring.held]);
    }
    return claims;
  }

  protected heldNames(root: Element): Set<string> {
    const held = new Set<string>();
    const written = new Set<Element>();
    const writeElement = (el: Element, leaves: ("text" | "stroke" | "image" | "mask")[]) => {
      written.add(el);
      for (const leaf of leaves) {
        for (const child of this.getContentElements(el, leaf)) {
          written.add(child);
        }
      }
    };
    const write = (elements: Element[], leaves: ("text" | "stroke" | "image" | "mask")[]) => {
      for (const el of elements) {
        writeElement(el, leaves);
      }
    };
    for (const exit of this._exits) {
      if (this.superseded(exit.epoch)) {
        this._exits.delete(exit);
        continue;
      }
      for (const el of exit.elements) {
        writeElement(el, ["image", "mask"]);
      }
    }
    for (const [target, elements] of this.textRestorePlan()) {
      if (ownEntry(this._state.text, target)?.length) {
        write(elements, ["text", "stroke"]);
      }
    }
    const emptied = new Set(this._state.pictureCleared ?? []);
    for (const [target, events] of Object.entries(this._state.image ?? {})) {
      if (this.pictureShown(events)) {
        write(
          this.textElements(target).filter((el) => !emptied.has(this.elementPath(el) ?? "")),
          ["image", "mask"],
        );
      }
    }
    const visit = (el: Element): boolean => {
      if (this._showingHidden.has(el)) {
        return false;
      }
      let holds = this._showingContent.has(el) || written.has(el);
      for (const child of el.children) {
        if (visit(child)) {
          holds = true;
        }
      }
      const tag = el.name.split(" ")[0];
      if (holds && tag) {
        held.add(tag);
      }
      return holds;
    };
    visit(root);
    return held;
  }

  protected noteHidden(element: Element, hidden: boolean): void {
    if (hidden) {
      this._showingHidden.add(element);
    } else {
      this._showingHidden.delete(element);
    }
  }

  protected noteElementShowing(
    element: Element,
    state: ElementState | undefined,
  ): void {
    const content = state?.content;
    if (content && "text" in content) {
      if (content.text) {
        this._showingContent.add(element);
      } else {
        this._showingContent.delete(element);
      }
    }
  }

  protected noteShowing(retired = false): void {
    if (this._game.replaying || this.context?.system?.simulating) {
      return;
    }
    const sent = this._showingSent;
    if (this.showingWatched().size === 0 && !sent?.size) {
      return;
    }
    const claims = this.showingClaims();
    const changes: Record<string, number> = {};
    for (const name of [...new Set([...claims.keys(), ...(sent?.keys() ?? [])])].sort()) {
      const change = (claims.get(name) ?? 0) - (sent?.get(name) ?? 0);
      if (change !== 0) {
        changes[name] = change;
      }
    }
    if (sent && Object.keys(changes).length === 0) {
      return;
    }
    this._showingSent = claims;
    this._uiBatch.push(
      ShowingMessage.type.notification({
        changes,
        ...(sent ? {} : { reset: true }),
        ...(retired ? { retired } : {}),
      }),
    );
  }

  protected displayTargetElements(root: Element, target: string): Element[] {
    if (target !== "choice") {
      return [
        ...this.findElements(target, true),
        ...this.writeTargets(
          this.searchForAll(root, target).filter((el) => this.insideCast(el)),
          target,
          true,
        ),
      ];
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
              breakpoints: this.breakpoints,
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
    if (
      open &&
      (open.kind === "display" ||
        !open.ending ||
        (open.line === this._line && open.line?.presenting))
    ) {
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
    const line = this._line;
    if (kind === "beat" && line && !line.composition) {
      line.composition = next;
      next.line = line;
    }
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

  composeSource(source: ScriptLocation | undefined): void {
    if (this._compose && source) {
      this._compose.source = source;
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
    const line = this.lineOf(c);
    if (line) {
      if (this.transitionsLayout()) {
        this.ownLayoutMotion(line, "leave");
      }
      if (!line.motions.some((m) => m.phase === "leave")) {
        this.startPhase(line, "arrive");
      }
    }
    this.sendCompose(c);
  }

  protected sendCompose(c: Composition) {
    if (this._compose === c) {
      this.flushUIBatch();
      this._compose = undefined;
    }
    const line = this.lineOf(c);
    const waits = line != null && line.motions.length > 0;
    void super.emit(
      BeatMessage.type.notification({
        messages: waits
          ? c.messages.flatMap((m) =>
              !line.held.includes(m)
                ? [m]
                : WriteTextMessage.type.isRequest(m as RequestMessage)
                  ? [this.heldWrite(m as RequestMessage<string, WriteTextParams>)]
                  : [],
            )
          : c.messages,
        ...(c.time != null ? { time: c.time } : {}),
        ...(c.sweep ? { sweep: true } : {}),
        ...(c.source
          ? { source: this._game.getDocumentLocation(c.source) }
          : {}),
      }),
    );
    if (c.standing) {
      this._standing = c.standing;
      this._standingOps = this._uiOps;
    }
    this.runAfterSent(c);
    if (waits) {
      void this.playOut(line);
    } else if (line) {
      this.endLine(line, line.time);
    }
  }

  protected heldWrite(
    write: RequestMessage<string, WriteTextParams>,
  ): RequestMessage<string, WriteTextParams> {
    return { ...write, params: { ...write.params, held: true } };
  }

  protected discardCompose() {
    const c = this._compose;
    if (c) {
      if (c.line) {
        this.settleLine(c.line);
      }
      this._compose = undefined;
      this._uiBatch = [];
      this._showingSent = undefined;
      this._lineSent = undefined;
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
      UnobserveElementMessage.type.isNotification(msg as any) ||
      SpeechMessage.type.isNotification(msg as any)
    ) {
      this.captureInto(c, msg);
      return { result: undefined };
    }
    if (
      WriteTextMessage.type.isRequest(msg as any) ||
      WriteImageMessage.type.isRequest(msg as any)
    ) {
      this.captureInto(c, msg);
      if (params.reportsExit) {
        c.expected.push((msg as RequestMessage).id);
        this._exitReports.set(msg, this._game.connection.expect(msg as RequestMessage));
      }
      return { result: params.target };
    }
    if (
      AnimateElementsMessage.type.isRequest(msg as any) ||
      PresenceElementsMessage.type.isRequest(msg as any) ||
      LayoutMotionMessage.type.isRequest(msg as any)
    ) {
      c.messages.push(structuredClone(msg));
      c.expected.push((msg as RequestMessage).id);
      return {
        result: this._game.connection.expect(msg as RequestMessage),
      };
    }
    return undefined;
  }

  protected captureInto(c: Composition, msg: IMessage): void {
    const captured = structuredClone(msg);
    c.messages.push(captured);
    if (c.line && this._lineTimed.has(msg)) {
      c.line.held.push(captured);
    }
  }

  protected onLine<T extends IMessage>(msg: T, timed: boolean): T {
    if (timed) {
      this._lineTimed.add(msg);
    }
    return msg;
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
    this.noteLayoutStyle(style);
    const attributes = state?.attributes;
    const breakpoints = this.breakpoints;
    const el = new Element(parent, id, type, name, before);
    this.noteElementShowing(el, state);
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
    const { background, src } = this.withPictureLooks(() => ({
      background: imageAssets
        .map((a) => this.getBackgroundImageFromValue(a))
        .reverse()
        .join(", "),
      src: imageAssets.flatMap((a) => this.getImageSrcsFromValue(a))[0],
    }));
    const el = this.createElement(parent, {
      name: "instance",
      type: "span",
      ...state,
      style: { ...(state?.style || {}), [property]: background },
    });
    if (background) {
      this._showingContent.add(el);
    }
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
    const destroyed = new Set<Element>();
    const collect = (el: Element) => {
      subtree.push(el.id);
      destroyed.add(el);
      if (this.carriesDisplayTarget(el)) {
        this._displayTargetsChanged = true;
      }
      for (const child of el.children) {
        collect(child);
      }
    };
    collect(element);
    if (this._exits.size > 0) {
      this.dropExits((el) => destroyed.has(el));
    }
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
    this.noteLayoutStyle(style);
    const attributes = state?.attributes;
    const breakpoints = this.breakpoints;
    if (this._refreshing) {
      this._screenEdits += 1;
    }
    const empty = this._compose?.empty;
    if (empty) {
      empty.text.delete(element);
      empty.image.delete(element);
    }
    this.noteElementShowing(element, state);
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
    const played = this.emitSettled(
      AnimateElementsMessage.type.request({
        effects: effects.map((e) => ({
          element: e.element.id,
          animations: e.animations,
        })),
      }),
    );
    return played;
  }

  setMotion(motion: boolean, still = false): void {
    if (!motion) {
      this.settleLine();
      this.settlePresence();
    }
    this._motion = motion;
    this._still = still;
  }

  get still(): boolean {
    return this._still;
  }

  beginLine(time: number): Promise<number | null> | undefined {
    this.abandonLine();
    if (!this.context?.system?.composeBeats || !this.moving()) {
      return undefined;
    }
    return new Promise<number | null>((resolve) => {
      this._line = {
        time,
        presenting: true,
        held: [],
        motions: [],
        resolve,
      };
    });
  }

  closeLine(): void {
    const line = this._line;
    if (line) {
      line.presenting = false;
    }
    if (line && !line.composition) {
      this.endLine(line, line.time);
    }
  }

  protected lineOf(c: Composition): LineWait | undefined {
    return c.line && c.line === this._line ? c.line : undefined;
  }

  protected composingLine(): LineWait | undefined {
    const c = this._compose;
    return c ? this.lineOf(c) : undefined;
  }

  protected endLine(line: LineWait, time: number | null): void {
    if (this._line === line) {
      this._line = undefined;
    }
    line.resolve(time);
  }

  protected own(line: LineWait, motion: OwnedMotion): void {
    line.motions.push(motion);
    if (motion.phase === "leave") {
      motion.started = motion.start();
    }
  }

  protected ownLayoutMotion(line: LineWait, phase: MotionPhase): void {
    this.own(line, {
      phase,
      start: () => {
        this.flushUIBatch();
        return this.emitSettled(LayoutMotionMessage.type.request({}));
      },
      finish: () => {},
      settle: () => {
        this.flushUIBatch();
        void this.emitSettled(
          LayoutMotionMessage.type.request({ settle: true }),
        );
      },
    });
  }

  protected noteLayoutStyle(
    style: Record<string, unknown> | null | undefined,
  ): void {
    if (this._inlineLayout || !style) {
      return;
    }
    for (const [key, value] of Object.entries(style)) {
      if (
        key.includes("transition") &&
        typeof value === "string" &&
        namesLayout(value)
      ) {
        this._inlineLayout = true;
        return;
      }
    }
  }

  protected transitionsLayout(): boolean {
    if (this._inlineLayout) {
      return true;
    }
    const styles = this.context?.style;
    let cached = this._layoutStyles;
    if (!cached || cached.styles !== styles) {
      let layout = false;
      const visit = (value: unknown, key: string) => {
        if (layout) {
          return;
        }
        if (typeof value === "string") {
          layout = key.includes("transition") && namesLayout(value);
          return;
        }
        if (value != null && typeof value === "object") {
          for (const [inner, child] of Object.entries(value)) {
            visit(child, inner);
          }
        }
      };
      visit(styles, "");
      cached = { styles, layout };
      this._layoutStyles = cached;
    }
    return cached.layout;
  }

  protected startPhase(line: LineWait, phase: MotionPhase): OwnedMotion[] {
    const due = line.motions.filter((m) => m.phase === phase);
    for (const motion of due) {
      motion.started ??= motion.start();
    }
    return due;
  }

  protected settleLine(line = this._line): void {
    if (line && this._line === line) {
      this.endLine(line, null);
      for (const motion of line.motions) {
        motion.settle();
      }
    }
  }

  protected abandonLine(line = this._line): void {
    if (line && this._line === line) {
      this.endLine(line, null);
      for (const motion of line.motions) {
        if (motion.started) {
          void motion.started.then(() => motion.finish());
        } else {
          motion.settle();
        }
      }
    }
  }

  protected dropHeld(line: LineWait): void {
    for (const message of line.held) {
      if ((message as { params?: WriteImageParams }).params?.reportsExit) {
        this._game.connection.cancel((message as RequestMessage).id, {
          code: SUPERSEDED,
          message: "the line that held it was settled",
        });
      }
    }
  }

  protected async playOut(line: LineWait): Promise<void> {
    let anyMoved = false;
    const play = async (phase: MotionPhase) => {
      const due = this.startPhase(line, phase);
      const results = await Promise.all(due.map((m) => m.started));
      if (this._line !== line) {
        this.dropHeld(line);
        return false;
      }
      anyMoved = anyMoved || results.some(moved);
      if (phase !== "leave") {
        for (const motion of due) {
          motion.finish();
        }
      }
      return true;
    };
    if (!(await play("leave"))) {
      return;
    }
    if (line.motions.some((m) => m.removes)) {
      const composed = this.beginCompose();
      this._lineRemovals = true;
      try {
        for (const motion of line.motions) {
          if (motion.phase === "leave") {
            motion.finish();
          }
        }
      } finally {
        this._lineRemovals = false;
      }
      if (this.transitionsLayout()) {
        this.ownLayoutMotion(line, "move");
        this.startPhase(line, "move");
      }
      if (composed) {
        void this.endCompose({
          time: this.context.system.now() + BEAT_LEAD_MS,
        });
      }
      if (!(await play("move"))) {
        return;
      }
    }
    if (!(await play("arrive"))) {
      return;
    }
    const time = anyMoved
      ? this.context.system.now() + BEAT_LEAD_MS
      : line.time;
    const shift = time - line.time;
    for (const message of line.held) {
      const params = (message as { params?: { time?: unknown } }).params;
      if (typeof params?.time === "number") {
        params.time += shift;
      }
    }
    if (shift !== 0) {
      this.text.retime(line.time, time);
      this.streams.retime(line.time, time);
    }
    this.endLine(line, time);
    if (line.held.length > 0) {
      void super.emit(
        BeatMessage.type.notification({ messages: line.held, time }),
      );
    }
  }

  protected moving(): boolean {
    return (
      this._motion &&
      this._reactive &&
      !this._game.replaying &&
      !this.context?.system?.simulating &&
      this.context?.system?.transitions !== false &&
      this._compose?.kind !== "display"
    );
  }

  protected styled(presence: PresenceMotion): boolean {
    const styles = this.context?.style;
    let cached = this._presenceStyles;
    if (!cached || cached.styles !== styles) {
      const blocks: Record<PresenceMotion, boolean> = {
        show: false,
        hide: false,
      };
      const visit = (value: unknown) => {
        if (value == null || typeof value !== "object") {
          return;
        }
        for (const [key, inner] of Object.entries(value)) {
          if (inner == null || typeof inner !== "object") {
            continue;
          }
          for (const motion of ["show", "hide"] as const) {
            if (PRESENCE_BLOCKS[motion].test(key)) {
              blocks[motion] = true;
            }
          }
          visit(inner);
        }
      };
      for (const [name, style] of Object.entries(styles ?? {})) {
        if (!name.startsWith("$")) {
          visit(style);
        }
      }
      cached = { styles, blocks };
      this._presenceStyles = cached;
    }
    return cached.blocks[presence];
  }

  protected attached(element: Element): boolean {
    let node = element;
    while (node.parent) {
      if (!node.parent.children.includes(node)) {
        return false;
      }
      node = node.parent;
    }
    return node === this._root;
  }

  protected contentsOf(element: Element): Set<ContentKind> {
    let contents = this._contents.get(element);
    if (!contents) {
      contents = new Set();
      this._contents.set(element, contents);
    }
    return contents;
  }

  protected arrives(element: Element, kind: ContentKind, moving: boolean): boolean {
    const contents = this.contentsOf(element);
    const pending = this._leaving.get(element);
    this._leaving.delete(element);
    const outgoing = pending ?? this._presence.get(element)?.leave;
    if (outgoing && outgoing.kind !== kind) {
      outgoing.hide(true);
    }
    const shown = Boolean(pending) || contents.size > 0;
    contents.add(kind);
    return !shown && moving && this.styled("show");
  }

  protected leaves(element: Element, kind: ContentKind, hide: LeaveHide): boolean {
    const departing =
      this._leaving.get(element) ?? this._presence.get(element)?.leave;
    if (this.moving() && departing) {
      if (this.contentsOf(element).delete(kind) && departing.kind !== kind) {
        const first = departing.hide;
        departing.hide = (keepShown) => {
          hide(true);
          first(keepShown);
        };
      }
      return true;
    }
    const contents = this.contentsOf(element);
    if (!contents.delete(kind) || contents.size > 0 || !this.moving()) {
      return false;
    }
    const moves = this.styled("hide");
    if (!moves && !this.styled("show")) {
      return false;
    }
    this._leaving.set(element, { kind, hide, moves });
    if (!this._leavingScheduled) {
      this._leavingScheduled = true;
      queueMicrotask(() => this.startLeaving());
    }
    return true;
  }

  protected startLeaving(): void {
    this._leavingScheduled = false;
    const leaving = new Map<Element, Leave>();
    for (const [element, leave] of this._leaving) {
      if (leave.moves) {
        leaving.set(element, leave);
      } else if (this.attached(element)) {
        this._presence.delete(element);
        leave.hide(false);
      }
    }
    this._leaving.clear();
    if (leaving.size === 0) {
      return;
    }
    void this.present([...leaving.keys()], "hide", (element) => ({
      leave: leaving.get(element),
    })).then((ended) => {
      for (const [element, leave] of leaving) {
        if (ended.has(element) && this.attached(element)) {
          leave.hide(false);
        }
      }
    });
  }

  protected settlePresence(): void {
    const leaving = [...this._leaving];
    this._leaving.clear();
    const motions = [...this._presence];
    this._presence.clear();
    for (const [element, leave] of leaving) {
      if (this.attached(element)) {
        leave.hide(false);
      }
    }
    for (const [element, motion] of motions) {
      this.settleElement(element, motion);
    }
  }

  protected settleElement(element: Element, motion: PresenceRecord): void {
    if (this._presence.get(element) === motion) {
      this._presence.delete(element);
    }
    if (motion.retiring) {
      this.retire(motion.retiring);
    } else if (!this.attached(element)) {
      return;
    } else if (motion.leave) {
      motion.leave.hide(false);
    } else {
      this.updateElement(element, {
        attributes: { [PRESENCE_ATTRIBUTE]: null },
      });
    }
  }

  protected presenceMark(
    element: Element,
    arrives: boolean,
  ): Record<string, string | null> {
    this._leaving.delete(element);
    if (arrives) {
      this._presence.delete(element);
      return { [PRESENCE_ATTRIBUTE]: "initial" };
    }
    if (this._presence.get(element)?.presence === "hide") {
      this._presence.delete(element);
      return { [PRESENCE_ATTRIBUTE]: null };
    }
    return {};
  }

  protected settleMark(element: Element): Record<string, string | null> {
    this._leaving.delete(element);
    return this._presence.delete(element) ? { [PRESENCE_ATTRIBUTE]: null } : {};
  }

  protected present(
    elements: Element[],
    presence: PresenceMotion,
    record?: (element: Element) => Omit<PresenceRecord, "presence">,
  ): Promise<Set<Element>> {
    const motions = new Map<Element, PresenceRecord>();
    for (const element of elements) {
      const motion = { presence, ...record?.(element) };
      motions.set(element, motion);
      this._presence.set(element, motion);
    }
    const line = this.composingLine();
    if (!line) {
      return this.emitPresence(elements, presence, motions);
    }
    let done = false;
    const end = () => {
      if (done) {
        return;
      }
      done = true;
      for (const [element, motion] of motions) {
        if (this._presence.get(element) === motion) {
          this.settleElement(element, motion);
        }
      }
    };
    if (presence === "show") {
      return new Promise((resolve) => {
        this.own(line, {
          phase: "arrive",
          start: () => this.emitPresence(elements, presence, motions),
          finish: () => {
            done = true;
            resolve(new Set(elements));
          },
          settle: () => {
            end();
            resolve(new Set());
          },
        });
      });
    }
    this.own(line, {
      phase: "leave",
      removes: true,
      start: () =>
        this.emitPresence(elements, presence, motions).then((ended) => {
          for (const element of ended) {
            this._presence.set(element, motions.get(element)!);
          }
          return ended;
        }),
      finish: end,
      settle: end,
    });
    return Promise.resolve(new Set());
  }

  protected emitPresence(
    elements: Element[],
    presence: PresenceMotion,
    motions: Map<Element, PresenceRecord>,
  ): Promise<Set<Element>> {
    this.flushUIBatch();
    return this.emitSettled(
      PresenceElementsMessage.type.request({
        effects: elements.map((element) => ({
          element: element.id,
          presence,
        })),
      }),
    ).then(() => {
      const ended = new Set<Element>();
      for (const [element, motion] of motions) {
        if (this._presence.get(element) === motion) {
          this._presence.delete(element);
          ended.add(element);
        }
      }
      return ended;
    });
  }

  protected arrive(elements: Element[]): void {
    if (elements.length === 0) {
      return;
    }
    for (const element of elements) {
      this.updateElement(element, {
        attributes: this.presenceMark(element, true),
      });
    }
    void this.present(elements, "show");
  }

  protected retireElement(element: Element, name?: string, pin?: string): void {
    const retiring: Retirement = {
      ...(name ? { name } : {}),
      held: this.heldNames(element),
      element,
      epoch: this._game.connection.epoch,
      root: this._root,
      ...(pin ? { pin } : {}),
    };
    element.remove();
    this._retiring.add(retiring);
    const owned = this.composingLine() != null;
    const ended = this.present([element], "hide", () => ({ retiring }));
    if (!owned) {
      void ended.then(() => this.retire(retiring));
    }
  }

  protected forgetPresence(): void {
    this.settleLine();
    this._motion = false;
    this._presence.clear();
    this._leaving.clear();
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
      this.noteHidden(targetEl, false);
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
      this.noteHidden(targetEl, true);
      this.updateElement(targetEl, {
        style: { display: "none" },
      });
    }
  }

  markFocused(targets: string[], index: number | null): void {
    if (this.context?.system?.simulating) {
      return;
    }
    targets.forEach((target, i) => {
      for (const el of this.findElements(target)) {
        this.updateElement(el, {
          attributes: { "data-focused": i === index ? "" : null },
        });
      }
    });
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

  getAnimationShorthand(name: string, timing: AnimationTiming | undefined) {
    const time = (value: number | string | undefined) =>
      typeof value === "number" || (typeof value === "string" && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value))
        ? `${value}s`
        : value || "0s";
    const easing = timing?.easing;
    const ease = easing ? this.context?.ease?.[easing] : undefined;
    const iterations = timing?.iterations;
    const fill = timing?.fill;
    return [
      time(timing?.duration),
      (ease && !easing!.startsWith("$") ? this.getTimingFunction(ease) : easing) || "ease",
      time(timing?.delay),
      iterations === Infinity ? "infinite" : (iterations?.toString() ?? "1"),
      timing?.direction || "normal",
      !fill || fill === "auto" ? "none" : fill,
      "running",
      escapeCssIdentifier(name),
    ].join(" ");
  }

  getImageAssets(type: string, name: string, poseOf?: (recipe: MorphRecipe) => Record<string, string>, pick?: ImagePick, from?: ShownPicture): Image[] {
    const imageName = sortFilteredName(name);
    const look = this.pictureLook(type, name, pick, from);
    const layers = !look
      ? []
      : !poseOf || poseOf === morphRestPose
        ? look.rest
        : poseOf === this.morphStartPose
          ? look.start!
          : shownImageLayers(this.context, this._game.program?.morphs, look.struct, poseOf, pick);
    return layers.map((layer) => ({ $type: "image", $name: imageName, src: layer.src }));
  }

  protected _pictureLooks?: Map<string, PictureLook>;

  protected _pictureLookDepth = 0;

  protected _pickFunctions?: Map<ImagePick, number>;

  beginPictureLooks() {
    if (this._pictureLookDepth++ === 0) {
      this._pictureLooks = new Map();
      this._pickFunctions = new Map();
    }
  }

  endPictureLooks() {
    if (this._pictureLookDepth > 0 && --this._pictureLookDepth === 0) {
      this._pictureLooks = undefined;
      this._pickFunctions = undefined;
    }
  }

  withPictureLooks<T>(resolve: () => T): T {
    this.beginPictureLooks();
    try {
      return resolve();
    } finally {
      this.endPictureLooks();
    }
  }

  protected pickKey(pick: ImagePick | undefined): string | number | null {
    if (pick === undefined) {
      return null;
    }
    if (typeof pick === "string") {
      return pick;
    }
    const functions = this._pickFunctions;
    if (!functions) {
      return -1;
    }
    let id = functions.get(pick);
    if (id === undefined) {
      id = functions.size;
      functions.set(pick, id);
    }
    return id;
  }

  pictureLook(type: string, name: string, pick?: ImagePick, from?: ShownPicture): PictureLook | undefined {
    const imageName = sortFilteredName(name);
    const key = JSON.stringify([type, imageName, this.pickKey(pick), from === undefined ? null : [sortFilteredName(from.asset), this.pickKey(from.pick)]]);
    const cached = this._pictureLooks?.get(key);
    if (cached) {
      return cached;
    }
    const image = resolveImageReference(this.context, { $type: type, $name: imageName });
    if (!image) {
      return undefined;
    }
    const before = from === undefined ? undefined : resolveImageReference(this.context, { $type: "", $name: sortFilteredName(from.asset) });
    const look = resolvePictureLook(this.context, this._game.program?.morphs, image, {
      ...(pick === undefined ? {} : { pick }),
      startPose: this.morphStartPose,
      ...(before ? { from: { struct: before, ...(from!.pick === undefined ? {} : { pick: from!.pick }) } } : {}),
    });
    this._pictureLooks?.set(key, look);
    return look;
  }

  morphStartPose = (recipe: MorphRecipe): Record<string, string> => {
    const timeline = new MorphTimeline(this.morphTiming(recipe.name), () => 0);
    return timeline.at(0).phase === "off" ? morphRestPose(recipe) : morphPoseAt(recipe, timeline.start);
  };

  protected morphTiming(morph: string): MorphTiming {
    const written = this.context.morph?.[morph];
    return {
      ...default_morph().timing,
      ...(written?.timing ?? {}),
      replay: readMorphReplay(written?.replay),
    } as MorphTiming;
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
    const classes = new Set<string>([
      "layouts",
      "main",
      layoutName,
      this.layoutRootName(layoutName),
    ]);
    const propValues: [string, string][] = [];
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
        for (const [key, prop] of Object.entries(n["props"] ?? {})) {
          const value = (prop as Record<string, unknown>)?.["value"];
          if (typeof value === "string") {
            propValues.push([key, value]);
          }
        }
        visit(n["children"]);
        visit(n["templates"]);
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
    const screen = layout?.screen
      ? this._game.program?.sparkle?.screens?.[layout.screen]
      : undefined;
    if (screen?.children?.length) {
      classes.add(this.screenRootName(screen));
      visit(screen.children);
    }
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
    const scan = (value: unknown, depth: number, key: string) => {
      if (depth > 8 || value == null) {
        return;
      }
      if (typeof value === "string") {
        const fontKey = key.includes("font");
        if (fontKey && fonts[value] && !value.startsWith("$")) {
          referenced.add(value);
          return;
        }
        const named = fontKey ? byFamily.get(value) : undefined;
        if (named) {
          for (const fontName of named) {
            referenced.add(fontName);
          }
          return;
        }
        if (fontKey && value.includes(",")) {
          for (const part of splitAt(parseComponentValues(value), TokenType.Comma)) {
            const nodes = significant(part);
            const only = nodes.length === 1 ? tokenOf(nodes[0]!) : undefined;
            const idents = nodes.map(identName);
            const family =
              only?.[0] === TokenType.String
                ? (only[4] as { value: string }).value
                : nodes.length > 0 && idents.every((name) => name !== undefined)
                  ? idents.join(" ")
                  : part.map(String).join("").trim();
            if (fonts[family] && !family.startsWith("$")) {
              referenced.add(family);
            }
            for (const fontName of byFamily.get(family) ?? []) {
              referenced.add(fontName);
            }
          }
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
      for (const [innerKey, inner] of Object.entries(v)) {
        scan(inner, depth + 1, Array.isArray(v) ? key : innerKey);
      }
    };
    const styles = this.context?.style ?? {};
    for (const cls of classes) {
      const style = (styles as Record<string, unknown>)[cls];
      if (style) {
        scan(style, 0, "");
      }
    }
    for (const [key, value] of propValues) {
      scan(value, 0, key);
    }
    for (const fontName of [...referenced]) {
      for (const sibling of byFamily.get(fonts[fontName]?.font_family ?? "") ?? []) {
        referenced.add(sibling);
      }
    }
    return [...referenced];
  }

  protected _morphEpoch = 0;

  protected _morphChanges = 0;

  protected _colorSchemeReported = false;

  protected _morphConflicts = new Set<string>();

  protected _unknownLayoutVerbs = new Set<string>();

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

  getFraming(name: string | undefined): PictureFraming | undefined {
    const framing = name ? this.context?.framing?.[name] : undefined;
    if (!framing) {
      return undefined;
    }
    const fraction = (value: string | number | undefined) => {
      const parsed = typeof value === "string" && value.trim().endsWith("%") ? Number.parseFloat(value) / 100 : Number.NaN;
      return Number.isFinite(parsed) ? parsed : 0.5;
    };
    const x = fraction(framing.x);
    const y = fraction(framing.y);
    const zoom = typeof framing.zoom === "number" && framing.zoom > 0 ? framing.zoom : 1;
    return x === 0.5 && y === 0.5 && zoom === 1 ? undefined : { x, y, zoom };
  }

  imagePick(event: ImageInstruction, asset: string): ImagePick | undefined {
    const context = this.context;
    if (event.speaker === undefined || !context || (asset.at(0) === '"' && asset.at(-1) === '"')) {
      return event.morph;
    }
    const imageName = sortFilteredName(asset);
    const speaker = event.speaker || undefined;
    const decide = (layer: ImageLayer) => linePick(context, imageName, layer, event.morph, speaker);
    const picks = this.pictureLook("", asset, decide)?.decisions ?? [];
    if (picks.every((pick) => pick === event.morph)) {
      return event.morph;
    }
    return picks.every((pick) => pick === picks[0]) ? picks[0] : decide;
  }

  protected pictureRoot(asset: string): unknown {
    if (asset.at(0) === '"' && asset.at(-1) === '"') {
      return undefined;
    }
    const image = resolveImageReference(this.context, { $type: "", $name: sortFilteredName(asset) });
    return image ? resolveImageAttributes(this.context, image, { visibility: false }).image : undefined;
  }

  getMorphContent(
    assets: string[],
    pickOf: (asset: string) => ImagePick | undefined,
    shown: readonly ShownPicture[] = [],
  ): MorphImageContent | undefined {
    const channel = this._game.program?.morphs;
    if (!channel || !this.context) {
      return undefined;
    }
    const unpaired = channel.change ? shown.map((before) => ({ before, root: this.pictureRoot(before.asset) })) : [];
    if (unpaired.length > 0) {
      this._morphChanges += 1;
    }
    const froms = assets.map((asset) => {
      const root = unpaired.length > 0 ? this.pictureRoot(asset) : undefined;
      const at = root === undefined ? -1 : unpaired.findIndex((old) => old.root === root);
      return at < 0 ? undefined : unpaired.splice(at, 1)[0]!.before;
    });
    const plays: MorphLayerPlay[] = [];
    const playsOf = (ref: MorphRef, owner: string | undefined): MorphPlay[] => {
      this.deliverMorphArtifact(ref);
      return ref.morphs.map((morph) => {
        const timing = this.morphTiming(morph);
        const changed = ref.recipes?.[morph];
        const motion = changed === undefined ? buildMorphMotion(this.context.morph?.[morph]?.keyframes) : undefined;
        const recipe = changed ?? channel.recipes[morph] ?? "";
        return {
          ref,
          morph,
          timing,
          ...(motion ? { motion } : {}),
          ...(owner ? { owner } : {}),
          definition: hashText(
            `${recipe}\n${JSON.stringify(timing)}${motion ? `\n${JSON.stringify(motion)}` : ""}${changed === undefined ? "" : `\n${this._morphChanges}`}`,
          ),
        };
      });
    };
    const play = (ref: MorphRef, layer: number, owner: string | undefined, picture?: MorphPicture) => {
      for (const each of playsOf(ref, owner)) plays.push({ layer, ...(picture ? { picture } : {}), ...each });
    };
    let next = 0;
    for (const [index, asset] of assets.entries()) {
      const first = next;
      const pick = pickOf(asset);
      const count = cssList(this.getBackgroundImageFromString(asset, undefined, pick)).length;
      next += count;
      if (asset.at(0) === '"' && asset.at(-1) === '"') {
        continue;
      }
      const imageName = sortFilteredName(asset);
      const look = this.pictureLook("", asset, pick, froms[index]);
      if (!look) {
        continue;
      }
      const owner = getImageOwner(this.context, imageName);
      if (look.conflict === "overlap") {
        this.reportMorphConflict(imageName, look.refs);
      }
      if (look.plays) {
        if (count > 0) {
          const files = look.artwork!.files.map((file, index) => {
            const refs = look.files[index]?.refs ?? [];
            if (refs.length > 1) this.reportMorphConflict(file.struct?.$name ?? pictureFileName(file), refs);
            const own = refs.length === 1 ? playsOf(refs[0]!, owner ?? getImageOwner(this.context, file.struct?.$name)) : [];
            const at = own.length && look.rest.length === count ? look.files[index]?.rest : undefined;
            return { src: file.src, name: pictureFileName(file), ...(own.length ? { plays: own } : {}), ...(at === undefined ? {} : { layer: first + at }) };
          });
          play(look.refs[0]!, first, owner ?? getImageOwner(this.context, look.root?.$name), { span: count, files });
        }
        continue;
      }
      if (look.layers.length !== count) {
        continue;
      }
      for (const [offset, layer] of look.layers.entries()) {
        const refs = layer.refs;
        if (refs.length > 1) {
          this.reportMorphConflict(layer.struct?.$name ?? asset, refs);
          continue;
        }
        const ref = refs[0];
        if (ref) {
          play(ref, first + offset, owner ?? getImageOwner(this.context, layer.struct?.$name));
        }
      }
    }
    if (plays.length === 0) {
      return undefined;
    }
    const content: MorphImageContent = { plays, epoch: this._morphEpoch };
    const still: MorphPictureStill[] = [];
    let layer = 0;
    for (const [index, asset] of assets.entries()) {
      const rest = this.getBackgroundImageFromString(asset, undefined, pickOf(asset));
      const span = cssList(rest).length;
      const start = this.getBackgroundImageFromString(asset, this.morphStartPose, pickOf(asset), froms[index]);
      if (start !== rest && (froms[index] !== undefined || cssList(start).length === span)) {
        still.push({ layer, span, image: start });
      }
      layer += span;
    }
    if (still.length) {
      content.still = still;
    }
    return content;
  }

  layeredImageFiles(name: string, pick?: ImagePick): ImageLayer[] | undefined {
    const layers = this.pictureLook("", name, pick)?.rest ?? [];
    return layers.length > 1 && layers.every(isImageFile) ? layers : undefined;
  }

  vectorImageFiles(name: string, pick?: ImagePick): ImageLayer[] | undefined {
    const layers = this.pictureLook("", name, pick)?.rest ?? [];
    return layers.length > 0 && layers.every(isPictureFile) && layers.some(isVectorFile) ? layers : undefined;
  }

  getLayeredPictures(assets: string[], pickOf: (asset: string) => ImagePick | undefined): LayeredPicture[] {
    const pictures: LayeredPicture[] = [];
    let next = 0;
    for (const asset of assets) {
      const first = next;
      const pick = pickOf(asset);
      const count = cssList(this.getBackgroundImageFromString(asset, undefined, pick)).length;
      next += count;
      if (asset.at(0) === '"' && asset.at(-1) === '"') {
        continue;
      }
      const vector = this.vectorImageFiles(asset, pick);
      const layers = vector ?? this.layeredImageFiles(asset, pick);
      if (!layers || layers.length !== count) {
        continue;
      }
      pictures.push({
        layer: first,
        span: count,
        name: sortFilteredName(asset),
        files: layers.map((layer) => ({
          src: layer.src,
          name: pictureFileName({ src: layer.src, ...(layer.uri ? { uri: layer.uri } : {}), name: layer.struct?.$name }),
        })),
        ...(vector ? { vector: true as const } : {}),
      });
    }
    return pictures;
  }

  protected _morphStills = new Set<string>();

  reportMorphStill(params: MorphStillParams) {
    const key = JSON.stringify([params.image, params.file, params.reason, params.declaration ?? "", params.placeholder ?? false]);
    if (this._morphStills.has(key)) {
      return;
    }
    this._morphStills.add(key);
    const why =
      params.reason === "animated"
        ? "is animated, so its layers cannot be drawn together faithfully"
        : params.reason === "profile"
          ? "carries a colour profile wider than sRGB, so its layers cannot be drawn together faithfully"
          : params.reason === "unsized"
            ? "is an SVG with neither a viewBox nor a width and height of its own, so it cannot be fitted to the picture"
            : params.reason === "undrawn"
              ? "is an SVG the browser would not draw at the picture's size"
              : params.reason === "late"
                ? "was not drawn before the line's wait for it ran out"
                : params.reason === "styled"
                  ? `is an SVG whose root is styled with \`${params.declaration ?? "an unknown declaration"}\`, which the player only draws faithfully for colour and stroke properties and a width and height`
                  : "could not be read to check that it is a still sRGB image";
    if (params.placeholder) {
      this._game.log(`\`${params.image}\` is not drawn: its file \`${params.file}\` ${why}. The previews show a placeholder in its place, and an exported game shows nothing there.`, "warning");
      return;
    }
    if (params.reason === "late") {
      this._game.log(`\`${params.image}\` was drawn late: its morph's drawing was not ready before the line's wait for it ran out, so the line showed its still picture until it was.`, "warning");
      return;
    }
    this._game.log(`\`${params.image}\` stays still: its layer file \`${params.file}\` ${why}, and no morph plays on it.`, "warning");
  }

  protected _speaking = false;

  protected _voicedSpeech?: BeatSpeech;

  protected _beatPlaying = false;

  setBeatPlaying(playing: boolean) {
    this._beatPlaying = playing;
  }

  protected showsMovieStill(): boolean {
    const previewing = this.context?.system?.previewing;
    return previewing != null && previewing !== false && !this._beatPlaying;
  }

  speak(speech: BeatSpeech | undefined, instant = false, time?: number) {
    if (this.context?.system?.simulating) {
      return;
    }
    const voiced = Boolean(speech?.voiced) && (!instant || speech === this._voicedSpeech);
    const spans = instant ? [] : (speech?.spans ?? []);
    const beeps = instant ? undefined : speech?.beeps;
    const speaking = voiced || spans.length > 0;
    this._voicedSpeech = voiced ? speech : undefined;
    if (!speaking && !this._speaking) {
      return;
    }
    this._speaking = speaking;
    void this.emit(
      this.onLine(
        SpeechMessage.type.notification({
          ...(speech?.character ? { character: speech.character } : {}),
          spans,
          ...(beeps ? { beeps } : {}),
          ...(voiced ? { voiced: true as const } : {}),
          ...(voiced && instant ? { revealed: true as const } : {}),
          ...(time != null ? { time } : {}),
        }),
        !instant && time != null,
      ),
    );
  }

  protected reportMorphConflict(image: string, refs: MorphRef[]) {
    const names = refs.flatMap((r) => r.morphs).sort();
    const key = `${image}\n${names.join("\n")}`;
    if (this._morphConflicts.has(key)) {
      return;
    }
    this._morphConflicts.add(key);
    const recipes = refs
      .flatMap((ref) =>
        ref.morphs.flatMap((name) => {
          const recipe = parseMorphRecipe(ref.recipes?.[name] ?? this._game.program?.morphs?.recipes[name] ?? "");
          return recipe ? [recipe] : [];
        }),
      )
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const quote = (list: string[]) => list.map((n) => `\`${n}\``).join(", ");
    const shares = morphOverlaps(recipes).map(({ morphs, groups, moved, clips }) => {
      const what = [
        ...(groups.length ? [`${groups.length > 1 ? "groups" : "group"} ${quote(groups)}`] : []),
        ...(moved.length ? [`moved ${moved.length > 1 ? "labels" : "label"} ${quote(moved)}`] : []),
        ...(clips.length ? [`clip ${clips.length > 1 ? "labels" : "label"} ${quote(clips)}`] : []),
      ];
      return `${quote(morphs)} share ${what.join(" and ")}`;
    });
    this._game.log(
      `\`${image}\` stays still: ${quote(names)} play on it, and ${shares.join("; ")}. Morphs play together on one image only where they drive different groups, move different labels and name different clip labels.`,
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

  getImageUrlsFromBackground(background: string): string[] {
    return cssList(background).flatMap((layer) => {
      const url = layer.trim().match(/^url\(\s*(['"]?)(.*?)\1\s*\)$/s)?.[2];
      return url ? [url] : [];
    });
  }

  getBackgroundImageFromString(value: string, poseOf?: (recipe: MorphRecipe) => Record<string, string>, pick?: ImagePick, from?: ShownPicture) {
    if (value.at(0) === '"' && value.at(-1) === '"') {
      const literalStringValue = value.slice(1, -1);
      return this.getBackgroundImageFromLiteral(literalStringValue);
    }
    const named = this.pictureLook("", value, pick, from) !== undefined;
    const posed = named && (poseOf || pick !== undefined) ? this.getImageAssets("", value, poseOf, pick, from).map((asset) => asset.src) : undefined;
    const srcs = posed ?? this.getImageSrcsByName(value);
    if (srcs?.length) {
      return srcs
        .map((src) => this.getUrl(src))
        .reverse()
        .join(", ");
    }
    return named ? "none" : this.getBackgroundImageFromLiteral(value);
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
    return rootLayoutElement.findChild(this.layoutRootName(uiName));
  }

  protected layoutRootName(layoutName: string): string {
    return this._clearOnContinue.has(layoutName) ||
      this.layoutHolds(layoutName, [layoutName])
      ? `layout_${layoutName}`
      : layoutName;
  }

  protected getThemeVariables(): Record<string, string> {
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
    for (const name of Object.keys(this.context?.layered_image ?? {})) {
      const varName = getVarName("image", name);
      if (name.startsWith("$") || Object.hasOwn(variablesStyle, varName)) {
        continue;
      }
      const srcs = this.getImageAssets("image", name).map((asset) => asset.src);
      if (srcs.length) {
        variablesStyle[varName] = srcs.map((src) => this.getUrl(src)).reverse().join(", ");
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
    const animations = this.context?.animation;
    if (animations) {
      for (const [name, animation] of Object.entries(animations)) {
        if (!name.startsWith("$")) {
          variablesStyle[getVarName("animation", name)] =
            this.getAnimationShorthand(name, animation.timing);
        }
      }
    }
    const fonts = this.context?.font;
    if (fonts) {
      for (const [name, font] of Object.entries(fonts)) {
        if (!name.startsWith("$")) {
          const varName = getVarName("font", name);
          const family = font?.font_family;
          const varValue = escapeCssIdentifier(
            typeof family === "string" && family ? family : name,
          );
          if (varValue) {
            variablesStyle[varName] = varValue;
          }
        }
      }
    }
    return variablesStyle;
  }

  constructStyles(variablesStyle: Record<string, string>): void {
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
      ? Object.keys(this.context?.layout || {}).filter(
          (name) => !this.context.layout?.[name]?.["$screen"],
        )
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
      name: this.layoutRootName(structName),
      style: {
        position: "absolute",
        inset: "0",
        display: "flex",
        flex_direction: "column",
      },
    });
    for (const [k, value] of Object.entries(properties)) {
      const fullPath = k.startsWith(".") ? k.split(".").slice(1) : k.split(".");
      const marksClear = fullPath.at(-1) === "$clear";
      const path = marksClear ? fullPath.slice(0, -1) : fullPath;
      const v = marksClear ? {} : value;
      const isValidNode = path.length > 0 && !path.at(-1)?.startsWith("$");
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
    if (this.searchForAll(uiEl, PAGE_COLUMN).length > 0) {
      this.page.mounted();
    }
    return uiEl;
  }

  protected _layoutWork: Set<Promise<void>> = new Set();

  protected _presentation = 0;

  protected _mountedLayouts: Map<
    string,
    {
      element: Element;
      scope: ReactiveScope;
      screen?: string;
      slot?: SlotRegion;
    }
  > = new Map();

  protected _mountedScreens: Map<string, ScreenFrame> = new Map();

  protected _screenHolds: Map<string, number> = new Map();

  static readonly MANAGED_LAYOUTS = new Set(["main", "loading", "ending"]);

  constructLayoutsFromAst(...structNames: string[]): void {
    this._mountedLayouts = new Map();
    this._mountedScreens = new Map();
    const layouts = this._game.program?.sparkle?.layouts;
    if (!layouts) {
      return;
    }
    const vs = this._game.story.variablesState;
    if (this._building) {
      this.watchBuild();
    }
    const targetAllLayouts = !structNames || structNames.length === 0;
    const validLayoutNames = !targetAllLayouts
      ? structNames
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

  protected mountScreenFrame(name: string): ScreenFrame | undefined {
    const mounted = this._mountedScreens.get(name);
    if (mounted) {
      return mounted;
    }
    const screen = this._game.program?.sparkle?.screens?.[name];
    if (!screen?.children?.length) {
      return undefined;
    }
    const element = this.createElement(this.getOrCreateRootLayoutElement(), {
      type: "div",
      name: this.screenRootName(screen),
      style: {
        position: "absolute",
        inset: "0",
        display: "flex",
        flex_direction: "column",
      },
    });
    const scope = this.makeScope({}, undefined, this._roots.get(`screen:${screen.name}`));
    const frame: ScreenFrame = { element, scope, hosts: new WeakSet() };
    scope.slots = new Map([
      [
        "",
        {
          children: [],
          scope,
          host: (region) => {
            frame.hosts.add(region);
          },
        },
      ],
    ]);
    this._mountedScreens.set(name, frame);
    const group = this.mountChildren(element, screen.children, scope, null);
    const fallback: SlotRegion = {
      kind: "slot",
      parent: element,
      content: [],
      siblings: group,
    };
    group.push({ region: fallback });
    scope.regions.push(fallback);
    frame.hosts.add(fallback);
    frame.fallback = fallback;
    this.hideUnwrittenTargets(element);
    return frame;
  }

  protected screenRootName(screen: ScreenNode): string {
    return this._clearOnContinue.has(screen.name) ||
      this.treeHolds(screen.children, new Set([screen.name]))
      ? `screen_${screen.name}`
      : screen.name;
  }

  protected screenHeld(screen: string, except?: string): boolean {
    if ((this._screenHolds.get(screen) ?? 0) > 0) {
      return true;
    }
    for (const [name, entry] of this._mountedLayouts) {
      if (name !== except && entry.screen === screen) {
        return true;
      }
    }
    const layouts = this._game.program?.sparkle?.layouts;
    for (const [name, opens] of this._pendingOpens) {
      if (
        name !== except &&
        opens.size > 0 &&
        layouts?.[name]?.screen === screen
      ) {
        return true;
      }
    }
    return false;
  }

  protected releaseIdleScreen(screen: string): void {
    const frame = this._mountedScreens.get(screen);
    if (frame && !this.screenHeld(screen)) {
      this._mountedScreens.delete(screen);
      this.destroyElement(frame.element);
    }
  }

  protected screenSlot(frame: ScreenFrame): SlotRegion | undefined {
    const find = (scope: ReactiveScope): SlotRegion | undefined => {
      for (const region of scope.regions) {
        let found: SlotRegion | undefined;
        if (region.kind === "slot") {
          found =
            frame.hosts.has(region) && this.regionLive(region, frame.element)
              ? region
              : undefined;
        } else if (region.kind === "for") {
          for (const iteration of region.iterations) {
            found ??= find(iteration.scope);
          }
          if (region.elseScope) {
            found ??= find(region.elseScope);
          }
        } else {
          found = find(region.scope);
        }
        if (found) {
          return found;
        }
      }
      return undefined;
    };
    return find(frame.scope);
  }

  protected regionLive(region: ReactiveRegion, root: Element): boolean {
    for (
      let current: ReactiveRegion | undefined = region;
      current;
      current = current.owner
    ) {
      if (!this.isWithin(current.parent, root)) {
        return false;
      }
      const owner = current.owner;
      if (owner) {
        const groups =
          owner.kind === "for"
            ? [
                ...owner.iterations.map((it) => it.content),
                owner.elseContent ?? [],
              ]
            : [owner.content];
        const held = groups.some((group) =>
          group.some((it) => "region" in it && it.region === current),
        );
        if (!held) {
          return false;
        }
      }
    }
    return true;
  }

  protected isWithin(element: Element, ancestor: Element): boolean {
    for (let node = element; node !== ancestor; ) {
      const parent = node.parent;
      if (!parent || !parent.children.includes(node)) {
        return false;
      }
      node = parent;
    }
    return true;
  }

  protected rehostScreenLayouts(screen: string, frame: ScreenFrame): void {
    const layouts = this._game.program?.sparkle?.layouts;
    const slot = this.screenSlot(frame);
    for (const [name, entry] of [...this._mountedLayouts]) {
      if (entry.screen !== screen) {
        continue;
      }
      const placed = this.isWithin(entry.element, frame.element);
      if (placed && entry.slot === slot) {
        continue;
      }
      if (placed) {
        this.destroyElement(entry.element);
      }
      if (entry.slot) {
        entry.slot.content = entry.slot.content.filter(
          (it) => !("el" in it && it.el === entry.element),
        );
      }
      const layout = layouts?.[name];
      if (layout) {
        const rehosted = this.constructLayoutFromAst(layout);
        this.hideUnwrittenTargets(rehosted);
        this.rewriteRemounted([rehosted]);
      } else {
        this._mountedLayouts.delete(name);
      }
    }
  }

  protected constructLayoutFromAst(layout: LayoutNode): Element {
    const frame = layout.screen
      ? this.mountScreenFrame(layout.screen)
      : undefined;
    const slot = frame ? this.screenSlot(frame) : undefined;
    const parent =
      slot?.parent ?? frame?.element ?? this.getOrCreateRootLayoutElement();
    const uiEl = this.createElement(
      parent,
      {
        type: "div",
        name: this.layoutRootName(layout.name),
        style: frame
          ? slot === frame.fallback
            ? { display: "flex", flex_direction: "column", flex_grow: "1" }
            : { display: "flex", flex_direction: "column" }
          : {
              position: "absolute",
              inset: "0",
              display: "flex",
              flex_direction: "column",
            },
      },
      slot ? this.anchorFor(slot) : null,
    );
    slot?.content.push({ el: uiEl });
    const scope = this.makeScope({}, undefined, this._roots.get(`layout:${layout.name}`));
    this._mountedLayouts.set(layout.name, {
      element: uiEl,
      scope,
      ...(layout.screen ? { screen: layout.screen } : {}),
      ...(slot ? { slot } : {}),
    });
    this.mountChildren(uiEl, layout.children, scope, null);
    if (this.searchForAll(uiEl, PAGE_COLUMN).length > 0) {
      this.page.mounted();
    }
    return uiEl;
  }

  protected makeScope(env: ReactiveEnv, slots: SlotMap | undefined, base: string | undefined): ReactiveScope {
    return {
      env,
      texts: [],
      regions: [],
      attrs: [],
      styles: [],
      sliderFills: [],
      streams: [],
      casts: [],
      ...(slots ? { slots } : {}),
      ...(base !== undefined ? { base } : {}),
    };
  }

  protected mountNode(
    parent: Element,
    node: BodyNode,
    scope: ReactiveScope,
    before: Element | null,
  ): Element | ReactiveRegion | undefined {
    if (node.kind === "element") {
      if (isStream(node)) {
        return this.mountStream(parent, node, scope, before);
      }
      if (isCast(node)) {
        return this.mountCast(parent, node, scope, before);
      }
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

  protected _streamElements = new WeakSet<Element>();

  protected mountStream(
    parent: Element,
    node: StreamNode,
    scope: ReactiveScope,
    before: Element | null,
  ): Element {
    const follow = { "data-follow": "end" };
    const el = this.mountElement(parent, node, scope, before);
    this.updateElement(el, { attributes: follow });
    this._streamElements.add(el);
    if (parent.parent) {
      this.updateElement(parent, { attributes: follow });
    }
    const key = this.templatedKeyOf(parent, node, layoutStreams);
    if (key) {
      const mounted: MountedStream = {
        key,
        element: el,
        node,
        scope,
        entries: [],
        rendered: [],
      };
      scope.streams.push(mounted);
      this.streams.mounted(mounted);
    }
    return el;
  }

  protected templatedKeyOf(
    parent: Element,
    node: StreamNode,
    find: typeof layoutStreams,
  ): string | undefined {
    for (const [name, { element }] of this._mountedLayouts) {
      for (let el: Element | null = parent; el; el = el.parent) {
        if (el === element) {
          const index = find(this._game.program?.sparkle, name).indexOf(node);
          return index >= 0 ? streamKey(name, index) : undefined;
        }
      }
    }
    return undefined;
  }

  protected inside(el: Element, holders: WeakSet<Element>): boolean {
    for (let node = el.parent; node; node = node.parent) {
      if (holders.has(node)) {
        return true;
      }
    }
    return false;
  }

  protected insideStream(el: Element): boolean {
    return this.inside(el, this._streamElements);
  }

  protected _castElements = new WeakSet<Element>();

  protected _clearMarked = new WeakSet<Element>();

  protected mountCast(
    parent: Element,
    node: StreamNode,
    scope: ReactiveScope,
    before: Element | null,
  ): Element {
    const el = this.mountElement(parent, node, scope, before);
    this._castElements.add(el);
    const key = this.templatedKeyOf(parent, node, layoutCasts);
    if (key) {
      const mounted: MountedCast = { key, element: el, node, scope, views: new Map() };
      scope.casts.push(mounted);
      this.casts.mounted(mounted);
    }
    return el;
  }

  protected insideCast(el: Element): boolean {
    return this.inside(el, this._castElements);
  }

  protected entryTargets(roots: Element[], target: string): Element[] {
    return this.writeTargets(
      roots.flatMap((root) =>
        root.isMatch(target)
          ? [root, ...this.searchForAll(root, target)]
          : this.searchForAll(root, target),
      ),
      target,
      true,
    );
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
    return this.notePath(this.createNodeElement(parent, node, scope, before), node, scope);
  }

  protected createNodeElement(
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
    const labels: Record<string, unknown> = {};
    const propEntries = renderedProps(node);
    if (propEntries.length > 0) {
      const vs = this._game.story.variablesState;
      for (const [prop, propValue] of propEntries) {
        vs.beginReactiveRead();
        const resolved = this.resolveProp(propValue, scope.env);
        const deps = vs.endReactiveRead();
        if (prop === "variant" || prop === "speaker") {
          labels[prop] = resolved;
        }
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
    this.limit(el, labels);
    if (marksClear(node)) {
      this._clearMarked.add(el);
    }
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
    for (const [prop, propValue] of renderedProps(node)) {
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
    for (const [prop, propValue] of renderedProps(node)) {
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
    for (const [prop, propValue] of renderedProps(node)) {
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
    for (const [prop, propValue] of renderedProps(node)) {
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
    for (const [prop, propValue] of renderedProps(node)) {
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
      scope: this.makeScope(scope.env, scope.slots, scope.base),
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
      ...(scope.base !== undefined ? { base: scope.base } : {}),
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
    region.elseScope = this.makeScope(parentEnv, region.slots, region.base);
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
    const scope = this.makeScope(env, region.slots, region.base);
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
    const call = this._nodePaths.get(node);
    const scope = this.makeScope(
      env,
      undefined,
      callerScope.base !== undefined && call !== undefined ? callBase(callerScope.base, call, comp.name) : undefined,
    );
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
    slot?.host?.(region);
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
      for (const [screen, frame] of this._mountedScreens) {
        this.refreshScope(frame.scope, changes);
        this.rehostScreenLayouts(screen, frame);
      }
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
          this.relimit(entry.element, entry.prop, next);
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
    for (const stream of scope.streams) {
      for (const entry of stream.entries) {
        this.refreshScope(entry.scope, changes);
      }
    }
    for (const cast of scope.casts) {
      for (const [id, view] of cast.views) {
        const edits = this._screenEdits;
        this.refreshScope(view.scope, changes);
        if (this._screenEdits !== edits) {
          this.casts.rewrite(cast, id, view);
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
        this.removeGroup(region.content);
        region.scope = this.makeScope(region.scope.env, region.scope.slots, region.scope.base);
        region.active = next;
        region.content = this.mountChildren(
          region.parent,
          this.branchChildren(region.node, next),
          region.scope,
          this.anchorFor(region),
          region,
        );
        this.arriveGroup(region.content);
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
        this.arriveGroup(region.elseContent ?? []);
      }
      return;
    }

    if (region.elseScope && region.elseContent) {
      this.removeGroup(region.elseContent);
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
        const iteration = this.mountIteration(
          region,
          parentEnv,
          entryKey,
          value,
          this.anchorFor(region),
        );
        this.arriveGroup(iteration.content);
        next.push(iteration);
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
    this.removeGroup(it.content);
  }

  protected removeGroup(group: ReactiveGroup): void {
    const retiring = this.moving() && this.styled("hide");
    for (const el of this.collectNodes(group)) {
      if (retiring) {
        this.retireElement(el);
      } else {
        this.destroyElement(el);
      }
    }
  }

  protected arriveGroup(group: ReactiveGroup): void {
    const roots = this.collectNodes(group);
    if (this.moving() && this.styled("show")) {
      this.arrive(roots);
    }
    this.rewriteRemounted(roots);
  }

  protected rewriteRemounted(roots: Element[]): void {
    if (roots.length === 0 || this.context?.system?.simulating) {
      return;
    }
    const replaced = (el: Element) => {
      if (roots.some((root) => this.isWithin(el, root))) {
        return true;
      }
      const slots = this._slots.get(el);
      if (!slots) {
        return false;
      }
      const now = this.slotsOf(el);
      return now.length !== slots.length || now.some((slot) => !slots.includes(slot));
    };
    for (const [target, planned] of this.textRestorePlan()) {
      const elements = planned.filter(replaced);
      if (elements.length === 0) {
        continue;
      }
      for (const el of elements) {
        this.contentsOf(el).add("text");
      }
      void this.text.restoreOnto(target, elements);
    }
    this.streams.remounted(replaced);
  }

  protected slotsOf(el: Element): Element[] {
    return el.children.filter(
      (child) =>
        child.children.length === 0 &&
        child.name.split(" ").some((c) => c === "text" || c === "stroke"),
    );
  }


  initLayouts(): void {
    this._contentSlots = new Set();
    for (const structName of Object.keys(this.context?.layout || {})) {
      if (structName && !structName.startsWith("$")) {
        const layout = this.context.layout?.[structName];
        if (layout) {
          this.initLayout(layout);
        }
      }
    }
    const screens = (this.context as Record<string, any>)?.["screen"] ?? {};
    for (const [name, screen] of Object.entries(screens)) {
      if (name && !name.startsWith("$") && screen) {
        this.initLayout(screen as Record<string, any>);
      }
    }
    this._clearOnContinue = new Set();
    this._clearPaths = new Map();
    this._unmarkedKeys = new Set();
    this._slotPaths = new Set();
    this._roots = new Map();
    const sparkle = this._game.program?.sparkle;
    const components = sparkle?.components ?? {};
    const collect = (kind: string, name: string, nodes: readonly BodyNode[] | undefined) => {
      const root = `${kind}:${name}@${hashText(bodyShape(nodes, components))}`;
      this._roots.set(`${kind}:${name}`, root);
      this.collectMarks(nodes, root, "", []);
    };
    for (const [name, layout] of Object.entries(sparkle?.layouts ?? {})) {
      if (layout) {
        collect("layout", name, layout.children);
      }
    }
    for (const [name, screen] of Object.entries(sparkle?.screens ?? {})) {
      if (screen) {
        collect("screen", name, screen.children);
      }
    }
  }

  protected collectMarks(
    nodes: readonly BodyNode[] | undefined,
    base: string,
    path: string,
    calls: readonly string[],
  ): void {
    const components = this._game.program?.sparkle?.components ?? {};
    (nodes ?? []).forEach((node, index) => {
      const here = `${path}/${index}`;
      if (node.kind === "element") {
        if (isTemplated(node)) {
          return;
        }
        this._nodePaths.set(node, here);
        const comp = components[node.tag];
        if (comp) {
          if (!calls.includes(comp.name)) {
            this.collectMarks(comp.children, callBase(base, here, comp.name), "", [...calls, comp.name]);
          }
        } else {
          const name = [node.tag, ...node.classes].join(" ");
          if (node.children.some(isEmptyContent)) {
            this._slotPaths.add(`${base}${here}`);
          }
          if (marksClear(node)) {
            this._clearOnContinue.add(name);
            this._clearPaths.set(name, [...(this._clearPaths.get(name) ?? []), `${base}${here}`]);
          } else {
            this._unmarkedKeys.add(name);
          }
        }
      }
      for (const [suffix, children] of bodyChildLists(node)) {
        this.collectMarks(children, base, `${here}${suffix}`, calls);
      }
    });
  }

  initLayout(layout: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(layout)) {
      if (key.startsWith("$") || !isStruct(value) || ["stream", "cast"].includes(key.split(" ")[0]!)) {
        continue;
      }
      if (
        Object.entries(value).some(
          ([child, content]) =>
            !child.startsWith("$") &&
            child.split(" ").some((word) => CONTENT_TAGS.has(word)) &&
            isStruct(content) &&
            Object.keys(content).every((k) => k.startsWith("$")),
        )
      ) {
        this._contentSlots.add(key);
      }
      this.initLayout(value);
    }
  }

  loadTheme(variables: Record<string, string>): void {
    const breakpoints = this.context?.config?.ui?.breakpoints;
    const root_text_size = this.context?.config?.ui?.root_text_size;
    const color_scheme = this.colorSchemeSetting();
    if (breakpoints) {
      this.enqueueUI(
        SetThemeMessage.type.request({
          breakpoints,
          root_text_size,
          color_scheme,
          variables: Object.keys(variables),
        }),
      );
    }
  }

  protected colorSchemeSetting(): ColorSchemeSetting {
    const setting = this.context?.config?.ui?.color_scheme;
    const known = COLOR_SCHEME_SETTINGS.find((s) => s === setting);
    if (known) {
      return known;
    }
    if (setting != null && !this._colorSchemeReported) {
      this._colorSchemeReported = true;
      this._game.log(UNKNOWN_COLOR_SCHEME_MESSAGE, "warning");
    }
    return "system";
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

  get initialLayoutsOpened(): boolean {
    return this._state.layout !== undefined;
  }

  get displayMode(): StartingDisplayMode {
    return this._state.displayMode ?? "textbox";
  }

  set displayMode(mode: StartingDisplayMode) {
    this._state.displayMode = mode;
  }

  openInitialLayouts(
    names: string[],
    settle: boolean,
    mode: StartingDisplayMode,
    screensClosed: string[],
  ): void {
    this._state.layout ??= [];
    this._state.displayMode = mode;
    if (screensClosed.length > 0) {
      this._state.screensClosed = screensClosed;
    }
    const closed = names.filter(
      (name) =>
        !this.isScreen(name) &&
        (!UIModule.MANAGED_LAYOUTS.has(name) || !this._mountedLayouts.has(name)),
    );
    if (closed.length === 0) {
      return;
    }
    this.composeWait(
      this.applyLayoutInstructions(
        closed.map((name) => ({ control: LayoutVerb.open, name })),
        settle,
      ),
    );
  }

  protected treeHolds(children: unknown, wanted: Set<string>, outsideCasts = false): boolean {
    const components = this._game.program?.sparkle?.components ?? {};
    const expanded = new Set<string>();
    const visit = (value: unknown): boolean => {
      if (Array.isArray(value)) {
        return value.some(visit);
      }
      if (!value || typeof value !== "object") {
        return false;
      }
      const node = value as Record<string, any>;
      if (node["kind"] === "element") {
        if (outsideCasts && isCast(node as ElementNode)) {
          return false;
        }
        const names = [node["tag"], node["name"], ...(node["classes"] ?? [])];
        if (names.some((n) => typeof n === "string" && wanted.has(n))) {
          return true;
        }
        const tag = node["tag"];
        const body = typeof tag === "string" ? components[tag] : undefined;
        if (body && !expanded.has(tag)) {
          expanded.add(tag);
          if (visit(body.children)) {
            return true;
          }
        }
      }
      return Object.values(node).some(
        (v) => v !== null && typeof v === "object" && visit(v),
      );
    };
    return visit(children);
  }

  layoutHolds(layoutName: string, elements: readonly string[], outsideCasts = false): boolean {
    const wanted = new Set(elements);
    const sparkle = this._game.program?.sparkle;
    if (sparkle?.layouts) {
      const layout = sparkle.layouts[layoutName];
      if (!layout) {
        return false;
      }
      const screen = layout.screen
        ? sparkle.screens?.[layout.screen]
        : undefined;
      return (
        this.treeHolds(layout.children, wanted, outsideCasts) ||
        this.treeHolds(screen?.children, wanted, outsideCasts)
      );
    }
    const layout = this.context.layout?.[layoutName];
    if (!layout) {
      return false;
    }
    return Object.keys(getAllProperties(layout)).some((path) =>
      path.split(/[.\s]/).some((part) => wanted.has(part)),
    );
  }

  protected resolveLayoutAnimation(
    direction: "enter" | "exit",
    clauses: LayoutClauses,
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
        ...(clauses.loop !== undefined ? { loop: clauses.loop } : {}),
      },
      instant,
    );
  }

  protected resolveLayoutAnimations(
    direction: "enter" | "exit",
    clauses: LayoutClauses[] | undefined,
    instant: boolean,
  ): Animation[] {
    return (clauses?.length ? clauses : [{}]).flatMap((c) => {
      const animation = this.resolveLayoutAnimation(direction, c, instant);
      return animation ? [animation] : [];
    });
  }

  withEntries(e: { with?: WithInstruction[] }): WithInstruction[] {
    const written: unknown = e.with;
    return Array.isArray(written)
      ? written
      : typeof written === "string" && written
        ? [{ name: written }]
        : [];
  }

  armEvent(
    entry: WithInstruction,
    arm: "on_show" | "on_hide",
  ): {
    name: string;
    after?: number;
    over?: number;
    ease?: string;
    loop?: boolean;
  } {
    const timing = this.withTiming(entry);
    const transition = this.context?.transition?.[entry.name];
    if (!transition) {
      return { name: entry.name, ...timing };
    }
    const durationOf = (name: string | undefined) =>
      getTimeValue(this.context?.animation?.[name ?? ""]?.timing?.duration) ?? 0;
    const longest = Math.max(
      0,
      ...Object.entries(transition)
        .filter(([k, v]) => !k.startsWith("$") && v)
        .map(([, v]) => durationOf(typeof v === "string" ? v : v?.$name)),
    );
    const speed =
      timing.over != null && timing.over > 0 ? longest / timing.over : 1;
    const armed = transition[arm];
    const name =
      (typeof armed === "string" ? armed : armed?.$name) ||
      (arm === "on_show" ? "show" : "hide");
    return { name, ...timing, over: durationOf(name) / speed };
  }

  withTiming(entry: WithInstruction): {
    after?: number;
    over?: number;
    ease?: string;
    loop?: boolean;
  } {
    return {
      after: entry.after,
      over: entry.over,
      ease: entry.ease,
      ...(entry.loop ? { loop: true } : entry.once ? { loop: false } : {}),
    };
  }

  async openLayout(
    name: string,
    clauses?: LayoutClauses[],
    instant = false,
    routed = false,
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
      let cancel = () => {};
      const cancelledOpen = new Promise<void>((resolve) => {
        cancel = resolve;
      });
      const pendingOpen = { cancelled: false, cancel };
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
        await Promise.race([fonts, cancelledOpen]);
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
        if (layout.screen) {
          this.releaseIdleScreen(layout.screen);
        }
        return;
      }
    }
    let element: Element;
    const framed = layout.screen
      ? this._mountedScreens.get(layout.screen)
      : undefined;
    const edits = this._screenEdits;
    try {
      const vs = this._game.story.variablesState;
      const pending = vs.takeReactiveChanges();
      element = this.constructLayoutFromAst(layout);
      vs.takeReactiveChanges();
      vs.restoreReactiveChanges(pending);
      this.hideUnwrittenTargets(element);
      this.notifyMounted(name);
      this.reveal();
    } finally {
      mounted?.();
      if (routed) {
        this._screenEdits = edits;
      }
    }
    if (!clauses?.some((c) => c.with) && !instant && this.moving() && this.styled("show")) {
      const frame = layout.screen
        ? this._mountedScreens.get(layout.screen)
        : undefined;
      this.arrive([frame && frame !== framed ? frame.element : element]);
      return;
    }
    const enter = routed
      ? []
      : this.resolveLayoutAnimations("enter", clauses, instant);
    if (enter.length && !instant) {
      const line = this.composingLine();
      if (line) {
        this.updateElement(element, { style: { visibility: "hidden" } });
        let started = false;
        this.own(line, {
          phase: "arrive",
          start: () => {
            started = true;
            this.updateElement(element, { style: { visibility: null } });
            return this.animateElements([{ element, animations: enter }]);
          },
          finish: () => {},
          settle: () => {
            this.updateElement(element, {
              style: { visibility: null },
              ...(started ? { attributes: { [PRESENCE_ATTRIBUTE]: null } } : {}),
            });
          },
        });
        return;
      }
      const entering = this.animateElements([{ element, animations: enter }]);
      if (this._compose) {
        void entering;
        return;
      }
      await entering;
    }
  }

  async closeLayout(
    name: string,
    clauses?: LayoutClauses[],
    instant = false,
    routed = false,
  ): Promise<void> {
    if (!this._reactive) {
      this.hideLayout(name);
      return;
    }
    const opens = name ? this._pendingOpens.get(name) : undefined;
    for (const open of opens ?? []) {
      open.cancelled = true;
      open.cancel();
    }
    const entry = name ? this._mountedLayouts.get(name) : undefined;
    if (!entry) {
      return;
    }
    const frame = entry.screen
      ? this._mountedScreens.get(entry.screen)
      : undefined;
    const leaving =
      frame && !this.screenHeld(entry.screen!, name) ? frame : undefined;
    if (leaving) {
      this._mountedScreens.delete(entry.screen!);
    } else if (entry.slot) {
      entry.slot.content = entry.slot.content.filter(
        (it) => !("el" in it && it.el === entry.element),
      );
    }
    const element = leaving?.element ?? entry.element;
    if (
      !clauses?.some((c) => c.with) &&
      !instant &&
      this.moving() &&
      this.styled("hide")
    ) {
      this._mountedLayouts.delete(name);
      this.retireElement(
        element,
        name,
        this._game.module.assets?.retireLayout(name),
      );
      return;
    }
    const exit = routed
      ? []
      : this.resolveLayoutAnimations("exit", clauses, instant);
    if (exit.length && !instant && this._compose) {
      const retiring: Retirement = {
        name,
        held: this.heldNames(element),
        element,
        epoch: this._game.connection.epoch,
        root: this._root,
        pin: this._game.module.assets?.retireLayout(name),
      };
      this._mountedLayouts.delete(name);
      element.remove();
      this._retiring.add(retiring);
      const line = this.composingLine();
      if (line) {
        this.own(line, {
          phase: "leave",
          removes: true,
          start: () => this.animateElements([{ element, animations: exit }]),
          finish: () => this.retire(retiring),
          settle: () => this.retire(retiring),
        });
        return;
      }
      void this.animateElements([{ element, animations: exit }]).then(() =>
        this.retire(retiring),
      );
      return;
    }
    if (exit.length && !instant) {
      await this.animateElements([{ element, animations: exit }]);
    }
    this.destroyElement(element);
    this._mountedLayouts.delete(name);
    this._game.module.assets?.releaseLayout(name);
    if (frame && !leaving) {
      this.releaseIdleScreen(entry.screen!);
    }
  }

  protected retire(r: Retirement): void {
    if (!this._retiring.has(r)) {
      return;
    }
    if (this.superseded(r.epoch) && r.root !== this._root) {
      this._retiring.delete(r);
    } else {
      this.flushUIBatch();
      this._retiring.delete(r);
      this.destroyElement(r.element, true);
      this.sendRetired();
    }
    if (r.pin) {
      this._game.module.assets?.releaseRetiredLayout(r.pin);
    }
  }

  protected exiting(target: string): boolean {
    if (this._exits.size === 0) {
      return false;
    }
    const elements = new Set(this.findElements(target, true));
    return [...this._exits].some((exit) => exit.elements.some((el) => elements.has(el)));
  }

  protected dropExits(drops: (element: Element) => boolean): void {
    let dropped = false;
    for (const exit of this._exits) {
      const kept = exit.elements.filter((el) => !drops(el));
      if (kept.length === exit.elements.length) {
        continue;
      }
      dropped = true;
      if (kept.length === 0) {
        this._exits.delete(exit);
      } else {
        exit.elements = kept;
      }
    }
    if (dropped && !this._uiBatchScheduled) {
      this._uiBatchScheduled = true;
      queueMicrotask(() => this.flushUIBatch());
    }
  }

  protected endExit(exit: PictureExit): void {
    if (!this._exits.has(exit)) {
      return;
    }
    if (this.superseded(exit.epoch)) {
      this._exits.delete(exit);
      return;
    }
    this.flushUIBatch();
    this._exits.delete(exit);
    this.sendRetired();
  }

  protected sendRetired(): void {
    this.noteShowing(true);
    const messages = this._uiBatch;
    this._uiBatch = [];
    if (messages.length > 0) {
      const batch = BatchElementsMessage.type.notification({ messages });
      if (this._lineRemovals) {
        void this.emit(batch);
      } else {
        this._uiOps += 1;
        void super.emit(batch);
      }
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
    this.setGameTable("loading", fields);
  }

  protected setGameTable(
    name: "loading" | "ending",
    fields: Record<string, boolean | string | number | undefined>,
  ): void {
    const vs = this._game.story?.variablesState;
    const game = vs?.GetVariableWithName("game");
    const table =
      game instanceof ObjectValue ? game.value?.get(name) : undefined;
    if (!vs || !(table instanceof ObjectValue) || !table.value) {
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
      table.value.set(key, value);
    }
    vs.recordReactiveTableChange(table.value);
  }

  openEnding(): void {
    this.setGameTable("ending", { active: true });
    this.refreshLayouts();
    const transition = this.context.config?.ui?.ending_transition;
    this.openLayout(
      "ending",
      transition ? [{ with: transition }] : undefined,
      Boolean(this.context.system.previewing) || !this.context.system.transitions,
    ).catch((e) => {
      this.reportRuntimeError("Could not open the ending layout", e);
    });
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
        resolved ? [{ with: resolved }] : undefined,
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
      loading.transition ? [{ with: loading.transition }] : undefined,
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
    const still = this.showsMovieStill();
    const params: PlayCutsceneParams = {
      src,
      loop: Boolean(cutscene.loop),
      muted: Boolean(cutscene.mute),
      ...this.getMovieMixer(),
    };
    if (cutscene.with) {
      params.with = cutscene.with;
      if (!still) {
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
    if (still) {
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
    clauses?: LayoutClauses[],
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
    const layouts = this._game.program?.sparkle?.layouts;
    const pending = [...this._pendingOpens.keys()].filter(
      (n) =>
        n !== name &&
        !UIModule.MANAGED_LAYOUTS.has(n) &&
        !toClose.includes(n) &&
        (screen ? layouts?.[n]?.screen === screen : true),
    );
    const held = layouts?.[name]?.screen;
    await this.holdingScreens(held ? [held] : [], () =>
      Promise.all([
        ...[...toClose, ...pending].map((n) =>
          this.closeLayout(n, clauses, instant),
        ),
        this.openLayout(name, clauses, instant),
      ]),
    );
  }

  isScreen(name: string): boolean {
    const sparkle = this._game.program?.sparkle;
    return Boolean(name && sparkle?.screens?.[name] && !sparkle.layouts?.[name]);
  }

  protected nextLayoutState(
    state: OpenLayout[] | undefined,
    e: LayoutInstruction,
  ): OpenLayout[] | undefined {
    const layouts = this._game.program?.sparkle?.layouts;
    const recordOpen = (list: OpenLayout[] | undefined, name: string, auto?: true) => {
      if (!name || UIModule.MANAGED_LAYOUTS.has(name) || !layouts?.[name]) {
        return list;
      }
      const open = list?.find((s) => s.name === name);
      if (open) {
        return open.auto && !auto
          ? list!.map((s) => (s === open ? { name: s.name, ...(s.screen ? { screen: s.screen } : {}) } : s))
          : list;
      }
      const screen = layouts[name]?.screen;
      return [...(list ?? []), { name, ...(screen ? { screen } : {}), ...(auto ? { auto } : {}) }];
    };
    switch (e.control) {
      case LayoutVerb.clear:
        return state;
      case LayoutVerb.close:
        return this.isScreen(e.name)
          ? state?.filter((s) => s.screen !== e.name)
          : state?.filter((s) => s.name !== e.name);
      case LayoutVerb.navigate:
        if (!e.name) {
          return state;
        }
        return recordOpen(
          state?.filter((s) =>
            e.screen ? s.screen !== e.screen || s.name === e.name : s.name === e.name,
          ),
          e.name,
        );
      case LayoutVerb.open:
        return recordOpen(state, e.name, e.auto);
      default:
        this.reportUnknownLayoutVerb(e.control);
        return state;
    }
  }

  protected nextScreensClosed(closed: string[] | undefined, e: LayoutInstruction): string[] | undefined {
    const name = e.control === LayoutVerb.navigate ? e.screen : e.name;
    if (!name || !this.isScreen(name)) {
      return closed;
    }
    if (e.control === LayoutVerb.close) {
      return closed?.includes(name) ? closed : [...(closed ?? []), name];
    }
    if (e.control === LayoutVerb.open || e.control === LayoutVerb.navigate) {
      return closed?.filter((screen) => screen !== name);
    }
    return closed;
  }

  screensClosedAfter(instructions: LayoutInstruction[]): string[] {
    let closed = this._state.screensClosed;
    for (const e of instructions) {
      closed = this.nextScreensClosed(closed, e);
    }
    return closed ?? [];
  }

  autoLayoutsAfter(instructions: LayoutInstruction[]): string[] {
    let state = this._state.layout;
    for (const e of instructions) {
      state = this.nextLayoutState(state, e);
    }
    return (state ?? []).filter((s) => s.auto).map((s) => s.name);
  }

  protected reportUnknownLayoutVerb(verb: never): void {
    const name = String(verb);
    if (this._unknownLayoutVerbs.has(name)) {
      return;
    }
    this._unknownLayoutVerbs.add(name);
    const code = (word: string) => "`" + word + "`";
    this._game.log(
      `${code(name)} is not a layout command, so it was skipped; the layout commands are ${LAYOUT_VERBS.map(code).join(", ")}.`,
      "warning",
    );
  }

  protected saveLayoutState(e: LayoutInstruction): void {
    const next = this.nextLayoutState(this._state.layout, e);
    if (next) {
      this._state.layout = next;
    }
    const closed = this.nextScreensClosed(this._state.screensClosed, e);
    if (closed?.length) {
      this._state.screensClosed = closed;
    } else {
      delete this._state.screensClosed;
    }
  }

  openedLayoutsAfter(instructions: LayoutInstruction[]): string[] {
    let state = this._state.layout;
    for (const e of instructions) {
      state = this.nextLayoutState(state, e);
    }
    return ["main", ...(state ?? []).map((s) => s.name)];
  }

  whenLayoutsSettled(): Promise<void> | null {
    if (this._layoutWork.size === 0) {
      return null;
    }
    return Promise.allSettled([...this._layoutWork]).then(() => undefined);
  }

  beginPresentation(): number {
    this._presentation += 1;
    return this._presentation;
  }

  isCurrentPresentation(presentation: number): boolean {
    return this._presentation === presentation;
  }

  applyLayoutInstructions(
    instructions: LayoutInstruction[],
    instant: boolean,
  ): Promise<void> {
    const work = this.runLayoutInstructions(instructions, instant);
    this._layoutWork.add(work);
    const settled = () => {
      this._layoutWork.delete(work);
    };
    work.then(settled, settled);
    return work;
  }

  protected async runLayoutInstructions(
    layout: LayoutInstruction[],
    instant: boolean,
  ): Promise<void> {
    const instructions = layout.filter((e) => {
      if (!isLayoutVerb(e.control)) {
        this.reportUnknownLayoutVerb(e.control as never);
        return false;
      }
      return e.control !== LayoutVerb.clear;
    });
    for (const e of instructions) {
      this.saveLayoutState(e);
    }
    if (instructions.some((e) => !e.auto)) {
      this._screenEdits += 1;
    }
    const run = (e: LayoutInstruction): Promise<void> => {
      if (!e.auto) {
        return runOwn(e);
      }
      const edits = this._screenEdits;
      const done = runOwn(e);
      this._screenEdits = edits;
      return done;
    };
    const runOwn = (e: LayoutInstruction): Promise<void> => {
      const entries = this.withEntries(e);
      const clauses: LayoutClauses[] = entries.length
        ? entries.map((entry) => ({ with: entry.name, ...this.withTiming(entry) }))
        : [{ after: e.after, over: e.over, ease: e.ease }];
      switch (e.control) {
        case LayoutVerb.open:
          return this.openLayout(e.name, clauses, instant, Boolean(e.auto));
        case LayoutVerb.close:
          return this.isScreen(e.name)
            ? this.closeScreen(e.name, clauses, instant)
            : this.closeLayout(e.name, clauses, instant, Boolean(e.auto));
        case LayoutVerb.navigate:
          return this.navigateScreen(e.name, e.screen, clauses, instant);
        case LayoutVerb.clear:
          return Promise.resolve();
        default:
          this.reportUnknownLayoutVerb(e.control);
          return Promise.resolve();
      }
    };
    const layouts = this._game.program?.sparkle?.layouts;
    const opened = (events: LayoutInstruction[]): string[] => [
      ...new Set(
        events.flatMap((e) => {
          const screen = e.control === LayoutVerb.open ? layouts?.[e.name]?.screen : undefined;
          return screen ? [screen] : [];
        }),
      ),
    ];
    if (this._game.replaying && instant) {
      void this.holdingScreens(opened(instructions), () => Promise.all(instructions.map(run)));
      return;
    }
    const epoch = this._game.connection.epoch;
    const segments: LayoutInstruction[][] = [[]];
    for (const e of instructions) {
      if (e.control === LayoutVerb.navigate) {
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
      if (segment.length === 1 && segment[0]!.control === LayoutVerb.navigate) {
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
      await this.holdingScreens(opened(segment), () =>
        Promise.all(
          [...byLayout.values()].map(async (group) => {
            for (const e of group) {
              if (this.superseded(epoch)) {
                return;
              }
              await run(e);
            }
          }),
        ),
      );
    }
  }

  protected async holdingScreens<T>(screens: string[], work: () => Promise<T>): Promise<T> {
    for (const screen of screens) {
      this._screenHolds.set(screen, (this._screenHolds.get(screen) ?? 0) + 1);
    }
    try {
      return await work();
    } finally {
      for (const screen of screens) {
        const holds = (this._screenHolds.get(screen) ?? 1) - 1;
        if (holds > 0) {
          this._screenHolds.set(screen, holds);
        } else {
          this._screenHolds.delete(screen);
        }
        this.releaseIdleScreen(screen);
      }
    }
  }

  protected async closeScreen(
    screen: string,
    clauses: LayoutClauses[],
    instant: boolean,
  ): Promise<void> {
    const layouts = this._game.program?.sparkle?.layouts;
    const names = new Set([
      ...[...this._mountedLayouts].filter(([, entry]) => entry.screen === screen).map(([name]) => name),
      ...[...this._pendingOpens.keys()].filter((name) => layouts?.[name]?.screen === screen),
    ]);
    await Promise.all([...names].map((name) => this.closeLayout(name, clauses, instant)));
  }

  protected findElements(target: string, writes = false): Element[] {
    const [name, instance] = target.split("#");
    const found: Element[] = [];
    if (this._root && name) {
      const elements = this.writeTargets(
        this.searchForAll(this._root, name, found).filter(
          (el) => !writes || !(this.insideStream(el) || this.insideCast(el)),
        ),
        name,
        writes,
      );
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

  protected writeTargets(
    matches: Element[],
    name: string,
    writes: boolean,
  ): Element[] {
    const named = matches.filter((el) => el.name === name);
    if (named.length > 0) {
      return named;
    }
    return writes
      ? matches.filter(
          (el) =>
            !el.name
              .split(" ")
              .some((c) => ["text", "image", "stroke", "mask"].includes(c)),
        )
      : matches;
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

  protected _warnedWriteTargets = new Set<string>();

  protected warnUndeclaredWriteTarget(target: string): void {
    const name = target.split("#")[0];
    const sparkle = this._game.program?.sparkle;
    if (!name || !sparkle?.layouts || this._warnedWriteTargets.has(name)) {
      return;
    }
    const content = ["text", "image", "stroke", "mask"];
    const declares = (value: unknown): boolean => {
      if (Array.isArray(value)) {
        return value.some(declares);
      }
      if (!value || typeof value !== "object") {
        return false;
      }
      const node = value as Record<string, unknown>;
      if (
        node["kind"] === "element" &&
        [node["tag"], node["name"]].some(
          (n) => n === name && !content.includes(n),
        )
      ) {
        return true;
      }
      return Object.values(node).some(
        (v) => v !== null && typeof v === "object" && declares(v),
      );
    };
    if (
      [sparkle.layouts, sparkle.screens, sparkle.components].some((trees) =>
        declares(Object.values(trees ?? {})),
      )
    ) {
      return;
    }
    this._warnedWriteTargets.add(name);
    this._game.warn(
      `No layout element is named \`${name}\`, so the line written to it draws nothing.`,
    );
  }

  findIds(target: string): string[] {
    return this.findElements(target, true).map((c) => c.id);
  }

  protected namesWriteElements(target: string, elements: Element[]): boolean {
    const name = target.split("#")[0];
    return (
      Boolean(this._compose) ||
      this.streams.active ||
      this.casts.active ||
      elements.some((el) => el.name !== name) ||
      elements.length !== this.textElements(target).length
    );
  }

  getTransientTargets() {
    return Array.from(this._clearOnContinue.values());
  }

  savedTargets(): string[] {
    return [
      ...new Set([
        ...Object.keys(this._state.text ?? {}),
        ...Object.keys(this._state.image ?? {}),
      ]),
    ];
  }

  keepThroughConnect(targets: string[]): void {
    this._keptThroughConnect = targets;
  }

  textElements(target: string): Element[] {
    return this.findElements(target, true);
  }

  elementPath(el: Element): string | undefined {
    return this._elementPaths.get(el);
  }

  protected notePath(el: Element, node: ElementNode, scope: ReactiveScope): Element {
    const path = this._nodePaths.get(node);
    if (path !== undefined && scope.base !== undefined) {
      this._elementPaths.set(el, `${scope.base}${path}`);
    }
    return el;
  }

  protected isSlotElement(el: Element): boolean {
    const path = this.elementPath(el);
    return path === undefined || this._slotPaths.has(path);
  }

  protected markedPaths(target: string): string[] {
    const words = target.split(" ");
    return [...this._clearPaths].flatMap(([key, paths]) =>
      key === target || words.every((w) => key.split(" ").includes(w)) ? paths : [],
    );
  }

  protected fullyMarked(target: string): boolean {
    const words = target.split(" ");
    return ![...this._unmarkedKeys].some(
      (key) => key === target || words.every((w) => key.split(" ").includes(w)),
    );
  }

  protected clearReach(target: string, reach: "marked" | "unmarked" | "name"): Element[] {
    const elements = this.textElements(target);
    if (reach === "name") {
      return elements;
    }
    const marked = new Set([...this._clearPaths.values()].flat());
    return elements.filter(
      (el) =>
        marked.has(this.elementPath(el) ?? "") === (reach === "marked") &&
        (reach === "marked" || this.isSlotElement(el)),
    );
  }

  protected textRestorePlan(): Map<string, Element[]> {
    const saved = Object.keys(this._state.text ?? {});
    const written = this._state.textWritten ?? {};
    const cleared = this._state.textCleared ?? {};
    const elementsOf = new Map(saved.map((target) => [target, this.textElements(target)]));
    const newest = new Map<Element, number>();
    for (const target of saved) {
      for (const el of elementsOf.get(target)!) {
        newest.set(el, Math.max(newest.get(el) ?? -Infinity, ownEntry(written, target) ?? 0));
      }
    }
    const emptiedAt = (el: Element) => ownEntry(cleared, this.elementPath(el) ?? "") ?? -Infinity;
    return new Map(
      saved.map((target) => {
        const line = ownEntry(written, target) ?? 0;
        return [
          target,
          elementsOf
            .get(target)!
            .filter(
              (el) =>
                line === newest.get(el) &&
                line >= emptiedAt(el) &&
                (!this.limited(el) || this.textFor(target, el) !== undefined),
            ),
        ];
      }),
    );
  }

  heldTextElements(): Set<Element> {
    return new Set([...this.textRestorePlan().values()].flat());
  }

  protected savedElements(
    names: { text: readonly string[]; image: readonly string[] } = {
      text: Object.keys(this._state.text ?? {}),
      image: Object.keys(this._state.image ?? {}),
    },
  ): Set<Element> {
    const plan = this.textRestorePlan();
    return new Set([
      ...names.text.flatMap((target) => plan.get(target) ?? []),
      ...names.image.flatMap((target) => this.textElements(target)),
    ]);
  }

  protected holdsSaved(target: string, saved: ReadonlySet<Element>): boolean {
    return this.textElements(target).some((el) => saved.has(el));
  }

  protected restoreTexts(): Promise<void>[] {
    return [...this.textRestorePlan()].map(([target, elements]) =>
      elements.length > 0 ? this.text.restoreOnto(target, elements) : Promise.resolve(),
    );
  }

  protected hideUnwrittenTargets(layout: Element): void {
    const inLayout = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parent) {
        if (node === layout) {
          return true;
        }
      }
      return false;
    };
    const saved = this.savedElements();
    for (const target of this._contentSlots) {
      if (this.holdsSaved(target, saved)) {
        continue;
      }
      for (const el of this.textElements(target)) {
        if (inLayout(el) && this.isSlotElement(el)) {
          this.noteHidden(el, true);
          this.updateElement(el, { style: { display: "none" } });
        }
      }
    }
  }

  getTravelTiming(
    event: { after?: number; over?: number; ease?: string },
    instant: boolean,
  ): PictureTravel["timing"] {
    const easeDefinition = event.ease ? this.context?.ease?.[event.ease] : null;
    return {
      delay: instant ? "0s" : `${event.after ?? 0}s`,
      duration: instant ? "0s" : `${event.over ?? 0}s`,
      easing: easeDefinition != null ? this.getTimingFunction(easeDefinition) : "ease",
    };
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
      const keyframes = animation.keyframes;
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
      if (callback) {
        this.markHandler(targetEl);
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
        if (
          !Object.values(this._events).some(
            (handlers) => handlers && Object.hasOwn(handlers, targetEl.id),
          )
        ) {
          this.updateElement(targetEl, {
            attributes: { [HANDLER_ATTRIBUTE]: null },
          });
        }
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
      change(
        reason: TextWriteReason,
        target: string,
        sequence: TextInstruction[],
        instant?: boolean,
        time?: number,
        shown?: number,
      ): Promise<void>;
      change(reason: TextClearReason, targets: readonly string[]): Promise<void>;
      async change(
        reason: TextReason,
        targets: string | readonly string[],
        sequence?: TextInstruction[],
        instant = false,
        time?: number,
        shown = 0,
      ): Promise<void> {
        const rule = TEXT_REASONS[reason];
        if (rule.opensLine) {
          this.#openLine();
        }
        const rendering = !$.context?.system?.simulating;
        if (typeof targets === "string") {
          if (rule.deletesSavedText) {
            delete $._state.text?.[targets];
            delete $._state.lineText?.[targets];
            delete $._state.textWritten?.[targets];
            this.#presented.delete(targets);
          }
          this.#present(targets, sequence!, instant, time, shown);
          this.#save(targets, sequence!);
          if (rule.recordsStamp) {
            this.#mark("textWritten", targets);
          }
          if (rendering) {
            await this.applyChanges(targets, sequence!, instant, time, shown);
          }
          return;
        }
        await Promise.all(
          targets.map(async (target) => {
            const elements = $.clearReach(target, rule.reach);
            if (rule.deletesSavedText && (rule.reach === "name" || $.fullyMarked(target))) {
              delete $._state.text?.[target];
              delete $._state.lineText?.[target];
              delete $._state.textWritten?.[target];
              this.#presented.delete(target);
            }
            if (rule.recordsStamp) {
              for (const path of $.markedPaths(target)) {
                this.#mark("textCleared", path);
              }
            }
            if (rendering) {
              await this.writeElements(target, elements, null, true);
            }
          }),
        );
      }

      #append(state: TextState[], sequence: TextInstruction[]) {
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
      }

      #presented = new Map<string, PresentedText>();

      settle(): void {
        this.#presented.clear();
      }

      #present(
        target: string,
        sequence: TextInstruction[],
        instant: boolean,
        time: number | undefined,
        shown: number,
      ) {
        const saved = ownEntry($._state.text, target);
        const prior = saved
          ? (this.#presented.get(target)?.sequence ?? saved.map((s) => ({ ...s })))
          : [];
        this.#presented.set(target, {
          sequence: [...prior, ...sequence],
          time,
          shown: prior.length + shown,
          complete: instant,
          current: sequence,
          currentShown: shown,
          line: $._state.line,
        });
      }

      retime(from: number, to: number) {
        for (const presented of this.#presented.values()) {
          if (presented.time === from) {
            presented.time = to;
          }
        }
      }

      #typedFor(target: string, el: Element, presented: PresentedText): TextInstruction[] | undefined {
        if (!$.admits(el, presented.line)) {
          return undefined;
        }
        const states = ($.textFor(target, el) ?? []).map((s) => ({ ...s }));
        let strip = presented.current.reduce((n, e) => n + (e.text?.length ?? 0), 0);
        while (strip > 0 && states.length > 0) {
          const last = states.at(-1)!;
          const length = last.text?.length ?? 0;
          if (length <= strip) {
            states.pop();
            strip -= length;
          } else {
            last.text = last.text!.slice(0, length - strip);
            strip = 0;
          }
        }
        return [...states, ...presented.current];
      }

      #save(target: string, sequence: TextInstruction[]) {
        $._state.text ??= {};
        this.#append(ownList($._state.text, target), sequence);
        const line = $._state.line;
        if (line) {
          $._state.lineText ??= {};
          const written = ownList($._state.lineText, target);
          const last = written.at(-1);
          if (last && last.variant === line.variant && last.speaker === line.speaker) {
            this.#append(last.text, sequence);
          } else {
            const entry: LineText = { ...line, text: [] };
            this.#append(entry.text, sequence);
            written.push(entry);
          }
        }
      }

      #stamps(): number[] {
        return [
          ...Object.values($._state.textWritten ?? {}),
          ...Object.values($._state.textCleared ?? {}),
        ];
      }

      #openLine() {
        $._state.textLine = Math.max(0, ...this.#stamps()) + 1;
      }

      #mark(kind: "textWritten" | "textCleared", target: string) {
        const line = $._state.textLine ?? 0;
        Object.defineProperty(($._state[kind] ??= {}), target, {
          value: line,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        const rank = new Map(
          [...new Set(this.#stamps())]
            .filter((v) => v > 0)
            .sort((a, b) => a - b)
            .map((v, i) => [v, i + 1]),
        );
        for (const stamps of [$._state.textWritten, $._state.textCleared]) {
          for (const key of Object.keys(stamps ?? {})) {
            stamps![key] = rank.get(stamps![key]!) ?? stamps![key]!;
          }
        }
        $._state.textLine = rank.get(line) ?? line;
      }

      async restore(target: string) {
        const state = ownEntry($._state.text, target);
        if (!state) {
          return;
        }
        await this.restoreOnto(target, $.textElements(target));
      }

      async restoreOnto(target: string, elements: Element[]) {
        const state = ownEntry($._state.text, target);
        if (!state) {
          return;
        }
        const open = elements.filter((el) => !$.limited(el));
        const limited = elements.filter((el) => $.limited(el));
        const presented = this.#presented.get(target);
        const writeOpen = (subset: boolean) =>
          presented && !presented.complete
            ? this.writeElements(
                target,
                open,
                presented.sequence,
                false,
                presented.time,
                presented.shown,
                subset,
              )
            : this.writeElements(target, open, presented?.sequence ?? state, true, undefined, 0, subset);
        if (limited.length === 0) {
          await writeOpen(false);
          return;
        }
        await Promise.all([
          ...(open.length > 0 ? [writeOpen(true)] : []),
          ...limited.map((el) => {
            const typed =
              presented && !presented.complete
                ? this.#typedFor(target, el, presented)
                : undefined;
            return typed
              ? this.writeElements(
                  target,
                  [el],
                  typed,
                  false,
                  presented!.time,
                  typed.length - presented!.current.length + presented!.currentShown,
                  true,
                )
              : this.writeElements(target, [el], $.textFor(target, el) ?? null, true, undefined, 0, true);
          }),
        ]);
      }

      protected async applyChanges(
        target: string,
        sequence: TextInstruction[] | null,
        instant: boolean,
        time?: number,
        shown = 0,
      ) {
        const elements = $.textElements(target);
        const admitted = sequence
          ? elements.filter((el) => $.admits(el, $._state.line))
          : elements;
        if (admitted.length === 0 && elements.length > 0) {
          return;
        }
        await this.writeElements(
          target,
          admitted,
          sequence,
          instant,
          time,
          shown,
          admitted.length < elements.length,
        );
      }

      async writeElements(
        target: string,
        targetEls: Element[],
        sequence: TextInstruction[] | null,
        instant: boolean,
        time?: number,
        shown = 0,
        subset = false,
      ) {
        if (!sequence && $.knownEmpty("text", targetEls)) {
          return;
        }
        const moving = !instant && $.moving();
        const arriving: Element[] = [];
        const leaving = targetEls.filter(
          (targetEl) =>
            !sequence &&
            $.leaves(targetEl, "text", (keepShown) =>
              this.hide(target, targetEl, keepShown),
            ),
        );
        for (const targetEl of leaving) {
          $.noteHidden(targetEl, true);
        }
        const writing = targetEls.filter((el) => !leaving.includes(el));
        for (const targetEl of writing) {
          if (sequence) {
            $.noteHidden(targetEl, false);
            const arrives = $.arrives(targetEl, "text", moving);
            if (arrives) {
              arriving.push(targetEl);
            }
            $.updateElement(targetEl, {
              style: { display: null },
              attributes: {
                text: sequence?.map((t) => t.text).join("") ?? null,
                ...$.presenceMark(targetEl, arrives),
              },
            });
          } else if ($.contentsOf(targetEl).size > 0) {
            $.updateElement(targetEl, { attributes: { text: null } });
          } else {
            $.noteHidden(targetEl, true);
            $.updateElement(targetEl, {
              style: { display: "none" },
              attributes: {
                text: null,
                ...$.settleMark(targetEl),
              },
            });
          }
        }
        $.noteContent("text", writing, !sequence);
        for (const el of writing) {
          if (sequence) {
            $._slots.set(el, $.slotsOf(el));
          } else {
            $._slots.delete(el);
          }
        }
        if (targetEls.length === 0) {
          if (sequence) {
            $.warnUndeclaredWriteTarget(target);
          }
          return;
        }
        if (writing.length === 0) {
          return;
        }
        $.flushUIBatch();
        if (arriving.length > 0) {
          void $.present(arriving, "show");
        }
        await $.emitSettled(
          $.onLine(
            WriteTextMessage.type.request({
              target,
              instructions: sequence ?? [],
              instant,
              ...(time != null ? { time } : {}),
              ...(shown > 0 ? { shown } : {}),
              ...(subset || leaving.length > 0 || $.namesWriteElements(target, writing)
                ? { elements: writing.map((el) => el.id) }
                : {}),
            }),
            !instant &&
              Boolean(sequence?.slice(shown).some((e) => (e.after ?? 0) > 0)),
          ),
        );
      }

      protected hide(target: string, targetEl: Element, keepShown: boolean) {
        $.updateElement(
          targetEl,
          keepShown
            ? { attributes: { text: null } }
            : {
                style: { display: "none" },
                attributes: { text: null, [PRESENCE_ATTRIBUTE]: null },
              },
        );
        $.noteContent("text", [targetEl], true);
        $.flushUIBatch();
        void $.emitSettled(
          WriteTextMessage.type.request({
            target,
            instructions: [],
            instant: true,
            elements: [targetEl.id],
          }),
        );
      }

    }
    return Text;
  })(this);

  Image = (($) => {
    class Image {
      protected saveState(target: string, sequence: ImageInstruction[] | null) {
        if (sequence) {
          const existed = Boolean($._state.image?.[target]);
          const state = this.recorded($._state.image?.[target] ?? [], sequence);
          if (existed || state.length > 0) {
            ($._state.image ??= {})[target] = state;
          }
        } else {
          delete $._state.image?.[target];
        }
      }

      recorded(previous: ImageState[], sequence: ImageInstruction[]): ImageState[] {
        let state = previous;
        let travelStart = -Infinity;
        for (const event of sequence) {
          const targetingContent = Boolean(event.assets?.length);
          if (!targetingContent && event.control === "animate" && event.to) {
            const shown = state.findLast((e) => e.control === "show" && e.assets?.length);
            const start = event.after ?? 0;
            if (shown && start >= travelStart) {
              shown.at = event.to;
              travelStart = start;
            }
            if (!event.with) {
              continue;
            }
          }
          if (targetingContent) {
            if (event.control === "show") {
              travelStart = -Infinity;
              state = state.filter(
                (e) => !(e.control === "hide" && !e.assets?.length),
              );
              state = state.filter((e) => !e.assets?.length);
            }
            state.push({
              control: event.control,
              with: event.with,
              assets: event.assets,
              over: 0,
              ...(event.control === "show" && event.at ? { at: event.at } : {}),
              ...(event.morph ? { morph: event.morph } : {}),
              ...(event.speaker !== undefined ? { speaker: event.speaker } : {}),
              ...(event.loop ? { loop: true } : {}),
              ...(event.once ? { once: true } : {}),
              ...(event.mute ? { mute: true } : {}),
            });
          } else {
            if (event.control === "hide") {
              travelStart = -Infinity;
              for (const e of state) {
                delete e.at;
              }
            }
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
        return state;
      }

      async restore(target: string) {
        const state = $._state.image?.[target];
        if (state) {
          const emptied = new Set($._state.pictureCleared ?? []);
          await this.applyChanges(
            target,
            state,
            true,
            undefined,
            undefined,
            false,
            $.textElements(target).filter((el) => !emptied.has($.elementPath(el) ?? "")),
          );
        }
      }

      predict(assets: string[]): WriteImageInstruction["content"] | undefined {
        return this.resolve([{ control: "show", assets }], true)[0]?.content;
      }

      effectScale(event: ImageInstruction): number {
        const out = this.resolve([event], true)[0];
        return (out?.affected ?? []).reduce(
          (product, affected) => product * keyframeScale(affected.animations),
          keyframeScale(out?.content?.enterAnimations ?? []) *
            keyframeScale(out?.targetAnimations),
        );
      }

      shown(target: string): { assets: string[]; at?: string } | undefined {
        let shown: ImageInstruction | undefined;
        for (const event of $._state.image?.[target] ?? []) {
          if (event.assets?.length) {
            if (event.control === "show") {
              shown = event;
            }
          } else if (event.control === "hide") {
            shown = undefined;
          }
        }
        return shown?.assets?.length
          ? { assets: shown.assets, ...(shown.at ? { at: shown.at } : {}) }
          : undefined;
      }

      async clearMarked(targets: readonly string[]) {
        await Promise.all(
          targets.map(async (target) => {
            const elements = $.clearReach(target, "marked");
            if ($.fullyMarked(target)) {
              delete $._state.image?.[target];
            } else {
              const paths = $.markedPaths(target);
              if (paths.length > 0) {
                $._state.pictureCleared = [
                  ...new Set([...($._state.pictureCleared ?? []), ...paths]),
                ];
              }
            }
            if (!$.context?.system?.simulating) {
              await this.applyChanges(target, null, true, undefined, undefined, false, elements);
            }
          }),
        );
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

      protected nextView(e: ImageInstruction, view: PictureView): PictureView {
        if (e.assets?.length) {
          return e.control === "show" ? { framing: $.getFraming(e.at), picture: true, show: e } : view;
        }
        if (e.control === "hide") {
          return { picture: view.picture };
        }
        if (e.control === "animate" && e.to && view.picture) {
          const start = e.after ?? 0;
          return start >= (view.travelStart ?? -Infinity)
            ? { picture: true, framing: $.getFraming(e.to), travelStart: start, ...(view.show ? { show: view.show } : {}) }
            : view;
        }
        return view;
      }

      viewAfter(events: ImageInstruction[]): PictureView {
        let view: PictureView = { picture: false };
        for (const e of events) {
          view = this.nextView(e, view);
        }
        return view;
      }

      protected resolve(
        sequence: ImageInstruction[],
        instant: boolean,
        view: PictureView = { picture: false },
      ): WriteImageInstruction[] {
        const instructions: WriteImageInstruction[] = [];
        for (const e of sequence) {
          const before = instant || e.control !== "show" ? undefined : view.show;
          const shown = before?.assets?.map((asset) => ({ asset, pick: $.imagePick(before, asset) }));
          view = this.nextView(e, view);
          const framing = view.framing;
          const out: WriteImageInstruction = { control: e.control };
          if (e.control === "animate" && e.to && view.picture && !e.assets?.length) {
            const destination = instant ? framing : $.getFraming(e.to);
            out.travel = {
              ...(destination ? { framing: destination } : {}),
              timing: $.getTravelTiming(e, instant),
            };
          }
          const targetAnimations: Animation[] = [];
          const affected: { target: string; animations: Animation[] }[] = [];
          const isFirstContentReveal =
            e.control === "show" && e.assets && e.assets.length > 0;
          if (isFirstContentReveal) {
            const revealEvent = {
              name: "show",
              after: e.after,
              over: 0,
              ease: e.ease,
            };
            const animation = $.getAnimationDefinition(revealEvent, instant);
            if (animation) {
              targetAnimations.push(animation);
            }
          }
          const entries = $.withEntries(e);
          const showEvents = entries.length
            ? entries.map((entry) => $.armEvent(entry, "on_show"))
            : [{ name: "show", after: e.after, over: e.over, ease: e.ease }];
          const hideEvents = entries.length
            ? entries.map((entry) => $.armEvent(entry, "on_hide"))
            : [{ name: "hide", after: e.after, over: e.over, ease: e.ease }];
          const definitions = (events: typeof showEvents) =>
            events.flatMap((event) => $.getAnimationDefinition(event, instant) ?? []);
          const assets = e.assets;
          for (const entry of entries) {
            const entryTransition = $.context?.transition?.[entry.name];
            if (!entryTransition) {
              continue;
            }
            for (const [k, v] of Object.entries(entryTransition)) {
              if (!k.startsWith("$") && !k.startsWith("on_")) {
                const animateWith = typeof v === "string" ? v : v?.$name;
                if (animateWith) {
                  const animation = $.getAnimationDefinition(
                    { name: animateWith, ...$.withTiming(entry) },
                    instant,
                  );
                  if (animation) {
                    const arm = affected.find((a) => a.target === k);
                    if (arm) {
                      arm.animations.push(animation);
                    } else {
                      affected.push({ target: k, animations: [animation] });
                    }
                  }
                }
              }
            }
          }
          if (assets && assets.length > 0) {
            const content = $.withPictureLooks(() => {
              const imageNames = assets.join(" ");
              const videoSrcs = assets
                .map((a) => $.getVideoSrcByName(a))
                .filter((s): s is string => Boolean(s));
              const imageAssets = assets.filter(
                (a) => !$.getVideoSrcByName(a),
              );
              const picks = new Map<string, ImagePick | undefined>();
              const pickOf = (a: string) => {
                if (!picks.has(a)) {
                  picks.set(a, $.imagePick(e, a));
                }
                return picks.get(a);
              };
              const background =
                imageAssets.length > 0
                  ? imageAssets
                      .map((a) => $.getBackgroundImageFromString(a, undefined, pickOf(a)))
                      .reverse()
                      .join(", ")
                  : "none";
              const srcsOf = (a: string) =>
                pickOf(a) === undefined
                  ? $.getImageSrcsFromValue(a)
                  : $.getImageAssets("", a, undefined, pickOf(a)).map((asset) => asset.src);
              const src = imageAssets.flatMap((a) => srcsOf(a))[0];
              const srcs = [
                ...new Set([
                  ...imageAssets
                    .flatMap((a) => srcsOf(a) ?? [])
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
              const sources = [
                ...new Set(
                  imageAssets.flatMap((a) => {
                    const named = srcsOf(a);
                    return named?.length
                      ? named
                      : $.getImageUrlsFromBackground($.getBackgroundImageFromString(a, undefined, pickOf(a)));
                  }),
                ),
              ];
              if (sources.length > 0) {
                content.sources = sources;
              }
              const videoSrc = videoSrcs[0];
              if (videoSrc) {
                content.video = {
                  src: videoSrc,
                  loop: !e.once,
                  muted: Boolean(e.mute),
                  ...$.getMovieMixer(),
                  ...($.showsMovieStill() ? { preview: true } : {}),
                };
              }
              const morph = $.getMorphContent(imageAssets, pickOf, shown);
              if (morph) {
                content.morph = morph;
              }
              const pictures = $.getLayeredPictures(imageAssets, pickOf);
              if (pictures.length > 0) {
                content.pictures = pictures;
              }
              return content;
            });
            if (e.control === "show") {
              const enterAnimations = definitions(showEvents);
              if (enterAnimations.length > 0) {
                content.enterAnimations = enterAnimations;
              }
              const previousHideAnimations = definitions(hideEvents);
              if (previousHideAnimations.length > 0) {
                content.previousHideAnimations = previousHideAnimations;
              }
            } else if (e.control === "hide") {
              const exitAnimations = definitions(hideEvents);
              if (exitAnimations.length > 0) {
                content.exitAnimations = exitAnimations;
              }
            } else if (e.control === "animate" && entries.length > 1) {
              targetAnimations.push(...definitions(showEvents));
            } else if (e.control === "animate") {
              const enterAnimations = definitions(showEvents);
              if (enterAnimations.length > 0) {
                content.enterAnimations = enterAnimations;
              }
            }
            out.content = content;
            if (framing) {
              out.framing = framing;
            }
          } else {
            if (e.control === "hide") {
              targetAnimations.push(...definitions(hideEvents));
            } else if (e.control === "show") {
              if (framing) {
                out.framing = framing;
              }
              targetAnimations.push(...definitions(showEvents));
            } else if (e.control === "animate") {
              for (const entry of entries) {
                const animation = $.getAnimationDefinition(
                  { name: entry.name, ...$.withTiming(entry) },
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
        view?: PictureView,
        exits = false,
        elements?: Element[],
      ) {
        const targetEls = elements ?? $.textElements(target);
        if (instant) {
          $.dropExits((el) => targetEls.includes(el));
        }
        if (!sequence && $.knownEmpty("image", targetEls)) {
          return;
        }
        const moving = !instant && $.moving();
        const arriving: Element[] = [];
        const hides = sequence ? pictureHide(sequence) : undefined;
        const leaving = targetEls.filter(
          (targetEl) =>
            (!sequence || hides === "plain") &&
            $.leaves(targetEl, "image", (keepShown) =>
              this.hide(target, targetEl, keepShown, sequence, view),
            ),
        );
        for (const targetEl of leaving) {
          $.noteHidden(targetEl, !sequence);
        }
        const writing = targetEls.filter((el) => !leaving.includes(el));
        for (const targetEl of writing) {
          if (hides) {
            $.noteHidden(targetEl, false);
            const contents = $.contentsOf(targetEl);
            contents.delete("image");
            $.updateElement(targetEl, {
              style: { display: null },
              ...presenceAttributes(
                contents.size === 0 ? $.settleMark(targetEl) : {},
              ),
            });
          } else if (sequence) {
            $.noteHidden(targetEl, false);
            const arrives = $.arrives(targetEl, "image", moving);
            if (arrives) {
              arriving.push(targetEl);
            }
            $.updateElement(targetEl, {
              style: { display: null },
              ...presenceAttributes($.presenceMark(targetEl, arrives)),
            });
          } else if ($.contentsOf(targetEl).size === 0) {
            $.noteHidden(targetEl, true);
            $.updateElement(targetEl, {
              style: { display: "none" },
              ...presenceAttributes($.settleMark(targetEl)),
            });
          }
        }
        $.noteContent("image", writing, !sequence);
        if (writing.length === 0) {
          return;
        }
        const exit: PictureExit | undefined =
          exits && !instant && sequence?.some((e) => e.with || e.after || e.over)
            ? { elements: writing, epoch: $._game.connection.epoch }
            : undefined;
        if (exit) {
          $._exits.add(exit);
        }
        $.flushUIBatch();
        if (arriving.length > 0) {
          void $.present(arriving, "show");
        }
        const request = $.onLine(
          WriteImageMessage.type.request({
            target,
            instructions: sequence ? this.resolve(sequence, instant, view) : [],
            instant,
            ...(time != null ? { time } : {}),
            ...(leaving.length > 0 || $.namesWriteElements(target, writing)
              ? { elements: writing.map((el) => el.id) }
              : {}),
            ...(exit ? { reportsExit: true } : {}),
          }),
          !instant &&
            (writing.some((el) => !arriving.includes(el)) ||
              Boolean(
                sequence?.some(
                  (e) => e.control === "animate" || e.with || e.after || e.over,
                ),
              )),
        );
        const written = $.emitSettled(request);
        if (exit) {
          const report = $._exitReports.get(request);
          void (report ? $.settled(request.method, report) : written).then(() =>
            $.endExit(exit),
          );
        }
        await written;
      }

      writeTo(
        target: string,
        elements: Element[],
        sequence: ImageInstruction[] | null,
        instant: boolean,
        time?: number,
        view?: PictureView,
        exits = false,
      ) {
        return this.applyChanges(target, sequence, instant, time, view, exits, elements);
      }

      protected hide(
        target: string,
        targetEl: Element,
        keepShown: boolean,
        sequence: ImageInstruction[] | null,
        view?: PictureView,
      ) {
        if (!keepShown) {
          $.updateElement(targetEl, {
            style: { display: "none" },
            attributes: { [PRESENCE_ATTRIBUTE]: null },
          });
        }
        $.noteContent("image", [targetEl], true);
        $.flushUIBatch();
        void $.emitSettled(
          WriteImageMessage.type.request({
            target,
            instructions: sequence ? this.resolve(sequence, true, view) : [],
            instant: true,
            elements: [targetEl.id],
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
        events: ImageInstruction[],
        instant = false,
        time?: number,
        speaker?: string,
      ) {
        const view = this.viewAfter($._state.image?.[target] ?? []);
        let reached = view;
        const sequence = events
          .filter((event) => {
            const onlyTravels = event.control === "animate" && event.to && !event.with && !event.assets?.length;
            const kept = !onlyTravels || reached.picture;
            reached = this.nextView(event, reached);
            return kept;
          })
          .map((event) =>
            event.assets?.length ? { ...event, speaker: speaker ?? "" } : event,
          );
        if (sequence.length === 0 && events.length > 0) {
          return;
        }
        const onScreen =
          $.pictureShown($._state.image?.[target]) ||
          $.exiting(target) ||
          sequence.some((e) => e.control === "show" && e.assets?.length);
        this.saveState(target, sequence);
        if ($._state.pictureCleared) {
          const refilled = new Set($.markedPaths(target));
          $._state.pictureCleared = $._state.pictureCleared.filter((path) => !refilled.has(path));
          if ($._state.pictureCleared.length === 0) {
            delete $._state.pictureCleared;
          }
        }
        if (!$.context?.system?.simulating) {
          await this.applyChanges(
            target,
            sequence,
            instant,
            time,
            view,
            onScreen && !$.pictureShown($._state.image?.[target]),
          );
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
        waiting = false,
      ) {
        for (const targetEl of $.findElements(target)) {
          if (targetEl && (!waiting || $.streams.waits(targetEl))) {
            $.updateElement(targetEl, { style });
          }
        }
      }

      async update(
        target: string,
        style: Record<string, string | null> | null,
      ) {
        this.saveState(target, style);
        $.streams.saveEntryStyle(target, style, false);
        if (!$.context?.system?.simulating) {
          await this.applyChanges(target, style);
        }
      }

      async updateWaiting(
        target: string,
        style: Record<string, string | null> | null,
      ) {
        this.saveState(target, style);
        $.streams.saveEntryStyle(target, style, true);
        if (!$.context?.system?.simulating) {
          await this.applyChanges(target, style, true);
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

  Page = (($) => {
    class Page {
      protected _column?: Element;

      protected _elements: Element[] = [];

      protected _rendered: string[] = [];

      protected _options: Element[] = [];

      protected _choose?: (index: number) => void;

      protected _loaded = false;

      protected _resumed = false;

      protected _presented?: { instant: boolean; time?: number };

      get state(): PageState {
        return ($._state.page ??= { entries: [], current: 0 });
      }

      get entries(): readonly PageEntry[] {
        const page = $._state.page;
        return this.withEnding(page?.entries ?? []);
      }

      protected withEnding(entries: readonly PageEntry[]): PageEntry[] {
        const ending = $._state.page?.ending;
        return ending ? [...entries, { kind: "ending", ending }] : [...entries];
      }

      loaded(): void {
        this._loaded = true;
        const page = $._state.page;
        if (!page) {
          return;
        }
        const known = (entry: PageEntry) =>
          (PAGE_ENTRY_KINDS as readonly string[]).includes(entry.kind);
        page.current = page.entries.slice(0, page.current).filter(known).length;
        page.entries = page.entries.filter(known);
        if (page.absorbed) {
          page.absorbed = page.absorbed.filter(known);
        }
      }

      shown(key: string): void {
        const page = this.state;
        const resumed =
          this._resumed &&
          page.key === key &&
          page.beat === page.shown;
        this._resumed = false;
        page.shown = (page.shown ?? 0) + 1;
        if (resumed) {
          page.beat = page.shown;
        }
      }

      holds(): boolean {
        const page = this.state;
        return page.beat !== undefined && page.beat === page.shown;
      }

      started(): void {
        this._resumed = this._loaded;
        this._loaded = false;
      }

      record(
        key: string,
        repeat: boolean,
        build: (before: readonly PageEntry[]) => PageRecord,
      ): void {
        const page = this.state;
        page.beat = page.shown;
        this._loaded = false;
        this._resumed = false;
        this._presented = undefined;
        const before = repeat
          ? [...page.entries.slice(0, page.current), ...(page.absorbed ?? [])]
          : page.entries;
        const { keep, entries } = build(before);
        const absorbed = before.slice(keep);
        page.entries = [...before.slice(0, keep), ...entries];
        page.current = keep;
        page.key = key;
        delete page.ending;
        if (absorbed.length > 0) {
          page.absorbed = absorbed;
        } else {
          delete page.absorbed;
        }
      }

      choose(index: number): void {
        const page = $._state.page;
        if (!page) {
          return;
        }
        const at = page.entries.findIndex(
          (entry, i) => i >= page.current && entry.kind === "options",
        );
        const option = at >= 0 ? page.entries[at]!.options?.[index] : undefined;
        if (!option) {
          return;
        }
        page.entries[at] = {
          ...page.entries[at],
          kind: "chosen",
          text: option.map(({ after, over, ...event }) => event),
        };
        delete page.entries[at]!.options;
        this.show(true);
      }

      end(ending: StoryEnding | null): void {
        if (ending) {
          this.state.ending = ending;
        } else if ($._state.page?.ending) {
          delete $._state.page.ending;
        } else {
          return;
        }
        this.sync(this._presented);
      }

      onChoose(choose: (index: number) => void): void {
        this._choose = choose;
      }

      focus(index: number | null): void {
        if ($.context?.system?.simulating) {
          return;
        }
        this._options.forEach((button, i) => {
          $.updateElement(button, {
            attributes: { "data-focused": i === index ? "" : null },
          });
        });
      }

      forget(): void {
        this._column = undefined;
        this._elements = [];
        this._rendered = [];
        this._options = [];
      }

      show(instant: boolean, time?: number): void {
        this._presented = { instant, time };
        this.sync(this._presented);
      }

      mounted(): void {
        this.sync(this._presented);
      }

      restore(): void {
        this._presented = { instant: true };
        this.sync(this._presented, 0);
      }

      protected scroller(column: Element): Element | null {
        for (let el = column.parent; el; el = el.parent) {
          if (el.name.split(" ").includes(PAGE_SCROLLER)) {
            return el;
          }
        }
        return column.parent;
      }

      protected sync(
        presented?: { instant: boolean; time?: number },
        rewriteFrom?: number,
      ): void {
        if ($.context?.system?.simulating) {
          return;
        }
        const instant = presented?.instant ?? true;
        const time = presented?.time;
        const column = $.findElements(PAGE_COLUMN)[0];
        if (!column) {
          this.forget();
          return;
        }
        if (column !== this._column) {
          this.forget();
          this._column = column;
          const scroller = this.scroller(column);
          if (scroller) {
            $.updateElement(scroller, {
              attributes: { "data-follow": "end" },
            });
          }
        }
        const page = $._state.page;
        const current = page?.current ?? 0;
        const entries = this.withEnding(
          (page?.entries ?? []).slice(0, presented ? undefined : current),
        );
        const signatures = entries.map((entry) => JSON.stringify(entry));
        let kept = 0;
        while (
          kept < entries.length &&
          kept < this._rendered.length &&
          this._rendered[kept] === signatures[kept]
        ) {
          kept += 1;
        }
        for (let i = this._elements.length - 1; i >= kept; i -= 1) {
          $.destroyElement(this._elements[i]!);
        }
        this._elements.length = kept;
        this._rendered.length = kept;
        if (instant) {
          for (let i = rewriteFrom ?? current; i < kept; i += 1) {
            this.writeEntry(this._elements[i]!, entries[i]!, true);
          }
        }
        for (let i = kept; i < entries.length; i += 1) {
          const entry = entries[i]!;
          const typed = !instant && i >= current;
          this._elements.push(this.build(column, entry, i >= current, typed, time));
          this._rendered.push(signatures[i]!);
        }
      }

      protected build(
        column: Element,
        entry: PageEntry,
        current: boolean,
        typed: boolean,
        time?: number,
      ): Element {
        if (entry.kind === "rule") {
          return $.createElement(column, { type: "hr", name: "textstream_rule" });
        }
        if (entry.kind === "ending") {
          const ending = entry.ending ?? "out";
          return $.createElement(column, {
            name:
              ending === "error"
                ? "textstream_end alert"
                : "textstream_end muted",
            attributes: { role: "status" },
            content: { text: endingStatusText(ending) },
          });
        }
        if (entry.kind === "options") {
          const group = $.createElement(column, {
            name: "textstream_options",
            attributes: { role: "group", "aria-label": "Choices" },
          });
          const buttons = (entry.options ?? []).map((option, index) => {
            const button = $.createElement(group, {
              type: "button",
              name: "textstream_option",
              attributes: { type: "button", ...(current ? {} : { disabled: "" }) },
            });
            $.createElement(button, { name: "text accent" });
            void $.text.writeElements(button.id, [button], option, !typed, time);
            if (current) {
              $.markHandler(button);
              $.enqueueUI(
                ObserveElementMessage.type.notification({
                  element: button.id,
                  event: "click",
                  stopPropagation: true,
                  once: false,
                }),
              );
              ($._events["click"] ??= {})[button.id] = () => {
                if (!$._game.ending) {
                  this._choose?.(index);
                }
              };
            }
            return button;
          });
          if (current) {
            this._options = buttons;
          }
          return group;
        }
        const names: Record<string, string> = {
          action: "textstream_action",
          dialogue: "textstream_dialogue",
          heading: "textstream_heading muted",
          chosen: "textstream_chosen muted",
        };
        const el = $.createElement(column, { name: names[entry.kind] });
        if (entry.name) {
          $.createElement(el, {
            type: "span",
            name: "textstream_name accent",
            content: { text: entry.name },
          });
        }
        $.createElement(el, { name: "text" });
        this.writeEntry(el, entry, !typed, time);
        return el;
      }

      protected writeEntry(
        el: Element,
        entry: PageEntry,
        instant: boolean,
        time?: number,
      ): void {
        if (entry.kind === "options") {
          const buttons = el.children.filter((child) =>
            child.name.split(" ").includes("textstream_option"),
          );
          buttons.forEach((button, index) => {
            const option = entry.options?.[index];
            if (option) {
              void $.text.writeElements(button.id, [button], option, instant, time);
            }
          });
          return;
        }
        if (!entry.text) {
          return;
        }
        void $.text.writeElements(
          el.id,
          [el],
          entry.text,
          instant,
          time,
          instant ? 0 : (entry.shown ?? 0),
        );
      }
    }
    return Page;
  })(this);

  Streams = (($) => {
    class Streams {
      protected _mounted = new Map<string, MountedStream[]>();

      protected _reveals = new Map<string, Presented>();

      get active(): boolean {
        return this._mounted.size > 0;
      }

      protected _presented?: { instant: boolean; time?: number };

      protected _loaded = false;

      protected _resumed = false;

      entries(layout: string, index = 0): readonly StreamEntry[] {
        return $._state.streams?.[streamKey(layout, index)]?.entries ?? [];
      }

      loaded(): void {
        this._loaded = true;
        this._reveals.clear();
      }

      started(): void {
        this._resumed = this._loaded;
        this._loaded = false;
      }

      shown(key: string): void {
        const resumed = this._resumed;
        this._resumed = false;
        if (!resumed) {
          return;
        }
        const beat = $.page.state.shown ?? 0;
        for (const stream of Object.values($._state.streams ?? {})) {
          if (stream.key === key && stream.beat === beat - 1) {
            stream.beat = beat;
          }
        }
      }

      record(instructions: Instructions): void {
        this._presented = undefined;
        const sparkle = $._game.program?.sparkle;
        const events = Object.values(instructions.layout ?? {}).flat();
        const beat = $.page.state.shown ?? 0;
        const key = pageKey(instructions);
        const states = $._state.streams ?? {};
        const live: Record<string, StreamState> = {};
        for (const layout of $.openedLayoutsAfter(events)) {
          const restarted = events.some(
            (event) =>
              event.name === layout &&
              (event.control === LayoutVerb.clear ||
                event.control === LayoutVerb.close),
          );
          layoutStreams(sparkle, layout).forEach((node, index) => {
            const id = streamKey(layout, index);
            const stream = states[id] ?? { entries: [], current: 0 };
            const repeat = stream.beat === beat || Boolean(instructions.hold);
            this.recordStream(stream, node, instructions, { repeat, restarted });
            stream.beat = beat;
            stream.key = key;
            live[id] = stream;
          });
        }
        if (Object.keys(live).length > 0) {
          $._state.streams = live;
        } else {
          delete $._state.streams;
        }
      }

      protected recordStream(
        stream: StreamState,
        node: StreamNode,
        instructions: Instructions,
        options: { repeat: boolean; restarted: boolean },
      ): void {
        const before = options.repeat
          ? [...stream.entries.slice(0, stream.current), ...(stream.absorbed ?? [])]
          : stream.entries;
        const entry = this.entryFor(node, instructions);
        if (options.restarted && !options.repeat) {
          stream.cleared = (stream.cleared ?? 0) + 1;
        }
        let keep = options.restarted ? 0 : before.length;
        const last = before[keep - 1];
        if (
          entry?.shown &&
          last?.template === entry.template &&
          Object.keys(entry.shown).every((target) => last.text[target])
        ) {
          keep -= 1;
        }
        const absorbed = before.slice(keep);
        stream.entries = [...before.slice(0, keep), ...(entry ? [entry] : [])];
        stream.current = keep;
        for (const index of Object.keys(stream.styles ?? {})) {
          if (Number(index) >= keep) {
            delete stream.styles![Number(index)];
          }
        }
        if (absorbed.length > 0) {
          stream.absorbed = absorbed;
        } else {
          delete stream.absorbed;
        }
      }

      protected entryFor(
        node: StreamNode,
        instructions: Instructions,
      ): StreamEntry | undefined {
        const text = Object.fromEntries(
          Object.entries(instructions.text ?? {}).filter(
            ([target]) => !target.startsWith("choice "),
          ),
        );
        const lines = Object.keys(text).filter(
          (target) => !SPEAKER_TARGETS.includes(target),
        );
        const template = node.templates.findIndex((child) =>
          [child.tag, child.name, ...child.classes].some(
            (name) => name !== undefined && lines.includes(name),
          ),
        );
        if (template < 0) {
          return undefined;
        }
        const entry: StreamEntry = { template, text };
        const shown = Object.fromEntries(
          Object.entries(instructions.extended ?? {}).filter(
            ([target, count]) => count > 0 && text[target],
          ),
        );
        if (Object.keys(shown).length > 0) {
          entry.shown = shown;
        }
        return entry;
      }

      mounted(stream: MountedStream): void {
        const mounts = (this._mounted.get(stream.key) ?? []).filter((m) =>
          $.attached(m.element),
        );
        mounts.push(stream);
        this._mounted.set(stream.key, mounts);
        if (!$.context?.system?.simulating) {
          this.render(stream, this._presented, 0);
        }
      }

      forget(): void {
        this._mounted.clear();
      }

      waits(el: Element): boolean {
        if (!$.insideStream(el)) {
          return true;
        }
        for (const mounts of this._mounted.values()) {
          for (const mount of mounts) {
            const view = this.waiting(mount);
            if (
              view &&
              $.collectNodes(view.group).some((root) => {
                for (let node: Element | null = el; node; node = node.parent) {
                  if (node === root) {
                    return true;
                  }
                }
                return false;
              })
            ) {
              return true;
            }
          }
        }
        return false;
      }

      protected waiting(mount: MountedStream): StreamEntryView | undefined {
        const stream = $._state.streams?.[mount.key];
        if (!stream || stream.entries.length <= stream.current) {
          return undefined;
        }
        return mount.entries[stream.current];
      }

      saveEntryStyle(
        target: string,
        style: Record<string, string | null> | null,
        waiting: boolean,
      ): void {
        for (const stream of Object.values($._state.streams ?? {})) {
          const indices = waiting
            ? stream.entries.length > stream.current
              ? [stream.current]
              : []
            : Object.keys(stream.styles ?? {})
                .map(Number)
                .filter((index) => stream.styles?.[index]?.[target]);
          for (const index of indices) {
            stream.styles ??= {};
            const styles = (stream.styles[index] ??= {});
            if (!style) {
              delete styles[target];
              continue;
            }
            const state = (styles[target] ??= {});
            for (const [k, v] of Object.entries(style)) {
              state[k] = v ?? "";
            }
          }
        }
      }

      protected applyStyles(
        mount: MountedStream,
        view: StreamEntryView,
        index: number,
      ): void {
        const styles = $._state.streams?.[mount.key]?.styles?.[index];
        if (!styles) {
          return;
        }
        const roots = $.collectNodes(view.group);
        for (const [target, saved] of Object.entries(styles)) {
          const style = Object.fromEntries(
            Object.entries(saved).map(([k, v]) => [k, v || null]),
          );
          for (const root of roots) {
            for (const el of root.isMatch(target)
              ? [root, ...$.searchForAll(root, target)]
              : $.searchForAll(root, target)) {
              $.updateElement(el, { style });
            }
          }
        }
      }

      show(instant: boolean, time?: number): void {
        this._presented = { instant, time };
        this.sync(this._presented, undefined, !instant);
      }

      restore(): void {
        this._presented = { instant: true };
        this.sync(this._presented, 0);
      }

      protected sync(
        presented: { instant: boolean; time?: number },
        rewriteFrom?: number,
        arriving = false,
      ): void {
        if ($.context?.system?.simulating) {
          return;
        }
        for (const [key, mounts] of [...this._mounted]) {
          const live = mounts.filter((m) => $.attached(m.element));
          if (live.length === 0) {
            this._mounted.delete(key);
            continue;
          }
          this._mounted.set(key, live);
          for (const mount of live) {
            this.render(mount, presented, rewriteFrom, arriving);
          }
        }
      }

      protected render(
        mount: MountedStream,
        presented?: { instant: boolean; time?: number },
        rewriteFrom?: number,
        arriving = false,
      ): void {
        const stream = $._state.streams?.[mount.key];
        const current = stream?.current ?? 0;
        const entries = (stream?.entries ?? []).slice(
          0,
          presented ? undefined : current,
        );
        const instant = presented?.instant ?? true;
        const time = presented?.time;
        const signatures = entries.map(
          (entry) => `${stream?.cleared ?? 0}:${JSON.stringify(entry)}`,
        );
        let kept = 0;
        while (
          kept < entries.length &&
          kept < mount.rendered.length &&
          mount.rendered[kept] === signatures[kept]
        ) {
          kept += 1;
        }
        const restarted = mount.rendered.some(
          (signature) => !signature.startsWith(`${stream?.cleared ?? 0}:`),
        );
        const shown = restarted ? 0 : mount.entries.length;
        for (let i = mount.entries.length - 1; i >= kept; i -= 1) {
          const group = mount.entries[i]!.group;
          if (restarted) {
            $.removeGroup(group);
          } else {
            for (const root of $.collectNodes(group)) {
              $.destroyElement(root);
            }
          }
        }
        mount.entries.length = kept;
        mount.rendered.length = kept;
        if (instant) {
          for (let i = rewriteFrom ?? current; i < kept; i += 1) {
            this.write(mount, i, entries[i]!, { complete: true });
            this.applyStyles(mount, mount.entries[i]!, i);
          }
        }
        for (let i = kept; i < entries.length; i += 1) {
          const entry = entries[i]!;
          const view = this.build(mount, entry);
          mount.entries.push(view);
          mount.rendered.push(signatures[i]!);
          this.applyStyles(mount, view, i);
          const reveal = this._reveals.get(this.revealKey(mount, i));
          const shownBefore = reveal ? reveal.complete : !presented || i < current;
          const atOnce = Boolean(presented?.instant) || shownBefore;
          this.write(
            mount,
            i,
            entry,
            atOnce ? { complete: true } : { complete: false, time: reveal?.time ?? time },
          );
          if (
            !atOnce &&
            arriving &&
            i >= shown &&
            $.moving() &&
            $.styled("show")
          ) {
            $.arrive($.collectNodes(view.group));
          }
        }
        const live = new Set(mount.rendered.map((_, i) => this.revealKey(mount, i)));
        for (const key of this._reveals.keys()) {
          if (key.startsWith(`${mount.key}\n`) && !live.has(key)) {
            this._reveals.delete(key);
          }
        }
        const latest = mount.entries.at(-1);
        if (latest !== mount.latest) {
          if (mount.latest && mount.entries.includes(mount.latest)) {
            this.mark(mount.latest, null);
          }
          if (latest) {
            this.mark(latest, "");
          }
          mount.latest = latest;
        }
      }

      remounted(replaced: (el: Element) => boolean): void {
        for (const mounts of this._mounted.values()) {
          for (const mount of mounts) {
            if (replaced(mount.element)) {
              continue;
            }
            const entries = $._state.streams?.[mount.key]?.entries ?? [];
            mount.entries.forEach((view, index) => {
              const entry = entries[index];
              if (!entry) {
                return;
              }
              const reveal = this._reveals.get(this.revealKey(mount, index)) ?? {
                complete: true,
              };
              if (this.write(mount, index, entry, reveal, replaced) && view === mount.latest) {
                this.mark(view, "");
              }
            });
          }
        }
      }

      retime(from: number, to: number): void {
        for (const reveal of this._reveals.values()) {
          if (reveal.time === from) {
            reveal.time = to;
          }
        }
      }

      protected revealKey(mount: MountedStream, index: number): string {
        return `${mount.key}\n${index}\n${mount.rendered[index]}`;
      }

      protected mark(view: StreamEntryView, latest: string | null): void {
        for (const root of $.collectNodes(view.group)) {
          $.updateElement(root, { attributes: { "data-latest": latest } });
        }
      }

      protected build(mount: MountedStream, entry: StreamEntry): StreamEntryView {
        const scope = $.makeScope(mount.scope.env, mount.scope.slots, mount.scope.base);
        const template = mount.node.templates[entry.template];
        const group = template
          ? $.mountChildren(mount.element, [template], scope, null)
          : [];
        return { group, scope };
      }

      protected write(
        mount: MountedStream,
        index: number,
        entry: StreamEntry,
        reveal: Presented,
        replaced?: (el: Element) => boolean,
      ): boolean {
        this._reveals.set(this.revealKey(mount, index), reveal);
        const instant = reveal.complete;
        const roots = $.collectNodes(mount.entries[index]!.group);
        let wrote = false;
        for (const [target, events] of Object.entries(entry.text)) {
          const elements = $.entryTargets(roots, target);
          const first = elements[0];
          if (!first || (replaced && !elements.some(replaced))) {
            continue;
          }
          for (const el of elements) {
            $.contentsOf(el).add("text");
          }
          wrote = true;
          void $.text.writeElements(
            first.id,
            elements,
            events,
            instant,
            reveal.time,
            instant ? 0 : (entry.shown?.[target] ?? 0),
          );
        }
        return wrote;
      }
    }
    return Streams;
  })(this);

  Casts = (($) => {
    class Casts {
      protected _mounted = new Map<string, MountedCast[]>();

      protected _pending = new Map<string, CastWrite>();

      get active(): boolean {
        return this._mounted.size > 0;
      }

      entries(layout: string, index = 0): readonly CastEntry[] {
        return $._state.casts?.[streamKey(layout, index)]?.entries ?? [];
      }

      pictureNames(): string[] {
        return Object.values($._state.casts ?? {}).flatMap((cast) =>
          cast.entries.flatMap((entry) =>
            Object.values(entry.image ?? {}).flatMap((events) =>
              events.flatMap((e) => (e.control === "show" && e.assets?.length ? e.assets : [])),
            ),
          ),
        );
      }

      forget(): void {
        this._pending.clear();
      }

      unmount(): void {
        this._mounted.clear();
        this._pending.clear();
      }

      protected _before = new Map<string, { beat: number; key: string; state: string }>();

      protected _loaded = false;

      protected _resumed = false;

      loaded(): void {
        this._loaded = true;
      }

      started(): void {
        this._resumed = this._loaded;
        this._loaded = false;
      }

      shown(key: string): void {
        const resumed = this._resumed;
        this._resumed = false;
        if (!resumed) {
          return;
        }
        const beat = $.page.state.shown ?? 0;
        for (const cast of Object.values($._state.casts ?? {})) {
          if (cast.key === key && cast.beat === beat - 1) {
            cast.beat = beat;
          }
        }
      }

      record(instructions: Instructions): void {
        const sparkle = $._game.program?.sparkle;
        const events = Object.values(instructions.layout ?? {}).flat();
        const states = $._state.casts ?? {};
        const live: Record<string, CastState> = {};
        const beat = $.page.state.shown ?? 0;
        const page = pageKey(instructions);
        const opened = $.openedLayoutsAfter(events);
        const showing = this.linesShowing(opened);
        for (const layout of opened) {
          const closed = events.some(
            (event) => event.name === layout && event.control === LayoutVerb.close,
          );
          layoutCasts(sparkle, layout).forEach((node, index) => {
            const key = streamKey(layout, index);
            let cast: CastState = (!closed && states[key]) || { entries: [], next: 0 };
            if ((cast.beat === beat && cast.key === page) || instructions.hold) {
              const before = this._before.get(key);
              if (!before || before.beat !== cast.beat || before.key !== cast.key) {
                live[key] = cast;
                return;
              }
              cast = JSON.parse(before.state) as CastState;
            } else {
              this._before.set(key, { beat, key: page, state: JSON.stringify(cast) });
            }
            this.recordCast(key, cast, node, instructions, showing, opened);
            cast.beat = beat;
            cast.key = page;
            live[key] = cast;
          });
        }
        if (Object.keys(live).length > 0) {
          $._state.casts = live;
        } else {
          delete $._state.casts;
        }
      }

      protected recordCast(
        key: string,
        cast: CastState,
        node: StreamNode,
        instructions: Instructions,
        showing: CastLine[],
        opened: readonly string[],
      ): void {
        const texts = Object.entries(instructions.text ?? {}).filter(
          ([target]) => !instructions.choices?.includes(target),
        );
        const speaker = instructions.speaker?.character || undefined;
        if (texts.length > 0) {
          if (speaker) {
            cast.latest = speaker;
            if (instructions.variant) {
              (cast.variants ??= {})[speaker] = instructions.variant;
            } else {
              delete cast.variants?.[speaker];
            }
          } else {
            delete cast.latest;
          }
        }
        const created = new Set<number>();
        const hidden = new Set<number>();
        const touched = new Set<string>();
        const holds = (target: string) => node.templates.some((t) => this.holds(t, target));
        const queue = (write: Omit<CastWrite, "key">) => this.queue({ key, ...write });
        const entryOf = (owner: string): CastEntry => {
          let entry = cast.entries.find((e) => e.speaker === owner);
          if (!entry) {
            entry = { id: cast.next, speaker: owner };
            cast.next += 1;
            cast.entries.push(entry);
            created.add(entry.id);
          }
          return entry;
        };
        const wrote = (entry: CastEntry, kind: CastWrite["kind"], target: string) => {
          touched.add(`${entry.id}|${kind}|${target}`);
          const emptied = entry.emptied?.filter((written) => written !== `${kind}|${target}`);
          if (emptied?.length) {
            entry.emptied = emptied;
          } else {
            delete entry.emptied;
          }
          if (showing.length > 0) {
            (entry.lines ??= {})[target] = showing;
          } else {
            delete entry.lines?.[target];
          }
        };
        for (const [target, events] of Object.entries(instructions.image ?? {})) {
          if (!holds(target)) {
            continue;
          }
          const sequences = new Map<CastEntry, ImageInstruction[]>();
          const add = (entry: CastEntry, event: ImageInstruction) => {
            sequences.set(entry, [...(sequences.get(entry) ?? []), event]);
          };
          for (const event of events) {
            if (event.assets?.length) {
              add(entryOf(this.ownerOf(event.assets[0]!)), {
                ...event,
                speaker: speaker ?? "",
              });
              continue;
            }
            for (const entry of cast.entries) {
              add(entry, event);
              if (event.control === "hide") {
                hidden.add(entry.id);
              }
            }
          }
          for (const [entry, sequence] of sequences) {
            const before = entry.image?.[target] ?? [];
            const view = $.image.viewAfter(before);
            const onScreen =
              $.pictureShown(before) ||
              sequence.some((e) => e.control === "show" && e.assets?.length);
            const after = $.image.recorded(before, sequence);
            (entry.image ??= {})[target] = after;
            wrote(entry, "image", target);
            queue({
              id: entry.id,
              kind: "image",
              target,
              image: sequence,
              view,
              exits: onScreen && !$.pictureShown(after),
            });
          }
        }
        if (speaker) {
          for (const [target, events] of texts) {
            if (!holds(target)) {
              continue;
            }
            const entry = entryOf(speaker);
            (entry.text ??= {})[target] = events;
            wrote(entry, "text", target);
            queue({
              id: entry.id,
              kind: "text",
              target,
              text: events,
              shown: instructions.extended?.[target] ?? 0,
            });
          }
        }
        if (!instructions.extended) {
          for (const entry of cast.entries) {
            for (const kind of ["image", "text"] as const) {
              const held = entry[kind] ?? {};
              for (const target of Object.keys(held)) {
                const written = `${kind}|${target}`;
                if (
                  touched.has(`${entry.id}|${written}`) ||
                  entry.emptied?.includes(written) ||
                  !node.templates.some((t) => this.clears(t, target)) ||
                  !this.holdsContent(entry, kind, target) ||
                  this.onScreen(entry.lines?.[target], opened)
                ) {
                  continue;
                }
                if (node.templates.some((t) => this.find(t, target, (n) => !marksClear(n)))) {
                  (entry.emptied ??= []).push(written);
                  queue({ id: entry.id, kind, target, [kind]: null, only: "marked" });
                  continue;
                }
                delete held[target];
                delete entry.lines?.[target];
                queue({ id: entry.id, kind, target, [kind]: null });
              }
            }
          }
        }
        cast.entries = cast.entries.filter((entry) =>
          this.empty(entry)
            ? !hidden.has(entry.id) && (created.size === 0 || created.has(entry.id))
            : true,
        );
        for (const entry of cast.entries) {
          const variant = cast.variants?.[entry.speaker];
          if (variant) {
            entry.variant = variant;
          } else {
            delete entry.variant;
          }
        }
      }

      protected queue(write: CastWrite): void {
        if ($.context?.system?.simulating) {
          return;
        }
        this._pending.set(`${write.key}|${write.id}|${write.kind}|${write.target}`, write);
      }

      protected ownerOf(asset: string): string {
        return getImageOwner($.context, asset) ?? (asset.split("@")[0] || asset);
      }

      protected linesShowing(opened: readonly string[]): CastLine[] {
        const lines: CastLine[] = Object.entries($._state.streams ?? {}).flatMap(
          ([key, stream]) =>
            stream.entries.length > stream.current
              ? [{ key, cleared: stream.cleared ?? 0, index: stream.current }]
              : [],
        );
        const page = $._state.page;
        if (page && opened.includes(PAGE_SCROLLER)) {
          page.entries.forEach((entry, index) => {
            if (index >= page.current) {
              const length = this.pageText(entry).length;
              lines.push({ key: PAGE_SCROLLER, index, length, hash: this.pageLine(entry, length) });
            }
          });
        }
        return lines;
      }

      protected pageText(entry: PageEntry): string {
        return (entry.text ?? []).map((t) => t.text).join("");
      }

      protected pageLine(entry: PageEntry, length: number): string {
        return hashText(`${entry.kind}|${entry.speaker ?? ""}|${this.pageText(entry).slice(0, length)}`);
      }

      protected onScreen(lines: CastLine[] | undefined, opened: readonly string[]): boolean {
        return (lines ?? []).some((line) => {
          if (line.key === PAGE_SCROLLER) {
            const entry = $._state.page?.entries[line.index];
            return (
              opened.includes(PAGE_SCROLLER) &&
              entry !== undefined &&
              line.hash === this.pageLine(entry, line.length ?? 0)
            );
          }
          const stream = $._state.streams?.[line.key];
          return (
            stream !== undefined &&
            (stream.cleared ?? 0) === line.cleared &&
            stream.entries.length > line.index
          );
        });
      }


      protected holdsContent(entry: CastEntry, kind: CastWrite["kind"], target: string): boolean {
        return kind === "image"
          ? $.pictureShown(entry.image?.[target])
          : (entry.text?.[target]?.length ?? 0) > 0;
      }

      protected empty(entry: CastEntry): boolean {
        return (
          !Object.keys(entry.image ?? {}).some((target) => this.holdsContent(entry, "image", target)) &&
          !Object.keys(entry.text ?? {}).some((target) => this.holdsContent(entry, "text", target))
        );
      }

      protected holds(template: BodyNode | undefined, target: string): boolean {
        return this.find(template, target, () => true);
      }

      protected clears(template: BodyNode | undefined, target: string): boolean {
        return this.find(template, target, marksClear);
      }

      protected find(
        node: BodyNode | undefined,
        target: string,
        accept: (node: ElementNode) => boolean,
        calls: readonly string[] = [],
      ): boolean {
        if (!node) {
          return false;
        }
        if (node.kind === "element") {
          const names = [node.tag, ...node.classes];
          if (target.split(" ").every((word) => names.includes(word)) && accept(node)) {
            return true;
          }
          const component = $._game.program?.sparkle?.components?.[node.tag];
          if (
            component &&
            !calls.includes(component.name) &&
            component.children.some((child) =>
              this.find(child, target, accept, [...calls, component.name]),
            )
          ) {
            return true;
          }
        }
        return bodyChildLists(node).some(([, children]) =>
          (children ?? []).some((child) => this.find(child, target, accept, calls)),
        );
      }

      mounted(mount: MountedCast): void {
        const mounts = (this._mounted.get(mount.key) ?? []).filter((m) =>
          $.attached(m.element),
        );
        mounts.push(mount);
        this._mounted.set(mount.key, mounts);
        if (!$.context?.system?.simulating) {
          this.render(mount, true);
        }
      }

      show(instant: boolean, time?: number): void {
        const pending = [...this._pending.values()];
        this._pending.clear();
        if ($.context?.system?.simulating) {
          return;
        }
        for (const mount of this.live()) {
          this.render(mount, instant, time, pending);
        }
      }

      restore(): void {
        this._pending.clear();
        if ($.context?.system?.simulating) {
          return;
        }
        for (const mount of this.live()) {
          this.render(mount, true, undefined, [], true);
        }
      }

      rewrite(mount: MountedCast, id: number, view: CastEntryView): void {
        const cast = $._state.casts?.[mount.key];
        const entry = cast?.entries.find((e) => e.id === id);
        if (entry) {
          this.mark(view, entry, cast);
          this.sync(view, entry, [], true, undefined, true);
        }
      }

      protected live(): MountedCast[] {
        const all: MountedCast[] = [];
        for (const [key, mounts] of [...this._mounted]) {
          const live = mounts.filter((m) => $.attached(m.element));
          if (live.length === 0) {
            this._mounted.delete(key);
            continue;
          }
          this._mounted.set(key, live);
          all.push(...live);
        }
        return all;
      }

      protected render(
        mount: MountedCast,
        instant: boolean,
        time?: number,
        pending: CastWrite[] = [],
        rewrite = false,
      ): void {
        const cast = $._state.casts?.[mount.key];
        const entries = cast?.entries ?? [];
        const ids = new Set(entries.map((entry) => entry.id));
        for (const [id, view] of [...mount.views]) {
          if (!ids.has(id)) {
            $.removeGroup(view.group);
            mount.views.delete(id);
          }
        }
        for (const entry of entries) {
          let view = mount.views.get(entry.id);
          const built = !view;
          if (!view) {
            view = this.build(mount);
            mount.views.set(entry.id, view);
          }
          this.mark(view, entry, cast);
          this.sync(
            view,
            entry,
            pending.filter((write) => write.key === mount.key && write.id === entry.id),
            instant,
            time,
            rewrite,
          );
          if (built && !instant && $.moving() && $.styled("show")) {
            $.arrive($.collectNodes(view.group));
          }
        }
      }

      protected build(mount: MountedCast): CastEntryView {
        const scope = $.makeScope(mount.scope.env, mount.scope.slots, mount.scope.base);
        const group = $.mountChildren(mount.element, mount.node.templates, scope, null);
        return { group, scope, written: new Map(), marks: "" };
      }

      protected mark(view: CastEntryView, entry: CastEntry, cast: CastState | undefined): void {
        const attributes = {
          "data-speaker": entry.speaker,
          "data-variant": entry.variant ?? null,
          "data-latest": cast?.latest === entry.speaker ? "" : null,
        };
        const roots = $.collectNodes(view.group);
        const marks = `${JSON.stringify(attributes)}|${roots.map((root) => root.id).join(" ")}`;
        if (view.marks === marks) {
          return;
        }
        view.marks = marks;
        for (const root of roots) {
          $.updateElement(root, { attributes });
        }
      }

      protected sync(
        view: CastEntryView,
        entry: CastEntry,
        writes: CastWrite[],
        instant: boolean,
        time?: number,
        force = false,
      ): void {
        const signature = (key: string, held: unknown) =>
          `${JSON.stringify(held)}${entry.emptied?.includes(key) ? "|emptied" : ""}`;
        const now = new Set<string>();
        for (const write of writes) {
          const key = `${write.kind}|${write.target}`;
          now.add(key);
          this.apply(view, write, instant, time);
          const held = entry[write.kind]?.[write.target];
          if (held) {
            view.written.set(key, signature(key, held));
          } else {
            view.written.delete(key);
          }
        }
        for (const kind of ["image", "text"] as const) {
          for (const [target, held] of Object.entries(entry[kind] ?? {})) {
            const key = `${kind}|${target}`;
            if (now.has(key)) {
              continue;
            }
            now.add(key);
            if (!force && view.written.get(key) === signature(key, held)) {
              continue;
            }
            if (entry.emptied?.includes(key)) {
              this.apply(view, { id: entry.id, kind, target, [kind]: held, only: "unmarked" }, true);
              this.apply(view, { id: entry.id, kind, target, [kind]: null, only: "marked" }, true);
            } else {
              this.apply(view, { id: entry.id, kind, target, [kind]: held }, true);
            }
            view.written.set(key, signature(key, held));
          }
        }
        for (const key of [...view.written.keys()]) {
          if (!now.has(key)) {
            const [kind, target] = key.split("|") as [CastWrite["kind"], string];
            this.apply(view, { id: entry.id, kind, target, [kind]: null }, true);
            view.written.delete(key);
          }
        }
      }

      protected apply(
        view: CastEntryView,
        write: Omit<CastWrite, "key">,
        instant: boolean,
        time?: number,
      ): void {
        const elements = $.entryTargets($.collectNodes(view.group), write.target).filter(
          (el) => !write.only || $._clearMarked.has(el) === (write.only === "marked"),
        );
        const first = elements[0];
        if (!first) {
          return;
        }
        if (write.kind === "image") {
          void $.image.writeTo(
            write.target,
            elements,
            write.image ?? null,
            instant,
            time,
            write.view,
            write.exits,
          );
          return;
        }
        void $.text.writeElements(
          first.id,
          elements,
          write.text ?? null,
          instant,
          time,
          instant ? 0 : (write.shown ?? 0),
        );
      }
    }
    return Casts;
  })(this);

  text = new this.Text();

  page = new this.Page();

  streams = new this.Streams();

  casts = new this.Casts();

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
    if (MorphStillMessage.type.isNotification(msg)) {
      this.reportMorphStill(msg.params);
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
