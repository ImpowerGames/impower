import type { TextDocument } from "vscode-languageserver-textdocument";
import type { SyntaxNode } from "../../../../grammar-compiler/src/compiler/classes/Tree";

export const getNodeText = (
  node: SyntaxNode | null | undefined,
  document: TextDocument
): string => {
  if (node == null) {
    return "";
  }
  return document.getText({
    start: document.positionAt(node.from),
    end: document.positionAt(node.to),
  });
};
