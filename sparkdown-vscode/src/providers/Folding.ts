import { FoldingRange, FoldingRangeProvider, TextDocument } from "vscode";
import { StructureItem } from "../../../sparkdown";
import { parseState } from "../state/parseState";

export class SparkdownFoldingRangeProvider implements FoldingRangeProvider {
  provideFoldingRanges(document: TextDocument): FoldingRange[] {
    const ranges: FoldingRange[] = [];
    const doc = parseState.parsedDocuments[document.uri.toString()];
    const structure = doc?.properties?.structure || {};
    if (doc) {
      const addRange = (
        structItem?: StructureItem,
        nextStructItem?: StructureItem,
        lastLine?: number
      ) => {
        if (!structItem) {
          return;
        }
        if (nextStructItem) {
          //this is the last child, so the end of the folding range is the end of the parent
          lastLine = nextStructItem.range.start.line;
        }
        ranges.push(
          new FoldingRange(structItem.range.start.line, (lastLine || 0) - 1)
        );

        if (structItem.children && structItem.children.length) {
          //for each child of the StructureItem, repeat this process recursively
          for (let i = 0; i < structItem.children.length; i++) {
            addRange(
              structure[structItem.children[i] || ""],
              structure[structItem.children[i + 1] || ""],
              lastLine
            );
          }
        }
      };

      const root = structure?.[""];

      if (root) {
        for (let i = 0; i < root.children.length; i++) {
          //for each structToken, add a new range starting on the current structToken and ending on either the next one, or the last line of the document
          addRange(
            structure[root.children[i] || ""],
            structure[root.children[i + 1] || ""],
            document.lineCount
          );
        }
      }
    }
    return ranges;
  }
}
