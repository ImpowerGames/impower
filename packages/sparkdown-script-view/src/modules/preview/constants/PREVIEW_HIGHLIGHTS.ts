import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const PREVIEW_HIGHLIGHTS = HighlightStyle.define([
  { tag: tags.regexp, fontWeight: "bold" },
  { tag: tags.quote, fontStyle: "italic" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  {
    tag: tags.link,
    textDecoration: "underline",
    textUnderlineOffset: "5px",
  },
  {
    tag: tags.strikethrough,
    textDecoration: "line-through",
  },
  { tag: tags.special(tags.monospace), display: "block", textAlign: "center" },

  { tag: tags.labelName, display: "block", textAlign: "right" },
  { tag: tags.definition(tags.heading), display: "none" },
  {
    tag: tags.special(tags.heading),
    opacity: 0.5,
    display: "block",
    marginTop: "-2em",
    textAlign: "right",
    color: "transparent",
  },
  { tag: tags.docComment, opacity: 0.5, float: "right" },
  {
    tag: tags.contentSeparator,
    opacity: 0.5,
    display: "block",
    textAlign: "center",
    borderBottom: "1px solid #0000004D",
    marginTop: "-1em",
    color: "transparent",
  },

  { tag: tags.meta, opacity: 0.5 },
  { tag: tags.heading, opacity: 0.5 },

  { tag: tags.punctuation, display: "none" },
  { tag: tags.lineComment, display: "none" },
  { tag: tags.blockComment, display: "none" },
  { tag: tags.processingInstruction, display: "none" },
]);

export default PREVIEW_HIGHLIGHTS;
