import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const PREVIEW_HIGHLIGHTS = HighlightStyle.define([
  {
    tag: tags.comment,
    display: "none",
  },
]);

export default PREVIEW_HIGHLIGHTS;
