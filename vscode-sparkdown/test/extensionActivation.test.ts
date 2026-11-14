import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  activated: [] as string[],
  clientReady: Promise.resolve({}),
  attach: vi.fn(),
}));

vi.mock("vscode", async () => ({
  ...(await import("./fakeVscode")).fakeVscode(),
  ExtensionMode: { Production: 1, Development: 2 },
}));
vi.mock("../src/utils/driveEditorProtocol", () => ({ attachDriveEditorProtocol: state.attach }));
vi.mock("../src/state/fileSystemWatcherState", () => ({
  fileSystemWatcherState: {},
}));

vi.mock("../src/context/activateContextService", () => ({
  activateContextService: () => state.activated.push("activateContextService"),
}));
vi.mock("../src/debugger/activateDebugger", () => ({
  activateDebugger: () => state.activated.push("activateDebugger"),
}));
vi.mock("../src/utils/activateAutoFormatting", () => ({
  activateAutoFormatting: () => state.activated.push("activateAutoFormatting"),
}));
vi.mock("../src/utils/activateCheatSheetView", () => ({
  activateCheatSheetView: () => state.activated.push("activateCheatSheetView"),
}));
vi.mock("../src/utils/activateCommandView", () => ({
  activateCommandView: () => state.activated.push("activateCommandView"),
}));
vi.mock("../src/utils/activateCompletionPreview", () => ({
  activateCompletionPreview: () =>
    state.activated.push("activateCompletionPreview"),
}));
vi.mock("../src/utils/activateDocumentManager", () => ({
  activateDocumentManager: () =>
    state.activated.push("activateDocumentManager"),
}));
vi.mock("../src/utils/activateDurationStatus", () => ({
  activateDurationStatus: () => state.activated.push("activateDurationStatus"),
}));
vi.mock("../src/utils/activateExecutionLineDecorator", () => ({
  activateExecutionLineDecorator: () =>
    state.activated.push("activateExecutionLineDecorator"),
}));
vi.mock("../src/utils/activateFileDecorations", () => ({
  activateFileDecorations: () =>
    state.activated.push("activateFileDecorations"),
}));
vi.mock("../src/utils/activateFileWatcher", () => ({
  activateFileWatcher: () => state.activated.push("activateFileWatcher"),
}));
vi.mock("../src/utils/activateInspector", () => ({
  activateInspector: () => state.activated.push("activateInspector"),
}));
vi.mock("../src/utils/activateLanguageClient", () => ({
  activateLanguageClient: () => {
    state.activated.push("activateLanguageClient");
    return state.clientReady;
  },
}));
vi.mock("../src/utils/activateOutlineView", () => ({
  activateOutlineView: () => state.activated.push("activateOutlineView"),
}));
vi.mock("../src/utils/activatePreviewGamePanel", () => ({
  activatePreviewGamePanel: () =>
    state.activated.push("activatePreviewGamePanel"),
}));
vi.mock("../src/utils/activatePreviewScreenplayPanel", () => ({
  activatePreviewScreenplayPanel: () =>
    state.activated.push("activatePreviewScreenplayPanel"),
}));
vi.mock("../src/utils/activateRuntimeDiagnostics", () => ({
  activateRuntimeDiagnostics: () =>
    state.activated.push("activateRuntimeDiagnostics"),
}));
vi.mock("../src/utils/activateScreenPreview", () => ({
  activateScreenPreview: () => state.activated.push("activateScreenPreview"),
}));
vi.mock("../src/utils/activateVirtualDeclarations", () => ({
  activateVirtualDeclarations: () =>
    state.activated.push("activateVirtualDeclarations"),
}));
vi.mock("../src/utils/activatePortraitNormalization", () => ({
  activatePortraitNormalization: () =>
    state.activated.push("activatePortraitNormalization"),
}));

describe("the extension", () => {
  it("turns on the completion preview, the language client and the runtime diagnostics relay when it activates", async () => {
    const { activate } = await import("../src/extension");
    activate({ subscriptions: [] } as never);
    expect(state.activated).toContain("activateCompletionPreview");
    expect(state.activated).toContain("activateLanguageClient");
    expect(state.activated).toContain("activatePreviewGamePanel");
    expect(state.activated).toContain("activateRuntimeDiagnostics");
    expect(state.attach).not.toHaveBeenCalled();
  });

  it("requires both an opted-in build and a development extension host", async () => {
    const { activate } = await import("../src/extension");
    vi.stubGlobal("__SPARKDOWN_DRIVER_PROTOCOL__", true);
    try {
      activate({ subscriptions: [], extensionMode: 1 } as never);
      expect(state.attach).not.toHaveBeenCalled();
      const context = { subscriptions: [], extensionMode: 2 };
      activate(context as never);
      await vi.waitFor(() => {
        expect(state.attach).toHaveBeenCalledTimes(1);
        expect(state.attach).toHaveBeenCalledWith(context, state.clientReady);
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
