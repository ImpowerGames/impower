import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ChangedEditorRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorRoutePinsMessage";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { DidOpenPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPaneMessage";
import { ShowDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/window/ShowDocumentMessage";
import { DidChangeGameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { SkipBeatMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SkipBeatMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { SetAnimatePortraitsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetAnimatePortraitsMessage";
import { EnableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/EnableGameDebugMessage";
import { DisableGameDebugMessage } from "@impower/spark-engine/src/game/core/classes/messages/DisableGameDebugMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";
import { StartGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StartGameMessage";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { NO_START_SCENE_MESSAGE } from "@impower/sparkdown/src/compiler/utils/startScene";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { programSummary } from "@impower/sparkdown/src/compiler/utils/programSummary";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ window: undefined as unknown }));
const downloads = vi.hoisted(() => vi.fn());
vi.mock("../../src/modules/spark-editor/utils/downloadFile", () => ({
  downloadFile: downloads,
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      writeProjectMetadata: vi.fn(),
      getFiles: async () => ({}),
      getFileUri: (projectId: string, filename: string) =>
        `file://${projectId}/${filename}`,
      getFilename: (uri: string) => uri.split("/").slice(-1).join(""),
      getRelativePath: (projectId: string, uri: string) => {
        const prefix = `file://${projectId}/`;
        return uri.startsWith(prefix)
          ? uri.slice(prefix.length)
          : uri.split("/").slice(-1).join("");
      },
    },
    get window() {
      return current.window;
    },
  },
}));

const layoutMock = vi.hoisted(() => ({
  value: "desktop" as "phone" | "compact" | "desktop",
}));
vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@impower/impower-ui/layout")>()),
  useLayout: () => layoutMock.value,
}));

const screenplayProps = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock(
  "@impower/sparkdown-document-views/src/modules/screenplay-preview/SparkdownScreenplayPreview",
  async () => {
    const { h } = await import("preact");
    return {
      default: (props: Record<string, unknown>) => {
        screenplayProps.push(props);
        return h("div", { "data-screenplay-page": "" });
      },
    };
  },
);

vi.mock("../../src/modules/spark-editor/components/preview-bar/PreviewBar", () => ({
  default: () => null,
}));

vi.mock("@impower/impower-ui/components", async () => {
  const { h, createContext } = await import("preact");
  const { useContext } = await import("preact/hooks");
  const element =
    (tag: string) =>
    ({ asChild: _asChild, variant: _v, size: _s, align: _a, ...props }: Record<string, unknown>) =>
      h(tag, props);
  const Radio = createContext<{ value?: string; onValueChange?: (value: string) => void }>({});
  const icons = [
    "CheckIcon",
    "ChevronDownIcon",
    "CogIcon",
    "NextIcon",
    "PauseIcon",
    "PlayIcon",
    "PreviousIcon",
    "RestartIcon",
    "ResumeIcon",
    "ScreenplayIcon",
    "StepIntoIcon",
    "StepOutIcon",
    "StepOverIcon",
    "StopIcon",
    "VisualIcon",
  ];
  return {
    Button: element("button"),
    SplitPane: ({ start, end }: { start: unknown; end: unknown }) =>
      h("div", {}, start as never, end as never),
    DropdownRoot: element("div"),
    DropdownTrigger: element("div"),
    DropdownContent: element("div"),
    DropdownItem: ({ disabled, onSelect, children, ...props }: any) =>
      h(
        "button",
        { ...props, role: "menuitem", disabled, onClick: () => onSelect?.(new Event("select")) },
        children,
      ),
    DropdownCheckboxItem: ({ checked, onCheckedChange, onSelect: _s, children, ...props }: any) =>
      h(
        "button",
        {
          ...props,
          role: "menuitemcheckbox",
          "aria-checked": String(!!checked),
          onClick: () => onCheckedChange?.(!checked),
        },
        children,
      ),
    DropdownRadioGroup: ({ value, onValueChange, children }: any) =>
      h(Radio.Provider, { value: { value, onValueChange } }, h("div", { role: "group" }, children)),
    DropdownRadioItem: function RadioItem({ value, children, ...props }: any) {
      const group = useContext(Radio);
      return h(
        "button",
        {
          ...props,
          role: "menuitemradio",
          "aria-checked": String(group.value === value),
          onClick: () => group.onValueChange?.(value),
        },
        children,
      );
    },
    useHoldRepeat: (action: () => void) => ({
      pressed: false,
      onPointerDown: () => {},
      onPointerUp: () => {},
      onPointerCancel: () => {},
      onPointerLeave: () => {},
      onClick: () => action(),
    }),
    ...Object.fromEntries(icons.map((name) => [name, element("svg")])),
  };
});

const channels = vi.hoisted(() => ({
  all: [] as {
    posted: unknown[];
    sent: [unknown, unknown][];
    responses: [unknown, unknown][];
    listeners: ((e: { data: unknown }) => void)[];
    receive: (message: unknown) => void;
  }[],
}));
vi.mock("@impower/jsonrpc/src/browser/classes/IFrameMessageConnection", () => ({
  IFrameMessageConnection: class {},
}));
vi.mock("@impower/jsonrpc/src/browser/classes/Port1MessageConnection", () => ({
  Port1MessageConnection: class {
    posted: unknown[] = [];
    responses: [unknown, unknown][] = [];
    listeners: ((e: { data: unknown }) => void)[] = [];
    constructor() {
      channels.all.push(this);
    }
    receive(message: unknown) {
      this.listeners.forEach((listener) => listener({ data: message }));
    }
    async connect() {}
    addEventListener(_type: string, listener: (e: { data: unknown }) => void) {
      this.listeners.push(listener);
    }
    removeEventListener() {}
    postMessage(message: unknown) {
      this.posted.push(message);
    }
    sent: [unknown, unknown][] = [];
    async sendRequest(type: unknown, params: unknown) {
      this.sent.push([type, params]);
      return {};
    }
    sendResponse(message: unknown, result: unknown) {
      this.responses.push([message, result]);
    }
  },
}));

import { h, render } from "preact";
import PreviewGame from "../../src/modules/spark-editor/components/preview-game/PreviewGame";
import { Workspace } from "../../src/modules/spark-editor/workspace/Workspace";
import { signal } from "@preact/signals";
import {
  createPlayerPreferenceSync,
  playerUrl,
} from "../../src/modules/spark-editor/components/preview-game/playerPreferences";
import PreviewTopBar from "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar";
import Preview from "../../src/modules/spark-editor/components/preview/Preview";
import PreviewScreenplay from "../../src/modules/spark-editor/components/preview-screenplay/PreviewScreenplay";
import WorkspacePrint from "../../src/modules/spark-editor/workspace/WorkspacePrint";
import { SCREENPLAY_SETTING_KEYS } from "../../src/modules/spark-editor/workspace/settings/screenplaySettings";
import workspaceSettings, {
  WorkspaceSettings,
} from "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings";
import { WorkspaceConstants } from "../../src/modules/spark-editor/workspace/WorkspaceConstants";
import workspace, {
  savedWorkspaceState,
} from "../../src/modules/spark-editor/workspace/WorkspaceStore";
import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";
import { barPosition } from "../../src/modules/spark-editor/components/preview-bar/barState";
import { downloadProjectZip } from "../../src/modules/spark-editor/utils/downloadProjectZip";

beforeEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
});

