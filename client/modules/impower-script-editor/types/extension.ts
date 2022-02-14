/* eslint-disable no-cond-assign */
import { BlockContext } from "../classes/BlockContext";
import { Element } from "../classes/Element";
import { InlineContext } from "../classes/InlineContext";
import { TableParser } from "../classes/TableParser";
import { TaskParser } from "../classes/TaskParser";
import { space } from "../utils/space";
import { MarkdownConfig } from "./markdownConfig";

const StrikethroughDelim = {
  resolve: "Strikethrough",
  mark: "StrikethroughMark",
};

/// An extension that implements
/// [GFM-style](https://github.github.com/gfm/#strikethrough-extension-)
/// Strikethrough syntax using `~~` delimiters.
export const Strikethrough: MarkdownConfig = {
  defineNodes: ["Strikethrough", "StrikethroughMark"],
  parseInline: [
    {
      name: "Strikethrough",
      parse(cx, next, pos): number {
        if (next !== 126 /* '~' */ || cx.char(pos + 1) !== 126) {
          return -1;
        }
        return cx.addDelimiter(StrikethroughDelim, pos, pos + 2, true, true);
      },
      after: "Emphasis",
    },
  ],
};

export function parseRow(
  cx: BlockContext,
  line: string,
  startI = 0,
  elts?: Element[],
  offset = 0
): number {
  let count = 0;
  let first = true;
  let cellStart = -1;
  let cellEnd = -1;
  let esc = false;
  const parseCell = (): void => {
    elts?.push(
      cx.elt(
        "TableCell",
        offset + cellStart,
        offset + cellEnd,
        cx.parser.parseInline(
          line.slice(cellStart, cellEnd),
          offset + cellStart
        )
      )
    );
  };

  for (let i = startI; i < line.length; i += 1) {
    const next = line.charCodeAt(i);
    if (next === 124 /* '|' */ && !esc) {
      if (!first || cellStart > -1) {
        count += 1;
      }
      first = false;
      if (elts) {
        if (cellStart > -1) {
          parseCell();
        }
        elts.push(cx.elt("TableDelimiter", i + offset, i + offset + 1));
      }
      cellStart = -1;
      cellEnd = -1;
    } else if (esc || (next !== 32 && next !== 9)) {
      if (cellStart < 0) cellStart = i;
      cellEnd = i + 1;
    }
    esc = !esc && next === 92;
  }
  if (cellStart > -1) {
    count += 1;
    if (elts) parseCell();
  }
  return count;
}

function hasPipe(str: string, start: number): boolean {
  for (let i = start; i < str.length; i += 1) {
    const next = str.charCodeAt(i);
    if (next === 124 /* '|' */) {
      return true;
    }
    if (next === 92 /* '\\' */) {
      i += 1;
    }
  }
  return false;
}

/// This extension provides
/// [GFM-style](https://github.github.com/gfm/#tables-extension-)
/// tables, using syntax like this:
///
/// ```
/// | head 1 | head 2 |
/// | ---    | ---    |
/// | cell 1 | cell 2 |
/// ```
export const Table: MarkdownConfig = {
  defineNodes: [
    { name: "Table", block: true },
    "TableHeader",
    "TableRow",
    "TableCell",
    "TableDelimiter",
  ],
  parseBlock: [
    {
      name: "Table",
      leaf(_, leaf): TableParser {
        return hasPipe(leaf.content, 0) ? new TableParser() : null;
      },
      before: "Dialogue",
    },
  ],
};

/// Extension providing
/// [GFM-style](https://github.github.com/gfm/#task-list-items-extension-)
/// task list items, where list items can be prefixed with `[ ]` or
/// `[x]` to add a checkbox.
export const TaskList: MarkdownConfig = {
  defineNodes: [{ name: "Task", block: true }, "TaskMarker"],
  parseBlock: [
    {
      name: "TaskList",
      leaf(cx, leaf): TaskParser {
        return /^\[[ xX]\]/.test(leaf.content) &&
          cx.parser.nodeSet.types[cx.block.type].name === "ListItem"
          ? new TaskParser()
          : null;
      },
      after: "Dialogue",
    },
  ],
};

/// Extension bundle containing [`Table`](#Table),
/// [`TaskList`](#TaskList) and [`Strikethrough`](#Strikethrough).
export const GFM = [Table, TaskList, Strikethrough];

function parseSubSuper(ch: number, node: string, mark: string) {
  return (cx: InlineContext, next: number, pos: number): number => {
    if (next !== ch || cx.char(pos + 1) === ch) {
      return -1;
    }
    const elts = [cx.elt(mark, pos, pos + 1)];
    for (let i = pos + 1; i < cx.end; i += 1) {
      const next = cx.char(i);
      if (next === ch) {
        return cx.addElement(
          cx.elt(node, pos, i + 1, elts.concat(cx.elt(mark, i, i + 1)))
        );
      }
      if (next === 92 /* '\\' */) {
        elts.push(cx.elt("Escape", i, (i += 1) + 2));
      }
      if (space(next)) {
        break;
      }
    }
    return -1;
  };
}

/// Extension providing
/// [Pandoc-style](https://pandoc.org/MANUAL.html#superscripts-and-subscripts)
/// superscript using `^` markers.
export const Superscript: MarkdownConfig = {
  defineNodes: ["Superscript", "SuperscriptMark"],
  parseInline: [
    {
      name: "Superscript",
      parse: parseSubSuper(94 /* '^' */, "Superscript", "SuperscriptMark"),
    },
  ],
};

/// Extension providing
/// [Pandoc-style](https://pandoc.org/MANUAL.html#superscripts-and-subscripts)
/// subscript using `~` markers.
export const Subscript: MarkdownConfig = {
  defineNodes: ["Subscript", "SubscriptMark"],
  parseInline: [
    {
      name: "Subscript",
      parse: parseSubSuper(126 /* '~' */, "Subscript", "SubscriptMark"),
    },
  ],
};

/// Extension that parses two colons with only letters, underscores,
/// and numbers between them as `Emoji` nodes.
export const Emoji: MarkdownConfig = {
  defineNodes: ["Emoji"],
  parseInline: [
    {
      name: "Emoji",
      parse(cx, next, pos): number {
        let match: RegExpMatchArray | null;
        if (
          next !== 58 /* ':' */ ||
          !(match = /^[a-zA-Z_0-9]+:/.exec(cx.slice(pos + 1, cx.end)))
        )
          return -1;
        return cx.addElement(cx.elt("Emoji", pos, pos + 1 + match[0].length));
      },
    },
  ],
};
