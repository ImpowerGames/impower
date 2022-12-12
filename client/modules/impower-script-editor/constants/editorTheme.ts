import { StyleSpec } from "style-mod";
import { colors } from "./colors";

export const editorTheme: {
  [selector: string]: StyleSpec;
} = {
  "&": {
    color: colors.foreground,
    backgroundColor: colors.background,
    flex: 1,
  },
  ".cm-content": {
    caretColor: "white",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "white",
  },
  ".cm-snippet & .cm-selectionMatch": {
    backgroundColor: "transparent",
  },
  ".cm-snippet & .cm-selectionMatch-main": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    backgroundColor: "#00000066",
    color: colors.lineNumber,
    border: "none",
  },
  ".cm-gutter.cm-lineNumbers": {
    minWidth: "36px",
  },
  ".cm-gutterElement": {
    userSelect: "none",
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
    backgroundColor: "#00000080",
    borderColor: "#00000080",
    color: "#FFFFFF99",
    margin: "0 4px",
    padding: "0 8px",
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
  ".cm-lintRange-active": {
    backgroundColor: "#ffdd991a",
  },
  ".cm-tooltip": {
    backgroundColor: colors.tooltip,
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    background: colors.selected,
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    color: colors.match,
  },
  ".cm-completionDetail": {
    opacity: 0.55,
    fontStyle: "normal",
    whiteSpace: "pre-wrap",
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
      color: colors.variableName,
    },
  },
  ".cm-completionIcon-choice_minus": {
    "&:after": {
      content: "'⊖'",
      color: colors.variableName,
    },
  },
  ".cm-completionIcon-section": {
    "&:after": { content: "'#'", color: colors.section },
  },
  ".cm-completionIcon-ancestor": {
    "&:after": {
      content: "'⮤'",
      color: colors.section,
    },
  },
  ".cm-completionIcon-parent": {
    "&:after": {
      content: "'⬑'",
      color: colors.section,
    },
  },
  ".cm-completionIcon-child": {
    "&:after": {
      content: "'⤵'",
      color: colors.section,
    },
  },
  ".cm-completionIcon-first_sibling": {
    "&:after": {
      content: "'↱'",
      color: colors.section,
    },
  },
  ".cm-completionIcon-last_sibling": {
    "&:after": {
      content: "'↳'",
      color: colors.section,
    },
  },
  ".cm-completionIcon-next": {
    "&:after": {
      content: "'⭳'",
      color: colors.section,
    },
  },
  ".cm-completionIcon-top": {
    "&:after": {
      content: "'⭱'",
      color: colors.section,
    },
  },
  ".cm-completionIcon-quit": {
    "&:after": { content: "'×'", color: colors.section },
  },
  ".cm-completionIcon-string": {
    "&:after": {
      content: `'""'`,
      color: colors.keyword,
    },
  },
  ".cm-completionIcon-number": {
    "&:after": {
      content: "'0'",
      color: colors.keyword,
    },
  },
  ".cm-completionIcon-array": {
    "&:after": {
      content: `'[]'`,
      color: colors.keyword,
    },
  },
  ".cm-completionIcon-object": {
    "&:after": {
      content: "'{}'",
      color: colors.keyword,
    },
  },
  ".cm-completionIcon-type": {
    "&:after": {
      content: "'ν'",
      color: colors.keyword,
    },
  },
  ".cm-completionIcon-variable": {
    "&:after": {
      content: "'𝑥'",
      color: colors.variableName,
    },
  },
  ".cm-completionIcon-parameter": {
    "&:after": {
      content: "'ρ'",
      color: colors.parameterName,
    },
  },
  ".cm-completionIcon-trigger": {
    "&:after": {
      content: "'𝑡'",
      color: colors.trigger,
    },
  },
  ".cm-completionIcon-asset": {
    "&:after": { content: "'Ꭿ'", color: colors.asset },
  },
  ".cm-completionIcon-struct": {
    "&:after": { content: "'ʂ'", color: colors.struct },
  },
  ".cm-completionIcon-tag": {
    "&:after": { content: "'Ť'", color: colors.tag },
  },
  ".cm-completionIcon-class": {
    "&:after": { content: "'○'", color: colors.dialogue },
  },
  ".cm-completionIcon-method": {
    "&:after": {
      content: "'m'",
      color: colors.section,
    },
  },
  ".cm-completionIcon-function": {
    "&:after": {
      content: "'ƒ'",
      color: colors.section,
    },
  },
  ".cm-completionIcon-character": {
    "&:after": { content: "'𝐶'", color: colors.dialogue_character },
  },
  ".cm-completionIcon-transition": {
    "&:after": { content: "'Ŧ'", color: colors.transition },
  },
  ".cm-completionIcon-scene": {
    "&:after": { content: "'Տ'", color: colors.scene },
  },
  ".cm-completionIcon-condition": {
    "&:after": { content: "'?'", color: colors.condition },
  },
  ".cm-completionIcon-sine-wave": {
    "&:after": { content: "'∿'", color: colors.condition },
  },
  ".cm-completionIcon-triangle-wave": {
    "&:after": { content: "'⋀'", color: colors.condition },
  },
  ".cm-completionIcon-sawtooth-wave": {
    "&:after": { content: "'⩘'", color: colors.condition },
  },
  ".cm-completionIcon-square-wave": {
    "&:after": { content: "'⨅'", color: colors.condition },
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
  ".cm-tooltip.cm-completionInfo": {
    maxWidth: "320px",
  },
  ".cm-valueInfo": {
    fontFamily: "monospace",
  },
};
