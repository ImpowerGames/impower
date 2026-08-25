import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import c from "./EDITOR_COLORS";

const EDITOR_HIGHLIGHTS = HighlightStyle.define([
  {
    tag: tags.special(tags.content),
    class: "indent",
  },
  { tag: tags.content },

  { tag: tags.paren, color: c.bracket },
  { tag: tags.brace, color: c.bracket },
  { tag: tags.bracket, color: c.bracket },

  { tag: tags.string, color: c.string },

  { tag: tags.special(tags.string), color: c.foreground },

  { tag: tags.definition(tags.string), color: c.string },

  { tag: tags.monospace, color: c.escape },
  { tag: tags.quote, fontStyle: "italic" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.link, textDecoration: "underline", textUnderlineOffset: "5px" },
  { tag: tags.strikethrough, textDecoration: "line-through" },

  { tag: tags.typeName, color: c.typeName },
  { tag: tags.number, color: c.number },
  { tag: tags.bool, color: c.bool },

  { tag: tags.operator, color: c.operator },
  { tag: tags.typeOperator, color: c.operator },
  { tag: tags.derefOperator, color: c.operator },
  { tag: tags.logicOperator, color: c.operator },
  { tag: tags.updateOperator, color: c.operator },
  { tag: tags.bitwiseOperator, color: c.operator },
  { tag: tags.compareOperator, color: c.operator },
  { tag: tags.controlOperator, color: c.operator },
  { tag: tags.arithmeticOperator, color: c.operator },
  { tag: tags.definitionOperator, color: c.operator },

  { tag: tags.contentSeparator, color: c.break },
  { tag: tags.heading, color: c.sectionNameAccessor },
  { tag: tags.regexp, color: c.heading },
  { tag: tags.labelName, color: c.transitional },

  { tag: tags.escape, color: c.escape },

  { tag: tags.keyword, color: c.keyword },
  { tag: tags.moduleKeyword, color: c.moduleKeyword },
  { tag: tags.controlKeyword, color: c.controlKeyword },
  // Builtin component names (`> image:`) + Luau type keyword. The pre-port
  // `definitionKeyword` color (#FF80BB) is now carried by `c.builtin`.
  { tag: tags.definitionKeyword, color: c.builtin },
  { tag: tags.operatorKeyword, color: c.operatorKeyword },
  { tag: tags.definition(tags.typeName), color: c.typeNameDefinition },
  { tag: tags.special(tags.logicOperator), color: c.specialOperator },
  { tag: tags.special(tags.arithmeticOperator), color: c.specialOperator },
  { tag: tags.special(tags.compareOperator), color: c.specialOperator },
  { tag: tags.special(tags.operator), color: c.specialOperator },
  { tag: tags.propertyName, color: c.propertyName },
  { tag: tags.variableName, color: c.variableName },
  { tag: tags.constant(tags.variableName), color: c.constantVariableName },
  { tag: tags.attributeName, color: c.attributeName },
  { tag: tags.function(tags.name), color: c.functionName },
  {
    tag: tags.special(tags.function(tags.name)),
    color: c.builtin,
  },
  {
    tag: tags.standard(tags.function(tags.name)),
    color: c.standardFunction,
  },
  {
    tag: tags.standard(tags.variableName),
    color: c.standardType,
  },
  { tag: tags.function(tags.variableName), color: c.parameterName },
  { tag: tags.className, color: c.className },

  { tag: tags.definition(tags.annotation), color: c.chunkNameDefinition },
  { tag: tags.special(tags.annotation), color: c.chunkNameDefinition },
  { tag: tags.definition(tags.heading), color: c.sectionNameDefinition },
  { tag: tags.special(tags.heading), color: c.sectionNameDefinition },

  { tag: tags.separator, color: c.foreground },

  { tag: tags.invalid, color: c.invalid },

  { tag: tags.comment, color: c.comment },
  { tag: tags.lineComment, color: c.comment },
  { tag: tags.blockComment, color: c.comment },
  { tag: tags.docComment, color: c.comment },
]);

export default EDITOR_HIGHLIGHTS;
