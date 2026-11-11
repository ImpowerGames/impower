import { history, redo, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ApplyEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { ClaimedEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ClaimedEditorEditMessage";
import { DidLoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/DidLoadEditorMessage";
import {
  MessageProtocol,
  onProtocolRequest,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  applyEditorFix,
  editorFixes,
  undoEditorFix,
} from "@impower/sparkdown-document-views/src/modules/script-editor/utils/extensions/editorFixes";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "vscode-languageserver-protocol";
import {
  applyFix,
  FIX_REFUSED,
  FIX_UNDO_LABEL,
  type FixChoice,
  type FixDeps,
} from "../../src/modules/spark-editor/workspace/problems/applyFix";
import {
  findSameFix,
  openForFix,
  type OpenForFixDeps,
} from "../../src/modules/spark-editor/workspace/problems/openForFix";
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

const closeEditors = () => disposers.splice(0).forEach((dispose) => dispose());

const deps = (overrides: Partial<FixDeps> = {}): FixDeps => ({
  openForFix: vi.fn(async () => null),
  openScript: vi.fn(async () => false),
  refreshDiagnostics: vi.fn(async () => {}),
  recordScriptChange: vi.fn(async () => {}),
  ...overrides,
});

const nameDiagnostic = (text: string): Diagnostic => {
  const at = text.indexOf("alcie");
  return {
    range: { start: { line: 1, character: 7 }, end: { line: 1, character: 12 } },
    message: "Cannot find alcie",
    data: [
      {
        name: "Use alice instead",
        done: "Changed to alice.",
        expect: "alcie",
        kind: "name",
        changes: [{ from: at, to: at + 5, insert: "alice" }],
      },
    ],
  };
};

const sentEdits = () => {
  const edits: unknown[] = [];
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (ApplyEditorEditMessage.type.isRequest(detail)) {
      edits.push(detail.params);
    }
  };
  window.addEventListener(MessageProtocol.event, listener);
  disposers.push(() => window.removeEventListener(MessageProtocol.event, listener));
  return edits as { edit: { changes?: unknown; documentChanges?: unknown[] }; closedTexts?: unknown }[];
};

const reopening = (text: () => string, version: number) => {
  const opened: EditorView[] = [];
  const opening: OpenForFixDeps = {
    reveal: async () => {
      opened.push(openEditor(text()));
      sendProtocolMessage(
        DidLoadEditorMessage.type.notification({ textDocument: { uri: URI, version } }),
      );
    },
    pull: vi.fn(async () => ({ diagnostics: [nameDiagnostic(text())], version })),
    record: vi.fn(),
    wait: async () => {},
  };
  return { opening, opened };
};

describe("applying a fix from a problem", () => {
  it("in an open script, edits through the editor, says what it did, and Undo reverts exactly that", async () => {
    const view = openEditor(SCRIPT);
    expect(await applyFix(deps(), useAlice())).toBe(true);
    expect(view.state.doc.toString()).toBe(SCRIPT.replace("alcie", "alice"));
    expect(snackbar.value?.message).toBe("Changed to alice.");
    expect(snackbar.value?.actionLabel).toBe(FIX_UNDO_LABEL);
    view.dispatch({ changes: { from: 0, insert: "// top" + NEWLINE } });
    snackbar.value!.onAction!();
    await vi.waitFor(() =>
      expect(view.state.doc.toString()).toBe("// top" + NEWLINE + SCRIPT),
    );
  });

  it("in a script no editor holds, opens it at the problem first and applies the same fix through the editor", async () => {
    const { opening, opened } = reopening(() => SCRIPT, 5);
    const fixDeps = deps({ openForFix: (fix) => openForFix(opening, fix) });
    expect(await applyFix(fixDeps, useAlice())).toBe(true);
    expect(opened).toHaveLength(1);
    expect(opened[0]!.state.doc.toString()).toBe(SCRIPT.replace("alcie", "alice"));
    expect(snackbar.value?.message).toBe("Changed to alice.");
  });

  it("never writes a script no editor holds: with no editor coming to hold it, it changes nothing and says the line changed", async () => {
    const requests = sentEdits();
    const fixDeps = deps();
    expect(await applyFix(fixDeps, useAlice())).toBe(false);
    expect(fixDeps.openForFix).toHaveBeenCalledTimes(1);
    expect(snackbar.value?.message).toBe(FIX_REFUSED);
    expect(
      requests.filter((r) => r.closedTexts !== undefined || r.edit.changes || r.edit.documentChanges),
    ).toEqual([]);
  });

  it("cannot delete text written into a closed script since the problem was reported (round 3 reproduction)", async () => {
    const before = ["  // TODO: tidy", "Hello.", ""].join(NEWLINE);
    const after = ["Hi// TODO: tidy", "Hello.", ""].join(NEWLINE);
    const stale: FixChoice = {
      fix: {
        uri: URI,
        version: 0,
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 15 } },
        changes: [{ from: 0, to: before.indexOf("Hello."), insert: "" }],
        expect: "// TODO: tidy",
        kind: "note",
      },
      name: "Remove the note",
      done: "Note removed.",
    };
    const { opening, opened } = reopening(() => after, 0);
    opening.pull = vi.fn(async () => ({
      diagnostics: [
        {
          range: { start: { line: 0, character: 2 }, end: { line: 0, character: 15 } },
          message: "To do: tidy",
          data: [
            {
              name: "Remove the note",
              done: "Note removed.",
              expect: "// TODO: tidy",
              kind: "note",
              changes: [{ from: 2, to: after.length - "Hello.\n".length, insert: "" }],
            },
          ],
        },
      ],
      version: 0,
    }));
    expect(await applyFix(deps({ openForFix: (fix) => openForFix(opening, fix) }), stale)).toBe(false);
    expect(opened[0]!.state.doc.toString()).toBe(after);
    expect(snackbar.value?.message).toBe(FIX_REFUSED);
  });

  it.each([
    ["the name was retyped", SCRIPT.replace("alcie", "alcxe")],
    ["the name was extended", SCRIPT.replace("alcie", "alciex")],
  ])(
    "changes nothing and says the line changed when %s, then pulls the problems again",
    async (_, edited) => {
      const view = openEditor(edited);
      const fixDeps = deps();
      expect(await applyFix(fixDeps, useAlice())).toBe(false);
      expect(view.state.doc.toString()).toBe(edited);
      expect(snackbar.value?.message).toBe(FIX_REFUSED);
      expect(snackbar.value?.actionLabel).toBeUndefined();
      expect(fixDeps.refreshDiagnostics).toHaveBeenCalledWith(URI);
    },
  );

  it("still undoes from the toast after the author leaves the script, by opening it again", async () => {
    const view = openEditor(SCRIPT);
    let saved = "";
    const reopened: EditorView[] = [];
    const fixDeps = deps({
      openScript: vi.fn(async () => {
        reopened.push(openEditor(saved));
        return true;
      }),
    });
    await applyFix(fixDeps, useAlice());
    saved = view.state.doc.toString();
    closeEditors();
    snackbar.value!.onAction!();
    await vi.waitFor(() => expect(reopened[0]?.state.doc.toString()).toBe(SCRIPT));
    expect(fixDeps.openScript).toHaveBeenCalledTimes(1);
  });

  it("refuses Undo after the author typed in the script and left it, rather than reverting at moved offsets", async () => {
    const view = openEditor(SCRIPT);
    let saved = "";
    const reopened: EditorView[] = [];
    const fixDeps = deps({
      openScript: vi.fn(async () => {
        reopened.push(openEditor(saved));
        return true;
      }),
    });
    await applyFix(fixDeps, useAlice());
    view.dispatch({ changes: { from: 0, insert: "Intro. " } });
    saved = view.state.doc.toString();
    closeEditors();
    snackbar.value!.onAction!();
    await vi.waitFor(() => expect(snackbar.value?.message).toBe(FIX_REFUSED));
    expect(reopened[0]!.state.doc.toString()).toBe(saved);
  });

  it("restores exactly from the toast after the editor undid and redid the fix", async () => {
    const view = openEditor(SCRIPT);
    await applyFix(deps(), useAlice());
    undo(view);
    redo(view);
    snackbar.value!.onAction!();
    await vi.waitFor(() => expect(view.state.doc.toString()).toBe(SCRIPT));
  });
});

describe("opening a script for a fix", () => {
  it("finds only the identical fix in the fresh diagnostics", () => {
    const choice = useAlice();
    expect(findSameFix([nameDiagnostic(SCRIPT)], choice.fix)).toBeDefined();
    expect(findSameFix([nameDiagnostic("// moved" + NEWLINE + SCRIPT)], choice.fix)).toBeUndefined();
  });

  it("waits until the server's diagnostics belong to the editor's version before matching", async () => {
    let calls = 0;
    const { opening } = reopening(() => SCRIPT, 7);
    opening.pull = vi.fn(async () => {
      calls += 1;
      return { diagnostics: [nameDiagnostic(SCRIPT)], version: calls < 3 ? 6 : 7 };
    });
    const fresh = await openForFix(opening, useAlice(2).fix);
    expect(calls).toBe(3);
    expect(fresh?.version).toBe(7);
    expect(opening.record).toHaveBeenCalledTimes(1);
  });
});
