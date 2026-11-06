import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LSPPlugin } from "@impower/codemirror-vscode-lsp-client/src";
import { ApplyEditorColorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorColorMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScriptEditorController } from "../src/modules/script-editor/ScriptEditorController";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

const URI = "file:///main.sd";
const HALF_ORANGE = { red: 1, green: 136 / 255, blue: 0, alpha: 128 / 255 };
const PRESENTATIONS = [
  { label: "#ff880080" },
  { label: "#FF880080" },
  { label: "rgb(255 136 0 / 50%)" },
];

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function mount(doc: string) {
  const host = document.body.appendChild(document.createElement("div"));
  view = new EditorView({ state: EditorState.create({ doc }), parent: host });
  const request = vi.fn(async () => PRESENTATIONS);
  vi.spyOn(LSPPlugin, "get").mockReturnValue({
    uri: URI,
    client: { request },
    toPosition: (character: number) => ({ line: 0, character }),
  } as unknown as LSPPlugin);
  const controller = new ScriptEditorController(
    host,
    { editor: host, loading: host, placeholder: host, main: host },
    {
      appearance: ALL_ON_APPEARANCE,
      languageServerWorker: {} as Worker,
      languageServerConnection: {} as never,
    },
  );
  const internals = controller as unknown as {
    _view: EditorView;
    _textDocument: { uri: string; text: string; version: number; languageId: string };
    handleApplyEditorColor: (
      message: ApplyEditorColorMessage.Request,
    ) => Promise<ApplyEditorColorMessage.Response | undefined>;
  };
  internals._view = view;
  internals._textDocument = { uri: URI, text: doc, version: 0, languageId: "sparkdown" };
  return { request, apply: internals.handleApplyEditorColor };
}

const applyAt = (
  apply: ReturnType<typeof mount>["apply"],
  from: number,
  text: string,
) =>
  apply(
    ApplyEditorColorMessage.type.request({
      textDocument: { uri: URI },
      range: {
        start: { line: 0, character: from },
        end: { line: 0, character: from + text.length },
      },
      text,
      color: HALF_ORANGE,
    }),
  );

describe("Use color in the script editor", () => {
  it("writes the color the server presents into the script", async () => {
    const { request, apply } = mount("text-color = #ff8800");
    const response = await applyAt(apply, 13, "#ff8800");
    expect(response && "result" in response && response.result).toEqual({ applied: true });
    expect(view!.state.doc.toString()).toBe("text-color = #ff880080");
    expect(request).toHaveBeenCalledWith(
      "textDocument/colorPresentation",
      expect.objectContaining({ color: HALF_ORANGE }),
    );
  });

  it("keeps the case the script wrote", async () => {
    const { apply } = mount("text-color = #FF8800");
    await applyAt(apply, 13, "#FF8800");
    expect(view!.state.doc.toString()).toBe("text-color = #FF880080");
  });

  it("refuses, leaving the script as it is, when the value has changed under the panel", async () => {
    const { request, apply } = mount("text-color = #00aaff");
    const response = await applyAt(apply, 13, "#ff8800");
    expect(response && "result" in response && response.result).toEqual({ applied: false });
    expect(view!.state.doc.toString()).toBe("text-color = #00aaff");
    expect(request).not.toHaveBeenCalled();
  });
});
