import { PartialParse } from "@lezer/common";
import { sparkRegexes, stripInlineComments } from "../../../../sparkdown";
import { BlockContext } from "../classes/BlockContext";
import { CompositeBlock } from "../classes/CompositeBlock";
import { Element } from "../classes/Element";
import { Line } from "../classes/Line";
import { HTMLBlockStyle } from "../constants/regexes";
import { MarkdownConfig } from "../types/markdownConfig";
import { MarkdownExtension } from "../types/markdownExtension";
import { Type } from "../types/type";
import { whitespace } from "./whitespace";

export function inBlockContext(cx: BlockContext, type: Type): boolean {
  for (let i = cx.stack.length - 1; i >= 0; i -= 1)
    if (cx.stack[i].type === type) {
      return true;
    }
  return false;
}

export function isComment(line: Line): RegExpMatchArray {
  if (line.next !== "/".charCodeAt(0)) {
    return null;
  }
  return line.text.match(sparkRegexes.comment_inline);
}

export function stripComments(text: string): string {
  return stripInlineComments(text);
}

export function isSectionHeading(line: Line): RegExpMatchArray {
  if (line.next !== "#".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.section);
}

export function getSectionMatchLevel(match: RegExpMatchArray): number {
  if (!match) {
    return -1;
  }
  const mark = match[2] || "";
  const markSpace = match[3] || "";
  const level = mark.length;
  return !markSpace ? 0 : level;
}

export function getSectionLevel(line: Line): number {
  const match = isSectionHeading(line);
  return getSectionMatchLevel(match);
}

export function isScene(line: Line): RegExpMatchArray {
  if (line.next === ".".charCodeAt(0)) {
    const text = stripComments(line.text);
    return text.match(sparkRegexes.scene);
  }
  if (
    line.next !== "I".charCodeAt(0) &&
    line.next !== "E".charCodeAt(0) &&
    line.next !== "C".charCodeAt(0)
  ) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.scene);
}

export function isPageBreak(line: Line): RegExpMatchArray {
  if (line.next !== "=".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.page_break);
}

export function isSynopsis(line: Line): RegExpMatchArray {
  if (line.next !== "=".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.synopsis);
}

export function isCentered(line: Line): RegExpMatchArray {
  const charCodeStart = ">".charCodeAt(0);
  if (line.next !== charCodeStart) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.centered);
}

export function isTransition(line: Line): RegExpMatchArray {
  const text = stripComments(line.text);
  const currentText = text.slice(line.pos);
  if (
    currentText.toUpperCase() !== currentText ||
    !String.fromCharCode(line.next).match(/^[A-Z]$/)
  ) {
    return null;
  }
  return text.match(sparkRegexes.transition);
}

export function isCharacter(line: Line): RegExpMatchArray {
  if (
    line.next !== "@".charCodeAt(0) &&
    !String.fromCharCode(line.next).match(/^[^a-z*]$/)
  ) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.character);
}

export function isParenthetical(line: Line): RegExpMatchArray {
  if (line.next !== "(".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.parenthetical);
}

export function isLyric(line: Line): RegExpMatchArray {
  if (line.next !== "~".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.lyric);
}

export function isJump(line: Line): RegExpMatchArray {
  if (line.next !== ">".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.jump);
}

export function isRepeat(line: Line): RegExpMatchArray {
  if (line.next !== "^".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.repeat);
}

export function isReturn(line: Line): RegExpMatchArray {
  if (line.next !== "<".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.return);
}

export function isImport(line: Line): RegExpMatchArray {
  if (line.next !== "i".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.import);
}

export function isStruct(line: Line): RegExpMatchArray {
  if (
    line.next !== "l".charCodeAt(0) &&
    line.next !== "m".charCodeAt(0) &&
    line.next !== "u".charCodeAt(0) &&
    line.next !== "s".charCodeAt(0) &&
    line.next !== "c".charCodeAt(0)
  ) {
    return null;
  }
  const text = stripComments(line.text);
  return text.match(sparkRegexes.struct);
}

export function isStructObjectField(line: Line): RegExpMatchArray {
  const text = stripComments(line.text);
  return text.match(sparkRegexes.struct_object_field);
}

export function isStructValueField(line: Line): RegExpMatchArray {
  const text = stripComments(line.text);
  return text.match(sparkRegexes.struct_value_field);
}

export function isStructListValue(line: Line): RegExpMatchArray {
  const text = stripComments(line.text);
  return text.match(sparkRegexes.struct_list_value);
}

