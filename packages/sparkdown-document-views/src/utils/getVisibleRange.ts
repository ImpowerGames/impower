import { EditorView } from "@codemirror/view";
import { Range } from "../../../spark-editor-protocol/src/types";

export const getVisibleRange = (
  view: EditorView,
  scrollTop: number,
  scrollBottom: number
): Range => {
  const doc = view.state.doc;
  let startLineNumber = 0;
  let endLineNumber = 0;
  for (let i = 0; i < view.viewportLineBlocks.length; i += 1) {
    const block = view.viewportLineBlocks[i]!;
    if (block.height > 0) {
      const lineHeightVisible = block.bottom - scrollTop;
      const lineHeightObscured = scrollTop - block.top;
      if (
        block.bottom >= scrollTop &&
        startLineNumber === 0 &&
        lineHeightVisible > lineHeightObscured
      ) {
        startLineNumber = doc.lineAt(block.from).number;
      }
      if (block.bottom > scrollBottom && endLineNumber === 0) {
        endLineNumber = Math.max(1, doc.lineAt(block.from).number - 1);
        break;
      }
    }
  }
  if (startLineNumber === 0) {
    startLineNumber = 1;
  }
  if (endLineNumber === 0) {
    endLineNumber = doc.lines;
  }
  return {
    start: { line: startLineNumber - 1, character: 0 },
    end: { line: endLineNumber - 1, character: 0 },
  };
};
