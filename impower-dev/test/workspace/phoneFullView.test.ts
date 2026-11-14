import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { StartGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartGameMessage";
import { StopGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StopGameMessage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ value: "phone" }));

vi.mock("@impower/impower-ui/layout", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const state = actual["layoutState"] as Record<string, unknown>;
  return {
    ...actual,
    layoutState: { ...state, current: () => layout.value },
  };
});

const { default: WorkspaceWindow } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceWindow");
const { default: workspace, cacheableWorkspaceState } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: workspaceSettings } =
  await import("../../src/modules/spark-editor/workspace/settings/WorkspaceSettings");

let win: InstanceType<typeof WorkspaceWindow> | undefined;
const sent = { started: 0, stopped: 0 };

const listener = (e: Event) => {
  if (!(e instanceof CustomEvent)) {
    return;
  }
  if (StartGameMessage.type.isRequest(e.detail)) {
    sent.started += 1;
  }
  if (StopGameMessage.type.isRequest(e.detail)) {
    sent.stopped += 1;
  }
};

const mount = () => {
  win = new WorkspaceWindow({
    fs: {
      getLoadedProjectId: () => "project",
      getFileUri: (projectId: string, filename: string) =>
        `file:///${projectId}/${filename}`,
      getRelativePath: (projectId: string, uri: string) =>
        uri.slice(`file:///${projectId}/`.length),
    },
  } as unknown as ConstructorParameters<typeof WorkspaceWindow>[0]);
  return win;
};

beforeEach(() => {
  layout.value = "phone";
  sent.started = 0;
  sent.stopped = 0;
  localStorage.clear();
  workspaceSettings.setPreference("previewMode", "game");
  window.addEventListener(MessageProtocol.event, listener);
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "project" },
    preview: {
      ...workspace.current.preview,
      revealed: false,
      modes: { ...workspace.current.preview.modes, game: {} },
    },
  };
});

afterEach(() => {
  window.removeEventListener(MessageProtocol.event, listener);
  win?.dispose();
  win = undefined;
});

describe("the phone's full view", () => {
  it("plays from the strip by starting the game and expanding it, without a second start while it runs", () => {
    const w = mount();
    w.connectPlayer();
    w.playInFullView();
    expect(sent.started).toBe(1);
    expect(workspace.current.preview.revealed).toBe(true);
    w.syncGameStarted();
    w.playInFullView();
    expect(sent.started).toBe(1);
    expect(sent.stopped).toBe(0);
  });

  it("plays the game, not the screenplay, when the saved preview mode is Screenplay", () => {
    workspaceSettings.setPreference("previewMode", "screenplay");
    const w = mount();
    w.connectPlayer();
    w.playInFullView();
    expect(workspaceSettings.preferences.peek().previewMode).toBe("game");
    expect(sent.started).toBe(1);
    expect(workspace.current.preview.revealed).toBe(true);
    workspaceSettings.setPreference("previewMode", "textstream");
    w.syncGameStarted();
    w.collapsePreviewPane();
    w.playInFullView();
    expect(workspaceSettings.preferences.peek().previewMode).toBe("textstream");
  });

  it("stops playback when the full view closes on a phone, as the prototype does", () => {
    const w = mount();
    w.connectPlayer();
    w.playInFullView();
    w.syncGameStarted();
    w.collapsePreviewPane();
    expect(workspace.current.preview.revealed).toBe(false);
    expect(sent.stopped).toBe(1);
  });

  it("leaves a game running when the preview collapses outside the phone layout", () => {
    layout.value = "compact";
    const w = mount();
    w.connectPlayer();
    w.expandPreviewPane();
    w.toggleGameRunning();
    w.syncGameStarted();
    w.collapsePreviewPane();
    expect(sent.stopped).toBe(0);
  });

  it("never saves the full view as open, so a reload returns to writing", () => {
    const saved = cacheableWorkspaceState({
      ...workspace.current,
      preview: { ...workspace.current.preview, revealed: true },
    });
    expect(saved.preview.revealed).toBeUndefined();
  });
});
