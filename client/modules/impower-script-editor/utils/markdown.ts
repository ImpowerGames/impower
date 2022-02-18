import { PartialParse } from "@lezer/common";
import { fountainRegexes } from "../../impower-script-parser/constants/fountainRegexes";
import { BlockContext } from "../classes/BlockContext";
import { CompositeBlock } from "../classes/CompositeBlock";
import { Element } from "../classes/Element";
import { InlineContext } from "../classes/InlineContext";
import { Line } from "../classes/Line";
import { HTMLBlockStyle } from "../constants/regexes";
import { MarkdownConfig } from "../types/markdownConfig";
import { MarkdownExtension } from "../types/markdownExtension";
import { Type } from "../types/type";
import { space } from "./space";

export function isHorizontalRule(line: Line): number {
  const underscoreCharCode = "_".charCodeAt(0);
  const dashCharCode = "-".charCodeAt(0);
  const asteriskCharCode = "*".charCodeAt(0);
  const equalCharCode = "=".charCodeAt(0);
  if (
    line.next !== underscoreCharCode &&
    line.next !== dashCharCode &&
    line.next !== asteriskCharCode &&
    line.next !== equalCharCode
  ) {
    return -1;
  }
  let count = 1;
  for (let pos = line.pos + 1; pos < line.text.length; pos += 1) {
    const ch = line.text.charCodeAt(pos);
    if (ch === line.next) {
      count += 1;
    } else if (!space(ch)) {
      return -1;
    }
  }
  return count < 3 ? -1 : 1;
}

export function inContext(cx: BlockContext, type: Type): boolean {
  for (let i = cx.stack.length - 1; i >= 0; i -= 1)
    if (cx.stack[i].type === type) {
      return true;
    }
  return false;
}

export function isSynopses(line: Line): number {
  const charCode = "=".charCodeAt(0);
  if (line.next !== charCode) {
    return -1;
  }
  const pos = line.pos + 1;
  if (!line.text.match(fountainRegexes.synopsis)) {
    return -1;
  }
  return pos - line.pos;
}

export function isCentered(line: Line): number {
  const charCodeStart = ">".charCodeAt(0);
  const charCodeEnd = "<".charCodeAt(0);
  if (line.next !== charCodeStart) {
    return -1;
  }
  if (line.text.charCodeAt(line.text.length - 1) !== charCodeEnd) {
    return -1;
  }
  return 1;
}

export function isTransition(line: Line): number {
  const currentText = line.text.slice(line.pos);
  if (
    currentText === "TO:" ||
    (currentText.toUpperCase() === currentText && currentText.endsWith(" TO:"))
  ) {
    return 0;
  }
  return -1;
}

export function isTitle(
  line: Line,
  cx: BlockContext,
  breaking: boolean
): number {
  if (line.text.toUpperCase() === line.text && line.text.endsWith(" TO:")) {
    return -1;
  }
  let { pos } = line;
  let { next } = line;
  for (;;) {
    if (/[\w ]/.test(String.fromCharCode(next))) {
      pos += 1;
    } else {
      break;
    }
    if (pos === line.text.length) {
      return -1;
    }
    next = line.text.charCodeAt(pos);
  }
  if (breaking && inContext(cx, Type.Title)) {
    return 1;
  }
  if (
    pos === line.pos ||
    next !== ":".charCodeAt(0) ||
    (pos < line.text.length - 1 && !space(line.text.charCodeAt(pos + 1)))
  ) {
    return -1;
  }
  return pos + 1 - line.pos;
}

export function isBulletList(
  line: Line,
  cx: BlockContext,
  breaking: boolean
): number {
  return (line.next === 45 ||
    line.next === 43 ||
    line.next === 42) /* '-+*' */ &&
    (line.pos === line.text.length - 1 ||
      space(line.text.charCodeAt(line.pos + 1))) &&
    (!breaking ||
      inContext(cx, Type.BulletList) ||
      line.skipSpace(line.pos + 2) < line.text.length)
    ? 1
    : -1;
}

export function isOrderedList(
  line: Line,
  cx: BlockContext,
  breaking: boolean
): number {
  let { pos } = line;
  let { next } = line;
  for (;;) {
    if (next >= 48 && next <= 57 /* '0-9' */) {
      pos += 1;
    } else break;
    if (pos === line.text.length) {
      return -1;
    }
    next = line.text.charCodeAt(pos);
  }
  if (
    pos === line.pos ||
    pos > line.pos + 9 ||
    (next !== 46 && next !== 41) /* '.)' */ ||
    (pos < line.text.length - 1 && !space(line.text.charCodeAt(pos + 1))) ||
    (breaking &&
      !inContext(cx, Type.OrderedList) &&
      (line.skipSpace(pos + 1) === line.text.length ||
        pos > line.pos + 1 ||
        line.next !== 49)) /* '1' */
  )
    return -1;
  return pos + 1 - line.pos;
}

