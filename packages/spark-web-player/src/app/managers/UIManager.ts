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
import { HoldClearMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/HoldClearMessage";
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

/** What the page still holds of the clears of one element
 *  (`UIManager.heldClears`). */
interface HeldClear {
  /** Whether it is still to be hidden. */
  hide: boolean;
  /** Whether hiding it also removes its `text` attribute (a text clear). */
  textAttr: boolean;
  /** The text content still to be removed: the nodes its `text` and
   *  `stroke` held when the text clear arrived. Absent when none is held. */
  text?: Set<Node>;
  /** The same for the image clear, from its `image` and `mask`. */
  image?: Set<Node>;
}

/** The content elements a text clear empties, and those an image clear
 *  empties. */
const TEXT_CONTENT = ["text", "stroke"] as const;
const IMAGE_CONTENT = ["image", "mask"] as const;

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

  /** Elements this reconcile pass built rather than reused. A clear the
   *  connect holds for them applies at once: they have nothing on screen to
   *  keep, and held, an empty box would paint until the beat. */
  protected _createdThisPass = new WeakSet<Element>();

  /**
   * Clears a preview display sent that the page has not applied yet
   * (`ui/reconcile-clear`, #1820), by element. A held clear has two parts,
   * applied as late as the messages after it allow: the element's hiding
   * just before the next message that updates, animates, moves or destroys
   * it, and the content the clear empties just before the next write to it,
   * so it never shows empty between its clear and what replaces it. The
   * sweep applies what is left. Kept on the overlay, like the write
   * signatures on its nodes, so a display another one takes over before its
   * sweep leaves them to the next manager and pass rather than losing them.
   */
  protected get heldClears(): Map<HTMLElement, HeldClear> | undefined {
    const overlay = this.app.overlay as
      | (HTMLElement & { __sdHeldClears?: Map<HTMLElement, HeldClear> })
      | undefined;
    if (!overlay) {
      return undefined;
    }
    overlay.__sdHeldClears ??= new Map();
    return overlay.__sdHeldClears;
  }

  override async onInit() {
    await super.onInit();
    // A fresh UIManager built for a re-render inherits the prior render's overlay
    // DOM (onDispose preserves it). Adopt those nodes as reconcile candidates so
    // the incoming create stream reuses them instead of duplicating.
    this.beginReconcilePass();
  }

  /** Start a reconcile pass: adopt every currently-rendered element as a
   *  reuse-or-sweep candidate. Idempotent; safe to call before each re-render. */
  beginReconcilePass() {
    this._staleIds.clear();
    this._staleImageTargets.clear();
    this._placeCursor.clear();
    this._createdThisPass = new WeakSet();
    const overlay = this.app.overlay;
    if (overlay) {
      // Scanned by STRUCTURAL id (`__sdId`), not `[id]`: an authored `#id`
      // owns the DOM attribute, and adopting that value would mark an id the
      // create stream never re-emits — the sweep would then delete a live
      // element. Elements this manager did not create carry no `__sdId` and
      // are correctly left alone.
      //
      // Not what a held clear removes (#1820): applied at once, that clear had
      // detached it, and a pass that opened then could not have found it here.
      const keep = this.connectedAsCleared();
      overlay.querySelectorAll("*").forEach((node) => {
        const el = node as HTMLElement;
        if (!keep(el)) {
          return;
        }
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

  /** End a reconcile pass: apply the clears still held, then remove elements
   *  that survived from the previous render but weren't re-emitted (touched)
   *  this pass — the mark-and-sweep tail. */
  sweepReconcile() {
    const held = this.heldClears;
    if (held) {
      for (const el of Array.from(held.keys())) {
        this.applyHeld(el);
      }
    }
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

  /** Hold a target's clear, element by element, until the messages after it
   *  touch each element, or the sweep. The hiding is held for the elements
   *  the game named, and the content for those the target names on the page
   *  now: the very nodes their content elements hold now, which are what the
   *  clear applied at once would have removed. An element, a content slot or
   *  a node created later is not this clear's to empty. An element this pass
   *  built is cleared at once, since it has nothing on screen to keep. */
  protected holdClear(clear: {
    target: string;
    elements: string[];
    text?: boolean;
    image?: boolean;
  }) {
    const parts = new Map<HTMLElement, HeldClear>();
    const part = (el: HTMLElement) => {
      let entry = parts.get(el);
      if (!entry) {
        entry = { hide: false, textAttr: false };
        parts.set(el, entry);
      }
      return entry;
    };
    for (const id of clear.elements) {
      const el = this.getElement(id);
      if (el && el !== this.app.overlay) {
        const entry = part(el);
        entry.hide = true;
        entry.textAttr ||= Boolean(clear.text);
      }
    }
    const held = this.heldClears;
    // Applied at once, an empty write removes nothing when every element of
    // its target already shows an empty write (`writeText` and `writeImage`
    // dedupe on the signature), so a held clear decides the same, now. An
    // element whose clear of that kind is still held counts as cleared: the
    // clear applied at once would already have signed it.
    // An element inside content another held clear removes, applied at once,
    // was already detached by that clear, so this clear's empty writes, which
    // resolve the target among connected elements, neither emptied nor signed
    // it. Its hiding still came, by id.
    const targetEls = this.findTargetElements(
      clear.target,
      this.connectedAsCleared(),
    );
    const empty = JSON.stringify([]);
    const shownEmpty = (kind: "text" | "image") =>
      targetEls.length > 0 &&
      targetEls.every(
        (el) =>
          held?.get(el)?.[kind] != null ||
          (el as any)[kind === "text" ? "__sdTxt" : "__sdImg"] === empty,
      );
    const textEmpty = shownEmpty("text");
    const imageEmpty = shownEmpty("image");
    for (const el of targetEls) {
      const entry = part(el);
      if (clear.text) {
        entry.text = textEmpty ? new Set() : this.contentNodes(el, TEXT_CONTENT);
      }
      if (clear.image) {
        entry.image = imageEmpty
          ? new Set()
          : this.contentNodes(el, IMAGE_CONTENT);
      }
    }
    for (const [el, entry] of parts) {
      if (!held || this._createdThisPass.has(el)) {
        this.applyClear(el, entry);
        continue;
      }
      const prior = held.get(el);
      if (!prior) {
        held.set(el, entry);
        continue;
      }
      prior.hide ||= entry.hide;
      prior.textAttr ||= entry.textAttr;
      for (const kind of ["text", "image"] as const) {
        const nodes = entry[kind];
        if (nodes) {
          prior[kind] = new Set([...(prior[kind] ?? []), ...nodes]);
        }
      }
    }
  }

  /** Whether an element would still be connected had the held clears been
   *  applied at once: not inside content one of them removes. Applied at
   *  once, that clear had detached it, and a later write or clear, which
   *  resolves its target among connected elements, did not find it. */
  protected connectedAsCleared(): (el: Node) => boolean {
    const held = this.heldClears;
    if (!held || held.size === 0) {
      return () => true;
    }
    const removing = new Set<Node>();
    for (const entry of held.values()) {
      for (const node of [...(entry.text ?? []), ...(entry.image ?? [])]) {
        removing.add(node);
      }
    }
    return (el: Node) => {
      for (let n: Node | null = el; n; n = n.parentNode) {
        if (removing.has(n)) {
          return false;
        }
      }
      return true;
    };
  }

  /** The nodes `el`'s content elements of the given classes hold now. */
  protected contentNodes(el: HTMLElement, tags: readonly string[]): Set<Node> {
    const nodes = new Set<Node>();
    for (const tag of tags) {
      for (const contentEl of this.getContentElements(el, tag)) {
        for (const node of Array.from(contentEl.childNodes)) {
          nodes.add(node);
        }
      }
    }
    return nodes;
  }

  /** Apply what is held for `el`: its hiding (unless `hide` is false), and
   *  the content of the kinds given (all of them when none are). */
  protected applyHeld(
    el: HTMLElement,
    kinds?: readonly ("text" | "image")[],
    hide = true,
  ) {
    const held = this.heldClears;
    const entry = held?.get(el);
    if (!held || !entry) {
      return;
    }
    const release: HeldClear = { hide: false, textAttr: false };
    if (hide) {
      release.hide = entry.hide;
      release.textAttr = entry.textAttr;
      entry.hide = false;
      entry.textAttr = false;
    }
    for (const kind of kinds ?? (["text", "image"] as const)) {
      release[kind] = entry[kind];
      delete entry[kind];
    }
    if (!entry.hide && !entry.text && !entry.image) {
      held.delete(el);
    }
    this.applyClear(el, release);
  }

  /** A clear of one element, as the engine's text and image clears leave
   *  it: hidden (and its `text` attribute gone, for a text clear), and the
   *  content each clear empties emptied, with the write signature and the
   *  reveal reset as `writeText` and `writeImage` reset them for a clear. */
  protected applyClear(el: HTMLElement, entry: HeldClear) {
    if (entry.hide) {
      this.applyHide(el, entry.textAttr);
    }
    if (entry.text) {
      (el as any).__sdWait?.cancel();
      delete (el as any).__sdWait;
      this.revealAtOnce(el);
      (el as any).__sdTxt = JSON.stringify([]);
      for (const node of entry.text) {
        node.parentNode?.removeChild(node);
      }
    }
    if (entry.image) {
      this._staleImageTargets.delete(el);
      (el as any).__sdImg = JSON.stringify([]);
      for (const node of entry.image) {
        node.parentNode?.removeChild(node);
      }
    }
  }

  /** The part of a clear that hides an element, as the clear's update
   *  would. Applied to the node directly rather than as an update: an update
   *  marks its element live in this pass, and a clear held over from a
   *  display taken over before its sweep can name one this pass dropped. */
  protected applyHide(el: HTMLElement, textAttr: boolean) {
    const [prop, value] = getCSSPropertyKeyValue("display", "none");
    for (const [cssProp, cssValue] of getCssEquivalent(prop, value)) {
      el.style.setProperty(cssProp, cssValue);
    }
    if (textAttr) {
      applyAttributes(el, { text: null });
    }
  }

  /**
   * Apply what `msg` touches of the held clears, before `msg` is handled, so
   * each element still sees its clear before anything after it, as if the
   * clear had been applied when it was sent.
   *
   * A write applies the clear of each element it writes, and only of those,
   * and only of its own kind: a text write empties the text it replaces and
   * leaves the element's pictures until the image write that replaces them,
   * and an element the write does not replace (another instance of the
   * target, written by an indexed write of its own) keeps what it shows. An
   * update, an animation, a move or a destroy of an element applies only its
   * hiding: the update that shows a target again (the restore's or the
   * beat's) then lands on it in the same task, and the element keeps what it
   * shows until its write. An update of a content element itself (`text`,
   * `stroke`, `image`, `mask`: its style, its attributes) releases nothing:
   * removing the nodes inside it and updating it commute, so the picture or
   * the words stay until the write that replaces them. A create releases
   * nothing either: a held clear removes only the nodes it found when it
   * arrived, so what is created after it (a layout the beat opens, a content
   * slot a branch mounts) is not its to empty, and what a create re-emits is
   * handled by {@link reemittedHeld}.
   */
  protected releaseHeldClears(msg: RequestMessage) {
    const held = this.heldClears;
    if (!held || held.size === 0) {
      return;
    }
    if (WriteTextMessage.type.isRequest(msg)) {
      for (const el of this.findTargetElements(
        msg.params.target,
        this.connectedAsCleared(),
      )) {
        this.applyHeld(el, ["text"]);
      }
      return;
    }
    if (WriteImageMessage.type.isRequest(msg)) {
      for (const el of this.findTargetElements(
        msg.params.target,
        this.connectedAsCleared(),
      )) {
        this.applyHeld(el, ["image"]);
      }
      return;
    }
    let ids: (string | null | undefined)[] = [];
    if (AnimateElementsMessage.type.isRequest(msg)) {
      ids = msg.params.effects.map((effect) => effect?.element);
    } else if (
      UpdateElementMessage.type.isRequest(msg) ||
      MoveElementMessage.type.isRequest(msg) ||
      DestroyElementMessage.type.isRequest(msg)
    ) {
      ids = [msg.params.element];
    }
    for (const id of ids) {
      const el = id ? this.getElement(id) : undefined;
      if (el) {
        this.applyHeld(el, []);
      }
    }
  }

  /**
   * A create re-emitted `el`, which this pass reuses. A clear held over from
   * a display taken over before its sweep, applied at once, came before this
   * create, which then put `el` back as the create says:
   * - when `el` is content such a clear removes, the create has put it back
   *   and it is no longer that clear's to remove;
   * - when the create restyles `el`, its static style replaces the hiding
   *   the clear would have set, and only the clear's removal of the `text`
   *   attribute (which a create does not write) still stands.
   * A clear the connect holds after this create stream records `el` again.
   */
  protected reemittedHeld(el: HTMLElement, restyled: boolean) {
    const held = this.heldClears;
    if (!held || held.size === 0) {
      return;
    }
    for (const [owner, entry] of Array.from(held)) {
      entry.text?.delete(el);
      entry.image?.delete(el);
      if (owner === el && restyled && entry.hide) {
        if (entry.textAttr) {
          applyAttributes(el, { text: null });
        }
        entry.hide = false;
        entry.textAttr = false;
      }
      if (!entry.hide && !entry.text && !entry.image) {
        held.delete(owner);
      }
    }
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
    // Not what a held clear removes, which applied at once had been detached
    // and out of reach of this walk (#1820).
    let found: HTMLElement | undefined;
    const keep = this.connectedAsCleared();
    this.app.overlay?.querySelectorAll("*").forEach((node) => {
      if (!found && (node as any).__sdId === id && keep(node)) {
        found = node as HTMLElement;
      }
    });
    if (found) {
      this._elements.set(id, found);
    }
    return found;
  }

  override async onReceiveRequest(msg: RequestMessage) {
    this.releaseHeldClears(msg);
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
        this._createdThisPass.add(el);
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
      const sig = JSON.stringify([
        params.type,
        params.name ?? null,
        params.content ?? null,
        params.style ?? null,
        params.attributes ?? null,
      ]);
      if (reused) {
        this.reemittedHeld(el, (el as any).__sdCreate !== sig);
      }
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
  override onReceiveNotification(msg: NotificationMessage) {
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
    if (HoldClearMessage.type.isNotification(msg)) {
      for (const clear of msg.params.targets) {
        this.holdClear(clear);
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
   * Mirrors the engine's `UIModule.findElements`: it recursively collects
   * every element whose className includes the requested name, then (when an
   * `#index` instance suffix is present) narrows to that single occurrence.
   * The engine owns the `Element` tree and only forwards the original `target`
   * string, so the consumer re-resolves it here against the real DOM. (D13 may
   * later replace this with a consumer-side id→element map.)
   *
   * `keep` narrows the matches before the `#index` is taken, so an instance
   * counts only among the elements kept (the clears and writes keep what a
   * held clear has not removed: #1820).
   */
  protected findTargetElements(
    target: string,
    keep?: (el: HTMLElement) => boolean,
  ): HTMLElement[] {
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
    const all = Array.from(overlay.querySelectorAll(selector)) as HTMLElement[];
    const matches = keep ? all.filter(keep) : all;
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
    // Not what a held clear removes: applied at once, it had detached it.
    const targetEls = this.findTargetElements(
      target,
      this.connectedAsCleared(),
    );
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
    // Not what a held clear removes: applied at once, it had detached it.
    const targetEls = this.findTargetElements(
      target,
      this.connectedAsCleared(),
    );
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
            for (const el of this.findTargetElements(
              a.target,
              this.connectedAsCleared(),
            )) {
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
