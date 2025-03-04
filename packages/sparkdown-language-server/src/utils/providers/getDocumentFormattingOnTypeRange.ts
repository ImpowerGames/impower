import { Position } from "vscode-languageserver";
import {
  type TextDocument,
  type Range,
} from "vscode-languageserver-textdocument";
import { Tree } from "@lezer/common";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";

export const getDocumentFormattingOnTypeRange = (
  document: TextDocument | undefined,
  tree: Tree | undefined,
  position: Position,
  _triggerCharacter: string
): Range | null | undefined => {
  if (!document || !tree) {
    return undefined;
  }
  const leftStack = getStack<SparkdownNodeName>(
    tree,
    document.offsetAt(position),
    -1
  );
  const topLevelNode = leftStack.at(-2);
  if (!topLevelNode) {
    return null;
  }
  const result = {
    start: { line: document.positionAt(topLevelNode?.from).line, character: 0 },
    end: document.positionAt(topLevelNode?.to),
  };
  return result;
};
