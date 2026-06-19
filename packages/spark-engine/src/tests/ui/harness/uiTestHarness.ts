// UI message-stream golden-master harness (Layer 2).
//
// Drives the real engine through representative Sparkle UI scenarios and
// captures the *exact ordered sequence of JSON-RPC messages* the engine
// emits to its renderer (ui/create, ui/update, ui/animate, ui/observe,
// ui/unobserve, ui/destroy, audio/*, etc). The captured stream is the
// golden baseline: upcoming reactivity refactors that relocate the
// engine→consumer boundary must keep emitting an equivalent stream.
//
// How it drives (faithful path, see docs/sparkle/reactive-sparkle-spec.md §9):
//   1. Compile a tiny `.sd` through the real `SparkdownCompiler`, which pulls in
//      the implicitly-imported builtins prelude exactly like the production
//      player (so config/breakpoints/animations/typewriter/transitions are
//      present).
//   2. Construct a real `Game` (which instantiates the real `UIModule`,
//      `AudioModule`, `InterpreterModule`, …) and `connect()` it to a mock
//      Connection that records every emitted message and replies to requests.
//   3. Build the screen tree with `game.preview(...)` (the real, instant
//      screen-construction path) and/or drive individual beats through the
//      same fan-out the `Coordinator.display()` performs
//      (`ui.text.write` / `ui.image.write` / `audio.schedule` / `ui.observe`),
//      feeding the *real* `Instructions` the interpreter produced.
//
// Determinism: element ids are STRUCTURAL (`e-<path>`, derived from the screen
// tree's tag.classes — see UIModule.generateId) and request ids are uuids.
// `normalizeMessages` rewrites every real element id to `e-1, e-2, …` and every
// request id to `req-1, req-2, …` in first-seen order, so snapshots are
// byte-stable. Time inputs are pinned (`now: () => 0`, synchronous
// `setTimeout`).

import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../../game/core/classes/Game";
import type { Instructions } from "../../../game/core/types/Instructions";

const MAIN_URI = "inmemory:///main.sd";

export interface UIHarness {
  game: Game;
  /** Every message emitted by the engine, in order. */
  readonly messages: any[];
  /** Resolves once `connect()` has fully settled (onConnected screen/style
   *  construction + restore mixer config + all deferred request responses).
   *  Await this before `reset()` so connect-time noise is captured/dropped
   *  deterministically rather than racing into a later snapshot. */
  ready: Promise<void>;
  /** Clear the captured-message buffer (e.g. after preview screen setup). */
  reset(): void;
  /** Build the screen tree + reveal at a path (the real instant preview). */
  preview(line?: number): void;
  /** Reset the story to a path so subsequent `nextBeat()` calls start there.
   *  (The screen tree is already built by `connect()`'s onConnected.) */
  jumpTo(path: string): void;
  /** Run one story beat and return the real interpreter `Instructions`. */
  nextBeat(): Instructions | undefined;
  /** Fan a beat's text/image/audio out through the real module methods,
   *  exactly as `Coordinator.display()` does. */
  display(instructions: Instructions, instant: boolean): Promise<void>;
  /** Simulate a renderer-side DOM event firing on an observed element, by
   *  feeding an EventMessage notification back into the engine (the round-trip
   *  the real `UIManager` performs on a click). */
  emitEvent(type: string, elementId: string, extra?: Record<string, unknown>): void;
  /** Ids minted for `ui/observe` targets (in order), so tests can address an
   *  observed element for `emitEvent` without scraping the raw stream. */
  observedElementIds(): string[];
  /** Snapshot-ready, id-normalized view of the captured stream. */
  snapshot(): unknown[];
  /** Snapshot-ready, id-normalized view filtered to a method prefix. */
  snapshotFiltered(prefix: string): unknown[];
}

// The golden-master compiles the builtins .sd PRELUDE into the program (which
// populates both program.context and the runtime __def tables) — the production
// engine path.
export function compileUI(
  source: string,
  opts?: { experimentalDisplayCalls?: boolean },
) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    experimentalDisplayCalls: opts?.experimentalDisplayCalls ?? false,
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
  if (!result.program.compiled) {
    throw new Error(
      "UI fixture failed to compile:\n  " + (errors.join("\n  ") || "(none)"),
    );
  }
  return { program: result.program, errors };
}

