import { StyleSpec } from "style-mod";

const PREVIEW_THEME: {
  [selector: string]: StyleSpec;
} = {
  "&": {
    flex: 1,
    backgroundSize: "auto",
    backgroundRepeat: "repeat",
    color: "#333",
  },
  ".cm-scroller": {
    fontFamily: "Courier Prime",
    fontSize: "1rem",
    overflowY: "scroll",
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
  ".cm-content": {
    padding: "68px 24px 136px 24px",
    margin: "auto",
    maxWidth: "664px",
    position: "relative",
    "&:before": {
      content: "''",
      position: "absolute",
      inset: "0 -96px",
      backgroundColor: "rgb(235, 234, 232)",
      backgroundImage: "var(--screenplay-preview-texture)",
    },
  },
};

export default PREVIEW_THEME;
