import { StyleSpec } from "style-mod";
import EDITOR_COLORS from "./EDITOR_COLORS";

const EDITOR_THEME: {
  [selector: string]: StyleSpec;
} = {
  "&": {
    color: EDITOR_COLORS.foreground,
    backgroundColor: EDITOR_COLORS.background,
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
    minWidth: "64px",
    backgroundColor: "transparent",
    color: EDITOR_COLORS.lineNumber,
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
  ".cm-completionMatchedText": {
    textDecoration: "none",
    color: EDITOR_COLORS.match,
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
      color: EDITOR_COLORS.variableNameAccessor,
    },
  },
  ".cm-completionIcon-choice_minus": {
    "&:after": {
      content: "'⊖'",
      color: EDITOR_COLORS.variableNameAccessor,
    },
  },
  ".cm-completionIcon-section": {
    "&:after": { content: "'#'", color: EDITOR_COLORS.sectionNameDefinition },
  },
  ".cm-completionIcon-ancestor": {
    "&:after": {
      content: "'⮤'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  ".cm-completionIcon-parent": {
    "&:after": {
      content: "'⬑'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  ".cm-completionIcon-child": {
    "&:after": {
      content: "'⤵'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  ".cm-completionIcon-first_sibling": {
    "&:after": {
      content: "'↱'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  ".cm-completionIcon-last_sibling": {
    "&:after": {
      content: "'↳'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  ".cm-completionIcon-next": {
    "&:after": {
      content: "'⭳'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  ".cm-completionIcon-top": {
    "&:after": {
      content: "'⭱'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  ".cm-completionIcon-quit": {
    "&:after": { content: "'×'", color: EDITOR_COLORS.sectionNameDefinition },
  },
  ".cm-completionIcon-option": {
    "&:after": {
      content: "'☱'",
      color: EDITOR_COLORS.keyword,
    },
  },
  ".cm-completionIcon-string": {
    "&:after": {
      content: `'α'`,
      color: EDITOR_COLORS.keyword,
    },
  },
  ".cm-completionIcon-number": {
    "&:after": {
      content: "'#'",
      color: EDITOR_COLORS.keyword,
    },
  },
  ".cm-completionIcon-boolean": {
    "&:after": {
      content: "'?'",
      color: EDITOR_COLORS.keyword,
    },
  },
  ".cm-completionIcon-array": {
    "&:after": {
      content: `'[]'`,
      color: EDITOR_COLORS.keyword,
    },
  },
  ".cm-completionIcon-object": {
    "&:after": {
      content: "'{}'",
      color: EDITOR_COLORS.keyword,
    },
  },
  ".cm-completionIcon-type": {
    "&:after": {
      content: "'ν'",
      color: EDITOR_COLORS.keyword,
    },
  },
  ".cm-completionIcon-variable": {
    "&:after": {
      content: "'𝑥'",
      color: EDITOR_COLORS.variableNameAccessor,
    },
  },
  ".cm-completionIcon-parameter": {
    "&:after": {
      content: "'ρ'",
      color: EDITOR_COLORS.variableNameDefinition,
    },
  },
  ".cm-completionIcon-trigger": {
    "&:after": {
      content: "'𝑡'",
      color: EDITOR_COLORS.trigger,
    },
  },
  ".cm-completionIcon-asset": {
    "&:after": { content: "'Ꭿ'", color: EDITOR_COLORS.asset },
  },
  ".cm-completionIcon-struct": {
    "&:after": { content: "'ʂ'", color: EDITOR_COLORS.struct },
  },
  ".cm-completionIcon-tag": {
    "&:after": { content: "'Ť'", color: EDITOR_COLORS.tag },
  },
  ".cm-completionIcon-class": {
    "&:after": { content: "'○'", color: EDITOR_COLORS.dialogue },
  },
  ".cm-completionIcon-method": {
    "&:after": {
      content: "'m'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  ".cm-completionIcon-function": {
    "&:after": {
      content: "'ƒ'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  ".cm-completionIcon-character": {
    "&:after": { content: "'𝐶'", color: EDITOR_COLORS.dialogueCharacter },
  },
  ".cm-completionIcon-transition": {
    "&:after": { content: "'Ŧ'", color: EDITOR_COLORS.transition },
  },
  ".cm-completionIcon-scene": {
    "&:after": { content: "'Տ'", color: EDITOR_COLORS.scene },
  },
  ".cm-completionIcon-condition": {
    "&:after": { content: "'✓'", color: EDITOR_COLORS.condition },
  },
  ".cm-completionIcon-module": {
    "&:after": { content: "'⩀'", color: EDITOR_COLORS.variableNameAccessor },
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
  ".cm-tooltip": {
    backgroundColor: EDITOR_COLORS.tooltip,
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    background: EDITOR_COLORS.selected,
  },
  ".cm-valueInfo": {
    fontFamily: "monospace",
  },
};

export default EDITOR_THEME;