describe("WorkspaceWindow store transitions", () => {
  let win: WorkspaceWindow;

  beforeEach(() => {
    localStorage.clear();
    win = new WorkspaceWindow(Workspace);
  });

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

  it("getPaneType and getPanelType route a .luau file to the logic/scripts panel", () => {
    expect(win.getPaneType("scripts/util.luau")).toBe("logic");
    expect(win.getPanelType("scripts/util.luau")).toBe("scripts");
    expect(win.getPaneType("main.luau")).toBe("logic");
    expect(win.getPanelType("main.luau")).toBe("scripts");
  });

  it("getPaneType and getPanelType keep .sd routing and give other files no pane", () => {
    expect(win.getPaneType("main.sd")).toBe("logic");
    expect(win.getPanelType("main.sd")).toBe("main");
    expect(win.getPaneType("scripts/intro.sd")).toBe("logic");
    expect(win.getPanelType("scripts/intro.sd")).toBe("scripts");
    expect(win.getPaneType("assets/hero.png")).toBeNull();
    expect(win.getPanelType("assets/hero.png")).toBeNull();
    expect(win.getPaneType("assets/luau")).toBeNull();
    expect(win.getPanelType("assets/luau")).toBeNull();
  });

  it("openFileEditor opens a .luau file in the logic/scripts editor", () => {
    win.openFileEditor("scripts/util.luau");
    const editor = workspace.current.panes.logic.panels.scripts!.activeEditor;
    expect(editor?.open).toBe(true);
    expect(editor?.filename).toBe("scripts/util.luau");
    expect(win.getActiveEditorForFile("scripts/util.luau")?.filename).toBe(
      "scripts/util.luau",
    );
  });

  it("openFileEditor stores the full project-relative path for a nested script", () => {
    win.openFileEditor("chapters/intro.sd");
    const editor = workspace.current.panes.logic.panels.scripts!.activeEditor;
    expect(editor?.open).toBe(true);
    expect(editor?.filename).toBe("chapters/intro.sd");
  });

  it("getActiveEditorForFile distinguishes same-basename scripts in different folders", () => {
    win.openFileEditor("chapters/intro.sd");
    const active = win.getActiveEditorForFile("chapters/intro.sd");
    expect(active?.filename).toBe("chapters/intro.sd");
    expect(active?.uri.endsWith("/chapters/intro.sd")).toBe(true);
    expect(win.getActiveEditorForFile("acts/intro.sd")).toBeUndefined();
  });

  it("showDocument stores the project-relative path of a nested script", () => {
    const projectId = workspace.current.project.id;
    void win.showDocument(`file://${projectId}/scripts/intro.sd`);
    const editor = workspace.current.panes.logic.panels.scripts!.activeEditor;
    expect(editor?.filename).toBe("scripts/intro.sd");
  });

  it("showDocument keeps main.sd in the logic/main panel", () => {
    const projectId = workspace.current.project.id;
    void win.showDocument(`file://${projectId}/main.sd`);
    expect(workspace.current.panes.logic.panels.main!.activeEditor?.filename).toBe(
      "main.sd",
    );
  });

  it("showDocument resolves with success for a script and failure for a file with no editor", async () => {
    const projectId = workspace.current.project.id;
    await expect(
      win.showDocument(`file://${projectId}/scripts/intro.sd`, {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 0 },
      }),
    ).resolves.toEqual({ success: true });
    await expect(
      win.showDocument(`file://${projectId}/assets/hero.png`),
    ).resolves.toEqual({ success: false });
  });

  it("answers a window/showDocument request with its response", async () => {
    const projectId = workspace.current.project.id;
    const responses: unknown[] = [];
    const listener = (e: Event) => {
      if (
        e instanceof CustomEvent &&
        ShowDocumentMessage.type.isResponse(e.detail)
      ) {
        responses.push(e.detail);
      }
    };
    window.addEventListener(MessageProtocol.event, listener);
    try {
      const request = ShowDocumentMessage.type.request({
        uri: `file://${projectId}/scripts/intro.sd`,
      });
      sendProtocolMessage(request);
      await vi.waitFor(() =>
        expect(responses).toEqual([
          expect.objectContaining({
            id: request.id,
            result: { success: true },
          }),
        ]),
      );
    } finally {
      window.removeEventListener(MessageProtocol.event, listener);
    }
  });

  it("brings the script on screen for a window/showDocument request made from another route", async () => {
    const projectId = workspace.current.project.id;
    win.navigateTo("collection");
    expect(workspace.current.pane).toBe("assets");
    const at = { line: 4, character: 0 };
    const request = ShowDocumentMessage.type.request({
      uri: `file://${projectId}/scripts/chapter.sd`,
      selection: { start: at, end: at },
    });
    sendProtocolMessage(request);
    await vi.waitFor(() => expect(window.location.hash).toBe("#write"));
    expect(workspace.current.pane).toBe("logic");
    expect(win.getActiveEditorForPane("logic")?.filename).toBe(
      "scripts/chapter.sd",
    );
    expect(
      workspace.current.panes.logic.panels.scripts!.activeEditor?.selectedRange,
    ).toEqual({ start: at, end: at });
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

    it("an empty or blank commit restores the previous name without persisting", async () => {
      const write = vi.mocked(Workspace.fs.writeProjectMetadata);
      write.mockClear();
      workspace.current = {
        ...workspace.current,
        project: { ...workspace.current.project, name: "My story" },
      };
      win.startEditingProjectName();
      expect(await win.finishEditingProjectName("")).toBe(false);
      expect(workspace.current.project.name).toBe("My story");
      expect(await win.finishEditingProjectName("   ")).toBe(false);
      expect(workspace.current.project.name).toBe("My story");
      expect(workspace.current.screen.editingName).toBe(false);
      expect(write).not.toHaveBeenCalled();
    });

    it("an empty commit on a project with no name yet takes the default name", async () => {
      vi.spyOn(
        WorkspaceWindow.prototype,
        "recordScriptChange",
      ).mockResolvedValue(undefined as never);
      workspace.current = {
        ...workspace.current,
        project: { ...workspace.current.project, name: undefined },
      };
      await win.finishEditingProjectName("");
      expect(workspace.current.project.name).toBe("Untitled story");
      expect(WorkspaceConstants.DEFAULT_PROJECT_NAME).toBe("Untitled story");
    });

    it("a committed name is what Export Project downloads the zip as", async () => {
      vi.spyOn(
        WorkspaceWindow.prototype,
        "recordScriptChange",
      ).mockResolvedValue(undefined as never);
      const zip = new Uint8Array([1, 2, 3]);
      vi.spyOn(win, "exportLocalProject").mockResolvedValue(zip as never);
      current.window = win;
      downloads.mockClear();
      try {
        await win.finishEditingProjectName("My story");
        expect(await downloadProjectZip()).toBe(true);
        expect(downloads).toHaveBeenCalledTimes(1);
        expect(downloads.mock.calls[0]![0]).toBe("My story.zip");
        expect(downloads.mock.calls[0]![2]).toBe(zip);
        await win.finishEditingProjectName("");
        await downloadProjectZip();
        expect(downloads.mock.calls[1]![0]).toBe("My story.zip");
      } finally {
        current.window = undefined;
      }
    });
  });

  describe("the desktop shell", () => {
    it("keeps the rail width for the project and resets it to the default", async () => {
      win.setRailWidth(300);
      expect(workspace.current.shell?.railWidth).toBe(300);
      await new Promise((resolve) => setTimeout(resolve, 350));
      const id = workspace.current.project.id;
      const cached = JSON.parse(
        localStorage.getItem(
          WorkspaceConstants.WORKSPACE_STATE_STORAGE_KEY_PREFIX + id,
        )!,
      );
      expect(cached.shell.railWidth).toBe(300);
      win.setRailWidth(undefined);
      expect(workspace.current.shell?.railWidth).toBeUndefined();
    });

    it("keeps each script's collapsed outline scenes across a reload, and the outline's search swap only for the session", async () => {
      const uri = "file://outline/main.sd";
      win.setOutlineSceneCollapsed(uri, "harbor#0", true);
      win.setOutlineSceneCollapsed(uri, "harbor#0", true);
      win.setOutlineSceneCollapsed("file://outline/other.sd", "dock#0", true);
      expect(workspace.current.outline?.collapsed?.[uri]).toEqual(["harbor#0"]);
      win.setOutlineSearch(true);
      expect(workspace.current.screen.outlineSearch).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 350));
      localStorage.setItem(
        WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY,
        workspace.current.project.id ?? "",
      );
      const reloaded = savedWorkspaceState();
      expect(reloaded.outline?.collapsed).toEqual({
        [uri]: ["harbor#0"],
        "file://outline/other.sd": ["dock#0"],
      });
      expect(reloaded.screen.outlineSearch).toBeUndefined();
      win.setOutlineSearch(false);
      win.setOutlineSceneCollapsed(uri, "harbor#0", false);
      expect(workspace.current.outline?.collapsed).toEqual({
        "file://outline/other.sd": ["dock#0"],
      });
    });

    it("keeps the strip height and the compact rail for the project and resets them", async () => {
      win.setStripHeight(320);
      win.setRailCompactWidth(76);
      expect(workspace.current.shell?.stripHeight).toBe(320);
      expect(workspace.current.shell?.railCompactWidth).toBe(76);
      await new Promise((resolve) => setTimeout(resolve, 350));
      const id = workspace.current.project.id;
      const cached = JSON.parse(
        localStorage.getItem(
          WorkspaceConstants.WORKSPACE_STATE_STORAGE_KEY_PREFIX + id,
        )!,
      );
      expect(cached.shell.stripHeight).toBe(320);
      expect(cached.shell.railCompactWidth).toBe(76);
      win.setStripHeight(48);
      expect(workspace.current.shell?.stripHeight).toBe(48);
      win.setStripHeight(undefined);
      win.setRailCompactWidth(undefined);
      expect(workspace.current.shell?.stripHeight).toBeUndefined();
      expect(workspace.current.shell?.railCompactWidth).toBeUndefined();
    });

    it("writes the current route into the location hash", () => {
      win.openView("logic", "list");
      win.openPanel("logic", "main");
      win.openPane("logic");
      expect(window.location.hash).toBe("#write");
      win.openPane("assets");
      expect(window.location.hash).toBe("#collection");
      win.openPane("share");
      expect(window.location.hash).toBe("#share");
      win.openPanel("logic", "scripts");
      win.openPane("logic");
      expect(window.location.hash).toBe("#scripts");
    });

    it("navigates by pushing a history entry, and follows the hash back", async () => {
      const length = window.history.length;
      win.navigateTo("collection");
      expect(window.location.hash).toBe("#collection");
      expect(window.history.length).toBe(length + 1);
      expect(workspace.current.pane).toBe("assets");
      window.history.replaceState(null, "", "#share");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      expect(workspace.current.pane).toBe("share");
    });

    it("opens settings on #project over the current pane and returns on close", () => {
      win.openPane("assets");
      win.navigateTo("project");
      expect(workspace.current.screen.settingsOpen).toBe(true);
      expect(workspace.current.pane).toBe("assets");
      expect(window.location.hash).toBe("#project");
      win.closeSettings();
      expect(workspace.current.screen.settingsOpen).toBe(false);
      expect(window.location.hash).toBe("#collection");
    });

    it("leaves the hash alone for a change that does not move the route", () => {
      window.history.pushState(null, "", "#project");
      win.setAppMenuOpen(true);
      win.setAppMenuOpen(false);
      expect(window.location.hash).toBe("#project");
    });

    it("opens the writing tools, moves between their views and closes them", () => {
      win.setAppMenuOpen(true);
      win.openWritingTools();
      expect(workspace.current.screen.appMenuOpen).toBe(false);
      expect(workspace.current.screen.writingTools).toEqual({ view: "menu", fromMenu: false });
      win.showWritingToolsView("shortcuts");
      expect(workspace.current.screen.writingTools).toEqual({ view: "shortcuts", fromMenu: true });
      win.showWritingToolsView("menu");
      expect(workspace.current.screen.writingTools).toEqual({ view: "menu", fromMenu: false });
      win.closeWritingTools();
      expect(workspace.current.screen.writingTools).toBeUndefined();
      win.showWritingToolsView("guide");
      expect(workspace.current.screen.writingTools).toBeUndefined();
    });

    it("reads by default, edits from Edit and reads again from Done", () => {
      const commands = vi.spyOn(win, "executeEditorCommand");
      expect(workspace.scriptMode.value).toBe("reading");

      win.startEditing("main.sd");
      expect(workspace.scriptMode.value).toBe("editing");
      expect(commands).toHaveBeenCalledWith("main.sd", "focus");

      win.finishEditing();
      expect(workspace.scriptMode.value).toBe("reading");
    });

    it("counts each panel standing in the keyboard's place while it is registered", () => {
      const removeTools = workspace.addKeyboardPanel({ heading: true });
      const removeSearch = workspace.addKeyboardPanel({ heading: false });
      expect(workspace.keyboardPanels.value).toHaveLength(2);
      expect(workspace.keyboardPanels.value.some((p) => p.heading)).toBe(true);

      removeTools();
      expect(workspace.keyboardPanels.value).toEqual([{ heading: false }]);
      removeSearch();
      expect(workspace.keyboardPanels.value).toEqual([]);
    });

    it("opens the Sparkdown guide on its own from another route, and closes it on leaving Write", () => {
      win.navigateTo("collection");
      win.openSparkdownGuide();
      expect(window.location.hash).toBe("#write");
      expect(workspace.current.pane).toBe("logic");
      expect(workspace.current.screen.writingTools).toEqual({ view: "guide", fromMenu: false });
      win.navigateTo("share");
      expect(workspace.current.screen.writingTools).toBeUndefined();
    });

    it("opens the route a deep link names, and maps a legacy name onto its route", () => {
      win.dispose();
      window.history.replaceState(null, "", "#assets");
      win = new WorkspaceWindow(Workspace);
      expect(workspace.current.pane).toBe("assets");
      expect(window.location.hash).toBe("#collection");
    });

    it("keeps a settings deep link's section in the hash while it opens the page", () => {
      win.dispose();
      window.history.replaceState(null, "", "#project?section=save-settings");
      win = new WorkspaceWindow(Workspace);
      expect(workspace.current.screen.settingsOpen).toBe(true);
      expect(window.location.hash).toBe("#project?section=save-settings");
    });

    it("navigates to a settings section, telling an open settings page to land on it", () => {
      const landed = vi.fn();
      window.addEventListener("hashchange", landed);
      try {
        win.closeSettings();
        win.navigateTo("project", "save-settings");
        expect(workspace.current.screen.settingsOpen).toBe(true);
        expect(window.location.hash).toBe("#project?section=save-settings");
        expect(landed).not.toHaveBeenCalled();
        window.history.replaceState(null, "", "#project");
        win.navigateTo("project", "save-settings");
        expect(window.location.hash).toBe("#project?section=save-settings");
        expect(landed).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener("hashchange", landed);
      }
    });
  });

  describe("replacing the project from a backup", () => {
    const fs = Workspace.fs as unknown as Record<string, unknown>;
    let project: typeof workspace.current.project;

    beforeEach(() => {
      project = workspace.current.project;
      const id = workspace.current.project.id || "local";
      workspace.current = {
        ...workspace.current,
        project: { ...workspace.current.project, id, name: "Raffles" },
      };
      fs.getFiles = vi.fn(async () =>
        Object.fromEntries(
          [
            ".name",
            ".folders",
            ".vscode/settings.json",
            "main.sd",
            "scripts/act1.sd",
            "scripts/util.luau",
            "images/cover.png",
            "audio/theme.mp3",
            ".layout",
            ".drafts/scene.sd",
            ".images/cover.png",
          ].map((path) => [`file://${id}/${path}`, { uri: `file://${id}/${path}` }]),
        ),
      );
    });

    afterEach(() => {
      delete fs.getFiles;
      workspace.replaceProject.value = null;
      workspace.current = { ...workspace.current, project };
    });

    it("asks before importing, counting every script and asset the replace removes, dot folders included", async () => {
      const importing = vi
        .spyOn(win, "importLocalProject")
        .mockResolvedValue(undefined);
      await win.requestProjectReplace(new File(["zip"], "backup.zip"));
      expect(workspace.replaceProject.value).toEqual({
        fileName: "backup.zip",
        projectName: "Raffles",
        scripts: 4,
        assets: 3,
      });
      expect(importing).not.toHaveBeenCalled();
    });

    it("imports the chosen backup only once the writer confirms", async () => {
      const importing = vi
        .spyOn(win, "importLocalProject")
        .mockResolvedValue(undefined);
      const file = Object.assign(new File(["zip"], "backup.zip"), {
        arrayBuffer: async () => new TextEncoder().encode("zip").buffer,
      });
      await win.requestProjectReplace(file);
      await win.confirmProjectReplace();
      expect(workspace.replaceProject.value).toBeNull();
      expect(importing).toHaveBeenCalledTimes(1);
      expect(importing.mock.calls[0]![0]).toBe("backup.zip");
      expect(new TextDecoder().decode(importing.mock.calls[0]![1])).toBe("zip");
    });

    it("drops the chosen backup on cancel, so a later confirm imports nothing", async () => {
      const importing = vi
        .spyOn(win, "importLocalProject")
        .mockResolvedValue(undefined);
      await win.requestProjectReplace(new File(["zip"], "backup.zip"));
      win.cancelProjectReplace();
      expect(workspace.replaceProject.value).toBeNull();
      await win.confirmProjectReplace();
      expect(importing).not.toHaveBeenCalled();
    });
  });
});

