import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  options: null as any,
  offered: [] as unknown[][],
  resolved: [] as unknown[][],
}));

vi.mock("vscode", async () => (await import("./fakeVscode")).fakeVscode());
vi.mock("vscode-languageclient", () => ({
  ExecuteCommandRequest: { method: "workspace/executeCommand" },
}));
vi.mock(
  "@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS",
  () => ({
    DEFAULT_DESCRIPTION_DEFINITIONS: {},
  }),
);
vi.mock(
  "@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS",
  () => ({
    DEFAULT_OPTIONAL_DEFINITIONS: {},
  }),
);
vi.mock(
  "@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS",
  () => ({
    DEFAULT_SCHEMA_DEFINITIONS: {},
  }),
);
vi.mock(
  "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage",
  () => ({
    CompiledProgramMessage: { method: "compiler/didCompile" },
  }),
);
vi.mock("../src/managers/SparkProgramManager", () => ({
  SparkProgramManager: { instance: { bindLanguageClient: () => {} } },
}));
vi.mock("../src/providers/SparkdownOutlineTreeDataProvider", () => ({
  SparkdownOutlineTreeDataProvider: { instance: { update: () => {} } },
}));
vi.mock("../src/utils/executeLanguageCommand", () => ({
  executeLanguageCommand: async () => undefined,
}));
vi.mock("../src/utils/getEditor", () => ({ getEditor: () => undefined }));
vi.mock("../src/utils/getOpenTextDocument", () => ({
  getOpenTextDocument: async () => undefined,
}));
vi.mock("../src/utils/getWorkspaceFiles", () => ({
  getWorkspaceFiles: async () => [],
}));
vi.mock("../src/utils/getWorkspaceFileWatchers", () => ({
  getWorkspaceFileWatchers: () => [],
}));
vi.mock("../src/utils/updateCommands", () => ({ updateCommands: () => {} }));
vi.mock("../src/utils/createSparkdownLanguageClient", () => ({
  createSparkdownLanguageClient: async (
    _context: unknown,
    options: unknown,
  ) => {
    state.options = options;
    return {
      onNotification: () => {},
      onRequest: () => {},
      start: async () => {},
      stop: async () => {},
    };
  },
}));
vi.mock("../src/utils/activateCompletionPreview", () => ({
  offerCompletions: (...args: unknown[]) => state.offered.push(args),
  resolvedCompletion: (...args: unknown[]) => state.resolved.push(args),
}));

describe("the language client", () => {
  it("hands every completion answer and resolution to the completion preview", async () => {
    const { activateLanguageClient } =
      await import("../src/utils/activateLanguageClient");
    await activateLanguageClient({ subscriptions: [] } as never);
    const middleware = state.options.middleware;
    const document = { uri: "file:///project/main.sd" };
    const answer = [{ label: "mia_sad" }];
    const result = await middleware.provideCompletionItem(
      document,
      { line: 1, character: 6 },
      {},
      {},
      async () => answer,
    );
    expect(result).toBe(answer);
    expect(state.offered).toEqual([[document, answer]]);

    const item = answer[0];
    const resolved = { label: "mia_sad", documentation: "sad" };
    expect(
      await middleware.resolveCompletionItem(item, {}, async () => resolved),
    ).toBe(resolved);
    expect(state.resolved).toEqual([[item, resolved]]);
  });
});
