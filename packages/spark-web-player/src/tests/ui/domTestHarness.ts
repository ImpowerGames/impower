// Layer 1 — DOM-render golden-master harness.
//
// Drives the real engine (compiled `.sd` → `Game` → `UIModule`) and pipes its
// emitted message stream into the REAL web consumer (`spark-web-player`
// `UIManager`) running under jsdom, then snapshots the resulting overlay DOM
// (tag / id / class / attributes / textContent / inline styles), id-normalized.
//
// This is the layer that should stay INVARIANT across the engine→consumer
// relocation refactors: the engine may change *which side* builds the spans,
// but the rendered overlay tree must not regress.
//
// Avoiding pixi: we never construct `Application` (which bundles pixi.js +
// WebGL). `UIManager` itself imports only spark-dom utils + spark-engine
// message classes + `Manager` (whose only pixi reference is an erased
// type-import). We hand it a MINIMAL stub `app` exposing just `overlay` +
// `emit`. The managers are connected to the game the way `Application`
// connects them, through its `MessageRouter`, and every message in both
// directions passes through `cloneMessage`, as it would crossing to a worker.
// The Web Animations API (`new Animation`, `KeyframeEffect`) that
// `AnimationPlayer.play()` needs is absent in jsdom, so we install a tiny
// no-op stub — reveal animations apply opacity via WAAPI (invisible to jsdom's
// computed styles regardless), so stubbing them does not change the snapshot.

import { JSDOM, VirtualConsole } from "jsdom";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { Instructions } from "@impower/spark-engine/src/game/core/types/Instructions";
import { cloneMessage } from "@impower/spark-engine/src/tests/harness/cloneMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { AssetCache, type ImageTarget } from "../../app/assets/AssetCache";
import { AudioClock } from "../../app/AudioClock";
import { Manager } from "../../app/Manager";
import { MessageRouter } from "../../app/MessageRouter";
import AssetManager from "../../app/managers/AssetManager";
import UIManager from "../../app/managers/UIManager";

const MAIN_URI = "inmemory:///main.sd";

export interface DOMHarness {
  game: Game;
  ui: UIManager;
  /** The page's end of the current game's stream. */
  router: MessageRouter;
  overlay: HTMLElement;
  ready: Promise<void>;
  /** Preview at a line. A beat with pictures displays once the page
   *  answers the preview's gate, so await the result before reading what
   *  such a beat wrote. */
  preview(line?: number): Promise<string | null>;
  /** Re-render a (possibly edited) source into the same overlay via the same
   *  reconciling UIManager — models a live-preview edit. */
  rerender(newSource: string, line?: number): Promise<void>;
  jumpTo(path: string): void;
  nextBeat(): Instructions | undefined;
  display(instructions: Instructions, instant: boolean): Promise<void>;
  /** Serialize the overlay DOM into a stable, id-normalized tree snapshot. */
  snapshotDOM(): unknown;
}

export function compile(source: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    // Builtins come from the implicitly-imported builtins prelude (the compiler
    // default), exactly like the production player.
    useBuiltinsPrelude: true,
    // The engine sources defines from the live runtime __def tables, so seed the
    // builtins prelude into the story VM (the production player does the same).
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: MAIN_URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: MAIN_URI } });
  if (!result.program.compiled) {
    throw new Error("DOM fixture failed to compile");
  }
  return result.program;
}

/** jsdom lacks the Web Animations API; install no-op stubs so
 *  `AnimationPlayer.add/play` don't throw. They never mutate inline styles. */
