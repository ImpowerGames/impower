import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  updates: [] as [string, unknown, unknown][],
  commands: new Map<string, () => unknown>(),
}));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  const vscode = fakeVscode();
  const section = (name: string) => {
    const read = (key: string) => state.settings[`${name}.${key}`];
    return new Proxy(
      {
        get: read,
        update: async (key: string, value: unknown, target: unknown) => {
          state.updates.push([`${name}.${key}`, value, target]);
          state.settings[`${name}.${key}`] = value;
        },
        toJSON: () => ({}),
      },
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
      onDidChangeConfiguration: disposable,
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
  const modes = () =>
    posted
      .filter((m) => m.method === "game/setStartingDisplayMode")
      .map((m) => m.params.mode);
  return { manager, receive: (m: unknown) => receive(m), modes };
};

const SETTING = "sparkdown.game.previewStartingMode";

describe("the Game Preview's starting display mode", () => {
  beforeEach(() => {
    state.settings = {};
    state.updates = [];
  });

  it("sends the chosen mode when the preview opens", async () => {
    state.settings[SETTING] = "interactiveFiction";
    const preview = await open();
    await preview.receive({
      jsonrpc: "2.0",
      method: "preview/connected",
      params: { type: "game" },
    });
    expect(preview.modes()).toEqual(["textstream"]);
  });

  it("starts in Visual Novel when the setting is unset", async () => {
    const preview = await open();
    await preview.receive({
      jsonrpc: "2.0",
      method: "preview/connected",
      params: { type: "game" },
    });
    expect(preview.modes()).toEqual(["textbox"]);
  });

  it("sends the mode again when a run starts", async () => {
    state.settings[SETTING] = "interactiveFiction";
    const preview = await open();
    await preview.receive({ jsonrpc: "2.0", method: "game/started" });
    expect(preview.modes()).toEqual(["textstream"]);
  });

  it("sends the new mode when the setting changes", async () => {
    const preview = await open();
    state.settings[SETTING] = "interactiveFiction";
    preview.manager.notifyConfiguredWorkspace();
    state.settings[SETTING] = "visualNovel";
    preview.manager.notifyConfiguredWorkspace();
    expect(preview.modes()).toEqual(["textstream", "textbox"]);
  });

  it("saves each title-bar choice as a user setting", async () => {
    const { activatePreviewGamePanel } =
      await import("../src/utils/activatePreviewGamePanel");
    await activatePreviewGamePanel({ subscriptions: [] } as any);
    await state.commands.get("sparkdown.game.playAsInteractiveFiction")!();
    await state.commands.get("sparkdown.game.playAsVisualNovel")!();
    expect(state.updates).toEqual([
      [SETTING, "interactiveFiction", 1],
      [SETTING, "visualNovel", 1],
    ]);
  });
});

describe("the Game Preview's starting mode contributions", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );

  it("declares the setting beside the other preview settings", () => {
    const preview = manifest.contributes.configuration.find(
      (c: { title: string }) => c.title === "Sparkdown Preview",
    );
    expect(preview.properties[SETTING]).toMatchObject({
      enum: ["visualNovel", "interactiveFiction"],
      default: "visualNovel",
    });
  });

  it("offers the other mode in the panel's title-bar menu", () => {
    const panel = "activeWebviewPanelId == 'sparkdown-preview-game'";
    const menu = Object.fromEntries(
      manifest.contributes.menus["editor/title"]
        .filter((item: { when?: string }) => item.when?.startsWith(panel))
        .map((m: { command: string; when: string }) => [m.command, m.when]),
    );
    expect(menu).toEqual({
      "sparkdown.game.playAsVisualNovel": `${panel} && config.${SETTING} == interactiveFiction`,
      "sparkdown.game.playAsInteractiveFiction": `${panel} && config.${SETTING} != interactiveFiction`,
    });
    const titles = Object.fromEntries(
      manifest.contributes.commands.map(
        (c: { command: string; title: string }) => [c.command, c.title],
      ),
    );
    expect(titles["sparkdown.game.playAsVisualNovel"]).toBe(
      "Play as Visual Novel",
    );
    expect(titles["sparkdown.game.playAsInteractiveFiction"]).toBe(
      "Play as Interactive Fiction",
    );
  });
});
