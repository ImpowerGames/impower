import { LeafBlockParser } from "../types/leafBlockParser";
import { Type } from "../types/type";
import { isSceneHeading } from "../utils/markdown";
import { BlockContext } from "./BlockContext";
import { Element } from "./Element";
import { LeafBlock } from "./LeafBlock";
import { Line } from "./Line";

export class DialogueParser implements LeafBlockParser {
  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    const size = isSceneHeading(line);
    if (size < 0) {
      return false;
    }
    const mark = new Element(
      Type.CharacterMark,
      cx.lineStart + line.pos,
      cx.lineStart + size
    );
    cx.nextLine();
    cx.addLeafElement(
      leaf,
      new Element(Type.Character, leaf.start, cx.prevLineEnd(), [
        ...cx.parser.parseInline(leaf.content, leaf.start),
        mark,
      ])
    );
    return true;
  }

  finish(): boolean {
    return false;
  }
}
