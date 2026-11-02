import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  providers: [] as any[],
  errors: [] as string[],
  refusals: new Map<string, string>(),
}));

vi.mock("vscode", async () => {
  const { URI } = await import("vscode-uri");
  const disposable = { dispose() {} };
  return {
    Uri: URI,
    DebugConfigurationProviderTriggerKind: { Initial: 1, Dynamic: 2 },
    commands: { registerCommand: () => disposable },
    debug: {
      registerDebugConfigurationProvider: (_: string, provider: any) => {
        state.providers.push(provider);
        return disposable;
      },
      registerDebugAdapterDescriptorFactory: () => disposable,
    },
    languages: {
      registerEvaluatableExpressionProvider: () => disposable,
      registerInlineValuesProvider: () => disposable,
    },
    window: {
      showErrorMessage: (message: string) => {
        state.errors.push(message);
        return Promise.resolve(undefined);
      },
    },
    workspace: { textDocuments: [], workspaceFolders: [] },
  };
});

vi.mock("../src/managers/SparkdownDebugManager", () => ({
  SparkdownDebugManager: { activate() {}, instance: {} },
}));

vi.mock("../src/managers/SparkdownPreviewGamePanelManager", () => ({
  SparkdownPreviewGamePanelManager: { instance: {} },
}));

vi.mock("../src/managers/SparkProgramManager", () => ({
  SparkProgramManager: {
    instance: {
      playRefusal: (uri: { toString(): string }) => state.refusals.get(uri.toString()),
    },
  },
}));

import { activateDebugger } from "../src/debugger/activateDebugger";

const MAIN = "vscode-test-web://mount/main.sd";
const NO_START = "no scene named start; the story starts in a scene named start";

const launch = () => {
  if (state.providers.length === 0) {
    activateDebugger({ subscriptions: [] } as any, {} as any);
  }
  const config = { type: "game", name: "Run File", request: "launch", program: MAIN };
  return {
    config,
    resolved: state.providers[0].resolveDebugConfigurationWithSubstitutedVariables(
      undefined,
      config,
    ),
  };
};

describe("a game launch", () => {
  beforeEach(() => {
    state.errors = [];
    state.refusals.clear();
  });

  it("is refused with the story's play refusal while it has no start scene", () => {
    state.refusals.set(MAIN, NO_START);
    expect(launch().resolved).toBeUndefined();
    expect(state.errors).toEqual([NO_START]);
  });

  it("goes ahead once the story compiles with a start scene", () => {
    const { config, resolved } = launch();
    expect(resolved).toBe(config);
    expect(state.errors).toEqual([]);
  });
});
