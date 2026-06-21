// Headless harness for exercising the engine-side Debug Adapter Protocol
// surface (breakpoints / stepping / stack / variables / evaluate) WITHOUT any
// front-end. It compiles a `.sd` source string through the real
// `SparkdownCompiler`, constructs a real `Game` (the same class both
// vscode-sparkdown and impower-dev drive via GamePlayerController), and lets a
// test drive its public debug methods directly.
//
// This is the ground-truth oracle for the Phase 1 variable-layer rewrite: the
// post-luau runtime changed how variables/scopes are stored, so these tests
// capture what the debug API actually returns today and lock in the corrected
// behavior as we fix it.

import { Message } from "@impower/jsonrpc/src/common/types/Message";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";

export interface DebugGameHarness {
  game: Game;
  /** The in-memory URI the source was compiled under (also a `program.scripts` key). */
  uri: string;
  /** Every notification/request the game emitted on its outgoing connection. */
  outgoing: Message[];
  /** Outgoing messages whose method ends with the given suffix (e.g. "hitBreakpoint"). */
  messagesOfMethod(suffix: string): Message[];
}

/**
 * Compile `source` and build a debug-ready `Game`.
 *
 * `now` is pinned to 0 and `executionTimeout` is effectively infinite so the
 * deterministic step loop never trips the "possible infinite loop" guard during
 * a (synchronous) test run.
 */
export function createDebugGame(
  source: string,
  uri = "inmemory:///main.sd",
): DebugGameHarness {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });

  const result = compiler.compile({ textDocument: { uri } });
  const program = result.program;
  if (!program.compiled) {
    const diagnostics = JSON.stringify(program.diagnostics ?? {}, null, 2);
    throw new Error(
      `Sparkdown compilation produced no runnable output.\nDiagnostics:\n${diagnostics}`,
    );
  }

  const game = new Game({
    program,
    now: () => 0,
    executionTimeout: Number.MAX_SAFE_INTEGER,
    // No-op timer: the interaction Coordinator schedules auto-advance via
    // system.setTimeout. A no-op keeps a paused debug session fully
    // synchronous/deterministic (no auto-advance fires mid-assert) while still
    // letting display-bearing programs construct a Coordinator without throwing.
    setTimeout: (() => 0) as never,
  });

  const outgoing: Message[] = [];
  game.connection.outgoing.addListener("*", (msg) => {
    outgoing.push(msg);
  });

  return {
    game,
    uri,
    outgoing,
    messagesOfMethod: (suffix: string) =>
      outgoing.filter((m) => m.method?.endsWith(suffix)),
  };
}
