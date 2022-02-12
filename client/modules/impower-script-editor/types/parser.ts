/* eslint-disable no-cond-assign */
import { NodeProp, NodeSet, NodeType } from "@lezer/common";
import { BlockContext } from "../classes/BlockContext";
import { CompositeBlock } from "../classes/CompositeBlock";
import { Element } from "../classes/Element";
import { InlineContext } from "../classes/InlineContext";
import { InlineDelimiter } from "../classes/InlineDelimeter";
import { LeafBlock } from "../classes/LeafBlock";
import { Line } from "../classes/Line";
import { LinkReferenceParser } from "../classes/LinkReferenceParser";
import { MarkdownParser } from "../classes/MarkdownParser";
import { SetextHeadingParser } from "../classes/SetextHeadingParser";
import { TreeElement } from "../classes/TreeElement";
import {
  EmphasisAsterisk,
  ImageStart,
  LinkStart,
  UnderlineUnderscore,
} from "../constants/delimiters";
import {
  CommentEnd,
  EmptyLine,
  Escapable,
  HTMLBlockStyle,
  ProcessingEnd,
  Punctuation,
} from "../constants/regexes";
import {
  addCodeText,
  finishLink,
  getListIndent,
  isAtxHeading,
  isBulletList,
  isCentered,
  isFencedCode,
  isHorizontalRule,
  isHTMLBlock,
  isLyric,
  isOrderedList,
  isSceneHeading,
  skipForList,
} from "../utils/markdown";
import { skipSpaceBack } from "../utils/skipSpaceBack";
import { space } from "../utils/space";
import { BlockResult } from "./blockResult";
import { LeafBlockParser } from "./leafBlockParser";
import { Mark } from "./mark";
import { Type } from "./type";

