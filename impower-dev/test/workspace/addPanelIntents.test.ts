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
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");

let win: InstanceType<typeof WorkspaceWindow> | undefined;
const stops: (() => void)[] = [];

beforeEach(() => {
  layout.value = "desktop";
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

const mount = () => {
  win = new WorkspaceWindow({
    fs: {
      getLoadedProjectId: () => "project",
      getFileUri: (projectId: string, filename: string) =>
        `file:///${projectId}/${filename}`,
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

const editorReading = (line: number, character: number) => {
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
          end: { line, character },
        },
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

  it("enters editing mode first on a phone in reading mode, and leaves the mode alone elsewhere", () => {
    const w = mount();
    w.openAddPanel();
    expect(workspace.scriptMode.value).toBe("reading");
    w.closeAddPanel();
    layout.value = "phone";
    w.openAddPanel();
    expect(workspace.scriptMode.value).toBe("editing");
  });

  it("reads whether the caret is in a scene", async () => {
    const w = mount();
    editorReading(3, 4);
    expect(await w.readInsertContext("main.sd")).toEqual({ inScene: true });
    stops.splice(0).forEach((stop) => stop());
    editorReading(0, 3);
    expect(await w.readInsertContext("main.sd")).toEqual({ inScene: false });
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
  });
});
