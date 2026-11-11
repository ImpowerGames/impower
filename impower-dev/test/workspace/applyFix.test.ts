import { history } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ApplyEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { ClaimedEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ClaimedEditorEditMessage";
import {
  onProtocolRequest,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  applyEditorFix,
  editorFixes,
  undoEditorFix,
} from "@impower/sparkdown-document-views/src/modules/script-editor/utils/extensions/editorFixes";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextEdit } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  applyFix,
  FIX_REFUSED,
  FIX_UNDO_LABEL,
  type FixChoice,
} from "../../src/modules/spark-editor/workspace/problems/applyFix";
import { snackbar } from "../../src/modules/spark-editor/utils/snackbar";

const URI = "file:///p/main.sd";
const NEWLINE = String.fromCharCode(10);
const SCRIPT = ["scene start", "  show alcie", "end", ""].join(NEWLINE);
const AT = SCRIPT.indexOf("alcie");

const useAlice = (version = 1): FixChoice => ({
  fix: {
    uri: URI,
    version,
    range: {
      start: { line: 1, character: 7 },
      end: { line: 1, character: 12 },
    },
    changes: [{ from: AT, to: AT + 5, insert: "alice" }],
    expect: "alcie",
    kind: "name",
  },
  name: "Use alice instead",
  done: "Changed to alice.",
});

let disposers: (() => void)[] = [];

afterEach(() => {
  disposers.forEach((dispose) => dispose());
  disposers = [];
  snackbar.value = null;
});

const closedScript = (initial: string) => {
  let text = initial;
  return {
    text: () => text,
    edit: (next: string) => {
      text = next;
    },
    deps: {
      getFileText: vi.fn(async () => text),
      offeredFixes: vi.fn(async () => {
        const at = text.indexOf("alcie");
        return at < 0
          ? []
          : [
              {
                changes: [{ from: at, to: at + 5, insert: "alice" }],
                expect: "alcie",
                kind: "name" as const,
              },
            ];
      }),
      applyWorkspaceEdit: vi.fn(
        async (edit: {
          documentChanges?: { edits: TextEdit[] }[];
        }) => {
          text = TextDocument.applyEdits(
            TextDocument.create(URI, "sparkdown", 1, text),
            edit.documentChanges!.flatMap((change) => change.edits),
          );
          return { applied: true };
        },
      ),
      refreshDiagnostics: vi.fn(async () => {}),
      recordScriptChange: vi.fn(async () => {}),
    },
  };
};

