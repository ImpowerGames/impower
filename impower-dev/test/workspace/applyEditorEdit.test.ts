import { ApplyEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { ClaimedEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ClaimedEditorEditMessage";
import {
  onProtocolRequest,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type {
  ApplyWorkspaceEditResult,
  WorkspaceEdit,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyEditorEdit,
  documentChangesOf,
} from "../../src/modules/spark-editor/workspace/applyEditorEdit";

const MAIN = "file:///p/main.sd";
const CHAPTER = "file:///p/chapter.sd";

const edit = (uri: string) => ({
  textDocument: { uri, version: null },
  edits: [
    {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
      newText: "tale",
    },
  ],
});

const rename = {
  kind: "rename" as const,
  oldUri: "file:///p/a.png",
  newUri: "file:///p/b.png",
};

const ROLLED_BACK = { complete: true, failed: [], kept: [] };

let events: string[] = [];

const worker = (
  fail?: ApplyWorkspaceEditResult,
  whileApplying: () => void = () => {},
) => ({
  getFileText: vi.fn(async (uri: string) => `text of ${uri}`),
  applyWorkspaceEdit: vi.fn(
    async (
      _edit: WorkspaceEdit,
      _label?: string,
      _metadata?: { isRefactoring?: boolean },
      _expectedTexts?: Record<string, string>,
      commit?: () => Promise<string | undefined>,
    ): Promise<ApplyWorkspaceEditResult> => {
      events.push("worker applied the rest");
      whileApplying();
      if (fail) {
        return fail;
      }
      const refusal = await commit?.();
      return refusal
        ? { applied: false, failureReason: refusal, rollback: ROLLED_BACK }
        : { applied: true };
    },
  ),
});

let disposers: (() => void)[] = [];

afterEach(() => {
  disposers.forEach((d) => d());
  disposers = [];
  events = [];
});

const editorHolding = (uri: string, text = `open text of ${uri}`) => {
  const editor = {
    text,
    seen: [] as ApplyEditorEditMessage.Request[],
    applied: [] as ApplyEditorEditMessage.Request[],
  };
  disposers.push(
    onProtocolRequest(ApplyEditorEditMessage.type, (message) => {
      editor.seen.push(message);
      const { edit, claim, expectedTexts } = message.params;
      const held = documentChangesOf(edit).some(
        (c) => "textDocument" in c && c.textDocument.uri === uri,
      );
      if (!held) {
        return ApplyEditorEditMessage.type.response(message.id, {
          applied: [],
        });
      }
      sendProtocolMessage(
        ClaimedEditorEditMessage.type.notification({
          request: message.id,
          uri,
          text: editor.text,
        }),
      );
      if (claim) {
        return ApplyEditorEditMessage.type.response(message.id, {
          applied: [],
        });
      }
      const expected = expectedTexts ? expectedTexts[uri] : editor.text;
      if (expected === undefined) {
        return ApplyEditorEditMessage.type.response(message.id, {
          applied: [],
        });
      }
      if (expected !== editor.text) {
        return ApplyEditorEditMessage.type.response(message.id, {
          applied: [],
          refused: [uri],
        });
      }
      events.push("editor applied its script");
      editor.applied.push(message);
      editor.text = "edited";
      return ApplyEditorEditMessage.type.response(message.id, {
        applied: [uri],
      });
    }),
  );
  return editor;
};

describe("an edit across scripts goes through the editor that holds the open script", () => {
  it("writes everything but the held script through the worker, checking each closed script's text", async () => {
    const fs = worker();
    const editor = editorHolding(MAIN);
    expect(
      await applyEditorEdit(
        fs,
        { documentChanges: [edit(MAIN), edit(CHAPTER), rename] },
        "Rename",
      ),
    ).toEqual({ applied: true });
    expect(fs.applyWorkspaceEdit).toHaveBeenCalledWith(
      { documentChanges: [edit(CHAPTER), rename] },
      "Rename",
      { isRefactoring: true },
      { [CHAPTER]: `text of ${CHAPTER}` },
      expect.any(Function),
    );
    expect(editor.applied.map((m) => m.params)).toEqual([
      expect.objectContaining({
        closedTexts: { [CHAPTER]: `text of ${CHAPTER}` },
        expectedTexts: { [MAIN]: `open text of ${MAIN}` },
      }),
    ]);
    expect(editor.text).toBe("edited");
  });

  it("applies the held script's edits only after the worker has applied the rest", async () => {
    const fs = worker();
    editorHolding(MAIN);
    await applyEditorEdit(
      fs,
      { documentChanges: [edit(MAIN), rename] },
      "Rename",
    );
    expect(events).toEqual([
      "worker applied the rest",
      "editor applied its script",
    ]);
  });

  it("leaves the held script unchanged when the worker fails and rolls back the rest", async () => {
    const failed = {
      applied: false,
      failureReason: "a.png is locked",
      rollback: ROLLED_BACK,
    };
    const fs = worker(failed);
    const editor = editorHolding(MAIN);
    expect(
      await applyEditorEdit(
        fs,
        { documentChanges: [edit(MAIN), rename] },
        "Rename",
      ),
    ).toEqual(failed);
    expect(editor.applied).toEqual([]);
    expect(editor.text).toBe(`open text of ${MAIN}`);
  });

  it("refuses the edit, so the worker rolls back, when the held script is typed in while the worker runs", async () => {
    const editor = editorHolding(MAIN);
    const fs = worker(undefined, () => {
      editor.text = "typed";
    });
    const result = await applyEditorEdit(
      fs,
      { documentChanges: [edit(MAIN), rename] },
      "Rename",
    );
    expect(result).toEqual({
      applied: false,
      failureReason: "main.sd changed before the edit could be applied",
      rollback: ROLLED_BACK,
    });
    expect(editor.applied).toEqual([]);
    expect(editor.text).toBe("typed");
  });

  it("refuses the edit when a script it changes is opened and typed in while the worker runs", async () => {
    let opened: ReturnType<typeof editorHolding> | undefined;
    const fs = worker(undefined, () => {
      opened = editorHolding(CHAPTER, `text of ${CHAPTER} typed`);
    });
    expect(
      await applyEditorEdit(fs, { documentChanges: [edit(CHAPTER), rename] }, "Rename"),
    ).toEqual({
      applied: false,
      failureReason: "chapter.sd changed before the edit could be applied",
      rollback: ROLLED_BACK,
    });
    expect(opened!.applied).toEqual([]);
    expect(opened!.text).toBe(`text of ${CHAPTER} typed`);
  });

  it("lets the worker's write reach a script opened, untouched, while the worker ran", async () => {
    let opened: ReturnType<typeof editorHolding> | undefined;
    const fs = worker(undefined, () => {
      opened = editorHolding(CHAPTER, `text of ${CHAPTER}`);
    });
    expect(
      await applyEditorEdit(fs, { documentChanges: [edit(CHAPTER), rename] }, "Rename"),
    ).toEqual({ applied: true });
    expect(opened!.applied).toEqual([]);
  });

  it("refuses before the worker runs when two editors hold one script with different text", async () => {
    const fs = worker();
    const first = editorHolding(MAIN, "one");
    const second = editorHolding(MAIN, "two");
    expect(
      await applyEditorEdit(fs, { documentChanges: [edit(MAIN), rename] }, "Rename"),
    ).toEqual({
      applied: false,
      failureReason: "main.sd changed before the edit could be applied",
      rollback: ROLLED_BACK,
    });
    expect(fs.applyWorkspaceEdit).not.toHaveBeenCalled();
    expect([first.applied, second.applied]).toEqual([[], []]);
  });

  it("names the edit's kind and the files the worker changes for the trash", async () => {
    const fs = worker();
    editorHolding(MAIN);
    await applyEditorEdit(
      fs,
      { documentChanges: [edit(MAIN), edit(CHAPTER), rename] },
      "Rename",
      "rename-symbol",
    );
    expect(fs.applyWorkspaceEdit).toHaveBeenCalledWith(
      { documentChanges: [edit(CHAPTER), rename] },
      "Rename",
      {
        isRefactoring: true,
        action: { kind: "rename-symbol", targets: [CHAPTER, rename.oldUri] },
      },
      { [CHAPTER]: `text of ${CHAPTER}` },
      expect.any(Function),
    );
  });

  it("writes every script through the worker when no editor is mounted", async () => {
    const fs = worker();
    expect(
      await applyEditorEdit(
        fs,
        { changes: { [MAIN]: edit(MAIN).edits } },
        "Replace all",
      ),
    ).toEqual({ applied: true });
    expect(fs.applyWorkspaceEdit).toHaveBeenCalledWith(
      { documentChanges: [edit(MAIN)] },
      "Replace all",
      { isRefactoring: true },
      { [MAIN]: `text of ${MAIN}` },
      expect.any(Function),
    );
  });

  it("leaves the worker alone when the editor holds the whole edit", async () => {
    const fs = worker();
    const editor = editorHolding(MAIN);
    expect(
      await applyEditorEdit(fs, { documentChanges: [edit(MAIN)] }, "Replace"),
    ).toEqual({ applied: true });
    expect(fs.applyWorkspaceEdit).not.toHaveBeenCalled();
    expect(editor.text).toBe("edited");
  });
});
