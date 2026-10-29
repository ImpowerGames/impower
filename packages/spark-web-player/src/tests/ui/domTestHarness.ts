import { JSDOM, VirtualConsole } from "jsdom";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { writeBeatText } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { Instructions } from "@impower/spark-engine/src/game/core/types/Instructions";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
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
  router: MessageRouter;
  overlay: HTMLElement;
  ready: Promise<void>;
  preview(line?: number): Promise<ProgramAddress | null>;
  rerender(
    newSource: string,
    line?: number,
    opts?: { afterConnect?: () => void; connectOnly?: boolean },
  ): Promise<void>;
  jumpTo(flow: string): void;
  nextBeat(): Instructions | undefined;
  display(instructions: Instructions, instant: boolean): Promise<void>;
  snapshotDOM(): unknown;
}

export function compile(source: string, files: Record<string, unknown>[] = []) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
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
      ...files,
    ] as any,
  });
  const result = compiler.compile({ textDocument: { uri: MAIN_URI } });
  if (!result.program.chunks) {
    const errors = Object.values(result.program.diagnostics ?? {})
      .flat()
      .filter((d) => d.severity === 1)
      .map((d) => `${d.range.start.line}: ${typeof d.message === "string" ? d.message : d.message.value}`);
    throw new Error(`DOM fixture made no program: ${errors.join("; ")}`);
  }
  return result.program;
}

function installWAAPIStub(win: any) {
  if (typeof win.Animation === "undefined") {
    win.Animation = class {
      startTime: number | null = null;
      finished = Promise.resolve(this);
      constructor(public effect?: unknown) {}
      play() {}
      cancel() {}
      finish() {}
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

export function installJSDOM() {
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
  g.HTMLInputElement = win.HTMLInputElement;
  g.HTMLSelectElement = win.HTMLSelectElement;
  g.Element = win.Element;
  g.Node = win.Node;
  g.Animation = win.Animation;
  g.KeyframeEffect = win.KeyframeEffect;
  g.FontFace = win.FontFace ?? class {};
  g.CSS = win.CSS;
  const overlay = win.document.getElementById("overlay") as HTMLElement;
  const restore = () => {
    for (const [name, value] of previous) {
      g[name] = value;
    }
  };
  return { win, overlay, restore };
}

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

export function createStubApp(
  overlay: HTMLElement,
  emit: (message: any) => void,
  createImage: () => ImageTarget = () => createFakeImage(),
): any {
  return {
    overlay,
    emit,
    assetCache: new AssetCache({ createImage }),
    audioClock: new AudioClock(0, () => 0),
    audio: {
      decodeAudioBuffer: async () => null,
      playingKeys: () => [],
    },
  };
}

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
    compose?: boolean;
    autoOpenAll?: boolean;
    loadCheckpoint?: string;
    afterEachMessage?: (message: any) => void;
    files?: Record<string, unknown>[];
  },
): DOMHarness {
  const files = opts?.files;
  const program = compile(source, files);
  const { overlay } = installJSDOM();

  const pendingTimers: Array<{ fn: Function; args: any[] }> = [];

  const makeGame = (prog: any) => {
    const g = new Game({
      program: prog,
      previewFrom: { file: MAIN_URI, line: startLine },
      composeBeats: opts?.compose,
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
    if (opts?.reactive) {
      (g.module.ui as any)._reactive = true;
    }
    (g.module.ui as any)._autoOpenAll = opts?.autoOpenAll ?? true;
    return g;
  };

  let game = makeGame(program);

  const stubApp = createStubApp(overlay, (message) => {
    game.connection.receive(cloneMessage(message));
  });
  stubApp.answer = (message: any, work: Promise<any>) => router.answer(message, work);

  let ui = new UIManager(stubApp);
  const assets = new AssetManager(stubApp);
  void assets.onInit();
  const silent = new SilentPageManager(stubApp);

  const makeRouter = () =>
    new MessageRouter(
      () => [ui, assets, silent],
      (message) => game.connection.receive(cloneMessage(message)),
    );
  let router = makeRouter();
  const sendToConsumer = (msg: any) => {
    router.receive(cloneMessage(msg));
    opts?.afterEachMessage?.(msg);
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
    async rerender(newSource: string, line = startLine, opts) {
      const newProgram = compile(newSource, files);
      game = makeGame(newProgram);
      router = makeRouter();
      ui.onDispose();
      ui = new UIManager(stubApp);
      await ui.onInit();
      await game.connect(sendToConsumer);
      await flushMicrotasks(10);
      opts?.afterConnect?.();
      if (opts?.connectOnly) {
        return;
      }
      await game.preview(MAIN_URI, line);
      await flushMicrotasks(10);
      game.module.ui.sweepReconcile();
      await flushMicrotasks(10);
    },
    jumpTo(flow: string) {
      game.jumpToFlow(flow);
    },
    nextBeat() {
      const interpreter: any = game.module.interpreter;
      const story: any = game.story;
      let guard = 0;
      while (story.canContinue && !interpreter.shouldFlush() && guard < 1000) {
        story.ContinueAsync();
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
      await Promise.all(writeBeatText(uiMod, instructions, instant));
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

export async function untilShown(overlay: HTMLElement): Promise<void> {
  await flushMicrotasks(10);
  for (let i = 0; i < 200 && (overlay as any).__sdBeat != null; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await flushMicrotasks(10);
}

export async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

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

  return walk(root);
}
