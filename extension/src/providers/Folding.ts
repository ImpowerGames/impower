import { FoldingRange, FoldingRangeProvider, TextDocument } from "vscode";
import { StructureItem } from "../../../sparkdown";
import { editorState } from "../state/editorState";

export class SparkdownFoldingRangeProvider implements FoldingRangeProvider {
  provideFoldingRanges(document: TextDocument): FoldingRange[] {
    const ranges: FoldingRange[] = [];
    if (editorState.parsedDocuments[document.uri.toString()]) {
      const addRange = (
        structItem: StructureItem,
        nextStructItem: StructureItem,
        lastLine: number
      ) => {
        if (nextStructItem) {
          //this is the last child, so the end of the folding range is the end of the parent
          lastLine = nextStructItem.range.start.line;
        }
        ranges.push(
          new FoldingRange(structItem.range.start.line, lastLine - 1)
        );

        if (structItem.children && structItem.children.length) {
          //for each child of the StructureItem, repeat this process recursively
          for (let i = 0; i < structItem.children.length; i++) {
            addRange(
              structItem.children[i],
              structItem.children[i + 1],
              lastLine
            );
          }
        }
      };

      const parsed = editorState.parsedDocuments[document.uri.toString()];
      const structure = parsed.properties?.structure || [];
      for (let i = 0; i < structure.length; i++) {
        //for each structToken, add a new range starting on the current structToken and ending on either the next one, or the last line of the document
        addRange(structure[i], structure[i + 1], document.lineCount);
      }
    }
    return ranges;
  }
}