function installWAAPIStub(win: any) {
  if (typeof win.Animation === "undefined") {
    win.Animation = class {
      startTime: number | null = null;
      finished = Promise.resolve(this);
      constructor(public effect?: unknown) {}
      play() {}
      cancel() {}
    };
  }
  if (typeof win.KeyframeEffect === "undefined") {
    win.KeyframeEffect = class {
      constructor(
        public target?: unknown,
        public keyframes?: unknown,
        public options?: unknown,
      ) {}
    };
  }
  if (!win.document.timeline) {
    win.document.timeline = { currentTime: 0 };
  }
  // jsdom doesn't expose CSS.escape on the global the consumer reads
  // (D14's UIManager.findTargetElements uses it to build a class selector).
  if (typeof win.CSS === "undefined") {
    win.CSS = {} as any;
  }
  if (typeof win.CSS.escape !== "function") {
    win.CSS.escape = (value: string): string => {
      const str = String(value);
      const len = str.length;
      const firstCodeUnit = str.charCodeAt(0);
      let result = "";
      let index = -1;
      while (++index < len) {
        const codeUnit = str.charCodeAt(index);
        if (codeUnit === 0x0000) {
          result += "�";
        } else if (
          (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
          codeUnit === 0x007f ||
          (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
          (index === 1 &&
            codeUnit >= 0x0030 &&
            codeUnit <= 0x0039 &&
            firstCodeUnit === 0x002d)
        ) {
          result += "\\" + codeUnit.toString(16) + " ";
        } else if (index === 0 && len === 1 && codeUnit === 0x002d) {
          result += "\\" + str.charAt(index);
        } else if (
          codeUnit >= 0x0080 ||
          codeUnit === 0x002d ||
          codeUnit === 0x005f ||
          (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
          (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
          (codeUnit >= 0x0061 && codeUnit <= 0x007a)
        ) {
          result += str.charAt(index);
        } else {
          result += "\\" + str.charAt(index);
        }
      }
      return result;
    };
  }
}

/** The globals `installJSDOM` points at its window. */
const GLOBALS = [
  "window",
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "Element",
  "Node",
  "Animation",
  "KeyframeEffect",
  "FontFace",
  "CSS",
];

/** A fresh jsdom, with its globals (document, Animation, KeyframeEffect, …)
 *  bound so the consumer's `document.createElement` and AnimationPlayer
 *  resolve, and the overlay the managers render into. */
export function installJSDOM() {
  // jsdom can't parse `@container`/`@media` in the engine-generated stylesheet
  // text (it still stores the textContent, which is what we snapshot); mute the
  // "Could not parse CSS stylesheet" jsdomError so it doesn't spam the output.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><div id="overlay"></div></body></html>`,
    { virtualConsole },
  );
  const win = dom.window as any;
  installWAAPIStub(win);
  const g = globalThis as any;
  const previous = new Map(GLOBALS.map((name) => [name, g[name]]));
  g.window = win;
  g.document = win.document;
  g.HTMLElement = win.HTMLElement;
  // The renderer gates live value/checked on `instanceof HTMLInputElement` /
  // `HTMLSelectElement`. Those constructors must come from THIS jsdom realm (the
  // one that created the elements), or the instanceof is false and the
  // value-property path (e.g. selecting a <select> option) silently no-ops.
  g.HTMLInputElement = win.HTMLInputElement;
  g.HTMLSelectElement = win.HTMLSelectElement;
  g.Element = win.Element;
  g.Node = win.Node;
  g.Animation = win.Animation;
  g.KeyframeEffect = win.KeyframeEffect;
  g.FontFace = win.FontFace ?? class {};
  g.CSS = win.CSS;
  const overlay = win.document.getElementById("overlay") as HTMLElement;
  /** Put back every global this replaced, so a later test file run in the
   *  same process sees its own environment's. */
  const restore = () => {
    for (const [name, value] of previous) {
      g[name] = value;
    }
  };
  return { win, overlay, restore };
}

/** An image that loads on the next microtask, like a cached response, so the
 *  engine's asset gates settle without a network. With `hold`, a load waits
 *  until `hold` says the src may finish. */
export function createFakeImage(
  hold?: (src: string) => Promise<void> | undefined,
): ImageTarget {
  const target: ImageTarget = {
    src: "",
    onload: null,
    onerror: null,
    naturalWidth: 10,
    naturalHeight: 10,
  };
  let src = "";
  Object.defineProperty(target, "src", {
    get: () => src,
    set: (value: string) => {
      src = value;
      const held = hold?.(value);
      if (held) {
        held.then(() => target.onload?.call(target, {}));
      } else {
        queueMicrotask(() => target.onload?.call(target, {}));
      }
    },
  });
  return target;
}

/** The slice of an `Application` the page's managers use: the overlay, the
 *  way back to the game, an asset cache and an audio graph with nothing to
 *  play. */
export function createStubApp(
  overlay: HTMLElement,
  emit: (message: any) => void,
  createImage: () => ImageTarget = () => createFakeImage(),
): any {
  return {
    overlay,
    emit,
    assetCache: new AssetCache({ createImage }),
    // The game's clock reads 0 here, so a beat's shared-clock stamp maps to
    // the start of the document timeline.
    audioClock: new AudioClock(0, () => 0),
    audio: {
      decodeAudioBuffer: async () => null,
      playingKeys: () => [],
    },
  };
}

/** This harness has no audio graph or world: it answers their requests as a
 *  page with nothing to play would, so the game does not wait on them. */
export class SilentPageManager extends Manager {
  override async onReceiveRequest(msg: RequestMessage) {
    return msg.method.startsWith("audio/") || msg.method.startsWith("world/")
      ? { result: null }
      : undefined;
  }
}

export function createDOMHarness(
  source: string,
  startLine = 0,
  opts?: {
    reactive?: boolean;
    autoOpenAll?: boolean;
    /** Load a saved checkpoint before the connect, as the page does when it
     *  displays a preview from the worker's route. */
    loadCheckpoint?: string;
  },
): DOMHarness {
  const program = compile(source);
  const { overlay } = installJSDOM();

  // Timers armed with a real delay (an asset gate's timeout, the loading
  // layout's minimum display) are held for `flushTimers()`; zero-delay timers
  // (the Coordinator's audio-latency sync) fire inline, as before.
  const pendingTimers: Array<{ fn: Function; args: any[] }> = [];

  const makeGame = (prog: any) => {
    const g = new Game({
      program: prog,
      previewFrom: { file: MAIN_URI, line: startLine },
      now: () => 0,
      setTimeout: ((fn: Function, ms?: number, ...args: any[]) => {
        if (ms != null && ms > 0) {
          pendingTimers.push({ fn, args });
          return pendingTimers.length;
        }
        fn(...args);
        return 0;
      }) as any,
    } as any);
    // Enable the reactive (AST-driven) render path before connect()'s eager
    // onConnected runs (mirrors uiTestHarness) — required to render screen
    // widgets. `onConnected` now always sets `_reactive`, so the `reactive` opt
    // is only kept for back-compat with existing call sites.
    if (opts?.reactive) {
      (g.module.ui as any)._reactive = true;
    }
    // Auto-mount EVERY screen at connect (instant) so tests keep their "screen is
    // mounted at connect" assumption — production only auto-opens `main`, so a
    // test exercising the real [[open/close]] lifecycle passes
    // `autoOpenAll: false`. Mirrors the Layer-2 uiTestHarness default.
    (g.module.ui as any)._autoOpenAll = opts?.autoOpenAll ?? true;
    return g;
  };

  // The game can be swapped (rerender) to model a live-preview edit; event
  // round-trips + request responses must follow the CURRENT game.
  let game = makeGame(program);

  // Minimal stub `app` — UIManager only ever touches `.overlay` and `.emit`.
  // `emit` is the renderer→engine path: when a real DOM event fires on an
  // observed element, UIManager calls `app.emit(EventMessage...)`; we route it
  // straight back into the engine so click→advance round-trips end to end.
  const stubApp = createStubApp(overlay, (message) => {
    game.connection.receive(cloneMessage(message));
  });

  // Swapped on rerender (buildApp makes a NEW manager per edit; the overlay DOM
  // persists across the swap).
  let ui = new UIManager(stubApp);
  // The asset side persists like the page's shared cache does.
  const assets = new AssetManager(stubApp);
  void assets.onInit();
  const silent = new SilentPageManager(stubApp);

  // The engine's output reaches the real managers through the router
  // `Application` uses, which answers every request back to the CURRENT game.
  // A game connects to its own page end, so each game gets a router.
  const makeRouter = () =>
    new MessageRouter(
      () => [ui, assets, silent],
      (message) => game.connection.receive(cloneMessage(message)),
    );
  let router = makeRouter();
  const sendToConsumer = (msg: any) => {
    router.receive(cloneMessage(msg));
  };

  if (opts?.loadCheckpoint) {
    game.load(opts.loadCheckpoint);
  }
  const ready = game.connect(sendToConsumer).then(() => flushMicrotasks(10));

  return {
    get game() {
      return game;
    },
    get ui() {
      return ui;
    },
    get router() {
      return router;
    },
    overlay,
    ready,
    preview(line = startLine) {
      return game.preview(MAIN_URI, line);
    },
    /**
     * Model a live-preview EDIT: compile `newSource`, build a fresh game, and
     * render it into the SAME overlay through the SAME (persistent) UIManager —
     * exactly what `GamePlayerController.updatePreview` does, minus pixi. The
     * reconcile (the connect's `ui/reconcile-begin` → reuse-by-id → the game's
     * `ui/reconcile-sweep`) runs, so the overlay is patched in place rather than
     * rebuilt. Returns once settled.
     */
    async rerender(newSource: string, line = startLine) {
      const newProgram = compile(newSource);
      game = makeGame(newProgram);
      router = makeRouter();
      // Faithfully model GamePlayerController.buildApp on an edit: the OLD
      // manager is disposed (which now PRESERVES the overlay DOM, only tearing
      // down listeners), a FRESH manager is built, and its onInit adopts the
      // preserved DOM (beginReconcilePass). The fresh manager has no in-memory
      // caches — anything reused-without-rework must ride state stored on the
      // preserved nodes themselves. Then the stream reuses unchanged nodes and
      // the tail is swept.
      ui.onDispose();
      ui = new UIManager(stubApp);
      await ui.onInit();
      await game.connect(sendToConsumer);
      await flushMicrotasks(10);
      await game.preview(MAIN_URI, line);
      await flushMicrotasks(10);
      game.module.ui.sweepReconcile();
      await flushMicrotasks(10);
    },
    jumpTo(path: string) {
      (game as any).jumpToPath(path);
    },
    nextBeat() {
      const interpreter: any = game.module.interpreter;
      const story: any = game.story;
      let guard = 0;
      while (story.canContinue && !interpreter.shouldFlush() && guard < 1000) {
        story.ContinueAsync();
        // Mirror Game's continue loop: the step's tables, choices and ordered
        // text make its beat, and a completed continue that shows nothing
        // makes no beat, so the loop continues past it.
        if (story.asyncContinueComplete && story.continueShowedSomething) {
          interpreter.queue(
            story.currentDisplayInstructions,
            story.currentChoices.map((c: any) => c.text),
            story.currentText || "",
          );
        }
        guard++;
      }
      return interpreter.flush();
    },
    async display(instructions: Instructions, instant: boolean) {
      const uiMod = game.module.ui;
      if (instructions.choices) {
        const choiceTargets = instructions.choices;
        choiceTargets.forEach((target, index) => {
          const handleClick = (): void => {
            uiMod.text.clearAll(choiceTargets);
            uiMod.image.clearAll(choiceTargets);
            uiMod.unobserve("click", target);
            uiMod.hideAll(choiceTargets);
            game.chosePathToContinue(index);
          };
          uiMod.observe("click", target, handleClick);
        });
      }
      if (instructions.text) {
        await Promise.all(
          Object.entries(instructions.text).map(([target, events]) =>
            uiMod.text.write(target, events as any, instant),
          ),
        );
      }
      if (instructions.image) {
        await Promise.all(
          Object.entries(instructions.image).map(([target, events]) =>
            uiMod.image.write(target, events as any, instant),
          ),
        );
      }
      await flushMicrotasks(10);
    },
    snapshotDOM() {
      return serializeDOM(overlay);
    },
  };
}

export async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// DOM serialization (id-normalized, stable)
// ---------------------------------------------------------------------------

interface DOMNode {
  tag: string;
  id?: string;
  class?: string;
  attrs?: Record<string, string>;
  style?: string;
  text?: string;
  children?: DOMNode[];
}

const ELEMENT_ID_RE = /e-[0-9A-Za-z]{6,}/g;

export function serializeDOM(root: HTMLElement): DOMNode {
  const idMap = new Map<string, string>();
  const mapId = (id: string) => {
    let mapped = idMap.get(id);
    if (!mapped) {
      mapped = `e-${idMap.size + 1}`;
      idMap.set(id, mapped);
    }
    return mapped;
  };
  const normIds = (s: string) => s.replace(ELEMENT_ID_RE, (m) => mapId(m));

  const walk = (el: Element): DOMNode => {
    const node: DOMNode = { tag: el.tagName.toLowerCase() };
    // [Layer 1] Element ids are a non-visible implementation detail (and D14
    // stops minting them on consumer-built text spans). Id-assignment behavior
    // is covered by the Layer 2 message snapshots, so this visible-DOM oracle
    // omits ids — leaving structure + class + attrs + text + style.
    const className = el.getAttribute("class");
    if (className) {
      node.class = className;
    }
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      if (
        attr.name === "id" ||
        attr.name === "class" ||
        attr.name === "style"
      ) {
        continue;
      }
      attrs[attr.name] = normIds(attr.value);
    }
    if (Object.keys(attrs).length > 0) {
      node.attrs = attrs;
    }
    const inlineStyle = el.getAttribute("style");
    if (inlineStyle) {
      node.style = inlineStyle;
    }
    const children = Array.from(el.children);
    if (children.length > 0) {
      node.children = children.map(walk);
    } else {
      const text = el.textContent ?? "";
      if (text) {
        node.text = text;
      }
    }
    return node;
  };

  // First normalize element-id assignment in creation order: walk once
  // assigning ids in document order (depth-first), which matches the order the
  // engine created them.
  return walk(root);
}
