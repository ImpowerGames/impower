import type { Range } from "@impower/spark-editor-protocol/src/types";

export interface PreviewBeatSkipperDeps {
  window: {
    getActiveEditorForPane(
      pane: "logic",
    ): { uri: string; selectedRange?: Range } | undefined;
    showDocument(
      uri: string,
      range: Range,
      takeFocus: boolean,
      userEvent: boolean,
    ): unknown;
  };
  ls: {
    getOffsetSourceLocation(
      uri: string,
      line: number,
      offset: number,
    ): Promise<{ file: string; line: number } | null>;
  };
}

export const createPreviewBeatSkipper = ({
  window,
  ls,
}: PreviewBeatSkipperDeps) => {
  let skipping = false;
  return async (direction: -1 | 1): Promise<boolean> => {
    const editor = window.getActiveEditorForPane("logic");
    if (!editor || skipping) {
      return false;
    }
    skipping = true;
    try {
      const { uri, selectedRange } = editor;
      const target = await ls.getOffsetSourceLocation(
        uri,
        selectedRange?.start.line ?? 0,
        direction,
      );
      if (!target || target.file !== uri) {
        return false;
      }
      await window.showDocument(
        uri,
        {
          start: { line: target.line, character: 0 },
          end: { line: target.line, character: 0 },
        },
        true,
        true,
      );
      return true;
    } finally {
      skipping = false;
    }
  };
};
