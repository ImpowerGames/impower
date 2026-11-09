import { onProtocolRequest } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  ApplyEditorColorMessage,
  type ApplyEditorColorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorColorMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const RANGE = {
  start: { line: 0, character: 14 },
  end: { line: 0, character: 21 },
};
const ORANGE = { red: 1, green: 136 / 255, blue: 0, alpha: 1 };

const rgb = (
  red: number,
  green: number,
  blue: number,
  alpha = 1,
  line = 0,
  character = 0,
) => ({
  color: { red, green, blue, alpha },
  range: {
    start: { line, character },
    end: { line, character: character + 7 },
  },
});

let win: WorkspaceWindow | undefined;
let stopEditor: (() => void) | undefined;

afterEach(() => {
  stopEditor?.();
  stopEditor = undefined;
  win?.closeWritingTools();
  win?.dispose();
  win = undefined;
});

const mount = (ls: unknown = undefined) => {
  win = new WorkspaceWindow({
    fs: {
      getLoadedProjectId: () => "project",
      getFileUri: (projectId: string, filename: string) =>
        `file:///${projectId}/${filename}`,
    },
    ls,
  } as unknown as ConstructorParameters<typeof WorkspaceWindow>[0]);
  return win;
};

const editorAnswering = (applied: boolean, readOnly?: boolean) => {
  const requests: ApplyEditorColorParams[] = [];
  stopEditor = onProtocolRequest(ApplyEditorColorMessage.type, (message) => {
    requests.push(message.params);
    return ApplyEditorColorMessage.type.response(message.id, {
      applied,
      ...(readOnly ? { readOnly } : {}),
    });
  });
  return requests;
};

describe("the Change color intents", () => {
  it("opens over the value under the caret and closes again", () => {
    const w = mount();
    w.openChangeColor("main.sd", RANGE, "#ff8800", ORANGE);
    expect(workspace.state.value.screen.writingTools?.color).toEqual({
      filename: "main.sd",
      range: RANGE,
      value: "#ff8800",
      color: ORANGE,
    });
    w.closeWritingTools();
    expect(workspace.state.value.screen.writingTools?.color).toBeUndefined();
  });

  it("opens as a Writing tools view whose Back returns to the menu and drops the value", () => {
    const w = mount();
    w.openChangeColor("main.sd", RANGE, "#ff8800", ORANGE);
    expect(workspace.state.value.screen.writingTools).toMatchObject({
      view: "color",
      fromMenu: true,
    });
    w.showWritingToolsView("menu");
    expect(workspace.state.value.screen.writingTools).toEqual({
      view: "menu",
      fromMenu: false,
    });
  });

  it("applies a color through the editor at the value's range, then closes", async () => {
    const w = mount();
    const requests = editorAnswering(true);
    w.openChangeColor("main.sd", RANGE, "#ff8800", ORANGE);
    expect(await w.applyChangeColor("#ff880080")).toBe("applied");
    expect(requests).toEqual([
      {
        textDocument: { uri: `file:///${workspace.state.value.project.id}/main.sd` },
        range: RANGE,
        text: "#ff8800",
        color: { red: 1, green: 136 / 255, blue: 0, alpha: 128 / 255 },
      },
    ]);
    expect(workspace.state.value.screen.writingTools?.color).toBeUndefined();
  });

  it("refuses a value that is not a color and leaves the view open", async () => {
    const w = mount();
    const requests = editorAnswering(true);
    w.openChangeColor("main.sd", RANGE, "#ff8800", ORANGE);
    expect(await w.applyChangeColor("blue")).toBe("invalid");
    expect(requests).toEqual([]);
    expect(workspace.state.value.screen.writingTools?.color).toBeDefined();
  });

  it("reports a locked script and leaves the view open", async () => {
    const w = mount();
    editorAnswering(false, true);
    w.openChangeColor("main.sd", RANGE, "#ff8800", ORANGE);
    expect(await w.applyChangeColor("#00aaff")).toBe("locked");
    expect(workspace.state.value.screen.writingTools?.color).toBeDefined();
  });

  it("reports a value the editor no longer holds and leaves the view open", async () => {
    const w = mount();
    editorAnswering(false);
    w.openChangeColor("main.sd", RANGE, "#ff8800", ORANGE);
    expect(await w.applyChangeColor("#00aaff")).toBe("moved");
    expect(workspace.state.value.screen.writingTools?.color).toBeDefined();
  });
});

describe("the story's colors", () => {
  it("lists each color the scripts use once, in story order", async () => {
    const colorsOf: Record<string, unknown[]> = {
      "file:///p/main.sd": [rgb(1, 0, 0), rgb(0, 0, 1, 0.5)],
      "file:///p/chapter.sd": [rgb(0, 0, 1), rgb(1, 1, 1)],
      "file:///p/later.sd": [rgb(1, 0, 0, 0.2), rgb(0, 1, 0)],
    };
    const sendRequest = vi.fn(
      async (method: string, params: { textDocument: { uri: string } }) =>
        method === "textDocument/documentColor"
          ? colorsOf[params.textDocument.uri]
          : null,
    );
    const w = mount({
      connection: { sendRequest },
      getProgram: async () => ({
        scripts: {
          "file:///p/main.sd": 7,
          "file:///p/chapter.sd": 1,
          "file:///p/later.sd": 3,
        },
      }),
    });
    expect(await w.readStoryColors()).toEqual([
      "#ff0000",
      "#0000ff",
      "#ffffff",
      "#00ff00",
    ]);
  });

  it("orders a script's colors by where the script uses them, whatever order the server lists them in", async () => {
    const sendRequest = vi.fn(async () => [
      rgb(0, 0, 1, 1, 4, 2),
      rgb(1, 0, 0, 1, 1, 9),
      rgb(0, 1, 0, 1, 1, 2),
    ]);
    const w = mount({
      connection: { sendRequest },
      getProgram: async () => ({ scripts: { "file:///p/main.sd": 1 } }),
    });
    expect(await w.readStoryColors()).toEqual(["#00ff00", "#ff0000", "#0000ff"]);
  });

  it("keeps the colors of the scripts it could read and reports the script it could not", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("server stopped");
    const sendRequest = vi.fn(
      async (_method: string, params: { textDocument: { uri: string } }) => {
        if (params.textDocument.uri === "file:///p/chapter.sd") throw failure;
        return [rgb(1, 0, 0)];
      },
    );
    const w = mount({
      connection: { sendRequest },
      getProgram: async () => ({
        scripts: { "file:///p/main.sd": 1, "file:///p/chapter.sd": 1 },
      }),
    });
    expect(await w.readStoryColors()).toEqual(["#ff0000"]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("file:///p/chapter.sd"),
      failure,
    );
    error.mockRestore();
  });

  it("is empty before the language server starts", async () => {
    expect(await mount().readStoryColors()).toEqual([]);
  });
});
