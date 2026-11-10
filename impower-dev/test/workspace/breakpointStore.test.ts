import { ChangedEditorBreakpointsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorBreakpointsMessage";
import { EvaluateEditorHoverMessage } from "@impower/spark-editor-protocol/src/protocols/editor/EvaluateEditorHoverMessage";
import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceConstants } from "../../src/modules/spark-editor/workspace/WorkspaceConstants";
import workspace, {
  IDLE_DEBUG_SESSION,
  savedWorkspaceState,
} from "../../src/modules/spark-editor/workspace/WorkspaceStore";
import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";
import { stepRefusals } from "../../src/modules/spark-editor/workspace/stepStates";

const MAIN = "file://a/main.sd";

const collaborators = {
  fs: {
    getLoadedProjectId: () => "a",
    getFileUri: (projectId: string, filename: string) => `file://${projectId}/${filename}`,
    getFilename: (uri: string) => uri.split("/").slice(-1).join(""),
    getRelativePath: (_projectId: string, uri: string) => uri.split("/").slice(-1).join(""),
    writeProjectMetadata: async () => {},
  },
} as unknown as ConstructorParameters<typeof WorkspaceWindow>[0];

let windows: WorkspaceWindow[] = [];
let sent: { id?: string | number; method?: string; params?: any; result?: any }[] = [];
const listener = (e: Event) => {
  if (e instanceof CustomEvent && e.detail && typeof e.detail === "object") {
    sent.push(e.detail);
  }
};

const load = () => {
  const win = new WorkspaceWindow(collaborators);
  windows.push(win);
  return win;
};

const editorBreakpoints = (lines: number[]) =>
  sendProtocolMessage(
    ChangedEditorBreakpointsMessage.type.notification({
      textDocument: { uri: MAIN },
      breakpointLines: lines,
    }),
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "a");
  workspace.current = savedWorkspaceState();
  workspace.debugSession.value = IDLE_DEBUG_SESSION;
  sent = [];
  window.addEventListener(MessageProtocol.event, listener);
});

afterEach(() => {
  window.removeEventListener(MessageProtocol.event, listener);
  windows.forEach((win) => win.dispose());
  windows = [];
  vi.restoreAllMocks();
});

describe("breakpoints in the workspace", () => {
  it("keeps the lines the editor reports for its script and sends them to the debug client", () => {
    const win = load();
    const setBreakpoints = vi.spyOn(win.debug, "setBreakpoints").mockResolvedValue(true);
    editorBreakpoints([2, 6]);
    expect(workspace.current.debug.breakpoints).toEqual({ [MAIN]: [2, 6] });
    expect(setBreakpoints).toHaveBeenCalledWith(MAIN, [2, 6]);
  });

  it("moves a dot to the adapter's verified line and tells the editor which dots it could not place", () => {
    load();
    editorBreakpoints([2, 6]);
    sent = [];
    workspace.debugSession.value = {
      ...workspace.debugSession.value,
      breakpoints: {
        [MAIN]: [
          { line: 3, verified: true },
          { line: 6, verified: false, message: "A declaration runs before the story starts" },
        ],
      },
    };
    expect(workspace.current.debug.breakpoints).toEqual({ [MAIN]: [3, 6] });
    expect(
      sent.filter((m) => m.method === "editor/setBreakpoints").map((m) => m.params),
    ).toEqual([
      {
        textDocument: { uri: MAIN },
        breakpoints: [
          { line: 3, verified: true },
          { line: 6, verified: false, message: "A declaration runs before the story starts" },
        ],
      },
    ]);
  });

  it("are kept for the project through a reload, and loaded into its script's editor", async () => {
    const win = load();
    win.openFileEditor("main.sd");
    editorBreakpoints([4]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    win.dispose();
    windows = [];
    workspace.current = savedWorkspaceState();
    const reloaded = load();
    expect(reloaded.getActiveEditorForFile("main.sd")?.breakpointLines).toEqual([4]);
  });

  it("tells the editors to close their value cards when a stopped run resumes, and only then", () => {
    load();
    const hides = () => sent.filter((m) => m.method === "editor/hideHoverValues").length;
    workspace.debugSession.value = {
      ...workspace.debugSession.value,
      stopped: { reason: "breakpoint", threadId: 0 },
    };
    expect(hides()).toBe(0);
    workspace.debugSession.value = { ...workspace.debugSession.value, canStepOut: true };
    expect(hides()).toBe(0);
    workspace.debugSession.value = { ...workspace.debugSession.value, stopped: null };
    expect(hides()).toBe(1);
    workspace.debugSession.value = { ...workspace.debugSession.value, canStepOut: false };
    expect(hides()).toBe(1);
  });

  it("tells the editors to close their value cards when a step moves the stop to another line", () => {
    load();
    const hides = () => sent.filter((m) => m.method === "editor/hideHoverValues").length;
    workspace.debugSession.value = {
      ...workspace.debugSession.value,
      stopped: { reason: "breakpoint", threadId: 0 },
    };
    workspace.debugSession.value = {
      ...workspace.debugSession.value,
      stopped: { reason: "step", threadId: 0 },
    };
    expect(hides()).toBe(1);
  });

  it("leaves a running game paused at a debugger stop, so Resume and the steps can act", () => {
    const win = load();
    vi.spyOn(win, "showDocument").mockResolvedValue({ success: true } as never);
    workspace.current = {
      ...workspace.current,
      preview: {
        ...workspace.current.preview,
        modes: {
          ...workspace.current.preview.modes,
          game: { ...workspace.current.preview.modes.game, running: true, paused: false },
        },
      },
    };
    win.followStop({ uri: MAIN, line: 8 });
    expect(workspace.current.preview.modes.game.paused).toBe(true);
    expect(stepRefusals(workspace.current.preview.modes.game, workspace.debugSession.value).over).toBeUndefined();
  });

  it("answers the editor's hover with the debug client's value", async () => {
    const win = load();
    vi.spyOn(win.debug, "evaluate").mockImplementation(async (expression) =>
      expression === "mood" ? "2" : null,
    );
    const request = EvaluateEditorHoverMessage.type.request({
      textDocument: { uri: MAIN },
      expression: "mood",
    });
    sendProtocolMessage(request);
    await vi.waitFor(() =>
      expect(sent.find((m) => m.id === request.id && "result" in m)?.result).toEqual({
        value: "2",
      }),
    );
  });
});