const PREVIEW_DEFAULTS = {
  previewMode: "game",
  previewFollowsCursor: true,
  previewIdleAnimations: true,
  previewTypingPauses: false,
  previewScreenplaySync: true,
  screenplayPaper: "paper",
  screenplayPaperTexture: false,
} as const;

const resetPreviewPreferences = () => {
  for (const [key, value] of Object.entries(PREVIEW_DEFAULTS)) {
    workspaceSettings.setPreference(key as keyof typeof PREVIEW_DEFAULTS, value);
  }
  localStorage.clear();
};

const isPlayerPreference = (message: unknown) =>
  SetAnimatePortraitsMessage.type.is(message) ||
  EnableGameDebugMessage.type.is(message) ||
  DisableGameDebugMessage.type.is(message);

const describePlayerPreference = (message: unknown) => {
  if (SetAnimatePortraitsMessage.type.is(message)) {
    return `idle animations ${(message as SetAnimatePortraitsMessage.Request).params.enabled ? "on" : "off"}`;
  }
  return EnableGameDebugMessage.type.is(message)
    ? "typing pauses on"
    : "typing pauses off";
};

describe("Preview preferences", () => {
  let windows: WorkspaceWindow[] = [];

  const load = () => {
    const win = new WorkspaceWindow(Workspace);
    windows.push(win);
    return win;
  };

  beforeEach(() => {
    resetPreviewPreferences();
  });

  afterEach(() => {
    windows.forEach((win) => win.dispose());
    windows = [];
    resetPreviewPreferences();
  });

  it("keeps the viewing mode as a per-user preference that survives a reload in another project", () => {
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "a");
    load().setPreviewMode("screenplay");
    expect(workspaceSettings.preferences.value.previewMode).toBe("screenplay");
    const reloaded = new WorkspaceSettings(signal("b"));
    expect(reloaded.preferences.value.previewMode).toBe("screenplay");
    reloaded.dispose();
  });

  it("stops a running game when the viewing mode changes", () => {
    const win = load();
    win.startGame();
    expect(workspace.current.preview.modes.game.running).toBe(true);
    win.setPreviewMode("screenplay");
    expect(workspace.current.preview.modes.game.running).toBe(false);
  });

  it("keeps the quick toggles across a reload", () => {
    workspaceSettings.setPreference("previewIdleAnimations", false);
    workspaceSettings.setPreference("previewTypingPauses", true);
    const reloaded = new WorkspaceSettings(signal("local"));
    expect(reloaded.preferences.value.previewIdleAnimations).toBe(false);
    expect(reloaded.preferences.value.previewTypingPauses).toBe(true);
    reloaded.dispose();
  });

  describe("a connecting player", () => {
    const connected = (type: "game" | "screenplay") => ({
      jsonrpc: "2.0",
      method: "preview/connected",
      params: { type },
    });

    it("hears idle animations and typing pauses when it connects, and every later change", () => {
      workspaceSettings.setPreference("previewIdleAnimations", false);
      const posted: unknown[] = [];
      const sync = createPlayerPreferenceSync((m) => posted.push(m));
      sync.received(connected("game"));
      workspaceSettings.setPreference("previewIdleAnimations", true);
      workspaceSettings.setPreference("previewTypingPauses", true);
      workspaceSettings.setPreference("previewTypingPauses", false);
      sync.dispose();
      workspaceSettings.setPreference("previewIdleAnimations", false);
      expect(
        posted.filter(isPlayerPreference).map(describePlayerPreference),
      ).toEqual([
        "idle animations off",
        "typing pauses off",
        "idle animations on",
        "typing pauses on",
        "typing pauses off",
      ]);
    });

    it("hears the route list's toggles the author last chose, in every project", () => {
      const posted: { method: string; params: any }[] = [];
      const sync = createPlayerPreferenceSync((m) => posted.push(m as any));
      const toggles = () =>
        posted
          .filter((m) => m.method === "preview/setRouteToggles")
          .map((m) => m.params.toggles);
      sync.received(connected("game"));
      expect(toggles()).toEqual([{}]);
      sync.received({
        jsonrpc: "2.0",
        method: "preview/didChangeRouteToggles",
        params: {
          toggles: { pinned: true, auto: false, forced: true, clipped: true },
        },
      });
      localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "b");
      createPlayerPreferenceSync((m) => posted.push(m as any)).initialized();
      expect(toggles().at(-1)).toEqual({
        pinned: true,
        auto: false,
        forced: true,
        clipped: true,
      });
    });

    it("hears the editor's resolved theme in its URL, when it connects, and whenever it changes", () => {
      const theme = signal<string>("charcoal");
      expect(playerUrl("https://player.test/", theme)).toBe(
        "https://player.test/#theme=charcoal",
      );
      const posted: { method: string; params: any }[] = [];
      const sync = createPlayerPreferenceSync(
        (m) => posted.push(m as any),
        () => [],
        theme,
      );
      const themes = () =>
        posted
          .filter((m) => m.method === "preview/setTheme")
          .map((m) => m.params.theme);
      expect(themes()).toEqual([]);
      sync.received(connected("game"));
      theme.value = "chalk";
      sync.initialized();
      expect(themes()).toEqual(["charcoal", "chalk", "chalk"]);
      sync.dispose();
      theme.value = "midnight";
      expect(themes().at(-1)).toBe("chalk");
    });

    it("is what the game preview sends each player it connects to", async () => {
      const win = load();
      workspaceSettings.setPreference("previewIdleAnimations", false);
      current.window = win;
      Object.assign(Workspace.fs, {
        getFiles: async () => ({}),
        getDirectoryUri: async () => "file://local",
      });
      (Workspace as unknown as { configuration: unknown }).configuration = {
        settings: {},
      };
      const container = document.createElement("div");
      document.body.append(container);
      const portraits = (posted: unknown[]) =>
        posted
          .filter((m) => SetAnimatePortraitsMessage.type.is(m))
          .map((m) => (m as SetAnimatePortraitsMessage.Request).params.enabled);
      try {
        channels.all = [];
        render(h(PreviewGame, {}), container);
        const iframe = container.querySelector("iframe")!;
        iframe.dispatchEvent(new Event("load"));
        await vi.waitFor(() => expect(channels.all).toHaveLength(1), {
          timeout: 15000,
        });
        const channel = channels.all[0]!;
        await vi.waitFor(() => expect(portraits(channel.posted)).toEqual([false]));
        channel.receive({
          jsonrpc: "2.0",
          method: "preview/connected",
          params: { type: "game" },
        });
        expect(portraits(channel.posted)).toEqual([false, false]);
        iframe.dispatchEvent(new Event("load"));
        await vi.waitFor(() => expect(channels.all).toHaveLength(2));
        await vi.waitFor(() =>
          expect(portraits(channels.all[1]!.posted)).toEqual([false]),
        );
      } finally {
        render(null, container);
        container.remove();
        current.window = undefined;
      }
    }, 30000);

    it("starts the player in the script open when it initializes, not the one open when it read the files", async () => {
      const before = workspace.current;
      const win = load();
      current.window = win;
      const uriOf = (path: string) =>
        `file://${workspace.current.project.id}/${path}`;
      win.openPane("logic");
      await win.showDocument(uriOf("main.sd"));
      let answer: ((uri: string) => void) | undefined;
      Object.assign(Workspace.fs, {
        getFiles: async () => ({}),
        getDirectoryUri: () =>
          new Promise<string>((resolve) => (answer = resolve)),
      });
      (Workspace as unknown as { configuration: unknown }).configuration = {
        settings: {},
      };
      const container = document.createElement("div");
      document.body.append(container);
      const initialized = (sent: [unknown, unknown][]) =>
        sent
          .map(([, params]) => params as { initializationOptions?: { uri?: string } })
          .filter((params) => params?.initializationOptions)
          .map((params) => params.initializationOptions!.uri);
      try {
        channels.all = [];
        render(h(PreviewGame, {}), container);
        container.querySelector("iframe")!.dispatchEvent(new Event("load"));
        await vi.waitFor(() => expect(channels.all).toHaveLength(1), {
          timeout: 15000,
        });
        await vi.waitFor(() => expect(answer).toBeDefined());
        await win.showDocument(uriOf("scripts/intro.sd"));
        answer!("file://local");
        await vi.waitFor(() =>
          expect(initialized(channels.all[0]!.sent)).toEqual([
            uriOf("scripts/intro.sd"),
          ]),
        );
      } finally {
        render(null, container);
        container.remove();
        current.window = undefined;
        workspace.current = before;
      }
    }, 30000);

    it("shows the player's frame from mount and connects it once it loads", async () => {
      current.window = load();
      Object.assign(Workspace.fs, {
        getFiles: async () => ({}),
        getDirectoryUri: async () => "file://local",
      });
      (Workspace as unknown as { configuration: unknown }).configuration = {
        settings: {},
      };
      const container = document.createElement("div");
      document.body.append(container);
      try {
        channels.all = [];
        render(h(PreviewGame, {}), container);
        const iframe = container.querySelector("iframe")!;
        expect(getComputedStyle(iframe).visibility).toBe("visible");
        iframe.dispatchEvent(new Event("load"));
        await vi.waitFor(() => expect(channels.all).toHaveLength(1), {
          timeout: 15000,
        });
        expect(getComputedStyle(iframe).visibility).toBe("visible");
      } finally {
        render(null, container);
        container.remove();
        current.window = undefined;
      }
    }, 30000);

    it("hears a settings change once it has initialized", async () => {
      current.window = load();
      Object.assign(Workspace.fs, {
        getFiles: async () => ({}),
        getDirectoryUri: async () => "file://local",
      });
      (Workspace as unknown as { configuration: unknown }).configuration = {
        settings: {},
      };
      const container = document.createElement("div");
      document.body.append(container);
      const configurations = (posted: unknown[]) =>
        posted
          .filter((m) => DidChangeConfigurationMessage.type.is(m))
          .map((m) => (m as { params: unknown }).params);
      try {
        channels.all = [];
        render(h(PreviewGame, {}), container);
        container.querySelector("iframe")!.dispatchEvent(new Event("load"));
        await vi.waitFor(() => expect(channels.all).toHaveLength(1), {
          timeout: 15000,
        });
        const settings = { imageFiles: "*.{png}" };
        sendProtocolMessage(
          DidChangeConfigurationMessage.type.notification({ settings }),
        );
        await vi.waitFor(() =>
          expect(configurations(channels.all[0]!.posted)).toEqual([
            { settings },
          ]),
        );
      } finally {
        render(null, container);
        container.remove();
        current.window = undefined;
      }
    }, 30000);

    it("ignores the screenplay preview and other messages", () => {
      const posted: unknown[] = [];
      const sync = createPlayerPreferenceSync((m) => posted.push(m));
      sync.received(connected("screenplay"));
      sync.received({ jsonrpc: "2.0", method: "game/started", params: {} });
      expect(posted).toEqual([]);
    });
  });
});

