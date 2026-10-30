import { StyleSpec } from "style-mod";

const PREVIEW_THEME: {
  [selector: string]: StyleSpec;
} = {
  "*, *::before, *::after": {
    boxSizing: "border-box",
  },
  "&": {
    flex: 1,
    backgroundRepeat: "repeat",
    color: "#333",
  },
  "& .cm-scroller": {
    fontFamily:
      '"Courier Prime", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", monospace',
    fontSize: "1rem",
    overflow: "visible",
    position: "relative",
  },
  "& .cm-content": {
    padding: "68px 24px 68px 24px",
    margin: "auto",
    width: "100%",
    maxWidth: "640px",
    position: "relative",
    cursor: "default",
    caretColor: "transparent",
    "&:before": {
      content: "''",
      position: "absolute",
      inset: "0 -96px",
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
