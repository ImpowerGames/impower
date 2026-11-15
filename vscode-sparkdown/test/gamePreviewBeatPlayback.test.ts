import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  commands: new Map<string, () => unknown>(),
  configurationListeners: [] as ((change: {
    affectsConfiguration: (section: string) => boolean;
  }) => void)[],
}));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  const vscode = fakeVscode();
  const section = (name: string) => {
    const read = (key: string) => state.settings[`${name}.${key}`];
    return new Proxy(
      { get: read, toJSON: () => ({}) },
      {
        get: (target, key) =>
          typeof key === "string" && key in target
            ? (target as any)[key]
            : typeof key === "string"
              ? read(key)
              : undefined,
      },
    );
  };
  const disposable = () => ({ dispose: () => {} });
  return {
    ...vscode,
    commands: {
      ...vscode.commands,
      registerCommand: (id: string, handler: () => unknown) => {
        state.commands.set(id, handler);
        return disposable();
      },
    },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    ViewColumn: { Two: 2 },
    Uri: {
      parse: (uri: string) => ({ toString: () => uri }),
      joinPath: (base: { path: string }, ...parts: string[]) => {
        const path = [base.path, ...parts].join("/");
        return { path, toString: () => `file://${path}` };
      },
    },
    debug: { activeDebugSession: undefined },
    window: {
      ...vscode.window,
      showErrorMessage: () => Promise.resolve(undefined),
      onDidChangeTextEditorVisibleRanges: disposable,
      registerWebviewPanelSerializer: disposable,
    },
    workspace: {
      ...vscode.workspace,
      onDidChangeConfiguration: (
        listener: (change: {
          affectsConfiguration: (section: string) => boolean;
        }) => void,
      ) => {
        state.configurationListeners.push(listener);
        return disposable();
      },
      getConfiguration: (name: string) => section(name),
    },
  };
});
vi.mock("../src/utils/getWorkspaceFiles", () => ({
  getWorkspaceFiles: async () => [],
}));
vi.mock("../src/utils/getWorkspaceFileWatchers", () => ({
  getWorkspaceFileWatchers: () => [],
}));

const AUTO_PLAY = "sparkdown.game.previewAutoPlayBeats";
const PLAY_AUDIO = "sparkdown.game.previewPlayAudio";
const FOLLOWS_CURSOR = "sparkdown.game.previewSynchronizedWithCursor";
const REDUCE_MOTION = "workbench.reduceMotion";