// Rules for parsing blocks. A return value of false means the rule
// doesn't apply here, true means it does. When true is returned and
// `p.line` has been updated, the rule is assumed to have consumed a
// leaf block. Otherwise, it is assumed to have opened a context.
export const DefaultBlockParsers: {
  [name: string]: ((cx: BlockContext, line: Line) => BlockResult) | undefined;
} = {
  LinkReference: undefined,

  FencedCode(cx, line) {
    const fenceEnd = isFencedCode(line);
    if (fenceEnd < 0) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    const ch = line.next;
    const len = fenceEnd - line.pos;
    const infoFrom = line.skipSpace(fenceEnd);
    const infoTo = skipSpaceBack(line.text, line.text.length, infoFrom);
    const marks: (Element | TreeElement)[] = [
      new Element(Type.CodeMark, from, from + len),
    ];
    if (infoFrom < infoTo)
      marks.push(
        new Element(
          Type.CodeInfo,
          cx.lineStart + infoFrom,
          cx.lineStart + infoTo
        )
      );

    for (
      let first = true;
      cx.nextLine() && line.depth >= cx.stack.length;
      first = false
    ) {
      let i = line.pos;
      if (line.indent - line.baseIndent < 4) {
        while (i < line.text.length && line.text.charCodeAt(i) === ch) {
          i += 1;
        }
      }
      if (i - line.pos >= len && line.skipSpace(i) === line.text.length) {
        for (let i = 0; i < line.markers.length; i += 1) {
          const m = line.markers[i];
          marks.push(m);
        }
        marks.push(
          new Element(Type.CodeMark, cx.lineStart + line.pos, cx.lineStart + i)
        );
        cx.nextLine();
        break;
      } else {
        if (!first) {
          addCodeText(marks, cx.lineStart - 1, cx.lineStart);
        }
        for (let i = 0; i < line.markers.length; i += 1) {
          const m = line.markers[i];
          marks.push(m);
        }
        const textStart = cx.lineStart + line.basePos;
        const textEnd = cx.lineStart + line.text.length;
        if (textStart < textEnd) {
          addCodeText(marks, textStart, textEnd);
        }
      }
    }
    cx.addNode(
      cx.buffer
        .writeElements(marks, -from)
        .finish(Type.FencedCode, cx.prevLineEnd() - from),
      from
    );
    return true;
  },

  Centered(cx, line) {
    const size = isCentered(line);
    if (size < 0) {
      return false;
    }
    cx.startContext(Type.Centered, line.pos);
    cx.addNode(
      Type.CenteredMark,
      cx.lineStart + line.pos,
      cx.lineStart + line.pos + 1
    );
    line.moveBase(line.pos + 1);
    return null;
  },

  Lyric(cx, line) {
    const size = isLyric(line);
    if (size < 0) {
      return false;
    }
    cx.startContext(Type.Lyric, line.pos);
    cx.addNode(
      Type.LyricMark,
      cx.lineStart + line.pos,
      cx.lineStart + line.pos + 1
    );
    line.moveBase(line.pos + 1);
    return null;
  },

  HorizontalRule(cx, line) {
    if (isHorizontalRule(line, cx, false) < 0) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    cx.nextLine();
    cx.addNode(Type.HorizontalRule, from);
    return true;
  },

  BulletList(cx, line) {
    const size = isBulletList(line, cx, false);
    if (size < 0) {
      return false;
    }
    if (cx.block.type !== Type.BulletList) {
      cx.startContext(Type.BulletList, line.basePos, line.next);
    }
    const newBase = getListIndent(line, line.pos + 1);
    cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent);
    cx.addNode(
      Type.ListMark,
      cx.lineStart + line.pos,
      cx.lineStart + line.pos + size
    );
    line.moveBaseColumn(newBase);
    return null;
  },

  OrderedList(cx, line) {
    const size = isOrderedList(line, cx, false);
    if (size < 0) {
      return false;
    }
    if (cx.block.type !== Type.OrderedList) {
      cx.startContext(
        Type.OrderedList,
        line.basePos,
        line.text.charCodeAt(line.pos + size - 1)
      );
    }
    const newBase = getListIndent(line, line.pos + size);
    cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent);
    cx.addNode(
      Type.ListMark,
      cx.lineStart + line.pos,
      cx.lineStart + line.pos + size
    );
    line.moveBaseColumn(newBase);
    return null;
  },

  ATXHeading(cx, line) {
    const size = isAtxHeading(line);
    if (size < 0) {
      return false;
    }
    const off = line.pos;
    const from = cx.lineStart + off;
    const endOfSpace = skipSpaceBack(line.text, line.text.length, off);
    let after = endOfSpace;
    while (after > off && line.text.charCodeAt(after - 1) === line.next) {
      after -= 1;
    }
    if (
      after === endOfSpace ||
      after === off ||
      !space(line.text.charCodeAt(after - 1))
    ) {
      after = line.text.length;
    }
    const buf = cx.buffer
      .write(Type.HeaderMark, 0, size)
      .writeElements(
        cx.parser.parseInline(
          line.text.slice(off + size + 1, after),
          from + size + 1
        ),
        -from
      );
    if (after < line.text.length) {
      buf.write(Type.HeaderMark, after - off, endOfSpace - off);
    }
    const node = buf.finish(
      Type.ATXHeading1 - 1 + size,
      line.text.length - off
    );
    cx.nextLine();
    cx.addNode(node, from);
    return true;
  },

  SceneHeading(cx, line) {
    const size = isSceneHeading(line);
    if (size < 0) {
      return false;
    }
    const off = line.pos;
    const from = cx.lineStart + off;
    const endOfSpace = skipSpaceBack(line.text, line.text.length, off);
    let after = endOfSpace;
    while (after > off && line.text.charCodeAt(after - 1) === line.next) {
      after -= 1;
    }
    if (
      after === endOfSpace ||
      after === off ||
      !space(line.text.charCodeAt(after - 1))
    ) {
      after = line.text.length;
    }
    let buf = cx.buffer;

    if (size > 0) {
      buf = buf.write(Type.SceneHeadingMark, 0, size);
    }
    buf = buf.writeElements(
      cx.parser.parseInline(
        line.text.slice(off + size + 1, after),
        from + size + 1
      ),
      -from
    );
    if (after < line.text.length) {
      buf.write(Type.SceneHeadingMark, after - off, endOfSpace - off);
    }
    const node = buf.finish(Type.SceneHeading, line.text.length - off);
    cx.nextLine();
    cx.addNode(node, from);
    return true;
  },

  HTMLBlock(cx, line) {
    const type = isHTMLBlock(line, cx, false);
    if (type < 0) return false;
    const from = cx.lineStart + line.pos;
    const end = HTMLBlockStyle[type][1];
    const marks: Element[] = [];
    let trailing = end !== EmptyLine;
    while (!end.test(line.text) && cx.nextLine()) {
      if (line.depth < cx.stack.length) {
        trailing = false;
        break;
      }
      for (let i = 0; i < line.markers.length; i += 1) {
        const m = line.markers[i];
        marks.push(m);
      }
    }
    if (trailing) cx.nextLine();
    const nodeType =
      end === CommentEnd
        ? Type.CommentBlock
        : end === ProcessingEnd
        ? Type.ProcessingInstructionBlock
        : Type.HTMLBlock;
    const to = cx.prevLineEnd();
    cx.addNode(
      cx.buffer.writeElements(marks, -from).finish(nodeType, to - from),
      from
    );
    return true;
  },

  SetextHeading: undefined, // Specifies relative precedence for block-continue function
};

export const DefaultLeafBlocks: {
  [name: string]: (cx: BlockContext, leaf: LeafBlock) => LeafBlockParser | null;
} = {
  LinkReference(_, leaf) {
    return leaf.content.charCodeAt(0) === 91 /* '[' */
      ? new LinkReferenceParser(leaf)
      : null;
  },
  SetextHeading() {
    return new SetextHeadingParser();
  },
};

