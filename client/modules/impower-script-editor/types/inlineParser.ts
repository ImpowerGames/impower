/// Inline parsers are called for every character of parts of the

import { InlineContext } from "../classes/InlineContext";

/// document that are parsed as inline content.
export interface InlineParser {
  /// This parser's name, which can be used by other parsers to
  /// [indicate](#InlineParser.before) a relative precedence.
  name: string;
  /// The parse function. Gets the next character and its position as
  /// arguments. Should return -1 if it doesn't handle the character,
  /// or add some [element](#InlineContext.addElement) or
  /// [delimiter](#InlineContext.addDelimiter) and return the end
  /// position of the content it parsed if it can.
  parse(cx: InlineContext, next: number, pos: number): number;
  /// When given, this parser will be installed directly before the
  /// parser with the given name. The default configuration defines
  /// inline parsers with names Escape, InlineCode, HTMLTag,
  /// Emphasis, HardBreak, Link, and Image. When no `before` or
  /// `after` property is given, the parser is added to the end of the
  /// list.
  before?: string;
  /// When given, the parser will be installed directly _after_ the
  /// parser with the given name.
  after?: string;
}
