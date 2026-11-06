import { history, historyField, undo, undoDepth } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ApplyEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { ClaimedEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ClaimedEditorEditMessage";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { SetEditorFindMatchesMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SetEditorFindMatchesMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findMatches } from "../src/modules/script-editor/utils/extensions/findMatches";
import type { SerializableEditorState } from "../src/modules/script-editor/types/editor";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

const NEWLINE = String.fromCharCode(10);
const lines = (...text: string[]) => text.join(NEWLINE);

type Config = {
  textDocument: { uri: string; text: string };
  defaultState?: SerializableEditorState;
};

const created: { view: EditorView; config: Config }[] = [];

vi.mock("../src/modules/script-editor/utils/createEditorView", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    default: (parent: HTMLElement, config: Config) => {
      const doc = config.textDocument.text;
      const saved = config.defaultState;
      const restored = saved?.selection
        ? EditorState.fromJSON(
            { doc, selection: saved.selection, history: saved.history },
            {},
            { history: historyField },
          )
        : undefined;
      const view = new EditorView({
        state: EditorState.create({
          doc,
          extensions: [
            history(),
            findMatches(),
            ...(restored
              ? [historyField.init(() => restored.field(historyField))]
              : []),
          ],
        }),
        parent,
      });
      created.push({ view, config });
      return [view, { dispose: () => {} }];
    },
  };
});

const { ScriptEditorController } = await import(
  "../src/modules/script-editor/ScriptEditorController"
);

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const MAIN = "file:///project/main.sd";
const CHAPTER = "file:///project/chapter.sd";
const MAIN_TEXT = lines("scene start", "  The rumour spread.", "end");
const CHAPTER_TEXT = lines("scene chapter", "  A rumour, another rumour.", "end");

const hosts: HTMLElement[] = [];

const mount = () => {
  const host = document.body.appendChild(document.createElement("div"));
  hosts.push(host);
  const refs = {
    editor: host.appendChild(document.createElement("div")),
    loading: host.appendChild(document.createElement("div")),
    placeholder: host.appendChild(document.createElement("div")),
    main: host.appendChild(document.createElement("div")),
  };
  return new ScriptEditorController(host, refs, {
    appearance: ALL_ON_APPEARANCE,
    languageServerWorker: {} as Worker,
    languageServerConnection: {} as never,
  });
};

let nextId = 0;

const load = (
  controller: InstanceType<typeof ScriptEditorController>,
  uri: string,
  text: string,
  rootUri = "file:///project",
) => {
  controller["handleLoadEditor"]({
    ...LoadEditorMessage.type.request({
      textDocument: { uri, languageId: "sparkdown", version: 0, text },
      languageServerInitializeParams: { rootUri } as never,
      languageServerInitializeResult: {} as never,
    }),
    id: `load-${nextId++}`,
  } as LoadEditorMessage.Request);
  return created[created.length - 1]!.view;
};

const replaceRumour = (line: number, characters: number[]) => ({
  textDocument: { uri: "", version: null },
  edits: characters.map((character) => ({
    range: {
      start: { line, character },
      end: { line, character: character + 6 },
    },
    newText: "tale",
  })),
});

const applyEdit = (controller: InstanceType<typeof ScriptEditorController>) =>
  controller["handleApplyEditorEdit"]({
    ...ApplyEditorEditMessage.type.request({
      label: "Replace all",
      edit: {
        documentChanges: [
          { ...replaceRumour(1, [6]), textDocument: { uri: MAIN, version: null } },
          { ...replaceRumour(1, [4, 20]), textDocument: { uri: CHAPTER, version: null } },
        ],
      },
      closedTexts: { [CHAPTER]: CHAPTER_TEXT },
    }),
    id: `edit-${nextId++}`,
  } as ApplyEditorEditMessage.Request);

const undoIn = (view: EditorView) => undo(view);

afterEach(() => {
  created.splice(0).forEach(({ view }) => view.destroy());
  hosts.splice(0).forEach((host) => host.remove());
});

