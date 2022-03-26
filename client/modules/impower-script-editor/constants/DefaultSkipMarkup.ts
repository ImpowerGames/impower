import { sparkRegexes } from "../../impower-script-parser";
import { BlockContext } from "../classes/BlockContext";
import { CompositeBlock } from "../classes/CompositeBlock";
import { Line } from "../classes/Line";
import { Type } from "../types/type";
import { getSectionLevel, isTitle, skipForList } from "../utils/markdown";

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
  [Type.Repeat](_bl, _cx, _line) {
    return false;
  },
  [Type.Return](_bl, _cx, _line) {
    return false;
  },
  [Type.Asset](_bl, _cx, _line) {
    return false;
  },
  [Type.Tag](_bl, _cx, _line) {
    return false;
  },
  [Type.Variable](_bl, _cx, _line) {
    return false;
  },
  [Type.Assign](_bl, _cx, _line) {
    return false;
  },
  [Type.Call](_bl, _cx, _line) {
    return false;
  },
  [Type.Condition](_bl, _cx, _line) {
    return false;
  },
  [Type.Dialogue](_bl, cx, line) {
    if (
      line.text.match(sparkRegexes.dialogue_terminator) ||
      line.text.trim() === "_" ||
      (line.text.trim().length === 0 && line.text.length < 2)
    ) {
      return false;
    }
    return true;
  },
  [Type.Section](bl, cx, line): boolean {
    const level = getSectionLevel(line);
    if (level <= 0) {
      // skip if not valid heading
      return true;
    }
    if (level > bl.value) {
      // skip if lower level heading
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
