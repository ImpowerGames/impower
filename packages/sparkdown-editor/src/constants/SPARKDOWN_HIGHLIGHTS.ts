import { HighlightStyle } from "@codemirror/language";
import c from "./SPARKDOWN_COLORS";
import t from "./SPARKDOWN_TAGS";

const SPARKDOWN_HIGHLIGHTS = HighlightStyle.define([
  {
    tag: t.formatting,
    color: c.formatting,
    opacity: 0.5,
    fontWeight: 400,
  },
  { tag: t.centered, color: c.formatting },
  { tag: t.strong, color: c.formatting, fontWeight: "bold" },
  { tag: t.emphasis, color: c.formatting, fontStyle: "italic" },
  {
    tag: t.link,
    color: c.formatting,
    textDecoration: "underline",
    textUnderlineOffset: "5px",
  },
  {
    tag: t.strikethrough,
    color: c.formatting,
    textDecoration: "line-through",
  },
  {
    tag: t.dialogue,
    color: c.dialogue,
  },
  {
    tag: t.dialogue_character,
    color: c.dialogue_character,
  },
  {
    tag: t.dialogue_parenthetical,
    color: c.dialogue_parenthetical,
  },
  {
    tag: t.dualDialogue,
    color: c.dualDialogue,
  },
  { tag: t.section, color: c.section },
  { tag: t.sectionMark, color: c.section, opacity: 0.5 },
  {
    tag: t.scene,
    color: c.scene,
  },
  {
    tag: t.sceneNumber,
    opacity: 0.5,
  },
  { tag: t.pageBreak, color: c.pageBreak },
  { tag: t.transition, color: c.transition },
  { tag: t.conditionCheck, color: c.condition },
  {
    tag: t.titleValue,
    color: c.titleValue,
  },
  {
    tag: t.titleKey,
    color: c.titleKey,
    fontWeight: 400,
  },
  { tag: t.lyric, fontStyle: "italic" },
  { tag: t.note, color: c.note },
  { tag: t.noteMark, color: c.note, opacity: 0.5 },
  { tag: t.synopsis, color: c.comment },
  { tag: t.synopsisMark, color: c.comment, opacity: 0.5 },
  { tag: t.comment, color: c.comment },
  {
    tag: t.url,
    color: c.operator,
  },
  {
    tag: t.escape,
    color: c.operator,
  },

  { tag: t.keyword, color: c.keyword },
  { tag: t.typeName, color: c.typeName },
  { tag: t.sectionName, color: c.sectionName },
  { tag: t.variableName, color: c.variableName },
  { tag: t.structName, color: c.structName },
  { tag: t.structBase, color: c.structBase },
  { tag: t.structFieldName, color: c.structField },
  { tag: t.parameterName, color: c.parameterName },
  {
    tag: t.string,
    color: c.string,
  },
  {
    tag: t.number,
    color: c.number,
  },
  {
    tag: t.boolean,
    color: c.boolean,
  },
  {
    tag: t.codeMark,
    color: c.codeMark,
  },
  {
    tag: t.codeText,
    color: c.codeText,
  },
  {
    tag: t.pause,
    position: "relative",
    "&:after": {
      content: "'•'",
      opacity: "0.5",
      position: "absolute",
      top: "6px",
      bottom: "0",
      left: "0",
      right: "1px",
      textAlign: "center",
      color: c.keyword,
      fontSize: "7px",
      lineHeight: "1",
    },
  },
  { tag: t.invalid, color: c.invalid },
]);

export default SPARKDOWN_HIGHLIGHTS;
