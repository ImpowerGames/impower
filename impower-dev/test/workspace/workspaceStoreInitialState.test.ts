import { afterEach, describe, expect, it, vi } from "vitest";

const loadStore = async () => {
  vi.resetModules();
  return (await import("../../src/modules/spark-editor/workspace/WorkspaceStore"))
    .default;
};

const savedLayout = (id: string, pane: string) => ({
  project: { id, name: "Saved Game" },
  pane,
  panes: {
    logic: { view: "list", panel: "main", panels: {} },
    assets: { panel: "urls", panels: {} },
    share: { panel: "screenplay", panels: {} },
  },
  preview: { mode: "screenplay", modes: { game: { running: true } } },
  screen: { editingName: true },
  sync: { status: "syncing" },
  debug: { diagnosticsSummary: { "main.sd": {} }, pinpoints: {}, highlights: {} },
});

describe("the workspace store's first state", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("is the saved layout of the loaded project", async () => {
    localStorage.setItem("project", "drive-123");
    localStorage.setItem(
      "workspace/drive-123",
      JSON.stringify(savedLayout("drive-123", "assets")),
    );

    const workspace = await loadStore();

    expect(workspace.signals.pane.value).toBe("assets");
    expect(workspace.signals.projectId.value).toBe("drive-123");
    expect(workspace.current.panes.assets.panel).toBe("urls");
    expect(workspace.signals.previewMode.value).toBe("screenplay");
    expect(workspace.current.preview.modes.game).toEqual({});
    expect(workspace.current.screen).toEqual({});
    expect(workspace.current.sync).toEqual({});
    expect(workspace.current.debug.diagnosticsSummary).toEqual({});
  });

  it("reads the local project's layout when no project was loaded", async () => {
    localStorage.setItem(
      "workspace/local",
      JSON.stringify(savedLayout("local", "share")),
    );

    const workspace = await loadStore();

    expect(workspace.signals.pane.value).toBe("share");
    expect(workspace.signals.projectId.value).toBe("local");
  });

  it("is the default layout for the local project when nothing was saved", async () => {
    const workspace = await loadStore();

    expect(workspace.signals.pane.value).toBe("logic");
    expect(workspace.signals.projectId.value).toBe("local");
    expect(workspace.signals.previewMode.value).toBe("game");
    expect(workspace.current.panes.logic.panels.main.activeEditor.filename).toBe(
      "main.sd",
    );
  });
});
