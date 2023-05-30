/* eslint-disable no-cond-assign */
import { parseRow } from "../constants/extension";
import { LeafBlockParser } from "../types/leafBlockParser";
import { BlockContext } from "./BlockContext";
import { Element } from "./Element";
import { LeafBlock } from "./LeafBlock";
import { Line } from "./Line";

export class TableParser implements LeafBlockParser {
  // Null means we haven't seen the second line yet, false means this
  // isn't a table, and an array means this is a table and we've
  // parsed the given rows so far.
  rows: false | null | Element[] = null;

  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    if (this.rows == null) {
      // Second line
      this.rows = false;
      let lineText;
      if (
        (line.next === 45 ||
          line.next === 58 ||
          line.next === 124) /* '-:|' */ &&
        /^\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?$/.test(
          (lineText = line.text.slice(line.pos))
        )
      ) {
        const firstRow: Element[] = [];
        const firstCount = parseRow(cx, leaf.content, 0, firstRow, leaf.start);
        if (firstCount === parseRow(cx, lineText, line.pos))
          this.rows = [
            cx.elt(
              "TableHeader",
              leaf.start,
              leaf.start + leaf.content.length,
              firstRow
            ),
            cx.elt(
              "TableDelimiter",
              cx.lineStart + line.pos,
              cx.lineStart + line.text.length
            ),
          ];
      }
    } else if (this.rows) {
      // Line after the second
      const content: Element[] = [];
      parseRow(cx, line.text, line.pos, content, cx.lineStart);
      this.rows.push(
        cx.elt(
          "TableRow",
          cx.lineStart + line.pos,
          cx.lineStart + line.text.length,
          content
        )
      );
    }
    return false;
  }

  finish(cx: BlockContext, leaf: LeafBlock): boolean {
    if (this.rows) {
      this.emit(cx, leaf);
      return true;
    }
    return false;
  }

  emit(cx: BlockContext, leaf: LeafBlock): void {
    const newElement = cx.elt(
      "Table",
      leaf.start,
      leaf.start + leaf.content.length,
      this.rows as readonly Element[]
    );
    cx.addLeafElement(leaf, newElement);
  }
}
