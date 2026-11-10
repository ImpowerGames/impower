import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  started: [] as ((session: any) => void)[],
  terminated: [] as ((session: any) => void)[],
  calls: [] as [string, string][],
}));

vi.mock("vscode", async () => {
  const { URI } = await import("vscode-uri");
  const disposable = { dispose() {} };
  return {
    Uri: URI,
    DebugConfigurationProviderTriggerKind: { Initial: 1, Dynamic: 2 },
    commands: { registerCommand: () => disposable },
    debug: {
      registerDebugConfigurationProvider: () => disposable,
      registerDebugAdapterDescriptorFactory: () => disposable,
      onDidStartDebugSession: (listener: (session: any) => void) => {
        state.started.push(listener);
        return disposable;
      },
      onDidTerminateDebugSession: (listener: (session: any) => void) => {
        state.terminated.push(listener);
        return disposable;
      },
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
      attachDebugSession: (session: { id: string }) =>
        state.calls.push(["attach", session.id]),
      detachDebugSession: (session: { id: string }) =>
        state.calls.push(["detach", session.id]),
    },
  },
}));

vi.mock("../src/managers/SparkProgramManager", () => ({
  SparkProgramManager: { instance: { playRefusal: () => undefined } },
}));

import { activateDebugger } from "../src/debugger/activateDebugger";

const start = (session: any) => state.started.forEach((l) => l(session));
const end = (session: any) => state.terminated.forEach((l) => l(session));

describe("a debug session's link to the Game Preview", () => {
  beforeEach(() => {
    if (state.started.length === 0) {
      activateDebugger({ subscriptions: [] } as any, {} as any);
    }
    state.calls = [];
  });

  it("attaches a Sparkdown debug run and detaches it when it ends", () => {
    const run = { id: "s1", type: "game", configuration: {} };
    start(run);
    end(run);
    expect(state.calls).toEqual([
      ["attach", "s1"],
      ["detach", "s1"],
    ]);
  });

  it("leaves a run started without debugging and another debugger's session alone", () => {
    start({ id: "s2", type: "game", configuration: { noDebug: true } });
    start({ id: "s3", type: "node", configuration: {} });
    expect(state.calls).toEqual([]);
  });
});
