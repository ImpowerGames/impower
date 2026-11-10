import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type Tree } from "@lezer/common";
import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver";

const COMMENT_NAMES = new Set(["SparkdownLineComment", "SparkdownInlineComment"]);

const TODO_REGEX = /^\s*todo(?![\p{L}\p{N}_])\s*:?\s*/iu;

export const TODO_NOTE_SOURCE = "todo";

export const TODO_NOTE_TITLE = "To do";

export const getTodoNotes = (
  document: SparkdownDocument,
  tree: Tree | undefined,
): Diagnostic[] => {
  const notes: Diagnostic[] = [];
  tree?.iterate({
    enter: (node) => {
      if (!COMMENT_NAMES.has(node.name)) return;
      const mark = node.node.getChild(`${node.name}_c2`);
      const body = node.node.getChild(`${node.name}_c3`);
      if (mark && body) {
        const text = document.read(body.from, body.to);
        const match = TODO_REGEX.exec(text);
        if (match) {
          const rest = text.slice(match[0].length).trimEnd();
          notes.push({
            range: {
              start: document.positionAt(mark.from),
              end: document.positionAt(body.to),
            },
            severity: DiagnosticSeverity.Information,
            source: TODO_NOTE_SOURCE,
            message: rest ? `${TODO_NOTE_TITLE}: ${rest}` : TODO_NOTE_TITLE,
            data: { expect: document.read(mark.from, body.to) },
          });
        }
      }
      return false;
    },
  });
  return notes;
};
