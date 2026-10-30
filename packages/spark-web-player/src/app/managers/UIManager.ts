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

type WriteDecision =
  | "skip"
  | "same"
  | "write"
  | "rebuild";

type WriteKind = typeof WriteTextMessage.type | typeof WriteImageMessage.type;

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
  timer?: ReturnType<typeof setTimeout>;
  owner: UIManager;
}

type OverlayWithBeat = HTMLElement & { __sdBeat?: PendingBeat };

interface Cutscene {
  element: HTMLElement;
  end: (immediate?: boolean) => void;
  previewEpoch?: number;
}

type OverlayWithCutscene = HTMLElement & { __sdCutscene?: Cutscene };

const COMMIT_WAIT_LIMIT_MS = 1_000;

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

  protected flushPendingBeat() {
    const overlay = this.app.overlay as OverlayWithBeat | undefined;
    const pending = overlay?.__sdBeat;
    if (!overlay || !pending) {
      return;
    }
    overlay.__sdBeat = undefined;
    clearTimeout(pending.timer);
    this.applyBeat(pending.params, pending.ops, pending.plan);
  }

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
      const sig = JSON.stringify(p.instructions);
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
      this.flushPendingBeat();
      this.morphs?.requestRelayout();
    }
    this.touch(this.touchesOf(msg));
    if (SetThemeMessage.type.isRequest(msg)) {
      const params = msg.params;
      this._breakpoints = params.breakpoints;
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
      const sig = createSignature(params);
      const changed = !reused || (el as any).__sdCreate !== sig;
      if (changed) {
        el.className = params.name || "";
        if (params.content) {
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
        (el as any).__sdCreate = sig;
      } else if ((el as any).__sdUpdatedContent && params.content) {
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
        if (params.content != undefined) {
          this.morphs?.releaseWithin(element);
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
    if (SkipCutsceneMessage.type.isNotification(msg)) {
      this.endCutscene();
      return;
    }
    if (msg.method.startsWith("ui/")) {
      this.morphs?.requestRelayout();
    }
    if (msg.method.startsWith("ui/") && !retiredOnly(msg)) {
      this.flushPendingBeat();
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
    if (
      decision === "same" ||
      (decision == null && targetEls.length > 0 && targetEls.every(holds))
    ) {
      if (instant) {
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
        this.clearWrittenText(el, true);
      }
      (el as any).__sdTxt = sig;
      (el as any).__sdTxtRev = (el as any).__sdRev ?? 0;
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
      if (!instant && !atOnce && instructions.length > 0 && empty) {
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

  protected async writeImage(
    target: string,
    instructions: WriteImageInstruction[],
    startTime?: number,
    elements?: string[],
    decision?: WriteDecision,
  ) {
    const targetEls = this.writeTargets(target, elements);
    for (const el of targetEls) {
      this._staleImageTargets.delete(el);
    }
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
    const targetEffects: { element: HTMLElement; animations: Animation[] }[] =
      [];
    const enterEffects: { element: HTMLElement; animations: Animation[] }[] = [];
    const exitEffects: { element: HTMLElement; animations: Animation[] }[] = [];
    const toDestroy: HTMLElement[] = [];
    const newMovies: HTMLVideoElement[] = [];
    const hiddenMovies: HTMLVideoElement[] = [];

    const applyStyle = this.applyStyle.bind(this);

    for (const targetEl of targetEls) {
      const imageEls = this.getContentElements(targetEl, "image");
      const maskEls = this.getContentElements(targetEl, "mask");
      if (instructions.length === 0) {
        for (const contentEl of [...imageEls, ...maskEls]) {
          this.releaseMovies(contentEl);
          this.morphs?.releaseWithin(contentEl);
          contentEl.replaceChildren();
        }
        continue;
      }
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
            const prevSpanEls = Array.from(contentEl.children) as HTMLElement[];
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
              (videoEl as any).__sdMixer = {
                mixer: video.mixer,
                mixerGain: video.mixerGain,
              };
            }
            if (videoEl && !video?.preview && instruction.control !== "hide") {
              newMovies.push(videoEl);
            }
            (newSpanEl as any).__sdSrcs =
              content.video && !video
                ? content.srcs.filter((src) => src !== content.video?.src)
                : content.srcs;
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
              if (content.previousHideAnimation) {
                for (const prevSpanEl of prevSpanEls) {
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
    for (const video of newMovies) {
      this.startMovie(video);
    }
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
    for (const el of toDestroy) {
      this.releaseMovies(el);
      this.morphs?.releaseWithin(el);
      el.remove();
    }
    for (const video of hiddenMovies) {
      const span = video.closest("span.instance");
      this.releaseMovies(video);
      (span ?? video).remove();
    }
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
      const player = new AnimationPlayer();
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
      const keyframes = params.enter.keyframes;
      const fades = (Array.isArray(keyframes) ? keyframes : [keyframes]).some(
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

  protected moviePosition(video: HTMLVideoElement): number {
    return this.moviePlace(video, this.clockTime(video)).anchor;
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

  protected skipMovies(seconds: number) {
    for (const video of this.movies()) {
      const place = this.moviePlace(video, this.moviePosition(video) + seconds);
      this.anchorMovie(video, place.anchor);
      this.seekMovie(video, place.element);
    }
  }

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
