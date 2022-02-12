/// Block parsers handle block-level structure. There are three
/// general types of block parsers:
///
/// - Composite block parsers, which handle things like lists and
///   blockquotes. These define a [`parse`](#BlockParser.parse) method
///   that [starts](#BlockContext.startComposite) a composite block
///   and returns null when it recognizes its syntax.
///
/// - Eager leaf block parsers, used for things like code or HTML
///   blocks. These can unambiguously recognize their content from its
///   first line. They define a [`parse`](#BlockParser.parse) method
///   that, if it recognizes the construct,
///   [moves](#BlockContext.nextLine) the current line forward to the
///   line beyond the end of the block,
///   [add](#BlockContext.addElement) a syntax node for the block, and
///   return true.
///
/// - Leaf block parsers that observe a paragraph-like construct as it
///   comes in, and optionally decide to handle it at some point. This
///   is used for "setext" (underlined) headings and link references.
///   These define a [`leaf`](#BlockParser.leaf) method that checks
///   the first line of the block and returns a
///   [`LeafBlockParser`](#LeafBlockParser) object if it wants to

import { BlockContext } from "../classes/BlockContext";
import { LeafBlock } from "../classes/LeafBlock";
import { Line } from "../classes/Line";
import { BlockResult } from "./blockResult";
import { LeafBlockParser } from "./leafBlockParser";

///   observe that block.
export interface BlockParser {
  /// The name of the parser. Can be used by other block parsers to
  /// [specify](#BlockParser.before) precedence.
  name: string;
  /// The eager parse function, which can look at the block's first
  /// line and return `false` to do nothing, `true` if it has parsed
  /// (and [moved past](#BlockContext.nextLine) a block), or `null` if
  /// it has started a composite block.
  parse?(cx: BlockContext, line: Line): BlockResult;
  /// A leaf parse function. If no [regular](#BlockParser.parse) parse
  /// functions match for a given line, its content will be
  /// accumulated for a paragraph-style block. This method can return
  /// an [object](#LeafBlockParser) that overrides that style of
  /// parsing in some situations.
  leaf?(cx: BlockContext, leaf: LeafBlock): LeafBlockParser | null;
  /// Some constructs, such as code blocks or newly started
  /// blockquotes, can interrupt paragraphs even without a blank line.
  /// If your construct can do this, provide a predicate here that
  /// recognizes lines that should end a paragraph (or other non-eager
  /// [leaf block](#BlockParser.leaf)).
  endLeaf?(cx: BlockContext, line: Line): boolean;
  /// When given, this parser will be installed directly before the
  /// block parser with the given name. The default configuration
  /// defines block parsers with names LinkReference,
  /// FencedCode, HorizontalRule, BulletList, OrderedList,
  /// ATXHeading, HTMLBlock, and SetextHeading.
  before?: string;
  /// When given, the parser will be installed directly _after_ the
  /// parser with the given name.
  after?: string;
}