const openEditor = (text: string) => {
  const view = new EditorView({
    state: EditorState.create({ doc: text, extensions: [history(), editorFixes()] }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  disposers.push(
    onProtocolRequest(ApplyEditorEditMessage.type, (message) => {
      const { fix, undoFix } = message.params;
      if ((fix?.uri ?? undoFix?.uri) !== URI) {
        return ApplyEditorEditMessage.type.response(message.id, { applied: [] });
      }
      sendProtocolMessage(
        ClaimedEditorEditMessage.type.notification({ request: message.id, uri: URI }),
      );
      if (fix) {
        const revert = applyEditorFix(view, fix, message.id);
        return ApplyEditorEditMessage.type.response(
          message.id,
          revert ? { applied: [URI], revert } : { applied: [], refused: [URI] },
        );
      }
      return ApplyEditorEditMessage.type.response(
        message.id,
        undoEditorFix(view, undoFix!)
          ? { applied: [URI] }
          : { applied: [], refused: [URI] },
      );
    }),
    () => view.destroy(),
  );
  return view;
};

const undoFromToast = async () => {
  expect(snackbar.value?.actionLabel).toBe(FIX_UNDO_LABEL);
  snackbar.value!.onAction!();
  await vi.waitFor(() => expect(snackbar.value?.message).not.toBe("Changed to alice."));
};

describe("applying a fix from a problem", () => {
  it("in an open script, edits through the editor, says what it did, and Undo reverts exactly that", async () => {
    const view = openEditor(SCRIPT);
    const script = closedScript("unused");
    expect(await applyFix(script.deps, useAlice())).toBe(true);
    expect(view.state.doc.toString()).toBe(SCRIPT.replace("alcie", "alice"));
    expect(script.deps.applyWorkspaceEdit).not.toHaveBeenCalled();
    expect(snackbar.value?.message).toBe("Changed to alice.");
    view.dispatch({ changes: { from: 0, insert: "// top" + NEWLINE } });
    snackbar.value!.onAction!();
    await vi.waitFor(() =>
      expect(view.state.doc.toString()).toBe("// top" + NEWLINE + SCRIPT),
    );
  });

  it("still undoes from the toast after the author opens another script, through the saved file", async () => {
    const view = openEditor(SCRIPT);
    const script = closedScript("unused");
    await applyFix(script.deps, useAlice());
    script.edit(view.state.doc.toString());
    disposers.splice(0).forEach((dispose) => dispose());
    snackbar.value!.onAction!();
    await vi.waitFor(() => expect(script.text()).toBe(SCRIPT));
    expect(snackbar.value?.message).not.toBe(FIX_REFUSED);
  });

  it("still undoes from the toast after the author comes back to the script in a new editor", async () => {
    const first = openEditor(SCRIPT);
    const script = closedScript("unused");
    await applyFix(script.deps, useAlice());
    const fixed = first.state.doc.toString();
    disposers.splice(0).forEach((dispose) => dispose());
    const reopened = openEditor(fixed);
    snackbar.value!.onAction!();
    await vi.waitFor(() => expect(reopened.state.doc.toString()).toBe(SCRIPT));
    expect(script.deps.applyWorkspaceEdit).not.toHaveBeenCalled();
  });

  it("in a closed script, writes the file, says what it did, and Undo restores the text", async () => {
    const script = closedScript(SCRIPT);
    expect(await applyFix(script.deps, useAlice())).toBe(true);
    expect(script.text()).toBe(SCRIPT.replace("alcie", "alice"));
    expect(snackbar.value?.message).toBe("Changed to alice.");
    expect(script.deps.recordScriptChange).toHaveBeenCalledTimes(1);
    snackbar.value!.onAction!();
    await vi.waitFor(() => expect(script.text()).toBe(SCRIPT));
  });

  it.each([
    ["the name was retyped", SCRIPT.replace("alcie", "alcxe")],
    ["the name was extended", SCRIPT.replace("alcie", "alciex")],
  ])(
    "changes nothing and says the line changed when %s, then pulls the problems again",
    async (_, edited) => {
      const script = closedScript(edited);
      expect(await applyFix(script.deps, useAlice())).toBe(false);
      expect(script.text()).toBe(edited);
      expect(script.deps.applyWorkspaceEdit).not.toHaveBeenCalled();
      expect(snackbar.value?.message).toBe(FIX_REFUSED);
      expect(snackbar.value?.actionLabel).toBeUndefined();
      expect(script.deps.refreshDiagnostics).toHaveBeenCalledWith(URI);
    },
  );

  it("refuses in an open script whose name changed since the problem was reported", async () => {
    const view = openEditor(SCRIPT.replace("alcie", "alciex"));
    const script = closedScript(SCRIPT);
    expect(await applyFix(script.deps, useAlice())).toBe(false);
    expect(view.state.doc.toString()).toBe(SCRIPT.replace("alcie", "alciex"));
    expect(script.text()).toBe(SCRIPT);
    expect(snackbar.value?.message).toBe(FIX_REFUSED);
  });

  it("applies a fix the server reported for a script never opened, which carries no version", async () => {
    const script = closedScript(SCRIPT);
    const choice = useAlice();
    delete choice.fix.version;
    expect(await applyFix(script.deps, choice)).toBe(true);
    expect(script.text()).toBe(SCRIPT.replace("alcie", "alice"));
  });

  it.each([
    ["a version", 1],
    ["no version", undefined],
  ])("changes nothing in a closed script edited since the problem was reported with %s, though the name still sits at the same line and column", async (_, version) => {
    const edited = SCRIPT.replace("scene start", "scene start here");
    const script = closedScript(edited);
    const choice = useAlice();
    choice.fix.version = version;
    expect(await applyFix(script.deps, choice)).toBe(false);
    expect(script.text()).toBe(edited);
    expect(script.deps.applyWorkspaceEdit).not.toHaveBeenCalled();
    expect(snackbar.value?.message).toBe(FIX_REFUSED);
  });

  it("refuses Undo after the author leaves a script they typed in since the fix, rather than reverting at moved offsets", async () => {
    const NOTE = ["Hello.", "// TODO: tidy", "Bye.", ""].join(NEWLINE);
    const view = openEditor(NOTE);
    const script = closedScript("unused");
    const at = NOTE.indexOf("// TODO");
    await applyFix(script.deps, {
      fix: {
        uri: URI,
        version: 1,
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 13 } },
        changes: [{ from: at, to: at + 14, insert: "" }],
        expect: "// TODO: tidy",
        kind: "note",
      },
      name: "Remove the note",
      done: "Note removed.",
    });
    view.dispatch({ changes: { from: 0, insert: "Intro. " } });
    script.edit(view.state.doc.toString());
    disposers.splice(0).forEach((dispose) => dispose());
    expect(snackbar.value?.message).toBe("Note removed.");
    snackbar.value!.onAction!();
    await vi.waitFor(() => expect(snackbar.value?.message).toBe(FIX_REFUSED));
    expect(script.text()).toBe(["Intro. Hello.", "Bye.", ""].join(NEWLINE));
  });

  it("says the line changed when Undo finds the fixed text edited", async () => {
    const script = closedScript(SCRIPT);
    await applyFix(script.deps, useAlice());
    script.edit(script.text().replace("alice", "alicia"));
    await undoFromToast();
    expect(snackbar.value?.message).toBe(FIX_REFUSED);
    expect(script.text()).toBe(SCRIPT.replace("alcie", "alicia"));
  });
});
