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
// `emit`. The Web Animations API (`new Animation`, `KeyframeEffect`) that
// `AnimationPlayer.play()` needs is absent in jsdom, so we install a tiny
// no-op stub — reveal animations apply opacity via WAAPI (invisible to jsdom's
// computed styles regardless), so stubbing them does not change the snapshot.

import { JSDOM, VirtualConsole } from "jsdom";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { Instructions } from "@impower/spark-engine/src/game/core/types/Instructions";
import UIManager from "../../app/managers/UIManager";

const MAIN_URI = "inmemory:///main.sd";

export interface DOMHarness {
  game: Game;
  ui: UIManager;
  overlay: HTMLElement;
  ready: Promise<void>;
  preview(line?: number): void;
  /** Re-render a (possibly edited) source into the same overlay via the same
   *  reconciling UIManager — models a live-preview edit. */
  rerender(newSource: string, line?: number): Promise<void>;
  jumpTo(path: string): void;
  nextBeat(): Instructions | undefined;
  display(instructions: Instructions, instant: boolean): Promise<void>;
  /** Serialize the overlay DOM into a stable, id-normalized tree snapshot. */
  snapshotDOM(): unknown;
}

function compile(source: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    // Builtins come from the implicitly-imported builtins prelude (the compiler
    // default), exactly like the production player.
    useBuiltinsPrelude: true,
    // The DOM goldens guard the PRODUCTION render path, which lowers display
    // statements to native `display(<table>)` calls (the editor enables this).
    experimentalDisplayCalls: true,
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
          (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002d)
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

export function createDOMHarness(
  source: string,
  startLine = 0,
  opts?: { reactive?: boolean; autoOpenAll?: boolean },
): DOMHarness {
  const program = compile(source);

  // Fresh jsdom per harness for isolation. Bind its globals (document,
  // Animation, KeyframeEffect, …) so the consumer's `document.createElement`
  // and AnimationPlayer resolve.
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

  const makeGame = (prog: any) => {
    const g = new Game({
      program: prog,
      previewFrom: { file: MAIN_URI, line: startLine },
      now: () => 0,
      setTimeout: ((fn: Function, _ms?: number, ...args: any[]) => {
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
  const stubApp: any = {
    overlay,
    emit: (message: any) => {
      game.connection.receive(message);
    },
  };

  const ui = new UIManager(stubApp);

  // Wire the engine's output straight into the real consumer: every emitted
  // request is handed to `UIManager.onReceiveRequest`, and the response is fed
  // back so the engine's awaited promises (ui/animate, …) resolve.
  const sendToConsumer = (msg: any) => {
    if (msg && typeof msg === "object" && "id" in msg && "params" in msg) {
      // Deferred: the emitter registers its resolve callback after send().
      void ui.onReceiveRequest(msg).then((response) => {
        queueMicrotask(() => {
          game.connection.receive({
            jsonrpc: "2.0",
            id: msg.id,
            method: msg.method,
            ...(response ?? { result: null }),
          } as any);
        });
      });
    }
  };

  const ready = game.connect(sendToConsumer).then(() => flushMicrotasks(10));

  return {
    get game() {
      return game;
    },
    ui,
    overlay,
    ready,
    preview(line = startLine) {
      game.preview(MAIN_URI, line);
    },
    /**
     * Model a live-preview EDIT: compile `newSource`, build a fresh game, and
     * render it into the SAME overlay through the SAME (persistent) UIManager —
     * exactly what `GamePlayerController.updatePreview` does, minus pixi. The
     * reconcile (beginReconcilePass → reuse-by-id → sweepReconcile) runs, so the
     * overlay is patched in place rather than rebuilt. Returns once settled.
     */
    async rerender(newSource: string, line = startLine) {
      const newProgram = compile(newSource);
      game = makeGame(newProgram);
      // The player's updatePreview path: previous DOM is preserved, the new
      // render adopts it, the stream reuses unchanged nodes, then the tail is
      // swept.
      ui.beginReconcilePass();
      await game.connect(sendToConsumer);
      await flushMicrotasks(10);
      game.preview(MAIN_URI, line);
      await flushMicrotasks(10);
      ui.sweepReconcile();
    },
    jumpTo(path: string) {
      (game as any).jumpToPath(path);
    },
    nextBeat() {
      const interpreter: any = game.module.interpreter;
      const story: any = game.story;
      let guard = 0;
      while (story.canContinue && !interpreter.shouldFlush() && guard < 1000) {
        story.ContinueAsync(Infinity);
        if (story.asyncContinueComplete) {
          const choices = story.currentChoices.map((c: any) => c.text);
          // Mirror Game's continue loop: a `display(<table>)` beat routes its
          // pre-parsed instructions via queueInstructions; a normal text beat
          // takes the legacy queue() path.
          const displayInstructions = story.currentDisplayInstructions;
          if (displayInstructions.length > 0) {
            interpreter.queueInstructions(displayInstructions, choices);
          } else {
            interpreter.queue(
              story.currentText || "",
              choices,
              // Pass the beat's routing tags, exactly as Game's continue loop does.
              story.currentTags || [],
            );
          }
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
  const normIds = (s: string) =>
    s.replace(ELEMENT_ID_RE, (m) => mapId(m));

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
      if (attr.name === "id" || attr.name === "class" || attr.name === "style") {
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
