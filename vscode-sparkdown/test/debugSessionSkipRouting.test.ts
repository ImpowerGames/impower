import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  listeners: {
    start: [] as ((session: any) => void)[],
    change: [] as ((session: any) => void)[],
    end: [] as ((session: any) => void)[],
  },
  calls: [] as (string | null)[],
}));

vi.mock("vscode", async () => {
  const { URI } = await import("vscode-uri");
  const disposable = { dispose() {} };
  const on =
    (kind: keyof typeof state.listeners) =>
    (listener: (session: any) => void) => {
      state.listeners[kind].push(listener);
      return disposable;
    };
  return {
    Uri: URI,
    DebugConfigurationProviderTriggerKind: { Initial: 1, Dynamic: 2 },
    commands: { registerCommand: () => disposable },
    debug: {
      registerDebugConfigurationProvider: () => disposable,
      registerDebugAdapterDescriptorFactory: () => disposable,
      onDidStartDebugSession: on("start"),
      onDidChangeActiveDebugSession: on("change"),
      onDidTerminateDebugSession: on("end"),
    },
    languages: {
      registerEvaluatableExpressionProvider: () => disposable,
      registerInlineValuesProvider: () => disposable,
    },
    window: { showErrorMessage: () => Promise.resolve(undefined) },
    workspace: { textDocuments: [], workspaceFolders: [] },
  };
});

vi.mock("../src/managers/SparkdownDebugManager", () => ({
  SparkdownDebugManager: { activate() {}, instance: {} },
}));

vi.mock("../src/managers/SparkdownPreviewGamePanelManager", () => ({
  SparkdownPreviewGamePanelManager: {
    instance: {
      syncDebugSession: (ended?: { id: string }) =>
        state.calls.push(ended?.id ?? null),
    },
  },
}));

vi.mock("../src/managers/SparkProgramManager", () => ({
  SparkProgramManager: { instance: { playRefusal: () => undefined } },
}));

import { activateDebugger } from "../src/debugger/activateDebugger";

const fire = (kind: keyof typeof state.listeners, session: any) =>
  state.listeners[kind].forEach((l) => l(session));

describe("a debug session's link to the Game Preview", () => {
  beforeEach(() => {
    if (state.listeners.start.length === 0) {
      activateDebugger({ subscriptions: [] } as any, {} as any);
    }
    state.calls = [];
  });

  it("syncs the panel when a session starts, becomes active or ends", () => {
    const run = { id: "s1", type: "game", configuration: {} };
    fire("start", run);
    fire("change", run);
    fire("end", run);
    expect(state.calls).toEqual([null, null, "s1"]);
  });
});
