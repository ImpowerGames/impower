import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import AnimationPlayer from "../../../../spark-dom/src/classes/AnimationPlayer";
import { createImageElement } from "../../../../spark-dom/src/utils/createImageElement";
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
import { FrameMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/FrameMessage";
import { MoveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/MoveElementMessage";
import { ObserveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/ObserveElementMessage";
import { SetThemeMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/SetThemeMessage";
import { SweepReconcileMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/SweepReconcileMessage";
import { UnobserveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/UnobserveElementMessage";
import { UpdateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/UpdateElementMessage";
import {
  type WriteImageInstruction,
  WriteImageMessage,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { WriteTextMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { getCssPropertyNames } from "../../../../sparkle-style-transformer/src/utils/getCssPropertyNames";
import { Manager } from "../Manager";
import { getEventData } from "../utils/getEventData";

/** A screen message the page holds (`UIManager.hold`), with the answer
 *  owed to it when it is a request answered once applied. */
interface HeldMessage {
  message: RequestMessage | NotificationMessage;
  answer?: (result: unknown) => void;
}

interface HeldScreen {
  pass: boolean;
  frames: number;
  queue: HeldMessage[];
  timer?: ReturnType<typeof setTimeout>;
  /** Waits for the start of the played beat that is held. */
  showTimer?: ReturnType<typeof setTimeout>;
  /** Puts up what is held through the manager now showing the overlay;
   *  `due` once the held beat's start has come. */
  release?: (due?: boolean) => void;
}

/** How long a preview pass may hold the screen before what it holds goes up
 *  anyway: longer than any display waits for its pictures. */
const HOLD_LIMIT_MS = 10_000;

/** The longest a held beat waits for the start its writes are stamped with.
 *  A beat starts a little ahead of its writes (the beat lead plus the audio
 *  output latency); a stamp further off is a clock out of step, not a wait. */
const SHOW_WAIT_LIMIT_MS = 1_000;

/** What a create sets on its node, by which a reused node already showing it
 *  is left untouched. */
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

/** Every src the image writes held on `overlay` will paint once they go up
 *  (#1820). Until then the page shows the old screen, so what they paint is
 *  in no image layer yet, and the asset cache must keep it resident anyway
 *  (`AssetManager.derivedPins`). */
export function heldImageSrcs(overlay: HTMLElement | null | undefined): string[] {
  const hold = (overlay as { __sdHold?: HeldScreen } | null | undefined)?.__sdHold;
  if (!hold) {
    return [];
  }
  return flattenHeld(hold.queue).flatMap((message) =>
    WriteImageMessage.type.isRequest(message as RequestMessage)
      ? ((message.params as any).instructions ?? []).flatMap(
          (i: { content?: { srcs?: unknown } }) =>
            Array.isArray(i.content?.srcs)
              ? i.content.srcs.filter(
                  (src): src is string => typeof src === "string" && !!src,
                )
              : [],
        )
      : [],
  );
}

/** The messages held, with each batch's own messages in its place. */
function flattenHeld(queue: HeldMessage[]): (RequestMessage | NotificationMessage)[] {
  return queue.flatMap(({ message }) =>
    BatchElementsMessage.type.isNotification(message as NotificationMessage)
      ? ((message.params as any)?.messages ?? [])
      : [message],
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
   * Per-reconcile-pass insertion cursor: parent → the last child we placed under
   * it this pass. The create stream re-emits a parent's children in document
   * order with `before=null` (append). Anchoring each append AFTER this cursor
   * (rather than at the parent's end) makes re-emitting an unchanged child order
   * a no-op — without it, every non-last child gets moved to the end on each
   * render, churning #e's children (and every structural parent's) and flashing
   * the whole tree even though nothing actually moved.
   */
  protected _placeCursor = new Map<Element, Element>();

  override async onInit() {
    await super.onInit();
    // A fresh UIManager built for a re-render inherits the prior render's overlay
    // DOM (onDispose preserves it). Adopt those nodes as reconcile candidates so
    // the incoming create stream reuses them instead of duplicating.
    this.beginReconcilePass();
    // What the last manager still holds goes up through this one (#1820).
    void this.hold;
  }

  /** Start a reconcile pass: adopt every currently-rendered element as a
   *  reuse-or-sweep candidate. Idempotent; safe to call before each re-render. */
  beginReconcilePass() {
    this._staleIds.clear();
    this._staleImageTargets.clear();
    this._placeCursor.clear();
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
          this._staleIds.add(structural);
          this._elements.set(structural, el);
        }
        // Written image content is keyed by the target node rather than by an
        // id — a target carrying a write signature is showing layers from the
        // previous render until this pass writes it again.
        if ((el as any).__sdImg !== undefined) {
          this._staleImageTargets.add(el);
        }
      });
    }
  }

  /** End a reconcile pass: remove elements that survived from the previous render
   *  but weren't re-emitted (touched) this pass — the mark-and-sweep tail. */
  sweepReconcile() {
    for (const id of this._staleIds) {
      this.removeElementById(id);
    }
    this._staleIds.clear();
    for (const el of this._staleImageTargets) {
      if (el.isConnected) {
        this.clearImageLayers(el);
      }
    }
    this._staleImageTargets.clear();
  }

  /** Drop the image layers a target is still showing, exactly as the engine's
   *  own clear does (a `ui/write-image` carrying no instructions empties the
   *  content elements). The write signature goes with them, so a later write of
   *  the same image is not mistaken for one already on screen. */
  protected clearImageLayers(el: HTMLElement) {
    for (const tag of ["image", "mask"]) {
      for (const contentEl of this.getContentElements(el, tag)) {
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
      el.remove();
    }
    this._staleIds.delete(id);
  }

  /**
   * What the page holds back from the screen until it can show it in one go
   * (#1820). The page handles each message as a task of its own and can
   * render a frame between any two, so a display that clears a target in one
   * message and writes it in the next, or removes what the old beat showed
   * after the new beat is up, would show a frame that is neither. While a
   * hold is open the screen messages are queued in order, and when it closes
   * they are applied in that order in one task, so the screen goes from the
   * old beat to the new one in a single frame.
   *
   * - `pass`: a preview display's reconcile pass (`ui/reconcile-begin` with
   *   `hold`), open until its sweep. A display taken over before its sweep
   *   leaves the pass open, and the next display's messages join the queue.
   * - `frames`: the beats' own frames (`ui/frame`), open and close.
   *
   * Kept on the overlay, which outlives this manager, so a manager built for
   * the next display applies what the last one queued.
   */
  protected get hold(): HeldScreen | undefined {
    const overlay = this.app.overlay as
      | (HTMLElement & { __sdHold?: HeldScreen })
      | undefined;
    if (!overlay) {
      return undefined;
    }
    overlay.__sdHold ??= { pass: false, frames: 0, queue: [] };
    overlay.__sdHold.release = (due) => this.releaseIfIdle(due);
    return overlay.__sdHold;
  }

  /** Whether screen messages are being held. */
  protected get holding(): boolean {
    const hold = this.hold;
    return (
      hold != null && (hold.pass || hold.frames > 0 || hold.showTimer != null)
    );
  }

  /** Open a preview pass's hold, or keep holding for a display that took
   *  over one still held. A page showing nothing has nothing to keep on
   *  screen, so its first display goes up as it arrives. A display held
   *  longer than {@link HOLD_LIMIT_MS} (one that never sweeps) is let
   *  through rather than freezing the screen. */
  protected openPass() {
    const hold = this.hold;
    if (!hold) {
      return;
    }
    if (!hold.pass && !this.app.overlay?.firstElementChild) {
      return;
    }
    hold.pass = true;
    clearTimeout(hold.timer);
    hold.timer = setTimeout(() => {
      if (hold.pass) {
        hold.pass = false;
        hold.release?.();
      }
    }, HOLD_LIMIT_MS);
  }

  protected closePass() {
    const hold = this.hold;
    if (!hold) {
      return;
    }
    hold.pass = false;
    clearTimeout(hold.timer);
    hold.timer = undefined;
  }

  /**
   * Apply what is held once no pass or frame holds it any more. A played
   * beat's writes carry the time the beat starts on the shared clock, and its
   * text and pictures show from then (`getDisplayTime`): what the beat clears
   * waits for that time too, so the old beat gives way in the frame the new
   * one starts. `due` is set by the timer that waits for it.
   */
  protected releaseIfIdle(due = false) {
    const hold = this.hold;
    if (!hold || hold.pass || hold.frames > 0 || hold.queue.length === 0) {
      return;
    }
    if (hold.showTimer != null && !due) {
      return;
    }
    hold.showTimer = undefined;
    if (!due) {
      const wait = this.waitToShow(hold.queue);
      if (wait > 0) {
        hold.showTimer = setTimeout(() => hold.release?.(true), wait);
        return;
      }
    }
    const queue = hold.queue.splice(0);
    const changes = this.contentChanges(queue);
    queue.forEach((item, i) => {
      if (this.clearIsNoOp(queue, i, changes)) {
        item.answer?.(this.answerAtOnce(item.message as RequestMessage));
        return;
      }
      if ("id" in item.message) {
        const msg = item.message as RequestMessage;
        const done = this.applyRequest(msg);
        if (item.answer) {
          item.answer(done);
        } else {
          // Answered when it was held: a failure now has no answer to
          // carry it, so it is reported here.
          done.catch((error) => {
            console.error(`${msg.method} (${msg.id}) failed once applied`, error);
          });
        }
      } else {
        this.applyNotification(item.message as NotificationMessage);
      }
    });
  }

  /** How long the held beat waits for its start, in milliseconds: until the
   *  latest display time its writes carry, if that is soon. A stamp far from
   *  the page's clock (a clock that has not synced) is not waited for. */
  protected waitToShow(queue: HeldMessage[]): number {
    const doc = this.app.overlay?.ownerDocument;
    const now = Number(doc?.timeline?.currentTime);
    if (!Number.isFinite(now)) {
      return 0;
    }
    let at: number | undefined;
    for (const message of flattenHeld(queue)) {
      const time = (message.params as { time?: unknown } | undefined)?.time;
      if (
        typeof time === "number" &&
        (WriteTextMessage.type.isRequest(message as RequestMessage) ||
          WriteImageMessage.type.isRequest(message as RequestMessage) ||
          AnimateElementsMessage.type.isRequest(message as RequestMessage))
      ) {
        const shown = this.getDisplayTime(time);
        if (shown != null && (at == null || shown > at)) {
          at = shown;
        }
      }
    }
    if (at == null) {
      return 0;
    }
    const wait = at - now;
    return wait >= 1 && wait <= SHOW_WAIT_LIMIT_MS ? wait : 0;
  }

  /**
   * Where each op in `queue` changes what an element holds, read before any
   * of it is applied: a create that builds a node or changes a reused one
   * (its parent, for a new node), an update that sets content, a destroy or a
   * move. A clear and the rewrite it is skipped for must be the only things
   * in the transaction that touch their target's content.
   */
  protected contentChanges(queue: HeldMessage[]): { index: number; node: Element }[] {
    const changes: { index: number; node: Element }[] = [];
    queue.forEach((item, index) => {
      for (const m of flattenHeld([item])) {
        const msg = m as RequestMessage;
        const params = msg.params as any;
        let node: Element | null | undefined;
        if (CreateElementMessage.type.isRequest(msg)) {
          const existing = params.element ? this.getElement(params.element) : undefined;
          if (!existing || existing === this.app.overlay) {
            node = this.getElement(params.parent);
          } else if ((existing as any).__sdCreate !== createSignature(params)) {
            node = existing;
          }
        } else if (UpdateElementMessage.type.isRequest(msg)) {
          if (params.content != null) {
            node = this.getElement(params.element);
          }
        } else if (
          DestroyElementMessage.type.isRequest(msg) ||
          MoveElementMessage.type.isRequest(msg)
        ) {
          node = this.getElement(params.element);
        }
        if (node) {
          changes.push({ index, node });
        }
      }
    });
    return changes;
  }

  /**
   * Whether the clear at `i` is a no-op, judged as the queue reaches it: the
   * target's next write in the queue is exactly what the target shows now,
   * and nothing else in the transaction changes the target's content before
   * that write. Applied in one task, that clear and that rewrite would empty
   * and rebuild the same content for nothing (and replay its reveal);
   * skipping the clear lets the rewrite's signature check leave the target as
   * it is. A beat can clear a target more than once before it writes it (the
   * transient clear, then the beat's own): each is judged by the write that
   * follows them.
   */
  protected clearIsNoOp(
    queue: HeldMessage[],
    i: number,
    changes: { index: number; node: Element }[],
  ): boolean {
    const clear = queue[i]!.message as RequestMessage;
    const kind = WriteTextMessage.type.isRequest(clear)
      ? { type: WriteTextMessage.type, signature: "__sdTxt" }
      : WriteImageMessage.type.isRequest(clear)
        ? { type: WriteImageMessage.type, signature: "__sdImg" }
        : undefined;
    if (!kind || (clear.params as any).instructions.length > 0) {
      return false;
    }
    const target = (clear.params as any).target;
    const k = queue.findIndex(
      (item, j) =>
        j > i &&
        kind.type.isRequest(item.message as RequestMessage) &&
        (item.message.params as any).target === target &&
        (item.message.params as any).instructions.length > 0,
    );
    if (k < 0) {
      return false;
    }
    const sig = JSON.stringify((queue[k]!.message.params as any).instructions);
    const els = this.findTargetElements(target);
    if (els.length === 0 || !els.every((el) => (el as any)[kind.signature] === sig)) {
      return false;
    }
    return !changes.some(
      (c) =>
        c.index < k &&
        c.index !== i &&
        els.some((el) => el === c.node || el.contains(c.node)),
    );
  }

  /** What a held request answers before it is applied: its element or
   *  target, as its handler would. */
  protected answerAtOnce(msg: RequestMessage): unknown {
    const params = msg.params as any;
    if (CreateElementMessage.type.isRequest(msg)) {
      return CreateElementMessage.type.result(params.element);
    }
    if (UpdateElementMessage.type.isRequest(msg)) {
      return UpdateElementMessage.type.result(params.element);
    }
    if (DestroyElementMessage.type.isRequest(msg)) {
      return DestroyElementMessage.type.result(params.element);
    }
    if (MoveElementMessage.type.isRequest(msg)) {
      return MoveElementMessage.type.result(params.element);
    }
    if (WriteTextMessage.type.isRequest(msg)) {
      return WriteTextMessage.type.result(params.target);
    }
    if (WriteImageMessage.type.isRequest(msg)) {
      return WriteImageMessage.type.result(params.target);
    }
    if (AnimateElementsMessage.type.isRequest(msg)) {
      return AnimateElementsMessage.type.result(
        params.effects.map((_: unknown, i: number) => i),
      );
    }
    if (SetThemeMessage.type.isRequest(msg)) {
      return SetThemeMessage.type.result("");
    }
    return undefined;
  }

  protected isScreenRequest(msg: RequestMessage) {
    return (
      CreateElementMessage.type.isRequest(msg) ||
      UpdateElementMessage.type.isRequest(msg) ||
      DestroyElementMessage.type.isRequest(msg) ||
      MoveElementMessage.type.isRequest(msg) ||
      WriteTextMessage.type.isRequest(msg) ||
      WriteImageMessage.type.isRequest(msg) ||
      AnimateElementsMessage.type.isRequest(msg) ||
      SetThemeMessage.type.isRequest(msg)
    );
  }

  override async onReceiveRequest(msg: RequestMessage) {
    const hold = this.hold;
    if (hold && this.holding && this.isScreenRequest(msg)) {
      // A preview pass's requests are answered now: the display goes on to
      // its beat and its sweep only once the restore's writes are answered,
      // and a preview writes everything at once. A beat's frame closes in
      // the same turn that sent its writes, so they answer once applied.
      if (hold.pass) {
        hold.queue.push({ message: msg });
        return this.answerAtOnce(msg) as any;
      }
      return new Promise((resolve) => {
        hold.queue.push({ message: msg, answer: resolve });
      });
    }
    return this.applyRequest(msg);
  }

  override onReceiveNotification(msg: NotificationMessage) {
    const hold = this.hold;
    if (FrameMessage.type.isNotification(msg)) {
      if (hold) {
        hold.frames = Math.max(0, hold.frames + (msg.params.open ? 1 : -1));
        this.releaseIfIdle();
      }
      return;
    }
    if (BeginReconcileMessage.type.isNotification(msg)) {
      // A begin starts a new stream: no beat of an earlier one is still
      // between its frame's open and close.
      if (hold) {
        hold.frames = 0;
      }
      if (msg.params?.hold) {
        this.openPass();
      } else {
        // A pass that is not a preview (PLAY's) shows what it sends as it
        // arrives, after whatever an earlier pass still holds.
        this.closePass();
        this.releaseIfIdle();
      }
    }
    if (hold && this.holding && this.isScreenNotification(msg)) {
      hold.queue.push({ message: msg });
      if (SweepReconcileMessage.type.isNotification(msg)) {
        this.closePass();
        this.releaseIfIdle();
      }
      return;
    }
    this.applyNotification(msg);
  }

  protected isScreenNotification(msg: NotificationMessage) {
    return (
      BeginReconcileMessage.type.isNotification(msg) ||
      SweepReconcileMessage.type.isNotification(msg) ||
      BatchElementsMessage.type.isNotification(msg) ||
      ObserveElementMessage.type.isNotification(msg) ||
      UnobserveElementMessage.type.isNotification(msg)
    );
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

  protected async applyRequest(msg: RequestMessage) {
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
      if (!reused || (el as any).__sdCreate !== sig) {
        // Full-replace className so a reused node matches the new render exactly.
        el.className = params.name || "";
        if (params.content) {
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
      );
      return WriteTextMessage.type.result(params.target);
    }
    if (WriteImageMessage.type.isRequest(msg)) {
      const params = msg.params;
      await this.writeImage(
        params.target,
        params.instructions,
        this.getDisplayTime(params.time),
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
    return undefined;
  }

  // `ui/observe` + `ui/unobserve` are NOTIFICATIONS (the consumer attaches /
  // detaches a DOM listener and never replies; fired events come back via the
  // separate `event` notification). Handling them as requests leaked a resolve
  // callback per call in the connection — and reactive keyed-`for` reconcile
  // observes/unobserves on every mount.
  protected applyNotification(msg: NotificationMessage) {
    // The game opens a pass at every connect and closes it once the stream
    // has written everything it shows.
    if (BeginReconcileMessage.type.isNotification(msg)) {
      this.beginReconcilePass();
      return;
    }
    if (SweepReconcileMessage.type.isNotification(msg)) {
      this.sweepReconcile();
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
   * Mirrors the engine's `UIModule.findElements`: it recursively collects
   * every element whose className includes the requested name, then (when an
   * `#index` instance suffix is present) narrows to that single occurrence.
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
    const matches = Array.from(
      overlay.querySelectorAll(selector),
    ) as HTMLElement[];
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
  ) {
    const targetEls = this.findTargetElements(target);
    // Reconcile dedup: a write APPENDS spans, so replaying an unchanged write
    // onto a reused target would both re-reveal and DUPLICATE its text. If every
    // target already shows exactly this write, leave it untouched. Stored on the
    // node so it survives the per-edit UIManager swap.
    const sig = JSON.stringify(instructions);
    if (
      targetEls.length > 0 &&
      targetEls.every((el) => (el as any).__sdTxt === sig)
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
      (el as any).__sdTxt = sig;
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
      } else {
        // Clear text + stroke (the `null`-sequence / clear path).
        for (const textEl of textEls) {
          textEl.replaceChildren();
        }
        for (const strokeEl of strokeEls) {
          strokeEl.replaceChildren();
        }
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
  ) {
    const targetEls = this.findTargetElements(target);
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
    // stored ON the target node so it survives the per-edit UIManager swap.
    const sig = JSON.stringify(instructions);
    if (
      targetEls.length > 0 &&
      targetEls.every((el) => (el as any).__sdImg === sig)
    ) {
      return;
    }
    for (const el of targetEls) {
      (el as any).__sdImg = sig;
    }
    const targetEffects: { element: HTMLElement; animations: Animation[] }[] =
      [];
    const enterEffects: { element: HTMLElement; animations: Animation[] }[] = [];
    const exitEffects: { element: HTMLElement; animations: Animation[] }[] = [];
    const toDestroy: HTMLElement[] = [];

    const applyStyle = this.applyStyle.bind(this);

    for (const targetEl of targetEls) {
      const imageEls = this.getContentElements(targetEl, "image");
      const maskEls = this.getContentElements(targetEl, "mask");
      if (instructions.length === 0) {
        // Clear path (the engine cleared image + mask content then set
        // display:none on the wrapper, which it still emits via ui/update).
        for (const imageEl of imageEls) {
          imageEl.replaceChildren();
        }
        for (const maskEl of maskEls) {
          maskEl.replaceChildren();
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
          continue;
        }
        for (const { els, property } of contentTargets) {
          for (const contentEl of els) {
            // Capture existing layers BEFORE creating the new one (crossfade).
            const prevSpanEls = Array.from(contentEl.children) as HTMLElement[];
            const newSpanEl = createImageElement(
              contentEl,
              property,
              content.background,
              content.imageNames,
              content.src,
              applyStyle,
            );
            // What this layer paints stays resident while it is on screen
            // (`AssetManager.derivedPins`). Kept on the node, which outlives
            // this manager across a re-render.
            (newSpanEl as any).__sdSrcs = content.srcs;
            if (instruction.control === "show") {
              // 'show' fades out + destroys the previous layers (the crossfade).
              // The engine only ever destroyed spans it had enqueued an exit
              // animation for; the builtin `hide` always resolves, so every
              // previous layer is faded out then destroyed.
              if (content.previousHideAnimation) {
                for (const prevSpanEl of prevSpanEls) {
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
      el.remove();
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
