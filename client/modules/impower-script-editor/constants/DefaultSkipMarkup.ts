import { BlockContext } from "../classes/BlockContext";
import { CompositeBlock } from "../classes/CompositeBlock";
import { Line } from "../classes/Line";
import { Type } from "../types/type";
import { isTitle, skipForList } from "../utils/markdown";

export const DefaultSkipMarkup: {
  [type: number]: (bl: CompositeBlock, cx: BlockContext, line: Line) => boolean;
} = {
  [Type.Centered](_bl, _cx, _line) {
    return false;
  },
  [Type.Transition](_bl, _cx, _line) {
    return false;
  },
  [Type.TitleEntry](bl, _cx, line) {
    if (line.indent < line.baseIndent + bl.value && line.next > -1) {
      return false;
    }
    line.moveBaseColumn(line.baseIndent + bl.value);
    return true;
  },
  [Type.Title](bl, cx, line): boolean {
    if (
      line.pos === line.text.length ||
      (bl !== cx.block &&
        line.indent >= cx.stack[line.depth + 1].value + line.baseIndent)
    ) {
      return true;
    }
    if (line.indent >= line.baseIndent + 4) {
      return false;
    }
    return isTitle(line, cx, false) > 0;
  },
  [Type.ListItem](bl, _cx, line) {
    if (line.indent < line.baseIndent + bl.value && line.next > -1) {
      return false;
    }
    line.moveBaseColumn(line.baseIndent + bl.value);
    return true;
  },
  [Type.OrderedList]: skipForList,
  [Type.BulletList]: skipForList,
  [Type.Document]() {
    return true;
  },
};
