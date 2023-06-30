import { StyleSpec } from "style-mod";
import SPARKDOWN_COLORS from "./SPARKDOWN_COLORS";

const SPARKDOWN_THEME: {
  [selector: string]: StyleSpec;
} = {
  "&": {
    color: SPARKDOWN_COLORS.foreground,
    backgroundColor: SPARKDOWN_COLORS.background,
    flex: 1,
    fontFamily: "Courier Prime Sans",
    fontSize: "1rem",
  },
  ".cm-scroller": {
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
    caretColor: "white",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "white",
  },
  "&.cm-focused .cm-matchingBracket": {
    outline: "solid 1px #FFFFFF66",
    backgroundColor: "transparent",
  },
  "&.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "transparent",
  },
  ".cm-snippet & .cm-selectionMatch": {
    backgroundColor: "transparent",
  },
  ".cm-snippet & .cm-selectionMatch-main": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: SPARKDOWN_COLORS.lineNumber,
    border: "none",
    opacity: 0.7,
  },
  ".cm-gutterElement *": {
    userSelect: "none",
  },
  ".cm-gutter.cm-lineNumbers": {
    minWidth: "32px",
  },
  ".cm-gutter-lint": {
    width: "1em",
  },
  ".cm-foldGutter .cm-gutterElement span": {
    width: "1em",
    display: "inline-block",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 2px",
  },
  ".cm-activeLine": {
    backgroundColor: "#FFFFFF0F",
  },
  ".cm-search.cm-panel": {
    left: 0,
    right: 0,
    padding: 0,
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: "grey",
    margin: ".1em .4em 0",
  },
  ".cm-lineWrapping": {
    overflowWrap: "break-word",
  },
  ".cm-panel.cm-panel-lint": {
    "& ul": {
      "& [aria-selected]": {
        background_fallback: "#bdf",
        backgroundColor: "Highlight",
        color_fallback: "white",
        color: "HighlightText",
      },
    },
    "& button[name='close']": {
      right: "16px",
      color: "white",
    },
  },
  ".cm-lintRange": {
    backgroundSize: "auto",
  },
  ".cm-lintRange-active": {
    backgroundColor: "#ffdd991a",
  },
  ".cm-tooltip": {
    backgroundColor: SPARKDOWN_COLORS.tooltip,
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    background: SPARKDOWN_COLORS.selected,
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    color: SPARKDOWN_COLORS.match,
  },
  "& .cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    padding: "3px 10px 3px 2px",
  },
  ".cm-completionLabel": {
    flex: 1,
  },
  ".cm-completionDetail": {
    opacity: 0.55,
    fontSize: "0.85em",
    fontStyle: "normal",
    whiteSpace: "pre-wrap",
    lineHeight: "1",
  },
  ".cm-completionIcon": {
    minWidth: "1.75em",
    textAlign: "center",
    padding: 0,
    paddingRight: "2px",
    margin: 0,
  },
  ".cm-snippetFieldPosition": {
    border: "none",
  },
  ".cm-completionIcon-choice_plus": {
    "&:after": {
      content: "'⊕'",
      color: SPARKDOWN_COLORS.variableName,
    },
  },
  ".cm-completionIcon-choice_minus": {
    "&:after": {
      content: "'⊖'",
      color: SPARKDOWN_COLORS.variableName,
    },
  },
  ".cm-completionIcon-section": {
    "&:after": { content: "'#'", color: SPARKDOWN_COLORS.section },
  },
  ".cm-completionIcon-ancestor": {
    "&:after": {
      content: "'⮤'",
      color: SPARKDOWN_COLORS.section,
    },
  },
  ".cm-completionIcon-parent": {
    "&:after": {
      content: "'⬑'",
      color: SPARKDOWN_COLORS.section,
    },
  },
  ".cm-completionIcon-child": {
    "&:after": {
      content: "'⤵'",
      color: SPARKDOWN_COLORS.section,
    },
  },
  ".cm-completionIcon-first_sibling": {
    "&:after": {
      content: "'↱'",
      color: SPARKDOWN_COLORS.section,
    },
  },
  ".cm-completionIcon-last_sibling": {
    "&:after": {
      content: "'↳'",
      color: SPARKDOWN_COLORS.section,
    },
  },
  ".cm-completionIcon-next": {
    "&:after": {
      content: "'⭳'",
      color: SPARKDOWN_COLORS.section,
    },
  },
  ".cm-completionIcon-top": {
    "&:after": {
      content: "'⭱'",
      color: SPARKDOWN_COLORS.section,
    },
  },
  ".cm-completionIcon-quit": {
    "&:after": { content: "'×'", color: SPARKDOWN_COLORS.section },
  },
  ".cm-completionIcon-option": {
    "&:after": {
      content: "'☱'",
      color: SPARKDOWN_COLORS.keyword,
    },
  },
  ".cm-completionIcon-string": {
    "&:after": {
      content: `'α'`,
      color: SPARKDOWN_COLORS.keyword,
    },
  },
  ".cm-completionIcon-number": {
    "&:after": {
      content: "'#'",
      color: SPARKDOWN_COLORS.keyword,
    },
  },
  ".cm-completionIcon-boolean": {
    "&:after": {
      content: "'?'",
      color: SPARKDOWN_COLORS.keyword,
    },
  },
  ".cm-completionIcon-array": {
    "&:after": {
      content: `'[]'`,
      color: SPARKDOWN_COLORS.keyword,
    },
  },
  ".cm-completionIcon-object": {
    "&:after": {
      content: "'{}'",
      color: SPARKDOWN_COLORS.keyword,
    },
  },
  ".cm-completionIcon-type": {
    "&:after": {
      content: "'ν'",
      color: SPARKDOWN_COLORS.keyword,
    },
  },
  ".cm-completionIcon-variable": {
    "&:after": {
      content: "'𝑥'",
      color: SPARKDOWN_COLORS.variableName,
    },
  },
  ".cm-completionIcon-parameter": {
    "&:after": {
      content: "'ρ'",
      color: SPARKDOWN_COLORS.parameterName,
    },
  },
  ".cm-completionIcon-trigger": {
    "&:after": {
      content: "'𝑡'",
      color: SPARKDOWN_COLORS.trigger,
    },
  },
  ".cm-completionIcon-asset": {
    "&:after": { content: "'Ꭿ'", color: SPARKDOWN_COLORS.asset },
  },
  ".cm-completionIcon-struct": {
    "&:after": { content: "'ʂ'", color: SPARKDOWN_COLORS.struct },
  },
  ".cm-completionIcon-tag": {
    "&:after": { content: "'Ť'", color: SPARKDOWN_COLORS.tag },
  },
  ".cm-completionIcon-class": {
    "&:after": { content: "'○'", color: SPARKDOWN_COLORS.dialogue },
  },
  ".cm-completionIcon-method": {
    "&:after": {
      content: "'m'",
      color: SPARKDOWN_COLORS.section,
    },
  },
  ".cm-completionIcon-function": {
    "&:after": {
      content: "'ƒ'",
      color: SPARKDOWN_COLORS.section,
    },
  },
  ".cm-completionIcon-character": {
    "&:after": { content: "'𝐶'", color: SPARKDOWN_COLORS.dialogue_character },
  },
  ".cm-completionIcon-transition": {
    "&:after": { content: "'Ŧ'", color: SPARKDOWN_COLORS.transition },
  },
  ".cm-completionIcon-scene": {
    "&:after": { content: "'Տ'", color: SPARKDOWN_COLORS.scene },
  },
  ".cm-completionIcon-condition": {
    "&:after": { content: "'✓'", color: SPARKDOWN_COLORS.condition },
  },
  ".cm-diagnosticText": {
    marginRight: "16px",
  },
  ".cm-diagnosticAction": {
    backgroundColor: "transparent",
    fontWeight: "600",
    padding: "0",
    color: "#9CDCFE",
    textTransform: "uppercase",
    fontSize: "0.9375rem",
    marginLeft: "0",
    marginRight: "8px",
  },
  ".cm-lint-marker": {
    display: "none",
    width: "0.8em",
    height: "0.8em",
  },
  ".cm-lint & .cm-lint-marker": {
    display: "block",
    width: "0.8em",
    height: "0.8em",
  },
  ".cm-completionInfo": {
    fontFamily: "monospace",
  },
  ".cm-completionInfo pre": {
    margin: "0",
  },
  ".cm-tooltip.cm-completionInfo": {
    maxWidth: "320px",
  },
  ".cm-valueInfo": {
    fontFamily: "monospace",
  },
};

export default SPARKDOWN_THEME;
