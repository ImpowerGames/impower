import { Diagnostic } from "@codemirror/lint";
import { Text } from "@codemirror/text";
import { EditorView } from "@codemirror/view";
import { parseFountain } from "../../impower-script-parser";

const getErrorPosition = (
  error: SyntaxError,
  doc: Text
): { from: number; to: number } => {
  const m = error.message.match(/at line (\d+) \((\d+)-(\d+)\)/);
  if (m) {
    const line = Number(m[1]);
    const start = Number(m[2]);
    const end = Number(m[3]);
    const lineFrom = doc.line(line).from;
    const from = Math.min(lineFrom + start - 1, doc.length);
    const to = Math.min(lineFrom + end - 1, doc.length);
    return {
      from,
      to,
    };
  }
  return { from: 0, to: 0 };
};

export const fountainParseLinter = (view: EditorView): Diagnostic[] => {
  try {
    parseFountain(view.state.doc.toString());
  } catch (e) {
    if (!(e instanceof SyntaxError)) {
      throw e;
    }
    console.error(e);
    const { from, to } = getErrorPosition(e, view.state.doc);
    return [
      {
        message: e.message,
        severity: "error",
        from,
        to,
      },
    ];
  }
  return [];
};