describe("Route pins", () => {
  let windows: WorkspaceWindow[] = [];
  let sent: { method: string; params: any }[] = [];

  const listener = (e: Event) => {
    if (e instanceof CustomEvent && "id" in e.detail && "params" in e.detail) {
      sent.push(e.detail);
    }
  };

  const load = () => {
    const win = new WorkspaceWindow(Workspace);
    windows.push(win);
    return win;
  };

  const MAIN = "file://a/main.sd";
  const OTHER = "file://a/other.sd";

  const sentPins = (method: string) =>
    sent.filter((m) => m.method === method).map((m) => m.params.pins);

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "a");
    workspace.current = {
      ...workspace.current,
      debug: { ...workspace.current.debug, routePins: {} },
    };
    sent = [];
    window.addEventListener(MessageProtocol.event, listener);
  });

  afterEach(() => {
    window.removeEventListener(MessageProtocol.event, listener);
    windows.forEach((win) => win.dispose());
    windows = [];
  });

  it("a change from the route list pins, unpins and clears, and goes to the player and the editors", () => {
    const win = load();
    expect(
      win.changeRoutePins({
        add: [
          { uri: MAIN, line: 7, offer: 1 },
          { uri: OTHER, line: 2, offer: 2 },
        ],
      }),
    ).toEqual([
      { uri: MAIN, line: 7, offer: 1 },
      { uri: OTHER, line: 2, offer: 2 },
    ]);
    expect(
      win.changeRoutePins({
        add: [{ uri: MAIN, line: 11, offer: 1 }],
        remove: [{ uri: MAIN, line: 7, offer: 1 }],
      }),
    ).toEqual([
      { uri: MAIN, line: 11, offer: 1 },
      { uri: OTHER, line: 2, offer: 2 },
    ]);
    expect(win.changeRoutePins({ removeAll: true })).toEqual([]);
    const expected = [
      [
        { uri: MAIN, line: 7, offer: 1 },
        { uri: OTHER, line: 2, offer: 2 },
      ],
      [
        { uri: MAIN, line: 11, offer: 1 },
        { uri: OTHER, line: 2, offer: 2 },
      ],
      [],
    ];
    expect(sentPins("preview/setRoutePins")).toEqual(expected);
    expect(sentPins("editor/setRoutePins")).toEqual(expected);
  });

  it("an edit that moves a pin goes to the player, and not back to the editor that made it", () => {
    const win = load();
    win.changeRoutePins({ add: [{ uri: MAIN, line: 7, offer: 1 }] });
    sent = [];
    sendProtocolMessage(
      ChangedEditorRoutePinsMessage.type.notification({
        textDocument: { uri: MAIN },
        pins: [{ line: 10, offer: 1 }],
      }),
    );
    expect(win.getRoutePins()).toEqual([{ uri: MAIN, line: 10, offer: 1 }]);
    expect(sentPins("preview/setRoutePins")).toEqual([
      [{ uri: MAIN, line: 10, offer: 1 }],
    ]);
    expect(sentPins("editor/setRoutePins")).toEqual([]);
  });

  it("are kept for the project through an editor reload, and loaded into its script's editor", async () => {
    const win = load();
    win.openFileEditor("main.sd");
    win.changeRoutePins({ add: [{ uri: MAIN, line: 7, offer: 1 }] });
    await new Promise((resolve) => setTimeout(resolve, 400));
    win.dispose();
    windows = [];
    workspace.current = savedWorkspaceState();
    const reloaded = load();
    expect(reloaded.getRoutePins()).toEqual([{ uri: MAIN, line: 7, offer: 1 }]);
    expect(reloaded.getActiveEditorForFile("main.sd")?.routePins).toEqual([
      { line: 7, offer: 1 },
    ]);
  });

  it("are what a connecting player hears", () => {
    const posted: { method: string; params: any }[] = [];
    const sync = createPlayerPreferenceSync(
      (m) => posted.push(m as any),
      () => [{ uri: MAIN, line: 7, offer: 1 }],
    );
    sync.received({
      jsonrpc: "2.0",
      method: "preview/connected",
      params: { type: "game" },
    });
    expect(
      posted
        .filter((m) => m.method === "preview/setRoutePins")
        .map((m) => m.params.pins),
    ).toEqual([[{ uri: MAIN, line: 7, offer: 1 }]]);
  });
});

describe("Starting values", () => {
  let windows: WorkspaceWindow[] = [];
  let sent: { method: string; params: any }[] = [];
  const listener = (e: Event) => {
    if (e instanceof CustomEvent && typeof e.detail?.method === "string") {
      sent.push(e.detail);
    }
  };
  const load = () => {
    const win = new WorkspaceWindow(Workspace);
    windows.push(win);
    return win;
  };
  const OPTION = "place:0:12:file:///main.sd";
  const freshPage = () => {
    workspace.current = {
      ...workspace.current,
      debug: { ...workspace.current.debug, startingValues: undefined },
    };
  };

  beforeEach(() => {
    localStorage.clear();
    freshPage();
    sent = [];
    window.addEventListener(MessageProtocol.event, listener);
  });

  afterEach(() => {
    window.removeEventListener(MessageProtocol.event, listener);
    windows.forEach((win) => win.dispose());
    windows = [];
  });

  it("keeps a change, sends every start's values to the player and the option lines to the editor", () => {
    const win = load();
    win.changeStartingValues("interrogation", {
      "param:hour": '"nine"',
      [OPTION]: "1",
    });
    win.changeStartingValues("interrogation", { "param:hour": null });
    expect(win.startingValues).toEqual({ interrogation: { [OPTION]: "1" } });
    const toPlayer = sent.filter((m) => m.method === "preview/setStartingValues");
    expect(toPlayer.at(-1)!.params.values).toEqual({
      interrogation: { [OPTION]: "1" },
    });
    const toEditor = sent.filter(
      (m) => m.method === "editor/setStartingValueLines",
    );
    expect(toEditor.at(-1)!.params.scripts).toEqual([
      { uri: "file:///main.sd", lines: [12] },
    ]);
  });

  it("survives an editor reload, and is kept per project", async () => {
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "a");
    load().changeStartingValues("s", { "store:trust": "2" });
    await new Promise((resolve) => setTimeout(resolve, 400));
    workspace.current = savedWorkspaceState();
    expect(load().startingValues).toEqual({ s: { "store:trust": "2" } });
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "b");
    workspace.current = savedWorkspaceState();
    expect(load().startingValues).toEqual({});
  });

  it("moves an option's value with its line when an edit moves the line, and detaches it when the line is deleted", () => {
    const win = load();
    win.changeStartingValues("s", {
      [OPTION]: "1",
      "place:0:14:file:///main.sd": "2",
    });
    sent = [];
    window.dispatchEvent(
      new CustomEvent(MessageProtocol.event, {
        detail: {
          jsonrpc: "2.0",
          method: "editor/startingValueLinesChanged",
          params: {
            textDocument: { uri: "file:///main.sd" },
            moves: [
              [12, 14],
              [14, null],
            ],
          },
        },
      }),
    );
    expect(win.startingValues).toEqual({
      s: {
        "place:0:14:file:///main.sd": "1",
        "place:0:~14:file:///main.sd": "2",
      },
    });
    expect(
      sent.filter((m) => m.method === "preview/setStartingValues").at(-1)!
        .params.values,
    ).toEqual(win.startingValues);
  });

  it("is what a connecting player hears, with the route panel's tab", () => {
    load().changeStartingValues("s", { seed: "7" });
    const posted: { method: string; params: any }[] = [];
    const sync = createPlayerPreferenceSync((m) => posted.push(m as any));
    sync.received({
      jsonrpc: "2.0",
      method: "preview/didChangeRouteToggles",
      params: { toggles: {}, tab: "values" },
    });
    sync.received({
      jsonrpc: "2.0",
      method: "preview/connected",
      params: { type: "game" },
    });
    expect(
      posted.find((m) => m.method === "preview/setStartingValues")!.params
        .values,
    ).toEqual({ s: { seed: "7" } });
    expect(
      posted.find((m) => m.method === "preview/setRouteToggles")!.params.tab,
    ).toBe("values");
  });
});

