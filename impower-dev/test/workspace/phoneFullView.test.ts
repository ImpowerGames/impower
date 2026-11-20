import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { StartGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartGameMessage";
import { StopGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StopGameMessage";
import { OUTSIDE_EVERY_SCENE_REFUSAL } from "@impower/spark-web-player/src/main/workers/messages/PlayMessage";
import {
  SETUP_WORDS,
  stripCopy,
} from "../../src/modules/spark-editor/components/preview-strip/stripCopy";
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

  it("returns to the script when Stop ends a run played from the strip", () => {
    const w = mount();
    w.connectPlayer();
    w.playInFullView();
    w.syncGameStarted();
    w.toggleGameRunning();
    expect(sent.stopped).toBe(1);
    expect(workspace.current.preview.revealed).toBe(false);
  });

  it("opens the full view from the thumbnail without starting a run", () => {
    const w = mount();
    w.connectPlayer();
    w.openFullView();
    expect(workspace.current.preview.revealed).toBe(true);
    expect(sent.started).toBe(0);
    w.collapsePreviewPane();
    expect(workspace.current.preview.revealed).toBe(false);
    expect(sent.started).toBe(0);
    expect(sent.stopped).toBe(0);
  });

  it("keeps the full view open when Stop ends a run played inside it", () => {
    const w = mount();
    w.connectPlayer();
    w.openFullView();
    w.toggleGameRunning();
    expect(sent.started).toBe(1);
    w.syncGameStarted();
    w.toggleGameRunning();
    expect(sent.stopped).toBe(1);
    expect(workspace.current.preview.revealed).toBe(true);
  });

  it("keeps the full view open after Stop when a strip run is replayed inside it", () => {
    const w = mount();
    w.connectPlayer();
    w.playInFullView();
    w.syncGameStarted();
    w.collapsePreviewPane();
    w.syncGameExited();
    w.openFullView();
    w.toggleGameRunning();
    w.syncGameStarted();
    w.toggleGameRunning();
    expect(workspace.current.preview.revealed).toBe(true);
  });

  it("leaves the script's caret where it was while a strip run plays behind the full view, through Stop", () => {
    const uri = "file:///project/main.sd";
    const w = mount();
    vi.spyOn(w, "getActiveEditorForPane").mockReturnValue({ uri } as ReturnType<
      typeof w.getActiveEditorForPane
    >);
    const shown = vi.spyOn(w, "showDocument").mockResolvedValue(undefined as never);
    w.connectPlayer();
    w.playInFullView();
    w.syncGameStarted();
    w.followExecutedLines({ [uri]: { last: 30 } });
    w.toggleGameRunning();
    expect(workspace.current.preview.revealed).toBe(false);
    expect(shown).not.toHaveBeenCalled();
  });

  it("still moves the caret to the executed line where the script is in view", () => {
    const uri = "file:///project/main.sd";
    layout.value = "compact";
    const w = mount();
    vi.spyOn(w, "getActiveEditorForPane").mockReturnValue({ uri } as ReturnType<
      typeof w.getActiveEditorForPane
    >);
    const shown = vi.spyOn(w, "showDocument").mockResolvedValue(undefined as never);
    w.expandPreviewPane();
    w.followExecutedLines({ [uri]: { last: 30 } });
    expect(shown).toHaveBeenCalledWith(
      uri,
      { start: { line: 30, character: 0 }, end: { line: 30, character: 0 } },
      false,
    );
  });

  it("leaves the preview where it is when Stop is pressed outside the phone layout", () => {
    layout.value = "compact";
    const w = mount();
    w.connectPlayer();
    w.expandPreviewPane();
    w.toggleGameRunning();
    w.syncGameStarted();
    w.toggleGameRunning();
    expect(sent.stopped).toBe(1);
    expect(workspace.current.preview.revealed).toBe(true);
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

  it("disables the strip's Play and starts nothing while the player refuses a start at the caret's line", () => {
    const shown = { kind: "action", words: "The lamps come on one by one." } as const;
    const w = mount();
    w.connectPlayer();
    w.syncStartRefusal(OUTSIDE_EVERY_SCENE_REFUSAL);
    expect(workspace.current.preview.modes.game.startRefusal).toBe(
      OUTSIDE_EVERY_SCENE_REFUSAL,
    );
    expect(stripCopy(shown, true)).toEqual({
      label: "STORY SETUP",
      words: SETUP_WORDS,
      symbol: "file",
      playable: false,
    });
    w.playInFullView();
    w.toggleGameRunning();
    expect(sent.started).toBe(0);
    expect(workspace.current.preview.modes.game.starting).toBeFalsy();

    w.syncStartRefusal(null);
    expect(workspace.current.preview.modes.game.startRefusal).toBeUndefined();
    expect(stripCopy(shown, false).playable).toBe(true);
    w.playInFullView();
    expect(sent.started).toBe(1);
  });

  it("never saves the full view as open, so a reload returns to writing", () => {
    const saved = cacheableWorkspaceState({
      ...workspace.current,
      preview: { ...workspace.current.preview, revealed: true },
    });
    expect(saved.preview.revealed).toBeUndefined();
  });
});
