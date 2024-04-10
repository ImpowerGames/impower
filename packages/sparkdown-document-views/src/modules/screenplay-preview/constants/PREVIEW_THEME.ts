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
    lineHeight: "1.333",
    overflow: "visible",
    position: "relative",
    "&:before": {
      // Force scroller to always be able to scroll,
      // even if the content isn't long enough to warrant it.
      // This is what allows us to prevent users on Safari iOS from
      // scrolling the page when the on-screen keyboard is shown
      content: "''",
      opacity: 0,
      position: "absolute",
      inset: "0 0 -4px 0",
      pointerEvents: "none",
    },
  },
  "& .cm-line": {
    padding: 0,
  },
  "& .cm-content": {
    padding: "68px 24px 68px 24px", // 24px ≈ 0.25 inch
    margin: "auto",
    maxWidth: "640px",
    minHeight: "calc(96px * 11)", // US-Letter height = 11 inch
    position: "relative",
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
};

export default PREVIEW_THEME;
