import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import AnimationHold from "../../../../spark-dom/src/classes/AnimationHold";
import AnimationPlayer, { getEffectTiming } from "../../../../spark-dom/src/classes/AnimationPlayer";
import LayoutMotion, { namesLayoutTransition } from "../../../../spark-dom/src/classes/LayoutMotion";
import PresencePlayer from "../../../../spark-dom/src/classes/PresencePlayer";
import { createImageElement } from "../../../../spark-dom/src/utils/createImageElement";
import { endTravelsWithin, haltPicture, placePicture, scheduleTravel, travelPicture } from "../../../../spark-dom/src/utils/placePicture";
import {
  createCutsceneElement,
  createVideoElement,
} from "../../../../spark-dom/src/utils/createVideoElement";
import { resolveAnimationTargets } from "../../../../spark-dom/src/utils/resolveAnimationTargets";
import { getCssTokenValue } from "../../../../spark-dom/src/utils/getCssTokenValue";
import { getElementContent } from "../../../../spark-dom/src/utils/getElementContent";
import { getHiddenUntilAnimation } from "../../../../spark-dom/src/utils/getHiddenUntilAnimation";
import { getRevealAnimation } from "../../../../spark-dom/src/utils/getRevealAnimation";
import { whenUnseen } from "../../../../spark-dom/src/utils/whenUnseen";
import { BeatMarks } from "../utils/BeatMarks";
import type { TextInstruction } from "../../../../spark-engine/src/game/core/types/Instruction";
import type { Animation } from "../../../../spark-engine/src/game/modules/ui/types/Animation";
import { AnimateElementsMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/AnimateElementsMessage";
import { BatchElementsMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/BatchElementsMessage";
import { BeginReconcileMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/BeginReconcileMessage";
import { CreateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/CreateElementMessage";
import { DestroyElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/DestroyElementMessage";
import { MoveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/MoveElementMessage";
import { ObserveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/ObserveElementMessage";
import { PresenceElementsMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/PresenceElementsMessage";
import { LayoutMotionMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/LayoutMotionMessage";
import {
  type PlayCutsceneParams,
  PlayCutsceneMessage,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/PlayCutsceneMessage";
import { SetThemeMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/SetThemeMessage";
import {
  type ShowingParams,
  ShowingMessage,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/ShowingMessage";
import {
  LINE_SPEAKER_ATTRIBUTE,
  LINE_VARIANT_ATTRIBUTE,
  SHOWING_ATTRIBUTE,
} from "../../../../spark-dom/src/utils/getStyleContent";
import { ColorSchemeHost } from "../ColorSchemeHost";
import { SkipCutsceneMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/SkipCutsceneMessage";
import { SweepReconcileMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/SweepReconcileMessage";
import { UnobserveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/UnobserveElementMessage";
import { UpdateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/UpdateElementMessage";
import {
  type WriteImageInstruction,
  WriteImageMessage,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { WriteTextMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { MorphArtifactMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/MorphArtifactMessage";
import { MorphNeedMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/MorphNeedMessage";
import { MorphStillMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/MorphStillMessage";
import {
  SpeechMessage,
  type SpeechParams,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/SpeechMessage";
import type { ThemeVariables } from "../../../../sparkle-style-transformer/src/types/themeVariables";
import { escapeCssIdentifier } from "../../../../sparkle-style-transformer/src/utils/themeVariableName";
import { PRESENCE_ATTRIBUTE } from "../../../../sparkle-style-transformer/src/utils/sparkleSelector";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getCssPropertyNames } from "../../../../sparkle-style-transformer/src/utils/getCssPropertyNames";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import type { StreamMessage } from "../../../../spark-engine/src/game/core/classes/Connection";
import { isAdvanceKey } from "../../../../spark-engine/src/game/core/utils/isAdvanceKey";
import { Manager } from "../Manager";
import type { LiveClip } from "./AudioManager";
import { MorphGroup, MorphPlayback, type MorphLayer } from "../morph/MorphPlayback";
import { keyframeScale } from "../utils/keyframeScale";
import { keptScroll, outOfFlow } from "../utils/outOfFlow";
import { ConfigureAssetsMessage } from "../../../../spark-engine/src/game/modules/assets/classes/messages/ConfigureAssetsMessage";
import { getEventData } from "../utils/getEventData";
import type { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import {
  BeatMessage,
  type BeatParams,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/BeatMessage";

type WriteDecision =
  | "skip"
  | "same"
  | "write"
  | "rebuild";

type WriteKind = typeof WriteTextMessage.type | typeof WriteImageMessage.type;

const FOLLOW_END_SLACK_PX = 4;

type WriteParams = { target: string; instructions: any[]; elements?: string[] };

interface HeldState {
  txt?: string;
  txtRev?: number;
  all?: unknown[];
  allRev?: number;
  img?: string;
  imgRev?: number;
  leaves: boolean;
  empty: boolean;
}

interface PendingBeat {
  params: BeatParams;
  ops: IMessage[];
  plan: Map<IMessage, WriteDecision>;
  at: number;
  lag: number;
  timer?: ReturnType<typeof setTimeout>;
  owner: UIManager;
  drawing?: MorphLayer[];
  drawTimer?: ReturnType<typeof setTimeout>;
  veil?: boolean;
}

type OverlayWithBeat = HTMLElement & { __sdBeat?: PendingBeat };

type OverlayWithShowing = HTMLElement & { __sdShowing?: Map<string, number> };

interface Cutscene {
  element: HTMLElement;
  end: (immediate?: boolean) => void;
  previewEpoch?: number;
}

type OverlayWithCutscene = HTMLElement & { __sdCutscene?: Cutscene };

interface ImageEffect {
  element: HTMLElement;
  animations: Animation[];
  after?: AnimationPlayer;
}

const COMMIT_WAIT_LIMIT_MS = 1_000;

const HELD_REVEAL_MS = 3_600_000;

const UNENDED_SPEECH = 1e9;

interface Speech {
  clips?: { retime: () => void; stopHearing?: () => void };
}

let playSessions = 0;

const MOVIE_IN_STEP = 0.25;

const MOVIE_AT = 0.01;

function beatOps(params: BeatParams): IMessage[] {
  return params.messages.flatMap((message) =>
    BatchElementsMessage.type.isNotification(message as NotificationMessage)
      ? (((message as NotificationMessage).params as { messages?: IMessage[] })
          ?.messages ?? [])
      : [message],
  );
}

function retiredOnly(msg: IMessage): boolean {
  if (BatchElementsMessage.type.isNotification(msg as NotificationMessage)) {
    const ops = ((msg as NotificationMessage).params as { messages?: IMessage[] })?.messages ?? [];
    return ops.length > 0 && ops.every(retiredOnly);
  }
  return (msg as { params?: { retired?: boolean } }).params?.retired === true;
}

function sameElements(a: HTMLElement[], b: HTMLElement[]): boolean {
  return a.length === b.length && a.every((el) => b.includes(el));
}

function movesPicture(instruction: WriteImageInstruction): boolean {
  if (!instruction.travel) {
    return false;
  }
  const { delay = 0, duration = 0 } = getEffectTiming(instruction.travel.timing);
  return Number(delay) > 0 || Number(duration) > 0;
}

let travelWrites = 0;

function drawsPicture(instruction: WriteImageInstruction): boolean {
  const content = instruction.content;
  return instruction.control !== "hide" && !!content && !content.video && (!!content.morph || (content.pictures?.length ?? 0) > 0);
}

function imageSignature(instructions: WriteImageInstruction[]): string {
  const sig = JSON.stringify(instructions);
  if (!instructions.some(movesPicture)) {
    return sig;
  }
  travelWrites += 1;
  return `${sig}#travel-${travelWrites}`;
}

function getThemeKey(variables: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of [...variables].sort().join("\n")) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  }
  return `${variables.length}:${(hash >>> 0).toString(36)}`;
}

function createSignature(
  themeKey: string,
  params: {
    type: string;
    name?: string;
    content?: unknown;
    style?: unknown;
    attributes?: unknown;
  },
): string {
  const content = params.content;
  const themed =
    params.style != null ||
    (typeof content === "object" &&
      content !== null &&
      ("styles" in content || "animations" in content));
  return JSON.stringify([
    themed ? themeKey : null,
    params.type,
    params.name ?? null,
    params.content ?? null,
    params.style ?? null,
    params.attributes ?? null,
  ]);
}

export function pendingBeatImageSrcs(
  overlay: HTMLElement | null | undefined,
): string[] {
  const pending = (overlay as OverlayWithBeat | null | undefined)?.__sdBeat;
  if (!pending) {
    return [];
  }
  return beatOps(pending.params).flatMap((op) =>
    WriteImageMessage.type.isRequest(op as RequestMessage)
      ? (op as ReturnType<typeof WriteImageMessage.type.request>).params.instructions.flatMap(
          (i) =>
            (i.content?.srcs ?? []).filter(
              (src): src is string => typeof src === "string" && !!src,
            ),
        )
      : [],
  );
}

function applyAttribute(element: Element, k: string, v: string | null): void {
  const tag = element.tagName;
  if (k === "checked" && tag === "INPUT") {
    (element as HTMLInputElement).checked = v != null;
    return;
  }
  if (k === "value" && (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA")) {
    if (element.ownerDocument.activeElement !== element) {
      (element as HTMLInputElement).value = v ?? "";
    }
    return;
  }
  if (k === "id" && v == null) {
    const structural = (element as any).__sdId;
    if (structural) {
      element.setAttribute("id", structural);
      return;
    }
  }
  if (v == null) {
    element.removeAttribute(k);
  } else {
    element.setAttribute(k, v);
  }
}

function applyAttributes(
  element: Element,
  attributes: Record<string, string | null>,
): void {
  const deferred: [string, string | null][] = [];
  Object.entries(attributes).forEach(([k, v]) => {
    if (k === "value" || k === "checked") {
      deferred.push([k, v]);
    } else {
      applyAttribute(element, k, v);
    }
  });
  deferred.forEach(([k, v]) => applyAttribute(element, k, v));
}

export default class UIManager extends Manager {
  protected _breakpoints: Record<string, number> = {};

  protected _theme: ThemeVariables = new Set();

  protected _hold = new AnimationHold();

  protected _layoutMotion = new LayoutMotion(this._hold);
  protected _presence = new PresencePlayer(
    this._hold,
    () =>
      this.app.overlay?.ownerDocument.defaultView?.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches ?? false,
  );

  protected _heldAt?: number;

  protected _lag = 0;

  protected _beatMarks = new BeatMarks();

  protected _drawTimeouts = { beat: 8, restore: 2 };

  protected _prepared = new Map<WriteImageInstruction, Map<HTMLElement, HTMLElement>>();

  protected _themeKey = getThemeKey([]);

  protected _listeners: Record<string, Record<string, (event: Event) => void>> =
    {};

  protected _elements = new Map<string, HTMLElement>();

  protected _staleIds = new Set<string>();

  protected _staleImageTargets = new Set<HTMLElement>();

  protected _staleTextTargets = new Set<HTMLElement>();

  protected _placeCursor = new Map<Element, Element>();

  protected _passBegun = false;

  protected _decision?: WriteDecision;

  override async onInit() {
    await super.onInit();
    const morphs = this.morphs;
    if (morphs) {
      morphs.askGame = (key) => this.app.emit(MorphNeedMessage.type.notification({ key }));
      morphs.reportStill = (params) => this.app.emit(MorphStillMessage.type.notification(params));
      morphs.keepWhole = (srcs) => (this.app.assets?.cache ?? this.app.assetCache)?.keepWhole(srcs);
      morphs.placeholders = this.app.placeholders === true;
      morphs.residentPicture = (src) => {
        const picture = (this.app.assets?.cache ?? this.app.assetCache)?.picture(src);
        return picture ? { ...picture, image: picture.image as unknown as CanvasImageSource } : undefined;
      };
    }
    this.beginReconcilePass();
    this.endCutscene(true);
  }

  beginReconcilePass(content = false) {
    this._staleIds.clear();
    this._staleImageTargets.clear();
    this._staleTextTargets.clear();
    if (!content) {
      this._placeCursor.clear();
    }
    this.morphs?.beginPass();
    const overlay = this.app.overlay;
    if (overlay) {
      overlay.querySelectorAll("*").forEach((node) => {
        const el = node as HTMLElement;
        const structural = (el as any).__sdId;
        if (structural) {
          if (!content) {
            this._staleIds.add(structural);
          }
          this._elements.set(structural, el);
        }
        if ((el as any).__sdImg !== undefined) {
          this._staleImageTargets.add(el);
        }
        if ((el as any).__sdTxt !== undefined) {
          this._staleTextTargets.add(el);
        }
      });
    }
  }

  sweepReconcile() {
    for (const id of this._staleIds) {
      this.touch([this.getElement(id)?.parentElement]);
      this.removeElementById(id);
    }
    this._staleIds.clear();
    for (const el of this._staleImageTargets) {
      if (el.isConnected) {
        this.clearImageLayers(el);
      }
    }
    this._staleImageTargets.clear();
    for (const el of this._staleTextTargets) {
      if (el.isConnected) {
        this.clearWrittenText(el);
      }
    }
    this._staleTextTargets.clear();
    this.morphs?.endPass();
  }

  protected clearWrittenText(el: HTMLElement, all = false) {
    for (const leaf of [
      ...this.getContentElements(el, "text"),
      ...this.getContentElements(el, "stroke"),
    ]) {
      if (all) {
        leaf.replaceChildren();
      } else {
        this.removeWritten(leaf);
      }
    }
    (el as any).__sdWait?.cancel();
    delete (el as any).__sdWait;
    delete (el as any).__sdTxt;
    delete (el as any).__sdTxtRev;
    (el as any).__sdAll = [];
    (el as any).__sdAllRev = (el as any).__sdRev ?? 0;
  }

  protected removeWritten(leaf: HTMLElement) {
    for (const child of Array.from(leaf.children)) {
      if (!(child as any).__sdId) {
        child.remove();
      }
    }
  }

  protected clearImageLayers(el: HTMLElement) {
    for (const tag of ["image", "mask"]) {
      for (const contentEl of this.getContentElements(el, tag)) {
        this.releaseMovies(contentEl);
        this.morphs?.releaseWithin(contentEl);
        endTravelsWithin(contentEl);
        contentEl.replaceChildren();
      }
    }
    delete (el as any).__sdImg;
  }

  protected removeListeners(id: string) {
    const byEvent = this._listeners[id];
    if (byEvent) {
      const el = this._elements.get(id);
      if (el) {
        for (const [event, listener] of Object.entries(byEvent)) {
          el.removeEventListener(event, listener);
        }
      }
      delete this._listeners[id];
    }
  }

  protected removeElementById(id: string) {
    const el = this._elements.get(id) ?? this.getElement(id);
    if (el) {
      this.removeListeners(id);
      this._elements.delete(id);
      el.querySelectorAll("*").forEach((d) => {
        const childId = (d as any).__sdId;
        if (childId) {
          this.removeListeners(childId);
          this._elements.delete(childId);
          this._staleIds.delete(childId);
        }
      });
      this.releaseMovies(el);
      this.morphs?.releaseWithin(el);
      endTravelsWithin(el);
      this._presence.endWithin(el);
      el.remove();
    }
    this._staleIds.delete(id);
  }

  get morphs(): MorphPlayback | undefined {
    const overlay = this.app.overlay;
    return overlay ? MorphPlayback.for(overlay) : undefined;
  }

  override onStart() {
    const morphs = this.morphs;
    morphs?.attachClock(this);
    morphs?.setSession(`play:${++playSessions}`);
    this.endSpeech();
    this._morphClockSeen = undefined;
  }

  protected _morphClockSeen?: number;

  override onUpdate(time: Clock) {
    const elapsed = time.elapsedTime;
    const seen = this._morphClockSeen;
    this._morphClockSeen = elapsed;
    if (seen !== undefined && elapsed > seen) {
      this.morphs?.advance(elapsed - seen);
    }
    this.settleMovies();
  }

  override onPause() {
    if (this._heldAt == null) {
      this._heldAt = this.documentNow();
    }
    this._hold.pause();
    this.scheduleCommit();
    this.morphs?.setPaused(true);
    this.pauseMovies();
  }

  override onUnpause() {
    if (this._heldAt != null) {
      this._lag += this.documentNow() - this._heldAt;
      this._heldAt = undefined;
    }
    this._hold.resume();
    this.morphs?.setPaused(false);
    this._speech?.clips?.retime();
    this.resumeMovies();
    this.scheduleCommit();
  }

  protected documentNow(): number {
    const doc = this.app.overlay?.ownerDocument;
    return Number(
      doc?.timeline?.currentTime ?? doc?.defaultView?.performance.now(),
    );
  }

  protected lag(now = this.documentNow()): number {
    return this._lag + (this._heldAt != null ? now - this._heldAt : 0);
  }

  override onDispose() {
    this.endSpeech();
    this._layoutMotion.settle();
    this._presence.endAll();
    this._hold.release();
    for (const id of Object.keys(this._listeners)) {
      this.removeListeners(id);
    }
    this._listeners = {};
    this._elements.clear();
    this._disposed = true;
    this._unsettledMovies.clear();
    this.endCutscene(true);
    for (const video of this.movies()) {
      video.pause();
      delete (video as any).__sdMovie;
      delete (video as any).__sdManager;
      delete (video as any).__sdSeek;
    }
    const morphs = this.morphs;
    morphs?.detachClock(this);
    morphs?.setPaused(false);
    const overlay = this.app.overlay as OverlayWithBeat | undefined;
    const pending = overlay?.__sdBeat;
    if (overlay && pending?.owner === this) {
      overlay.__sdBeat = undefined;
      clearTimeout(pending.timer);
      clearTimeout(pending.drawTimer);
      this._beatMarks.dropped(pending.params);
      for (const op of pending.ops) {
        if (
          AnimateElementsMessage.type.isRequest(op as RequestMessage) ||
          PresenceElementsMessage.type.isRequest(op as RequestMessage) ||
          LayoutMotionMessage.type.isRequest(op as RequestMessage) ||
          (WriteImageMessage.type.isRequest(op as RequestMessage) &&
            (op as ReturnType<typeof WriteImageMessage.type.request>).params.reportsExit)
        ) {
          this.app.answer(
            op as RequestMessage,
            Promise.reject(new Error("the beat was called off")),
          );
        }
      }
    }
    this.liftVeil();
    this.revealPrecreated();
    for (const waiting of this._waitingBeats.splice(0)) {
      this._beatMarks.dropped(waiting);
    }
    this._beatMarks.clear();
    this.discardAllPrepared();
  }

  protected followEnd(el: HTMLElement) {
    if ((el as any).__sdFollow) {
      return;
    }
    const follow = { pinned: true, moving: false };
    (el as any).__sdFollow = follow;
    const atEnd = () =>
      el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_END_SLACK_PX;
    const toEnd = () => {
      const reduce = this.reducesMotion();
      follow.moving = true;
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
      if (reduce || atEnd()) {
        follow.moving = false;
      }
    };
    const reading = () => {
      follow.moving = false;
    };
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
      el.addEventListener(event, reading, { passive: true });
    }
    el.addEventListener(
      "scroll",
      () => {
        if (follow.moving) {
          if (atEnd()) {
            follow.moving = false;
          }
          return;
        }
        follow.pinned = atEnd();
      },
      { passive: true },
    );
    const view = el.ownerDocument.defaultView;
    const Observer = view?.MutationObserver;
    if (Observer) {
      new Observer(() => {
        if (follow.pinned) {
          toEnd();
        }
      }).observe(el, { childList: true, subtree: true });
    }
  }

  getElement(id: string | null | undefined) {
    if (!id) {
      return this.app.overlay;
    }
    const cached = this._elements.get(id);
    if (cached) {
      return cached;
    }
    let found: HTMLElement | undefined;
    this.app.overlay?.querySelectorAll("*").forEach((node) => {
      if (!found && (node as any).__sdId === id) {
        found = node as HTMLElement;
      }
    });
    if (found) {
      this._elements.set(id, found);
    }
    return found;
  }

  protected _waitingBeats: BeatParams[] = [];

  protected _draining = false;

  protected _applying = 0;

  protected receiveBeat(params: BeatParams) {
    this._beatMarks.received(params);
    this._waitingBeats.push(params);
    this.drainWaiting();
  }

  protected drawingPending(): boolean {
    const pending = (this.app.overlay as OverlayWithBeat | undefined)?.__sdBeat;
    return !!this._veil || (!!pending && pending.owner === this && !!pending.drawing);
  }

  protected drainWaiting() {
    if (this._draining || this._applying > 0) {
      return;
    }
    this._draining = true;
    try {
      while (this._waitingBeats.length > 0 && !this.drawingPending()) {
        const next = this._waitingBeats.shift()!;
        this.flushPendingBeat();
        if (this.drawingPending()) {
          this._waitingBeats.unshift(next);
          break;
        }
        this.processBeat(next);
      }
    } finally {
      this._draining = false;
    }
  }

  protected processBeat(params: BeatParams, force = false) {
    const overlay = this.app.overlay as OverlayWithBeat | undefined;
    const ops = beatOps(params);
    const plan = this.planBeat(ops);
    const now = this.documentNow();
    const lag = this._heldAt != null ? this._lag : this.lag(now);
    const storyNow = now - (this.lag(now) - lag);
    const wait = this.waitToCommit(params, ops, plan, storyNow);
    const prepared = overlay ? this.prepareDrawing(ops, plan) : { layers: [], unprepared: false };
    let drawing = prepared.layers.filter((layer) => !layer.drawn);
    if (force) {
      for (const layer of drawing) {
        layer.overdue();
      }
      drawing = [];
    }
    const veil = prepared.unprepared;
    if (drawing.length === 0 && !veil) {
      this._beatMarks.ready(params);
    }
    if (!overlay || force || (wait <= 0 && drawing.length === 0)) {
      this.shiftBeat(params, ops, this.lag(now) - lag);
      this.applyBeat(params, ops, plan, veil);
      if (force) {
        this._veil?.overdue();
      }
      return;
    }
    const pending: PendingBeat = { params, ops, plan, at: storyNow + wait, lag, owner: this, ...(veil ? { veil } : {}) };
    overlay.__sdBeat = pending;
    if (drawing.length > 0) {
      pending.drawing = drawing;
      const landed = () => {
        if (overlay.__sdBeat !== pending || !pending.drawing) {
          return;
        }
        pending.drawing = undefined;
        clearTimeout(pending.drawTimer);
        pending.drawTimer = undefined;
        if (!pending.veil) {
          this._beatMarks.ready(params);
        }
        pending.owner.scheduleCommit();
        pending.owner.drainWaiting();
      };
      void Promise.all(drawing.map((layer) => layer.whenDrawn())).then(landed);
      const seconds = this.drawSeconds();
      if (seconds > 0) {
        pending.drawTimer = setTimeout(() => {
          if (overlay.__sdBeat !== pending || !pending.drawing) {
            return;
          }
          for (const layer of pending.drawing) {
            if (!layer.drawn) {
              layer.overdue();
            }
          }
          landed();
        }, seconds * 1000);
      }
    }
    this.scheduleCommit();
  }

  protected drawSeconds(): number {
    return this.app.previewing === true ? this._drawTimeouts.restore : this._drawTimeouts.beat;
  }

  protected prepareDrawing(ops: IMessage[], plan: Map<IMessage, WriteDecision>): { layers: MorphLayer[]; unprepared: boolean } {
    const morphs = this.morphs;
    if (!morphs) {
      return { layers: [], unprepared: false };
    }
    const layers: MorphLayer[] = [];
    let unprepared = false;
    const made = this.precreateTargets(ops);
    const animated = this.beatAnimations(ops);
    const { restore, changed } = this.applyBeatLayout(ops);
    try {
    const nested = (el: Element) =>
      animated.filter(({ element }) => element === el || element.contains(el)).reduce((product, { scale }) => product * scale, 1);
    for (const op of ops) {
      const msg = op as RequestMessage;
      if (!WriteImageMessage.type.isRequest(msg)) {
        continue;
      }
      const decision = plan.get(op);
      if (decision === "skip" || decision === "same") {
        continue;
      }
      const { target, instructions, elements } = msg.params;
      const targetEls = this.writeTargets(target, elements);
      if (targetEls.length === 0) {
        unprepared ||= instructions.some(drawsPicture);
        continue;
      }
      const sig = JSON.stringify(instructions);
      if (
        decision == null &&
        !instructions.some(movesPicture) &&
        targetEls.every((el) => (el as any).__sdImg === sig && (el as any).__sdImgRev === ((el as any).__sdRev ?? 0))
      ) {
        continue;
      }
      for (const instruction of instructions) {
        const zoom = Math.max(instruction.framing?.zoom ?? 1, instruction.travel?.framing?.zoom ?? 1);
        const content = instruction.content;
        for (const targetEl of targetEls) {
          const around =
            keyframeScale(instruction.targetAnimations) *
            (instruction.affected ?? [])
              .filter((a) => this.findTargetElements(a.target).some((el) => el === targetEl || el.contains(targetEl)))
              .reduce((product, a) => product * keyframeScale(a.animations), 1);
          const imageEls = this.getContentElements(targetEl, "image");
          if (!content) {
            for (const contentEl of imageEls) {
              for (const pictureEl of Array.from(contentEl.children) as HTMLElement[]) {
                const layer = (pictureEl as HTMLElement & { __sdMorph?: MorphLayer }).__sdMorph;
                if (!layer) {
                  continue;
                }
                layer.size({ zoom, scale: around * nested(pictureEl) });
                layers.push(layer);
              }
            }
            continue;
          }
          if (instruction.control === "hide" || content.video || (!content.morph && !(content.pictures?.length ?? 0))) {
            continue;
          }
          const group = new MorphGroup();
          const maskEls = this.getContentElements(targetEl, "mask");
          for (const [els, property] of [
            [imageEls, "background_image"],
            [maskEls, "mask_image"],
          ] as const) {
            for (const contentEl of els) {
              const span = createImageElement(
                contentEl,
                property,
                content.background,
                content.imageNames,
                content.sources ?? (content.src ? [content.src] : []),
                this.applyStyle.bind(this),
              );
              span.style.setProperty("visibility", "hidden");
              (span as any).__sdPrepared = true;
              placePicture(span, instruction.framing);
              const layer = morphs.mount(
                span,
                content.morph ?? { plays: [], epoch: 0 },
                content.background,
                property === "mask_image" ? "mask" : "background",
                `${(targetEl as any).__sdId ?? target}:${property}:${els.indexOf(contentEl)}`,
                group,
                content.pictures ?? [],
                true,
              );
              layer.size({ zoom, scale: around * keyframeScale(content.enterAnimation ? [content.enterAnimation] : []) * nested(span) });
              layer.presize();
              this.presizeHidden(span, layer);
              let byContent = this._prepared.get(instruction);
              if (!byContent) {
                byContent = new Map();
                this._prepared.set(instruction, byContent);
              }
              byContent.set(contentEl, span);
              layers.push(layer);
            }
          }
        }
      }
    }
    for (const { element, scale } of animated) {
      for (const layer of morphs.layersIn(element)) {
        if (layers.includes(layer)) {
          continue;
        }
        layer.size({ scale: nested(layer.span) });
        if (scale > 1 && !layer.drawn) {
          layers.push(layer);
        }
      }
    }
    if (changed.length > 0 || made.length > 0) {
      layers.push(...morphs.prepareLayouts(new Set(layers)));
    }
    } finally {
      restore();
    }
    return { layers, unprepared };
  }

  protected _precreated: { el: HTMLElement; value: string; priority: string }[] = [];

  protected revealPrecreated() {
    for (const { el, value, priority } of this._precreated.splice(0)) {
      if (el.style.getPropertyValue("visibility") !== "hidden" || el.style.getPropertyPriority("visibility") !== "important") {
        continue;
      }
      if (value) {
        el.style.setProperty("visibility", value, priority);
      } else {
        el.style.removeProperty("visibility");
      }
    }
  }

  protected precreateTargets(ops: IMessage[]): HTMLElement[] {
    const creates = ops.filter((op) => CreateElementMessage.type.isRequest(op as RequestMessage)) as (RequestMessage & {
      params: { element: string; parent: string | null; name: string };
    })[];
    if (creates.length === 0) {
      return [];
    }
    const missing = (id: string) => !this.getElement(id);
    const needed = new Set<string>();
    const within = new Set<string>();
    for (const op of ops) {
      const msg = op as RequestMessage;
      if (!WriteImageMessage.type.isRequest(msg)) {
        continue;
      }
      const { target, elements, instructions } = msg.params;
      if (!instructions.some(drawsPicture)) {
        continue;
      }
      for (const el of this.writeTargets(target, elements)) {
        const id = (el as HTMLElement & { __sdId?: string }).__sdId;
        if (id) {
          within.add(id);
        }
      }
      const names = (target.split("#")[0] ?? "").split(" ").filter(Boolean);
      for (const create of creates) {
        const classes = (create.params.name || "").split(" ");
        const named = elements ? elements.includes(create.params.element) : names.length > 0 && names.every((name) => classes.includes(name));
        if (named && missing(create.params.element)) {
          needed.add(create.params.element);
        }
      }
    }
    const byId = new Map(creates.map((create) => [create.params.element, create]));
    for (const id of [...needed]) {
      for (
        let parent = byId.get(id)?.params.parent;
        parent && byId.has(parent) && !needed.has(parent) && missing(parent);
        parent = byId.get(parent)?.params.parent
      ) {
        needed.add(parent);
      }
    }
    for (let grew = true; grew; ) {
      grew = false;
      for (const create of creates) {
        const parent = create.params.parent;
        if (!needed.has(create.params.element) && parent && (needed.has(parent) || within.has(parent)) && missing(create.params.element)) {
          needed.add(create.params.element);
          grew = true;
        }
      }
    }
    if (needed.size === 0) {
      return [];
    }
    this._applying += 1;
    try {
      for (const create of creates) {
        if (needed.has(create.params.element) && !this.getElement(create.params.element)) {
          void this.onReceiveRequest(create);
        }
      }
    } finally {
      this._applying -= 1;
    }
    const made: HTMLElement[] = [];
    for (const id of needed) {
      const parent = byId.get(id)?.params.parent;
      if (parent && needed.has(parent)) {
        continue;
      }
      const el = this.getElement(id);
      if (el) {
        this._precreated.push({ el, value: el.style.getPropertyValue("visibility"), priority: el.style.getPropertyPriority("visibility") });
        el.style.setProperty("visibility", "hidden", "important");
        made.push(el);
      }
    }
    return made;
  }

  protected applyBeatLayout(ops: IMessage[]): { restore: () => void; changed: HTMLElement[] } {
    const undo: (() => void)[] = [];
    const changed: HTMLElement[] = [];
    const overlay = this.app.overlay;
    const scroll =
      overlay && ops.some((op) => DestroyElementMessage.type.isRequest(op as RequestMessage) || UpdateElementMessage.type.isRequest(op as RequestMessage))
        ? keptScroll(overlay)
        : undefined;
    const put = (el: HTMLElement, name: string, value: string | null) => {
      if (el.getAttribute(name) === value) {
        return;
      }
      if (value == null) {
        el.removeAttribute(name);
      } else {
        el.setAttribute(name, value);
      }
    };
    for (const op of ops) {
      const msg = op as RequestMessage;
      if (DestroyElementMessage.type.isRequest(msg)) {
        const el = this.getElement(msg.params.element);
        const parent = el?.parentElement;
        if (el && el !== this.app.overlay && el.isConnected && parent) {
          undo.push(outOfFlow(el));
          changed.push(parent);
        }
        continue;
      }
      if (!UpdateElementMessage.type.isRequest(msg)) {
        continue;
      }
      const { element, style, attributes } = msg.params;
      const el = this.getElement(element);
      if (!el || !el.isConnected || (!style && !attributes)) {
        continue;
      }
      const names = Object.keys(attributes ?? {}).filter((name) => name !== "value" && name !== "checked" && name !== PRESENCE_ATTRIBUTE);
      const entry = { el, style: el.getAttribute("style"), attributes: names.map((name): [string, string | null] => [name, el.getAttribute(name)]) };
      undo.push(() => {
        put(el, "style", entry.style);
        for (const [name, value] of entry.attributes) {
          put(el, name, value);
        }
      });
      if (style) {
        this.applyStyle(el, style);
      }
      for (const name of names) {
        put(el, name, attributes![name] ?? null);
      }
      if (el.getAttribute("style") !== entry.style || entry.attributes.some(([name, value]) => el.getAttribute(name) !== value)) {
        changed.push(el);
      }
    }
    const restore = () => {
      for (const step of undo.reverse()) {
        step();
      }
      scroll?.();
    };
    return { restore, changed };
  }

  protected _veil?: { lift: () => void; overdue: () => void };

  protected liftVeil() {
    this._veil?.lift();
  }

  protected veilMade(params: BeatParams, before: WeakSet<Element>) {
    const overlay = this.app.overlay;
    const layers = overlay ? (this.morphs?.undrawnWithin(overlay) ?? []) : [];
    const roots: HTMLElement[] = [];
    for (const layer of layers) {
      let root: HTMLElement | undefined;
      for (let el: HTMLElement | null = layer.span; el && el !== overlay; el = el.parentElement) {
        if (!before.has(el)) {
          root = el;
        }
      }
      if (!root || roots.some((other) => other.contains(root!))) {
        continue;
      }
      const kept = roots.filter((other) => !root!.contains(other));
      roots.splice(0, roots.length, ...kept, root);
    }
    if (roots.length === 0) {
      this._beatMarks.ready(params);
      this._beatMarks.fired(params);
      return;
    }
    const veiled = roots.map((el) => ({ el, value: el.style.getPropertyValue("visibility"), priority: el.style.getPropertyPriority("visibility") }));
    for (const { el } of veiled) {
      el.style.setProperty("visibility", "hidden", "important");
    }
    const waiting = layers.filter((layer) => roots.some((root) => root.contains(layer.span)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const veil = {
      lift: () => {
        if (this._veil !== veil) {
          return;
        }
        this._veil = undefined;
        clearTimeout(timer);
        for (const { el, value, priority } of veiled) {
          if (value) {
            el.style.setProperty("visibility", value, priority);
          } else {
            el.style.removeProperty("visibility");
          }
        }
        this._beatMarks.ready(params);
        this._beatMarks.fired(params);
        this.drainWaiting();
      },
      overdue: () => {
        for (const layer of waiting) {
          if (!layer.drawn) {
            layer.overdue();
          }
        }
        veil.lift();
      },
    };
    this._veil = veil;
    void Promise.all(waiting.map((layer) => layer.whenDrawn())).then(() => veil.lift());
    const seconds = this.drawSeconds();
    if (seconds > 0) {
      timer = setTimeout(() => veil.overdue(), seconds * 1000);
    }
  }

  protected presizeHidden(span: HTMLElement, layer: MorphLayer) {
    if (span.offsetWidth > 0 || span.offsetHeight > 0) {
      return;
    }
    const lifted: { el: HTMLElement; priority: string }[] = [];
    for (let el = span.parentElement; el && el !== this.app.overlay; el = el.parentElement) {
      if (el.style.getPropertyValue("display") === "none") {
        lifted.push({ el, priority: el.style.getPropertyPriority("display") });
        el.style.removeProperty("display");
      }
    }
    if (lifted.length === 0) {
      return;
    }
    try {
      layer.presize();
    } finally {
      for (const { el, priority } of lifted) {
        el.style.setProperty("display", "none", priority);
      }
    }
  }

  protected beatAnimations(ops: IMessage[]): { element: Element; scale: number }[] {
    const found: { element: Element; scale: number }[] = [];
    for (const op of ops) {
      const msg = op as RequestMessage;
      if (!AnimateElementsMessage.type.isRequest(msg)) {
        continue;
      }
      for (const effect of msg.params.effects) {
        const element = this.getElement(effect.element);
        const scale = keyframeScale(effect.animations);
        if (element && scale > 1) {
          found.push({ element, scale });
        }
      }
    }
    return found;
  }

  protected takePrepared(instruction: WriteImageInstruction, contentEl: HTMLElement): HTMLElement | undefined {
    const byContent = this._prepared.get(instruction);
    const span = byContent?.get(contentEl);
    byContent?.delete(contentEl);
    if (!span || !span.isConnected || span.parentElement !== contentEl) {
      if (span) {
        this.discardPrepared(span);
      }
      return undefined;
    }
    delete (span as any).__sdPrepared;
    span.style.removeProperty("visibility");
    contentEl.appendChild(span);
    return span;
  }

  protected discardPrepared(span: HTMLElement) {
    this.morphs?.releaseWithin(span);
    endTravelsWithin(span);
    span.remove();
  }

  protected discardAllPrepared() {
    for (const byContent of this._prepared.values()) {
      for (const span of byContent.values()) {
        this.discardPrepared(span);
      }
    }
    this._prepared.clear();
  }

  protected dueAt(pending: PendingBeat, now: number): number {
    return pending.at + this.lag(now) - pending.lag;
  }

  protected scheduleCommit() {
    const overlay = this.app.overlay as OverlayWithBeat | undefined;
    const pending = overlay?.__sdBeat;
    if (!pending || pending.owner !== this) {
      return;
    }
    clearTimeout(pending.timer);
    pending.timer = undefined;
    if (pending.drawing) {
      return;
    }
    const wait = this.dueAt(pending, this.documentNow()) - this.documentNow();
    if (wait <= 0) {
      this.flushPendingBeat();
      return;
    }
    if (this._heldAt == null) {
      pending.timer = setTimeout(() => pending.owner.commitWhenDue(pending), wait);
    }
  }

  protected commitWhenDue(pending: PendingBeat) {
    const overlay = this.app.overlay as OverlayWithBeat | undefined;
    if (overlay?.__sdBeat !== pending || this._heldAt != null || pending.drawing) {
      return;
    }
    const view = overlay.ownerDocument.defaultView;
    const now = this.documentNow();
    if (view?.requestAnimationFrame && now < this.dueAt(pending, now)) {
      view.requestAnimationFrame(() => pending.owner.commitWhenDue(pending));
      return;
    }
    this.flushPendingBeat();
  }

  protected flushPendingBeat(force = false) {
    const overlay = this.app.overlay as OverlayWithBeat | undefined;
    const pending = overlay?.__sdBeat;
    if (overlay && pending) {
      overlay.__sdBeat = undefined;
      clearTimeout(pending.timer);
      clearTimeout(pending.drawTimer);
      for (const layer of pending.drawing ?? []) {
        if (!layer.drawn) {
          layer.overdue();
        }
      }
      pending.drawing = undefined;
      this.shiftBeat(pending.params, pending.ops, this.lag() - pending.lag);
      this.applyBeat(pending.params, pending.ops, pending.plan, pending.veil);
    }
    if (!force || this._applying > 0) {
      this.drainWaiting();
      return;
    }
    this._veil?.overdue();
    for (let next = this._waitingBeats.shift(); next; next = this._waitingBeats.shift()) {
      this.processBeat(next, true);
    }
  }

  protected applyShowing(params: ShowingParams) {
    const overlay = this.app.overlay as OverlayWithShowing | undefined;
    if (!overlay) {
      return;
    }
    const counts = params.reset || !overlay.__sdShowing ? new Map<string, number>() : overlay.__sdShowing;
    overlay.__sdShowing = counts;
    for (const [name, change] of Object.entries(params.changes)) {
      const count = (counts.get(name) ?? 0) + change;
      if (count === 0) {
        counts.delete(name);
      } else {
        counts.set(name, count);
      }
    }
    const value = [...counts]
      .filter(([, count]) => count > 0)
      .map(([name]) => name)
      .sort()
      .join(" ");
    if (value) {
      overlay.setAttribute(SHOWING_ATTRIBUTE, value);
    } else {
      overlay.removeAttribute(SHOWING_ATTRIBUTE);
    }
    if (params.line) {
      for (const [attribute, mark] of [
        [LINE_VARIANT_ATTRIBUTE, params.line.variant],
        [LINE_SPEAKER_ATTRIBUTE, params.line.speaker],
      ] as const) {
        if (mark) {
          overlay.setAttribute(attribute, mark);
        } else {
          overlay.removeAttribute(attribute);
        }
      }
    }
  }

  protected shiftBeat(params: BeatParams, ops: IMessage[], shift: number) {
    if (shift === 0 || !Number.isFinite(shift)) {
      return;
    }
    if (params.time != null) {
      params.time += shift;
    }
    for (const op of ops) {
      const stamped = (op as { params?: { time?: unknown } }).params;
      if (typeof stamped?.time === "number") {
        stamped.time += shift;
      }
    }
  }

  protected waitToCommit(
    params: BeatParams,
    ops: IMessage[],
    plan: Map<IMessage, WriteDecision>,
    now: number,
  ): number {
    if (params.time == null) {
      return 0;
    }
    const shown = this.getDisplayTime(params.time);
    if (!Number.isFinite(now) || shown == null || shown - now > COMMIT_WAIT_LIMIT_MS) {
      return 0;
    }
    let first: number | undefined;
    for (const op of ops) {
      const msg = op as RequestMessage;
      if (!WriteTextMessage.type.isRequest(msg)) {
        continue;
      }
      const decision = plan.get(op);
      const write = msg.params;
      if (
        write.held ||
        write.instructions.length === 0 ||
        (decision !== "write" && decision !== "rebuild")
      ) {
        continue;
      }
      for (const instruction of write.instructions.slice(write.shown ?? 0)) {
        if (instruction.text != null && !/\S/.test(instruction.text)) {
          continue;
        }
        const after = instruction.after ?? 0;
        first = first == null ? after : Math.min(first, after);
      }
    }
    const wait = shown + (first ?? 0) * 1000 - now;
    return wait >= 1 ? wait : 0;
  }

  protected reducesMotion(): boolean {
    return (
      this.app.overlay?.ownerDocument.defaultView?.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches ?? false
    );
  }

  protected measureLayouts(params: BeatParams, ops: IMessage[]) {
    const overlay = this.app.overlay;
    if (!overlay || params.time == null || this.reducesMotion()) {
      this._layoutMotion.settle();
      return undefined;
    }
    return this._layoutMotion.measure(overlay, () =>
      ops.some((op) =>
        namesLayoutTransition(JSON.stringify((op as { params?: unknown }).params ?? null)),
      ),
    );
  }

  protected applyBeat(
    params: BeatParams,
    ops: IMessage[],
    plan: Map<IMessage, WriteDecision>,
    veil = false,
  ) {
    this._applying += 1;
    try {
      this.applyBeatOps(params, ops, plan, veil);
    } finally {
      this._applying -= 1;
    }
  }

  protected applyBeatOps(params: BeatParams, ops: IMessage[], plan: Map<IMessage, WriteDecision>, veil: boolean) {
    const overlay = this.app.overlay;
    const before = veil && overlay ? new WeakSet<Element>(Array.from(overlay.querySelectorAll("*"))) : undefined;
    if (!before) {
      this._beatMarks.fired(params);
    }
    const layouts = this.measureLayouts(params, ops);
    for (const op of ops) {
      const decision = plan.get(op);
      if (decision !== "skip") {
        this.applyBeatMessage(op, decision);
      }
    }
    this.discardAllPrepared();
    this.revealPrecreated();
    this.morphs?.adoptPrepared();
    if (params.sweep && this._passBegun) {
      this._passBegun = false;
      this.sweepReconcile();
    }
    this._layoutMotion.play(layouts);
    if (before) {
      this.veilMade(params, before);
    }
  }

  protected applyBeatMessage(message: IMessage, decision?: WriteDecision) {
    if ("id" in message) {
      const request = message as RequestMessage;
      this._decision = decision;
      let done: Promise<unknown>;
      try {
        done = this.onReceiveRequest(request);
      } finally {
        this._decision = undefined;
      }
      if (
        AnimateElementsMessage.type.isRequest(request) ||
        PresenceElementsMessage.type.isRequest(request) ||
        LayoutMotionMessage.type.isRequest(request) ||
        (WriteImageMessage.type.isRequest(request) && request.params.reportsExit)
      ) {
        this.app.answer(request, done);
      } else {
        done.catch((error) => {
          console.error(`${request.method} failed in a beat`, error);
        });
      }
    } else {
      this.onReceiveNotification(message as NotificationMessage);
    }
  }

  protected planBeat(ops: IMessage[]): Map<IMessage, WriteDecision> {
    const plan = new Map<IMessage, WriteDecision>();
    const overlay = this.app.overlay;
    const revs = new Map<Element, number>();
    const rev = (el: Element): number => revs.get(el) ?? (el as any).__sdRev ?? 0;
    const states = new Map<HTMLElement, HeldState>();
    const state = (el: HTMLElement): HeldState => {
      let s = states.get(el);
      if (!s && making.has(el)) {
        s = { leaves: making.get(el)!.leaves, empty: true };
        states.set(el, s);
      }
      if (!s) {
        const leaves = [
          ...this.getContentElements(el, "text"),
          ...this.getContentElements(el, "stroke"),
        ];
        const a = el as any;
        s = {
          txt: a.__sdTxt,
          txtRev: a.__sdTxtRev,
          all: a.__sdAll,
          allRev: a.__sdAllRev,
          img: a.__sdImg,
          imgRev: a.__sdImgRev,
          leaves: leaves.length > 0,
          empty: leaves.length > 0 && leaves.every((l) => !l.hasChildNodes()),
        };
        states.set(el, s);
      }
      return s;
    };
    const gone = new Set<Element>();
    const remove = (node: Element | null | undefined) => {
      if (node) {
        gone.add(node);
        node.querySelectorAll("*").forEach((d) => gone.add(d));
      }
    };
    type Made = {
      key: HTMLElement;
      parent?: Made;
      anchor: Element | null | undefined;
      leaves: boolean;
    };
    const made = new Map<string, Made>();
    const making = new Map<HTMLElement, Made>();
    const make = (id: string, parent: Made | undefined, anchor: Element | null | undefined) => {
      const m: Made = { key: {} as HTMLElement, parent, anchor, leaves: false };
      made.set(id, m);
      making.set(m.key, m);
      return m;
    };
    const bump = (n: Element | null | undefined) => {
      for (; n && n !== overlay; n = n.parentElement) {
        revs.set(n, rev(n) + 1);
      }
    };
    const bumpMade = (m: Made | undefined, anchor?: Element | null) => {
      let last: Made | undefined;
      for (let n = m; n; n = n.parent) {
        revs.set(n.key, rev(n.key) + 1);
        last = n;
      }
      bump(last ? last.anchor : anchor);
    };
    const leafMade = (name: string, m: Made | undefined, el: Element | null | undefined) => {
      if (!/(^|\s)(text|stroke)(\s|$)/.test(name ?? "")) {
        return;
      }
      if (m) {
        m.leaves = true;
        const st = states.get(m.key);
        if (st) {
          st.leaves = true;
        }
      } else if (el && el !== overlay) {
        const st = state(el as HTMLElement);
        if (!st.leaves) {
          st.leaves = true;
          st.empty = true;
        }
      }
    };
    const cursor = new Map<Element, Element | null>(this._placeCursor);
    const targets = (p: WriteParams): HTMLElement[] | undefined => {
      const els = p.elements
        ? p.elements.map(
            (id) => made.get(id)?.key ?? this._elements.get(id) ?? this.getElement(id),
          )
        : this.findTargetElements(p.target);
      return els.length > 0 &&
        els.every((el) => el && el !== overlay && (making.has(el) || !gone.has(el)))
        ? (els as HTMLElement[])
        : undefined;
    };
    const waiting: {
      clears: IMessage[];
      kind: WriteKind;
      target: string;
      els: HTMLElement[];
      at: Map<HTMLElement, { rev: number; held: HeldState }>;
    }[] = [];
    const applyClear = (w: (typeof waiting)[number]) => {
      for (const clear of w.clears) {
        plan.set(clear, "write");
      }
      for (const el of w.els) {
        const s = state(el);
        const at = w.at.get(el)!.rev;
        if (w.kind === WriteTextMessage.type) {
          s.txt = "[]";
          s.txtRev = at;
          s.all = [];
          s.allRev = at;
          s.empty = s.leaves && rev(el) === at;
        } else {
          s.img = "[]";
          s.imgRev = at;
        }
      }
    };
    let passOpen = this._passBegun;
    let passInBeat = false;
    const passTouched = new Set<HTMLElement>();
    const stale = (el: HTMLElement) =>
      !making.has(el) &&
      (passInBeat ? state(el).txt !== undefined : this._staleTextTargets.has(el));
    for (const op of ops) {
      if (BeginReconcileMessage.type.isNotification(op as NotificationMessage)) {
        if (!(op as NotificationMessage<string, { content?: boolean }>).params?.content) {
          cursor.clear();
        }
        passOpen = true;
        passInBeat = true;
        passTouched.clear();
        continue;
      }
      const msg = op as RequestMessage;
      const kind: WriteKind | undefined = WriteTextMessage.type.isRequest(msg)
        ? WriteTextMessage.type
        : WriteImageMessage.type.isRequest(msg)
          ? WriteImageMessage.type
          : undefined;
      if (!kind) {
        const params = msg.params as any;
        if (CreateElementMessage.type.isRequest(msg)) {
          const inMade = made.get(params.parent);
          const parent = inMade ? undefined : this.getElement(params.parent);
          const existing =
            params.element && !made.has(params.element)
              ? this.getElement(params.element)
              : undefined;
          if (inMade) {
            if (params.element) {
              make(params.element, inMade, inMade.anchor);
            }
            bumpMade(inMade);
            leafMade(params.name, inMade, undefined);
          } else if (!existing || gone.has(existing) || made.has(params.element)) {
            if (params.element) {
              make(params.element, undefined, parent);
            }
            bump(parent);
            leafMade(params.name, undefined, parent);
          } else {
            for (const node of this.touchesOf(msg, cursor)) {
              bump(node);
            }
            if (existing.tagName.toLowerCase() !== params.type.toLowerCase()) {
              remove(existing);
              make(params.element, undefined, parent);
              leafMade(params.name, undefined, parent);
            }
          }
          if (parent) {
            cursor.set(parent, existing && !gone.has(existing) ? existing : null);
          }
          continue;
        }
        const m = made.get(params.element);
        if (m) {
          if (UpdateElementMessage.type.isRequest(msg) && params.content != undefined) {
            bumpMade(m);
          }
          if (
            !UpdateElementMessage.type.isRequest(msg) ||
            params.style != undefined ||
            params.attributes != undefined
          ) {
            bumpMade(m.parent, m.anchor);
          }
          if (DestroyElementMessage.type.isRequest(msg)) {
            for (const [id, n] of [...made]) {
              for (let a: Made | undefined = n; a; a = a.parent) {
                if (a === m) {
                  made.delete(id);
                  break;
                }
              }
            }
          }
          continue;
        }
        const el = this.getElement(params.element);
        for (const node of this.touchesOf(msg, cursor)) {
          bump(node);
        }
        if (DestroyElementMessage.type.isRequest(msg)) {
          remove(el);
        }
        continue;
      }
      const p = msg.params as WriteParams;
      const els = targets(p);
      const sig =
        kind === WriteTextMessage.type
          ? JSON.stringify(p.instructions)
          : imageSignature(p.instructions);
      if (kind === WriteTextMessage.type && els) {
        const replaced = els.filter(
          (el) =>
            state(el).txt === undefined ||
            state(el).txt === "[]" ||
            (passOpen && !passTouched.has(el) && stale(el)),
        );
        if (passOpen) {
          for (const el of els) {
            passTouched.add(el);
          }
        }
        if (replaced.length > 0 && p.instructions.length > 0) {
          waiting.push({
            clears: [],
            kind,
            target: p.target,
            els: replaced,
            at: new Map(replaced.map((el) => [el, { rev: rev(el), held: { ...state(el) } }])),
          });
        }
      }
      for (const w of [...waiting]) {
        if (w.kind !== kind || !els || !w.els.some((el) => els.includes(el))) {
          continue;
        }
        const same = w.target === p.target && sameElements(w.els, els);
        if (same && p.instructions.length === 0) {
          w.clears.push(op);
          plan.set(op, "skip");
          break;
        }
        waiting.splice(waiting.indexOf(w), 1);
        const shows =
          kind === WriteTextMessage.type ||
          (p.instructions as { control?: string; content?: unknown }[]).some(
            (e) => e.control === "show" && e.content != null,
          );
        const undone =
          same &&
          p.instructions.length > 0 &&
          shows &&
          els.every((el) => {
            const at = w.at.get(el)!;
            const h = at.held;
            return (
              rev(el) === at.rev &&
              (kind === WriteTextMessage.type
                ? h.txt === sig && JSON.stringify(h.all) === sig && h.allRev === at.rev
                : h.img === sig && h.imgRev === at.rev)
            );
          });
        if (undone) {
          for (const clear of w.clears) {
            plan.set(clear, "skip");
          }
          plan.set(op, "same");
        } else {
          applyClear(w);
        }
      }
      if (plan.has(op)) {
        continue;
      }
      if (!els) {
        plan.set(op, "write");
        continue;
      }
      if (p.instructions.length === 0) {
        plan.set(op, "skip");
        waiting.push({
          clears: [op],
          kind,
          target: p.target,
          els,
          at: new Map(els.map((el) => [el, { rev: rev(el), held: { ...state(el) } }])),
        });
        continue;
      }
      let decision: WriteDecision;
      if (kind === WriteTextMessage.type) {
        const shown = els.every((el) => state(el).txt === sig);
        decision = !shown
          ? "write"
          : els.every((el) => state(el).txtRev === rev(el))
            ? "same"
            : els.every((el) => JSON.stringify(state(el).all) === sig)
              ? "rebuild"
              : "same";
      } else {
        decision = els.every((el) => state(el).img === sig && state(el).imgRev === rev(el))
          ? "same"
          : "write";
      }
      plan.set(op, decision);
      if (decision === "same") {
        continue;
      }
      for (const el of els) {
        const s = state(el);
        if (kind === WriteTextMessage.type) {
          const empty = decision === "rebuild" ? s.leaves : s.empty;
          s.all = empty ? [...p.instructions] : s.all ? [...s.all, ...p.instructions] : undefined;
          if (empty) {
            s.allRev = rev(el);
          }
          s.txt = sig;
          s.txtRev = rev(el);
          s.empty = false;
        } else {
          s.img = sig;
          s.imgRev = rev(el);
        }
      }
    }
    for (const w of waiting) {
      applyClear(w);
    }
    return plan;
  }

  protected writeTargets(target: string, elements?: string[]): HTMLElement[] {
    if (!elements) {
      return this.findTargetElements(target);
    }
    return elements
      .map((id) => this._elements.get(id) ?? this.getElement(id))
      .filter((el): el is HTMLElement => el != null && el !== this.app.overlay);
  }

  protected touchesOf(
    m: IMessage,
    cursor: Map<Element, Element | null> = this._placeCursor,
  ): (Element | null | undefined)[] {
    const msg = m as RequestMessage;
    const params = msg.params as any;
    if (CreateElementMessage.type.isRequest(msg)) {
      const parent = this.getElement(params.parent);
      const existing = params.element ? this.getElement(params.element) : undefined;
      if (!existing || existing.tagName.toLowerCase() !== params.type.toLowerCase()) {
        return [existing?.parentElement, parent];
      }
      const touched: (Element | null | undefined)[] = [];
      if (
        (existing as any).__sdCreate !==
        createSignature(this._themeKey, params)
      ) {
        touched.push(params.content ? existing : existing.parentElement);
      } else if ((existing as any).__sdUpdatedContent && params.content) {
        touched.push(existing);
      }
      if (parent && existing.parentElement !== parent) {
        touched.push(existing.parentElement, parent);
      } else if (parent) {
        const moves = params.before
          ? existing.nextElementSibling !== this.getElement(params.before)
          : existing.previousElementSibling !== (cursor.get(parent) ?? null);
        if (moves) {
          touched.push(parent);
        }
      }
      return touched;
    }
    if (UpdateElementMessage.type.isRequest(msg)) {
      const element = this.getElement(params.element);
      return [
        params.content != undefined ? element : undefined,
        params.style != undefined || params.attributes != undefined
          ? element?.parentElement
          : undefined,
      ];
    }
    if (
      DestroyElementMessage.type.isRequest(msg) ||
      MoveElementMessage.type.isRequest(msg)
    ) {
      return [this.getElement(params.element)?.parentElement];
    }
    return [];
  }

  protected touch(nodes: (Element | null | undefined)[]) {
    const overlay = this.app.overlay;
    for (const node of nodes) {
      for (let n = node; n && n !== overlay; n = n.parentElement) {
        (n as any).__sdRev = ((n as any).__sdRev ?? 0) + 1;
      }
    }
  }

  override async onReceiveRequest(msg: RequestMessage) {
    const decision = this._decision;
    this.endPreviewCutscene(msg);
    if (msg.method.startsWith("ui/") && !retiredOnly(msg)) {
      this.flushPendingBeat(true);
      this.morphs?.requestRelayout();
    }
    this.touch(this.touchesOf(msg));
    if (SetThemeMessage.type.isRequest(msg)) {
      const params = msg.params;
      this._breakpoints = params.breakpoints;
      this._theme = new Set(params.variables);
      this._themeKey = getThemeKey(params.variables);
      const overlay = this.app.overlay;
      if (overlay) {
        ColorSchemeHost.for(overlay).configure(params.color_scheme ?? "system");
      }
      const rootTextSize = params.root_text_size;
      if (rootTextSize) {
        const doc = this.app.overlay?.ownerDocument;
        if (doc?.documentElement) {
          doc.documentElement.style.fontSize = rootTextSize;
        }
      }
      return SetThemeMessage.type.result("");
    }
    if (CreateElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const id = params.element;
      let el: HTMLElement | undefined;
      if (id) {
        const existing = this.getElement(id);
        if (
          existing &&
          existing.tagName.toLowerCase() === params.type.toLowerCase()
        ) {
          el = existing;
        } else if (existing) {
          this.removeElementById(id);
        }
      }
      const reused = el != null;
      if (!el) {
        el = document.createElement(params.type);
      }
      if (id) {
        (el as any).__sdId = id;
        const domId = params.attributes?.["id"] ?? id;
        if (el.id !== domId) {
          el.id = domId;
        }
        this._elements.set(id, el);
        this._staleIds.delete(id);
      }
      if (
        reused &&
        el.hasAttribute(PRESENCE_ATTRIBUTE) &&
        !(params.attributes && PRESENCE_ATTRIBUTE in params.attributes)
      ) {
        this._presence.settle(el);
        el.removeAttribute(PRESENCE_ATTRIBUTE);
      }
      const sig = createSignature(this._themeKey, params);
      const changed = !reused || (el as any).__sdCreate !== sig;
      if (changed) {
        el.className = params.name || "";
        if (params.content) {
          this.morphs?.releaseWithin(el);
          endTravelsWithin(el);
          el.textContent = getElementContent(params.content, {
            breakpoints: params.breakpoints,
            scope: "spark-web-player #game",
            theme: this._theme,
          });
        }
        if (params.style) {
          el.style.cssText = Object.entries(params.style)
            .flatMap(([k, v]) => {
              const arr = [];
              if (v != null) {
                const cssEntries = getCssEquivalent(
                  k,
                  getCssTokenValue(v),
                  this._theme,
                );
                for (const [k, v] of cssEntries) {
                  arr.push(`${escapeCssIdentifier(k)}:${v}`);
                }
              }
              return arr;
            })
            .join(";");
        } else if (reused) {
          el.style.cssText = "";
        }
        {
          const written = params.attributes ? Object.keys(params.attributes) : [];
          if (reused) {
            const prior: string[] = (el as any).__sdAttrs ?? [];
            for (const k of prior) {
              if (!written.includes(k)) {
                applyAttribute(el, k, null);
              }
            }
          }
          if (params.attributes) {
            applyAttributes(el, params.attributes);
          }
          (el as any).__sdAttrs = written;
        }
        if (el.getAttribute("data-follow") === "end") {
          this.followEnd(el);
        }
        (el as any).__sdCreate = sig;
      } else if ((el as any).__sdUpdatedContent && params.content) {
        this.morphs?.releaseWithin(el);
        endTravelsWithin(el);
        el.textContent = getElementContent(params.content, {
          breakpoints: params.breakpoints,
          scope: "spark-web-player #game",
          theme: this._theme,
        });
      }
      if (params.content) {
        delete (el as any).__sdUpdatedContent;
      }
      const parent = this.getElement(params.parent);
      if (parent) {
        if (params.before) {
          const before = this.getElement(params.before);
          if (el.parentElement !== parent || el.nextElementSibling !== before) {
            parent.insertBefore(el, before ?? null);
          }
        } else {
          const cursor = this._placeCursor.get(parent) ?? null;
          if (
            el.parentElement !== parent ||
            el.previousElementSibling !== cursor
          ) {
            parent.insertBefore(el, cursor ? cursor.nextSibling : parent.firstChild);
          }
        }
        this._placeCursor.set(parent, el);
      }
      return CreateElementMessage.type.result(params.element);
    }
    if (DestroyElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      this.removeElementById(params.element);
      return DestroyElementMessage.type.result(params.element);
    }
    if (MoveElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      this._staleIds.delete(params.element);
      const element = this.getElement(params.element);
      const parent = element?.parentElement;
      if (element && parent) {
        const before = params.before ? this.getElement(params.before) : null;
        parent.insertBefore(element, before ?? null);
      }
      return MoveElementMessage.type.result(params.element);
    }
    if (UpdateElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      this._staleIds.delete(params.element);
      const element = this.getElement(params.element);
      if (element) {
        const settled =
          params.attributes && PRESENCE_ATTRIBUTE in params.attributes
            ? this._presence.change(
                element,
                params.attributes[PRESENCE_ATTRIBUTE] ?? null,
              )
            : undefined;
        if (params.content != undefined) {
          this.morphs?.releaseWithin(element);
          endTravelsWithin(element);
          (element as any).__sdUpdatedContent = true;
          element.textContent = getElementContent(params.content, {
            breakpoints: params.breakpoints,
            scope: "spark-web-player #game",
            theme: this._theme,
          });
        }
        if (params.attributes != undefined) {
          if (params.attributes) {
            applyAttributes(element, params.attributes);
            if (element.getAttribute("data-follow") === "end") {
              this.followEnd(element);
            }
          } else {
            Array.from(element.attributes).forEach((attr) =>
              element.removeAttribute(attr.name),
            );
          }
        }
        if (params.style != undefined) {
          if (params.style) {
            Object.entries(params.style).forEach(([k, v]) => {
              if (v == null) {
                for (const cssProp of getCssPropertyNames(k)) {
                  if (element) {
                    element.style.removeProperty(cssProp);
                  }
                }
              } else {
                const cssEntries = getCssEquivalent(
                  k,
                  getCssTokenValue(v),
                  this._theme,
                );
                for (const [cssProp, cssValue] of cssEntries) {
                  if (element) {
                    element.style.setProperty(cssProp, cssValue);
                  }
                }
              }
            });
          } else {
            element.style.cssText = "";
          }
        }
        settled?.();
      }
      return UpdateElementMessage.type.result(params.element);
    }
    if (WriteTextMessage.type.isRequest(msg)) {
      const params = msg.params;
      await this.writeText(
        params.target,
        params.instructions,
        params.instant,
        this.getDisplayTime(params.time),
        params.shown,
        params.elements,
        decision,
        params.held,
      );
      return WriteTextMessage.type.result(params.target);
    }
    if (WriteImageMessage.type.isRequest(msg)) {
      const params = msg.params;
      await this.writeImage(
        params.target,
        params.instructions,
        this.getDisplayTime(params.time),
        params.elements,
        decision,
        params.reportsExit,
      );
      return WriteImageMessage.type.result(params.target);
    }
    if (AnimateElementsMessage.type.isRequest(msg)) {
      const params = msg.params;
      const player = new AnimationPlayer(this._theme, this._hold);
      const validEffects: number[] = [];
      const played: ReturnType<AnimationPlayer["add"]> = [];
      for (let i = 0; i < params.effects.length; i += 1) {
        const effect = params.effects[i];
        if (effect) {
          const element = this.getElement(effect.element);
          const animations = effect.animations;
          if (element) {
            const added = player.add({ element, animations });
            this._presence.follow(element, added);
            played.push(...added);
            validEffects.push(i);
          }
        }
      }
      await player.play();
      for (const animation of played) {
        this.dropSettledAnimation(animation);
      }
      return AnimateElementsMessage.type.result(validEffects);
    }
    if (LayoutMotionMessage.type.isRequest(msg)) {
      if (msg.params.settle) {
        this._layoutMotion.settle();
        return LayoutMotionMessage.type.result([]);
      }
      await Promise.resolve();
      const overlay = this.app.overlay;
      const moving = overlay ? this._layoutMotion.moving(overlay) : [];
      if (overlay && moving.length > 0) {
        await this._layoutMotion.finished(overlay);
      }
      return LayoutMotionMessage.type.result(
        moving.flatMap((el) => {
          const id = (el as any).__sdId;
          return typeof id === "string" ? [id] : [];
        }),
      );
    }
    if (PresenceElementsMessage.type.isRequest(msg)) {
      const played: string[] = [];
      const motions: Promise<void>[] = [];
      for (const effect of msg.params.effects) {
        const element = effect.element ? this.getElement(effect.element) : undefined;
        if (element?.isConnected) {
          played.push(effect.element);
          const presence = this._presence.play(element, effect.presence);
          motions.push(
            effect.presence === "hide"
              ? presence.then(() => this._layoutMotion.finished(element))
              : presence,
          );
        }
      }
      await Promise.all(motions);
      return PresenceElementsMessage.type.result(played);
    }
    if (PlayCutsceneMessage.type.isRequest(msg)) {
      await this.playCutscene(msg.params, (msg as StreamMessage).epoch);
      return PlayCutsceneMessage.type.result(null);
    }
    return undefined;
  }

  override onReceiveNotification(msg: NotificationMessage) {
    this.endPreviewCutscene(msg);
    if (ConfigureAssetsMessage.type.isNotification(msg)) {
      const { beatTimeout, restoreTimeout } = msg.params;
      this._drawTimeouts = {
        beat: Number.isFinite(beatTimeout) && beatTimeout >= 0 ? beatTimeout : this._drawTimeouts.beat,
        restore: Number.isFinite(restoreTimeout) && restoreTimeout >= 0 ? restoreTimeout : this._drawTimeouts.restore,
      };
      return;
    }
    if (MorphArtifactMessage.type.isNotification(msg)) {
      this.morphs?.deliver(msg.params);
      return;
    }
    if (SpeechMessage.type.isNotification(msg)) {
      this.speak(msg.params);
      return;
    }
    if (BeatMessage.type.isNotification(msg)) {
      this.receiveBeat(msg.params);
      this.morphs?.requestRelayout();
      return;
    }
    if (SkipCutsceneMessage.type.isNotification(msg)) {
      this.endCutscene();
      return;
    }
    if (msg.method.startsWith("ui/")) {
      this.morphs?.requestRelayout();
    }
    if (msg.method.startsWith("ui/") && !retiredOnly(msg)) {
      this.flushPendingBeat(true);
    }
    if (ShowingMessage.type.isNotification(msg)) {
      this.applyShowing(msg.params);
      return;
    }
    if (BeginReconcileMessage.type.isNotification(msg)) {
      this.beginReconcilePass(msg.params?.content === true);
      this._passBegun = true;
      return;
    }
    if (SweepReconcileMessage.type.isNotification(msg)) {
      if (this._passBegun) {
        this._passBegun = false;
        this.sweepReconcile();
      }
      return;
    }
    if (BatchElementsMessage.type.isNotification(msg)) {
      for (const inner of msg.params.messages as any[]) {
        if (inner && typeof inner === "object" && "id" in inner) {
          void this.onReceiveRequest(inner as RequestMessage);
        } else {
          this.onReceiveNotification(inner as NotificationMessage);
        }
      }
      return;
    }
    if (ObserveElementMessage.type.isNotification(msg)) {
      const params = msg.params;
      const el = this.getElement(params.element);
      if (el) {
        this._staleIds.delete(params.element);
        const byEvent = (this._listeners[params.element] ??= {});
        const prior = byEvent[params.event];
        if (prior) {
          el.removeEventListener(params.event, prior);
        }
        const listener = (event: Event) => {
          this.app.emit(EventMessage.type.notification(getEventData(event)));
        };
        byEvent[params.event] = listener;
        el.addEventListener(params.event, listener);
      }
    }
    if (UnobserveElementMessage.type.isNotification(msg)) {
      const params = msg.params;
      const el = this.getElement(params.element);
      const byEvent = this._listeners[params.element];
      const listener = byEvent?.[params.event];
      if (listener) {
        el?.removeEventListener(params.event, listener);
        delete byEvent[params.event];
      }
    }
  }

  protected findTargetElements(target: string): HTMLElement[] {
    const overlay = this.app.overlay;
    if (!overlay) {
      return [];
    }
    const [name, instance] = target.split("#");
    if (!name) {
      return [];
    }
    const classes = name.split(" ").filter(Boolean);
    const selector = classes.map((c) => `.${CSS.escape(c)}`).join("");
    if (!selector) {
      return [];
    }
    const classed = Array.from(
      overlay.querySelectorAll(selector),
    ) as HTMLElement[];
    const named = classed.filter((el) => el.className === name);
    const matches = named.length > 0 ? named : classed;
    if (instance) {
      const instanceIndex = Number(instance);
      if (Number.isInteger(instanceIndex) && instanceIndex >= 0) {
        const el = matches[instanceIndex];
        return el ? [el] : [];
      }
      return [];
    }
    return matches;
  }

  protected getContentElements(parent: HTMLElement, tag: string): HTMLElement[] {
    return Array.from(parent.children).filter((c) =>
      c.className.split(" ").includes(tag),
    ) as HTMLElement[];
  }

  protected applyStyle(
    el: HTMLElement,
    style: Record<string, string | number | null>,
  ) {
    for (const [k, v] of Object.entries(style)) {
      const cssEntries = getCssEquivalent(k, getCssTokenValue(v), this._theme);
      if (v == null) {
        for (const [cssProp] of cssEntries) {
          el.style.removeProperty(cssProp);
        }
      } else {
        for (const [cssProp, cssValue] of cssEntries) {
          el.style.setProperty(cssProp, cssValue);
        }
      }
    }
  }

  protected processText(
    contentEl: HTMLElement,
    sequence: TextInstruction[],
    instant: boolean,
    enter: { element: HTMLElement; animation: ReturnType<typeof getRevealAnimation> }[],
    shown: number,
    enterNow: { element: HTMLElement; animation: ReturnType<typeof getRevealAnimation> }[],
  ) {
    let lineWrapperEl: HTMLElement | undefined = undefined;
    let wordWrapperEl: HTMLElement | undefined = undefined;
    let wasSpace: boolean | undefined = undefined;
    let wasNewline: boolean | undefined = undefined;
    let prevTextAlign: string | undefined = undefined;
    let index = 0;
    const createEl = (
      parent: HTMLElement,
      type: string,
      name: string | undefined,
      style: Record<string, string | number | null> | undefined,
      text: string | undefined,
    ): HTMLElement => {
      const el = document.createElement(type);
      if (name) {
        el.className = name;
      }
      if (text != null) {
        el.textContent = text;
      }
      if (style) {
        this.applyStyle(el, style);
      }
      parent.appendChild(el);
      return el;
    };
    for (const e of sequence) {
      const text = e.text;
      const isNewline = text === "\n";
      const isSpace = text === " " || text === "\t" || text === "\n";
      const textAlign = e.style?.text_align;
      const alignStyle = textAlign
        ? {
            text_align: textAlign,
          }
        : undefined;
      if (textAlign !== prevTextAlign) {
        lineWrapperEl = createEl(
          contentEl,
          "div",
          "text_line",
          alignStyle,
          undefined,
        );
      } else if (wasNewline === undefined || isNewline !== wasNewline) {
        lineWrapperEl = createEl(
          contentEl,
          "div",
          "text_line",
          undefined,
          undefined,
        );
      }
      const style: Record<string, string | number | null> = {
        display: null,
        opacity: "0",
        ...(e.style || {}),
      };
      if (text === "\n" || text === " " || text === "\t") {
        style["display"] = "inline";
      }
      if (text === "\n" || isSpace) {
        wordWrapperEl = createEl(
          lineWrapperEl || contentEl,
          "span",
          "text_space",
          alignStyle,
          undefined,
        );
      } else if (
        wasSpace === undefined ||
        isSpace !== wasSpace ||
        textAlign !== prevTextAlign
      ) {
        wordWrapperEl = createEl(
          lineWrapperEl || contentEl,
          "span",
          "text_word",
          alignStyle,
          undefined,
        );
      }
      prevTextAlign = textAlign;
      wasNewline = isNewline;
      wasSpace = isSpace;
      const textParentEl = wordWrapperEl || lineWrapperEl || contentEl;
      const newSpanEl = createEl(
        textParentEl,
        "span",
        "text_letter",
        style,
        text === "\n" ? "" : text,
      );
      const atOnce = index < shown;
      index += 1;
      (atOnce ? enterNow : enter).push({
        element: newSpanEl,
        animation: getRevealAnimation(
          { after: e.after, over: e.over },
          instant || atOnce,
        ),
      });
    }
  }

  protected _speech?: Speech;

  protected endSpeech() {
    this._speech?.clips?.stopHearing?.();
    this._speech = undefined;
  }

  protected speak({ character, spans, beeps, voiced, revealed, time }: SpeechParams) {
    const morphs = this.morphs;
    if (!morphs) {
      return;
    }
    if (revealed && this._speech?.clips) {
      return;
    }
    this.endSpeech();
    const speech: Speech = {};
    this._speech = speech;
    const clips = voiced && character ? (this.app.audio?.liveClips("voice") ?? []) : [];
    if (character && clips.length > 0) {
      this.speakClips(morphs, character, clips, speech);
      return;
    }
    const shown = this.getDisplayTime(time);
    const doc = this.app.overlay?.ownerDocument;
    const now = Number(
      doc?.timeline?.currentTime ?? doc?.defaultView?.performance.now(),
    );
    const lead =
      shown != null && Number.isFinite(now) ? (shown - now) / 1000 : 0;
    morphs.speak(
      character,
      spans.map(([start, end]): [number, number] => [start + lead, end + lead]),
      (beeps ?? []).map((beep) => beep + lead),
    );
  }

  protected speakClips(
    morphs: MorphPlayback,
    character: string,
    clips: LiveClip[],
    speech: Speech,
  ) {
    const latency = this.app.audioClock.reading.outputLatency;
    const audioNow = () => this.app.audioContext?.currentTime ?? 0;
    const heard: { clip: LiveClip; start: number; end: number }[] = [];
    const seen = new Set<Promise<unknown>>();
    const update = () => {
      if (this._speech !== speech || this._disposed) {
        return;
      }
      const now = morphs.now;
      morphs.speak(
        character,
        heard.map(({ start, end }): [number, number] => [
          start - now,
          Number.isFinite(end) ? end - now : UNENDED_SPEECH,
        ]),
      );
    };
    const hear = (clip: LiveClip) => {
      if (seen.has(clip.ended)) {
        return;
      }
      seen.add(clip.ended);
      const span = { clip, start: morphs.now + (clip.startedAt - audioNow()) + latency, end: Infinity };
      heard.push(span);
      void clip.ended.then(() => {
        span.end = morphs.now + latency;
        update();
      });
    };
    clips.forEach(hear);
    speech.clips = {
      retime: () => {
        const now = morphs.now;
        const pending = heard.filter((span) => span.start > now);
        for (const span of pending) {
          span.start = now + Math.max(0, span.clip.startedAt - audioNow()) + latency;
        }
        if (pending.length > 0) {
          update();
        }
      },
      stopHearing: this.app.audio?.onClipStart("voice", (clip) => {
        hear(clip);
        update();
      }),
    };
    update();
  }

  protected getDisplayTime(time: number | undefined): number | undefined {
    if (time == null) {
      return undefined;
    }
    return (
      this.app.audioClock.toDocumentTime(time) +
      this.app.audioClock.reading.outputLatency * 1000
    );
  }

  protected async writeText(
    target: string,
    instructions: TextInstruction[],
    instant: boolean,
    startTime?: number,
    shown = 0,
    elements?: string[],
    decision?: WriteDecision,
    held = false,
  ) {
    const targetEls = this.writeTargets(target, elements);
    const stale = this._passBegun
      ? targetEls.filter((el) => this._staleTextTargets.has(el))
      : [];
    for (const el of targetEls) {
      this._staleTextTargets.delete(el);
    }
    const sig = JSON.stringify(instructions);
    const holdsNoWrite = (el: HTMLElement) => {
      const txt = (el as any).__sdTxt;
      return txt === undefined || txt === "[]";
    };
    const holds = (el: HTMLElement) => {
      const a = el as any;
      return (
        a.__sdTxt === sig &&
        (!stale.includes(el) ||
          (JSON.stringify(a.__sdAll) === sig && a.__sdAllRev === (a.__sdRev ?? 0)))
      );
    };
    const holding =
      decision === "same" ||
      (decision == null && targetEls.length > 0 && targetEls.every(holds));
    const replays =
      holding &&
      !instant &&
      this.app.previewing === true &&
      instructions.slice(shown).some((e) => (e.after ?? 0) > 0) &&
      targetEls.every((el) => (el as any).__sdTxtAtOnce === true);
    if (holding && !replays) {
      if (instant) {
        for (const el of targetEls) {
          this.revealAtOnce(el);
          (el as any).__sdTxtAtOnce = true;
        }
      } else if (!held) {
        this.startHeldReveal(targetEls, startTime);
      }
      return;
    }
    for (const el of targetEls) {
      if (
        instructions.length > 0 &&
        (decision === "rebuild" ||
          replays ||
          stale.includes(el) ||
          holdsNoWrite(el))
      ) {
        this.clearWrittenText(el, true);
      }
      (el as any).__sdTxt = sig;
      (el as any).__sdTxtRev = (el as any).__sdRev ?? 0;
      (el as any).__sdTxtAtOnce = instant;
    }
    const enter: {
      element: HTMLElement;
      animation: ReturnType<typeof getRevealAnimation>;
    }[] = [];
    const enterNow: typeof enter = [];
    const atOnce = !instant && shown > 0;
    const wait = instructions.reduce(
      (min, e) => Math.min(min, e.after ?? 0),
      Infinity,
    );
    const waiting: HTMLElement[] = [];
    for (const targetEl of targetEls) {
      const textEls = this.getContentElements(targetEl, "text");
      const strokeEls = this.getContentElements(targetEl, "stroke");
      const contentEls = [...textEls, ...strokeEls];
      const empty =
        contentEls.length > 0 && contentEls.every((el) => !el.hasChildNodes());
      if (instant) {
        this.revealAtOnce(targetEl);
      } else if (instructions.length === 0 || empty) {
        (targetEl as any).__sdWait?.cancel();
        delete (targetEl as any).__sdWait;
      }
      if (!instant && !atOnce && !held && instructions.length > 0 && empty) {
        waiting.push(targetEl);
      }
      if (instructions.length > 0) {
        for (const textEl of textEls) {
          this.processText(textEl, instructions, instant, enter, shown, enterNow);
        }
        for (const strokeEl of strokeEls) {
          this.processText(strokeEl, instructions, instant, enter, shown, enterNow);
        }
        const held: unknown[] | undefined = (targetEl as any).__sdAll;
        if (empty) {
          (targetEl as any).__sdAllRev = (targetEl as any).__sdRev ?? 0;
        }
        (targetEl as any).__sdAll = empty
          ? [...instructions]
          : held
            ? [...held, ...instructions]
            : undefined;
      } else {
        for (const contentEl of contentEls) {
          this.removeWritten(contentEl);
        }
        (targetEl as any).__sdAll = [];
        (targetEl as any).__sdAllRev = (targetEl as any).__sdRev ?? 0;
      }
    }
    const settle = (reveal: ReturnType<AnimationPlayer["add"]>[number]) =>
      this.settleReveal(reveal);
    const shownNow = new AnimationPlayer(this._theme, this._hold);
    for (const { element, animation } of enterNow) {
      (element as any).__sdReveal = shownNow.add({
        element,
        animations: [animation],
      })[0];
    }
    const showing = enterNow.length > 0 ? shownNow.play(undefined, settle) : undefined;
    if (enter.length > 0 || waiting.length > 0) {
      const player = new AnimationPlayer(this._theme, this._hold);
      for (const { element, animation } of enter) {
        (element as any).__sdReveal = player.add({
          element,
          animations: [animation],
        })[0];
      }
      for (const element of waiting) {
        (element as any).__sdWait = player.add({
          element,
          animations: [getHiddenUntilAnimation(wait)],
        })[0];
      }
      for (const el of targetEls) {
        if (held) {
          (el as any).__sdHeldReveal = player;
        } else {
          delete (el as any).__sdHeldReveal;
        }
      }
      await player.play(
        held ? this.documentNow() + HELD_REVEAL_MS : startTime,
        settle,
      );
    }
    await showing;
  }

  protected startHeldReveal(targetEls: HTMLElement[], startTime?: number) {
    for (const el of targetEls) {
      const reveal: AnimationPlayer | undefined = (el as any).__sdHeldReveal;
      if (reveal) {
        delete (el as any).__sdHeldReveal;
        reveal.retime(startTime ?? this.documentNow());
      }
    }
  }

  protected settleReveal(reveal: ReturnType<AnimationPlayer["add"]>[number]) {
    const effect = reveal.effect;
    const element = effect instanceof KeyframeEffect ? effect.target : null;
    if (
      !(effect instanceof KeyframeEffect) ||
      !(element instanceof HTMLElement) ||
      (element as any).__sdReveal !== reveal
    ) {
      return;
    }
    const time = reveal.currentTime;
    const end = effect.getComputedTiming().endTime;
    const ended =
      reveal.playState === "finished" ||
      (reveal.playState === "paused" &&
        time != null &&
        end != null &&
        Number(time) >= Number(end));
    if (!ended) {
      return;
    }
    const keyframes = effect.getKeyframes();
    const last = keyframes[keyframes.length - 1] ?? {};
    for (const [prop, value] of Object.entries(last)) {
      if (
        value == null ||
        ["offset", "computedOffset", "easing", "composite"].includes(prop)
      ) {
        continue;
      }
      if (prop.startsWith("--")) {
        element.style.setProperty(prop, String(value));
      } else {
        (element.style as unknown as Record<string, string>)[prop] = String(value);
      }
    }
    reveal.cancel();
    delete (element as any).__sdReveal;
  }

  protected dropSettledAnimation(
    animation: ReturnType<AnimationPlayer["add"]>[number],
  ) {
    const effect = animation.effect;
    if (animation.playState !== "finished" || !(effect instanceof KeyframeEffect)) {
      return;
    }
    const target = effect.target;
    if (!target) {
      return;
    }
    const props = new Set<string>();
    for (const keyframe of effect.getKeyframes()) {
      for (const prop of Object.keys(keyframe)) {
        if (!["offset", "computedOffset", "easing", "composite"].includes(prop)) {
          props.add(prop);
        }
      }
    }
    const read = () => {
      const style = getComputedStyle(target);
      return Array.from(props, (prop) =>
        prop.startsWith("--")
          ? style.getPropertyValue(prop)
          : String((style as unknown as Record<string, unknown>)[prop] ?? ""),
      );
    };
    const settled = read();
    animation.cancel();
    const without = read();
    if (settled.some((value, i) => value !== without[i])) {
      animation.finish();
    }
  }

  protected revealAtOnce(targetEl: HTMLElement) {
    (targetEl as any).__sdWait?.cancel();
    delete (targetEl as any).__sdWait;
    delete (targetEl as any).__sdHeldReveal;
    for (const contentEl of [
      ...this.getContentElements(targetEl, "text"),
      ...this.getContentElements(targetEl, "stroke"),
    ]) {
      for (const letter of Array.from(
        contentEl.querySelectorAll(".text_letter"),
      )) {
        (letter as any).__sdReveal?.finish();
      }
    }
  }

  protected async writeImage(
    target: string,
    instructions: WriteImageInstruction[],
    startTime?: number,
    elements?: string[],
    decision?: WriteDecision,
    reportsExit?: boolean,
  ) {
    const targetEls = this.writeTargets(target, elements);
    for (const el of targetEls) {
      this._staleImageTargets.delete(el);
    }
    const sig = imageSignature(instructions);
    if (
      decision === "same" ||
      (decision == null &&
        targetEls.length > 0 &&
        targetEls.every(
          (el) =>
            (el as any).__sdImg === sig &&
            (el as any).__sdImgRev === ((el as any).__sdRev ?? 0),
        ))
    ) {
      if (
        instructions.some((i) => i.content?.video && !i.content.video.preview)
      ) {
        for (const el of targetEls) {
          for (const imageEl of this.getContentElements(el, "image")) {
            for (const video of Array.from(
              imageEl.querySelectorAll("video.object"),
            ) as HTMLVideoElement[]) {
              if (!(video as any).__sdMovie) {
                video.currentTime = 0;
                this.startMovie(video);
              }
            }
          }
        }
      }
      return;
    }
    for (const el of targetEls) {
      (el as any).__sdImg = sig;
      (el as any).__sdImgRev = (el as any).__sdRev ?? 0;
    }
    const targetPlayers: AnimationPlayer[] = [];
    const enterEffects: ImageEffect[] = [];
    const exitEffects: ImageEffect[] = [];
    const toDestroy: HTMLElement[] = [];
    const outgoing: HTMLElement[] = [];
    const hiding: { pictureEl: HTMLElement; exits: ReturnType<AnimationPlayer["add"]> }[] = [];
    const starting: { pictureEl: HTMLElement; animation: globalThis.Animation; start: () => void }[] = [];
    const newMovies: { video: HTMLVideoElement; after: AnimationPlayer }[] = [];
    const hiddenMovies: HTMLVideoElement[] = [];

    const applyStyle = this.applyStyle.bind(this);

    for (const targetEl of targetEls) {
      const imageEls = this.getContentElements(targetEl, "image");
      const maskEls = this.getContentElements(targetEl, "mask");
      if (instructions.length === 0) {
        for (const contentEl of [...imageEls, ...maskEls]) {
          this.releaseMovies(contentEl);
          this.morphs?.releaseWithin(contentEl);
          endTravelsWithin(contentEl);
          contentEl.replaceChildren();
        }
        continue;
      }
      const contentTargets: { els: HTMLElement[]; property: string }[] = [
        { els: imageEls, property: "background_image" },
        { els: maskEls, property: "mask_image" },
      ];
      for (const instruction of instructions) {
        const after = new AnimationPlayer(this._theme, this._hold);
        targetPlayers.push(after);
        const targetEffects: ImageEffect[] = [];
        this.addAnimationEffects(
          targetEffects,
          targetEl,
          instruction.targetAnimations,
        );
        const targetAnimations = targetEffects.flatMap((e) => after.add(e));
        if (instruction.affected) {
          for (const a of instruction.affected) {
            for (const el of this.findTargetElements(a.target)) {
              this.addAnimationEffects(enterEffects, el, a.animations, after);
            }
          }
        }
        const content = instruction.content;
        if (!content) {
          const pictureEls = [...imageEls, ...maskEls].flatMap((contentEl) =>
            (Array.from(contentEl.children) as HTMLElement[]).filter((el) => !(el as any).__sdPrepared),
          );
          const travel = instruction.travel;
          if (travel) {
            const timing = { ...travel.timing, fill: "backwards" as const };
            const mover = movesPicture(instruction)
              ? new AnimationPlayer(this._theme, this._hold)
              : undefined;
            if (mover) {
              targetPlayers.push(mover);
            }
            const delayed = Number(getEffectTiming(timing).delay ?? 0) > 0;
            for (const pictureEl of pictureEls) {
              if (mover && delayed) {
                const animation = mover.addKeyframes(pictureEl, [], timing);
                const start = scheduleTravel(
                  pictureEl,
                  travel.framing,
                  { animation, drop: () => mover.remove(animation) },
                  instructions,
                );
                starting.push({ pictureEl, animation, start });
                continue;
              }
              travelPicture(pictureEl, travel.framing, (keyframes) => {
                if (!mover) {
                  return undefined;
                }
                const animation = mover.addKeyframes(pictureEl, keyframes, timing);
                return { animation, drop: () => mover.remove(animation) };
              }, instructions);
            }
          }
          if (instruction.control === "show") {
            for (const pictureEl of pictureEls) {
              placePicture(pictureEl, instruction.framing);
            }
          }
          if (travel || instruction.control === "show") {
            this.morphs?.requestRelayout();
          }
          if (instruction.control === "hide") {
            for (const pictureEl of pictureEls) {
              hiding.push({ pictureEl, exits: targetAnimations });
            }
            for (const imageEl of imageEls) {
              for (const video of Array.from(imageEl.querySelectorAll("video"))) {
                if (!hiddenMovies.includes(video)) {
                  hiddenMovies.push(video);
                }
              }
            }
          }
          continue;
        }
        const morphGroup = new MorphGroup();
        for (const { els, property } of contentTargets) {
          for (const contentEl of els) {
            const prevSpanEls = (Array.from(contentEl.children) as HTMLElement[]).filter((el) => !(el as any).__sdPrepared);
            const video =
              content.video && property === "background_image"
                ? content.video
                : undefined;
            const prepared = !video ? this.takePrepared(instruction, contentEl) : undefined;
            const newSpanEl = prepared ?? (video
              ? createVideoElement(
                  contentEl,
                  property,
                  content.background,
                  content.imageNames,
                  {
                    src: this.getVideoSrc(video.src),
                    fileSrc: video.src,
                    loop: video.loop,
                    muted: video.muted,
                    preview: video.preview,
                  },
                  applyStyle,
                )
              : createImageElement(
                  contentEl,
                  property,
                  content.background,
                  content.imageNames,
                  content.sources ?? (content.src ? [content.src] : []),
                  applyStyle,
                ));
            placePicture(newSpanEl, instruction.framing);
            const videoEl = newSpanEl.querySelector("video");
            if (videoEl && video) {
              (videoEl as any).__sdMixer = {
                mixer: video.mixer,
                mixerGain: video.mixerGain,
              };
            }
            if (videoEl && !video?.preview && instruction.control !== "hide") {
              newMovies.push({ video: videoEl, after });
            }
            (newSpanEl as any).__sdSrcs =
              content.video && !video
                ? content.srcs.filter((src) => src !== content.video?.src)
                : content.srcs;
            const morph = instruction.control !== "hide" ? content.morph : undefined;
            const pictures = !video ? (content.pictures ?? []) : [];
            const composited = new Set(
              (property === "background_image" ? pictures : []).flatMap((picture) => picture.files.map((file) => file.src)),
            );
            (this.app.assets?.cache ?? this.app.assetCache)?.keepWhole(content.srcs.filter((src) => !composited.has(src)));
            const preparedLayer = prepared ? (prepared as HTMLElement & { __sdMorph?: MorphLayer }).__sdMorph : undefined;
            if (preparedLayer) {
              preparedLayer.release();
            } else if (morph || pictures.length > 0) {
              this.morphs?.mount(
                newSpanEl,
                morph ?? { plays: [], epoch: 0 },
                content.background,
                property === "mask_image" ? "mask" : "background",
                `${(targetEl as any).__sdId ?? target}:${property}:${els.indexOf(contentEl)}`,
                morphGroup,
                pictures,
              );
            }
            if (instruction.control === "show") {
              if (!content.previousHideAnimation) {
                for (const prevSpanEl of prevSpanEls) {
                  haltPicture(prevSpanEl);
                }
              }
              if (content.previousHideAnimation) {
                for (const prevSpanEl of prevSpanEls) {
                  if (!outgoing.includes(prevSpanEl)) {
                    outgoing.push(prevSpanEl);
                  }
                  this.addAnimationEffects(
                    exitEffects,
                    prevSpanEl,
                    [content.previousHideAnimation],
                    after,
                  );
                  if (!toDestroy.includes(prevSpanEl)) {
                    toDestroy.push(prevSpanEl);
                  }
                }
              }
              if (content.enterAnimation) {
                this.addAnimationEffects(
                  enterEffects,
                  newSpanEl,
                  [content.enterAnimation],
                  after,
                );
              }
            } else if (instruction.control === "hide") {
              if (content.exitAnimation) {
                this.addAnimationEffects(
                  exitEffects,
                  newSpanEl,
                  [content.exitAnimation],
                  after,
                );
              }
              if (!toDestroy.includes(newSpanEl)) {
                toDestroy.push(newSpanEl);
              }
            } else if (instruction.control === "animate") {
              if (content.enterAnimation) {
                this.addAnimationEffects(
                  enterEffects,
                  newSpanEl,
                  [content.enterAnimation],
                  after,
                );
              }
            }
          }
        }
      }
    }

    if (targetPlayers.some((player) => player.endTimeUndelayed > 0)) {
      startTime ??= Number(document.timeline.currentTime);
    }
    const targetsPlayed = new Map(
      targetPlayers.map((player) => [player, player.play(startTime)]),
    );
    for (const { video, after } of newMovies) {
      void targetsPlayed.get(after)?.then(() => this.startMovie(video));
    }
    const exiting = new Map<HTMLElement, ReturnType<AnimationPlayer["add"]>>();
    const playEffects = (
      effects: ImageEffect[],
      created?: Map<HTMLElement, ReturnType<AnimationPlayer["add"]>>,
    ) => {
      const players = new Map<AnimationPlayer | undefined, AnimationPlayer>();
      for (const e of effects) {
        let player = players.get(e.after);
        if (!player) {
          player = new AnimationPlayer(this._theme, this._hold);
          players.set(e.after, player);
        }
        const animations = player.add(e);
        created?.set(e.element, [...(created.get(e.element) ?? []), ...animations]);
      }
      return Array.from(players, ([after, player]) =>
        player.play(
          startTime == null
            ? undefined
            : startTime + (after?.endTimeUndelayed ?? 0),
        ),
      );
    };
    const played = Promise.all([
      ...targetsPlayed.values(),
      ...playEffects(enterEffects),
      ...playEffects(exitEffects, exiting),
    ]);
    for (const el of outgoing) {
      this.freezeWhenExitStarts(el, exiting.get(el) ?? []);
    }
    for (const { pictureEl, exits } of hiding) {
      this.whenExitStarts(pictureEl, exits, () => haltPicture(pictureEl));
    }
    for (const { pictureEl, animation, start } of starting) {
      this.whenExitStarts(pictureEl, [animation], start);
    }
    const removed = played.then(() => {
      for (const el of toDestroy) {
        this.releaseMovies(el);
        this.morphs?.releaseWithin(el);
        endTravelsWithin(el);
        el.remove();
      }
      for (const video of hiddenMovies) {
        const span = video.closest("span.instance");
        this.releaseMovies(video);
        endTravelsWithin(span ?? video);
        (span ?? video).remove();
      }
    });
    if (!reportsExit) {
      await removed;
      return;
    }
    const shown = targetEls.flatMap((targetEl) =>
      [...this.getContentElements(targetEl, "image"), ...this.getContentElements(targetEl, "mask")].flatMap(
        (contentEl) =>
          (Array.from(contentEl.children) as HTMLElement[])
            .filter((el) => !(el as any).__sdPrepared)
            .map((element) => ({ element, target: targetEl })),
      ),
    );
    removed.catch((error) => {
      console.error("a hidden picture could not be removed", error);
    });
    await Promise.race([removed, whenUnseen(shown, removed)]);
  }

  protected freezeWhenExitStarts(
    el: HTMLElement,
    exits: ReturnType<AnimationPlayer["add"]>,
  ) {
    this.whenExitStarts(el, exits, () => {
      this.morphs?.freezeWithin(el);
      haltPicture(el);
    });
  }

  protected whenExitStarts(
    el: HTMLElement,
    exits: ReturnType<AnimationPlayer["add"]>,
    run: () => void,
  ) {
    const doc = el.ownerDocument;
    const view = doc.defaultView;
    const startOf = (exit: globalThis.Animation, now: number) =>
      exit.startTime != null
        ? Number(exit.startTime)
        : exit.currentTime != null
          ? now - Number(exit.currentTime) / exit.playbackRate
          : NaN;
    const check = () => {
      if (!el.isConnected) {
        return;
      }
      const now = Number(doc.timeline?.currentTime);
      const starts = exits
        .map(
          (exit) =>
            startOf(exit, now) + Number(exit.effect?.getTiming?.().delay ?? 0),
        )
        .filter((at) => Number.isFinite(at));
      const at = starts.length > 0 ? Math.min(...starts) : -Infinity;
      if (!(now < at)) {
        run();
        return;
      }
      if (view?.requestAnimationFrame) {
        view.requestAnimationFrame(check);
      } else {
        setTimeout(check, Math.max(1, at - now));
      }
    };
    check();
  }

  protected async playCutscene(
    params: PlayCutsceneParams,
    epoch?: number,
  ): Promise<void> {
    const overlay = this.app.overlay as OverlayWithCutscene | undefined;
    if (!overlay || this._disposed) {
      return;
    }
    this.endCutscene(true);
    const element = createCutsceneElement(overlay, {
      src: this.getVideoSrc(params.src),
      fileSrc: params.src,
      loop: params.loop,
      muted: params.muted,
      preview: params.preview,
    });
    const video = element.querySelector("video") as HTMLVideoElement;
    if (params.preview) {
      overlay.__sdCutscene = {
        element,
        previewEpoch: epoch ?? 0,
        end: () => {
          if (overlay.__sdCutscene?.element === element) {
            delete overlay.__sdCutscene;
          }
          this.releaseMovies(element);
          element.remove();
        },
      };
      return;
    }
    (video as any).__sdMixer = {
      mixer: params.mixer,
      mixerGain: params.mixerGain,
    };
    let transition: ReturnType<AnimationPlayer["add"]> = [];
    const playTransition = (animation: Animation) => {
      const player = new AnimationPlayer(this._theme, this._hold);
      transition = player.add({ element, animations: [animation] });
      return player.play().finally(() => {
        transition = [];
      });
    };
    const stopTransition = () => {
      for (const animation of transition) {
        try {
          animation.commitStyles();
        } catch {
        }
        animation.cancel();
      }
      transition = [];
    };
    let ending: (() => void) | undefined;
    const ended = new Promise<void>((resolve) => {
      ending = resolve;
    });
    const end = (immediate = false) => {
      stopTransition();
      if (immediate) {
        remove();
      }
      ending?.();
      ending = undefined;
    };
    const skip = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      end();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) {
        skip(e);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isAdvanceKey(e)) {
        skip(e);
      }
    };
    const onEnded = () => {
      if (!video.loop) {
        end();
      }
    };
    const win = overlay.ownerDocument.defaultView;
    const cutscene: Cutscene = { element, end };
    const remove = () => {
      element.removeEventListener("pointerdown", onPointerDown);
      win?.removeEventListener("keydown", onKeyDown, true);
      video.removeEventListener("ended", onEnded);
      if (overlay.__sdCutscene === cutscene) {
        delete overlay.__sdCutscene;
      }
      if (element.isConnected) {
        this.releaseMovies(element);
        element.remove();
      }
    };
    overlay.__sdCutscene = cutscene;
    element.addEventListener("pointerdown", onPointerDown);
    win?.addEventListener("keydown", onKeyDown, true);
    video.addEventListener("ended", onEnded);
    if (params.enter) {
      const fades = params.enter.keyframes.some(
        (keyframe) => keyframe != null && "opacity" in keyframe,
      );
      if (fades) {
        element.style.opacity = "0";
      }
      await playTransition(params.enter);
      if (fades && ending) {
        element.style.removeProperty("opacity");
      }
    }
    if (ending) {
      this.startMovie(video);
    }
    await ended;
    if (element.isConnected && params.exit) {
      delete (video as any).__sdMovie;
      video.pause();
      await playTransition(params.exit);
    }
    remove();
  }

  protected endCutscene(immediate = false) {
    const overlay = this.app.overlay as OverlayWithCutscene | undefined;
    overlay?.__sdCutscene?.end(immediate);
  }

  protected endPreviewCutscene(msg: StreamMessage) {
    const overlay = this.app.overlay as OverlayWithCutscene | undefined;
    const shown = overlay?.__sdCutscene?.previewEpoch;
    if (
      shown !== undefined &&
      typeof msg.epoch === "number" &&
      msg.epoch > shown
    ) {
      this.endCutscene(true);
    }
  }

  protected getVideoSrc(fileSrc: string): string {
    const cache = this.app.assets?.cache ?? this.app.assetCache;
    return cache?.getVideoUrl(fileSrc) ?? fileSrc;
  }

  protected movies(): HTMLVideoElement[] {
    const overlay = this.app.overlay;
    if (!overlay) {
      return [];
    }
    return (
      Array.from(overlay.querySelectorAll("video.object")) as HTMLVideoElement[]
    ).filter((video) => (video as any).__sdMovie);
  }

  protected startMovie(video: HTMLVideoElement) {
    if (this._disposed || !video.isConnected) {
      return;
    }
    (video as any).__sdMovie = true;
    (video as any).__sdManager = this;
    delete (video as any).__sdSeek;
    this.anchorMovie(video, video.currentTime);
    if (!(video as any).__sdSettles) {
      (video as any).__sdSettles = true;
      const settle = (e: Event) =>
        (video as any).__sdManager?.settleMovie(video, e.type);
      for (const type of [
        "loadedmetadata",
        "durationchange",
        "seeked",
        "ended",
      ]) {
        video.addEventListener(type, settle);
      }
    }
    if (!this.app.paused) {
      this.playMovie(video);
    }
  }

  protected playMovie(video: HTMLVideoElement) {
    const route = (video as any).__sdMixer as
      | { mixer: string; mixerGain: number }
      | undefined;
    if (route) {
      this.app.audio?.connectMovie?.(video, route.mixer, route.mixerGain);
    }
    const played = video.play();
    played?.catch((e: unknown) => {
      if (
        (e as Error)?.name === "NotAllowedError" &&
        !video.muted &&
        (video as any).__sdMovie
      ) {
        video.muted = true;
        video.play()?.catch(() => {});
      }
    });
  }

  protected releaseMovies(root: Element) {
    const videos = (
      root.tagName === "VIDEO"
        ? [root]
        : Array.from(root.querySelectorAll("video"))
    ) as HTMLVideoElement[];
    for (const video of videos) {
      delete (video as any).__sdMovie;
      delete (video as any).__sdManager;
      delete (video as any).__sdSeek;
      video.pause();
      video.removeAttribute("src");
      video.load();
      this.app.audio?.disconnectMovie?.(video);
    }
  }

  protected _disposed = false;

  protected pauseMovies() {
    for (const video of this.movies()) {
      if (!video.paused) {
        video.pause();
      }
      const place = this.moviePlace(video, video.currentTime);
      this.anchorMovie(video, place.anchor);
      if (Math.abs(video.currentTime - place.element) > MOVIE_AT) {
        this.seekMovie(video, place.element);
      }
    }
  }

  protected resumeMovies() {
    for (const video of this.movies()) {
      if (!this.heldAtEnd(video)) {
        this.playMovie(video);
      }
    }
  }

  protected heldAtEnd(video: HTMLVideoElement): boolean {
    if (video.loop) {
      return false;
    }
    const span = this.movieSpan(video);
    return video.ended || (span !== undefined && video.currentTime >= span);
  }

  protected movieSpan(video: HTMLVideoElement): number | undefined {
    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0) {
      return duration;
    }
    const end = (video as any).__sdEnd;
    return typeof end === "number" && end > 0 ? end : undefined;
  }

  protected moviePlace(
    video: HTMLVideoElement,
    time: number,
  ): { anchor: number; element: number } {
    const span = this.movieSpan(video);
    if (video.loop && span !== undefined) {
      return { anchor: time, element: ((time % span) + span) % span };
    }
    const end = !video.loop && span !== undefined ? span : Infinity;
    const at = Math.min(Math.max(0, time), end);
    return { anchor: at, element: at };
  }

  protected anchorMovie(video: HTMLVideoElement, time: number) {
    const clock = this.app.clock?.elapsedTime;
    (video as any).__sdAnchor =
      clock != null ? { time, clock } : undefined;
  }

  protected clockTime(video: HTMLVideoElement): number {
    const anchor = (video as any).__sdAnchor as
      | { time: number; clock: number }
      | undefined;
    const clock = this.app.clock?.elapsedTime;
    return anchor && clock != null
      ? anchor.time + (clock - anchor.clock)
      : video.currentTime;
  }

  protected settleMovie(video: HTMLVideoElement, event: string) {
    if (!(video as any).__sdMovie) {
      return;
    }
    if (event === "ended") {
      (video as any).__sdEnd = video.currentTime;
      video.pause();
      this.anchorMovie(video, this.moviePlace(video, video.currentTime).anchor);
      return;
    }
    if (event === "seeked") {
      if (video.seeking) {
        return;
      }
      const asked = (video as any).__sdSeek as
        { time: number; span: number | undefined } | undefined;
      delete (video as any).__sdSeek;
      if (!asked) {
        return;
      }
      const landed = video.currentTime;
      if (landed >= asked.time - MOVIE_AT) {
        return;
      }
      if (this.movieSpan(video) === asked.span) {
        if (asked.span === undefined && landed > 0) {
          (video as any).__sdEnd = landed;
        } else {
          this.anchorMovie(video, this.moviePlace(video, landed).anchor);
          return;
        }
      }
    }
    if (this.app.paused) {
      this.placeMovie(video);
    } else {
      this._unsettledMovies.add(video);
    }
  }

  protected _unsettledMovies = new Set<HTMLVideoElement>();

  protected settleMovies() {
    if (!this._unsettledMovies.size) {
      return;
    }
    const videos = Array.from(this._unsettledMovies);
    this._unsettledMovies.clear();
    for (const video of videos) {
      if ((video as any).__sdMovie && (video as any).__sdManager === this) {
        this.placeMovie(video);
      }
    }
  }

  protected placeMovie(video: HTMLVideoElement) {
    const place = this.moviePlace(video, this.clockTime(video));
    this.anchorMovie(video, place.anchor);
    const outOfPlace = video.paused
      ? Math.abs(video.currentTime - place.element) > MOVIE_AT
      : this.movieGap(video, place.element) > MOVIE_IN_STEP;
    if (outOfPlace) {
      this.seekMovie(video, place.element);
    }
  }

  protected movieGap(video: HTMLVideoElement, time: number): number {
    const gap = Math.abs(video.currentTime - time);
    const span = this.movieSpan(video);
    return video.loop && span !== undefined ? Math.min(gap, span - gap) : gap;
  }

  protected seekMovie(video: HTMLVideoElement, time: number) {
    (video as any).__sdSeek = { time, span: this.movieSpan(video) };
    video.currentTime = time;
  }

  private addAnimationEffects(
    effects: ImageEffect[],
    element: HTMLElement,
    animations: Animation[] | undefined,
    after?: AnimationPlayer,
  ) {
    if (!animations?.length) {
      return;
    }
    for (const animation of animations) {
      for (const el of resolveAnimationTargets(
        element,
        animation.target?.$name,
      )) {
        effects.push({ element: el, animations: [animation], after });
      }
    }
  }
}
