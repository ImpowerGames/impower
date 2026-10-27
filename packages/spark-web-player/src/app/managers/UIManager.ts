import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import AnimationPlayer from "../../../../spark-dom/src/classes/AnimationPlayer";
import { createImageElement } from "../../../../spark-dom/src/utils/createImageElement";
import {
  createCutsceneElement,
  createVideoElement,
} from "../../../../spark-dom/src/utils/createVideoElement";
import { resolveAnimationTargets } from "../../../../spark-dom/src/utils/resolveAnimationTargets";
import { getCSSPropertyKeyValue } from "../../../../spark-dom/src/utils/getCSSPropertyKeyValue";
import { getElementContent } from "../../../../spark-dom/src/utils/getElementContent";
import { getHiddenUntilAnimation } from "../../../../spark-dom/src/utils/getHiddenUntilAnimation";
import { getRevealAnimation } from "../../../../spark-dom/src/utils/getRevealAnimation";
import type { TextInstruction } from "../../../../spark-engine/src/game/core/types/Instruction";
import type { Animation } from "../../../../spark-engine/src/game/modules/ui/types/Animation";
import { AnimateElementsMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/AnimateElementsMessage";
import { BatchElementsMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/BatchElementsMessage";
import { BeginReconcileMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/BeginReconcileMessage";
import { CreateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/CreateElementMessage";
import { DestroyElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/DestroyElementMessage";
import { MoveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/MoveElementMessage";
import { ObserveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/ObserveElementMessage";
import {
  type PlayCutsceneParams,
  PlayCutsceneMessage,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/PlayCutsceneMessage";
import { SetThemeMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/SetThemeMessage";
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
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getCssPropertyNames } from "../../../../sparkle-style-transformer/src/utils/getCssPropertyNames";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import type { StreamMessage } from "../../../../spark-engine/src/game/core/classes/Connection";
import { isAdvanceKey } from "../../../../spark-engine/src/game/core/utils/isAdvanceKey";
import { Manager } from "../Manager";
import { MorphPlayback } from "../morph/MorphPlayback";
import { getEventData } from "../utils/getEventData";
import type { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import {
  BeatMessage,
  type BeatParams,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/BeatMessage";

/** What a composed beat does with one of its text or image writes
 *  (`UIManager.planBeat`, #1820). */
type WriteDecision =
  /** A clear its next write undoes: not applied. */
  | "skip"
  /** The target holds this write already: nothing changes, nothing reveals. */
  | "same"
  /** Applied as it stands. */
  | "write"
  /** The target shows this text write over a subtree that has changed
   *  since: emptied and written again. */
  | "rebuild";

type WriteKind = typeof WriteTextMessage.type | typeof WriteImageMessage.type;

type WriteParams = { target: string; instructions: any[]; elements?: string[] };

/** What an element holds, as `planBeat` follows it through a beat. */
interface HeldState {
  txt?: string;
  txtRev?: number;
  all?: unknown[];
  allRev?: number;
  img?: string;
  imgRev?: number;
  /** Whether it has text or stroke content elements. */
  leaves: boolean;
  /** Whether those are all empty. */
  empty: boolean;
}

/** A played beat waiting for the instant its text starts revealing (#1820),
 *  kept on the overlay with the manager that received it. Only that
 *  manager's application can put it up: its teardown calls it off. */
interface PendingBeat {
  params: BeatParams;
  ops: IMessage[];
  plan: Map<IMessage, WriteDecision>;
  /** Its commit instant on the document timeline. */
  at: number;
  timer?: ReturnType<typeof setTimeout>;
  owner: UIManager;
}

type OverlayWithBeat = HTMLElement & { __sdBeat?: PendingBeat };

/** The cutscene on the page (`UIManager.playCutscene`), kept on the overlay
 *  so that whichever manager shows the page next can end it. `end` takes it
 *  down after its exit transition, or at once with `immediate`, and the
 *  request that showed it is answered once it has gone. */
interface Cutscene {
  element: HTMLElement;
  end: (immediate?: boolean) => void;
  /** A preview's: the stream that showed it, which it stays up for. */
  previewEpoch?: number;
}

type OverlayWithCutscene = HTMLElement & { __sdCutscene?: Cutscene };

/** The furthest ahead of the page's clock a played beat's display time may
 *  be for the page to wait for it. A beat is stamped a little ahead of its
 *  writes (the beat lead plus the audio output latency); a stamp further off
 *  is a clock out of step, not a wait. The delay before the beat's first
 *  letter comes on top. */
const COMMIT_WAIT_LIMIT_MS = 1_000;

/** Counts PLAY sessions, each of which starts every portrait morph at rest. */
let playSessions = 0;

/** How far, in seconds, a playing movie's element may stand from where the
 *  game clock puts it and still be in step: playback starts a moment after
 *  it is asked for, and a seek of a movie in step would hold its picture
 *  while it decodes. */
const MOVIE_IN_STEP = 0.25;

/** How far, in seconds, an element may stand from a position it was given
 *  and still be there: a paused movie is placed exactly, and a seek lands
 *  where it was asked up to rounding. */
const MOVIE_AT = 0.01;

/** A beat's ops in order, each batch's ops in its place. */
function beatOps(params: BeatParams): IMessage[] {
  return params.messages.flatMap((message) =>
    BatchElementsMessage.type.isNotification(message as NotificationMessage)
      ? (((message as NotificationMessage).params as { messages?: IMessage[] })
          ?.messages ?? [])
      : [message],
  );
}

/** Whether `msg` only lets a layout that has retired go: the batch the
 *  engine sends once its exit has played (#1820), or one of its ops. */
function retiredOnly(msg: IMessage): boolean {
  if (BatchElementsMessage.type.isNotification(msg as NotificationMessage)) {
    const ops = ((msg as NotificationMessage).params as { messages?: IMessage[] })?.messages ?? [];
    return ops.length > 0 && ops.every(retiredOnly);
  }
  return (msg as { params?: { retired?: boolean } }).params?.retired === true;
}

/** Whether two lists hold the same elements. */
function sameElements(a: HTMLElement[], b: HTMLElement[]): boolean {
  return a.length === b.length && a.every((el) => b.includes(el));
}

/** What a create sets on its node, by which a reused node already showing
 *  it is left untouched. */
function createSignature(params: {
  type: string;
  name?: string;
  content?: unknown;
  style?: unknown;
  attributes?: unknown;
}): string {
  return JSON.stringify([
    params.type,
    params.name ?? null,
    params.content ?? null,
    params.style ?? null,
    params.attributes ?? null,
  ]);
}

/** Every src the image writes of the beat waiting on `overlay` will paint
 *  once it commits (#1820). Until then the page shows the old beat, so what
 *  they paint is in no image layer yet, and the asset cache must keep it
 *  resident anyway (`AssetManager.derivedPins`). */
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

/**
 * Apply one engine-sent attribute to a realized element.
 *
 * Form-control `value`/`checked` are live PROPERTIES: the attribute only seeds
 * an initial default on `<input>`, and on `<select>`/`<textarea>` it does not
 * populate the control at all. So set the property instead — that's what makes
 * a one-way reactive update reflect after the user has already interacted, and
 * what makes `<select>.value` select the matching option.
 *
 * `value` is never clobbered while the control is focused, to preserve the
 * caret position / open dropdown.
 *
 * Shared by the create and update paths so a control is populated identically
 * however it got there.
 */
function applyAttribute(element: Element, k: string, v: string | null): void {
  // Matched by TAG NAME rather than `instanceof`: the element may come from a
  // different realm than this module's globals (an iframe, or a test's own
  // jsdom), in which case `instanceof HTMLTextAreaElement` is silently false and
  // the value would be written as an inert attribute.
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
    // Never leave an element without an id: the reconcile addresses nodes by
    // one, and `getElement`'s DOM fallback resolves through it. Clearing an
    // authored `#id` reverts to the structural id rather than removing.
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

/**
 * Apply a batch of attributes so that `value` and `checked` land LAST.
 *
 * Both are written to the live DOM property, and the browser sanitizes `value`
 * against the element's CURRENT `min`/`max`. Authored order therefore decided
 * the outcome: `slider #value={150} #min=0 #max=200` clamped to 100 (the
 * default max at the moment `value` was written) while the same three props
 * written `#min` `#max` `#value` kept 150 — with byte-identical `outerHTML`
 * either way, which is what made it invisible.
 *
 * `mountDropdown` already sequences `<option>`s before the `<select>`'s value
 * for the same reason; this is that rule generalized to the renderer.
 */
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

  /** Observed DOM listeners, keyed id → event → listener. Keyed by event (not
   *  just id) so an element observing two events doesn't lose one, and so
   *  re-observing on reconcile can remove the prior listener for that exact event
   *  before re-adding (no duplicate handlers on a reused element). */
  protected _listeners: Record<string, Record<string, (event: Event) => void>> =
    {};

  /**
   * id → element cache (spec D13). The reactive runtime addresses elements by id
   * for every create-parent / update / destroy / observe; resolving each through
   * a `querySelector` is O(messages) DOM work. Elements register here on
   * `ui/create` and are dropped (with their subtree) on `ui/destroy`. Ids are
   * deterministic + structural (UIModule.generateId) and stable across renders of
   * the same structure, which is what makes the reconcile below possible.
   */
  protected _elements = new Map<string, HTMLElement>();

  /**
   * Reconcile state: ids present from the PREVIOUS render that haven't yet been
   * re-emitted this pass. A live-preview re-render replays the full create stream;
   * rather than tearing the overlay down and rebuilding it, we reuse existing
   * nodes by id (preserving focus / scroll / decoded backgrounds) and, once the
   * stream settles, sweep whatever wasn't touched. See {@link beginReconcilePass}
   * / {@link sweepReconcile}.
   */
  protected _staleIds = new Set<string>();

  /**
   * The same reconcile state, for WRITTEN IMAGE CONTENT: targets showing image
   * layers from the previous render that haven't been written again this pass.
   *
   * Layers are built here (see {@link writeImage}) rather than shipped as
   * `ui/create` ops, so they carry no structural id and the sweep above cannot
   * see them. They also outlive a beat by design — a backdrop stays up until
   * something replaces it — so nothing else removes them either. Previewing a
   * line therefore used to keep whatever backdrop the last preview had put up,
   * even when the replayed route never set one.
   */
  protected _staleImageTargets = new Set<HTMLElement>();

  /**
   * The same reconcile state, for WRITTEN TEXT (#1813): targets showing text
   * the previous render's writes left that no write has reached this pass.
   *
   * A write adds to what its target holds, and a target with text of its own
   * is not cleared on continue, so the restore a connect sends would add the
   * saved text after what the target already showed. The first write that
   * reaches one of these in a pass a connect opened replaces what writes
   * left on it, and the writes after it in the pass add to it: two targets
   * that name one element both restore onto it. One no write reaches is
   * cleared at the sweep, back to the placeholder text the layout put there,
   * which a write replaces (the maintainer's rule, #1813).
   */
  protected _staleTextTargets = new Set<HTMLElement>();

  /**
   * Per-reconcile-pass insertion cursor: parent → the last child we placed under
   * it this pass. The create stream re-emits a parent's children in document
   * order with `before=null` (append). Anchoring each append AFTER this cursor
   * (rather than at the parent's end) makes re-emitting an unchanged child order
   * a no-op — without it, every non-last child gets moved to the end on each
   * render, churning #e's children (and every structural parent's) and flashing
   * the whole tree even though nothing actually moved.
   */
  protected _placeCursor = new Map<Element, Element>();

  /** Whether a `ui/reconcile-begin` opened the pass a sweep closes. */
  protected _passBegun = false;

  /** What the beat being applied decided for the write now handled
   *  (`planBeat`); unset outside a beat, where a write dedupes itself. */
  protected _decision?: WriteDecision;

  override async onInit() {
    await super.onInit();
    // The morphs ask the game this manager hears for an artifact they let go.
    const morphs = this.morphs;
    if (morphs) {
      morphs.askGame = (key) => this.app.emit(MorphNeedMessage.type.notification({ key }));
    }
    // A fresh UIManager built for a re-render inherits the prior render's overlay
    // DOM (onDispose preserves it). Adopt those nodes as reconcile candidates so
    // the incoming create stream reuses them instead of duplicating.
    this.beginReconcilePass();
    // A cutscene the last render left is not this one's.
    this.endCutscene(true);
  }

  /** Start a reconcile pass: adopt every currently-rendered element as a
   *  reuse-or-sweep candidate. Idempotent; safe to call before each re-render.
   *
   *  A content pass (#657), which a beat-only display opens, adopts only the
   *  written content: the text and pictures writes left are candidates to
   *  replace or clear, by the same rules as in a full pass, and the elements
   *  and the insertion cursors stand, since the stream re-emits none of
   *  them. */
  beginReconcilePass(content = false) {
    this._staleIds.clear();
    this._staleImageTargets.clear();
    this._staleTextTargets.clear();
    if (!content) {
      this._placeCursor.clear();
    }
    // A target this pass empties and writes again keeps its morphs' phase.
    this.morphs?.beginPass();
    const overlay = this.app.overlay;
    if (overlay) {
      // Scanned by STRUCTURAL id (`__sdId`), not `[id]`: an authored `#id`
      // owns the DOM attribute, and adopting that value would mark an id the
      // create stream never re-emits — the sweep would then delete a live
      // element. Elements this manager did not create carry no `__sdId` and
      // are correctly left alone.
      overlay.querySelectorAll("*").forEach((node) => {
        const el = node as HTMLElement;
        const structural = (el as any).__sdId;
        if (structural) {
          if (!content) {
            this._staleIds.add(structural);
          }
          this._elements.set(structural, el);
        }
        // Written image content is keyed by the target node rather than by an
        // id — a target carrying a write signature is showing layers from the
        // previous render until this pass writes it again.
        if ((el as any).__sdImg !== undefined) {
          this._staleImageTargets.add(el);
        }
        // Likewise a target carrying a text write signature.
        if ((el as any).__sdTxt !== undefined) {
          this._staleTextTargets.add(el);
        }
      });
    }
  }

  /** End a reconcile pass: remove elements that survived from the previous render
   *  but weren't re-emitted (touched) this pass — the mark-and-sweep tail. */
  sweepReconcile() {
    for (const id of this._staleIds) {
      // A destroy, as `touchesOf` has it.
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

  /** Drop the text a target's writes left, as a `ui/write-text` carrying no
   *  instructions does: the spans the writes built in its `text` and
   *  `stroke` content elements go, and what the layout put there (an element
   *  it made, which carries a structural id, or its own text) stays, as the
   *  placeholder a page opened at this point shows. With `all`, the layout's
   *  text goes too: a write replaces it (#1813). The write signature goes
   *  with them, so the next write is not mistaken for one already shown. */
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

  /** Remove the spans writes built in a `text` or `stroke` content element.
   *  A write only ever adds elements of its own, which carry no structural
   *  id; the layout's elements and text stay. */
  protected removeWritten(leaf: HTMLElement) {
    for (const child of Array.from(leaf.children)) {
      if (!(child as any).__sdId) {
        child.remove();
      }
    }
  }

  /** Drop the image layers a target is still showing, exactly as the engine's
   *  own clear does (a `ui/write-image` carrying no instructions empties the
   *  content elements). The write signature goes with them, so a later write of
   *  the same image is not mistaken for one already on screen. */
  protected clearImageLayers(el: HTMLElement) {
    for (const tag of ["image", "mask"]) {
      for (const contentEl of this.getContentElements(el, tag)) {
        this.releaseMovies(contentEl);
        this.morphs?.releaseWithin(contentEl);
        contentEl.replaceChildren();
      }
    }
    delete (el as any).__sdImg;
  }

  /** Remove every DOM listener tracked for `id` (used on destroy/sweep, and
   *  before re-observing a reused element). */
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

  /** Remove an element (and its subtree) from the DOM + id cache + listener map. */
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
      el.remove();
    }
    this._staleIds.delete(id);
  }

  /** The overlay's live portrait morphs, which outlive this manager with its DOM. */
  get morphs(): MorphPlayback | undefined {
    const overlay = this.app.overlay;
    return overlay ? MorphPlayback.for(overlay) : undefined;
  }

  // PLAY's application clock drives the morphs once it starts; a preview,
  // which never starts, leaves them on the playback's own frames.
  override onStart() {
    const morphs = this.morphs;
    morphs?.attachClock(this);
    morphs?.setSession(`play:${++playSessions}`);
    this._morphClockSeen = undefined;
  }

  /** The clock's elapsed time at the last update the morphs were moved by. */
  protected _morphClockSeen?: number;

  // Moved by the clock's elapsed time rather than its last frame's delta:
  // `Application.skip` steps the morphs itself (`onSkip`) and then updates
  // with the delta of the frame before, which elapsed time does not repeat.
  override onUpdate(time: Clock) {
    const elapsed = time.elapsedTime;
    const seen = this._morphClockSeen;
    this._morphClockSeen = elapsed;
    if (seen !== undefined && elapsed > seen) {
      this.morphs?.advance(elapsed - seen);
    }
    this.settleMovies();
  }

  override onSkip(seconds: number) {
    this.morphs?.step(seconds);
    this.skipMovies(seconds);
  }

  override onPause() {
    this.morphs?.setPaused(true);
    this.pauseMovies();
  }

  override onUnpause() {
    this.morphs?.setPaused(false);
    this.resumeMovies();
  }

  override onDispose() {
    // Clean up listeners off the nodes but DO NOT remove the overlay DOM: the
    // next render's UIManager adopts it (beginReconcilePass) and reconciles, so a
    // live-preview edit reuses unchanged nodes instead of a full teardown.
    for (const id of Object.keys(this._listeners)) {
      this.removeListeners(id);
    }
    this._listeners = {};
    this._elements.clear();
    // The run is over (STOP, or the rebuild a new run makes): its movies stop
    // where they are. The next display replaces or sweeps their layers.
    this._disposed = true;
    this._unsettledMovies.clear();
    // A cutscene is the run's own, and goes with it.
    this.endCutscene(true);
    for (const video of this.movies()) {
      video.pause();
      delete (video as any).__sdMovie;
      delete (video as any).__sdManager;
      delete (video as any).__sdSeek;
    }
    // The morphs on the screen this leaves go on, on their own frames, until
    // the next display replaces them; a pause was this run's.
    const morphs = this.morphs;
    morphs?.detachClock(this);
    morphs?.setPaused(false);
    // A played beat still waiting for its commit belonged to the run being
    // torn down (STOP, or the rebuild a new run makes): it never goes up, and
    // the screen stays as it is until the next display (#1820). The engine
    // waits on each animation it carries, so each is answered with an error.
    const overlay = this.app.overlay as OverlayWithBeat | undefined;
    const pending = overlay?.__sdBeat;
    if (overlay && pending?.owner === this) {
      overlay.__sdBeat = undefined;
      clearTimeout(pending.timer);
      for (const op of pending.ops) {
        if (AnimateElementsMessage.type.isRequest(op as RequestMessage)) {
          this.app.answer(
            op as RequestMessage,
            Promise.reject(new Error("the beat was called off")),
          );
        }
      }
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
    // Resolved by STRUCTURAL id. A `#${id}` selector would match an authored
    // `#id` that happens to collide with a structural one, and would miss the
    // element whose own `#id` replaced its structural value in the DOM.
    // `_elements` is repopulated for the whole overlay at the start of every
    // reconcile pass, so this walk is a cache-miss fallback, not the hot path.
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

  /**
   * A beat the engine composed (#1820): everything a display or a played
   * beat changes on the screen, in the order the engine sent it. The
   * maintainer's rule: the old beat stays fully visible until the instant
   * the new beat's text starts revealing, and at that same instant the
   * targets the new beat does not write are emptied and the written ones
   * replaced. A beat shown at once goes up as it arrives; a played beat
   * waits for that instant.
   */
  protected receiveBeat(params: BeatParams) {
    this.flushPendingBeat();
    const overlay = this.app.overlay as OverlayWithBeat | undefined;
    const ops = beatOps(params);
    const plan = this.planBeat(ops);
    const wait = this.waitToCommit(params, ops, plan);
    if (!overlay || wait <= 0) {
      this.applyBeat(params, ops, plan);
      return;
    }
    const at = Number(overlay.ownerDocument.timeline?.currentTime) + wait;
    const pending: PendingBeat = { params, ops, plan, at, owner: this };
    pending.timer = setTimeout(() => pending.owner.commitWhenDue(pending), wait);
    overlay.__sdBeat = pending;
  }

  /** Put the waiting beat up in the first animation frame whose timeline
   *  has reached its commit instant: the reveals run on that timeline, so
   *  that frame shows the beat's first letter too. */
  protected commitWhenDue(pending: PendingBeat) {
    const overlay = this.app.overlay as OverlayWithBeat | undefined;
    if (overlay?.__sdBeat !== pending) {
      return;
    }
    const doc = overlay.ownerDocument;
    const view = doc.defaultView;
    if (
      view?.requestAnimationFrame &&
      Number(doc.timeline?.currentTime) < pending.at
    ) {
      view.requestAnimationFrame(() => pending.owner.commitWhenDue(pending));
      return;
    }
    this.flushPendingBeat();
  }

  /** Put up the beat waiting for its commit at once: a screen op sent
   *  after it has arrived, and goes up after it. */
  protected flushPendingBeat() {
    const overlay = this.app.overlay as OverlayWithBeat | undefined;
    const pending = overlay?.__sdBeat;
    if (!overlay || !pending) {
      return;
    }
    overlay.__sdBeat = undefined;
    clearTimeout(pending.timer);
    // As planned when it arrived: nothing but a retired layout's going, which
    // touches no target, reaches the screen while it waits.
    this.applyBeat(pending.params, pending.ops, pending.plan);
  }

  /**
   * How long a played beat waits, in milliseconds, for the instant its text
   * starts revealing: the display time its stamp gives plus the delay of the
   * first letter it reveals. Which writes reveal is the beat's own plan
   * (`planBeat`): a write the plan leaves as the target shows it (an
   * unchanged name) reveals nothing, and one it writes or rebuilds does.
   * Neither do the letters a continuation keeps (`shown`) or a space count.
   * A beat that reveals no text commits at its display time. A display time
   * far from the page's clock (a clock that has not synced) is not waited
   * for.
   */
  protected waitToCommit(
    params: BeatParams,
    ops: IMessage[],
    plan: Map<IMessage, WriteDecision>,
  ): number {
    if (params.time == null) {
      return 0;
    }
    const now = Number(this.app.overlay?.ownerDocument?.timeline?.currentTime);
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
      if (write.instructions.length === 0 || (decision !== "write" && decision !== "rebuild")) {
        continue;
      }
      for (const instruction of write.instructions.slice(write.shown ?? 0)) {
        // A space paints nothing: the beat starts revealing with the first
        // letter that shows.
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

  /** Apply a beat, in this one task: its ops in the order the engine sent
   *  them, each write as the beat's plan decided, then its sweep. */
  protected applyBeat(
    params: BeatParams,
    ops: IMessage[],
    plan: Map<IMessage, WriteDecision>,
  ) {
    for (const op of ops) {
      const decision = plan.get(op);
      if (decision !== "skip") {
        this.applyBeatMessage(op, decision);
      }
    }
    if (params.sweep && this._passBegun) {
      this._passBegun = false;
      this.sweepReconcile();
    }
  }

  /** Apply one of a beat's ops, a write as `decision` says. An animation is
   *  answered once it has played, or failed, as any request the page
   *  receives: the engine waits on that answer (an exit transition's
   *  element is destroyed once it has played out). */
  protected applyBeatMessage(message: IMessage, decision?: WriteDecision) {
    if ("id" in message) {
      const request = message as RequestMessage;
      // Read by the write's handler before it first waits.
      this._decision = decision;
      let done: Promise<unknown>;
      try {
        done = this.onReceiveRequest(request);
      } finally {
        this._decision = undefined;
      }
      if (AnimateElementsMessage.type.isRequest(request)) {
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

  /**
   * The beat's one decision of what each of its text and image writes does
   * (#1820), taken once, as it arrives, in the beat's order. Every op before
   * a write counts, as it will stand when the beat is applied: what the
   * writes before it put in the target, and what the structural ops before
   * it change in the target's subtree, by the one rule the manager applies
   * (`touchesOf`). The apply follows it, the commit instant is read from it,
   * and each write's own dedupe takes it, so none of them can disagree.
   *
   * - A clear and its next write to the same elements: when that write is
   *   exactly what every element holds (all of it, `__sdAll`; for an image,
   *   the picture it shows), written over the subtree as it is (no op in
   *   between has changed it), the clear is skipped and the write is
   *   `same`. Any other write or clear that reaches those elements first,
   *   under another selector, keeps the clear.
   * - A text write with no clear before it is `same` when every element's
   *   last write was this one, over the subtree as it is. When the subtree
   *   has changed since, and it is all the target holds, it is `rebuild`:
   *   emptied and written again. A target that has gathered more than it
   *   (writes with no clear between) keeps it, as the uncomposed page does.
   * - An image write is `same` only when every element shows it, over the
   *   subtree as it is; otherwise it is written, replacing the layers.
   * - A text write to an element that shows no write yet (never written,
   *   or cleared since), or, in a connect's pass, the first to reach an
   *   element that shows what earlier writes left (#1813), is decided as
   *   though a clear of that element came just before it: `same` when it is
   *   all the element holds, else written in place of what it showed. The
   *   layout's own text in a written target is a placeholder the write
   *   replaces (the maintainer's rule).
   * - An element the beat makes, or makes again, is followed as it is made:
   *   empty, with the text and stroke leaves the beat gives it, and its
   *   writes are decided as any other's.
   */
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
    // Nodes the beat removes or replaces: an id of theirs written later is
    // a new element when the beat is applied.
    const gone = new Set<Element>();
    const remove = (node: Element | null | undefined) => {
      if (node) {
        gone.add(node);
        node.querySelectorAll("*").forEach((d) => gone.add(d));
      }
    };
    // Elements the beat makes, by id: each stands for itself in the plan
    // (`key`), under the element it is made in.
    type Made = {
      key: HTMLElement;
      parent?: Made;
      /** The element on the page the made subtree stands under. */
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
    // A change in the subtree of a made element: it and every element above
    // it, made or on the page.
    const bumpMade = (m: Made | undefined, anchor?: Element | null) => {
      let last: Made | undefined;
      for (let n = m; n; n = n.parent) {
        revs.set(n.key, rev(n.key) + 1);
        last = n;
      }
      bump(last ? last.anchor : anchor);
    };
    // A text or stroke leaf made in `m`, or in an element on the page.
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
    // Clears waiting for the write that decides them, with each element's
    // revision and what it held at the clear.
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
    // A connect's pass (#1813): the first text write to reach a target that
    // shows what earlier writes left replaces it, as a clear before it would.
    // A pass opened before the beat has the page's own record of them; one
    // the beat opens, every target written before it.
    let passOpen = this._passBegun;
    let passInBeat = false;
    const passTouched = new Set<HTMLElement>();
    const stale = (el: HTMLElement) =>
      !making.has(el) &&
      (passInBeat ? state(el).txt !== undefined : this._staleTextTargets.has(el));
    for (const op of ops) {
      if (BeginReconcileMessage.type.isNotification(op as NotificationMessage)) {
        // A content pass (#657) re-emits no element, so the insertion
        // cursors stand, as they do on the page.
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
            // In an element the beat makes.
            if (params.element) {
              make(params.element, inMade, inMade.anchor);
            }
            bumpMade(inMade);
            leafMade(params.name, inMade, undefined);
          } else if (!existing || gone.has(existing) || made.has(params.element)) {
            // A new element, or one made again, under its parent.
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
          // An op on an element the beat made: its content changes its own
          // subtree; anything else, its parent's.
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
      const sig = JSON.stringify(p.instructions);
      if (kind === WriteTextMessage.type && els) {
        // An element that shows no write yet shows the layout's placeholder,
        // which the write replaces, as one that shows the previous render's.
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
          // Decided as a clear of those elements just before this write.
          waiting.push({
            clears: [],
            kind,
            target: p.target,
            els: replaced,
            at: new Map(replaced.map((el) => [el, { rev: rev(el), held: { ...state(el) } }])),
          });
        }
      }
      // The clears this op settles: those that reach its elements.
      for (const w of [...waiting]) {
        if (w.kind !== kind || !els || !w.els.some((el) => els.includes(el))) {
          continue;
        }
        const same = w.target === p.target && sameElements(w.els, els);
        if (same && p.instructions.length === 0) {
          // A second clear of the same target: decided with the first.
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
    // A clear no write undoes empties its target.
    for (const w of waiting) {
      applyClear(w);
    }
    return plan;
  }

  /** The elements a write goes to: those a composed write names, by their
   *  structural ids, as its target resolved where the write stands in the
   *  beat (#1820); the target as it resolves now otherwise. */
  protected writeTargets(target: string, elements?: string[]): HTMLElement[] {
    if (!elements) {
      return this.findTargetElements(target);
    }
    return elements
      .map((id) => this._elements.get(id) ?? this.getElement(id))
      .filter((el): el is HTMLElement => el != null && el !== this.app.overlay);
  }

  /**
   * The nodes whose subtree a structural op changes (#1820), judged against
   * the page as it stands before the op. Every node at or above one of them
   * holds something its writes did not put there, so its text and image
   * signatures (`__sdTxt` with `__sdAll`, `__sdImg`) are older than its
   * subtree. One rule for every op the manager applies:
   *
   * - a node created, destroyed, moved or put elsewhere by a create (a leaf
   *   replaced is one destroyed and one created): its parent, old and new;
   * - a node whose own content is replaced: the node;
   * - a node whose style, class or attributes change: its parent. A target's
   *   own box (the engine's display toggles) is not what it holds.
   *
   * `cursor` is where creates under each parent have reached, for an op not
   * applied yet (`planBeat`).
   */
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
      if ((existing as any).__sdCreate !== createSignature(params)) {
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

  /** Mark every node from each of `nodes` up as holding something new: a
   *  signature written before this no longer stands for what it holds. */
  protected touch(nodes: (Element | null | undefined)[]) {
    const overlay = this.app.overlay;
    for (const node of nodes) {
      for (let n = node; n && n !== overlay; n = n.parentElement) {
        (n as any).__sdRev = ((n as any).__sdRev ?? 0) + 1;
      }
    }
  }

  override async onReceiveRequest(msg: RequestMessage) {
    // What a composed beat decided for this write, read before the first
    // wait.
    const decision = this._decision;
    this.endPreviewCutscene(msg);
    // A screen op that arrives after a beat waiting for its commit goes up
    // after it. Messages for the page's other managers (assets, audio, the
    // game's reports) reach this one too, and leave the beat waiting, as
    // does the going of a layout that has retired.
    if (msg.method.startsWith("ui/") && !retiredOnly(msg)) {
      this.flushPendingBeat();
      // A style or class the op changes can move the image a live morph
      // stands in for without resizing its span.
      this.morphs?.requestRelayout();
    }
    // What the op changes leaves the signatures written above it older than
    // their subtree (#1820), whichever handler below applies it.
    this.touch(this.touchesOf(msg));
    if (SetThemeMessage.type.isRequest(msg)) {
      const params = msg.params;
      this._breakpoints = params.breakpoints;
      // `rem` resolves against the DOCUMENT root, which sits above the
      // `spark-web-player #game` scope every engine-emitted rule is confined
      // to — so this is the one ui value that cannot be expressed as a style.
      // Only written when the game actually asks for it: a game embedded in a
      // host page must not silently restyle that page's root.
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
      // Reconcile: a live-preview re-render replays the full create stream. Reuse
      // an existing node with this id when its tag still matches — preserving its
      // identity (focus / scroll / already-decoded backgrounds / running
      // animations) — instead of building a duplicate. A tag change can't be
      // morphed in place, so drop the old subtree and recreate.
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
        // The STRUCTURAL id — the reconcile key — is stamped as a JS property,
        // never read back out of the DOM. An authored `#id` legitimately owns
        // `el.id`, and while the reconcile keyed off `el.id` that was fatal:
        // the next pass's DOM scan adopted the AUTHORED id as stale while the
        // create stream only ever marks the structural one, so the sweep
        // deleted a live element and `input #id="name_field"` vanished on the
        // first live-preview edit after it appeared.
        //
        // A JS property is the right home: the node object outlives the
        // UIManager (onDispose keeps the overlay for the next manager to adopt)
        // and stamping it costs no DOM mutation and no attribute noise.
        (el as any).__sdId = id;
        // Only write the id attribute when it actually differs (a fresh or
        // tag-swapped node). Re-assigning the same id to a REUSED node still
        // fires a mutation — which flashes the whole subtree in devtools and
        // reads as a rebuild even though the node was reused in place.
        const domId = params.attributes?.["id"] ?? id;
        if (el.id !== domId) {
          el.id = domId;
        }
        this._elements.set(id, el);
        this._staleIds.delete(id);
      }
      const sig = createSignature(params);
      // Apply class/content/style/attrs only when this is a fresh node or its
      // create-params actually changed — an unchanged reused node is left
      // untouched (no restyle / recalc / devtools flash). The signature lives ON
      // the node (`__sdCreate`), not in a per-manager map, because buildApp makes
      // a NEW UIManager every edit while the DOM node is preserved.
      const changed = !reused || (el as any).__sdCreate !== sig;
      if (changed) {
        // Full-replace className so a reused node matches the new render exactly.
        el.className = params.name || "";
        if (params.content) {
          // The content replaces whatever the node holds, image layers too.
          this.morphs?.releaseWithin(el);
          el.textContent = getElementContent(params.content, {
            breakpoints: params.breakpoints,
            scope: "spark-web-player #game",
          });
        }
        if (params.style) {
          el.style.cssText = Object.entries(params.style)
            .flatMap(([k, v]) => {
              const arr = [];
              if (v != null) {
                const [prop, value] = getCSSPropertyKeyValue(k, v);
                const cssEntries = getCssEquivalent(prop, value);
                for (const [k, v] of cssEntries) {
                  arr.push(`${k}:${v}`);
                }
              }
              return arr;
            })
            .join(";");
        } else if (reused) {
          // Reused node may carry stale inline style from the prior render; the
          // create carries the element's full static style, so an absent `style`
          // means "no static style" — clear it. (Dynamic display/etc. toggles are
          // re-applied by the same pass's ui/update messages.)
          el.style.cssText = "";
        }
        // No `v != null` guard here: `applyAttribute` REMOVES on null, and on a
        // REUSED node that is the only path that can clear an attribute. With
        // the guard, editing `#disabled=true` to `#disabled=false` left
        // `disabled=""` on the node and the control stayed permanently
        // unclickable in the live preview. On a fresh node the null branch is a
        // harmless no-op.
        //
        // The names this create wrote are recorded on the node so the NEXT
        // create can clear any that have since disappeared: when the last
        // attribute is deleted from the source, `params.attributes` is absent
        // ENTIRELY, so a pass driven only by its contents can never notice.
        // Deliberately not the update path's blanket `removeAttribute` sweep —
        // that would strip `id`, which the reconcile addresses elements by.
        {
          const written = params.attributes ? Object.keys(params.attributes) : [];
          // Clear the stale attributes BEFORE applying the new set:
          // `applyAttributes` defers `value`/`checked` to last precisely so
          // they sanitize against the element's FINAL `min`/`max`/`type`.
          // Removing a constraint attribute after that deferred write would
          // let a UA re-run value sanitization against the new constraints
          // and clamp a value that was already correct.
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
        // Font faces are not created here: the asset cache adds each
        // layout's faces to `document.fonts` before the layout mounts, and
        // removes them when nothing needs them any more.
        (el as any).__sdCreate = sig;
      } else if ((el as any).__sdUpdatedContent && params.content) {
        // An update replaced the content this unchanged create carries; only
        // the content goes back. Style and attributes stay as the updates
        // left them, which is what a beat-only display of the same state
        // shows.
        this.morphs?.releaseWithin(el);
        el.textContent = getElementContent(params.content, {
          breakpoints: params.breakpoints,
          scope: "spark-web-player #game",
        });
      }
      if (params.content) {
        delete (el as any).__sdUpdatedContent;
      }
      const parent = this.getElement(params.parent);
      if (parent) {
        // Only (re)insert when the position actually changed — a no-op move
        // still registers as a DOM mutation (and flashes in devtools), so a
        // re-render that keeps the order must touch nothing.
        if (params.before) {
          // Explicit positional anchor (a reactive control-flow slot): el goes
          // immediately before the named sibling.
          const before = this.getElement(params.before);
          if (el.parentElement !== parent || el.nextElementSibling !== before) {
            parent.insertBefore(el, before ?? null);
          }
        } else {
          // Append in CREATE-ORDER: place right after the previous child placed
          // under this parent THIS pass (not at the parent's end), so a child
          // that's already correctly ordered isn't pointlessly moved.
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
        // Insert before the reference sibling (or append when null) — keyed
        // `for` reconciliation relocating a retained item's subtree.
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
        if (params.content != undefined) {
          this.morphs?.releaseWithin(element);
          // The node no longer holds the content its last create carried, so
          // the next create of it writes that content back even when its
          // signature is unchanged (#1223).
          (element as any).__sdUpdatedContent = true;
          element.textContent = getElementContent(params.content, {
            breakpoints: params.breakpoints,
            scope: "spark-web-player #game",
          });
        }
        if (params.attributes != undefined) {
          if (params.attributes) {
            applyAttributes(element, params.attributes);
          } else {
            Array.from(element.attributes).forEach((attr) =>
              element.removeAttribute(attr.name),
            );
          }
        }
        if (params.style != undefined) {
          if (params.style) {
            Object.entries(params.style).forEach(([k, v]) => {
              const [prop, value] = getCSSPropertyKeyValue(k, v);
              if (v == null) {
                // Removal asks which declaration NAMES the prop expands to,
                // never `getCssEquivalent` — that answers "what does this prop
                // SET", needs a value, and runs it through a transformer. A
                // cleared prop's value is `""`, which transforms to nothing, so
                // the expansion came back empty, there was no name to remove,
                // and the old declaration stayed painted on the element while
                // the runtime believed it had cleared it.
                for (const cssProp of getCssPropertyNames(prop)) {
                  if (element) {
                    element.style.removeProperty(cssProp);
                  }
                }
              } else {
                const cssEntries = getCssEquivalent(prop, value);
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
      );
      return WriteImageMessage.type.result(params.target);
    }
    if (AnimateElementsMessage.type.isRequest(msg)) {
      const params = msg.params;
      const player = new AnimationPlayer();
      const validEffects: number[] = [];
      for (let i = 0; i < params.effects.length; i += 1) {
        const effect = params.effects[i];
        if (effect) {
          const element = this.getElement(effect.element);
          const animations = effect.animations;
          if (element) {
            player.add({ element, animations });
            validEffects.push(i);
          }
        }
      }
      await player.play();
      return AnimateElementsMessage.type.result(validEffects);
    }
    if (PlayCutsceneMessage.type.isRequest(msg)) {
      await this.playCutscene(msg.params, (msg as StreamMessage).epoch);
      return PlayCutsceneMessage.type.result(null);
    }
    return undefined;
  }

  // `ui/observe` + `ui/unobserve` are NOTIFICATIONS (the consumer attaches /
  // detaches a DOM listener and never replies; fired events come back via the
  // separate `event` notification). Handling them as requests leaked a resolve
  // callback per call in the connection — and reactive keyed-`for` reconcile
  // observes/unobserves on every mount.
  override onReceiveNotification(msg: NotificationMessage) {
    this.endPreviewCutscene(msg);
    if (MorphArtifactMessage.type.isNotification(msg)) {
      this.morphs?.deliver(msg.params);
      return;
    }
    if (BeatMessage.type.isNotification(msg)) {
      this.receiveBeat(msg.params);
      this.morphs?.requestRelayout();
      return;
    }
    // Ahead of the screen ops below: it changes nothing a beat or a layout
    // shows.
    if (SkipCutsceneMessage.type.isNotification(msg)) {
      this.endCutscene();
      return;
    }
    if (msg.method.startsWith("ui/")) {
      this.morphs?.requestRelayout();
    }
    // A screen op that arrives after a beat waiting for its commit goes up
    // after it. Messages for the page's other managers (assets, audio, the
    // game's reports) reach this one too, and leave the beat waiting, as
    // does the going of a layout that has retired (#1820): it is no part of
    // any beat.
    if (msg.method.startsWith("ui/") && !retiredOnly(msg)) {
      this.flushPendingBeat();
    }
    // The game opens a pass at every connect and closes it once the stream
    // has written everything it shows.
    if (BeginReconcileMessage.type.isNotification(msg)) {
      this.beginReconcilePass(msg.params?.content === true);
      this._passBegun = true;
      return;
    }
    if (SweepReconcileMessage.type.isNotification(msg)) {
      // Only a pass a begin opened here is swept. A preview that repeats one
      // taken over before its sweep sweeps for it (#1820); a manager built
      // since adopted the whole overlay as stale and saw no begin, so a sweep
      // there would remove the screen it is showing.
      if (this._passBegun) {
        this._passBegun = false;
        this.sweepReconcile();
      }
      return;
    }
    // A `ui/batch` coalesces a synchronous run of fire-and-forget ops. Dispatch
    // each inner message IN ORDER through the normal per-op handling: requests
    // (create/update/destroy/move/set-theme — all synchronous handlers, so their
    // returned promise is unused) via onReceiveRequest, and notifications
    // (observe/unobserve) recursively via onReceiveNotification.
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
        // Idempotent: drop any prior listener for this exact event first, so
        // re-observing a reused element on reconcile doesn't stack duplicate
        // handlers (which would fire the engine event N times per click).
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

  /**
   * Resolve a `target` selector (a className plus optional `#index`) to the
   * matching structural element(s) in the live DOM.
   *
   * Mirrors the engine's `UIModule.findElements`: it takes the elements whose
   * className is the requested name, or, when there are none, every element
   * whose className includes all of its classes, then (when an `#index`
   * instance suffix is present) narrows to that single occurrence. The page
   * cannot tell a layout's declared target from an author's element with the
   * same classes, so a write the engine resolved by class names its elements
   * and never reaches this.
   * The engine owns the `Element` tree and only forwards the original `target`
   * string, so the consumer re-resolves it here against the real DOM. (D13 may
   * later replace this with a consumer-side id→element map.)
   */
  protected findTargetElements(target: string): HTMLElement[] {
    const overlay = this.app.overlay;
    if (!overlay) {
      return [];
    }
    const [name, instance] = target.split("#");
    if (!name) {
      return [];
    }
    // The engine matches on *all* class tokens of a space-separated selector.
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

  /** Direct children of `parent` whose className includes `tag`. */
  protected getContentElements(parent: HTMLElement, tag: string): HTMLElement[] {
    return Array.from(parent.children).filter((c) =>
      c.className.split(" ").includes(tag),
    ) as HTMLElement[];
  }

  /** Apply an engine style map to a DOM element, matching the create/update path. */
  protected applyStyle(
    el: HTMLElement,
    style: Record<string, string | number | null>,
  ) {
    for (const [k, v] of Object.entries(style)) {
      const [prop, value] = getCSSPropertyKeyValue(k, v);
      const cssEntries = getCssEquivalent(prop, value);
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

  /**
   * [D14] Port of the engine's `UIModule.Text.process`, run against the real
   * DOM. Decomposes a `TextInstruction[]` into `text_line`/`text_word`/
   * `text_space`/`text_letter` spans (handling whitespace collapsing and
   * text-align line wrapping) under `contentEl`, and collects each new letter
   * span with its per-char `show` reveal animation so the caller can play them
   * all in one batch.
   */
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
        lineWrapperEl = createEl(
          contentEl,
          "div",
          "text_line",
          alignStyle,
          undefined,
        );
      } else if (wasNewline === undefined || isNewline !== wasNewline) {
        // Surround each line in a text_line div
        lineWrapperEl = createEl(
          contentEl,
          "div",
          "text_line",
          undefined,
          undefined,
        );
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
        // this is the start of a new word chunk so create a text_word span
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
      // Append text to wordWrapper, blockWrapper, or content
      const textParentEl = wordWrapperEl || lineWrapperEl || contentEl;
      const newSpanEl = createEl(
        textParentEl,
        "span",
        "text_letter",
        style,
        text === "\n" ? "" : text, // text_line div already handles breaking up lines
      );
      // The first `shown` letters are already on the page (a box carried on
      // after a click), so they appear at once, before the beat's start.
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

  /**
   * When a beat stamped `time` on the shared clock shows, on the document
   * timeline: once its sound, which the audio context starts at `time`, has
   * reached the speakers. The latency is the audio clock reading's, which the
   * game also counts the beat's duration from.
   */
  protected getDisplayTime(time: number | undefined): number | undefined {
    if (time == null) {
      return undefined;
    }
    return (
      this.app.audioClock.toDocumentTime(time) +
      this.app.audioClock.reading.outputLatency * 1000
    );
  }

  /**
   * [D14] Realizes a text write on the page: the engine sends one
   * `ui/write-text` carrying the `TextInstruction[]`, and the page builds the
   * target's `text` and `stroke` content from it and drives the reveal.
   *
   * The engine shows the target when it writes it, but a played write to a
   * target whose `text` and `stroke` are empty keeps the target hidden until
   * the first letter's reveal begins: at the beat's start, or later when that
   * letter waits (a choice while the caption above it types). The target's own
   * box and border do not show empty in the meantime. An instant write shows
   * everything at once, including when it repeats the last write. A played
   * write's first `shown` letters are text already on the page (a box carried
   * on after a click), so they appear at once and the target does not wait.
   */
  protected async writeText(
    target: string,
    instructions: TextInstruction[],
    instant: boolean,
    startTime?: number,
    shown = 0,
    elements?: string[],
    decision?: WriteDecision,
  ) {
    const targetEls = this.writeTargets(target, elements);
    // The first write in a connect's pass to reach a target showing what the
    // previous render's writes left replaces it (#1813).
    const stale = this._passBegun
      ? targetEls.filter((el) => this._staleTextTargets.has(el))
      : [];
    for (const el of targetEls) {
      this._staleTextTargets.delete(el);
    }
    // Reconcile dedup: a write APPENDS spans, so replaying an unchanged write
    // onto a reused target would both re-reveal and DUPLICATE its text. If every
    // target already shows exactly this write, leave it untouched; a target
    // the write replaces, only when this write is all it holds, over the
    // subtree as it is. Stored on the node so it survives the per-edit
    // UIManager swap. In a composed beat the beat's plan has decided it
    // (#1820), by the same rule.
    const sig = JSON.stringify(instructions);
    // Never written, or cleared since: whatever it shows is the layout's.
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
    if (
      decision === "same" ||
      (decision == null && targetEls.length > 0 && targetEls.every(holds))
    ) {
      if (instant) {
        // The same write shown at once, as when a beat shown in full repeats
        // its writes onto a target nothing cleared: what the first one left
        // to reveal shows now.
        for (const el of targetEls) {
          this.revealAtOnce(el);
        }
      }
      return;
    }
    for (const el of targetEls) {
      if (
        instructions.length > 0 &&
        (decision === "rebuild" || stale.includes(el) || holdsNoWrite(el))
      ) {
        // Written again from empty: the subtree changed under what it showed,
        // what it showed is the previous render's, or it shows no write yet,
        // only the layout's placeholder, which a write replaces (#1813).
        this.clearWrittenText(el, true);
      }
      (el as any).__sdTxt = sig;
      // The subtree it was written over (#1820), as `__sdAllRev`.
      (el as any).__sdTxtRev = (el as any).__sdRev ?? 0;
    }
    const enter: {
      element: HTMLElement;
      animation: ReturnType<typeof getRevealAnimation>;
    }[] = [];
    const enterNow: typeof enter = [];
    const atOnce = !instant && shown > 0;
    // Seconds from the write's start until its first letter's reveal begins.
    const wait = instructions.reduce(
      (min, e) => Math.min(min, e.after ?? 0),
      Infinity,
    );
    const waiting: HTMLElement[] = [];
    for (const targetEl of targetEls) {
      const textEls = this.getContentElements(targetEl, "text");
      const strokeEls = this.getContentElements(targetEl, "stroke");
      const contentEls = [...textEls, ...strokeEls];
      // With no text on it yet, the target would show as an empty box until
      // its first letter appears.
      const empty =
        contentEls.length > 0 && contentEls.every((el) => !el.hasChildNodes());
      if (instant) {
        this.revealAtOnce(targetEl);
      } else if (instructions.length === 0 || empty) {
        // A played write to an empty target waits for its own first letter,
        // so the wait the last write left ends here. A played write adding to
        // text that is still waiting keeps that wait, which ends as the
        // earlier text starts to appear. Stored on the node, like `__sdTxt`.
        (targetEl as any).__sdWait?.cancel();
        delete (targetEl as any).__sdWait;
      }
      if (!instant && !atOnce && instructions.length > 0 && empty) {
        waiting.push(targetEl);
      }
      if (instructions.length > 0) {
        // Build text + stroke (the faux-outline duplicate) from the same
        // instructions, mirroring the engine's dual process() over both.
        // NOTE: a write APPENDS spans (matching the engine's old process(),
        // which never cleared first). Re-writes to the same non-transient
        // target accumulate; transient targets are emptied via the clear path
        // (empty instructions) before each new beat.
        for (const textEl of textEls) {
          this.processText(textEl, instructions, instant, enter, shown, enterNow);
        }
        for (const strokeEl of strokeEls) {
          this.processText(strokeEl, instructions, instant, enter, shown, enterNow);
        }
        // Everything the target holds, for a composed beat's dedupe of a
        // clear (#1820): `__sdTxt` records only the last write, and writes
        // to a target that was not cleared accumulate. Known from the subtree
        // it was first written over (`__sdAllRev`), which an op that changes
        // that subtree leaves behind (`touch`).
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
        // Clear text + stroke (the `null`-sequence / clear path): what writes
        // left. A placeholder the connect has put back stays until a write
        // replaces it (#1813).
        for (const contentEl of contentEls) {
          this.removeWritten(contentEl);
        }
        (targetEl as any).__sdAll = [];
        (targetEl as any).__sdAllRev = (targetEl as any).__sdRev ?? 0;
      }
    }
    // The letters already on the page appear now, not at the beat's start.
    const shownNow = new AnimationPlayer();
    for (const { element, animation } of enterNow) {
      (element as any).__sdReveal = shownNow.add({
        element,
        animations: [animation],
      })[0];
    }
    const showing = enterNow.length > 0 ? shownNow.play() : undefined;
    if (enter.length > 0 || waiting.length > 0) {
      const player = new AnimationPlayer();
      for (const { element, animation } of enter) {
        (element as any).__sdReveal = player.add({
          element,
          animations: [animation],
        })[0];
      }
      // On the letters' timeline, so the target appears as the first letter
      // does, however late the write is handled.
      for (const element of waiting) {
        (element as any).__sdWait = player.add({
          element,
          animations: [getHiddenUntilAnimation(wait)],
        })[0];
      }
      await player.play(startTime);
    }
    await showing;
  }

  /**
   * Shows at once everything a target's writes have left to reveal: the
   * target's wait ends and each of its letters finishes its reveal. A letter
   * keeps its reveal on its node (`__sdReveal`), as the target keeps its wait.
   */
  protected revealAtOnce(targetEl: HTMLElement) {
    (targetEl as any).__sdWait?.cancel();
    delete (targetEl as any).__sdWait;
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

  /**
   * [D15] Consumer-side realization of an image write. Replaces the engine's
   * per-layer `ui/create` (the `instance` span + child `img`) + the crossfade
   * `ui/animate` (in/out) + the prior-layer `ui/destroy`: the engine now sends a
   * single `ui/write-image` carrying a fully-resolved `WriteImageInstruction[]`
   * (background/mask CSS, src, `Animation` objects), and the consumer builds the
   * DOM + drives the enter → exit → destroy lifecycle here.
   *
   * Lifecycle (mirrors the old `UIModule.Image.applyChanges`):
   *   1. build every new `instance` span; collect the target-wrapper reveal,
   *      the new-layer enter/exit animations, the transition "affected"
   *      animations, and the previous layers to fade out + destroy;
   *   2. play the target-wrapper animations;
   *   3. play the enter (+affected) and exit animations in parallel;
   *   4. destroy the faded-out previous layers.
   * Awaiting all of it preserves the engine's `await animateElements()`
   * lifecycle so auto-advance still waits on the reveal.
   */
  protected async writeImage(
    target: string,
    instructions: WriteImageInstruction[],
    startTime?: number,
    elements?: string[],
    decision?: WriteDecision,
  ) {
    const targetEls = this.writeTargets(target, elements);
    // This target has been written this pass, so the sweep must leave its layers
    // alone. Marked BEFORE the dedup below: re-writing the image already on
    // screen is the commonest case on a re-render (restore replays it), and
    // taking the early return without marking would let the sweep clear the very
    // layers that were just confirmed correct.
    for (const el of targetEls) {
      this._staleImageTargets.delete(el);
    }
    // Reconcile dedup: if every target already shows exactly this write, its
    // layers — and their already-DECODED <img>s — are correct, so skip the
    // rebuild + crossfade. This is what stops a live-preview edit from
    // re-decoding an unchanged backdrop (the dominant cost). The signature is
    // stored ON the target node so it survives the per-edit UIManager swap. It
    // stands only for the subtree it was written over (#1820): a layer added
    // since (a mask) is painted by writing again, which replaces the layers.
    // In a composed beat the beat's plan has decided it.
    const sig = JSON.stringify(instructions);
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
      // A movie this write would play that the page holds from the run before
      // (a new run's restore over the overlay it adopted) is not playing:
      // it starts again from its first frame.
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
      // The subtree it was written over (#1820), as `__sdAllRev`.
      (el as any).__sdImgRev = (el as any).__sdRev ?? 0;
    }
    const targetEffects: { element: HTMLElement; animations: Animation[] }[] =
      [];
    const enterEffects: { element: HTMLElement; animations: Animation[] }[] = [];
    const exitEffects: { element: HTMLElement; animations: Animation[] }[] = [];
    const toDestroy: HTMLElement[] = [];
    /** The movies this write builds that play once their layer shows. */
    const newMovies: HTMLVideoElement[] = [];
    /** The movies of the layers this write hides. */
    const hiddenMovies: HTMLVideoElement[] = [];

    const applyStyle = this.applyStyle.bind(this);

    for (const targetEl of targetEls) {
      const imageEls = this.getContentElements(targetEl, "image");
      const maskEls = this.getContentElements(targetEl, "mask");
      if (instructions.length === 0) {
        // Clear path (the engine cleared image + mask content then set
        // display:none on the wrapper, which it still emits via ui/update).
        for (const contentEl of [...imageEls, ...maskEls]) {
          this.releaseMovies(contentEl);
          this.morphs?.releaseWithin(contentEl);
          contentEl.replaceChildren();
        }
        continue;
      }
      // Each content kind: image content fills background_image, mask fills
      // mask_image; the resolved value is identical, only the property differs.
      const contentTargets: { els: HTMLElement[]; property: string }[] = [
        { els: imageEls, property: "background_image" },
        { els: maskEls, property: "mask_image" },
      ];
      for (const instruction of instructions) {
        this.addAnimationEffects(
          targetEffects,
          targetEl,
          instruction.targetAnimations,
        );
        if (instruction.affected) {
          for (const a of instruction.affected) {
            for (const el of this.findTargetElements(a.target)) {
              this.addAnimationEffects(enterEffects, el, a.animations);
            }
          }
        }
        const content = instruction.content;
        if (!content) {
          // A hidden layer's movies stop and let their media go (I-1380).
          if (instruction.control === "hide") {
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
        for (const { els, property } of contentTargets) {
          for (const contentEl of els) {
            // Capture existing layers BEFORE creating the new one (crossfade).
            const prevSpanEls = Array.from(contentEl.children) as HTMLElement[];
            // A movie plays in the image content; a mask cannot be one, so
            // a mask gets the layer's images only.
            const video =
              content.video && property === "background_image"
                ? content.video
                : undefined;
            const newSpanEl = video
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
                  content.src,
                  applyStyle,
                );
            const videoEl = newSpanEl.querySelector("video");
            if (videoEl && video) {
              // The mixer its sound plays through once it plays.
              (videoEl as any).__sdMixer = {
                mixer: video.mixer,
                mixerGain: video.mixerGain,
              };
            }
            if (videoEl && !video?.preview && instruction.control !== "hide") {
              newMovies.push(videoEl);
            }
            // What this layer paints stays resident while it is on screen
            // (`AssetManager.derivedPins`). Kept on the node, which outlives
            // this manager across a re-render. A mask span paints the images
            // and not the movie, which goes with its own span.
            (newSpanEl as any).__sdSrcs =
              content.video && !video
                ? content.srcs.filter((src) => src !== content.video?.src)
                : content.srcs;
            // The morphs on its images: live in an image, the rest render in
            // a mask. A layer built only to fade out holds still.
            if (content.morph && instruction.control !== "hide") {
              this.morphs?.mount(
                newSpanEl,
                content.morph,
                content.background,
                property === "mask_image" ? "mask" : "background",
                `${(targetEl as any).__sdId ?? target}:${property}:${els.indexOf(contentEl)}`,
              );
            }
            if (instruction.control === "show") {
              // 'show' fades out + destroys the previous layers (the crossfade).
              // The engine only ever destroyed spans it had enqueued an exit
              // animation for; the builtin `hide` always resolves, so every
              // previous layer is faded out then destroyed.
              if (content.previousHideAnimation) {
                for (const prevSpanEl of prevSpanEls) {
                  // An outgoing morph holds its frame through the fade.
                  this.morphs?.freezeWithin(prevSpanEl);
                  this.addAnimationEffects(exitEffects, prevSpanEl, [
                    content.previousHideAnimation,
                  ]);
                  if (!toDestroy.includes(prevSpanEl)) {
                    toDestroy.push(prevSpanEl);
                  }
                }
              }
              if (content.enterAnimation) {
                this.addAnimationEffects(enterEffects, newSpanEl, [
                  content.enterAnimation,
                ]);
              }
            } else if (instruction.control === "hide") {
              if (content.exitAnimation) {
                this.addAnimationEffects(exitEffects, newSpanEl, [
                  content.exitAnimation,
                ]);
              }
              // The pre-D15 engine's destroy loop removed every faded exit
              // element; a hide-with-assets builds a transient span that must be
              // destroyed after fading, not left orphaned in the layer.
              if (!toDestroy.includes(newSpanEl)) {
                toDestroy.push(newSpanEl);
              }
            } else if (instruction.control === "animate") {
              if (content.enterAnimation) {
                this.addAnimationEffects(enterEffects, newSpanEl, [
                  content.enterAnimation,
                ]);
              }
            }
          }
        }
      }
    }

    // 1. target-wrapper animations first, from the beat's display time; the
    // content animations then start when they end, on the same timeline, so a
    // late write is as far into its content reveal as into its wrapper.
    if (targetEffects.length > 0) {
      const player = new AnimationPlayer();
      for (const e of targetEffects) {
        player.add(e);
      }
      await player.play(startTime);
      if (startTime != null) {
        startTime += player.endTime;
      }
    }
    // The layer is up: its movies start with its content reveal.
    for (const video of newMovies) {
      this.startMovie(video);
    }
    // 2. enter + exit content animations in parallel
    const playEffects = (
      effects: { element: HTMLElement; animations: Animation[] }[],
    ) => {
      if (effects.length === 0) {
        return Promise.resolve();
      }
      const player = new AnimationPlayer();
      for (const e of effects) {
        player.add(e);
      }
      return player.play(startTime);
    };
    await Promise.all([playEffects(enterEffects), playEffects(exitEffects)]);
    // 3. destroy the faded-out previous layers
    for (const el of toDestroy) {
      this.releaseMovies(el);
      this.morphs?.releaseWithin(el);
      el.remove();
    }
    // A hidden movie's layer goes with it, once the hide has played.
    for (const video of hiddenMovies) {
      const span = video.closest("span.instance");
      this.releaseMovies(video);
      (span ?? video).remove();
    }
  }

  /**
   * Play a `[[play NAME]]` cutscene full screen, above every layout, and
   * settle once it has gone: after its enter transition it plays, and it
   * ends when the video ends (never on its own when it loops), on the
   * player's first click or advance key, or on `ui/skip-cutscene`; then its
   * exit transition plays and it is removed. The click or key that ends it
   * goes no further, so the game does not take it for an advance as well.
   * It pauses, resumes and skips with the game clock, and its sound plays
   * through its mixer, as a layer's movie does.
   *
   * A preview's shows the first frame, never plays, and settles at once; it
   * stays until a newer stream (`epoch`, the next display's) reaches the page
   * (`endPreviewCutscene`). Its own display's beat follows the request in
   * the same stream.
   */
  protected async playCutscene(
    params: PlayCutsceneParams,
    epoch?: number,
  ): Promise<void> {
    const overlay = this.app.overlay as OverlayWithCutscene | undefined;
    if (!overlay || this._disposed) {
      return;
    }
    // One cutscene at a time.
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
    // Settled once it ends, which happens once.
    let ending: (() => void) | undefined;
    const ended = new Promise<void>((resolve) => {
      ending = resolve;
    });
    const end = (immediate = false) => {
      // An immediate end also cuts an exit transition short.
      if (immediate) {
        remove();
      }
      ending?.();
      ending = undefined;
    };
    const skip = (e: Event) => {
      e.stopPropagation();
      end();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) {
        skip(e);
      }
    };
    // Keys reach the game at the window (`Application.bind`), so they are
    // taken there first, in the capture phase.
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
      // It fades in from hidden, as a layout's enter transition does.
      element.style.opacity = "0";
      await new AnimationPlayer([
        { element, animations: [params.enter] },
      ]).play();
      element.style.removeProperty("opacity");
    }
    if (ending) {
      this.startMovie(video);
    }
    await ended;
    if (element.isConnected && params.exit) {
      // It stops on the frame it shows, which the exit transition takes
      // away, and leaves the game clock's movies.
      delete (video as any).__sdMovie;
      video.pause();
      await new AnimationPlayer([
        { element, animations: [params.exit] },
      ]).play();
    }
    remove();
  }

  /** End the cutscene on the page, if there is one: after its exit
   *  transition, or at once with `immediate`. */
  protected endCutscene(immediate = false) {
    const overlay = this.app.overlay as OverlayWithCutscene | undefined;
    overlay?.__sdCutscene?.end(immediate);
  }

  /** Take down a preview's cutscene once `msg` comes from a newer stream
   *  than the one that showed it: the next display has begun. */
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

  /** What a movie loads: the asset cache's object URL for its file when the
   *  file is resident, the file itself otherwise. */
  protected getVideoSrc(fileSrc: string): string {
    const cache = this.app.assets?.cache ?? this.app.assetCache;
    return cache?.getVideoUrl(fileSrc) ?? fileSrc;
  }

  /** The movies this page plays, on screen now: a preview's show their
   *  first frame and are never started. */
  protected movies(): HTMLVideoElement[] {
    const overlay = this.app.overlay;
    if (!overlay) {
      return [];
    }
    return (
      Array.from(overlay.querySelectorAll("video.object")) as HTMLVideoElement[]
    ).filter((video) => (video as any).__sdMovie);
  }

  /** Start a layer's movie in play, or, while the game is paused, once it
   *  resumes. A movie that does not loop stops on its last frame. */
  protected startMovie(video: HTMLVideoElement) {
    // A write still revealing when its run ended (STOP) starts nothing: the
    // overlay it leaves belongs to the next display.
    if (this._disposed || !video.isConnected) {
      return;
    }
    (video as any).__sdMovie = true;
    (video as any).__sdManager = this;
    // A seek asked for before (by a run that has ended) is not this page's.
    delete (video as any).__sdSeek;
    this.anchorMovie(video, video.currentTime);
    if (!(video as any).__sdSettles) {
      (video as any).__sdSettles = true;
      // Each report of where the element stands or can stand settles the
      // movie, by the page playing it.
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
    // While the game is paused it starts when the game resumes.
    if (!this.app.paused) {
      this.playMovie(video);
    }
  }

  protected playMovie(video: HTMLVideoElement) {
    // Its sound plays through its mixer, connected when it first plays and
    // again by each later play, so a context that starts running later
    // still gets it.
    const route = (video as any).__sdMixer as
      | { mixer: string; mixerGain: number }
      | undefined;
    if (route) {
      this.app.audio?.connectMovie?.(video, route.mixer, route.mixerGain);
    }
    const played = video.play();
    // Play mode starts on a gesture, so sound is allowed; a browser that
    // refuses it anyway still shows the movie, without its sound.
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

  /** Stop every movie under `root` (or `root` itself) and let its media
   *  go, before its layer leaves the page. */
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

  /** Whether this manager's run is over (`onDispose`). */
  protected _disposed = false;

  /** The game paused: so does every movie it plays, each anchored where it
   *  stands, which a stalled start, a decode or the browser's own playback
   *  can leave away from the clock, and placed there by the one rule: a loop
   *  paused at the instant it reaches its end stands on its first frame. */
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

  /** The game resumed: so does every movie it plays, but one that plays
   *  once and stands at its end, which holds its last frame; `play()` would
   *  start it again from the beginning. */
  protected resumeMovies() {
    for (const video of this.movies()) {
      if (!this.heldAtEnd(video)) {
        this.playMovie(video);
      }
    }
  }

  /** Whether `video` plays once and stands at its end: it ended, or a skip
   *  sent it there, which its `currentTime` reports at once while `ended`
   *  waits for the seek. */
  protected heldAtEnd(video: HTMLVideoElement): boolean {
    if (video.loop) {
      return false;
    }
    const span = this.movieSpan(video);
    return video.ended || (span !== undefined && video.currentTime >= span);
  }

  /** How long `video` is, when that is known: its duration, or for a file
   *  that reports none, where it ended or where the browser stopped a seek
   *  past its end (`settleMovie`). */
  protected movieSpan(video: HTMLVideoElement): number | undefined {
    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0) {
      return duration;
    }
    const end = (video as any).__sdEnd;
    return typeof end === "number" && end > 0 ? end : undefined;
  }

  /** Where a movie at `time` (seconds, counted without wrapping a loop)
   *  stands: the time its anchor keeps and the `currentTime` its element is
   *  given, decided together so the two cannot disagree. A loop of known
   *  span keeps its time unwrapped and wraps it into the element; any other
   *  movie goes no earlier than its start, and one that plays once no later
   *  than its known end. */
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

  /** Record that `video` stands at `time` (seconds into the movie, counted
   *  without wrapping a loop) at the game clock's current time. */
  protected anchorMovie(video: HTMLVideoElement, time: number) {
    const clock = this.app.clock?.elapsedTime;
    (video as any).__sdAnchor =
      clock != null ? { time, clock } : undefined;
  }

  /** Where the game clock puts `video` now: where it was anchored plus the
   *  game time since, which stops while the game is paused. A seek holds
   *  the element's own position back while it decodes, so that position
   *  falls behind the clock on every skip; without a clock it is all
   *  there is. Kept where the movie can stand (`moviePlace`). */
  protected moviePosition(video: HTMLVideoElement): number {
    return this.moviePlace(video, this.clockTime(video)).anchor;
  }

  /** The anchor plus the game time since, before `moviePlace` keeps it
   *  where the movie can stand. */
  protected clockTime(video: HTMLVideoElement): number {
    const anchor = (video as any).__sdAnchor as
      | { time: number; clock: number }
      | undefined;
    const clock = this.app.clock?.elapsedTime;
    return anchor && clock != null
      ? anchor.time + (clock - anchor.clock)
      : video.currentTime;
  }

  /** The browser reported where `video` can stand: it loaded its metadata,
   *  learned its duration, ended, or settled a seek the page asked for. The
   *  browser decides where an element can stand, so the movie is placed
   *  again by the one rule from where the clock has it, with the span the
   *  browser now reports (`placeMovie`); one that ended is placed at its end.
   *
   *  Between those reports and the clock's own operations (skip, pause,
   *  resume) a playing movie runs on the browser's own playback: a seek the
   *  page did not ask for, a loop's return to its start, is playback and
   *  places nothing.
   *
   *  A seek the page asked for that landed where it asked is that placement
   *  already, and is left as it is: the clock ran on while the seek decoded,
   *  and seeking again would only lose that time again. A seek the browser
   *  stopped short of the request, with no new span to explain it, met the
   *  browser's bound: with no span known, the landing is where the movie
   *  ends; otherwise the movie is anchored where the element landed. */
  protected settleMovie(video: HTMLVideoElement, event: string) {
    if (!(video as any).__sdMovie) {
      return;
    }
    if (event === "ended") {
      // It holds its last frame, and where that is becomes its known end,
      // which a file with no duration tells only by reaching it. Anchored
      // there: the clock puts a movie that has played through at its end,
      // and a reading short of it is one the clock has not caught up with
      // (it moves on animation frames, which a hidden page does not get).
      (video as any).__sdEnd = video.currentTime;
      video.pause();
      this.anchorMovie(video, this.moviePlace(video, video.currentTime).anchor);
      return;
    }
    if (event === "seeked") {
      if (video.seeking) {
        // A later seek is on its way; its own `seeked` settles the movie.
        return;
      }
      const asked = (video as any).__sdSeek as
        { time: number; span: number | undefined } | undefined;
      delete (video as any).__sdSeek;
      if (!asked) {
        return;
      }
      // A playing movie moves on from where it landed before this runs,
      // so only a landing short of the request is the browser's refusal.
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
    // A span can change while the game plays (a skip past an end the browser
    // had not reported, or a file that learns its duration as it plays
    // through), and placing reads the clock. Its reading is current while
    // the game is paused, when it does not move. While the game plays it
    // moves on animation frames, which a hidden page does not get, so the
    // movie is placed on the clock's next frame (`onUpdate`).
    if (this.app.paused) {
      this.placeMovie(video);
    } else {
      this._unsettledMovies.add(video);
    }
  }

  /** Movies whose span the browser reported on while the game played, to be
   *  placed on the clock's next frame. */
  protected _unsettledMovies = new Set<HTMLVideoElement>();

  /** Place the movies the browser reported on since the clock's last frame,
   *  now that its reading is current. */
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

  /** Place `video`'s anchor and element by the one rule where the clock has
   *  it now. A paused element is moved to its place exactly: at a loop's end
   *  it shows the last frame, and at its start the first. A playing one is
   *  moved only when it is out of step, so playback with the clock is not
   *  interrupted by a seek. */
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

  /** How far a playing `video`'s element stands from `time`: around the
   *  loop for a loop of known span, which plays on from its end into its
   *  start. */
  protected movieGap(video: HTMLVideoElement, time: number): number {
    const gap = Math.abs(video.currentTime - time);
    const span = this.movieSpan(video);
    return video.loop && span !== undefined ? Math.min(gap, span - gap) : gap;
  }

  /** Move `video`'s element to `time`, remembering what was asked and the
   *  span known when it was, which its `seeked` is settled against. */
  protected seekMovie(video: HTMLVideoElement, time: number) {
    (video as any).__sdSeek = { time, span: this.movieSpan(video) };
    video.currentTime = time;
  }

  /** The game clock moved `seconds` (back, when negative): so does every
   *  movie, from where the clock puts it, its anchor and its element placed
   *  by the one rule (`moviePlace`). */
  protected skipMovies(seconds: number) {
    for (const video of this.movies()) {
      const place = this.moviePlace(video, this.moviePosition(video) + seconds);
      this.anchorMovie(video, place.anchor);
      this.seekMovie(video, place.element);
    }
  }

  /**
   * [D15] Push animation effects, honoring each Animation's `target` layer
   * selector — the redirection the engine's `enqueueAnimation` used to do. A
   * non-"self" target animates the matching DESCENDANTS of `element` (e.g.
   * align_* target the inner "instance" layer), not `element` itself.
   */
  private addAnimationEffects(
    effects: { element: HTMLElement; animations: Animation[] }[],
    element: HTMLElement,
    animations: Animation[] | undefined,
  ) {
    if (!animations?.length) {
      return;
    }
    for (const animation of animations) {
      for (const el of resolveAnimationTargets(
        element,
        animation.target?.$name,
      )) {
        effects.push({ element: el, animations: [animation] });
      }
    }
  }
}
