import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const PREVIEW_HIGHLIGHTS = HighlightStyle.define([
  {
    tag: tags.contentSeparator,
    "&:after": {
      content: "",
      textDecoration: "line-through",
      color: "#333",
    },
  },

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

  { tag: tags.definition(tags.heading), opacity: 0.5 },

  { tag: tags.docComment, opacity: 0.5 },
  { tag: tags.lineComment, display: "none" },
  { tag: tags.blockComment, display: "none" },
]);

export default PREVIEW_HIGHLIGHTS;
