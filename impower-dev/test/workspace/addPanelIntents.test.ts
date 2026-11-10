import { onProtocolRequest } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  InsertEditorConstructMessage,
  type InsertEditorConstructParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/InsertEditorConstructMessage";
import { ReadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ReadEditorMessage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ value: "desktop" }));

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
const { snackbar } =
  await import("../../src/modules/spark-editor/utils/snackbar");
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");

let win: InstanceType<typeof WorkspaceWindow> | undefined;
const stops: (() => void)[] = [];

beforeEach(() => {
  snackbar.value = null;
  layout.value = "desktop";
  workspace.layout.value = "desktop";
  workspace.scriptMode.value = "reading";
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: "project" },
    screen: {},
  };
});

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  win?.dispose();
  win = undefined;
});

const symbolRequests: unknown[] = [];

const SCENE_SYMBOLS = [
  {
    name: "start",
    kind: 5,
    range: { start: { line: 2, character: 0 }, end: { line: 4, character: 3 } },
    selectionRange: {
      start: { line: 2, character: 0 },
      end: { line: 2, character: 11 },
    },
  },
];

const mount = () => {
  symbolRequests.length = 0;
  win = new WorkspaceWindow({
    fs: {
      getLoadedProjectId: () => "project",
      getFileUri: (projectId: string, filename: string) =>
        `file:///${projectId}/${filename}`,
    },
    ls: {
      initialization: async () => {},
      connection: {
        sendRequest: async (method: string, params: unknown) => {
          symbolRequests.push([method, params]);
          return SCENE_SYMBOLS;
        },
      },
    },
  } as unknown as ConstructorParameters<typeof WorkspaceWindow>[0]);
  return win;
};

const SCRIPT = [
  "store gold = 1",
  "",
  "scene start",
  "  Hello.",
  "end",
  "",
].join(String.fromCharCode(10));

const editorReading = (
  line: number,
  character: number,
  end = { line, character },
) => {
  stops.push(
    onProtocolRequest(ReadEditorMessage.type, (message) =>
      ReadEditorMessage.type.response(message.id, {
        textDocument: {
          uri: "file:///project/main.sd",
          version: 1,
          text: SCRIPT,
        },
        selection: {
          start: { line, character },
          end,
        },
        caret: { line, character },
        coordinates: null,
      }),
    ),
  );
};

describe("the Add panel intents", () => {
  it("opens closing Writing tools and the app menu, and closes again", () => {
    const w = mount();
    w.openWritingTools();
    w.openAddPanel();
    expect(workspace.state.value.screen).toMatchObject({
      addPanel: true,
      appMenuOpen: false,
    });
    expect(workspace.state.value.screen.writingTools).toBeUndefined();
    w.closeAddPanel();
    expect(workspace.state.value.screen.addPanel).toBeUndefined();
  });

  it("is closed by opening Writing tools", () => {
    const w = mount();
    w.openAddPanel();
    w.openWritingTools();
    expect(workspace.state.value.screen.addPanel).toBeUndefined();
    expect(workspace.state.value.screen.writingTools).toBeDefined();
  });

  it.each([
    ["phone", "reading", "editing"],
    ["phone", "editing", "editing"],
    ["compact", "reading", "reading"],
    ["compact", "editing", "editing"],
    ["desktop", "reading", "reading"],
    ["desktop", "editing", "editing"],
  ] as const)(
    "on a %s layout with the stored mode %s, opening leaves the stored mode %s",
    (layout, stored, expected) => {
      const w = mount();
      workspace.layout.value = layout;
      workspace.scriptMode.value = stored;
      w.openAddPanel();
      expect(workspace.scriptMode.value).toBe(expected);
    },
  );

  it("reads whether the caret is in a scene from the language server's scene symbols", async () => {
    const w = mount();
    editorReading(3, 4);
    expect(await w.readInsertContext("main.sd")).toEqual({ inScene: true });
    expect(symbolRequests).toEqual([
      [
        "textDocument/documentSymbol",
        {
          textDocument: {
            uri: `file:///${workspace.state.value.project.id}/main.sd`,
          },
        },
      ],
    ]);
    stops.splice(0).forEach((stop) => stop());
    editorReading(0, 3);
    expect(await w.readInsertContext("main.sd")).toEqual({ inScene: false });
  });

  it("reads the caret, not the selection's later end, for a backward selection", async () => {
    const w = mount();
    editorReading(3, 4, { line: 5, character: 0 });
    expect(await w.readInsertContext("main.sd")).toEqual({ inScene: true });
  });

  it("closes and asks the script's editor to insert the construct", async () => {
    const w = mount();
    const requests: InsertEditorConstructParams[] = [];
    stops.push(
      onProtocolRequest(InsertEditorConstructMessage.type, (message) => {
        requests.push(message.params);
        return InsertEditorConstructMessage.type.response(message.id, {
          inserted: true,
        });
      }),
    );
    w.openAddPanel();
    expect(await w.insertConstruct("main.sd", "scene")).toBe(true);
    expect(requests).toEqual([
      {
        textDocument: {
          uri: `file:///${workspace.state.value.project.id}/main.sd`,
        },
        construct: "scene",
      },
    ]);
    expect(workspace.state.value.screen.addPanel).toBeUndefined();
    expect(snackbar.value).toBeNull();
  });

  it("says so when the editor could not add the construct where the caret is", async () => {
    const w = mount();
    stops.push(
      onProtocolRequest(InsertEditorConstructMessage.type, (message) =>
        InsertEditorConstructMessage.type.response(message.id, {
          inserted: false,
        }),
      ),
    );
    expect(await w.insertConstruct("main.sd", "dialogue")).toBe(false);
    expect(snackbar.value?.message).toBe(
      "Couldn't add that here. Move to another line and try again.",
    );
  });
});
