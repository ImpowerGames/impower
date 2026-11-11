import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LSPPlugin, versioning } from "@impower/codemirror-vscode-lsp-client/src";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { AuditionEditorConstructMessage } from "@impower/spark-editor-protocol/src/protocols/editor/AuditionEditorConstructMessage";
import { InsertEditorConstructMessage } from "@impower/spark-editor-protocol/src/protocols/editor/InsertEditorConstructMessage";
import {
  PreviewCompletionMessage,
  type PreviewCompletionParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScriptEditorController } from "../src/modules/script-editor/ScriptEditorController";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

vi.mock("@codemirror/language", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@codemirror/language")>();
  const { SparkdownDocumentRegistry: Registry } =
    await import("@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry");
  return {
    ...actual,
    ensureSyntaxTree: (state: { doc: { toString(): string } }) => {
      const documents = new Registry(["declarations"]);
      const uri = "file:///tree.sd";
      documents.set({
        textDocument: { uri, text: state.doc.toString(), version: 1, languageId: "sparkdown" },
      });
      return documents.tree(uri);
    },
  };
});

const URI = "file:///main.sd";
const LF = String.fromCharCode(10);
const SCRIPT = ["scene start", "  Hello.", "end", ""].join(LF);
const SCENE = {
  name: "start",
  kind: 5,
  range: { start: { line: 0, character: 0 }, end: { line: 2, character: 3 } },
  selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } },
};

let view: EditorView | undefined;
const sent: PreviewCompletionParams[] = [];
const listen = (event: Event) => {
  const message = (event as CustomEvent).detail;
  if (PreviewCompletionMessage.type.isNotification(message)) sent.push(message.params);
};

afterEach(() => {
  window.removeEventListener(MessageProtocol.event, listen);
  sent.length = 0;
  view?.destroy();
  view = undefined;
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function mount(held?: (() => void)[]) {
  const host = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: SCRIPT,
      selection: { anchor: SCRIPT.indexOf("Hello.") },
      extensions: [versioning(3)],
    }),
    parent: host,
  });
  const shown = view;
  vi.spyOn(LSPPlugin, "get").mockReturnValue({
    uri: URI,
    client: {
      sync: () => {},
      request: () =>
        held
          ? new Promise((resolve) => held.push(() => resolve([SCENE])))
          : Promise.resolve([SCENE]),
      workspace: { getFile: () => ({ getView: () => shown }) },
    },
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
    handleAuditionEditorConstruct: (
      message: AuditionEditorConstructMessage.Request,
    ) => Promise<AuditionEditorConstructMessage.Response | undefined>;
    handleInsertEditorConstruct: (
      message: InsertEditorConstructMessage.Request,
    ) => Promise<InsertEditorConstructMessage.Response | undefined>;
  };
  internals._view = view;
  internals._textDocument = { uri: URI, text: SCRIPT, version: 0, languageId: "sparkdown" };
  window.addEventListener(MessageProtocol.event, listen);
  const audition = (shown: { construct: string; name: string } | null) =>
    internals.handleAuditionEditorConstruct(
      AuditionEditorConstructMessage.type.request({ textDocument: { uri: URI }, audition: shown }),
    );
  const insert = (construct: string, name?: string) =>
    internals.handleInsertEditorConstruct(
      InsertEditorConstructMessage.type.request({ textDocument: { uri: URI }, construct, name }),
    );
  return { audition, insert };
}

const resultOf = (response: { result?: unknown } | undefined) => response?.result;

