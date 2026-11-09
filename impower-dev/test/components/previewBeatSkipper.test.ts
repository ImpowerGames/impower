import { describe, expect, it, vi } from "vitest";
import { createPreviewBeatSkipper } from "../../src/modules/spark-editor/workspace/previewBeatSkipper";

const URI = "file://project/main.sd";

const editorAt = (line: number) => {
  const editor = {
    uri: URI,
    selectedRange: {
      start: { line, character: 0 },
      end: { line, character: 0 },
    },
  };
  const window = {
    getActiveEditorForPane: vi.fn(() => editor),
    showDocument: vi.fn(async (_uri: string, range: typeof editor.selectedRange) => {
      editor.selectedRange = range;
      return { success: true };
    }),
  };
  return { editor, window };
};

describe("skipping the preview by beat", () => {
  it("moves the caret to the language server's next or previous beat", async () => {
    const { editor, window } = editorAt(4);
    const beats = [1, 4, 9, 15];
    const ls = {
      getOffsetSourceLocation: vi.fn(async (uri: string, line: number, offset: number) => {
        const index = beats.indexOf(line) + offset;
        return beats[index] != null ? { file: uri, line: beats[index]! } : null;
      }),
    };
    const skip = createPreviewBeatSkipper({ window, ls });
    expect(await skip(1)).toBe(true);
    expect(ls.getOffsetSourceLocation).toHaveBeenLastCalledWith(URI, 4, 1);
    expect(editor.selectedRange.start.line).toBe(9);
    expect(window.showDocument).toHaveBeenLastCalledWith(
      URI,
      { start: { line: 9, character: 0 }, end: { line: 9, character: 0 } },
      true,
      true,
    );
    expect(await skip(1)).toBe(true);
    expect(editor.selectedRange.start.line).toBe(15);
    expect(await skip(1)).toBe(false);
    expect(editor.selectedRange.start.line).toBe(15);
    expect(await skip(-1)).toBe(true);
    expect(editor.selectedRange.start.line).toBe(9);
  });

  it("stays put when the beat is in another script or no script is open", async () => {
    const { editor, window } = editorAt(2);
    const ls = {
      getOffsetSourceLocation: vi.fn(async () => ({ file: "file://project/other.sd", line: 0 })),
    };
    const skip = createPreviewBeatSkipper({ window, ls });
    expect(await skip(1)).toBe(false);
    expect(window.showDocument).not.toHaveBeenCalled();
    expect(editor.selectedRange.start.line).toBe(2);
    window.getActiveEditorForPane.mockReturnValue(undefined as never);
    expect(await skip(1)).toBe(false);
  });

  const heldSkip = () => {
    let answer: (value: { file: string; line: number }) => void = () => {};
    const ls = {
      getOffsetSourceLocation: vi.fn(
        () => new Promise<{ file: string; line: number }>((resolve) => (answer = resolve)),
      ),
    };
    return { ls, answer: (line: number) => answer({ file: URI, line }) };
  };

  it("keeps a caret the author moved while the language server looked for the beat", async () => {
    const { editor, window } = editorAt(4);
    const { ls, answer } = heldSkip();
    const skip = createPreviewBeatSkipper({ window, ls });
    const skipping = skip(1);
    editor.selectedRange = {
      start: { line: 6, character: 2 },
      end: { line: 6, character: 2 },
    };
    answer(9);
    expect(await skipping).toBe(false);
    expect(window.showDocument).not.toHaveBeenCalled();
    expect(editor.selectedRange.start).toEqual({ line: 6, character: 2 });
  });

  it("stays in the script the author switched to while the language server looked for the beat", async () => {
    const { editor, window } = editorAt(4);
    const { ls, answer } = heldSkip();
    const skip = createPreviewBeatSkipper({ window, ls });
    const skipping = skip(1);
    window.getActiveEditorForPane.mockReturnValue({
      ...editor,
      uri: "file://project/other.sd",
    });
    answer(9);
    expect(await skipping).toBe(false);
    expect(window.showDocument).not.toHaveBeenCalled();
  });

  it("drops a skip that arrives while the previous one is still moving", async () => {
    const { editor, window } = editorAt(0);
    let answer: (value: { file: string; line: number }) => void = () => {};
    const ls = {
      getOffsetSourceLocation: vi.fn(
        () => new Promise<{ file: string; line: number }>((resolve) => (answer = resolve)),
      ),
    };
    const skip = createPreviewBeatSkipper({ window, ls });
    const first = skip(1);
    expect(await skip(1)).toBe(false);
    answer({ file: URI, line: 3 });
    expect(await first).toBe(true);
    expect(ls.getOffsetSourceLocation).toHaveBeenCalledTimes(1);
    expect(editor.selectedRange.start.line).toBe(3);
  });
});
