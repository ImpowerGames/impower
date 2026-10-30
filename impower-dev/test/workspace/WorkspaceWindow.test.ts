import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ChangedEditorRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ChangedEditorRoutePinsMessage";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { DidOpenPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPaneMessage";
import { SetAnimatePortraitsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetAnimatePortraitsMessage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ window: undefined as unknown }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      writeProjectMetadata: vi.fn(),
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

vi.mock("@impower/impower-ui/components", async () => {
  const { h } = await import("preact");
  const element =
    (tag: string) =>
    ({ asChild: _asChild, variant: _v, size: _s, onCheckedChange: _c, checked: _k, ...props }: Record<string, unknown>) =>
      h(tag, props);
  const icons = [
    "BugOff",
    "Check",
    "Eye",
    "EyeClosed",
    "Gear",
    "Notes",
    "PlayerPauseFill",
    "PlayerPlay",
    "PlayerPlayFill",
    "PlayerSkipBackwardFill",
    "PlayerSkipForwardFill",
    "PlayerStop",
    "PlayerTrackNextFill",
    "PlayerTrackPreviousFill",
  ];
  return {
    Button: element("button"),
    DropdownRoot: element("div"),
    DropdownTrigger: element("div"),
    DropdownContent: element("div"),
    DropdownCheckboxItem: element("div"),
    ...Object.fromEntries(icons.map((name) => [name, element("svg")])),
  };
});

const channels = vi.hoisted(() => ({
  all: [] as {
    posted: unknown[];
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
    async sendRequest() {
      return {};
    }
    sendResponse() {}
  },
}));

import { h, render } from "preact";
import PreviewGame from "../../src/modules/spark-editor/components/preview-game/PreviewGame";
import { Workspace } from "../../src/modules/spark-editor/workspace/Workspace";
import { createPlayerPreferenceSync } from "../../src/modules/spark-editor/components/preview-game/playerPreferences";
import PreviewGameToolbar from "../../src/modules/spark-editor/components/preview-game-toolbar/PreviewGameToolbar";
import { WorkspaceConstants } from "../../src/modules/spark-editor/workspace/WorkspaceConstants";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";
import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";

describe("WorkspaceWindow store transitions", () => {
  let win: WorkspaceWindow;

  beforeEach(() => {
    localStorage.clear();
    win = new WorkspaceWindow();
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

  describe("the preview toolbar control", () => {
    let container: HTMLElement;

    const control = () =>
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Animate portraits"]',
      );

    const show = (running: boolean) => {
      workspace.current = {
        ...workspace.current,
        preview: {
          ...workspace.current.preview,
          modes: {
            ...workspace.current.preview.modes,
            game: { running },
          },
        },
      };
      render(h(PreviewGameToolbar, {}), container);
    };

    beforeEach(() => {
      current.window = load();
      container = document.createElement("div");
      document.body.append(container);
    });

    afterEach(() => {
      render(null, container);
      container.remove();
      current.window = undefined;
    });

    for (const running of [false, true]) {
      it(`turns portraits off and on while the game is ${running ? "playing" : "stopped"}`, async () => {
        show(running);
        expect(control()?.getAttribute("aria-pressed")).toBe("true");
        control()!.click();
        await vi.waitFor(() =>
          expect(control()?.getAttribute("aria-pressed")).toBe("false"),
        );
        control()!.click();
        await vi.waitFor(() =>
          expect(control()?.getAttribute("aria-pressed")).toBe("true"),
        );
        expect(sent.map((m) => m.params.enabled)).toEqual([false, true]);
      });
    }

    it("shows a saved off preference after a reload", () => {
      load().setAnimatePortraits(false);
      workspace.animatePortraits.value = true;
      load();
      show(false);
      expect(control()?.getAttribute("aria-pressed")).toBe("false");
    });
  });

  describe("a connecting player", () => {
    const connected = (type: "game" | "screenplay") => ({
      jsonrpc: "2.0",
      method: "preview/connected",
      params: { type },
    });

    it("hears the current preference when it connects and when it has initialized", () => {
      load().setAnimatePortraits(false);
      const posted: SetAnimatePortraitsMessage.Request[] = [];
      const sync = createPlayerPreferenceSync((m) =>
        posted.push(m as SetAnimatePortraitsMessage.Request),
      );
      sync.received(connected("game"));
      sync.initialized();
      expect(
        posted
          .filter((m) => m.method === "game/setAnimatePortraits")
          .map((m) => [m.method, m.params.enabled]),
      ).toEqual([
        ["game/setAnimatePortraits", false],
        ["game/setAnimatePortraits", false],
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

    it("is what the game preview sends each player it connects to", async () => {
      const win = load();
      win.setAnimatePortraits(false);
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
    const win = new WorkspaceWindow();
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
    workspace.current = {
      ...workspace.current,
      debug: { ...workspace.current.debug, routePins: {} },
    };
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
    const win = new WorkspaceWindow();
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
    freshPage();
    expect(load().startingValues).toEqual({ s: { "store:trust": "2" } });
    localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "b");
    freshPage();
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
