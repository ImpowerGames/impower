// The debug hover shows a variable's value while the debugger is stopped
// (#1845): the extension's evaluatable-expression provider names the
// variable, or dotted path, under the cursor, and the debug adapter answers
// a hover on a name the selected frame does not have with an error, so VS
// Code shows the language hover instead of a debug hover reading
// "undefined".
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  provider: null as null | {
    provideEvaluatableExpression: (document: any, position: any) => any;
  },
}));

vi.mock("vscode", () => {
  const disposable = { dispose() {} };
  class Position {
    constructor(
      readonly line: number,
      readonly character: number,
    ) {}
  }
  class Range {
    readonly start: Position;
    readonly end: Position;
    constructor(sl: number, sc: number, el: number, ec: number) {
      this.start = new Position(sl, sc);
      this.end = new Position(el, ec);
    }
    contains(p: Position) {
      return (
        p.line === this.start.line &&
        p.character >= this.start.character &&
        p.character <= this.end.character
      );
    }
  }
  class EvaluatableExpression {
    constructor(
      readonly range: Range,
      readonly expression?: string,
    ) {}
  }
  return {
    Position,
    Range,
    EvaluatableExpression,
    DebugConfigurationProviderTriggerKind: { Initial: 1, Dynamic: 2 },
    commands: { registerCommand: () => disposable },
    debug: {
      registerDebugConfigurationProvider: () => disposable,
      registerDebugAdapterDescriptorFactory: () => disposable,
    },
    languages: {
      registerEvaluatableExpressionProvider: (_: string, provider: any) => {
        state.provider = provider;
        return disposable;
      },
      registerInlineValuesProvider: () => disposable,
    },
    window: {},
    workspace: {},
  };
});

vi.mock("../src/managers/SparkdownDebugManager", () => ({
  SparkdownDebugManager: { activate() {}, instance: {} },
}));

vi.mock("../src/managers/SparkdownPreviewGamePanelManager", () => ({
  SparkdownPreviewGamePanelManager: { instance: {} },
}));

import { activateDebugger } from "../src/debugger/activateDebugger";
import { SparkDebugSession } from "../src/debugger/SparkDebugSession";

const SCRIPT = [
  "scene main", //                0
  "  local n = 1", //             1
  "  stats.health = n + 1", //    2
  "  Start the frame check.", //  3
  "end", //                       4
].join("\n");

/** The text the debug hover evaluates for a hover at `line`, `character`
 *  of `SCRIPT`, or undefined when the provider names nothing there. */
const hoverAt = (line: number, character: number) => {
  if (!state.provider) {
    activateDebugger({ subscriptions: [] } as any, {} as any);
  }
  const lines = SCRIPT.split("\n");
  const document = { lineAt: (l: number) => ({ text: lines[l] ?? "" }) };
  const result = state.provider!.provideEvaluatableExpression(document, {
    line,
    character,
  });
  if (!result) {
    return undefined;
  }
  const { start, end } = result.range;
  return lines[start.line]!.slice(start.character, end.character);
};

describe("the debug hover's expression", () => {
  it("is the variable under the cursor", () => {
    // `n` in `local n = 1`, and in `n + 1`.
    expect(hoverAt(1, 8)).toBe("n");
    expect(hoverAt(2, 17)).toBe("n");
  });

  it("is the dotted path up to the segment under the cursor", () => {
    expect(hoverAt(2, 4)).toBe("stats");
    expect(hoverAt(2, 11)).toBe("stats.health");
  });

  it("is nothing off a name", () => {
    // The space before `local`, and the `=`.
    expect(hoverAt(1, 1)).toBeUndefined();
    expect(hoverAt(1, 10)).toBeUndefined();
  });
});

/** A debug adapter over a game whose evaluation context is `context`,
 *  recording each response it sends. */
const adapter = (context: Record<string, unknown>) => {
  const responses: any[] = [];
  const connection = {
    connectInput() {},
    emit: async (message: { method: string; params: any }) => {
      if (message.method === "game/evaluationContext") {
        return { context };
      }
      if (message.method === "game/variables") {
        const { value } = message.params;
        return {
          variables:
            value === undefined
              ? []
              : [{ name: "", value: String(value), variablesReference: 0 }],
        };
      }
      return {};
    },
  };
  const fileAccessor = {
    isWindows: false,
    uriToPath: (uri: string) => uri.replace("file://", ""),
    pathToUri: (path: string) => `file://${path}`,
    getRootPath: () => undefined,
  };
  const s = new SparkDebugSession(fileAccessor as any, connection as any);
  (s as any).sendResponse = (response: any) => responses.push(response);
  const evaluate = async (expression: string, context: string) => {
    await (s as any).evaluateRequest(
      { seq: 0, type: "response", request_seq: 0, command: "evaluate", success: true },
      { expression, context },
    );
    return responses.at(-1)!;
  };
  return { evaluate };
};

describe("a hover the debug adapter evaluates", () => {
  it("shows the value of a name the frame has", async () => {
    const s = adapter({ n: 1 });
    const response = await s.evaluate("n", "hover");
    expect(response.success).toBe(true);
    expect(response.body.result).toBe("1");
  });

  it("fails for a name the frame does not have, so the language hover shows", async () => {
    const s = adapter({ n: 1 });
    const response = await s.evaluate("local", "hover");
    expect(response.success).toBe(false);
  });

  it("fails for a property every object inherits, which names no variable", async () => {
    const s = adapter({ n: 1, stats: { health: 2 } });
    for (const expression of [
      "__proto__",
      "constructor",
      "toString",
      "stats.constructor",
      "n.toString",
    ]) {
      const response = await s.evaluate(expression, "hover");
      expect(response.success, expression).toBe(false);
    }
    const response = await s.evaluate("stats.health", "hover");
    expect(response.body.result).toBe("2");
  });

  it("still answers undefined in the Debug Console and Watch", async () => {
    const s = adapter({ n: 1 });
    for (const context of ["repl", "watch"]) {
      const response = await s.evaluate("missing", context);
      expect(response.success).toBe(true);
      expect(response.body.result).toBe("undefined");
    }
  });
});