export function isVariable(line: Line): RegExpMatchArray {
  if (line.next !== "*".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  const match = text.match(sparkRegexes.variable);
  if (!match) {
    return null;
  }
  match[0] = "variable";
  return match;
}

export function isAssign(line: Line): RegExpMatchArray {
  if (line.next !== "*".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  const match = text.match(sparkRegexes.assign);
  if (!match) {
    return null;
  }
  match[0] = "assign";
  return match;
}

export function isCall(line: Line): RegExpMatchArray {
  if (line.next !== "*".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  const match = text.match(sparkRegexes.call);
  if (!match) {
    return null;
  }
  match[0] = "call";
  return match;
}

export function isCondition(line: Line): RegExpMatchArray {
  if (line.next !== "*".charCodeAt(0)) {
    return null;
  }
  const text = stripComments(line.text);
  const match = text.match(sparkRegexes.condition);
  if (!match) {
    return null;
  }
  match[0] = "condition";
  return match;
}

export function isChoice(line: Line): RegExpMatchArray {
  if (!["-", "+"].map((c) => c.charCodeAt(0)).includes(line.next)) {
    return null;
  }
  const text = stripComments(line.text);
  const match = text.match(sparkRegexes.choice);
  if (!match) {
    return null;
  }
  match[0] = "choice";
  return match;
}

export function isTitle(
  line: Line,
  cx: BlockContext,
  breaking: boolean
): number {
  const text = stripComments(line.text);
  if (/[\t ]/.test(text[0])) {
    return -1;
  }
  if (text.toUpperCase() === text && text.endsWith(" TO:")) {
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
    if (pos === text.length) {
      return -1;
    }
    next = text.charCodeAt(pos);
  }
  if (breaking && inBlockContext(cx, Type.Title)) {
    return 1;
  }
  if (
    pos === line.pos ||
    next !== ":".charCodeAt(0) ||
    (pos < text.length - 1 && !whitespace(text.charCodeAt(pos + 1)))
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
  const text = stripComments(line.text);
  return (line.next === "-".charCodeAt(0) ||
    line.next === "+".charCodeAt(0) ||
    line.next === "*".charCodeAt(0)) &&
    (line.pos === text.length - 1 ||
      whitespace(text.charCodeAt(line.pos + 1))) &&
    (!breaking ||
      inBlockContext(cx, Type.BulletList) ||
      line.skipSpace(line.pos + 2) < text.length)
    ? 1
    : -1;
}

export function isOrderedList(
  line: Line,
  cx: BlockContext,
  breaking: boolean
): number {
  const text = stripComments(line.text);
  let { pos } = line;
  let { next } = line;
  for (;;) {
    if (next >= 48 && next <= 57 /* '0-9' */) {
      pos += 1;
    } else break;
    if (pos === text.length) {
      return -1;
    }
    next = text.charCodeAt(pos);
  }
  if (
    pos === line.pos ||
    pos > line.pos + 9 ||
    (next !== 46 && next !== 41) /* '.)' */ ||
    (pos < text.length - 1 && !whitespace(text.charCodeAt(pos + 1))) ||
    (breaking &&
      !inBlockContext(cx, Type.OrderedList) &&
      (line.skipSpace(pos + 1) === text.length ||
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
  const text = stripComments(line.text);
  if (
    line.pos === text.length ||
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
    (bl.type !== Type.BulletList || !isPageBreak(line)) &&
    text.charCodeAt(line.pos + size - 1) === bl.value;
  return result;
}

export function isFencedCode(line: Line): number {
  const text = stripComments(line.text);
  if (line.next !== "`".charCodeAt(0) && line.next !== "~".charCodeAt(0)) {
    return -1;
  }
  let pos = line.pos + 1;
  while (pos < text.length && text.charCodeAt(pos) === line.next) {
    pos += 1;
  }
  if (pos < line.pos + 3) {
    return -1;
  }
  return pos;
}

export function isHTMLBlock(
  line: Line,
  _cx: BlockContext,
  breaking: boolean
): number {
  if (line.next !== 60 /* '<' */) {
    return -1;
  }
  const text = stripComments(line.text);
  const rest = text.slice(line.pos);
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
    if (!whitespace(next)) {
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
    if (whitespace(ch)) {
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

// These are blocks that can span blank lines, and should thus only be
// reused if their next sibling is also being reused.
export const NotLast = [
  Type.ListItem,
  Type.OrderedList,
  Type.BulletList,
  Type.TitleEntry,
  Type.Title,
];