describe("PLAY for a story with no start scene", () => {
  let win: WorkspaceWindow;
  let container: HTMLElement;
  let started: StartGameMessage.Request[] = [];

  const STORY = "file://proj/main.sd";

  const listener = (e: Event) => {
    if (e instanceof CustomEvent && StartGameMessage.type.isRequest(e.detail)) {
      started.push(e.detail);
    }
  };

  const compiled = (uri: string, playRefusal?: string) =>
    sendProtocolMessage(
      CompiledProgramMessage.type.notification({
        textDocument: { uri, version: 1 },
        program: { uri, scripts: { [uri]: 1 }, files: {}, playRefusal },
      }),
    );

  const play = () => {
    render(h(PreviewTopBar, {}), container);
    return container.querySelector<HTMLButtonElement>(
      'button[aria-label="Play From Here"]',
    );
  };

  const game = () => workspace.current.preview.modes.game;

  beforeEach(() => {
    localStorage.clear();
    started = [];
    window.addEventListener(MessageProtocol.event, listener);
    win = new WorkspaceWindow(Workspace);
    current.window = win;
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: "proj" },
      preview: {
        ...workspace.current.preview,
        modes: { ...workspace.current.preview.modes, game: {} },
      },
    };
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
    current.window = undefined;
    window.removeEventListener(MessageProtocol.event, listener);
    win.dispose();
  });

  it("disables PLAY with the missing-start message until a start scene compiles", async () => {
    compiled(STORY, NO_START_SCENE_MESSAGE);
    expect(play()?.getAttribute("aria-disabled")).toBe("true");
    expect(play()?.getAttribute("title")).toBe(NO_START_SCENE_MESSAGE);
    play()!.click();
    win.toggleGameRunning();
    await Promise.resolve();
    expect(started).toEqual([]);
    expect(game().running).toBeFalsy();

    compiled(STORY);
    expect(play()?.getAttribute("aria-disabled")).toBeNull();
    expect(play()?.getAttribute("title")).toBe("Play From Here");
  });

  it("keeps the story's refusal when a script the story does not include compiles on its own", () => {
    compiled(STORY);
    compiled("file://proj/elsewhere/stray.sd", NO_START_SCENE_MESSAGE);
    expect(game().playRefusal).toBeUndefined();
    compiled(STORY, NO_START_SCENE_MESSAGE);
    compiled("file://proj/elsewhere/stray.sd");
    expect(game().playRefusal).toBe(NO_START_SCENE_MESSAGE);
  });

  it("stops showing a game as running when the player refuses a PLAY asked for before the refusal arrived", () => {
    win.toggleGameRunning();
    expect(started).toHaveLength(1);
    expect(game().running).toBe(true);
    compiled(STORY, NO_START_SCENE_MESSAGE);
    sendProtocolMessage(
      StartGameMessage.type.error(started[0]!.id, {
        code: 1,
        message: NO_START_SCENE_MESSAGE,
      }),
    );
    expect(game().running).toBe(false);
    expect(play()?.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps a started game running when the player answers PLAY with success", () => {
    win.toggleGameRunning();
    sendProtocolMessage(
      StartGameMessage.type.response(started[0]!.id, { success: true }),
    );
    expect(game().running).toBe(true);
  });
});

describe("Choosing during a Screenplay play-through", () => {
  let win: WorkspaceWindow;
  let container: HTMLElement;
  const stopped: unknown[] = [];
  const hearStop = (e: Event) => {
    if (e instanceof CustomEvent && e.detail?.method === "game/stop") stopped.push(e.detail);
  };

  const stage = () => container.querySelector("iframe#iframe")!.parentElement!.parentElement!;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "a");
    workspace.current = savedWorkspaceState();
    win = new WorkspaceWindow(Workspace);
    current.window = win;
    Object.assign(Workspace.fs, {
      getFiles: async () => ({}),
      getDirectoryUri: async () => "file://a",
    });
    (Workspace as unknown as { configuration: unknown }).configuration = { settings: {} };
    workspaceSettings.setPreference("previewMode", "screenplay");
    container = document.createElement("div");
    document.body.append(container);
    channels.all = [];
    stopped.length = 0;
    window.addEventListener(MessageProtocol.event, hearStop);
  });

  afterEach(() => {
    window.removeEventListener(MessageProtocol.event, hearStop);
    render(null, container);
    container.remove();
    win.dispose();
    current.window = undefined;
    resetPreviewPreferences();
  });

  it("shows the game's stage over the page while the story waits on a choice, and hides it after the pick without stopping the run", async () => {
    render(h(Preview, {}), container);
    container.querySelector("iframe")!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(channels.all).toHaveLength(1), { timeout: 15000 });
    const channel = channels.all[0]!;
    win.startGame();
    const location = { uri: "file://a/main.sd", range: { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } } };

    channel.receive({ jsonrpc: "2.0", method: "game/awaitingInteraction", params: { location, choices: false } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    render(h(Preview, {}), container);
    expect(stage().className).toBe("hidden");

    channel.receive({ jsonrpc: "2.0", method: "game/awaitingInteraction", params: { location, choices: true } });
    await vi.waitFor(() => expect(workspace.current.preview.modes.game.choosing).toBe(true));
    render(h(Preview, {}), container);
    expect(stage().className).not.toContain("hidden");
    expect(stage().hasAttribute("data-choosing")).toBe(true);
    expect(container.querySelector('[role="region"][aria-label="Screenplay"]')).not.toBeNull();

    channel.receive({ jsonrpc: "2.0", method: "game/chosePathToContinue", params: { location } });
    await vi.waitFor(() => expect(workspace.current.preview.modes.game.choosing).toBe(false));
    render(h(Preview, {}), container);
    expect(stage().className).toBe("hidden");
    expect(workspace.current.preview.modes.game.running).toBe(true);
    expect(stopped).toEqual([]);
  }, 30000);

  it("keeps the option the engine reports picked, and only that one, for the rest of the run, and forgets picks when the run stops", async () => {
    render(h(Preview, {}), container);
    container.querySelector("iframe")!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(channels.all).toHaveLength(1), { timeout: 15000 });
    const channel = channels.all[0]!;
    win.startGame();
    const uri = "file://a/main.sd";
    const at = (line: number) => ({ uri, range: { start: { line, character: 2 }, end: { line, character: 2 } } });
    const executed = (ranges: number[]) => ({
      jsonrpc: "2.0",
      method: "game/executed",
      params: { executedLines: { [uri]: { ranges, last: ranges.at(-1) } }, state: "running", conditions: [], choices: [] },
    });

    channel.receive({ jsonrpc: "2.0", method: "game/awaitingInteraction", params: { location: at(2), choices: true } });
    channel.receive(executed([2, 4]));
    await vi.waitFor(() => expect(workspace.current.preview.modes.game.choosing).toBe(true));
    channel.receive({ jsonrpc: "2.0", method: "game/chosePathToContinue", params: { location: at(2), option: at(4) } });
    channel.receive(executed([2, 4, 6, 6]));
    await vi.waitFor(() => expect(workspace.current.preview.modes.game.picks).toEqual({ [uri]: [4] }));
    expect(workspace.current.preview.modes.game.choosing).toBe(false);

    channel.receive({ jsonrpc: "2.0", method: "game/awaitingInteraction", params: { location: at(7), choices: false } });
    channel.receive(executed([7, 7]));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(workspace.current.preview.modes.game.picks).toEqual({ [uri]: [4] });

    win.stopGame();
    expect(workspace.current.preview.modes.game.picks).toEqual({});
  }, 30000);
});

