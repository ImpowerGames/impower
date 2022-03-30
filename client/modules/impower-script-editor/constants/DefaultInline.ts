import { sparkRegexes } from "../../impower-script-parser";
import { BlockContext } from "../classes/BlockContext";
import { Element } from "../classes/Element";
import { InlineContext } from "../classes/InlineContext";
import { InlineDelimiter } from "../classes/InlineDelimeter";
import { Mark } from "../types/mark";
import { Type } from "../types/type";
import { newline } from "../utils/newline";
import { space } from "../utils/space";
import {
  AudioNoteStart,
  DynamicTagStart,
  EmphasisAsterisk,
  ImageNoteStart,
  UnderlineUnderscore,
  VariableTagStart,
} from "./delimiters";
import { Escapable, Punctuation } from "./regexes";

export const DefaultInline: {
  [name: string]: (
    cx: InlineContext,
    next: number,
    pos: number,
    block: BlockContext
  ) => number;
} = {
  Pause(cx, next, start, block) {
    if (!space(next)) {
      return -1;
    }
    if (block.absoluteLineEnd - cx.end > 1) {
      return -1;
    }
    const open = cx.slice(start, start + 2);
    const close = cx.slice(start - 1, start + 1);
    const spaceBefore = close === "  ";
    const spaceAfter = open === "  ";
    const newlineAfter = open === " \n" || start + 1 === cx.end;
    const extraSpace = spaceBefore || spaceAfter || newlineAfter;
    if (!extraSpace) {
      return -1;
    }
    return cx.append(new Element(Type.Pause, start, start + 1));
  },

  Comment(cx, next, start) {
    const open = cx.slice(start, start + 2);
    if (open !== "//") {
      return -1;
    }
    let to = start;
    while (to < cx.end && !newline(cx.char(to))) {
      to += 1;
    }
    return cx.append(new Element(Type.Comment, start, to));
  },

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
    const charCode = "`".charCodeAt(0);
    if (
      next !== charCode /* '`' */ ||
      (start && cx.char(start - 1) === charCode)
    ) {
      return -1;
    }
    let pos = start + 1;
    while (pos < cx.end && cx.char(pos) === charCode) {
      pos += 1;
    }
    const size = pos - start;
    let curSize = 0;
    for (; pos < cx.end; pos += 1) {
      if (cx.char(pos) === charCode) {
        curSize += 1;
        if (curSize === size && cx.char(pos + 1) !== charCode) {
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
    let newlinePos = start + 1;
    while (newlinePos < cx.end) {
      if (newline(cx.char(newlinePos))) {
        return -1;
      }
      newlinePos += 1;
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

  ImageNote(cx, next, start) {
    const open = cx.slice(start, start + 2);
    if (open !== "[[") {
      return -1;
    }
    return cx.append(
      new InlineDelimiter(ImageNoteStart, start, start + 2, Mark.Open)
    );
  },

  AudioNote(cx, next, start) {
    const open = cx.slice(start, start + 2);
    if (open !== "((") {
      return -1;
    }
    return cx.append(
      new InlineDelimiter(AudioNoteStart, start, start + 2, Mark.Open)
    );
  },

  DynamicTag(cx, next, start) {
    const open = cx.slice(start, start + 2);
    if (open !== "{{") {
      return -1;
    }
    return cx.append(
      new InlineDelimiter(DynamicTagStart, start, start + 2, Mark.Open)
    );
  },

  DoubleTagEnd(cx, next, start) {
    const close = cx.slice(start - 1, start + 1);
    if (close !== "]]" && close !== "))" && close !== "}}") {
      return -1;
    }
    const trimmedStart = cx.text.trimStart();
    const spaceLength = cx.text.length - trimmedStart.length;
    const endPos = start + 2 - spaceLength;
    // Scanning back to the start marker
    for (let i = cx.parts.length - 1; i >= 0; i -= 1) {
      const part = cx.parts[i];
      if (
        part instanceof InlineDelimiter &&
        (part.type === ImageNoteStart ||
          part.type === AudioNoteStart ||
          part.type === DynamicTagStart)
      ) {
        // Finish the content and replace the entire range in
        // this.parts with the link/image node.
        const type =
          part.type === ImageNoteStart
            ? Type.ImageNote
            : part.type === AudioNoteStart
            ? Type.AudioNote
            : Type.DynamicTag;
        const mark =
          type === Type.ImageNote
            ? Type.ImageNoteMark
            : type === Type.AudioNote
            ? Type.AudioNoteMark
            : Type.DynamicTagMark;
        const startPos = part.from - spaceLength;
        const content = [];
        content.unshift(new Element(mark, startPos, startPos + 2));
        content.push(new Element(mark, endPos - 3, endPos - 1));
        const tag = new Element(type, startPos, endPos - 1, content);
        cx.parts[i] = tag;
        // Set any open-link markers before this link to invalid.
        if (
          part.type === ImageNoteStart ||
          part.type === AudioNoteStart ||
          part.type === DynamicTagStart
        ) {
          for (let j = 0; j < i; j += 1) {
            const p = cx.parts[j];
            if (
              p instanceof InlineDelimiter &&
              (p.type === ImageNoteStart ||
                p.type === AudioNoteStart ||
                p.type === DynamicTagStart)
            ) {
              p.side = 0;
            }
          }
        }
        return tag.to + spaceLength + 1;
      }
    }
    return -1;
  },

  VariableTag(cx, next, start) {
    const open = cx.slice(start, start + 2);
    if (next !== "{".charCodeAt(0) || open === "{{") {
      return -1;
    }
    return cx.append(
      new InlineDelimiter(VariableTagStart, start, start + 1, Mark.Open)
    );
  },

  VariableTagEnd(cx, next, start) {
    const close = cx.slice(start - 1, start + 1);
    if (next !== "}".charCodeAt(0) || close === "}}") {
      return -1;
    }
    // Scanning back to the start marker
    for (let i = cx.parts.length - 1; i >= 0; i -= 1) {
      const part = cx.parts[i];
      if (part instanceof InlineDelimiter && part.type === VariableTagStart) {
        // Finish the content and replace the entire range in
        // this.parts with the link/image node.
        const tagFrom = part?.from;
        const tagTo = start + 1;
        const content = [];
        const expression = cx.slice(tagFrom, tagTo);
        const stringArr = expression.split(sparkRegexes.interpolation_splitter);
        let from = tagFrom;
        let to = tagFrom;
        for (let t = 0; t < stringArr.length; t += 1) {
          const m = stringArr[t];
          const interpolationTokenMatch = m.match(
            sparkRegexes.interpolation_token
          );
          if (interpolationTokenMatch) {
            const interpolationOpenMark = interpolationTokenMatch[1] || "";
            const interpolationOpenMarkSpace = interpolationTokenMatch[2] || "";
            const interpolationVariableName = interpolationTokenMatch[3] || "";
            const interpolationVariableNameSpace =
              interpolationTokenMatch[4] || "";
            const interpolationCloseMark = interpolationTokenMatch[5] || "";
            from = to;
            to =
              from +
              interpolationOpenMark.length +
              interpolationOpenMarkSpace.length;
            content.push(new Element(Type.InterpolationOpenMark, from, to));
            from = to;
            to =
              from +
              interpolationVariableName.length +
              interpolationVariableNameSpace.length;
            content.push(new Element(Type.InterpolationVariableName, from, to));
            from = to;
            to = from + interpolationCloseMark.length;
            content.push(new Element(Type.InterpolationCloseMark, from, to));
          } else {
            from = to;
            to = from + m.length;
            content.push(new Element(Type.String, from, to));
          }
        }
        const tag = new Element(Type.Interpolation, tagFrom, tagTo, content);
        cx.parts[i] = tag;
        // Set any open-link markers before this link to invalid.
        if (part.type === VariableTagStart)
          for (let j = 0; j < i; j += 1) {
            const p = cx.parts[j];
            if (p instanceof InlineDelimiter && p.type === VariableTagStart) {
              p.side = 0;
            }
          }
        return tag.to;
      }
    }
    return -1;
  },
};
