import { LeafBlockParser } from "../types/leafBlockParser";
import { BlockContext } from "./BlockContext";
import { LeafBlock } from "./LeafBlock";

export class TaskParser implements LeafBlockParser {
  nextLine(): boolean {
    return false;
  }

  finish(cx: BlockContext, leaf: LeafBlock): boolean {
    cx.addLeafElement(
      leaf,
      cx.elt("Task", leaf.start, leaf.start + leaf.content.length, [
        cx.elt("TaskMarker", leaf.start, leaf.start + 3),
        ...cx.parser.parseInline(leaf.content.slice(3), leaf.start + 3, cx),
      ])
    );
    return true;
  }
}
