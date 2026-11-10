import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver";

const COMMENT_NAMES = new Set(["SparkdownLineComment", "SparkdownInlineComment"]);

const BLOCK_COMMENT_NAME = "SparkdownBlockComment";

const BLOCK_COMMENT_CONTENT_NAME = "SparkdownBlockCommentContent";

const TODO_REGEX = /^\s*todo(?![\p{L}\p{N}_])\s*:?\s*/iu;

export const TODO_NOTE_SOURCE = "todo";

export const TODO_NOTE_TITLE = "To do";

export const getTodoNotes = (
  document: SparkdownDocument,
  tree: Tree | undefined,
): Diagnostic[] => {
  const notes: Diagnostic[] = [];
  const note = (from: number, bodyFrom: number, bodyTo: number, to: number) => {
    const text = document.read(bodyFrom, bodyTo);
    const match = TODO_REGEX.exec(text);
    if (!match) return;
    const rest = text.slice(match[0].length).trimEnd();
    notes.push({
      range: {
        start: document.positionAt(from),
        end: document.positionAt(to),
      },
      severity: DiagnosticSeverity.Information,
      source: TODO_NOTE_SOURCE,
      message: rest ? `${TODO_NOTE_TITLE}: ${rest}` : TODO_NOTE_TITLE,
    });
  };
  const blockCommentNotes = (comment: SyntaxNode) => {
    const opener = comment
      .getChild(`${BLOCK_COMMENT_NAME}_begin`)
      ?.getChild(`${BLOCK_COMMENT_NAME}_begin_c2`);
    const content = comment.getChild(`${BLOCK_COMMENT_NAME}_content`);
    if (!opener || !content) return;
    for (
      let line = content.getChild(BLOCK_COMMENT_CONTENT_NAME);
      line;
      line = line.nextSibling
    ) {
      if (line.name !== BLOCK_COMMENT_CONTENT_NAME) continue;
      const onOpenerLine = line.from === opener.to;
      const text = document.read(line.from, line.to);
      const from = onOpenerLine
        ? opener.from
        : line.from + (text.length - text.trimStart().length);
      note(from, line.from, line.to, line.from + text.trimEnd().length);
    }
  };
  tree?.iterate({
    enter: (node) => {
      if (node.name === BLOCK_COMMENT_NAME) {
        blockCommentNotes(node.node);
        return false;
      }
      if (!COMMENT_NAMES.has(node.name)) return;
      const mark = node.node.getChild(`${node.name}_c2`);
      const body = node.node.getChild(`${node.name}_c3`);
      if (mark && body) {
        note(mark.from, body.from, body.to, body.to);
      }
      return false;
    },
  });
  return notes;
};
