import { SparkdownDocument } from "@impower/sparkdown/src/classes/SparkdownDocument";
import { Tree } from "@lezer/common";
import { Position } from "vscode-languageserver";
import { type Range } from "vscode-languageserver-textdocument";
import { getSymbol } from "./getSymbol";

export const canRename = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  position: Position
):
  | Range
  | {
      range: Range;
      placeholder: string;
    }
  | {
      defaultBehavior: boolean;
    }
  | null
  | undefined => {
  if (!document || !tree) {
    return undefined;
  }
  const { symbol, nameRange } = getSymbol(document, tree, position);
  if (!symbol) {
    return null;
  }
  return nameRange;
};