export function skipForList(
  bl: CompositeBlock,
  cx: BlockContext,
  line: Line
): boolean {
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
  const size = (bl.type === Type.OrderedList ? isOrderedList : isBulletList)(
    line,
    cx,
    false
  );
  const result =
    size > 0 &&
    (bl.type !== Type.BulletList || isHorizontalRule(line) < 0) &&
    line.text.charCodeAt(line.pos + size - 1) === bl.value;
  return result;
}

export function isFencedCode(line: Line): number {
  if (line.next !== "`".charCodeAt(0) && line.next !== "~".charCodeAt(0)) {
    return -1;
  }
  let pos = line.pos + 1;
  while (pos < line.text.length && line.text.charCodeAt(pos) === line.next) {
    pos += 1;
  }
  if (pos < line.pos + 3) {
    return -1;
  }
  return pos;
}

export function isSectionHeading(line: Line): number {
  const charCode = "#".charCodeAt(0);
  if (line.next !== charCode) {
    return -1;
  }
  let pos = line.pos + 1;
  while (pos < line.text.length && line.text.charCodeAt(pos) === charCode) {
    pos += 1;
  }
  if (!line.text.match(fountainRegexes.section)) {
    return -1;
  }
  return pos - line.pos;
}

export function isSceneHeading(line: Line): number {
  const currentText = line.text.slice(line.pos);
  if (currentText[0] === "." && currentText[1] !== ".") {
    return 1;
  }
  if (
    currentText[0] !== "I" &&
    currentText[0] !== "E" &&
    currentText[0] !== "C"
  ) {
    return -1;
  }
  if (currentText.match(fountainRegexes.scene_heading)) {
    return 0;
  }
  return -1;
}

export function isHTMLBlock(
  line: Line,
  _cx: BlockContext,
  breaking: boolean
): number {
  if (line.next !== 60 /* '<' */) {
    return -1;
  }
  const rest = line.text.slice(line.pos);
  for (
    let i = 0, e = HTMLBlockStyle.length - (breaking ? 1 : 0);
    i < e;
    i += 1
  ) {
    if (HTMLBlockStyle[i][0].test(rest)) {
      return i;
    }
  }
  return -1;
}

export function getListIndent(line: Line, pos: number): number {
  const indentAfter = line.countIndent(pos, line.pos, line.indent);
  const indented = line.countIndent(line.skipSpace(pos), pos, indentAfter);
  return indented >= indentAfter + 5 ? indentAfter + 1 : indented;
}

export function getTitleIndent(line: Line, pos: number): number {
  const indentAfter = line.countIndent(pos, line.pos, line.indent);
  const indented = line.countIndent(line.skipSpace(pos), pos, indentAfter);
  return indented >= indentAfter + 5 ? indentAfter + 1 : indented;
}

export function addCodeText(marks: Element[], from: number, to: number): void {
  const last = marks.length - 1;
  if (
    last >= 0 &&
    marks[last].to === from &&
    marks[last].type === Type.CodeText
  ) {
    (marks[last] as { to: number }).to = to;
  } else {
    marks.push(new Element(Type.CodeText, from, to));
  }
}

export function lineEnd(text: string, pos: number): number {
  for (; pos < text.length; pos += 1) {
    const next = text.charCodeAt(pos);
    if (next === 10) {
      break;
    }
    if (!space(next)) {
      return -1;
    }
  }
  return pos;
}

export function nonEmpty<T>(a: undefined | readonly T[]): a is readonly T[] {
  return a != null && a.length > 0;
}

export function resolveConfig(spec: MarkdownExtension): MarkdownConfig | null {
  if (!Array.isArray(spec)) {
    return spec as MarkdownConfig;
  }
  if (spec.length === 0) {
    return null;
  }
  const conf = resolveConfig(spec[0]);
  if (spec.length === 1) {
    return conf;
  }
  const rest = resolveConfig(spec.slice(1));
  if (!rest || !conf) {
    return conf || rest;
  }
  const conc: <T>(
    a: readonly T[] | undefined,
    b: readonly T[] | undefined
  ) => readonly T[] = (a, b) => (a || []).concat(b || []);
  const wrapA = conf.wrap;
  const wrapB = rest.wrap;
  return {
    props: conc(conf.props, rest.props),
    defineNodes: conc(conf.defineNodes, rest.defineNodes),
    parseBlock: conc(conf.parseBlock, rest.parseBlock),
    parseInline: conc(conf.parseInline, rest.parseInline),
    remove: conc(conf.remove, rest.remove),
    wrap: !wrapA
      ? wrapB
      : !wrapB
      ? wrapA
      : (inner, input, fragments, ranges): PartialParse =>
          wrapA?.(
            wrapB?.(inner, input, fragments, ranges),
            input,
            fragments,
            ranges
          ),
  };
}

