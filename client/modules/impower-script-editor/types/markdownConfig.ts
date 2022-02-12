import { NodePropSource, ParseWrapper } from "@lezer/common";
import { BlockParser } from "./blockParser";
import { InlineParser } from "./inlineParser";
import { NodeSpec } from "./nodeSpec";

/// Objects of this type are used to
/// [configure](#MarkdownParser.configure) the Markdown parser.
export interface MarkdownConfig {
  /// Node props to add to the parser's node set.
  props?: readonly NodePropSource[];
  /// Define new [node types](#NodeSpec) for use in parser extensions.
  defineNodes?: readonly (string | NodeSpec)[];
  /// Define additional [block parsing](#BlockParser) logic.
  parseBlock?: readonly BlockParser[];
  /// Define new [inline parsing](#InlineParser) logic.
  parseInline?: readonly InlineParser[];
  /// Remove the named parsers from the configuration.
  remove?: readonly string[];
  /// Add a parse wrapper (such as a [mixed-language
  /// parser](#common.parseMixed)) to this parser.
  wrap?: ParseWrapper;
}