describe("Replace all through the editor's own history", () => {
  it("changes the open script as one undo step and reports which script it applied", async () => {
    const controller = mount();
    const view = load(controller, MAIN, MAIN_TEXT);
    const response = await applyEdit(controller);
    expect(response.result).toEqual({ applied: [MAIN] });
    expect(view.state.doc.toString()).toBe(lines("scene start", "  The tale spread.", "end"));
    expect(undoDepth(view.state)).toBe(1);
    undoIn(view);
    expect(view.state.doc.toString()).toBe(MAIN_TEXT);
  });

  it("claims the open script while the request is dispatched, before it applies anything", () => {
    const controller = mount();
    load(controller, MAIN, MAIN_TEXT);
    const claims: unknown[] = [];
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (ClaimedEditorEditMessage.type.is(detail)) {
        claims.push(detail.params);
      }
    };
    window.addEventListener(MessageProtocol.event, listener);
    try {
      const pending = applyEdit(controller);
      expect(claims).toEqual([{ request: expect.anything(), uri: MAIN }]);
      return pending;
    } finally {
      window.removeEventListener(MessageProtocol.event, listener);
    }
  });

  it("claims nothing when none of the edit is in the open script", async () => {
    const controller = mount();
    load(controller, "file:///project/epilogue.sd", "scene epilogue");
    const claims: unknown[] = [];
    const listener = (e: Event) => {
      if (ClaimedEditorEditMessage.type.is((e as CustomEvent).detail)) {
        claims.push(e);
      }
    };
    window.addEventListener(MessageProtocol.event, listener);
    try {
      const response = await applyEdit(controller);
      expect(claims).toEqual([]);
      expect(response.result).toEqual({ applied: [] });
    } finally {
      window.removeEventListener(MessageProtocol.event, listener);
    }
  });

  it("gives a closed script one undo step that it keeps when it is opened", async () => {
    const controller = mount();
    load(controller, MAIN, MAIN_TEXT);
    await applyEdit(controller);
    const replaced = lines("scene chapter", "  A tale, another tale.", "end");
    const chapter = load(controller, CHAPTER, replaced);
    expect(undoDepth(chapter.state)).toBe(1);
    undoIn(chapter);
    expect(chapter.state.doc.toString()).toBe(CHAPTER_TEXT);
  });

  it("keeps the open script's history when the writer switches away and back", async () => {
    const controller = mount();
    load(controller, MAIN, MAIN_TEXT);
    await applyEdit(controller);
    load(controller, CHAPTER, lines("scene chapter", "  A tale, another tale.", "end"));
    const main = load(controller, MAIN, lines("scene start", "  The tale spread.", "end"));
    expect(undoDepth(main.state)).toBe(1);
    undoIn(main);
    expect(main.state.doc.toString()).toBe(MAIN_TEXT);
  });

  it("starts fresh when the script changed elsewhere while it was closed", async () => {
    const controller = mount();
    load(controller, MAIN, MAIN_TEXT);
    await applyEdit(controller);
    const chapter = load(controller, CHAPTER, "something else entirely");
    expect(undoDepth(chapter.state)).toBe(0);
  });

  it("forgets every script's history when another project loads", async () => {
    const controller = mount();
    load(controller, MAIN, MAIN_TEXT);
    await applyEdit(controller);
    const chapter = load(
      controller,
      CHAPTER,
      lines("scene chapter", "  A tale, another tale.", "end"),
      "file:///other-project",
    );
    expect(undoDepth(chapter.state)).toBe(0);
  });

  it("lights up the matches it is given in the open script, and only there", async () => {
    const controller = mount();
    const view = load(controller, MAIN, MAIN_TEXT);
    const set = (uri: string) =>
      controller["handleSetEditorFindMatches"]({
        ...SetEditorFindMatchesMessage.type.request({
          textDocument: { uri },
          ranges: [
            { start: { line: 1, character: 6 }, end: { line: 1, character: 12 } },
          ],
        }),
        id: `find-${nextId++}`,
      } as SetEditorFindMatchesMessage.Request);
    set(CHAPTER);
    expect(view.contentDOM.querySelectorAll(".cm-searchMatch").length).toBe(0);
    set(MAIN);
    const marks = view.contentDOM.querySelectorAll(".cm-searchMatch");
    expect([...marks].map((m) => m.textContent)).toEqual(["rumour"]);
  });
});
