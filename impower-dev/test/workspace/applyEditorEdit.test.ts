import { ApplyEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { ClaimedEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ClaimedEditorEditMessage";
import {
  onProtocolRequest,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEditorEdit } from "../../src/modules/spark-editor/workspace/applyEditorEdit";

const MAIN = "file:///p/main.sd";
const CHAPTER = "file:///p/chapter.sd";

const edit = (uri: string) => ({
  textDocument: { uri, version: null },
  edits: [
    {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      newText: "tale",
    },
  ],
});

const rename = { kind: "rename" as const, oldUri: "file:///p/a.png", newUri: "file:///p/b.png" };

const files = () => ({
  getFileText: vi.fn(async (uri: string) => `text of ${uri}`),
  applyWorkspaceEdit: vi.fn(async () => ({ applied: true })),
});

let disposers: (() => void)[] = [];

afterEach(() => {
  disposers.forEach((d) => d());
  disposers = [];
});

const editorHolding = (uri: string) => {
  const seen: ApplyEditorEditMessage.Request[] = [];
  disposers.push(
    onProtocolRequest(ApplyEditorEditMessage.type, (message) => {
      seen.push(message);
      sendProtocolMessage(
        ClaimedEditorEditMessage.type.notification({ request: message.id, uri }),
      );
      return ApplyEditorEditMessage.type.response(message.id, { applied: [uri] });
    }),
  );
  return seen;
};

describe("an edit across scripts goes through the editor that holds the open script", () => {
  it("writes everything but the claimed script through the file system", async () => {
    const fs = files();
    const seen = editorHolding(MAIN);
    await applyEditorEdit(
      fs,
      { documentChanges: [edit(MAIN), edit(CHAPTER), rename] },
      "Rename",
    );
    expect(seen[0]!.params.closedTexts).toEqual({
      [MAIN]: `text of ${MAIN}`,
      [CHAPTER]: `text of ${CHAPTER}`,
    });
    expect(fs.applyWorkspaceEdit).toHaveBeenCalledWith(
      { documentChanges: [edit(CHAPTER), rename] },
      "Rename",
      { isRefactoring: true },
    );
  });

  it("writes every script through the file system when no editor is mounted", async () => {
    const fs = files();
    await applyEditorEdit(fs, { changes: { [MAIN]: edit(MAIN).edits } }, "Replace all");
    expect(fs.applyWorkspaceEdit).toHaveBeenCalledWith(
      { documentChanges: [edit(MAIN)] },
      "Replace all",
      { isRefactoring: true },
    );
  });

  it("leaves the file system alone when the editor took the whole edit", async () => {
    const fs = files();
    editorHolding(MAIN);
    expect(
      await applyEditorEdit(fs, { documentChanges: [edit(MAIN)] }, "Replace"),
    ).toEqual({ applied: true });
    expect(fs.applyWorkspaceEdit).not.toHaveBeenCalled();
  });
});
