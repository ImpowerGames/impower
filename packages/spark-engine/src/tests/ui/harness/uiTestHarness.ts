import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { writeBeatText } from "../../../game/core/classes/Coordinator";
import { Game } from "../../../game/core/classes/Game";
import type { Instructions } from "../../../game/core/types/Instructions";
import { BEAT_LEAD_MS } from "../../../game/core/utils/sharedClock";
import {
  assetItemKey,
  type AssetItem,
} from "../../../game/modules/assets/types/AssetItem";
import { cloneMessage } from "../../harness/cloneMessage";

export const MAIN_URI = "inmemory:///main.sd";

export interface UIHarness {
  game: Game;
  readonly messages: any[];
  ready: Promise<void>;
  reset(): void;
  preview(line?: number): Promise<ProgramAddress | null>;
  reconnect(): Promise<void>;
  jumpTo(address: ProgramAddress): void;
  jumpToFlow(flow: string): void;
  nextBeat(): Instructions | undefined;
  display(instructions: Instructions, instant: boolean): Promise<void>;
  emitEvent(type: string, elementId: string, extra?: Record<string, unknown>): void;
  observedElementIds(): string[];
  snapshot(): unknown[];
  snapshotFiltered(prefix: string): unknown[];
  snapshotWire(prefix: string): unknown[];
  timerDelays(): number[];
  flushTimers(): void;
  releaseAssets(pin?: string): number;
  heldAssetLoadCount(): number;
}

export function compileUI(
  source: string,
  opts?: {
    seedBuiltinsIntoStory?: boolean;
    assets?: File[];
    scripts?: Record<string, string>;
  },
) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: opts?.seedBuiltinsIntoStory ?? true,
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
      ...Object.entries(opts?.scripts ?? {}).map(([uri, text]) => ({
        uri,
        type: "script",
        name: uri.split("/").pop()!.replace(/\.sd$/, ""),
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      })),
      ...(opts?.assets ?? []),
    ],
  });
  const result = compiler.compile({ textDocument: { uri: MAIN_URI } });
  const errors: string[] = [];
  for (const docDiags of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiags as any[]) {
      if (d?.severity === 1 || d?.severity == null) {
        const msg =
          typeof d?.message === "string"
            ? d.message
            : (d?.message?.value ?? JSON.stringify(d));
        errors.push(msg);
      }
    }
  }
  if (!result.program.chunks) {
    throw new Error(
      "UI fixture failed to compile:\n  " + (errors.join("\n  ") || "(none)"),
    );
  }
  return { program: result.program, errors };
}

function resultForMethod(method: string, params?: any): unknown {
  switch (method) {
    case "ui/animate":
      return [];
    case "audio/load":
      return params;
    case "audio/update":
      return [];
    case "assets/load": {
      const keys = ((params?.items ?? []) as AssetItem[]).map(assetItemKey);
      return { loaded: keys, failed: [], pinned: keys };
    }
    default:
      return "";
  }
}

