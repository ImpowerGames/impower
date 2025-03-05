import { Position } from "vscode-languageserver";
import {
  type TextDocument,
  type Range,
} from "vscode-languageserver-textdocument";
import { Tree } from "@lezer/common";
import { getSymbol } from "./getSymbol";

export const canRename = (
  document: TextDocument | undefined,
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
  const symbol = getSymbol(document, tree, position);
  if (!symbol) {
    return null;
  }
  const result = {
    start: document.positionAt(symbol.from),
    end: document.positionAt(symbol.to),
  };
  return result;
};
