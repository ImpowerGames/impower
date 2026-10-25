import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { DidOpenPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPaneMessage";
import { SetAnimatePortraitsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetAnimatePortraitsMessage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Workspace singleton instantiates 3 Workers at module load and
// circular-imports WorkspaceWindow. Stub it; the only method our tested actions
// reach is fs.writeProjectMetadata (the project-rename path).
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      writeProjectMetadata: vi.fn(),
      getFileUri: (projectId: string, filename: string) =>
        `file://${projectId}/${filename}`,
    },
  },
}));

import { WorkspaceConstants } from "../../src/modules/spark-editor/workspace/WorkspaceConstants";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";
import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";

describe("WorkspaceWindow store transitions", () => {
  let win: WorkspaceWindow;

  beforeEach(() => {
    localStorage.clear();
    win = new WorkspaceWindow();
  });

  // The window is shared by every file in the run; a live instance would keep
  // answering requests dispatched by later files.
  afterEach(() => {
    win.dispose();
  });

  it("openPane sets the active pane", () => {
    win.openPane("assets");
    expect(workspace.current.pane).toBe("assets");
  });

  it("openPanel sets the active panel for a pane", () => {
    win.openPanel("assets", "urls");
    expect(workspace.current.panes.assets.panel).toBe("urls");
  });

  it("openView sets the view for a pane", () => {
    win.openView("logic", "list");
    expect(workspace.current.panes.logic.view).toBe("list");
  });

  it("openFileEditor opens the editor in the pane/panel derived from the filename", () => {
    win.openFileEditor("dialogue.sd");
    const editor = workspace.current.panes.logic.panels.scripts!.activeEditor;
    expect(editor?.open).toBe(true);
    expect(editor?.filename).toBe("dialogue.sd");
  });

  it("openFileEditor routes main.sd to the logic/main panel", () => {
    win.openFileEditor("main.sd");
    expect(workspace.current.panes.logic.panels.main!.activeEditor?.filename).toBe(
      "main.sd",
    );
  });

  it("openFileEditor stores the full project-relative path for a nested script", () => {
    win.openFileEditor("chapters/intro.sd");
    const editor = workspace.current.panes.logic.panels.scripts!.activeEditor;
    expect(editor?.open).toBe(true);
    // The path (not just the basename) is the stored identity.
    expect(editor?.filename).toBe("chapters/intro.sd");
  });

  it("getActiveEditorForFile distinguishes same-basename scripts in different folders", () => {
    win.openFileEditor("chapters/intro.sd");
    const active = win.getActiveEditorForFile("chapters/intro.sd");
    expect(active?.filename).toBe("chapters/intro.sd");
    // The reconstructed uri carries the folder, not just the basename.
    expect(active?.uri.endsWith("/chapters/intro.sd")).toBe(true);
    // A same-basename file in another folder is NOT the active editor.
    expect(win.getActiveEditorForFile("acts/intro.sd")).toBeUndefined();
  });

  it("closeFileEditor by nested path closes that editor", () => {
    win.openFileEditor("chapters/intro.sd");
    win.closeFileEditor("chapters/intro.sd");
    expect(
      workspace.current.panes.logic.panels.scripts!.activeEditor?.open,
    ).toBe(false);
  });

  it("closeFileEditor marks the editor closed", () => {
    win.openFileEditor("dialogue.sd");
    win.closeFileEditor("dialogue.sd");
    expect(
      workspace.current.panes.logic.panels.scripts!.activeEditor?.open,
    ).toBe(false);
  });

  it("expandPreviewPane / collapsePreviewPane toggle preview.revealed", () => {
    win.expandPreviewPane();
    expect(workspace.current.preview.revealed).toBe(true);
    win.collapsePreviewPane();
    expect(workspace.current.preview.revealed).toBe(false);
  });

  it("setPreviewMode sets preview.mode", () => {
    win.setPreviewMode("screenplay");
    expect(workspace.current.preview.mode).toBe("screenplay");
  });

  // openPane just updates the reactive store now — it no longer broadcasts a
  // DidOpenPane protocol event (that event had no consumers anywhere; it was a
  // web-component-era artifact). In-page UI reads the store signal directly.
  it("openPane updates the store without broadcasting a (dead) protocol event", () => {
    const received: unknown[] = [];
    const listener = (e: Event) => {
      if (e instanceof CustomEvent && DidOpenPaneMessage.type.is(e.detail)) {
        received.push(e.detail);
      }
    };
    window.addEventListener(MessageProtocol.event, listener);
    win.openPane("share");
    window.removeEventListener(MessageProtocol.event, listener);
    expect(workspace.current.pane).toBe("share");
    expect(received).toHaveLength(0);
  });

  // Inbound flow: an editor (the framework-agnostic CodeMirror view, a separate
  // "process") reports scroll position via the protocol bus; WorkspaceWindow's
  // handleProtocol folds it into the store. This view→store direction is
  // legitimate and the refactor must preserve it.
  it("folds an inbound ScrolledEditor protocol event into the store", () => {
    const visibleRange = {
      start: { line: 3, character: 0 },
      end: { line: 9, character: 0 },
    };
    window.dispatchEvent(
      new CustomEvent(MessageProtocol.event, {
        detail: ScrolledEditorMessage.type.notification({
          textDocument: { uri: "file:///project/dialogue.sd" },
          visibleRange,
        }),
      }),
    );
    expect(
      workspace.current.panes.logic.panels.scripts!.activeEditor?.visibleRange,
    ).toEqual(visibleRange);
  });

  describe("project name editing", () => {
    it("startEditingProjectName flags the screen", () => {
      win.startEditingProjectName();
      expect(workspace.current.screen.editingName).toBe(true);
    });

    it("finishEditingProjectName with an unchanged name clears the flag without persisting", async () => {
      const id = workspace.current.project.id;
      // Seed a known name.
      workspace.current = {
        ...workspace.current,
        project: { ...workspace.current.project, id, name: "Same" },
      };
      const changed = await win.finishEditingProjectName("Same");
      expect(changed).toBe(false);
      expect(workspace.current.screen.editingName).toBe(false);
    });

    it("finishEditingProjectName persists a changed name (regression: previousName captured before update)", async () => {
      const id = workspace.current.project.id;
      vi.spyOn(
        WorkspaceWindow.prototype,
        "recordScriptChange",
      ).mockResolvedValue(undefined as never);
      workspace.current = {
        ...workspace.current,
        project: { ...workspace.current.project, id, name: "Old" },
      };
      const changed = await win.finishEditingProjectName("New");
      expect(changed).toBe(true);
      expect(workspace.current.project.name).toBe("New");
    });
  });
});