const memento = () => {
  const values = new Map<string, unknown>();
  return {
    get: (key: string, fallback?: unknown) =>
      values.has(key) ? values.get(key) : fallback,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
};

const open = async () => {
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  const manager = new SparkdownPreviewGamePanelManager();
  const posted: any[] = [];
  let receive!: (message: unknown) => Promise<void>;
  const panel = {
    webview: {
      cspSource: "csp",
      html: "",
      asWebviewUri: (uri: { toString(): string }) => uri,
      postMessage: (message: any) => {
        posted.push(message);
        if (message?.id != null && message.method && !("result" in message)) {
          queueMicrotask(() =>
            receive({
              jsonrpc: "2.0",
              method: message.method,
              id: message.id,
              result: {},
            }),
          );
        }
        return Promise.resolve(true);
      },
      onDidReceiveMessage: (listener: (message: unknown) => Promise<void>) => {
        receive = listener;
        return { dispose: () => {} };
      },
    },
    onDidDispose: () => ({ dispose: () => {} }),
  };
  const context = {
    extensionUri: "ext",
    storageUri: { path: "/storage/workspace-1" },
    workspaceState: memento(),
    globalState: memento(),
    subscriptions: [],
  } as any;
  await manager.initializePanel(panel as any, context, undefined);
  const sent = (method: string) =>
    posted.filter((m) => m.method === method).map((m) => m.params.enabled);
  return {
    manager,
    panel,
    posted,
    receive: (m: unknown) => receive(m),
    connect: () =>
      receive({
        jsonrpc: "2.0",
        method: "preview/connected",
        params: { type: "game" },
      }),
    autoPlay: () => sent("preview/setAutoPlayBeats"),
    playAudio: () => sent("preview/setPlayAudio"),
  };
};

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

describe("the Game Preview's beat playback settings", () => {
  beforeEach(() => {
    state.settings = {};
    state.commands.clear();
    state.configurationListeners = [];
  });

  it("declares both settings off by default beside the cursor setting", () => {
    const preview = manifest.contributes.configuration.find(
      (c: { title: string }) => c.title === "Sparkdown Preview",
    );
    const keys = Object.keys(preview.properties);
    expect(keys.slice(keys.indexOf(FOLLOWS_CURSOR), keys.indexOf(FOLLOWS_CURSOR) + 3)).toEqual([
      FOLLOWS_CURSOR,
      AUTO_PLAY,
      PLAY_AUDIO,
    ]);
    expect(preview.properties[AUTO_PLAY]).toEqual({
      type: "boolean",
      default: false,
      description:
        "When the caret lands on a line, its beat plays once, as it would in the game. Needs the game preview to follow the cursor, and stays off while VS Code reduces motion.",
    });
    expect(preview.properties[PLAY_AUDIO]).toEqual({
      type: "boolean",
      default: false,
      description:
        "Beats played in the preview play their sound, as Play From Here would. The Game Preview can stay silent until you first click or press a key in it.",
    });
  });

  it("sends both settings, off, when the preview connects with nothing set", async () => {
    const preview = await open();
    await preview.connect();
    expect(preview.autoPlay()).toEqual([false]);
    expect(preview.playAudio()).toEqual([false]);
  });

  it("sends both settings, on, when the preview connects with them set", async () => {
    state.settings[AUTO_PLAY] = true;
    state.settings[PLAY_AUDIO] = true;
    const preview = await open();
    await preview.connect();
    expect(preview.autoPlay()).toEqual([true]);
    expect(preview.playAudio()).toEqual([true]);
  });

  it("sends each setting again only when its value changes", async () => {
    const { activatePreviewGamePanel } =
      await import("../src/utils/activatePreviewGamePanel");
    const { SparkdownPreviewGamePanelManager } =
      await import("../src/managers/SparkdownPreviewGamePanelManager");
    await activatePreviewGamePanel({ subscriptions: [] } as any);
    const preview = await open();
    (SparkdownPreviewGamePanelManager as any)._instance = preview.manager;
    await preview.connect();
    const change = (section: string) =>
      state.configurationListeners.forEach((listener) =>
        listener({
          affectsConfiguration: (s: string) =>
            section === s || section.startsWith(`${s}.`),
        }),
      );
    state.settings[AUTO_PLAY] = true;
    change(AUTO_PLAY);
    state.settings[PLAY_AUDIO] = true;
    change(PLAY_AUDIO);
    change("sparkdown.game.previewStartingMode");
    state.settings[PLAY_AUDIO] = false;
    change(PLAY_AUDIO);
    expect(preview.autoPlay()).toEqual([false, true]);
    expect(preview.playAudio()).toEqual([false, true, false]);
  });

  it("keeps auto-play off while the preview does not follow the cursor", async () => {
    state.settings[AUTO_PLAY] = true;
    state.settings[FOLLOWS_CURSOR] = false;
    const preview = await open();
    await preview.connect();
    state.settings[FOLLOWS_CURSOR] = true;
    preview.manager.notifyConfiguredWorkspace();
    expect(preview.autoPlay()).toEqual([false, true]);
  });

  it.each([
    ["on", false, false],
    ["on", true, false],
    ["auto", true, false],
    ["auto", false, true],
    ["off", true, true],
    [undefined, true, false],
    [undefined, false, true],
  ] as const)(
    "with reduceMotion %s and the system reducing motion %s, auto-play is %s",
    async (reduceMotion, systemReduces, enabled) => {
      state.settings[AUTO_PLAY] = true;
      state.settings[REDUCE_MOTION] = reduceMotion;
      const preview = await open();
      await preview.receive({ systemReducesMotion: systemReduces });
      await preview.connect();
      expect(preview.autoPlay().at(-1)).toBe(enabled);
      expect(preview.playAudio()).toEqual([false]);
    },
  );

  it("follows the system's motion setting while reduceMotion is auto", async () => {
    state.settings[AUTO_PLAY] = true;
    state.settings[REDUCE_MOTION] = "auto";
    const preview = await open();
    await preview.connect();
    await preview.receive({ systemReducesMotion: true });
    await preview.receive({ systemReducesMotion: false });
    expect(preview.autoPlay()).toEqual([true, false, true]);
  });

  it("applies a change of VS Code's reduce motion setting", async () => {
    const { activatePreviewGamePanel } =
      await import("../src/utils/activatePreviewGamePanel");
    const { SparkdownPreviewGamePanelManager } =
      await import("../src/managers/SparkdownPreviewGamePanelManager");
    await activatePreviewGamePanel({ subscriptions: [] } as any);
    state.settings[AUTO_PLAY] = true;
    state.settings[REDUCE_MOTION] = "off";
    const preview = await open();
    (SparkdownPreviewGamePanelManager as any)._instance = preview.manager;
    await preview.connect();
    state.settings[REDUCE_MOTION] = "on";
    state.configurationListeners.forEach((listener) =>
      listener({
        affectsConfiguration: (s: string) =>
          s === "workbench.reduceMotion" || s === "workbench",
      }),
    );
    expect(preview.autoPlay()).toEqual([true, false]);
  });
});

describe("the Game Preview's Replay beat control and command", () => {
  beforeEach(() => {
    state.settings = {};
    state.commands.clear();
  });

  it("puts the Replay beat control in the Game Preview's bar", async () => {
    const preview = await open();
    const player = preview.panel.webview.html.match(
      /<spark-web-player\b[^>]*>/,
    )?.[0];
    expect(player).toBe("<spark-web-player toolbar run-button replay-button>");
  });

  it("plays the shown beat from its command", async () => {
    const { activatePreviewGamePanel } =
      await import("../src/utils/activatePreviewGamePanel");
    const { SparkdownPreviewGamePanelManager } =
      await import("../src/managers/SparkdownPreviewGamePanelManager");
    await activatePreviewGamePanel({ subscriptions: [] } as any);
    const preview = await open();
    (SparkdownPreviewGamePanelManager as any)._instance = preview.manager;
    await state.commands.get("sparkdown.game.replayBeat")!();
    const requests = preview.posted.filter(
      (m) => m.method === "preview/playBeat",
    );
    expect(requests).toEqual([
      { jsonrpc: "2.0", method: "preview/playBeat", id: expect.anything(), params: {} },
    ]);
  });

  it("binds the command to the web editor's shortcut in the editor and the preview", () => {
    const command = manifest.contributes.commands.find(
      (c: { command: string }) => c.command === "sparkdown.game.replayBeat",
    );
    expect(command).toMatchObject({ title: "Replay Beat", category: "Sparkdown" });
    expect(
      manifest.contributes.keybindings.filter(
        (k: { command: string }) => k.command === "sparkdown.game.replayBeat",
      ),
    ).toEqual([
      {
        command: "sparkdown.game.replayBeat",
        when: "(editorTextFocus && editorLangId == sparkdown && !findWidgetVisible) || activeWebviewPanelId == 'sparkdown-preview-game'",
        key: "ctrl+alt+enter",
        mac: "cmd+alt+enter",
      },
    ]);
  });
});

describe("the Game Preview webview's host reports", () => {
  it("labels the Replay beat shortcut for the platform", async () => {
    const { replayBeatShortcut } = await import("../src/utils/gamePreviewWebview");
    expect(replayBeatShortcut("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "Ctrl+Alt+Enter",
    );
    expect(replayBeatShortcut("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe(
      "⌥⌘Enter",
    );
  });
});
