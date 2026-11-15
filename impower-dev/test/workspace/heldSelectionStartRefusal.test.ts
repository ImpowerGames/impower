import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeGameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";
import { OUTSIDE_EVERY_SCENE_REFUSAL } from "@impower/spark-web-player/src/main/workers/messages/PlayMessage";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";

const current = vi.hoisted(() => ({ window: undefined as any }));
const channels = vi.hoisted(() => ({ all: [] as any[] }));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      writeProjectMetadata: vi.fn(),
      getFiles: async () => ({}),
      getDirectoryUri: async () => "file://a",
      getFileUri: (id: string, filename: string) => `file://${id}/${filename}`,
      getFilename: (uri: string) => uri.split("/").at(-1),
      getRelativePath: (id: string, uri: string) =>
        uri.replace(`file://${id}/`, ""),
    },
    configuration: { settings: {} },
    get window() {
      return current.window;
    },
  },
}));

vi.mock("@impower/jsonrpc/src/browser/classes/IFrameMessageConnection", () => ({
  IFrameMessageConnection: class {},
}));

vi.mock("@impower/jsonrpc/src/browser/classes/Port1MessageConnection", () => ({
  Port1MessageConnection: class {
    posted: any[] = [];
    listeners: ((event: any) => void)[] = [];
    constructor() {
      channels.all.push(this);
    }
    async connect() {}
    addEventListener(_type: string, listener: any) {
      this.listeners.push(listener);
    }
    removeEventListener() {}
    postMessage(message: any) {
      this.posted.push(message);
    }
    async sendRequest() {
      return {};
    }
    sendResponse() {}
    receive(message: any) {
      this.listeners.forEach((listener) => listener({ data: message }));
    }
  },
}));

const { default: PreviewGame } = await import(
  "../../src/modules/spark-editor/components/preview-game/PreviewGame"
);
const { Workspace } = await import(
  "../../src/modules/spark-editor/workspace/Workspace"
);
const { default: WorkspaceWindow } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceWindow"
);
const { default: workspace, savedWorkspaceState } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { WorkspaceConstants } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceConstants"
);

const MAIN = "file://a/main.sd";
const NOTES = "file://a/notes.sd";

let host: HTMLDivElement | undefined;
let win: InstanceType<typeof WorkspaceWindow> | undefined;
let channel: any;

const select = (uri: string, line: number) =>
  sendProtocolMessage(
    DidSelectTextDocumentMessage.type.notification({
      textDocument: { uri },
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
    .filter((m: any) =>
      ["textDocument/didSelect", "game/start"].includes(m.method),
    )
    .map((m: any) =>
      m.method === "game/start"
        ? "start"
        : `${m.params.textDocument.uri.split("/").at(-1)}:${m.params.selectedRange.start.line}`,
    );

const playerReports = (startRefusal: string | null) =>
  channel.receive(
    DidChangeGameStateMessage.type.notification({
      mounted: true,
      programLoaded: true,
      programVersion: 1,
      launchState: "preview",
      paused: false,
      stepping: false,
      run: null,
      position: null,
      shownBeatDescription: null,
      completion: null,
      ending: null,
      startRefusal,
    }),
  );

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

const refusal = () => workspace.current.preview.modes.game.startRefusal;

beforeEach(async () => {
  channels.all.length = 0;
  localStorage.clear();
  localStorage.setItem(WorkspaceConstants.LOADED_PROJECT_STORAGE_KEY, "a");
  workspace.current = savedWorkspaceState();
  workspaceSettings.setPreference("previewFollowsCursor", true);
  win = new WorkspaceWindow(Workspace);
  current.window = win;
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PreviewGame, {}), host!));
  host.querySelector("iframe")!.dispatchEvent(new Event("load"));
  await vi.waitFor(() => expect(channels.all).toHaveLength(1), {
    timeout: 15000,
  });
  channel = channels.all[0];
  await vi.waitFor(() => expect((win as any)._playerConnected).toBe(true));
  sendProtocolMessage(
    CompiledProgramMessage.type.notification({
      textDocument: { uri: MAIN, version: 1 },
      program: {
        uri: MAIN,
        scripts: { [MAIN]: 1, [NOTES]: 1 },
        files: {},
        sceneSpans: { [MAIN]: [[0, 3]] },
      },
    }),
  );
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
  }
  win?.dispose();
  current.window = undefined;
  workspaceSettings.setPreference("previewFollowsCursor", true);
});

describe("Play's start refusal while the preview does not follow the cursor", () => {
  it("follows the player's refusal while the preview follows the cursor", async () => {
    select(NOTES, 0);
    await vi.waitFor(() => expect(heard()).toEqual(["notes.sd:0"]));
    playerReports(OUTSIDE_EVERY_SCENE_REFUSAL);
    expect(refusal()).toBe(OUTSIDE_EVERY_SCENE_REFUSAL);
    win!.toggleGameRunning();
    await tick();
    expect(heard()).toEqual(["notes.sd:0"]);
    playerReports(null);
    expect(refusal()).toBeUndefined();
  }, 30000);

  it("lets Play start from a held caret inside a scene after the last line the player saw was refused", async () => {
    select(NOTES, 0);
    await vi.waitFor(() => expect(heard()).toEqual(["notes.sd:0"]));
    playerReports(OUTSIDE_EVERY_SCENE_REFUSAL);
    workspaceSettings.setPreference("previewFollowsCursor", false);
    select(MAIN, 1);
    await tick();
    expect(heard()).toEqual(["notes.sd:0"]);
    expect(refusal()).toBeUndefined();
    win!.toggleGameRunning();
    await tick();
    expect(heard()).toEqual(["notes.sd:0", "main.sd:1", "start"]);
  }, 30000);

  it("refuses Play at a held caret outside every scene though the player last saw a line in a scene", async () => {
    select(MAIN, 1);
    await vi.waitFor(() => expect(heard()).toEqual(["main.sd:1"]));
    playerReports(null);
    workspaceSettings.setPreference("previewFollowsCursor", false);
    select(NOTES, 0);
    await tick();
    expect(refusal()).toBe(OUTSIDE_EVERY_SCENE_REFUSAL);
    win!.toggleGameRunning();
    await tick();
    expect(heard()).toEqual(["main.sd:1"]);

    workspaceSettings.setPreference("previewFollowsCursor", true);
    await tick();
    expect(heard()).toEqual(["main.sd:1", "notes.sd:0"]);
    playerReports(OUTSIDE_EVERY_SCENE_REFUSAL);
    expect(refusal()).toBe(OUTSIDE_EVERY_SCENE_REFUSAL);
  }, 30000);
});
