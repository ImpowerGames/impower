import type { PreviewLineResult } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import { signal } from "@preact/signals";
import { afterEach, describe, expect, test } from "vitest";
import WorkspacePreviewLine from "../../src/modules/spark-editor/workspace/WorkspacePreviewLine";
import workspace, {
  type ShownBeatDescription,
} from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const URI = "file:///main.sd";

const harness = () => {
  const caret = signal<{ uri: string; line: number } | undefined>(undefined);
  const shown = signal<ShownBeatDescription>(null);
  const pending: { line: number; answer: (result: PreviewLineResult) => void }[] = [];
  const lines = new WorkspacePreviewLine({
    caret: () => caret.value,
    shownBeatDescription: () => shown.value,
    getPreviewLine: (_uri, line) =>
      new Promise((resolve) => pending.push({ line, answer: resolve })),
    onPublishedDiagnostics: () => () => {},
  });
  return { caret, shown, pending, lines };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  workspace.previewLine.value = null;
});

describe("the strip while the player is still resolving", () => {
  test("shows the player's description of the beat on screen without asking the language server", () => {
    const h = harness();
    dispose = () => h.lines.dispose();
    h.caret.value = { uri: URI, line: 1 };
    h.shown.value = { kind: "action", words: "First." };
    h.pending.splice(0);
    h.caret.value = { uri: URI, line: 3 };
    expect(h.pending, "the language server is not asked while a beat is shown").toEqual([]);
    expect(workspace.previewLine.value).toEqual({
      uri: URI,
      line: 3,
      preview: { kind: "action", words: "First." },
    });
    h.shown.value = { kind: "action", words: "Third." };
    expect(workspace.previewLine.value?.preview).toEqual({ kind: "action", words: "Third." });
  });

  test("keeps the newer line's label when the older answer arrives last", async () => {
    const h = harness();
    dispose = () => h.lines.dispose();
    h.caret.value = { uri: URI, line: 1 };
    h.caret.value = { uri: URI, line: 3 };
    const older = h.pending.find((p) => p.line === 1)!;
    const newer = h.pending.at(-1)!;
    expect(newer.line).toBe(3);
    newer.answer({ kind: "setup" });
    await flush();
    older.answer({ kind: "empty" });
    await flush();
    expect(workspace.previewLine.value).toEqual({
      uri: URI,
      line: 3,
      preview: { kind: "setup" },
    });
  });

  test("an answer asked for before the player showed a beat cannot replace that beat's description", async () => {
    const h = harness();
    dispose = () => h.lines.dispose();
    h.caret.value = { uri: URI, line: 1 };
    const asked = h.pending.at(-1)!;
    h.shown.value = { kind: "dialogue", words: "First. Second.", speaker: "ALICE" };
    asked.answer({ kind: "empty" });
    await flush();
    expect(workspace.previewLine.value?.preview).toEqual({
      kind: "dialogue",
      words: "First. Second.",
      speaker: "ALICE",
    });
  });

  test("names no beat once the player displays none", async () => {
    const h = harness();
    dispose = () => h.lines.dispose();
    h.caret.value = { uri: URI, line: 1 };
    h.shown.value = { kind: "action", words: "First." };
    h.shown.value = null;
    const asked = h.pending.at(-1)!;
    expect(asked.line).toBe(1);
    asked.answer({ kind: "empty" });
    await flush();
    expect(workspace.previewLine.value?.preview).toEqual({ kind: "empty" });
  });
});
