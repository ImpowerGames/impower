import { Element } from "../classes/Element";
import { InlineContext } from "../classes/InlineContext";
import { InlineDelimiter } from "../classes/InlineDelimeter";
import { Mark } from "../types/mark";
import { Type } from "../types/type";
import { finishLink } from "../utils/markdown";
import {
  AudioNoteParenthesis,
  DynamicTagBrace,
  EmphasisAsterisk,
  ImageNoteBracket,
  ImageStart,
  LinkStart,
  UnderlineUnderscore,
} from "./delimiters";
import { Escapable, Punctuation } from "./regexes";

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

  ImageNote(cx, next, start) {
    const charCodeBefore = "[".charCodeAt(0);
    const charCodeAfter = "]".charCodeAt(0);
    const validStart = next === charCodeBefore;
    const validEnd = next === charCodeAfter;
    if (!validStart && !validEnd) {
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
      leftFlanking && (next === charCodeBefore || !rightFlanking || pBefore);
    const canClose =
      rightFlanking && (next === charCodeAfter || !leftFlanking || pAfter);
    return cx.append(
      new InlineDelimiter(
        ImageNoteBracket,
        start,
        pos,
        (canOpen ? Mark.Open : 0) | (canClose ? Mark.Close : 0)
      )
    );
  },

  AudioNote(cx, next, start) {
    const charCodeBefore = "(".charCodeAt(0);
    const charCodeAfter = ")".charCodeAt(0);
    const validStart = next === charCodeBefore;
    const validEnd = next === charCodeAfter;
    if (!validStart && !validEnd) {
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
      leftFlanking && (next === charCodeBefore || !rightFlanking || pBefore);
    const canClose =
      rightFlanking && (next === charCodeAfter || !leftFlanking || pAfter);
    return cx.append(
      new InlineDelimiter(
        AudioNoteParenthesis,
        start,
        pos,
        (canOpen ? Mark.Open : 0) | (canClose ? Mark.Close : 0)
      )
    );
  },

  DynamicTag(cx, next, start) {
    const charCodeBefore = "{".charCodeAt(0);
    const charCodeAfter = "}".charCodeAt(0);
    const validStart = next === charCodeBefore;
    const validEnd = next === charCodeAfter;
    if (!validStart && !validEnd) {
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
      leftFlanking && (next === charCodeBefore || !rightFlanking || pBefore);
    const canClose =
      rightFlanking && (next === charCodeAfter || !leftFlanking || pAfter);
    return cx.append(
      new InlineDelimiter(
        DynamicTagBrace,
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