export function createHarness(
  source: string,
  startLine = 0,
  opts?: {
    reactive?: boolean;
    autoOpenAll?: boolean;
    staticFallback?: boolean;
    loadCheckpoint?: string;
    beforeConnect?: (game: Game) => void;
    connect?: boolean;
    holdAssets?: boolean;
    assets?: File[];
    scripts?: Record<string, string>;
  },
): UIHarness {
  const { program } = compileUI(source, {
    assets: opts?.assets,
    scripts: opts?.scripts,
  });
  if (opts?.staticFallback) {
    delete (program as any).sparkle;
  }
  const messages: any[] = [];

  const pendingTimers: Array<{ fn: Function; args: any[]; ms: number }> = [];

  const game = new Game({
    program: program as any,
    previewFrom: { file: MAIN_URI, line: startLine },
    now: () => 0,
    setTimeout: ((fn: Function, ms?: number, ...args: any[]) => {
      if (ms != null && ms > 0) {
        pendingTimers.push({ fn, args, ms });
        return pendingTimers.length;
      }
      fn(...args);
      return 0;
    }) as any,
  } as any);

  (game.module.ui as any)._autoOpenAll = opts?.autoOpenAll ?? true;

  opts?.beforeConnect?.(game);

  if (opts?.loadCheckpoint) {
    game.load(opts.loadCheckpoint);
  }

  const heldAssetLoads: any[] = [];

  const reply = (msg: any) => {
    const result = resultForMethod(msg.method, msg.params);
    queueMicrotask(() => {
      game.connection.receive(
        cloneMessage({
          jsonrpc: "2.0",
          id: msg.id,
          method: msg.method,
          result,
        }),
      );
    });
  };

  const respond = (sent: any) => {
    const msg = cloneMessage(sent);
    messages.push(msg);
    if (msg && typeof msg === "object" && "id" in msg && "params" in msg) {
      if (opts?.holdAssets && msg.method === "assets/load") {
        heldAssetLoads.push(msg);
        return;
      }
      reply(msg);
    }
  };

  let connected: Promise<void> | null = null;
  const ensureConnected = () => {
    if (!connected) {
      connected = game.connect(respond);
    }
    return connected;
  };

  const ready =
    opts?.connect === false
      ? Promise.resolve()
      : ensureConnected().then(() => flushMicrotasks(10));

  const harness: UIHarness = {
    game,
    messages,
    ready,
    reset() {
      messages.length = 0;
    },
    preview(line = startLine) {
      return game.preview(MAIN_URI, line);
    },
    reconnect() {
      return game.connect(respond);
    },
    jumpTo(address: ProgramAddress) {
      game.jumpTo(address);
    },
    jumpToFlow(flow: string) {
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
      if (!instructions) {
        throw new Error("display() called with no instructions (empty beat?)");
      }
      const ui = game.module.ui;
      const audio = game.module.audio;
      const time = instant
        ? undefined
        : game.context.system.now() + BEAT_LEAD_MS;
      const audioTriggerIds: number[] = [];
      if (!instant && instructions.audio) {
        for (const [target, events] of Object.entries(instructions.audio)) {
          audioTriggerIds.push(audio.schedule(target, events as any));
        }
      }
      if (instructions.choices) {
        const choiceTargets = instructions.choices;
        choiceTargets.forEach((target, index) => {
          const handleClick = (): void => {
            ui.text.clearAll(choiceTargets);
            ui.image.clearAll(choiceTargets);
            ui.unobserve("click", target);
            ui.hideAll(choiceTargets);
            game.chosePathToContinue(index);
          };
          ui.observe("click", target, handleClick);
        });
      }
      await Promise.all(writeBeatText(ui, instructions, instant, time));
      if (instructions.image) {
        await Promise.all(
          Object.entries(instructions.image).map(([target, events]) =>
            ui.image.write(target, events as any, instant, time),
          ),
        );
      }
      if (instructions.layout) {
        await Promise.all(
          Object.values(instructions.layout).map((events) =>
            ui.applyLayoutInstructions(events as any, instant),
          ),
        );
      }
      ui.refreshLayouts();
      if (audioTriggerIds.length > 0) {
        await flushMicrotasks(10);
        audio.triggerAll(audioTriggerIds, time);
      }
    },
    emitEvent(type: string, elementId: string, extra?: Record<string, unknown>) {
      game.connection.receive(
        cloneMessage({
          jsonrpc: "2.0",
          method: "event",
          params: { type, currentTargetId: elementId, ...extra },
        } as any),
      );
    },
    observedElementIds() {
      return flattenMessages(messages)
        .filter((m) => m.method === "ui/observe")
        .map((m) => m.params.element as string);
    },
    snapshot() {
      return normalizeMessages(messages);
    },
    snapshotFiltered(prefix: string) {
      return normalizeMessages(
        flattenMessages(messages).filter((m) => m.method?.startsWith(prefix)),
      );
    },
    snapshotWire(prefix: string) {
      return normalizeMessages(
        messages.filter((m) => m.method?.startsWith(prefix)),
      );
    },
    timerDelays(): number[] {
      return pendingTimers.map((t) => t.ms);
    },
    flushTimers() {
      const due = pendingTimers.splice(0, pendingTimers.length);
      for (const { fn, args } of due) {
        fn(...args);
      }
    },
    releaseAssets(pin?: string) {
      const held = heldAssetLoads.filter(
        (msg) => pin === undefined || msg.params?.pin === pin,
      );
      for (const msg of held) {
        heldAssetLoads.splice(heldAssetLoads.indexOf(msg), 1);
      }
      for (const msg of held) {
        reply(msg);
      }
      return held.length;
    },
    heldAssetLoadCount() {
      return heldAssetLoads.length;
    },
  };

  return harness;
}

export async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

const REGEX_META_RE = /[.*+?^${}()|[\]\\]/g;
const escapeRegExp = (s: string): string => s.replace(REGEX_META_RE, "\\$&");

const ID_BEARING_KEYS = new Set(["element", "parent", "before"]);
function collectElementIds(messages: any[]): string[] {
  const ids = new Set<string>();
  const visit = (value: any, key?: string): void => {
    if (typeof value === "string") {
      if (key && ID_BEARING_KEYS.has(key) && value) {
        ids.add(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        visit(v, key);
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        visit(v, k);
      }
    }
  };
  visit(messages);
  return [...ids].sort((a, b) => b.length - a.length);
}

export function normalizeMessages(messages: any[]): unknown[] {
  const elementIds = new Map<string, string>();
  const requestIds = new Map<string, string>();

  const mapElementId = (id: string): string => {
    let mapped = elementIds.get(id);
    if (!mapped) {
      mapped = `e-${elementIds.size + 1}`;
      elementIds.set(id, mapped);
    }
    return mapped;
  };
  const mapRequestId = (id: string): string => {
    let mapped = requestIds.get(id);
    if (!mapped) {
      mapped = `req-${requestIds.size + 1}`;
      requestIds.set(id, mapped);
    }
    return mapped;
  };

  const idTokens = collectElementIds(messages);
  const elementIdRe =
    idTokens.length > 0
      ? new RegExp(
          `(?<![\\w-])(?:${idTokens.map(escapeRegExp).join("|")})(?![\\w-])`,
          "g",
        )
      : null;

  const normalizeValue = (value: any): any => {
    if (typeof value === "string") {
      if (elementIdRe) {
        return value.replace(elementIdRe, (m) => mapElementId(m));
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(normalizeValue);
    }
    if (value && typeof value === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = normalizeValue(v);
      }
      return out;
    }
    return value;
  };

  const normalizeOne = (m: any): any => {
    const out: any = { method: m.method };
    if ("id" in m && m.id != null) {
      out.id = typeof m.id === "string" ? mapRequestId(m.id) : m.id;
    }
    if ("params" in m) {
      out.kind = "id" in m ? "request" : "notification";
      if (
        m.method === "ui/batch" &&
        m.params &&
        Array.isArray(m.params.messages)
      ) {
        out.params = { messages: m.params.messages.map(normalizeOne) };
      } else {
        out.params = normalizeValue(m.params);
      }
    } else {
      out.kind = "notification";
    }
    if ("result" in m) {
      out.result = normalizeValue(m.result);
    }
    return out;
  };
  return messages.map(normalizeOne);
}

export function flattenMessages(messages: any[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m && m.method === "ui/batch" && Array.isArray(m.params?.messages)) {
      out.push(...m.params.messages);
    } else {
      out.push(m);
    }
  }
  return out;
}
