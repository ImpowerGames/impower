import { history, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  ApplyEditorEditMessage,
  type EditorFix,
} from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorFixes } from "../src/modules/script-editor/utils/extensions/editorFixes";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

const created: EditorView[] = [];

vi.mock(
  "../src/modules/script-editor/utils/createEditorView",
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
      ...actual,
      default: (
        parent: HTMLElement,
        config: { textDocument: { text: string } },
      ) => {
        const view = new EditorView({
          state: EditorState.create({
            doc: config.textDocument.text,
            extensions: [history(), editorFixes()],
          }),
          parent,
        });
        created.push(view);
        return [view, { dispose: () => {} }];
      },
    };
  },
);

const { ScriptEditorController } = await import(
  "../src/modules/script-editor/ScriptEditorController"
);

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const MAIN = "file:///project/main.sd";
const NEWLINE = String.fromCharCode(10);
const TEXT = ["scene start", "  [[show backdrop beahc]]", "end"].join(NEWLINE);
const FIXED = ["scene start", "  [[show backdrop beach]]", "end"].join(NEWLINE);
const FROM = TEXT.indexOf("beahc");
const TO = FROM + "beahc".length;

const fix: EditorFix = {
  uri: MAIN,
  range: {
    start: { line: 1, character: 18 },
    end: { line: 1, character: 23 },
  },
  changes: [{ from: FROM, to: TO, insert: "beach" }],
  expect: "beahc",
  kind: "name",
};

const hosts: HTMLElement[] = [];
const controllers: { dispose: () => void }[] = [];

const open = () => {
  const host = document.body.appendChild(document.createElement("div"));
  hosts.push(host);
  const controller = new ScriptEditorController(
    host,
    {
      editor: host.appendChild(document.createElement("div")),
      loading: host.appendChild(document.createElement("div")),
      placeholder: host.appendChild(document.createElement("div")),
      main: host.appendChild(document.createElement("div")),
    },
    {
      appearance: ALL_ON_APPEARANCE,
      languageServerWorker: {} as Worker,
      languageServerConnection: {} as never,
    },
  );
  controllers.push(controller);
  controller["handleLoadEditor"]({
    ...LoadEditorMessage.type.request({
      textDocument: { uri: MAIN, languageId: "sparkdown", version: 0, text: TEXT },
      languageServerInitializeParams: { rootUri: "file:///project" } as never,
      languageServerInitializeResult: {} as never,
    }),
    id: "load",
  } as LoadEditorMessage.Request);
  return { controller, view: created.at(-1)! };
};

const applyFromApp = (
  controller: InstanceType<typeof ScriptEditorController>,
) =>
  controller["handleApplyEditorEdit"]({
    ...ApplyEditorEditMessage.type.request({
      label: "Use beach instead",
      edit: {},
      fix,
    }),
    id: "fix",
  } as ApplyEditorEditMessage.Request);

const elsewhere = () => {
  const button = document.body.appendChild(document.createElement("button"));
  hosts.push(button);
  button.focus();
  return button;
};

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  created.splice(0).forEach((view) => view.destroy());
  hosts.splice(0).forEach((host) => host.remove());
});

describe("focus after a quick fix", () => {
  it("returns to the script after the change when the writer chose the fix in the script's problem popover", async () => {
    const { controller, view } = open();
    const popoverButton = elsewhere();
    controller["handleFix"]({
      uri: MAIN,
      range: fix.range,
      action: {
        name: "Use beach instead",
        done: "Changed to beach.",
        expect: fix.expect,
        kind: fix.kind,
        changes: fix.changes,
      },
    } as never);
    popoverButton.remove();
    const response = await applyFromApp(controller);
    expect(response.result).toMatchObject({ applied: [MAIN] });
    expect(view.state.doc.toString()).toBe(FIXED);
    expect(view.hasFocus).toBe(true);
    expect(view.state.selection.main.head).toBe(TO);
    undo(view);
    expect(view.state.doc.toString()).toBe(TEXT);
  });

  it("stays where it was when the fix came from the Problems panel or dialog", async () => {
    const { controller, view } = open();
    const panelButton = elsewhere();
    const response = await applyFromApp(controller);
    expect(response.result).toMatchObject({ applied: [MAIN] });
    expect(view.state.doc.toString()).toBe(FIXED);
    expect(view.hasFocus).toBe(false);
    expect(document.activeElement).toBe(panelButton);
  });
});
