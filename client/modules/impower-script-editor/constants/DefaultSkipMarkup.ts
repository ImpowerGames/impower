import { BlockContext } from "../classes/BlockContext";
import { CompositeBlock } from "../classes/CompositeBlock";
import { Line } from "../classes/Line";
import { Type } from "../types/type";
import { isSectionHeading, isTitle, skipForList } from "../utils/markdown";

export const DefaultSkipMarkup: {
  [type: number]: (bl: CompositeBlock, cx: BlockContext, line: Line) => boolean;
} = {
  [Type.Synopses](_bl, _cx, _line) {
    return false;
  },
  [Type.Centered](_bl, _cx, _line) {
    return false;
  },
  [Type.Transition](_bl, _cx, _line) {
    return false;
  },
  [Type.Jump](_bl, _cx, _line) {
    return false;
  },
  [Type.Return](_bl, _cx, _line) {
    return false;
  },
  [Type.Asset](_bl, _cx, _line) {
    return false;
  },
  [Type.Declare](_bl, _cx, _line) {
    return false;
  },
  [Type.Assign](_bl, _cx, _line) {
    return false;
  },
  [Type.Trigger](_bl, _cx, _line) {
    return false;
  },
  [Type.Section](bl, cx, line): boolean {
    const headingValue = isSectionHeading(line);
    if (headingValue < 0 || headingValue > bl.value) {
      // skip if not heading or lower level heading
      return true;
    }
    return false;
  },
  [Type.TitleEntry](_bl, _cx, _line) {
    return false;
  },
  [Type.Title](_bl, cx, line): boolean {
    const title = isTitle(line, cx, false) > 0;
    if (title || line.indent >= line.baseIndent + 4) {
      // skip if title or indented title value
      return true;
    }
    return false;
  },
  [Type.ListItem](bl, _cx, line) {
    if (line.indent < line.baseIndent + bl.value && line.next > -1) {
      return false;
    }
    line.moveBaseColumn(line.baseIndent + bl.value);
    return true;
  },
  [Type.OrderedList](bl, cx, line) {
    return skipForList(bl, cx, line);
  },
  [Type.BulletList](bl, cx, line) {
    return skipForList(bl, cx, line);
  },
  [Type.Document](_bl, _cx, _line) {
    return true;
  },
};
