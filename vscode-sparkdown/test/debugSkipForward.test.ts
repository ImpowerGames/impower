import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  executed: [] as unknown[][],
  notices: [] as string[],
  terminate: [] as (() => void)[],
  active: undefined as unknown,
}));

vi.mock("vscode", () => {
  const disposable = { dispose() {} };
  return {
    commands: {
      registerCommand: (id: string, run: (...args: unknown[]) => unknown) => {
        state.commands.set(id, run);
        return disposable;
      },
      executeCommand: (...args: unknown[]) => {
        state.executed.push(args);
        return Promise.resolve();
      },
    },
    debug: {
      get activeDebugSession() {
        return state.active;
      },
      onDidTerminateDebugSession: (listener: () => void) => {
        state.terminate.push(listener);
        return disposable;
      },
    },
    window: {
      showInformationMessage: (message: string) => {
        state.notices.push(message);
        return Promise.resolve(undefined);
      },
    },
  };
});

import { SparkdownDebugManager } from "../src/managers/SparkdownDebugManager";

const session = (
  type: string,
  answer: () => Promise<unknown> = async () => ({ moved: true }),
) => {
  const requests: [string, unknown][] = [];
  return {
    type,
    requests,
    customRequest: (command: string, args: unknown) => {
      requests.push([command, args]);
      return answer();
    },
  };
};

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

beforeEach(() => {
  state.commands.clear();
  state.executed = [];
  state.notices = [];
  state.terminate = [];
  state.active = undefined;
  SparkdownDebugManager.activate({
    subscriptions: [],
    globalState: { get: (_key: string, fallback: unknown) => fallback, update: async () => {} },
  } as any);
  state.executed = [];
});

describe("the debug toolbar's Skip Forward", () => {
  it("sends the active Sparkdown session a roll forward by one beat", async () => {
    const game = session("game");
    state.active = game;
    await state.commands.get("sparkdown.debug.skipForward")!();
    expect(game.requests).toEqual([["sparkdown/rollForward", { to: "beat" }]]);
    expect(state.notices).toEqual([]);
  });

  it("shows the session's refusal as a notification", async () => {
    const reason = "No later played beat. Continue the story to play more.";
    state.active = session("game", () => Promise.reject(new Error(reason)));
    await state.commands.get("sparkdown.debug.skipForward")!();
    expect(state.notices).toEqual([reason]);
  });

  it("leaves another debugger's session alone", async () => {
    const other = session("node");
    state.active = other;
    await state.commands.get("sparkdown.debug.skipForward")!();
    expect(other.requests).toEqual([]);
  });

  it("is enabled only while the run's history has a later played beat", () => {
    const manager = SparkdownDebugManager.instance;
    manager.setCanSkipForward(true);
    manager.setCanSkipForward(true);
    manager.setCanSkipForward(false);
    expect(state.executed).toEqual([
      ["setContext", "sparkdown.debug.canSkipForward", true],
      ["setContext", "sparkdown.debug.canSkipForward", false],
    ]);
    manager.setCanSkipForward(true);
    state.executed = [];
    state.terminate.forEach((listener) => listener());
    expect(state.executed).toEqual([
      ["setContext", "sparkdown.debug.canSkipForward", false],
    ]);
  });

  it("sits on the debug toolbar only for a Sparkdown session", () => {
    const toolbar = manifest.contributes.menus["debug/toolBar"];
    expect(toolbar).toContainEqual(
      expect.objectContaining({
        command: "sparkdown.debug.skipForward",
        when: "debugType == game",
      }),
    );
    const command = manifest.contributes.commands.find(
      (c: { command: string }) => c.command === "sparkdown.debug.skipForward",
    );
    expect(command).toMatchObject({
      title: "Skip Forward",
      enablement: "debugType == game && sparkdown.debug.canSkipForward",
    });
  });
});

describe("the editor's Run button for a Sparkdown file", () => {
  it("lists Run Game and Run & Debug Game, both disabled during a debug session", () => {
    const run = manifest.contributes.menus["editor/title/run"];
    expect(run.map((entry: { command: string; when: string }) => [entry.command, entry.when])).toEqual([
      ["sparkdown.runGame", "resourceLangId == sparkdown"],
      ["sparkdown.debugGame", "resourceLangId == sparkdown"],
    ]);
    const commands = manifest.contributes.commands.filter((c: { command: string }) =>
      ["sparkdown.runGame", "sparkdown.debugGame"].includes(c.command),
    );
    expect(commands.map((c: { title: string; enablement: string }) => [c.title, c.enablement])).toEqual([
      ["Run & Debug Game", "!inDebugMode"],
      ["Run Game", "!inDebugMode"],
    ]);
  });
});