export const DefaultEndLeaf: readonly ((
  cx: BlockContext,
  line: Line
) => boolean)[] = [
  (_, line): boolean => isAtxHeading(line) >= 0,
  (_, line): boolean => isSceneHeading(line) >= 0,
  (_, line): boolean => isFencedCode(line) >= 0,
  (_, line): boolean => isLyric(line) >= 0,
  (p, line): boolean => isBulletList(line, p, true) >= 0,
  (p, line): boolean => isOrderedList(line, p, true) >= 0,
  (p, line): boolean => isHorizontalRule(line, p, true) >= 0,
  (p, line): boolean => isHTMLBlock(line, p, true) >= 0,
];

export const DefaultInline: {
  [name: string]: (cx: InlineContext, next: number, pos: number) => number;
} = {
  Escape(cx, next, start) {
    if (next !== 92 /* '\\' */ || start === cx.end - 1) {
      return -1;
    }
    const escaped = cx.char(start + 1);
    for (let i = 0; i < Escapable.length; i += 1) {
      if (Escapable.charCodeAt(i) === escaped) {
        return cx.append(new Element(Type.Escape, start, start + 2));
      }
    }
    return -1;
  },

  Entity(cx, next, start) {
    if (next !== 38 /* '&' */) {
      return -1;
    }
    const m = /^(?:#\d+|#x[a-f\d]+|\w+);/i.exec(
      cx.slice(start + 1, start + 31)
    );
    return m
      ? cx.append(new Element(Type.Entity, start, start + 1 + m[0].length))
      : -1;
  },

  InlineCode(cx, next, start) {
    if (next !== 96 /* '`' */ || (start && cx.char(start - 1) === 96)) {
      return -1;
    }
    let pos = start + 1;
    while (pos < cx.end && cx.char(pos) === 96) {
      pos += 1;
    }
    const size = pos - start;
    let curSize = 0;
    for (; pos < cx.end; pos += 1) {
      if (cx.char(pos) === 96) {
        curSize += 1;
        if (curSize === size && cx.char(pos + 1) !== 96) {
          return cx.append(
            new Element(Type.InlineCode, start, pos + 1, [
              new Element(Type.CodeMark, start, start + size),
              new Element(Type.CodeMark, pos + 1 - size, pos + 1),
            ])
          );
        }
      } else {
        curSize = 0;
      }
    }
    return -1;
  },

  HTMLTag(cx, next, start) {
    // or URL
    if (next !== 60 /* '<' */ || start === cx.end - 1) return -1;
    const after = cx.slice(start + 1, cx.end);
    const url =
      /^(?:[a-z][-\w+.]+:[^\s>]+|[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*)>/i.exec(
        after
      );
    if (url)
      return cx.append(new Element(Type.URL, start, start + 1 + url[0].length));
    const comment = /^!--[^>](?:-[^-]|[^-])*?-->/i.exec(after);
    if (comment)
      return cx.append(
        new Element(Type.Comment, start, start + 1 + comment[0].length)
      );
    const procInst = /^\?[^]*?\?>/.exec(after);
    if (procInst)
      return cx.append(
        new Element(
          Type.ProcessingInstruction,
          start,
          start + 1 + procInst[0].length
        )
      );
    const m =
      /^(?:![A-Z][^]*?>|!\[CDATA\[[^]*?\]\]>|\/\s*[a-zA-Z][\w-]*\s*>|\s*[a-zA-Z][\w-]*(\s+[a-zA-Z:_][\w-.:]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*(\/\s*)?>)/.exec(
        after
      );
    if (!m) return -1;
    return cx.append(new Element(Type.HTMLTag, start, start + 1 + m[0].length));
  },

  Emphasis(cx, next, start) {
    const charCode = "*".charCodeAt(0);
    if (next !== charCode) {
      return -1;
    }
    let pos = start + 1;
    while (cx.char(pos) === next) {
      pos += 1;
    }
    const before = cx.slice(start - 1, start);
    const after = cx.slice(pos, pos + 1);
    const pBefore = Punctuation.test(before);
    const pAfter = Punctuation.test(after);
    const sBefore = /\s|^$/.test(before);
    const sAfter = /\s|^$/.test(after);
    const leftFlanking = !sAfter && (!pAfter || sBefore || pBefore);
    const rightFlanking = !sBefore && (!pBefore || sAfter || pAfter);
    const canOpen =
      leftFlanking && (next === charCode || !rightFlanking || pBefore);
    const canClose =
      rightFlanking && (next === charCode || !leftFlanking || pAfter);
    return cx.append(
      new InlineDelimiter(
        EmphasisAsterisk,
        start,
        pos,
        (canOpen ? Mark.Open : 0) | (canClose ? Mark.Close : 0)
      )
    );
  },

  Underline(cx, next, start) {
    const charCode = "_".charCodeAt(0);
    if (next !== charCode) {
      return -1;
    }
    let pos = start + 1;
    while (cx.char(pos) === next) {
      pos += 1;
    }
    const before = cx.slice(start - 1, start);
    const after = cx.slice(pos, pos + 1);
    const pBefore = Punctuation.test(before);
    const pAfter = Punctuation.test(after);
    const sBefore = /\s|^$/.test(before);
    const sAfter = /\s|^$/.test(after);
    const leftFlanking = !sAfter && (!pAfter || sBefore || pBefore);
    const rightFlanking = !sBefore && (!pBefore || sAfter || pAfter);
    const canOpen =
      leftFlanking && (next === charCode || !rightFlanking || pBefore);
    const canClose =
      rightFlanking && (next === charCode || !leftFlanking || pAfter);
    return cx.append(
      new InlineDelimiter(
        UnderlineUnderscore,
        start,
        pos,
        (canOpen ? Mark.Open : 0) | (canClose ? Mark.Close : 0)
      )
    );
  },

  HardBreak(cx, next, start) {
    if (next === 92 /* '\\' */ && cx.char(start + 1) === 10 /* '\n' */) {
      return cx.append(new Element(Type.HardBreak, start, start + 2));
    }
    if (next === 32) {
      let pos = start + 1;
      while (cx.char(pos) === 32) {
        pos += 1;
      }
      if (cx.char(pos) === 10 && pos >= start + 2) {
        return cx.append(new Element(Type.HardBreak, start, pos + 1));
      }
    }
    return -1;
  },

  Link(cx, next, start) {
    return next === 91 /* '[' */
      ? cx.append(new InlineDelimiter(LinkStart, start, start + 1, Mark.Open))
      : -1;
  },

  Image(cx, next, start) {
    return next === 33 /* '!' */ && cx.char(start + 1) === 91 /* '[' */
      ? cx.append(new InlineDelimiter(ImageStart, start, start + 2, Mark.Open))
      : -1;
  },

  LinkEnd(cx, next, start) {
    if (next !== 93 /* ']' */) {
      return -1;
    }
    // Scanning back to the next link/image start marker
    for (let i = cx.parts.length - 1; i >= 0; i -= 1) {
      const part = cx.parts[i];
      if (
        part instanceof InlineDelimiter &&
        (part.type === LinkStart || part.type === ImageStart)
      ) {
        // If this one has been set invalid (because it would produce
        // a nested link) or there's no valid link here ignore both.
        if (
          !part.side ||
          (cx.skipSpace(part.to) === start &&
            !/[([]/.test(cx.slice(start + 1, start + 2)))
        ) {
          cx.parts[i] = null;
          return -1;
        }
        // Finish the content and replace the entire range in
        // this.parts with the link/image node.
        const content = cx.takeContent(i);
        const link = finishLink(
          cx,
          content,
          part.type === LinkStart ? Type.Link : Type.Image,
          part.from,
          start + 1
        );
        cx.parts[i] = link;
        // Set any open-link markers before this link to invalid.
        if (part.type === LinkStart)
          for (let j = 0; j < i; j += 1) {
            const p = cx.parts[j];
            if (p instanceof InlineDelimiter && p.type === LinkStart) {
              p.side = 0;
            }
          }
        return link.to;
      }
    }
    return -1;
  },
};

export const DefaultSkipMarkup: {
  [type: number]: (bl: CompositeBlock, cx: BlockContext, line: Line) => boolean;
} = {
  [Type.Centered](_bl, _cx, _line) {
    return false;
  },
  [Type.Lyric](_bl, _cx, _line) {
    return false;
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

const nodeTypes = [NodeType.none];
for (let i = 1, name; (name = Type[i]); i += 1) {
  nodeTypes[i] = NodeType.define({
    id: i,
    name,
    props:
      i >= Type.Escape
        ? []
        : [
            [
              NodeProp.group,
              i in DefaultSkipMarkup
                ? ["Block", "BlockContext"]
                : ["Block", "LeafBlock"],
            ],
          ],
  });
}

/// The default CommonMark parser.
export const parser = new MarkdownParser(
  new NodeSet(nodeTypes),
  Object.keys(DefaultBlockParsers).map((n) => DefaultBlockParsers[n]),
  Object.keys(DefaultBlockParsers).map((n) => DefaultLeafBlocks[n]),
  Object.keys(DefaultBlockParsers),
  DefaultEndLeaf,
  DefaultSkipMarkup,
  Object.keys(DefaultInline).map((n) => DefaultInline[n]),
  Object.keys(DefaultInline),
  []
);