describe("The game preview's player bar", () => {
  const MAIN = "file://a/main.sd";
  let win: WorkspaceWindow;
  let container: HTMLElement;

  const mount = async () => {
    localStorage.clear();
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "a");
    workspace.current = savedWorkspaceState();
    win = new WorkspaceWindow(Workspace);
    current.window = win;
    Object.assign(Workspace.fs, {
      getFiles: async () => ({}),
      getDirectoryUri: async () => "file://a",
    });
    (Workspace as unknown as { configuration: unknown }).configuration = {
      settings: {},
    };
    container = document.createElement("div");
    document.body.append(container);
    channels.all = [];
    render(h(PreviewGame, {}), container);
    const iframe = container.querySelector("iframe")!;
    iframe.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(channels.all).toHaveLength(1), {
      timeout: 15000,
    });
    return { iframe, channel: channels.all[0]! };
  };

  afterEach(() => {
    render(null, container);
    container.remove();
    win.dispose();
    current.window = undefined;
    delete (Workspace as unknown as { ls?: unknown }).ls;
  });

  it("leaves the player's transport to the editor's top bar", async () => {
    const { iframe } = await mount();
    const src = new URL(iframe.getAttribute("src")!, "http://editor.test/");
    expect(src.searchParams.has("skip-buttons")).toBe(false);
    expect(src.searchParams.has("step-buttons")).toBe(false);
    expect(src.hash).toMatch(/^#theme=/);
  }, 30000);

  it("holds the caret back from the player while the preview does not follow it, and hands it over for Play", async () => {
    const { channel } = await mount();
    await vi.waitFor(() => expect(channel.posted.length).toBeGreaterThan(0));
    const select = (line: number) =>
      sendProtocolMessage(
        DidSelectTextDocumentMessage.type.notification({
          textDocument: { uri: MAIN },
          selectedRange: {
            start: { line, character: 0 },
            end: { line, character: 0 },
          },
          docChanged: false,
          userEvent: true,
        }),
      );
    const heard = () =>
      channel.posted
        .map((m) => m as { method?: string; params?: any })
        .filter(
          (m) =>
            m.method === "textDocument/didSelect" || m.method === "game/start",
        )
        .map((m) =>
          m.method === "game/start"
            ? "start"
            : `select ${m.params.selectedRange.start.line}`,
        );
    select(1);
    await vi.waitFor(() => expect(heard()).toEqual(["select 1"]));
    workspaceSettings.setPreference("previewFollowsCursor", false);
    select(2);
    select(3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heard()).toEqual(["select 1"]);
    win.startGame();
    await vi.waitFor(() =>
      expect(heard()).toEqual(["select 1", "select 3", "start"]),
    );
    select(4);
    await new Promise((resolve) => setTimeout(resolve, 20));
    workspaceSettings.setPreference("previewFollowsCursor", true);
    expect(heard()).toEqual(["select 1", "select 3", "start", "select 4"]);
  }, 30000);

  it("answers the bar's skip by moving the caret to the language server's next beat", async () => {
    const getOffsetSourceLocation = vi.fn(
      async (uri: string, line: number, offset: number) => ({
        file: uri,
        line: line + 3 * offset,
      }),
    );
    (Workspace as unknown as { ls: unknown }).ls = { getOffsetSourceLocation };
    const { channel } = await mount();
    win.openFileEditor("main.sd");
    await win.showDocument(MAIN, {
      start: { line: 4, character: 0 },
      end: { line: 4, character: 0 },
    });
    const selects: unknown[] = [];
    const hear = (e: Event) => {
      const message = (e as CustomEvent).detail;
      if (message?.method === "editor/select") selects.push(message.params);
    };
    window.addEventListener(MessageProtocol.event, hear);
    const request = SkipBeatMessage.type.request({ direction: 1 });
    channel.receive(request);
    await vi.waitFor(() => expect(channel.responses).toHaveLength(1));
    const [answered, result] = channel.responses[0]!;
    expect(answered).toEqual(request);
    expect(await (result as () => Promise<unknown>)()).toEqual({ moved: true });
    expect(getOffsetSourceLocation).toHaveBeenCalledWith(MAIN, 4, 1);
    expect(win.getActiveEditorForPane("logic")?.selectedRange?.start.line).toBe(7);
    window.removeEventListener(MessageProtocol.event, hear);
    expect(selects.at(-1)).toMatchObject({
      textDocument: { uri: MAIN },
      range: { start: { line: 7, character: 0 } },
      userEvent: true,
    });
  }, 30000);

  it("follows the paused state the player reports while the game runs", async () => {
    await mount();
    const report = (paused: boolean) =>
      sendProtocolMessage(
        DidChangeGameStateMessage.type.notification({
          mounted: true,
          programLoaded: true,
          programVersion: 1,
          launchState: paused ? "pause" : "play",
          paused,
          stepping: false,
          run: 1,
          position: null,
          completion: null,
          ending: null,
        }),
      );
    report(true);
    expect(workspace.current.preview.modes.game.paused).toBeFalsy();
    win.startGame();
    report(true);
    await vi.waitFor(() =>
      expect(workspace.current.preview.modes.game.paused).toBe(true),
    );
    report(false);
    await vi.waitFor(() =>
      expect(workspace.current.preview.modes.game.paused).toBe(false),
    );
  }, 30000);
});

describe("the story's front matter", () => {
  let win: WorkspaceWindow;
  const STORY = "file://proj/main.sd";

  const publish = (uri: string, text: string) => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
    });
    const { program } = compiler.compile({ textDocument: { uri } });
    sendProtocolMessage(
      CompiledProgramMessage.type.notification({
        textDocument: { uri, version: 1 },
        program: programSummary(program, true),
      }),
    );
  };

  beforeEach(() => {
    localStorage.clear();
    win = new WorkspaceWindow(Workspace);
    current.window = win;
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: "proj" },
    };
    workspace.storyFrontMatter.value = {};
  });

  afterEach(() => {
    current.window = undefined;
    win.dispose();
  });

  it("follows main's front matter as each compile of the story arrives, and ignores other scripts", () => {
    publish(STORY, ["---", "title: The Long Road", "author: Ada", "---", "", "Hello."].join("\n") + "\n");
    expect(workspace.storyFrontMatter.value).toEqual({ title: ["The Long Road"], author: ["Ada"] });

    publish("file://proj/scripts/other.sd", ["---", "title: Not the story", "---", ""].join("\n") + "\n");
    expect(workspace.storyFrontMatter.value).toEqual({ title: ["The Long Road"], author: ["Ada"] });

    publish(STORY, ["---", "title: A New Name", "---", "", "Hello."].join("\n") + "\n");
    expect(workspace.storyFrontMatter.value).toEqual({ title: ["A New Name"] });

    publish(STORY, "Hello.\n");
    expect(workspace.storyFrontMatter.value).toEqual({});
  });

  it("opens a file of a script ending added under File types in the script editor", () => {
    expect(win.getPaneType("scripts/chapter.story")).toBeNull();
    workspaceSettings.setProjectSetting("scriptFiles", "*.{sd,luau,story}");
    try {
      expect(win.getPaneType("scripts/chapter.story")).toBe("logic");
      expect(win.getPanelType("scripts/chapter.story")).toBe("scripts");
    } finally {
      workspaceSettings.resetProjectSettings(["scriptFiles"]);
    }
    expect(win.getPaneType("scripts/chapter.story")).toBeNull();
  });

  it("opens main at a line for Edit in Main", async () => {
    workspace.current = {
      ...workspace.current,
      screen: { ...workspace.current.screen, settingsOpen: true },
    };
    await win.editMainAt(0);
    await vi.waitFor(() => expect(workspace.current.screen.settingsOpen).toBe(false));
    const main = workspace.current.panes.logic.panels.main!.activeEditor!;
    expect(workspace.current.pane).toBe("logic");
    expect(main.filename).toBe("main.sd");
    expect(main.selectedRange).toEqual({ start: { line: 0, character: 0 }, end: { line: 0, character: 0 } });
  });
});

