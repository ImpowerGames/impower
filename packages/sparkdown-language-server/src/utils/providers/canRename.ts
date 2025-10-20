import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
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
  const { nameRange, canRename } = getSymbol(document, tree, position);
  if (!canRename) {
    return null;
  }
  return nameRange;
};
