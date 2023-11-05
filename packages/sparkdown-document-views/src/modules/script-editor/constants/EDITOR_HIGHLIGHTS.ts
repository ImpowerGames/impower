import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import c from "./EDITOR_COLORS";

const EDITOR_HIGHLIGHTS = HighlightStyle.define([
  { tag: tags.content },

  { tag: tags.paren, color: c.bracket },
  { tag: tags.brace, color: c.bracket },
  { tag: tags.bracket, color: c.bracket },

  { tag: tags.monospace, color: c.formatting },
  { tag: tags.quote, color: c.formatting, fontStyle: "italic" },
  { tag: tags.emphasis, color: c.formatting, fontStyle: "italic" },
  { tag: tags.strong, color: c.formatting, fontWeight: "bold" },
  {
    tag: tags.link,
    color: c.formatting,
    textDecoration: "underline",
    textUnderlineOffset: "5px",
  },
  {
    tag: tags.strikethrough,
    color: c.formatting,
    textDecoration: "line-through",
  },

  { tag: tags.typeName, color: c.typeName },
  { tag: tags.string, color: c.string },
  { tag: tags.number, color: c.number },
  { tag: tags.bool, color: c.bool },
  { tag: tags.escape, color: c.escape },

  { tag: tags.keyword, color: c.keyword },

  { tag: tags.moduleKeyword, color: c.moduleKeyword },
  { tag: tags.controlKeyword, color: c.controlKeyword },
  { tag: tags.propertyName, color: c.propertyName },
  { tag: tags.variableName, color: c.variableName },
  { tag: tags.function(tags.variableName), color: c.functionName },

  { tag: tags.contentSeparator, color: c.break },
  { tag: tags.definition(tags.annotation), color: c.chunkNameDefinition },
  { tag: tags.special(tags.annotation), color: c.chunkNameDefinition },
  { tag: tags.definition(tags.heading), color: c.sectionNameDefinition },
  { tag: tags.special(tags.heading), color: c.sectionNameDefinition },
  { tag: tags.heading, color: c.sectionNameAccessor },
  { tag: tags.regexp, color: c.scene },
  { tag: tags.labelName, color: c.transition },

  { tag: tags.separator, color: c.foreground },

  { tag: tags.invalid, color: c.invalid },

  { tag: tags.comment, color: c.comment },
  { tag: tags.lineComment, color: c.comment },
  { tag: tags.blockComment, color: c.comment },
  { tag: tags.docComment, color: c.comment },
]);

export default EDITOR_HIGHLIGHTS;
