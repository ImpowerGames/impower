import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidOpenPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPaneMessage";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Workspace singleton instantiates 3 Workers at module load and
// circular-imports WorkspaceWindow. We only exercise WorkspaceWindow's pure
// store-transition actions, which never touch Workspace, so stub it out.
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {},
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
});
