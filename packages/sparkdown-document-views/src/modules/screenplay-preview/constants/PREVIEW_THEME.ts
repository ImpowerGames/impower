import { StyleSpec } from "style-mod";

const PREVIEW_THEME: {
  [selector: string]: StyleSpec;
} = {
  "*, *::before, *::after": {
    boxSizing: "border-box",
  },
  "&": {
    flex: 1,
    backgroundSize: "auto",
    backgroundRepeat: "repeat",
    color: "#333",
  },
  "& .cm-scroller": {
    fontFamily: "Courier Prime",
    fontSize: "1rem",
    overflow: "visible",
    position: "relative",
  },
  "& .cm-content": {
    padding: "68px 24px 68px 24px", // 24px ≈ 0.25 inch
    margin: "auto",
    width: "100%", // grow to fill the scroller so short scripts still render at page width
    maxWidth: "640px",
    position: "relative",
    cursor: "default",
    caretColor: "transparent",
    pointerEvents: "auto",
    "&:before": {
      content: "''",
      position: "absolute",
      inset: "0 -96px", // 96px ≈ 1 inch
      backgroundColor: "rgb(235, 234, 232)",
      backgroundImage: "var(--screenplay-preview-texture)",
      zIndex: "-1",
    },
  },
  "& .cm-lineWrapping": {
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  "& .cm-line": {
    opacity: 0,
    padding: 0,
  },
  "& .cm-line.cm-activeLine": {
    backgroundColor: "transparent",
    outline: "2px solid #00000012",
  },
  // A standalone `.cm-line.collapse` separator (whitespace-only blank line
  // between two content blocks) has no visible content — only display:none
  // widget buffers and an empty span — so CodeMirror skips the `<br>`
  // injection it does for truly empty lines. Without an explicit height,
  // the line-box collapses and the user sees the two surrounding blocks
  // squished together. Give the separator an explicit 1em min-height so
  // it renders as a real blank line. The `.collapse + .collapse`,
  // `:first-child`, `:last-child` rules below have equal specificity but
  // come later in source order, so they still override for adjacent and
  // edge cases (which we DO want hidden — they would otherwise produce
  // double-spacing or a leading/trailing blank).
  "& .cm-line.collapse": {
    minHeight: "1em",
  },
  "& .collapse + .collapse": {
    display: "block",
    visibility: "hidden",
    width: "0",
    height: "0",
    minHeight: "0",
  },
  "& .collapse:first-child": {
    display: "block",
    visibility: "hidden",
    width: "0",
    height: "0",
    minHeight: "0",
  },
  "& .collapse:last-child": {
    display: "block",
    visibility: "hidden",
    width: "0",
    height: "0",
    minHeight: "0",
  },
  "& .cm-widgetBuffer": {
    display: "none",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "transparent",
  },
};

export default PREVIEW_THEME;