export function findName(names: readonly string[], name: string): number {
  const found = names.indexOf(name);
  if (found < 0)
    throw new RangeError(
      `Position specified relative to unknown parser ${name}`
    );
  return found;
}

// These return `null` when falling off the end of the input, `false`
// when parsing fails otherwise (for use in the incremental link
// reference parser).

export function parseURL(
  text: string,
  start: number,
  offset: number
): null | false | Element {
  const next = text.charCodeAt(start);
  if (next === 60 /* '<' */) {
    for (let pos = start + 1; pos < text.length; pos += 1) {
      const ch = text.charCodeAt(pos);
      if (ch === 62 /* '>' */) {
        return new Element(Type.URL, start + offset, pos + 1 + offset);
      }
      if (ch === 60 || ch === 10 /* '<\n' */) {
        return false;
      }
    }
    return null;
  }
  let depth = 0;
  let pos = start;
  for (let escaped = false; pos < text.length; pos += 1) {
    const ch = text.charCodeAt(pos);
    if (space(ch)) {
      break;
    } else if (escaped) {
      escaped = false;
    } else if (ch === 40 /* '(' */) {
      depth += 1;
    } else if (ch === 41 /* ')' */) {
      if (!depth) break;
      depth -= 1;
    } else if (ch === 92 /* '\\' */) {
      escaped = true;
    }
  }
  return pos > start
    ? new Element(Type.URL, start + offset, pos + offset)
    : pos === text.length
    ? null
    : false;
}

export function parseLinkTitle(
  text: string,
  start: number,
  offset: number
): null | false | Element {
  const next = text.charCodeAt(start);
  if (next !== 39 && next !== 34 && next !== 40 /* '"\'(' */) {
    return false;
  }
  const end = next === 40 ? 41 : next;
  for (let pos = start + 1, escaped = false; pos < text.length; pos += 1) {
    const ch = text.charCodeAt(pos);
    if (escaped) {
      escaped = false;
    } else if (ch === end) {
      return new Element(Type.LinkTitle, start + offset, pos + 1 + offset);
    } else if (ch === 92 /* '\\' */) {
      escaped = true;
    }
  }
  return null;
}

export function parseLinkLabel(
  text: string,
  start: number,
  offset: number,
  requireNonWS: boolean
): null | false | Element {
  for (
    let escaped = false,
      pos = start + 1,
      end = Math.min(text.length, pos + 999);
    pos < end;
    pos += 1
  ) {
    const ch = text.charCodeAt(pos);
    if (escaped) {
      escaped = false;
    } else if (ch === 93 /* ']' */) {
      return requireNonWS
        ? false
        : new Element(Type.LinkLabel, start + offset, pos + 1 + offset);
    } else {
      if (requireNonWS && !space(ch)) {
        requireNonWS = false;
      }
      if (ch === 91 /* '[' */) {
        return false;
      }
      if (ch === 92 /* '\\' */) {
        escaped = true;
      }
    }
  }
  return null;
}

export function finishLink(
  cx: InlineContext,
  content: Element[],
  type: Type,
  start: number,
  startPos: number
): Element {
  const { text } = cx;
  const next = cx.char(startPos);
  let endPos = startPos;
  content.unshift(
    new Element(Type.LinkMark, start, start + (type === Type.Image ? 2 : 1))
  );
  content.push(new Element(Type.LinkMark, startPos - 1, startPos));
  if (next === 40 /* '(' */) {
    let pos = cx.skipSpace(startPos + 1);
    const dest = parseURL(text, pos - cx.offset, cx.offset);
    let title;
    if (dest) {
      pos = cx.skipSpace(dest.to);
      title = parseLinkTitle(text, pos - cx.offset, cx.offset);
      if (title) pos = cx.skipSpace(title.to);
    }
    if (cx.char(pos) === 41 /* ')' */) {
      content.push(new Element(Type.LinkMark, startPos, startPos + 1));
      endPos = pos + 1;
      if (dest) content.push(dest);
      if (title) content.push(title);
      content.push(new Element(Type.LinkMark, pos, endPos));
    }
  } else if (next === 91 /* '[' */) {
    const label = parseLinkLabel(text, startPos - cx.offset, cx.offset, false);
    if (label) {
      content.push(label);
      endPos = label.to;
    }
  }
  return new Element(type, start, endPos, content);
}

// These are blocks that can span blank lines, and should thus only be
// reused if their next sibling is also being reused.
export const NotLast = [
  Type.ListItem,
  Type.OrderedList,
  Type.BulletList,
  Type.TitleEntry,
  Type.Title,
];
