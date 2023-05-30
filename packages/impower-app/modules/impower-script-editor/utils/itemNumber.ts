import { Text } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";

export const itemNumber = (item: SyntaxNode, doc: Text): RegExpExecArray => {
  return /^(\s*)(\d+)(?=[.)])/.exec(doc.sliceString(item.from, item.from + 10));
};
