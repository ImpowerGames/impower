import { LeafBlockParser } from "../types/leafBlockParser";
import { Type } from "../types/type";
import { isSetextUnderline } from "../utils/markdown";
import { BlockContext } from "./BlockContext";
import { Element } from "./Element";
import { LeafBlock } from "./LeafBlock";
import { Line } from "./Line";

export class SetextHeadingParser implements LeafBlockParser {
  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    const underline =
      line.depth < cx.stack.length ? -1 : isSetextUnderline(line);
    const next = line?.next;
    if (underline < 0) {
      return false;
    }
    const underlineMark = new Element(
      Type.HeaderMark,
      cx.lineStart + line.pos,
      cx.lineStart + underline
    );
    cx.nextLine();
    const newElement = new Element(
      next === 61 ? Type.SetextHeading1 : Type.SetextHeading2,
      leaf.start,
      cx.prevLineEnd(),
      [...cx.parser.parseInline(leaf.content, leaf.start), underlineMark]
    );
    cx.addLeafElement(leaf, newElement);
    return true;
  }

  finish(): boolean {
    return false;
  }
}