describe("Revealing a script from the bar under the game", () => {
  let win: WorkspaceWindow;
  let sent: { method?: string; id?: unknown; params?: any }[];
  let stopListening: () => void;

  const SHOW_PROBLEMS = "editor/executeCommand";

  beforeEach(() => {
    localStorage.clear();
    win = new WorkspaceWindow(Workspace);
    sent = [];
    const listener = (e: Event) => {
      const message = (e as CustomEvent).detail;
      if (
        message?.method === SHOW_PROBLEMS &&
        message.params?.command === "problems"
      ) {
        sent.push(message);
      }
    };
    window.addEventListener(MessageProtocol.event, listener);
    stopListening = () =>
      window.removeEventListener(MessageProtocol.event, listener);
  });

  afterEach(() => {
    stopListening();
    win.dispose();
    delete (document as { fullscreenElement?: Element }).fullscreenElement;
  });

  const uriOf = (path: string) => `file://${workspace.current.project.id}/${path}`;

  it("opens the script on the write route from another route", async () => {
    win.navigateTo("collection");
    expect(workspace.current.pane).toBe("assets");
    const at = { line: 11, character: 0 };
    await win.revealDocument(uriOf("scripts/intro.sd"), { start: at, end: at });
    expect(workspace.current.pane).toBe("logic");
    expect(workspace.current.panes.logic.view).toBe("logic-editor");
    expect(workspace.current.panes.logic.panel).toBe("scripts");
    const editor = workspace.current.panes.logic.panels.scripts!.activeEditor;
    expect(editor?.filename).toBe("scripts/intro.sd");
    expect(editor?.selectedRange).toEqual({ start: at, end: at });
    expect(window.location.hash).toBe("#write");
  });

  it("makes an unopened script the active editor, so the stopped readout and the toggle follow it", async () => {
    const at = { line: 11, character: 0 };
    await win.revealDocument(uriOf("scripts/chapter.sd"), { start: at, end: at });
    expect(win.getActiveEditorForPane("logic")?.filename).toBe("scripts/chapter.sd");
    expect(barPosition(workspace.current)?.label).toBe("chapter : 12");
  });

  it("does not carry another script's selection onto the one it shows", async () => {
    const at = { line: 11, character: 0 };
    await win.revealDocument(uriOf("scripts/chapter.sd"), { start: at, end: at });
    await win.revealDocument(uriOf("scripts/epilogue.sd"));
    const editor = workspace.current.panes.logic.panels.scripts!.activeEditor;
    expect(editor?.filename).toBe("scripts/epilogue.sd");
    expect(editor?.selectedRange).toBeUndefined();
    await win.revealDocument(uriOf("scripts/chapter.sd"), { start: at, end: at });
    await win.revealDocument(uriOf("scripts/chapter.sd"));
    expect(
      workspace.current.panes.logic.panels.scripts!.activeEditor?.selectedRange,
    ).toEqual({ start: at, end: at });
  });

  it("closes an open script's editor when it reveals Main, so Main is the one on screen", async () => {
    const at = { line: 2, character: 0 };
    await win.revealDocument(uriOf("scripts/chapter.sd"), { start: at, end: at });
    expect(workspace.current.panes.logic.panels.scripts!.activeEditor?.open).toBe(true);
    win.navigateTo("collection");
    await win.revealDocument(uriOf("main.sd"), { start: at, end: at });
    expect(workspace.current.panes.logic.panel).toBe("main");
    expect(workspace.current.panes.logic.panels.scripts!.activeEditor?.open).toBe(false);
    expect(workspace.current.panes.logic.panels.scripts!.activeEditor?.filename).toBe(
      "scripts/chapter.sd",
    );
    expect(win.getActiveEditorForPane("logic")?.filename).toBe("main.sd");
    expect(window.location.hash).toBe("#write");
  });

  it("collapses the phone's revealed preview so the script shows", async () => {
    win.expandPreviewPane();
    await win.revealDocument(uriOf("main.sd"));
    expect(workspace.current.preview.revealed).toBe(false);
    expect(workspace.current.panes.logic.panels.main!.activeEditor?.filename).toBe(
      "main.sd",
    );
  });

  it("leaves fullscreen first, since the script is outside the fullscreen preview", async () => {
    const exitFullscreen = vi.fn(async () => {
      delete (document as { fullscreenElement?: Element }).fullscreenElement;
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    document.exitFullscreen = exitFullscreen;
    await win.revealDocument(uriOf("main.sd"));
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("keeps the selection the script's editor reported while fullscreen was closing", async () => {
    const at = (line: number) => ({
      start: { line, character: 0 },
      end: { line, character: 0 },
    });
    await win.revealDocument(uriOf("main.sd"), at(2));
    let exited: () => void = () => {};
    document.exitFullscreen = () =>
      new Promise<void>((resolve) => {
        exited = () => {
          delete (document as { fullscreenElement?: Element }).fullscreenElement;
          resolve();
        };
      });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.body,
    });
    const revealing = win.revealDocument(uriOf("main.sd"));
    win["handleSelectedEditor"](
      SelectedEditorMessage.type.notification({
        textDocument: { uri: uriOf("main.sd") },
        selectedRange: at(8),
        docChanged: false,
        hasFocus: true,
      }),
    );
    exited();
    await revealing;
    expect(
      workspace.current.panes.logic.panels.main!.activeEditor?.selectedRange,
    ).toEqual(at(8));
  });

  it("asks the script's editor for its problems once it is on screen", async () => {
    win.navigateTo("collection");
    const uri = uriOf("main.sd");
    await win.showProblems(uri);
    expect(workspace.current.pane).toBe("logic");
    expect(sent.map((m) => m.params.textDocument.uri)).toEqual([uri]);
    sendProtocolMessage({
      jsonrpc: "2.0",
      method: "editor/didLoad",
      params: { textDocument: { uri: uriOf("other.sd"), version: 1 } },
    });
    expect(sent).toHaveLength(1);
    sendProtocolMessage({
      jsonrpc: "2.0",
      method: "editor/didLoad",
      params: { textDocument: { uri, version: 1 } },
    });
    expect(sent.map((m) => m.params.textDocument.uri)).toEqual([uri, uri]);
    sendProtocolMessage({
      jsonrpc: "2.0",
      method: "editor/didLoad",
      params: { textDocument: { uri, version: 2 } },
    });
    expect(sent).toHaveLength(2);
  });

  it("asks only once when the editor on screen answers", async () => {
    const uri = uriOf("main.sd");
    await win.showProblems(uri);
    expect(sent).toHaveLength(1);
    sendProtocolMessage({
      jsonrpc: "2.0",
      method: SHOW_PROBLEMS,
      id: sent[0]!.id,
      result: {},
    } as never);
    sendProtocolMessage({
      jsonrpc: "2.0",
      method: "editor/didLoad",
      params: { textDocument: { uri, version: 1 } },
    });
    expect(sent).toHaveLength(1);
  });
});

describe("The preview's top bar", () => {
  let win: WorkspaceWindow;
  let container: HTMLElement;
  let requests: string[] = [];

  const hear = (e: Event) => {
    const message = (e as CustomEvent).detail;
    if (typeof message?.method === "string" && "id" in message && !("result" in message)) {
      requests.push(message.method);
    }
  };

  const show = (game: Record<string, unknown> = {}) => {
    workspace.current = {
      ...workspace.current,
      preview: {
        ...workspace.current.preview,
        modes: { ...workspace.current.preview.modes, game },
      },
    };
    render(h(PreviewTopBar, {}), container);
  };

  const control = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  const labels = () =>
    Array.from(container.querySelectorAll("button[aria-label]")).map((b) =>
      b.getAttribute("aria-label"),
    );

  const rows = (role: string) =>
    Array.from(container.querySelectorAll<HTMLElement>(`[role="${role}"]`));

  beforeEach(() => {
    resetPreviewPreferences();
    requests = [];
    window.addEventListener(MessageProtocol.event, hear);
    win = new WorkspaceWindow(Workspace);
    current.window = win;
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
    window.removeEventListener(MessageProtocol.event, hear);
    current.window = undefined;
    win.dispose();
    resetPreviewPreferences();
  });

  it("shows only the skips and Play while stopped", () => {
    show();
    expect(labels()).toEqual([
      "Viewing mode",
      "Skip back",
      "Play From Here",
      "Skip forward",
      "Preview settings",
    ]);
  });

  it("pauses, steps and resumes through the debug client while playing, each step's refusal on its button", async () => {
    const uri = "file://local/main.sd";
    let depth = 1;
    const player = (e: Event) => {
      const message = (e as CustomEvent).detail;
      if (!message || !("id" in message) || !("params" in message)) {
        return;
      }
      if (!message.method.startsWith("game/") && message.method !== "preview/gameState") {
        return;
      }
      const at = { start: { line: depth === 1 ? 3 : 9, character: 2 }, end: { line: 3, character: 9 } };
      const results: Record<string, unknown> = {
        "preview/gameState": { launchState: "play", paused: false, run: 1 },
        "game/threads": { threads: [{ id: 0, name: "main" }], run: 1 },
        "game/stackTrace": {
          stackFrames: [{ id: 0, name: "main", location: { uri, range: at } }],
          totalFrames: depth,
        },
        "game/pause": { run: 1 },
        "game/step": { done: true, run: 1 },
      };
      queueMicrotask(() =>
        sendProtocolMessage({
          jsonrpc: "2.0",
          method: message.method,
          id: message.id,
          result: results[message.method] ?? {},
        } as never),
      );
    };
    window.addEventListener(MessageProtocol.event, player);
    try {
      win.startGame();
      show(workspace.current.preview.modes.game);
      expect(labels()).toEqual([
        "Viewing mode",
        "Pause",
        "Step Over",
        "Step Into",
        "Skip back",
        "Stop",
        "Skip forward",
        "Step Out",
        "Preview settings",
      ]);
      for (const step of ["Step Over", "Step Into", "Step Out"]) {
        expect(control(step)?.getAttribute("aria-disabled")).toBe("true");
        expect(control(step)?.title).toBe("Pause the story to step through it");
      }
      control("Pause")!.click();
      await vi.waitFor(() =>
        expect(workspace.current.preview.modes.game.paused).toBe(true),
      );
      expect(requests).toContain("game/pause");
      await vi.waitFor(() =>
        expect(workspace.debugSession.value.stackTrace?.totalFrames).toBe(1),
      );
      expect(workspace.current.preview.modes.game.position).toEqual({ uri, line: 3 });
      show(workspace.current.preview.modes.game);
      expect(control("Resume")?.getAttribute("aria-pressed")).toBe("true");
      expect(control("Step Over")?.hasAttribute("aria-disabled")).toBe(false);
      expect(control("Step Over")?.title).toBe("Step Over (F10)");
      expect(control("Step Into")?.hasAttribute("aria-disabled")).toBe(false);
      expect(control("Step Out")?.getAttribute("aria-disabled")).toBe("true");
      expect(control("Step Out")?.title).toBe(
        "Nothing is calling, so there is nothing to step out of.",
      );
      control("Step Into")!.click();
      await vi.waitFor(() => expect(requests).toContain("game/step"));
      depth = 2;
      sendProtocolMessage({
        jsonrpc: "2.0",
        method: "game/stepped",
        params: { location: { uri, range: {} }, run: 1, history: { canStepOut: true } },
      } as never);
      await vi.waitFor(() =>
        expect(workspace.debugSession.value.stackTrace?.totalFrames).toBe(2),
      );
      expect(workspace.current.preview.modes.game.position).toEqual({ uri, line: 9 });
      show(workspace.current.preview.modes.game);
      expect(control("Step Out")?.hasAttribute("aria-disabled")).toBe(false);
      control("Step Out")!.click();
      await vi.waitFor(() =>
        expect(requests.filter((method) => method === "game/step")).toHaveLength(2),
      );
      control("Resume")!.click();
      await vi.waitFor(() =>
        expect(workspace.current.preview.modes.game.paused).toBe(false),
      );
      expect(requests).toContain("game/unpause");
    } finally {
      window.removeEventListener(MessageProtocol.event, player);
    }
  });

  it("puts the steps in one Step menu on phones, each with its refusal", async () => {
    layoutMock.value = "phone";
    try {
      show({ running: true, paused: true });
      expect(labels()).toEqual([
        "Viewing mode",
        "Resume",
        "Step",
        "Skip back",
        "Stop",
        "Skip forward",
        "Preview settings",
      ]);
      expect(
        rows("menuitem").map((row) => [
          row.querySelector("strong")?.textContent,
          row.querySelector("small")?.textContent ?? null,
          (row as HTMLButtonElement).disabled,
        ]),
      ).toEqual([
        ["Step Over", null, false],
        ["Step Into", null, false],
        ["Step Out", "Nothing is calling, so there is nothing to step out of.", true],
      ]);
      const stepGame = vi.spyOn(win, "stepGame").mockResolvedValue(true);
      rows("menuitem")[0]!.click();
      await vi.waitFor(() => expect(stepGame).toHaveBeenCalledWith("over"));
    } finally {
      layoutMock.value = "desktop";
    }
  });

  it("offers Play Again instead of Pause once the story has ended, with the Steps disabled", () => {
    show({ running: true, ended: true });
    expect(labels()).toEqual([
      "Viewing mode",
      "Play Again",
      "Step Over",
      "Step Into",
      "Skip back",
      "Stop",
      "Skip forward",
      "Step Out",
      "Preview settings",
    ]);
    for (const step of ["Step Over", "Step Into", "Step Out"]) {
      expect(control(step)?.getAttribute("aria-disabled")).toBe("true");
      expect(control(step)?.title).toBe(
        "The story is over, so there is nothing to step to.",
      );
    }
  });

  it("runs no step the bar refuses, so a key cannot get past a disabled button", async () => {
    const stepOut = vi.spyOn(win.debug, "stepOut").mockResolvedValue(true);
    const next = vi.spyOn(win.debug, "next").mockResolvedValue(true);
    show({ running: true, paused: true });
    expect(await win.stepGame("out")).toBe(false);
    show({ running: true, paused: true, choosing: true });
    expect(await win.stepGame("over")).toBe(false);
    show({ running: true, ended: true });
    expect(await win.stepGame("over")).toBe(false);
    show({ running: true });
    expect(await win.stepGame("over")).toBe(false);
    expect(stepOut).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    show({ running: true, paused: true });
    expect(await win.stepGame("over")).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("disables every step at a choice menu", () => {
    show({ running: true, paused: true, choosing: true });
    for (const step of ["Step Over", "Step Into", "Step Out"]) {
      expect(control(step)?.getAttribute("aria-disabled")).toBe("true");
      expect(control(step)?.title).toBe("Make a choice to step on.");
    }
  });

  it("skips by beat from both skip buttons", async () => {
    const skipBeat = vi.spyOn(win, "skipBeat").mockResolvedValue(true);
    show();
    control("Skip forward")!.click();
    await vi.waitFor(() => expect(skipBeat.mock.calls).toEqual([[1]]));
    control("Skip back")!.click();
    await vi.waitFor(() =>
      expect(skipBeat.mock.calls).toEqual([[1], [-1]]),
    );
  });

  it("lists the viewing modes with the current one checked, and choosing one writes the preference", async () => {
    show();
    expect(
      rows("menuitemradio").map((row) => [
        row.querySelector("strong")?.textContent,
        row.getAttribute("aria-checked"),
      ]),
    ).toEqual([
      ["Visual Novel", "true"],
      ["Screenplay", "false"],
    ]);
    rows("menuitemradio")[1]!.click();
    await vi.waitFor(() =>
      expect(workspaceSettings.preferences.value.previewMode).toBe(
        "screenplay",
      ),
    );
    render(h(PreviewTopBar, {}), container);
    expect(labels()).toEqual([
      "Viewing mode",
      "Skip back",
      "Play From Here",
      "Skip forward",
      "Preview settings",
    ]);
  });

  it("keeps the whole transport in Screenplay mode, playing the story through the page", () => {
    workspaceSettings.setPreference("previewMode", "screenplay");
    show({ running: true });
    expect(labels()).toEqual([
      "Viewing mode",
      "Pause",
      "Step Over",
      "Step Into",
      "Skip back",
      "Stop",
      "Skip forward",
      "Step Out",
      "Preview settings",
    ]);
  });

  it("lists the quick toggles of the mode on screen, and each writes its preference", () => {
    show();
    const names = () =>
      rows("menuitemcheckbox").map((row) => [
        row.querySelector("strong")?.textContent,
        row.getAttribute("aria-checked"),
      ]);
    expect(names()).toEqual([
      ["Game preview follows cursor", "true"],
      ["Show idle animations", "true"],
      ["Color typing pauses", "false"],
    ]);
    rows("menuitemcheckbox")[1]!.click();
    rows("menuitemcheckbox")[2]!.click();
    rows("menuitemcheckbox")[0]!.click();
    expect(workspaceSettings.preferences.value).toMatchObject({
      previewFollowsCursor: false,
      previewIdleAnimations: false,
      previewTypingPauses: true,
    });
    render(h(PreviewTopBar, {}), container);
    expect(names()).toEqual([
      ["Game preview follows cursor", "false"],
      ["Show idle animations", "false"],
      ["Color typing pauses", "true"],
    ]);
    workspaceSettings.setPreference("previewMode", "screenplay");
    render(h(PreviewTopBar, {}), container);
    expect(names()).toEqual([
      ["Sync screenplay and editor scroll position", "true"],
      ["Screenplay paper matches my theme", "false"],
      ["Screenplay paper texture", "false"],
    ]);
    rows("menuitemcheckbox")[0]!.click();
    rows("menuitemcheckbox")[1]!.click();
    rows("menuitemcheckbox")[2]!.click();
    expect(workspaceSettings.preferences.value).toMatchObject({
      previewScreenplaySync: false,
      screenplayPaper: "theme",
      screenplayPaperTexture: true,
    });
    render(h(PreviewTopBar, {}), container);
    expect(names()).toEqual([
      ["Sync screenplay and editor scroll position", "false"],
      ["Screenplay paper matches my theme", "true"],
      ["Screenplay paper texture", "true"],
    ]);
    rows("menuitemcheckbox")[1]!.click();
    expect(workspaceSettings.preferences.value.screenplayPaper).toBe("paper");
  });
});

describe("The Screenplay viewing mode", () => {
  let win: WorkspaceWindow;
  let container: HTMLElement;
  let requests: string[] = [];

  const hear = (e: Event) => {
    const message = (e as CustomEvent).detail;
    if (typeof message?.method === "string" && "id" in message && !("result" in message)) {
      requests.push(message.method);
    }
  };

  const setGame = (game: Record<string, unknown>) => {
    workspace.current = {
      ...workspace.current,
      preview: {
        ...workspace.current.preview,
        modes: { ...workspace.current.preview.modes, game },
      },
    };
  };

  const page = () => {
    render(h(PreviewScreenplay, {}), container);
    return screenplayProps.at(-1)!;
  };

  const exportConfig = () =>
    Object.getOwnPropertyDescriptor(WorkspacePrint.prototype, "config")!.get!.call(undefined);

  const region = () => container.querySelector<HTMLElement>('[role="region"][aria-label="Screenplay"]')!;

  beforeEach(() => {
    resetPreviewPreferences();
    screenplayProps.length = 0;
    requests = [];
    window.addEventListener(MessageProtocol.event, hear);
    win = new WorkspaceWindow(Workspace);
    current.window = win;
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
    window.removeEventListener(MessageProtocol.event, hear);
    current.window = undefined;
    win.dispose();
    setGame({});
    workspaceSettings.resetProjectSettings(SCREENPLAY_SETTING_KEYS);
    resetPreviewPreferences();
  });

  it("draws the page from the very config object the PDF and HTML exports send", () => {
    workspaceSettings.setProjectSetting("screenplaySceneNumbers", "left");
    workspaceSettings.setProjectSetting("screenplayHeadingsBold", true);
    workspaceSettings.setProjectSetting("screenplayPaperSize", "a4");
    const config = page()["config"];
    expect(config).toBe(exportConfig());
    expect(config).toMatchObject({
      screenplay_print_scene_numbers: "left",
      screenplay_print_headings_bold: true,
      screenplay_print_paper_size: "a4",
    });
    workspaceSettings.setProjectSetting("screenplayPaperSize", "usletter");
    const changed = page()["config"];
    expect(changed).toBe(exportConfig());
    expect(changed).toMatchObject({ screenplay_print_paper_size: "usletter" });
  });

  it("passes the paper colour, texture and sync preferences to the page", () => {
    expect(page()).toMatchObject({ paper: "paper", texture: false, syncScroll: true });
    workspaceSettings.setPreference("screenplayPaper", "theme");
    workspaceSettings.setPreference("screenplayPaperTexture", true);
    workspaceSettings.setPreference("previewScreenplaySync", false);
    expect(page()).toMatchObject({ paper: "theme", texture: true, syncScroll: false });
  });

  it("plays through the page: a click or Enter continues the story, and the run's picks reach the page", async () => {
    expect(page()["playing"]).toBe(false);
    region().click();
    region().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve));
    expect(requests).not.toContain("game/continue");

    const picks = { "file:///main.sd": [4] };
    setGame({ running: true, picks });
    expect(page()).toMatchObject({ playing: true, picks });
    region().click();
    await vi.waitFor(() => expect(requests.filter((m) => m === "game/continue")).toHaveLength(1));
    region().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(requests.filter((m) => m === "game/continue")).toHaveLength(2));

    setGame({ running: true, paused: true });
    page();
    region().click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(requests.filter((m) => m === "game/continue")).toHaveLength(2);
  });

  it("takes keyboard focus from a click on the page while playing, so the next Enter continues there", async () => {
    setGame({ running: true });
    page();
    const elsewhere = document.body.appendChild(document.createElement("textarea"));
    elsewhere.focus();
    const inner = container.querySelector("[data-screenplay-page]")!;
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    inner.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(region());
    region().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(requests.filter((m) => m === "game/continue")).toHaveLength(1));
    elsewhere.remove();
  });

  it("keeps the game's player mounted, out of sight, while the page is on screen", () => {
    workspaceSettings.setPreference("previewMode", "screenplay");
    render(h(Preview, {}), container);
    const iframe = container.querySelector("iframe#iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.closest(".hidden")).not.toBeNull();
    expect(region()).not.toBeNull();
    workspaceSettings.setPreference("previewMode", "game");
    render(h(Preview, {}), container);
    expect(container.querySelector("iframe#iframe")!.closest(".hidden")).toBeNull();
    expect(region()).toBeNull();
  });
});

describe("The preview's top bar in a narrow pane", () => {
  let win: WorkspaceWindow;
  let container: HTMLElement;

  const show = (game: Record<string, unknown>) => {
    workspace.current = {
      ...workspace.current,
      preview: {
        ...workspace.current.preview,
        modes: { ...workspace.current.preview.modes, game },
      },
    };
    render(h(PreviewTopBar, {}), container);
  };

  const bar = () =>
    container.querySelector<HTMLElement>('[aria-label="Playback controls"]')!;

  const modeTrigger = () =>
    container.querySelector<HTMLElement>('button[aria-label="Viewing mode"]')!;

  beforeEach(() => {
    resetPreviewPreferences();
    win = new WorkspaceWindow(Workspace);
    current.window = win;
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
    current.window = undefined;
    win.dispose();
    resetPreviewPreferences();
  });

  it("marks the bar as running only while a run exists, playing, paused or ended", () => {
    show({});
    expect(bar().hasAttribute("data-running")).toBe(false);
    for (const game of [
      { running: true },
      { running: true, paused: true },
      { running: true, ended: true },
    ]) {
      show(game);
      expect(bar().hasAttribute("data-running")).toBe(true);
    }
  });

  it("carries the running bar's narrow-pane rules: content-sized columns under 480px and the mode trigger hidden under 360px", () => {
    show({ running: true });
    expect(bar().className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "group/bar",
        "data-[running]:@max-[480px]:grid-cols-[auto_1fr_auto]",
        "data-[running]:@max-[480px]:gap-0",
        "data-[running]:@max-[480px]:px-1",
      ]),
    );
    expect(modeTrigger().className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "group-data-[running]/bar:@max-[480px]:w-11",
        "group-data-[running]/bar:@max-[360px]:hidden",
      ]),
    );
  });

  it("keeps Button's 44px minimum width on the mode trigger", async () => {
    show({});
    const { default: RealButton } = await vi.importActual<
      typeof import("../../../packages/impower-ui/src/components/button/Button")
    >("../../../packages/impower-ui/src/components/button/Button");
    const probe = document.createElement("div");
    render(
      h(RealButton, { variant: "quiet", class: modeTrigger().className }),
      probe,
    );
    const classes = probe.querySelector("button")!.className.split(/\s+/);
    expect(classes).toContain("min-w-11");
    expect(classes).toContain("min-h-11");
    expect(classes).not.toContain("min-w-0");
    render(null, probe);
  });
});
