import type { PreviewLineResult } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import { signal } from "@preact/signals";
import { afterEach, describe, expect, test } from "vitest";
import WorkspacePreviewLine from "../../src/modules/spark-editor/workspace/WorkspacePreviewLine";
import workspace, { type ShownBeat } from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const URI = "file:///main.sd";

const beatOn = (line: number): ShownBeat => ({
  uri: URI,
  range: { start: { line, character: 2 }, end: { line, character: 2 } },
});

const harness = () => {
  const caret = signal<{ uri: string; line: number } | undefined>(undefined);
  const shownBeat = signal<ShownBeat>(null);
  const pending: {
    shownBeat: ShownBeat;
    answer: (result: PreviewLineResult) => void;
  }[] = [];
  const lines = new WorkspacePreviewLine({
    caret: () => caret.value,
    shownBeat: () => shownBeat.value,
    getPreviewLine: (_uri, _line, beat) =>
      new Promise((resolve) => pending.push({ shownBeat: beat, answer: resolve })),
    onPublishedDiagnostics: () => () => {},
  });
  return { caret, shownBeat, pending, lines };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  workspace.previewLine.value = null;
});

describe("the strip while the player is still resolving", () => {
  test("keeps the newer beat's words when the older answer arrives last", async () => {
    const h = harness();
    dispose = () => h.lines.dispose();
    h.caret.value = { uri: URI, line: 1 };
    h.shownBeat.value = beatOn(1);
    h.caret.value = { uri: URI, line: 3 };
    h.shownBeat.value = beatOn(3);
    const older = h.pending.find((p) => p.shownBeat?.range.start.line === 1)!;
    const newer = h.pending.at(-1)!;
    expect(newer.shownBeat?.range.start.line).toBe(3);
    newer.answer({ kind: "action", words: "Newer." });
    await flush();
    older.answer({ kind: "action", words: "Older." });
    await flush();
    expect(workspace.previewLine.value).toEqual({
      uri: URI,
      line: 3,
      preview: { kind: "action", words: "Newer." },
    });
  });

  test("describes the beat on screen, not one it has left, while the caret has moved ahead of the player", async () => {
    const h = harness();
    dispose = () => h.lines.dispose();
    h.caret.value = { uri: URI, line: 1 };
    h.shownBeat.value = beatOn(1);
    h.pending.at(-1)!.answer({ kind: "action", words: "First." });
    await flush();
    h.caret.value = { uri: URI, line: 3 };
    const asked = h.pending.at(-1)!;
    expect(asked.shownBeat?.range.start.line, "the request names the beat still on screen").toBe(1);
    asked.answer({ kind: "action", words: "First." });
    await flush();
    h.shownBeat.value = beatOn(3);
    h.pending.at(-1)!.answer({ kind: "action", words: "Third." });
    await flush();
    expect(workspace.previewLine.value?.preview).toEqual({ kind: "action", words: "Third." });
  });

  test("names no beat once the player displays none", async () => {
    const h = harness();
    dispose = () => h.lines.dispose();
    h.caret.value = { uri: URI, line: 1 };
    h.shownBeat.value = beatOn(1);
    h.pending.at(-1)!.answer({ kind: "action", words: "First." });
    await flush();
    h.shownBeat.value = null;
    const asked = h.pending.at(-1)!;
    expect(asked.shownBeat).toBeNull();
    asked.answer({ kind: "empty" });
    await flush();
    expect(workspace.previewLine.value?.preview).toEqual({ kind: "empty" });
  });
});
