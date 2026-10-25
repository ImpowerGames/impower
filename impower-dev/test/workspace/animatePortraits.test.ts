import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { SetAnimatePortraitsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetAnimatePortraitsMessage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Workspace singleton instantiates Workers at module load and
// circular-imports WorkspaceWindow.
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs: {} },
}));

import { WorkspaceConstants } from "../../src/modules/spark-editor/workspace/WorkspaceConstants";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";
import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";

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