describe("Animate portraits preference", () => {
  let windows: WorkspaceWindow[] = [];
  let sent: SetAnimatePortraitsMessage.Request[] = [];

  const listener = (e: Event) => {
    if (
      e instanceof CustomEvent &&
      SetAnimatePortraitsMessage.type.is(e.detail) &&
      "id" in e.detail
    ) {
      sent.push(e.detail as SetAnimatePortraitsMessage.Request);
    }
  };

  // Each construction is one editor page load.
  const load = () => {
    const win = new WorkspaceWindow();
    windows.push(win);
    return win;
  };

  beforeEach(() => {
    localStorage.clear();
    workspace.animatePortraits.value = true;
    sent = [];
    window.addEventListener(MessageProtocol.event, listener);
  });

  afterEach(() => {
    window.removeEventListener(MessageProtocol.event, listener);
    windows.forEach((win) => win.dispose());
    windows = [];
  });

  it("is on by default", () => {
    load();
    expect(workspace.animatePortraits.value).toBe(true);
  });

  it("sends each change to the player through game/setAnimatePortraits", () => {
    const win = load();
    win.toggleAnimatePortraits();
    win.toggleAnimatePortraits();
    expect(sent.map((m) => m.method)).toEqual([
      "game/setAnimatePortraits",
      "game/setAnimatePortraits",
    ]);
    expect(sent.map((m) => m.params.enabled)).toEqual([false, true]);
  });

  it("survives an editor reload", () => {
    load().setAnimatePortraits(false);
    workspace.animatePortraits.value = true;
    load();
    expect(workspace.animatePortraits.value).toBe(false);
  });

  it("is shared by every project rather than stored per project", () => {
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "a");
    load().setAnimatePortraits(false);
    workspace.animatePortraits.value = true;
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "b");
    load();
    expect(workspace.current.project.id).toBe("b");
    expect(workspace.animatePortraits.value).toBe(false);
  });

  it("is independent of story pause", () => {
    const win = load();
    win.setAnimatePortraits(false);
    win.pauseGame();
    win.unpauseGame();
    expect(workspace.animatePortraits.value).toBe(false);
    expect(sent.map((m) => m.params.enabled)).toEqual([false]);
  });
});
