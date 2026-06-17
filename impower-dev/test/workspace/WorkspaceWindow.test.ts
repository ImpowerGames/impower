import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { DidOpenPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPaneMessage";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Workspace singleton instantiates 3 Workers at module load and
// circular-imports WorkspaceWindow. Stub it; the only method our tested actions
// reach is fs.writeProjectMetadata (the project-rename path).
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs: { writeProjectMetadata: vi.fn() } },
}));

import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";
import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";

describe("WorkspaceWindow store transitions", () => {
  let win: WorkspaceWindow;

  beforeEach(() => {
    localStorage.clear();
    win = new WorkspaceWindow();
  });

  it("openedPane sets the active pane", () => {
    win.openedPane("assets");
    expect(workspace.current.pane).toBe("assets");
  });

  it("openedPanel sets the active panel for a pane", () => {
    win.openedPanel("assets", "urls");
    expect(workspace.current.panes.assets.panel).toBe("urls");
  });

  it("openedView sets the view for a pane", () => {
    win.openedView("logic", "list");
    expect(workspace.current.panes.logic.view).toBe("list");
  });

  it("openedFileEditor opens the editor in the pane/panel derived from the filename", () => {
    win.openedFileEditor("dialogue.sd");
    const editor = workspace.current.panes.logic.panels.scripts!.activeEditor;
    expect(editor?.open).toBe(true);
    expect(editor?.filename).toBe("dialogue.sd");
  });

  it("openedFileEditor routes main.sd to the logic/main panel", () => {
    win.openedFileEditor("main.sd");
    expect(workspace.current.panes.logic.panels.main!.activeEditor?.filename).toBe(
      "main.sd",
    );
  });

  it("closedFileEditor marks the editor closed", () => {
    win.openedFileEditor("dialogue.sd");
    win.closedFileEditor("dialogue.sd");
    expect(
      workspace.current.panes.logic.panels.scripts!.activeEditor?.open,
    ).toBe(false);
  });

  it("expandedPreviewPane / collapsedPreviewPane toggle preview.revealed", () => {
    win.expandedPreviewPane();
    expect(workspace.current.preview.revealed).toBe(true);
    win.collapsedPreviewPane();
    expect(workspace.current.preview.revealed).toBe(false);
  });

  it("changedPreviewMode sets preview.mode", () => {
    win.changedPreviewMode("screenplay");
    expect(workspace.current.preview.mode).toBe("screenplay");
  });

  it("broadcasts a cross-process protocol event on openedPane", () => {
    const received: unknown[] = [];
    const listener = (e: Event) => {
      if (e instanceof CustomEvent && DidOpenPaneMessage.type.is(e.detail)) {
        received.push(e.detail);
      }
    };
    window.addEventListener(MessageProtocol.event, listener);
    win.openedPane("share");
    window.removeEventListener(MessageProtocol.event, listener);
    expect(received).toHaveLength(1);
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
    it("startedEditingProjectName flags the screen", () => {
      win.startedEditingProjectName();
      expect(workspace.current.screen.editingName).toBe(true);
    });

    it("finishedEditingProjectName with an unchanged name clears the flag without persisting", async () => {
      const id = workspace.current.project.id;
      // Seed a known name.
      workspace.current = {
        ...workspace.current,
        project: { ...workspace.current.project, id, name: "Same" },
      };
      const changed = await win.finishedEditingProjectName("Same");
      expect(changed).toBe(false);
      expect(workspace.current.screen.editingName).toBe(false);
    });

    it("finishedEditingProjectName persists a changed name (regression: previousName captured before update)", async () => {
      const id = workspace.current.project.id;
      vi.spyOn(
        WorkspaceWindow.prototype,
        "recordScriptChange",
      ).mockResolvedValue(undefined as never);
      workspace.current = {
        ...workspace.current,
        project: { ...workspace.current.project, id, name: "Old" },
      };
      const changed = await win.finishedEditingProjectName("New");
      expect(changed).toBe(true);
      expect(workspace.current.project.name).toBe("New");
    });
  });
});
