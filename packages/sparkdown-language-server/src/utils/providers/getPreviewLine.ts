import type { PreviewLine } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { declares } from "@impower/sparkdown/src/compiler/utils/declarationOnly";
import type { Tree } from "@lezer/common";

const SETUP = new Set(["FrontMatter", "Include"]);

const COMMENTS = new Set([
  "SparkdownLineComment",
  "SparkdownBlockComment",
  "SparkdownInlineComment",
]);

export const getPreviewLine = (
  document: SparkdownDocument,
  tree: Tree,
  line: number,
): PreviewLine => {
  const read = (from: number, to: number) => document.read(from, to);
  const lineAt = (offset: number) => document.positionAt(offset).line;
  const from = document.offsetAt({ line, character: 0 });
  const to =
    line + 1 < document.lineCount
      ? document.offsetAt({ line: line + 1, character: 0 })
      : document.length;

  let setup = false;
  const comments: [number, number][] = [];
  tree.iterate({
    from,
    to,
    enter: (node) => {
      if (setup) {
        return false;
      }
      const covers =
        lineAt(node.from) <= line &&
        line <= lineAt(Math.max(node.from, node.to - 1));
      if (covers && (SETUP.has(node.name) || declares(node.node, read))) {
        setup = true;
        return false;
      }
      if (COMMENTS.has(node.name)) {
        comments.push([Math.max(from, node.from), Math.min(to, node.to)]);
        return false;
      }
      return undefined;
    },
  });
  if (setup) {
    return { kind: "setup" };
  }
  let rest = "";
  let pos = from;
  for (const [start, end] of comments.sort((a, b) => a[0] - b[0])) {
    rest += read(pos, Math.max(pos, start));
    pos = Math.max(pos, end);
  }
  rest += read(pos, to);
  return read(from, to).trim() !== "" && rest.trim() === ""
    ? { kind: "setup" }
    : { kind: "empty" };
};