/** Method-appropriate stub result so the engine's awaited request promises
 *  resolve. The values mirror what the real consumer returns (see UIManager
 *  / AudioManager), but only their *presence* matters for the engine. */
function resultForMethod(method: string): unknown {
  switch (method) {
    case "ui/animate":
      return [];
    case "audio/load":
      return { outputLatency: 0 };
    case "audio/update":
      return [];
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
    experimentalDisplayCalls?: boolean;
  },
): UIHarness {
  const { program } = compileUI(source, {
    // Display goldens guard the PRODUCTION path, which renders via display()
    // (the editor enables `experimentalDisplayCalls`). Default on here so the
    // characterization net tracks production; a test can still pass `false` to
    // exercise the legacy routing-tag path (e.g. displayCallParity).
    experimentalDisplayCalls: opts?.experimentalDisplayCalls ?? true,
  });
  const messages: any[] = [];

  const game = new Game({
    program: program as any,
    previewFrom: { file: MAIN_URI, line: startLine },
    now: () => 0,
    // Synchronous: the Coordinator's audio-latency setTimeout fires inline,
    // removing the only source of real-time flakiness.
    setTimeout: ((fn: Function, _ms?: number, ...args: any[]) => {
      fn(...args);
      return 0;
    }) as any,
  } as any);

  // Reactive screens are the only render path now (set in onConnected), so the
  // `reactive` opt is accepted for back-compat but no longer needed. Test
  // convenience: auto-mount EVERY screen at connect (instant) so tests keep their
  // "screen is mounted at connect" assumption — production only auto-opens
  // `main`; a test exercising the real [[open/close]] lifecycle passes
  // `autoOpenAll: false`.
  (game.module.ui as any)._autoOpenAll = opts?.autoOpenAll ?? true;

  const respond = (msg: any) => {
    messages.push(msg);
    if (msg && typeof msg === "object" && "id" in msg && "params" in msg) {
      const result = resultForMethod(msg.method);
      // Defer: `Connection.emitRequest` calls send() (this callback) BEFORE it
      // registers its resolve callback, so a synchronous reply would be
      // dropped. A microtask lets the emitter finish registering first.
      queueMicrotask(() => {
        game.connection.receive({
          jsonrpc: "2.0",
          id: msg.id,
          method: msg.method,
          result,
        });
      });
    }
  };

  let connected: Promise<void> | null = null;
  const ensureConnected = () => {
    if (!connected) {
      connected = game.connect(respond);
    }
    return connected;
  };

  // Connect eagerly (kicks off onConnected screen/style construction +
  // restore). `ready` resolves only after the whole chain — including the
  // deferred request responses it awaits — has drained.
  const ready = ensureConnected().then(() => flushMicrotasks(10));

  const harness: UIHarness = {
    game,
    messages,
    ready,
    reset() {
      messages.length = 0;
    },
    preview(line = startLine) {
      game.preview(MAIN_URI, line);
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
      if (!instructions) {
        throw new Error("display() called with no instructions (empty beat?)");
      }
      const ui = game.module.ui;
      const audio = game.module.audio;
      // Mirror Coordinator.display()'s fan-out order. Audio is scheduled, then
      // (once loaded) triggered — `audio/update` only emits on trigger, so we
      // trigger after the loads settle, exactly as the Coordinator's tick does.
      const audioTriggerIds: number[] = [];
      if (!instant && instructions.audio) {
        for (const [target, events] of Object.entries(instructions.audio)) {
          audioTriggerIds.push(audio.schedule(target, events as any));
        }
      }
      if (instructions.choices) {
        const choiceTargets = instructions.choices;
        choiceTargets.forEach((target, index) => {
          // Mirror Coordinator.display()'s real choice handler so a click
          // EventMessage round-trips into chosePathToContinue(index).
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
      if (instructions.text) {
        await Promise.all(
          Object.entries(instructions.text).map(([target, events]) =>
            ui.text.write(target, events as any, instant),
          ),
        );
      }
      if (instructions.image) {
        await Promise.all(
          Object.entries(instructions.image).map(([target, events]) =>
            ui.image.write(target, events as any, instant),
          ),
        );
      }
      // Apply [[open/close SCREEN]] lifecycle directives, mirroring
      // Coordinator.display()'s fan-out (mount/destroy + enter/exit transitions).
      if (instructions.screen) {
        await Promise.all(
          Object.values(instructions.screen).map((events) =>
            ui.applyScreenInstructions(events as any, instant),
          ),
        );
      }
      // Coarse per-turn reactive re-eval, mirroring Coordinator.display()'s
      // updateUI (no-op unless the reactive render path is active).
      ui.refreshScreens();
      // Trigger scheduled audio once its loads have settled (the Coordinator
      // does this from its per-frame tick after `audio.isReady(...)`).
      if (audioTriggerIds.length > 0) {
        await flushMicrotasks(10);
        audio.triggerAll(audioTriggerIds);
      }
    },
    emitEvent(type: string, elementId: string, extra?: Record<string, unknown>) {
      game.connection.receive({
        jsonrpc: "2.0",
        method: "event",
        params: { type, currentTargetId: elementId, ...extra },
      } as any);
    },
    observedElementIds() {
      return messages
        .filter((m) => m.method === "ui/observe")
        .map((m) => m.params.element as string);
    },
    snapshot() {
      return normalizeMessages(messages);
    },
    snapshotFiltered(prefix: string) {
      return normalizeMessages(messages.filter((m) => m.method?.startsWith(prefix)));
    },
  };

  return harness;
}

/** Drain the microtask queue so deferred request-responses are delivered. */
export async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// ID normalization
// ---------------------------------------------------------------------------

const REGEX_META_RE = /[.*+?^${}()|[\]\\]/g;
const escapeRegExp = (s: string): string => s.replace(REGEX_META_RE, "\\$&");

/** The authoritative element ids are the strings that appear in an id-bearing
 *  protocol field (`element`/`parent`/`before`) of ANY message. Element ids are
 *  now STRUCTURAL (e.g. `e-ui-main-div_hud-0`), not a fixed-shape uuid, so they
 *  can't be recognized by a regex — we recognize them by membership in this set
 *  instead. We must scan every message (not just `ui/create`): a captured slice
 *  often starts after connect, so a target the beat only `ui/update`s was
 *  created off-camera and its id appears solely as an `element` ref. */
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
  // Longest-first so the alternation never matches a shorter id that is a prefix
  // of a longer one (e.g. `e-ui-0` inside `e-ui-0-main-0`).
  return [...ids].sort((a, b) => b.length - a.length);
}

/** Rewrite nondeterministic ids to stable counters in first-seen order:
 *  structural element ids → `e-1, e-2, …`; request ids (uuid) → `req-1, …`.
 *  Returns a deep-cloned, stable view safe to snapshot. */
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

  // A single alternation of every real element id, replaced left-to-right so
  // the numbering follows first-seen (= creation) order whether an id appears
  // standalone (`element`/`parent`/`before`) or inline (e.g. a style `url(#…)`).
  // Boundary lookarounds (`[\w-]`) keep an id matching only as a whole token —
  // without them the bare root id `e` would match the `e` inside every word
  // (`none` → `none-1`). Longest-first ordering means a longer id wins over a
  // shorter one sharing its prefix.
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

  return messages.map((m) => {
    const out: any = { method: m.method };
    if ("id" in m && m.id != null) {
      out.id = typeof m.id === "string" ? mapRequestId(m.id) : m.id;
    }
    if ("params" in m) {
      out.kind = "request" in m || "id" in m ? "request" : "notification";
      out.params = normalizeValue(m.params);
    }
    if (!("params" in m)) {
      out.kind = "notification";
    }
    if ("result" in m) {
      out.result = normalizeValue(m.result);
    }
    return out;
  });
}