describe("auditioning a picked construct in the script editor", () => {
  it("shows the planned line to the preview at its own line without changing the script", async () => {
    const { audition } = mount();
    expect(resultOf(await audition({ construct: "backdrop", name: "beach" }))).toEqual({ shown: true });
    expect(view!.state.doc.toString()).toBe(SCRIPT);
    expect(sent).toHaveLength(1);
    const [focus] = sent;
    expect(focus!.state).toBe("focus");
    expect(focus!.textDocument.uri).toBe(URI);
    expect(focus!.contentChanges).toEqual([
      {
        range: { start: { line: 1, character: 8 }, end: { line: 1, character: 8 } },
        text: `${LF}  [[show backdrop beach]]`,
      },
    ]);
    expect(focus!.selectedRange!.start.line).toBe(2);
  });

  it("replaces a shown audition in the same session and reverts it with a close", async () => {
    const { audition } = mount();
    await audition({ construct: "backdrop", name: "beach" });
    await audition({ construct: "backdrop", name: "beach@night" });
    expect(resultOf(await audition(null))).toEqual({ shown: false });
    await audition(null);
    expect(sent.map((params) => [params.state, params.session])).toEqual([
      ["focus", sent[0]!.session],
      ["focus", sent[0]!.session],
      ["close", sent[0]!.session],
    ]);
    expect(sent[1]!.contentChanges![0]!.text).toContain("beach@night");
    expect(sent[2]!.accepted).toBeUndefined();
    expect(sent.map((params) => params.request)).toEqual(
      [...sent.map((params) => params.request)].sort((a, b) => a - b),
    );
    expect(view!.state.doc.toString()).toBe(SCRIPT);
  });

  it("keeps the shown frame when the same line is inserted, closing the audition as accepted", async () => {
    const { audition, insert } = mount();
    await audition({ construct: "backdrop", name: "beach" });
    expect(resultOf(await insert("backdrop", "beach"))).toEqual({ inserted: true });
    expect(view!.state.doc.toString()).toBe(["scene start", "  Hello.", "  [[show backdrop beach]]", "end", ""].join(LF));
    expect(sent.map((params) => params.state)).toEqual(["focus", "close"]);
    expect(sent[1]!.accepted).toEqual({ version: sent[0]!.textDocument.version, contentChanges: sent[0]!.contentChanges });
    await audition(null);
    expect(sent).toHaveLength(2);
  });

  it("closes the audition without accepting it when another line is inserted", async () => {
    const { audition, insert } = mount();
    await audition({ construct: "backdrop", name: "beach" });
    await insert("backdrop", "harbor");
    expect(sent.map((params) => params.state)).toEqual(["focus", "close"]);
    expect(sent[1]!.accepted).toBeUndefined();
  });

  it("shows nothing for an audition the server answers after the picker closed", async () => {
    const held: (() => void)[] = [];
    const { audition } = mount(held);
    const pending = audition({ construct: "backdrop", name: "beach" });
    expect(resultOf(await audition(null))).toEqual({ shown: false });
    held.splice(0).forEach((answer) => answer());
    expect(resultOf(await pending)).toEqual({ shown: false });
    expect(sent).toEqual([]);
  });

  it("keeps the newest audition when the server answers an older one last", async () => {
    const held: (() => void)[] = [];
    const { audition } = mount(held);
    const older = audition({ construct: "backdrop", name: "beach" });
    const newer = audition({ construct: "backdrop", name: "beach@night" });
    const [answerOlder, answerNewer] = held.splice(0);
    answerNewer!();
    await newer;
    answerOlder!();
    await older;
    expect(sent.map((params) => params.contentChanges?.[0]?.text)).toEqual([
      `${LF}  [[show backdrop beach@night]]`,
    ]);
  });

  it("shows nothing for an audition the server answers after an insert", async () => {
    const held: (() => void)[] = [];
    const { audition, insert } = mount(held);
    const pending = audition({ construct: "backdrop", name: "beach" });
    const inserting = insert("backdrop", "harbor");
    held.splice(0).forEach((answer) => answer());
    await pending;
    held.splice(0).forEach((answer) => answer());
    expect(resultOf(await inserting)).toEqual({ inserted: true });
    expect(sent.filter((params) => params.state === "focus")).toEqual([]);
  });
});
