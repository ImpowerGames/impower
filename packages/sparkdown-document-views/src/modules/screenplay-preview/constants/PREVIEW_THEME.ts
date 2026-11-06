import { StyleSpec } from "style-mod";

const PREVIEW_THEME: {
  [selector: string]: StyleSpec;
} = {
  "*, *::before, *::after": {
    boxSizing: "border-box",
  },
  "&": {
    flex: 1,
    overflowX: "clip",
    backgroundColor: "var(--sp-paper)",
    backgroundImage: "var(--sp-texture)",
    backgroundRepeat: "repeat",
    color: "var(--sp-ink)",
  },
  "& .cm-scroller": {
    fontFamily:
      '"Courier Prime", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", monospace',
    fontSize: "clamp(10.5px, 2.3cqi, 14.7px)",
    overflow: "visible",
    position: "relative",
  },
  "& .cm-content": {
    padding: "68px 0",
    flexGrow: 0,
    width: "min(100% - 3em, var(--sp-text-width))",
    marginLeft:
      "max(1.5em, (100% - var(--sp-text-width) - var(--sp-margin-left) - var(--sp-margin-right)) / 2 + var(--sp-margin-left))",
    position: "relative",
    cursor: "default",
    caretColor: "transparent",
  },
  "& .sp-heading": {
    position: "relative",
  },
  "&[data-headings-bold=on] .sp-heading": {
    fontWeight: "bold",
  },
  "&[data-scene-numbers=left] .sp-heading::before, &[data-scene-numbers=both] .sp-heading::before":
    {
      content: "attr(data-scene-number)",
      position: "absolute",
      top: 0,
      right: "calc(100% + 1.2em)",
    },
  "&[data-scene-numbers=right] .sp-heading::after, &[data-scene-numbers=both] .sp-heading::after":
    {
      content: "attr(data-scene-number)",
      position: "absolute",
      top: 0,
      left: "calc(100% + 1.2em)",
    },
  "& .sp-name": {
    margin: "2em 0 1em",
    fontWeight: "bold",
    textDecoration: "underline",
  },
  "& .sp-option": {
    color: "var(--sp-muted)",
  },
  "& .sp-option.sp-chosen": {
    color: "var(--sp-accent)",
    fontWeight: "bold",
  },
  "& .cm-lineWrapping": {
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  "& .cm-line": {
    opacity: 0,
    padding: 0,
  },
  "& .cm-line.cm-activeLine, & .cm-content > .sp-lit": {
    borderRadius: "3px",
    backgroundColor: "var(--sp-lit)",
    boxShadow: "0 0 0 4px var(--sp-lit)",
  },
  "& .cm-line.cm-activeLine:has(.sp-title-page)": {
    backgroundColor: "transparent",
    boxShadow: "none",
  },
  "& .collapse + .collapse": {
    display: "block",
    visibility: "hidden",
    width: "0",
    height: "0",
  },
  "& .collapse:first-child": {
    display: "block",
    visibility: "hidden",
    width: "0",
    height: "0",
  },
  "& .collapse:last-child": {
    display: "block",
    visibility: "hidden",
    width: "0",
    height: "0",
  },
  "& .cm-widgetBuffer": {
    display: "none",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "transparent",
  },
};

export default PREVIEW_THEME;
