import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const EDITOR_HIGHLIGHTS = HighlightStyle.define([
  {
    tag: tags.special(tags.content),
    class: "indent",
  },
  { tag: tags.content },

  { tag: tags.paren, color: "var(--syntax-bracket)" },
  { tag: tags.brace, color: "var(--syntax-bracket)" },
  { tag: tags.bracket, color: "var(--syntax-bracket)" },

  { tag: tags.string, color: "var(--syntax-string)" },

  { tag: tags.special(tags.string), color: "var(--syntax-text)" },

  { tag: tags.definition(tags.string), color: "var(--syntax-string)" },

  { tag: tags.monospace, color: "var(--syntax-escape)" },

  { tag: tags.typeName, color: "var(--syntax-type-name)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.bool, color: "var(--syntax-bool)" },

  { tag: tags.operator, color: "var(--syntax-operator)" },
  { tag: tags.typeOperator, color: "var(--syntax-operator)" },
  { tag: tags.derefOperator, color: "var(--syntax-operator)" },
  { tag: tags.logicOperator, color: "var(--syntax-operator)" },
  { tag: tags.updateOperator, color: "var(--syntax-operator)" },
  { tag: tags.bitwiseOperator, color: "var(--syntax-operator)" },
  { tag: tags.compareOperator, color: "var(--syntax-operator)" },
  { tag: tags.controlOperator, color: "var(--syntax-operator)" },
  { tag: tags.arithmeticOperator, color: "var(--syntax-operator)" },
  { tag: tags.definitionOperator, color: "var(--syntax-operator)" },

  { tag: tags.contentSeparator, color: "var(--syntax-break)" },
  { tag: tags.heading, color: "var(--syntax-section-name-accessor)" },
  { tag: tags.regexp, color: "var(--syntax-regex)" },
  { tag: tags.labelName, color: "var(--syntax-transitional)" },

  { tag: tags.escape, color: "var(--syntax-escape)" },

  { tag: tags.keyword, color: "var(--syntax-plain-keyword)" },
  { tag: tags.moduleKeyword, color: "var(--syntax-module-keyword)" },
  { tag: tags.controlKeyword, color: "var(--syntax-control-keyword)" },
  { tag: tags.definitionKeyword, color: "var(--syntax-builtin)" },
  { tag: tags.operatorKeyword, color: "var(--syntax-operator-keyword)" },
  {
    tag: tags.definition(tags.typeName),
    color: "var(--syntax-type-name-definition)",
  },
  {
    tag: tags.special(tags.logicOperator),
    color: "var(--syntax-special-operator)",
  },
  {
    tag: tags.special(tags.arithmeticOperator),
    color: "var(--syntax-special-operator)",
  },
  {
    tag: tags.special(tags.compareOperator),
    color: "var(--syntax-special-operator)",
  },
  { tag: tags.special(tags.operator), color: "var(--syntax-special-operator)" },
  { tag: tags.propertyName, color: "var(--syntax-property-name)" },
  { tag: tags.variableName, color: "var(--syntax-variable-name)" },
  {
    tag: tags.constant(tags.variableName),
    color: "var(--syntax-constant-variable-name)",
  },
  { tag: tags.attributeName, color: "var(--syntax-attribute-name)" },
  { tag: tags.function(tags.name), color: "var(--syntax-function-name)" },
  {
    tag: tags.special(tags.function(tags.name)),
    color: "var(--syntax-builtin)",
  },
  {
    tag: tags.standard(tags.function(tags.name)),
    color: "var(--syntax-standard-function)",
  },
  {
    tag: tags.standard(tags.variableName),
    color: "var(--syntax-standard-type)",
  },
  {
    tag: tags.function(tags.variableName),
    color: "var(--syntax-parameter-name)",
  },
  { tag: tags.className, color: "var(--syntax-class-name)" },

  {
    tag: tags.definition(tags.annotation),
    color: "var(--syntax-chunk-name-definition)",
  },
  {
    tag: tags.special(tags.annotation),
    color: "var(--syntax-chunk-name-definition)",
  },
  {
    tag: tags.definition(tags.heading),
    color: "var(--syntax-section-name-definition)",
  },
  {
    tag: tags.special(tags.heading),
    color: "var(--syntax-section-name-definition)",
  },

  { tag: tags.separator, color: "var(--syntax-text)" },

  { tag: tags.invalid, color: "var(--syntax-invalid)" },

  { tag: tags.comment, color: "var(--syntax-comment)" },
  { tag: tags.lineComment, color: "var(--syntax-comment)" },
  { tag: tags.blockComment, color: "var(--syntax-comment)" },
  { tag: tags.docComment, color: "var(--syntax-comment)" },
]);

export default EDITOR_HIGHLIGHTS;
