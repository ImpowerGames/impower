/* eslint-disable no-continue */
import { Tree } from "@lezer/common";
import {
  EmphasisAsterisk,
  NoteBrackets,
  UnderlineUnderscore,
} from "../constants/delimiters";
import { DelimiterType } from "../types/delimiterType";
import { Mark } from "../types/mark";
import { skipSpace } from "../utils/skipSpace";
import { Element } from "./Element";
import { InlineDelimiter } from "./InlineDelimeter";
import { MarkdownParser } from "./MarkdownParser";
import { TreeElement } from "./TreeElement";

/// Inline parsing functions get access to this context, and use it to
/// read the content and emit syntax nodes.
export class InlineContext {
  /// @internal
  parts: (Element | InlineDelimiter | null)[] = [];

  /// The parser that is being used.
  readonly parser: MarkdownParser;

  /// The text of this inline section.
  readonly text: string;

  /// The starting offset of the section in the document.
  readonly offset: number;

  /// @internal
  constructor(
    /// The parser that is being used.
    parser: MarkdownParser,
    /// The text of this inline section.
    text: string,
    /// The starting offset of the section in the document.
    offset: number
  ) {
    this.parser = parser;
    this.text = text;
    this.offset = offset;
  }

  /// Get the character code at the given (document-relative)
  /// position.
  char(pos: number): number {
    return pos >= this.end ? -1 : this.text.charCodeAt(pos - this.offset);
  }

  /// The position of the end of this inline section.
  get end(): number {
    return this.offset + this.text.length;
  }

  /// Get a substring of this inline section. Again uses
  /// document-relative positions.
  slice(from: number, to: number): string {
    return this.text.slice(from - this.offset, to - this.offset);
  }

  /// @internal
  append(elt: Element | InlineDelimiter): number {
    this.parts.push(elt);
    return elt.to;
  }

  /// Add a [delimiter](#DelimiterType) at this given position. `open`
  /// and `close` indicate whether this delimiter is opening, closing,
  /// or both. Returns the end of the delimiter, for convenient
  /// returning from [parse functions](#InlineParser.parse).
  addDelimiter(
    type: DelimiterType,
    from: number,
    to: number,
    open: boolean,
    close: boolean
  ): number {
    return this.append(
      new InlineDelimiter(
        type,
        from,
        to,
        (open ? Mark.Open : 0) | (close ? Mark.Close : 0)
      )
    );
  }

  /// Add an inline element. Returns the end of the element.
  addElement(elt: Element): number {
    return this.append(elt);
  }

  /// @internal
  resolveMarkers(from: number): Element[] {
    for (let i = from; i < this.parts.length; i += 1) {
      const close = this.parts[i];
      if (
        !(
          close instanceof InlineDelimiter &&
          close.type.resolve &&
          close.side & Mark.Close
        )
      ) {
        continue;
      }

      const emp =
        close.type === UnderlineUnderscore ||
        close.type === NoteBrackets ||
        close.type === EmphasisAsterisk;
      const closeSize = close.to - close.from;
      let open: InlineDelimiter | undefined;
      let j = i - 1;
      for (; j >= from; j -= 1) {
        const part = this.parts[j] as InlineDelimiter;
        if (
          !(
            part instanceof InlineDelimiter &&
            part.side & Mark.Open &&
            part.type === close.type
          ) ||
          (emp &&
            (close.side & Mark.Open || part.side & Mark.Close) &&
            (part.to - part.from + closeSize) % 3 === 0 &&
            ((part.to - part.from) % 3 || closeSize % 3))
        ) {
          continue;
        }
        open = part;
        break;
      }
      if (!open) {
        continue;
      }

      let type = close.type.resolve;
      const content = [];
      let start = open.from;
      let end = close.to;
      if (emp) {
        const size = Math.min(2, open.to - open.from, closeSize);
        start = open.to - size;
        end = close.from + size;
        if (close.type === UnderlineUnderscore) {
          type = "Underline";
        }
        if (close.type === NoteBrackets) {
          if (size < 2) {
            continue;
          }
          type = "Note";
        } else {
          type = size === 1 ? "Emphasis" : "StrongEmphasis";
        }
      }
      if (open.type.mark) {
        content.push(this.elt(open.type.mark, start, open.to));
      }
      for (let k = j + 1; k < i; k += 1) {
        if (this.parts[k] instanceof Element) {
          content.push(this.parts[k] as Element);
        }
        this.parts[k] = null;
      }
      if (close.type.mark) {
        content.push(this.elt(close.type.mark, close.from, end));
      }
      const element = this.elt(type, start, end, content);
      this.parts[j] =
        emp && open.from !== start
          ? new InlineDelimiter(open.type, open.from, start, open.side)
          : null;
      const keep =
        emp && close.to !== end
          ? new InlineDelimiter(close.type, end, close.to, close.side)
          : null;
      this.parts[i] = keep;
      if (keep) {
        this.parts.splice(i, 0, element);
      } else {
        this.parts[i] = element;
      }
    }

    const result: Element[] = [];
    for (let i = from; i < this.parts.length; i += 1) {
      const part = this.parts[i];
      if (part instanceof Element) {
        result.push(part);
      }
    }
    return result;
  }

  /// Find an opening delimiter of the given type. Returns `null` if
  /// no delimiter is found, or an index that can be passed to
  /// [`takeContent`](#InlineContext.takeContent) otherwise.
  findOpeningDelimiter(type: DelimiterType): number {
    for (let i = this.parts.length - 1; i >= 0; i -= 1) {
      const part = this.parts[i];
      if (part instanceof InlineDelimiter && part.type === type) {
        return i;
      }
    }
    return null;
  }

  /// Remove all inline elements and delimiters starting from the
  /// given index (which you should get from
  /// [`findOpeningDelimiter`](#InlineContext.findOpeningDelimiter),
  /// resolve delimiters inside of them, and return them as an array
  /// of elements.
  takeContent(startIndex: number): Element[] {
    const content = this.resolveMarkers(startIndex);
    this.parts.length = startIndex;
    return content;
  }

  /// Skip space after the given (document) position, returning either
  /// the position of the next non-space character or the end of the
  /// section.
  skipSpace(from: number): number {
    return skipSpace(this.text, from - this.offset) + this.offset;
  }

  /// Create an [`Element`](#Element) for a syntax node.
  elt(
    type: string,
    from: number,
    to: number,
    children?: readonly Element[]
  ): Element;

  elt(tree: Tree, at: number): Element;

  elt(
    type: string | Tree,
    from: number,
    to?: number,
    children?: Element[]
  ): Element {
    if (typeof type === "string")
      return new Element(this.parser.getNodeType(type), from, to, children);
    return new TreeElement(type, from);
  }
}
