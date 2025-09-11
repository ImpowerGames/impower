import { StyleSpec } from "style-mod";
import EDITOR_COLORS from "./EDITOR_COLORS";

const EDITOR_THEME: {
  [selector: string]: StyleSpec;
} = {
  "*, *::before, *::after": {
    boxSizing: "border-box",
  },
  ".cm-editor": {
    color: EDITOR_COLORS.foreground,
    flex: 1,
    minHeight: "100%",
  },
  "& .cm-scroller": {
    fontFamily: "Courier Prime Sans",
    fontSize: "1rem",
    padding: "6px 2px 0 0",
  },
  "& .cm-content": {
    caretColor: "white",
    minHeight: "100%",
  },
  "@media (hover: hover) and (pointer: fine)": {
    ".cm-textfield:hover": {
      borderColor: EDITOR_COLORS.borderHover,
    },
    "label:has(input[type='checkbox']):hover::before": {
      backgroundColor: EDITOR_COLORS.buttonHover,
    },
    "button:hover": {
      backgroundColor: EDITOR_COLORS.buttonHover,
    },
    ".cm-panel.cm-search button[name='close']:hover": {
      backgroundColor: EDITOR_COLORS.buttonHover,
    },
  },
  "& label:has(input[type='checkbox'])": {
    cursor: "pointer",
  },
  "& button": {
    cursor: "pointer",
    backgroundColor: "transparent",
  },
  "& button:active": {
    backgroundColor: EDITOR_COLORS.buttonActive,
  },
  "& button:focus-visible": {
    outline: `2px solid ${EDITOR_COLORS.focus}`,
  },
  "& ul:focus-visible": {
    outline: `2px solid ${EDITOR_COLORS.focus}`,
  },
  "& label:has(input[type='checkbox']:focus-visible)::before": {
    outline: `2px solid ${EDITOR_COLORS.focus}`,
  },
  "& label:has(input[type='checkbox']:focus-visible)::after": {
    outline: `2px solid ${EDITOR_COLORS.focus}`,
  },
  "& .cm-textfield": {
    minHeight: "25px",
    width: "225px",
    borderRadius: "4px",
    fontSize: "16px",
    padding: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: EDITOR_COLORS.border,
    "&:focus-visible": {
      outline: "none",
      borderColor: EDITOR_COLORS.selectedForeground,
    },
    "&::placeholder": {
      color: EDITOR_COLORS.placeholder,
    },
  },
  "&.cm-focused": {
    outline: "none",
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
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "#264F78",
  },
  "& .cm-selectionMatch": {
    backgroundColor: "#62331599",
  },
  "& .cm-snippet .cm-selectionMatch": {
    backgroundColor: "transparent",
  },
  "& .cm-snippet .cm-selectionMatch-main": {
    backgroundColor: "transparent",
  },
  "& .cm-gutters": {
    backgroundColor: "transparent",
    color: EDITOR_COLORS.lineNumber,
    border: "none",
    opacity: 0.7,
  },
  "& .cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: EDITOR_COLORS.activeLineNumber,
  },
  "& .cm-activeLine": {
    backgroundColor: "transparent",
    outline: "2px solid #FFFFFF12",
  },
  "& .cm-gutterElement *": {
    userSelect: "none",
  },
  "& .cm-lineNumbers .cm-gutterElement": {
    padding: "0 2px",
  },
  "& .cm-gutter-lint": {
    width: "1em",
  },
  "& .cm-foldGutter .cm-gutterElement span": {
    width: "1em",
    display: "inline-block",
  },
  "& .cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: "grey",
    margin: ".1em .4em 0",
  },
  "& .cm-lineWrapping": {
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  "& .cm-panels": {
    backgroundColor: EDITOR_COLORS.panel,
  },
  "& .cm-panels.cm-panels-top": {
    "& .cm-panel": {
      // Top panels should cover up panel header
      marginTop: "-48px",
      minHeight: "40px",
    },
  },
  "& .cm-panel.cm-gotoLine": {
    backgroundColor: EDITOR_COLORS.panel,
    padding: "8px",
    display: "flex",
    gap: "8px",
    "& .cm-textfield": {
      height: "32px",
      flex: 1,
    },
    "& button": {
      border: "none",
      height: "32px",
      width: "32px",
      borderRadius: "4px",
      textIndent: "-99999em",
      overflow: "hidden",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
    },
    "& button[name='close']": {
      backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="${encodeURIComponent(
        EDITOR_COLORS.closeButton
      )}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M 12 12 L 6 6 M 12 12 L 18 6 M 12 12 L 18 18 M 12 12 L 6 18"></path></svg>')`,
    },
    "& button[name='submit']": {
      backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="${encodeURIComponent(
        EDITOR_COLORS.white
      )}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-6 6l6-6m-6-6l6 6"/></svg>')`,
    },
  },
  "& .cm-panel.cm-search": {
    backgroundColor: EDITOR_COLORS.panel,
    padding: "8px 8px 8px 56px",
    float: "right",
    width: "100%",
    position: "relative",
    "& .cm-textfield": {
      margin: "3px 5px 3px 0px",
    },
    "& input:not([type='checkbox'])": {
      width: "calc(100% - 78px)",
    },
    "& input[name='search']": {
      paddingRight: "100px",
    },
    "& button[name='close']": {
      position: "absolute",
      top: "0",
      left: "0",
      bottom: "0",
      right: "auto",
      width: "40px",
      margin: "8px",
      borderRadius: "4px",
      textIndent: "-99999em",
      overflow: "hidden",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="${encodeURIComponent(
        EDITOR_COLORS.closeButton
      )}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M 12 12 L 6 6 M 12 12 L 18 6 M 12 12 L 18 18 M 12 12 L 6 18"></path></svg>')`,
    },
    "& button:not([name='close'])": {
      display: "inline-block",
      width: "36px",
      height: "36px",
      verticalAlign: "middle",
      borderRadius: "4px",
      textIndent: "-99999em",
      overflow: "hidden",
      border: "none",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      margin: "0",
    },
    "& button[name='prev']": {
      backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="${encodeURIComponent(
        EDITOR_COLORS.white
      )}" stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 5v14m6-8l-6-6m-6 6l6-6"/></svg>')`,
    },
    "& button[name='next']": {
      backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="${encodeURIComponent(
        EDITOR_COLORS.white
      )}" stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 5v14m6-6l-6 6m-6-6l6 6"/></svg>')`,
    },
    "& button[name='select']": {
      display: "none",
    },
    "& button[name='replace']": {
      backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="${encodeURIComponent(
        EDITOR_COLORS.white
      )}"  stroke-width="1" stroke-linecap="round" stroke-linejoin="round" d="M6 18v-6a3 3 0 0 1 3 -3h10l-4 -4m0 8l4 -4" /></svg>')`,
    },
    "& button[name='replaceAll']": {
      backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="${encodeURIComponent(
        EDITOR_COLORS.white
      )}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" d="M4 18v-6a3 3 0 0 1 3 -3h7M10 13l4 -4l-4 -4m5 8l4 -4l-4 -4" /></svg>')`,
    },
    "& label:has(input[type='checkbox'])": {
      display: "inline-block",
      width: "36px",
      height: "36px",
      verticalAlign: "middle",
      borderRadius: "4px",
      textIndent: "-99999em",
      overflow: "hidden",
      position: "absolute",
      cursor: "pointer",
      "& input": {
        opacity: "0",
        position: "absolute",
        inset: "0",
        cursor: "pointer",
      },
      "&::before": {
        content: "''",
        position: "absolute",
        inset: "5px",
        marginTop: "1.5px",
        borderRadius: "4px",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      },
    },
    "& label:has(input[type='checkbox']:checked)::before": {
      backgroundColor: EDITOR_COLORS.checked,
    },
    "& label:has(input[name='case'])": {
      right: "calc(80px + 36px + 36px - 8px)",
      "&::before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.foreground
        )}"><path d="M8.85352 11.7021H7.85449L7.03809 9.54297H3.77246L3.00439 11.7021H2L4.9541 4H5.88867L8.85352 11.7021ZM6.74268 8.73193L5.53418 5.4502C5.49479 5.34277 5.4554 5.1709 5.41602 4.93457H5.39453C5.35872 5.15299 5.31755 5.32487 5.271 5.4502L4.07324 8.73193H6.74268Z"/><path d="M13.756 11.7021H12.8752V10.8428H12.8537C12.4706 11.5016 11.9066 11.8311 11.1618 11.8311C10.6139 11.8311 10.1843 11.686 9.87273 11.396C9.56479 11.106 9.41082 10.721 9.41082 10.2412C9.41082 9.21354 10.016 8.61556 11.2262 8.44727L12.8752 8.21631C12.8752 7.28174 12.4974 6.81445 11.7419 6.81445C11.0794 6.81445 10.4815 7.04004 9.94793 7.49121V6.58887C10.4886 6.24512 11.1117 6.07324 11.8171 6.07324C13.1097 6.07324 13.756 6.75716 13.756 8.125V11.7021ZM12.8752 8.91992L11.5485 9.10254C11.1403 9.15983 10.8324 9.26188 10.6247 9.40869C10.417 9.55192 10.3132 9.80794 10.3132 10.1768C10.3132 10.4453 10.4081 10.6655 10.5978 10.8374C10.7912 11.0057 11.0472 11.0898 11.3659 11.0898C11.8027 11.0898 12.1626 10.9377 12.4455 10.6333C12.7319 10.3254 12.8752 9.93685 12.8752 9.46777V8.91992Z"/></svg>')`,
      },
    },
    "& label:has(input[name='case']:checked)": {
      "&::before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.white
        )}"><path d="M8.85352 11.7021H7.85449L7.03809 9.54297H3.77246L3.00439 11.7021H2L4.9541 4H5.88867L8.85352 11.7021ZM6.74268 8.73193L5.53418 5.4502C5.49479 5.34277 5.4554 5.1709 5.41602 4.93457H5.39453C5.35872 5.15299 5.31755 5.32487 5.271 5.4502L4.07324 8.73193H6.74268Z"/><path d="M13.756 11.7021H12.8752V10.8428H12.8537C12.4706 11.5016 11.9066 11.8311 11.1618 11.8311C10.6139 11.8311 10.1843 11.686 9.87273 11.396C9.56479 11.106 9.41082 10.721 9.41082 10.2412C9.41082 9.21354 10.016 8.61556 11.2262 8.44727L12.8752 8.21631C12.8752 7.28174 12.4974 6.81445 11.7419 6.81445C11.0794 6.81445 10.4815 7.04004 9.94793 7.49121V6.58887C10.4886 6.24512 11.1117 6.07324 11.8171 6.07324C13.1097 6.07324 13.756 6.75716 13.756 8.125V11.7021ZM12.8752 8.91992L11.5485 9.10254C11.1403 9.15983 10.8324 9.26188 10.6247 9.40869C10.417 9.55192 10.3132 9.80794 10.3132 10.1768C10.3132 10.4453 10.4081 10.6655 10.5978 10.8374C10.7912 11.0057 11.0472 11.0898 11.3659 11.0898C11.8027 11.0898 12.1626 10.9377 12.4455 10.6333C12.7319 10.3254 12.8752 9.93685 12.8752 9.46777V8.91992Z"/></svg>')`,
      },
    },
    "& label:has(input[name='word'])": {
      right: "calc(80px + 36px - 4px)",
      "&::before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.foreground
        )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 11H1V13H15V11H16V14H15H1H0V11Z"/><path d="M6.84048 11H5.95963V10.1406H5.93814C5.555 10.7995 4.99104 11.1289 4.24625 11.1289C3.69839 11.1289 3.26871 10.9839 2.95718 10.6938C2.64924 10.4038 2.49527 10.0189 2.49527 9.53906C2.49527 8.51139 3.10041 7.91341 4.3107 7.74512L5.95963 7.51416C5.95963 6.57959 5.58186 6.1123 4.82632 6.1123C4.16389 6.1123 3.56591 6.33789 3.03238 6.78906V5.88672C3.57307 5.54297 4.19612 5.37109 4.90152 5.37109C6.19416 5.37109 6.84048 6.05501 6.84048 7.42285V11ZM5.95963 8.21777L4.63297 8.40039C4.22476 8.45768 3.91682 8.55973 3.70914 8.70654C3.50145 8.84977 3.39761 9.10579 3.39761 9.47461C3.39761 9.74316 3.4925 9.96338 3.68228 10.1353C3.87564 10.3035 4.13166 10.3877 4.45035 10.3877C4.8872 10.3877 5.24706 10.2355 5.52994 9.93115C5.8164 9.62321 5.95963 9.2347 5.95963 8.76562V8.21777Z"/><path d="M9.3475 10.2051H9.32601V11H8.44515V2.85742H9.32601V6.4668H9.3475C9.78076 5.73633 10.4146 5.37109 11.2489 5.37109C11.9543 5.37109 12.5057 5.61816 12.9032 6.1123C13.3042 6.60286 13.5047 7.26172 13.5047 8.08887C13.5047 9.00911 13.2809 9.74674 12.8333 10.3018C12.3857 10.8532 11.7734 11.1289 10.9964 11.1289C10.2695 11.1289 9.71989 10.821 9.3475 10.2051ZM9.32601 7.98682V8.75488C9.32601 9.20964 9.47282 9.59635 9.76644 9.91504C10.0636 10.2301 10.4396 10.3877 10.8944 10.3877C11.4279 10.3877 11.8451 10.1836 12.1458 9.77539C12.4502 9.36719 12.6024 8.79964 12.6024 8.07275C12.6024 7.46045 12.4609 6.98063 12.1781 6.6333C11.8952 6.28597 11.512 6.1123 11.0286 6.1123C10.5166 6.1123 10.1048 6.29134 9.7933 6.64941C9.48177 7.00391 9.32601 7.44971 9.32601 7.98682Z"/></svg>')`,
      },
    },
    "& label:has(input[name='word']:checked)": {
      "&::before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.white
        )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 11H1V13H15V11H16V14H15H1H0V11Z"/><path d="M6.84048 11H5.95963V10.1406H5.93814C5.555 10.7995 4.99104 11.1289 4.24625 11.1289C3.69839 11.1289 3.26871 10.9839 2.95718 10.6938C2.64924 10.4038 2.49527 10.0189 2.49527 9.53906C2.49527 8.51139 3.10041 7.91341 4.3107 7.74512L5.95963 7.51416C5.95963 6.57959 5.58186 6.1123 4.82632 6.1123C4.16389 6.1123 3.56591 6.33789 3.03238 6.78906V5.88672C3.57307 5.54297 4.19612 5.37109 4.90152 5.37109C6.19416 5.37109 6.84048 6.05501 6.84048 7.42285V11ZM5.95963 8.21777L4.63297 8.40039C4.22476 8.45768 3.91682 8.55973 3.70914 8.70654C3.50145 8.84977 3.39761 9.10579 3.39761 9.47461C3.39761 9.74316 3.4925 9.96338 3.68228 10.1353C3.87564 10.3035 4.13166 10.3877 4.45035 10.3877C4.8872 10.3877 5.24706 10.2355 5.52994 9.93115C5.8164 9.62321 5.95963 9.2347 5.95963 8.76562V8.21777Z"/><path d="M9.3475 10.2051H9.32601V11H8.44515V2.85742H9.32601V6.4668H9.3475C9.78076 5.73633 10.4146 5.37109 11.2489 5.37109C11.9543 5.37109 12.5057 5.61816 12.9032 6.1123C13.3042 6.60286 13.5047 7.26172 13.5047 8.08887C13.5047 9.00911 13.2809 9.74674 12.8333 10.3018C12.3857 10.8532 11.7734 11.1289 10.9964 11.1289C10.2695 11.1289 9.71989 10.821 9.3475 10.2051ZM9.32601 7.98682V8.75488C9.32601 9.20964 9.47282 9.59635 9.76644 9.91504C10.0636 10.2301 10.4396 10.3877 10.8944 10.3877C11.4279 10.3877 11.8451 10.1836 12.1458 9.77539C12.4502 9.36719 12.6024 8.79964 12.6024 8.07275C12.6024 7.46045 12.4609 6.98063 12.1781 6.6333C11.8952 6.28597 11.512 6.1123 11.0286 6.1123C10.5166 6.1123 10.1048 6.29134 9.7933 6.64941C9.48177 7.00391 9.32601 7.44971 9.32601 7.98682Z"/></svg>')`,
      },
    },
    "& label:has(input[name='re'])": {
      right: "80px",
      "&::before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.foreground
        )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.012 2h.976v3.113l2.56-1.557.486.885L11.47 6l2.564 1.559-.485.885-2.561-1.557V10h-.976V6.887l-2.56 1.557-.486-.885L9.53 6 6.966 4.441l.485-.885 2.561 1.557V2zM2 10h4v4H2v-4z"/></svg>')`,
      },
    },
    "& label:has(input[name='re']:checked)": {
      "&::before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.white
        )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.012 2h.976v3.113l2.56-1.557.486.885L11.47 6l2.564 1.559-.485.885-2.561-1.557V10h-.976V6.887l-2.56 1.557-.486-.885L9.53 6 6.966 4.441l.485-.885 2.561 1.557V2zM2 10h4v4H2v-4z"/></svg>')`,
      },
    },
  },
  "& .cm-panel.cm-panel-lint": {
    "& ul": {
      "& li": {
        cursor: "pointer",
      },
      "& [aria-selected]": {
        background_fallback: "#bdf",
        backgroundColor: "Highlight",
        color_fallback: "white",
        color: "HighlightText",
      },
    },
    "& button[name='close']": {
      display: "none",
    },
  },
  "& .cm-lintRange": {
    backgroundSize: "auto",
  },
  "& .cm-lintRange-active": {
    backgroundColor: "#ffdd991a",
  },
  "& .cm-diagnosticText": {
    marginRight: "16px",
  },
  "& .cm-diagnosticAction": {
    backgroundColor: "transparent",
    fontWeight: "600",
    padding: "0",
    color: "#9CDCFE",
    textTransform: "uppercase",
    fontSize: "0.9375rem",
    marginLeft: "0",
    marginRight: "8px",
  },
  "& .cm-lint-marker": {
    display: "none",
    width: "0.8em",
    height: "0.8em",
  },
  "& .cm-lint .cm-lint-marker": {
    display: "block",
    width: "0.8em",
    height: "0.8em",
  },
  "& .cm-tooltip": {
    backgroundColor: EDITOR_COLORS.panel,
  },
  "& .cm-tooltip-autocomplete ul li[aria-selected]": {
    background: EDITOR_COLORS.selectedBackground,
  },
  "& .cm-valueInfo": {
    fontFamily: "monospace",
  },
  "& .cm-snippetFieldPosition": {
    border: "none",
  },
  "& .cm-completionMatchedText": {
    textDecoration: "none",
    color: EDITOR_COLORS.match,
  },
  "& .cm-completionLabel": {
    flex: 1,
  },
  "& .cm-completionDetail": {
    opacity: 0.55,
    fontSize: "0.85em",
    fontStyle: "normal",
    whiteSpace: "pre-wrap",
    lineHeight: "1",
  },
  "& .cm-completionIcon": {
    minWidth: "1.75em",
    textAlign: "center",
    padding: 0,
    paddingRight: "2px",
    margin: 0,
    "&::after": {
      display: "block",
      content: "''",
      width: "16px",
      height: "16px",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
    },
  },
  "& .cm-completionIcon-method": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.51 4L8.51001 1H7.51001L2.51001 4L2.02002 4.85999V10.86L2.51001 11.71L7.51001 14.71H8.51001L13.51 11.71L14 10.86V4.85999L13.51 4ZM7.51001 13.5601L3.01001 10.86V5.69995L7.51001 8.15002V13.5601ZM3.27002 4.69995L8.01001 1.85999L12.75 4.69995L8.01001 7.29004L3.27002 4.69995ZM13.01 10.86L8.51001 13.5601V8.15002L13.01 5.69995V10.86Z" fill="%23B180D7"/></svg>')`,
    },
  },
  "& .cm-completionIcon-function": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.51 4L8.51001 1H7.51001L2.51001 4L2.02002 4.85999V10.86L2.51001 11.71L7.51001 14.71H8.51001L13.51 11.71L14 10.86V4.85999L13.51 4ZM7.51001 13.5601L3.01001 10.86V5.69995L7.51001 8.15002V13.5601ZM3.27002 4.69995L8.01001 1.85999L12.75 4.69995L8.01001 7.29004L3.27002 4.69995ZM13.01 10.86L8.51001 13.5601V8.15002L13.01 5.69995V10.86Z" fill="%23B180D7"/></svg>')`,
    },
  },
  "& .cm-completionIcon-constructor": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.51 4L8.51001 1H7.51001L2.51001 4L2.02002 4.85999V10.86L2.51001 11.71L7.51001 14.71H8.51001L13.51 11.71L14 10.86V4.85999L13.51 4ZM7.51001 13.5601L3.01001 10.86V5.69995L7.51001 8.15002V13.5601ZM3.27002 4.69995L8.01001 1.85999L12.75 4.69995L8.01001 7.29004L3.27002 4.69995ZM13.01 10.86L8.51001 13.5601V8.15002L13.01 5.69995V10.86Z" fill="%23B180D7"/></svg>')`,
    },
  },
  "& .cm-completionIcon-variable": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 5H4V4H1.5L1 4.5V12.5L1.5 13H4V12H2V5ZM14.5 4H12V5H14V12H12V13H14.5L15 12.5V4.5L14.5 4ZM11.76 6.56995L12 7V9.51001L11.7 9.95996L7.19995 11.96H6.73999L4.23999 10.46L4 10.03V7.53003L4.30005 7.06995L8.80005 5.06995H9.26001L11.76 6.56995ZM5 9.70996L6.5 10.61V9.28003L5 8.38V9.70996ZM5.57996 7.56006L7.03003 8.43005L10.42 6.93005L8.96997 6.06006L5.57996 7.56006ZM7.53003 10.73L11.03 9.17004V7.77002L7.53003 9.31995V10.73Z" fill="%2375BEFF"/></svg>')`,
    },
  },
  "& .cm-completionIcon-field": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.45 4.5L9.44995 2H8.55005L1.55005 5.5L1 6.39001V10.89L1.55005 11.79L6.55005 14.29H7.44995L14.45 10.79L15 9.89001V5.39001L14.45 4.5ZM6.44995 13.14L1.94995 10.89V7.17004L6.44995 9.17004V13.14ZM6.94995 8.33997L2.29004 6.22998L8.94995 2.89001L13.62 5.22998L6.94995 8.33997ZM13.95 9.89001L7.44995 13.14V9.20996L13.95 6.20996V9.89001Z" fill="%2375BEFF"/></svg>')`,
    },
  },
  "& .cm-completionIcon-typeParameter": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M11 6H10V5.5C10 5.22386 9.77616 5 9.50001 5H8.47902V10.5C8.47902 10.7761 8.70288 11 8.97902 11H9.47902V12H6.47902V11H6.97902C7.25516 11 7.47902 10.7761 7.47902 10.5V5H6.50001C6.22387 5 6.00001 5.22386 6.00001 5.5V6H5.00001V4H11V6ZM13.9142 8.0481L12.4519 6.58581L13.159 5.87871L14.9749 7.69454V8.40165L13.2071 10.1694L12.5 9.46231L13.9142 8.0481ZM3.5481 9.4623L2.08581 8.00002L3.50002 6.58581L2.79291 5.8787L1.02515 7.64647V8.35357L2.841 10.1694L3.5481 9.4623Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-constant": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 6H12V7H4V6ZM12 9H4V10H12V9Z" fill="%23C5C5C5"/><path fill-rule="evenodd" clip-rule="evenodd" d="M1 4L2 3H14L15 4V12L14 13H2L1 12V4ZM2 4V12H14V4H2Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-class": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.34 9.70998H12.05L14.72 7.04005V6.32997L13.38 5.00001H12.68L10.86 6.81007H5.86V5.56007L7.71999 3.70997V3L5.71998 1H5.00001L1 5.00001V5.70997L3 7.70998H3.71003L4.84998 6.56007V12.35L5.34998 12.85H10V13.37L11.33 14.71H12.04L14.7101 12.0401V11.33L13.37 10H12.67L10.81 11.85H5.81001V7.84999H10V8.32997L11.34 9.70998ZM13.0301 6.06007L13.66 6.68995L11.66 8.68996L11.0301 8.06007L13.0301 6.06007ZM13.0301 11.0601L13.66 11.69L11.66 13.69L11.0301 13.0601L13.0301 11.0601ZM3.34998 6.65004L2.06 5.34998L5.34998 2.06006L6.65004 3.34998L3.34998 6.65004Z" fill="%23EE9D28"/></svg>')`,
    },
  },
  "& .cm-completionIcon-interface": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.4965 4C10.655 3.9989 9.84136 4.30189 9.20557 4.85315C8.56977 5.40442 8.15465 6.16684 8.0365 7H4.9364C4.8147 6.52867 4.52533 6.11794 4.12244 5.84473C3.71955 5.57152 3.23083 5.45466 2.74792 5.51599C2.26502 5.57733 1.82106 5.81261 1.49927 6.17786C1.17747 6.54311 1 7.01322 1 7.5C1 7.98679 1.17747 8.45689 1.49927 8.82215C1.82106 9.1874 2.26502 9.42267 2.74792 9.48401C3.23083 9.54535 3.71955 9.42848 4.12244 9.15528C4.52533 8.88207 4.8147 8.47133 4.9364 8H8.0365C8.13236 8.66418 8.41717 9.28683 8.85693 9.7937C9.2967 10.3006 9.87284 10.6703 10.5168 10.8589C11.1609 11.0475 11.8455 11.047 12.4893 10.8574C13.133 10.6679 13.7087 10.2973 14.1477 9.7898C14.5867 9.28227 14.8706 8.65919 14.9655 7.99488C15.0603 7.33056 14.9621 6.65298 14.6827 6.04285C14.4034 5.43272 13.9545 4.91578 13.3895 4.55359C12.8246 4.19141 12.1675 3.99922 11.4965 4V4ZM11.4965 10C11.002 10 10.5187 9.85332 10.1075 9.57862C9.69642 9.30391 9.37599 8.91348 9.18677 8.45667C8.99755 7.99985 8.94809 7.49728 9.04456 7.01233C9.14102 6.52738 9.37901 6.08181 9.72864 5.73218C10.0783 5.38255 10.5238 5.14456 11.0088 5.0481C11.4937 4.95164 11.9963 5.00109 12.4531 5.19031C12.9099 5.37953 13.3004 5.69996 13.5751 6.11109C13.8498 6.52221 13.9965 7.00555 13.9965 7.5C13.9965 8.16304 13.7331 8.79898 13.2643 9.26783C12.7954 9.73667 12.1595 10 11.4965 10V10Z" fill="%2375BEFF"/></svg>')`,
    },
  },
  "& .cm-completionIcon-struct": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 2L1 3V6L2 7H14L15 6V3L14 2H2ZM2 3H3H13H14V4V5V6H13H3H2V5V4V3ZM1 10L2 9H5L6 10V13L5 14H2L1 13V10ZM3 10H2V11V12V13H3H4H5V12V11V10H4H3ZM10 10L11 9H14L15 10V13L14 14H11L10 13V10ZM12 10H11V11V12V13H12H13H14V12V11V10H13H12Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-event": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.41354 1.55996L8.31152 1H11.6056L12.424 2.57465L10.2356 6H12.0174L12.7363 7.69512L5.61943 15L4.01675 13.837L6.11943 10H4.89798L4 8.55996L7.41354 1.55996ZM7.78033 9L4.90054 14.3049L12.0174 7H8.31152L11.6056 2H8.31152L4.89798 9H7.78033Z" fill="%23EE9D28"/></svg>')`,
    },
  },
  "& .cm-completionIcon-operator": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M2.87289 1.10023C3.20768 1.23579 3.47545 1.498 3.61802 1.82988C3.69032 1.99959 3.72675 2.18242 3.72502 2.36688C3.72617 2.54999 3.68975 2.7314 3.61802 2.89988C3.51299 3.14567 3.33782 3.35503 3.11442 3.50177C2.89102 3.64851 2.6293 3.72612 2.36202 3.72488C2.17924 3.72592 1.99818 3.68951 1.83002 3.61788C1.58298 3.51406 1.37227 3.33932 1.22453 3.11575C1.0768 2.89219 0.998666 2.62984 1.00002 2.36188C0.99913 2.17921 1.03519 1.99825 1.10602 1.82988C1.24337 1.50314 1.50328 1.24323 1.83002 1.10588C2.16332 0.966692 2.53809 0.964661 2.87289 1.10023ZM2.57502 2.86488C2.7054 2.80913 2.80927 2.70526 2.86502 2.57488C2.8929 2.50838 2.90718 2.43698 2.90702 2.36488C2.90813 2.2654 2.88215 2.1675 2.83185 2.08167C2.78156 1.99584 2.70884 1.92531 2.62151 1.87767C2.53418 1.83002 2.43553 1.80705 2.33614 1.81121C2.23674 1.81537 2.14035 1.8465 2.05731 1.90128C1.97426 1.95606 1.9077 2.03241 1.86475 2.12215C1.8218 2.21188 1.80409 2.31161 1.81352 2.41065C1.82294 2.50968 1.85915 2.60428 1.91825 2.6843C1.97736 2.76433 2.05713 2.82675 2.14902 2.86488C2.28549 2.92089 2.43854 2.92089 2.57502 2.86488ZM6.42995 1.1095L1.10967 6.42977L1.79557 7.11567L7.11584 1.7954L6.42995 1.1095ZM11.5 8.99999H12.5V11.5H15V12.5H12.5V15H11.5V12.5H9V11.5H11.5V8.99999ZM5.76777 9.52509L6.47487 10.2322L4.70711 12L6.47487 13.7677L5.76777 14.4748L4 12.7071L2.23223 14.4748L1.52513 13.7677L3.29289 12L1.52513 10.2322L2.23223 9.52509L4 11.2929L5.76777 9.52509ZM7.11802 5.32988C7.01442 5.08268 6.83973 4.87183 6.61612 4.72406C6.3925 4.57629 6.13004 4.49826 5.86202 4.49988C5.67935 4.49899 5.49839 4.53505 5.33002 4.60588C5.00328 4.74323 4.74337 5.00314 4.60602 5.32988C4.53588 5.49478 4.49897 5.67191 4.49741 5.8511C4.49586 6.0303 4.52967 6.20804 4.59693 6.37414C4.66419 6.54024 4.76356 6.69143 4.88936 6.81906C5.01516 6.94669 5.1649 7.04823 5.33002 7.11788C5.49867 7.18848 5.67968 7.22484 5.86252 7.22484C6.04535 7.22484 6.22636 7.18848 6.39502 7.11788C6.64201 7.01388 6.8527 6.83913 7.00058 6.61563C7.14845 6.39213 7.22689 6.12987 7.22602 5.86188C7.22655 5.67905 7.1898 5.49803 7.11802 5.32988ZM6.36502 6.07488C6.33766 6.13937 6.29829 6.19808 6.24902 6.24788C6.19908 6.29724 6.14042 6.33691 6.07602 6.36488C6.00854 6.39297 5.93611 6.40725 5.86302 6.40688C5.78991 6.40744 5.71744 6.39315 5.65002 6.36488C5.58541 6.33729 5.52668 6.29757 5.47702 6.24788C5.42691 6.19856 5.38713 6.13975 5.36002 6.07488C5.30401 5.9384 5.30401 5.78536 5.36002 5.64888C5.41536 5.51846 5.51941 5.41477 5.65002 5.35988C5.71737 5.33126 5.78984 5.31663 5.86302 5.31688C5.93618 5.31685 6.0086 5.33147 6.07602 5.35988C6.14037 5.38749 6.19904 5.42682 6.24902 5.47588C6.29786 5.52603 6.33717 5.58465 6.36502 5.64888C6.3934 5.7163 6.40802 5.78872 6.40802 5.86188C6.40802 5.93503 6.3934 6.00745 6.36502 6.07488ZM14 3H10V4H14V3Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-module": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M6 2.98361V2.97184V2H5.91083C5.59743 2 5.29407 2.06161 5.00128 2.18473C4.70818 2.30798 4.44942 2.48474 4.22578 2.71498C4.00311 2.94422 3.83792 3.19498 3.73282 3.46766L3.73233 3.46898C3.63382 3.7352 3.56814 4.01201 3.53533 4.29917L3.53519 4.30053C3.50678 4.5805 3.4987 4.86844 3.51084 5.16428C3.52272 5.45379 3.52866 5.74329 3.52866 6.03279C3.52866 6.23556 3.48974 6.42594 3.412 6.60507L3.4116 6.60601C3.33687 6.78296 3.23423 6.93866 3.10317 7.07359C2.97644 7.20405 2.82466 7.31055 2.64672 7.3925C2.4706 7.46954 2.28497 7.5082 2.08917 7.5082H2V7.6V8.4V8.4918H2.08917C2.28465 8.4918 2.47001 8.53238 2.64601 8.61334L2.64742 8.61396C2.82457 8.69157 2.97577 8.79762 3.10221 8.93161L3.10412 8.93352C3.23428 9.0637 3.33659 9.21871 3.41129 9.39942L3.41201 9.40108C3.48986 9.58047 3.52866 9.76883 3.52866 9.96721C3.52866 10.2567 3.52272 10.5462 3.51084 10.8357C3.4987 11.1316 3.50677 11.4215 3.53516 11.7055L3.53535 11.7072C3.56819 11.9903 3.63387 12.265 3.73232 12.531L3.73283 12.5323C3.83793 12.805 4.00311 13.0558 4.22578 13.285C4.44942 13.5153 4.70818 13.692 5.00128 13.8153C5.29407 13.9384 5.59743 14 5.91083 14H6V13.2V13.0164H5.91083C5.71095 13.0164 5.52346 12.9777 5.34763 12.9008C5.17396 12.8191 5.02194 12.7126 4.89086 12.5818C4.76386 12.4469 4.66104 12.2911 4.58223 12.1137C4.50838 11.9346 4.47134 11.744 4.47134 11.541C4.47134 11.3127 4.4753 11.0885 4.48321 10.8686C4.49125 10.6411 4.49127 10.4195 4.48324 10.2039C4.47914 9.98246 4.46084 9.76883 4.42823 9.56312C4.39513 9.35024 4.33921 9.14757 4.26039 8.95536C4.18091 8.76157 4.07258 8.57746 3.93616 8.40298C3.82345 8.25881 3.68538 8.12462 3.52283 8C3.68538 7.87538 3.82345 7.74119 3.93616 7.59702C4.07258 7.42254 4.18091 7.23843 4.26039 7.04464C4.33913 6.85263 4.39513 6.65175 4.42826 6.44285C4.46082 6.2333 4.47914 6.01973 4.48324 5.80219C4.49127 5.58262 4.49125 5.36105 4.48321 5.13749C4.4753 4.9134 4.47134 4.68725 4.47134 4.45902C4.47134 4.26019 4.50833 4.07152 4.58238 3.89205C4.66135 3.71034 4.76421 3.55475 4.89086 3.42437C5.02193 3.28942 5.17461 3.18275 5.34802 3.10513C5.5238 3.02427 5.71113 2.98361 5.91083 2.98361H6ZM10 13.0164V13.0282V14H10.0892C10.4026 14 10.7059 13.9384 10.9987 13.8153C11.2918 13.692 11.5506 13.5153 11.7742 13.285C11.9969 13.0558 12.1621 12.805 12.2672 12.5323L12.2677 12.531C12.3662 12.2648 12.4319 11.988 12.4647 11.7008L12.4648 11.6995C12.4932 11.4195 12.5013 11.1316 12.4892 10.8357C12.4773 10.5462 12.4713 10.2567 12.4713 9.96721C12.4713 9.76444 12.5103 9.57406 12.588 9.39493L12.5884 9.39399C12.6631 9.21704 12.7658 9.06134 12.8968 8.92642C13.0236 8.79595 13.1753 8.68945 13.3533 8.6075C13.5294 8.53046 13.715 8.4918 13.9108 8.4918H14V8.4V7.6V7.5082H13.9108C13.7153 7.5082 13.53 7.46762 13.354 7.38666L13.3526 7.38604C13.1754 7.30844 13.0242 7.20238 12.8978 7.06839L12.8959 7.06648C12.7657 6.9363 12.6634 6.78129 12.5887 6.60058L12.588 6.59892C12.5101 6.41953 12.4713 6.23117 12.4713 6.03279C12.4713 5.74329 12.4773 5.45379 12.4892 5.16428C12.5013 4.86842 12.4932 4.57848 12.4648 4.29454L12.4646 4.29285C12.4318 4.00971 12.3661 3.73502 12.2677 3.46897L12.2672 3.46766C12.1621 3.19499 11.9969 2.94422 11.7742 2.71498C11.5506 2.48474 11.2918 2.30798 10.9987 2.18473C10.7059 2.06161 10.4026 2 10.0892 2H10V2.8V2.98361H10.0892C10.2891 2.98361 10.4765 3.0223 10.6524 3.09917C10.826 3.18092 10.9781 3.28736 11.1091 3.41823C11.2361 3.55305 11.339 3.70889 11.4178 3.88628C11.4916 4.0654 11.5287 4.25596 11.5287 4.45902C11.5287 4.68727 11.5247 4.91145 11.5168 5.13142C11.5088 5.35894 11.5087 5.58049 11.5168 5.79605C11.5209 6.01754 11.5392 6.23117 11.5718 6.43688C11.6049 6.64976 11.6608 6.85243 11.7396 7.04464C11.8191 7.23843 11.9274 7.42254 12.0638 7.59702C12.1765 7.74119 12.3146 7.87538 12.4772 8C12.3146 8.12462 12.1765 8.25881 12.0638 8.40298C11.9274 8.57746 11.8191 8.76157 11.7396 8.95536C11.6609 9.14737 11.6049 9.34825 11.5717 9.55715C11.5392 9.7667 11.5209 9.98027 11.5168 10.1978C11.5087 10.4174 11.5087 10.6389 11.5168 10.8625C11.5247 11.0866 11.5287 11.3128 11.5287 11.541C11.5287 11.7398 11.4917 11.9285 11.4176 12.1079C11.3386 12.2897 11.2358 12.4452 11.1091 12.5756C10.9781 12.7106 10.8254 12.8173 10.652 12.8949C10.4762 12.9757 10.2889 13.0164 10.0892 13.0164H10Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-property": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.80723 14.9754C2.57119 14.9721 2.33826 14.9211 2.12247 14.8254C1.90667 14.7297 1.71248 14.5913 1.55158 14.4186C1.2385 14.1334 1.04433 13.7408 1.00775 13.3189C0.966225 12.8828 1.09269 12.4473 1.36133 12.1013C2.56779 10.8289 4.9473 8.4494 6.67811 6.75479C6.30983 5.75887 6.32704 4.66127 6.72637 3.67739C7.05474 2.85876 7.63869 2.16805 8.39129 1.70807C8.9817 1.31706 9.66031 1.07944 10.3657 1.01673C11.0711 0.954022 11.7809 1.06819 12.4311 1.34892L13.0482 1.6162L10.1824 4.56738L11.4371 5.82582L14.3809 2.94887L14.6482 3.56788C14.8735 4.08976 14.993 4.65119 14.9997 5.21961C15.0064 5.78802 14.9002 6.35211 14.6872 6.87915C14.476 7.40029 14.1623 7.87368 13.7647 8.27122C13.5394 8.49169 13.2904 8.68653 13.0222 8.85218C12.4673 9.22275 11.8324 9.45636 11.1697 9.5338C10.5069 9.61124 9.83521 9.5303 9.20982 9.29764C8.11194 10.4113 5.37142 13.1704 3.89119 14.5522C3.59426 14.8219 3.20832 14.9726 2.80723 14.9754ZM10.7448 1.92802C10.087 1.92637 9.44359 2.12018 8.89614 2.48485C8.68265 2.6152 8.48437 2.76897 8.30498 2.9433C7.82789 3.42423 7.50926 4.03953 7.39182 4.70669C7.27438 5.37385 7.36374 6.06098 7.64792 6.67591L7.78342 6.97288L7.55048 7.20025C5.81224 8.89672 3.28146 11.4201 2.06479 12.7045C1.95646 12.8658 1.91012 13.0608 1.93435 13.2535C1.95857 13.4463 2.05171 13.6238 2.19657 13.7532C2.28005 13.8462 2.38177 13.9211 2.49541 13.9731C2.59557 14.0184 2.70383 14.043 2.81373 14.0455C2.98064 14.0413 3.14044 13.977 3.26383 13.8646C4.83687 12.3964 7.87622 9.32641 8.76807 8.42435L8.9973 8.19326L9.29242 8.32783C9.80617 8.56732 10.3731 8.66985 10.9382 8.62545C11.5033 8.58106 12.0473 8.39125 12.5174 8.07447C12.7313 7.9426 12.9296 7.78694 13.1085 7.61045C13.4183 7.30153 13.6631 6.93374 13.8286 6.52874C13.994 6.12375 14.0767 5.68974 14.0719 5.25228C14.0719 5.03662 14.0505 4.82148 14.0078 4.61007L11.4306 7.12508L8.87944 4.57759L11.3944 1.98834C11.1804 1.94674 10.9628 1.92653 10.7448 1.92802Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-value": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7 3L8 2H14L15 3V8L14 9H10V8H14V3H8V6H7V3ZM9 9V8L8 7H7H2L1 8V13L2 14H8L9 13V9ZM8 8V9V13H2V8H7H8ZM9.41421 7L9 6.58579V6H13V7H9.41421ZM9 4H13V5H9V4ZM7 10H3V11H7V10Z" fill="%2375BEFF"/></svg>')`,
    },
  },
  "& .cm-completionIcon-enum": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M14 2H8L7 3V6H8V3H14V8H10V9H14L15 8V3L14 2ZM9 6H13V7H9.41L9 6.59V6ZM7 7H2L1 8V13L2 14H8L9 13V8L8 7H7ZM8 13H2V8H8V9V13ZM3 9H7V10H3V9ZM3 11H7V12H3V11ZM9 4H13V5H9V4Z" fill="%23EE9D28"/></svg>')`,
    },
  },
  "& .cm-completionIcon-reference": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M6 5.9142L8.06065 3.85356L8.06065 3.14645L5.91421 1L5.2071 1.70711L5.25 1.75L5.24998 1.75002L5.49997 2H5.5L6.49999 3H3.5C2.83696 3 2.20107 3.2634 1.73223 3.73224C1.26339 4.20108 1 4.83696 1 5.5C1 6.16305 1.26339 6.79893 1.73223 7.26777C2.20107 7.73661 2.83696 8 3.5 8H4V7H3.5C3.10218 7 2.72064 6.84197 2.43934 6.56066C2.15804 6.27936 2 5.89783 2 5.5C2 5.10218 2.15804 4.72065 2.43934 4.43934C2.72064 4.15804 3.10218 4 3.5 4H5V4.00003H5.49996L5.49999 4H6.49999L5.2071 5.29289L5.20711 5.29291L5.2071 5.29292L5.91421 6.00003L6 5.91423V5.9142ZM11 2H8.32838L7.32839 1H12L12.71 1.29L15.71 4.29L16 5V14L15 15H6L5 14V9.00003V6.50003L6 7.34699V14H15V6H11V2ZM12 2V5H15L12 2Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-keyword": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 4H10V3H15V4ZM14 7H12V8H14V7ZM10 7H1V8H10V7ZM12 13H1V14H12V13ZM7 10H1V11H7V10ZM15 10H10V11H15V10ZM8 2V5H1V2H8ZM7 3H2V4H7V3Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-file": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.85 4.44L10.57 1.14L10.22 1H2.5L2 1.5V14.5L2.5 15H13.5L14 14.5V4.8L13.85 4.44ZM13 5H10V2L13 5ZM3 14V2H9V5.5L9.5 6H13V14H3Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-folder": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.5 3H7.70996L6.85999 2.15002L6.51001 2H1.51001L1.01001 2.5V6.5V13.5L1.51001 14H14.51L15.01 13.5V9V3.5L14.5 3ZM13.99 11.49V13H1.98999V11.49V7.48999V7H6.47998L6.82996 6.84998L7.68994 5.98999H14V7.48999L13.99 11.49ZM13.99 5H7.48999L7.14001 5.15002L6.28003 6.01001H2V3.01001H6.29004L7.14001 3.85999L7.5 4.01001H14L13.99 5Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-color": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 1.00305C6.14348 1.00305 4.36299 1.74059 3.05023 3.05334C1.73748 4.3661 1 6.14654 1 8.00305V8.43311C1.09 9.94311 2.91 10.2231 4 9.13306C4.35648 8.81625 4.82054 8.64759 5.29724 8.66162C5.77395 8.67565 6.22729 8.87127 6.56451 9.2085C6.90174 9.54572 7.09736 9.99912 7.11139 10.4758C7.12542 10.9525 6.95682 11.4166 6.64001 11.7731C5.54001 12.9331 5.85 14.843 7.44 14.973H8.03998C9.89649 14.973 11.677 14.2356 12.9897 12.9229C14.3025 11.6101 15.04 9.82954 15.04 7.97302C15.04 6.11651 14.3025 4.33607 12.9897 3.02332C11.677 1.71056 9.89649 0.973022 8.03998 0.973022L8 1.00305ZM8 14.0031H7.47998C7.34751 13.9989 7.22047 13.9495 7.12 13.863C7.04052 13.7807 6.98815 13.6761 6.96997 13.5631C6.9381 13.3682 6.95328 13.1684 7.01416 12.9806C7.07504 12.7927 7.17989 12.6222 7.32001 12.483C7.84048 11.9474 8.13165 11.2299 8.13165 10.483C8.13165 9.73615 7.84048 9.0187 7.32001 8.48303C7.05348 8.21635 6.73699 8.00481 6.38867 7.86047C6.04036 7.71614 5.66702 7.64185 5.28998 7.64185C4.91294 7.64185 4.5396 7.71614 4.19128 7.86047C3.84297 8.00481 3.52654 8.21635 3.26001 8.48303C3.15068 8.61081 3.01089 8.709 2.85358 8.76843C2.69626 8.82786 2.52649 8.84657 2.35999 8.823C2.27593 8.80694 2.19903 8.76498 2.14001 8.703C2.07131 8.6224 2.03556 8.5189 2.03998 8.41309V8.04309C2.03998 6.8564 2.39192 5.69629 3.05121 4.70959C3.7105 3.7229 4.64754 2.95388 5.7439 2.49976C6.84025 2.04563 8.04669 1.92681 9.21057 2.15833C10.3745 2.38984 11.4435 2.9613 12.2827 3.80042C13.1218 4.63953 13.6932 5.70867 13.9247 6.87256C14.1562 8.03644 14.0374 9.24275 13.5833 10.3391C13.1291 11.4355 12.3601 12.3726 11.3734 13.0319C10.3867 13.6911 9.22667 14.0431 8.03998 14.0431L8 14.0031ZM9 3.99683C9 4.54911 8.55228 4.99683 8 4.99683C7.44771 4.99683 7 4.54911 7 3.99683C7 3.44454 7.44771 2.99683 8 2.99683C8.55228 2.99683 9 3.44454 9 3.99683ZM12 11.0037C12 11.5559 11.5523 12.0037 11 12.0037C10.4477 12.0037 10 11.5559 10 11.0037C10 10.4514 10.4477 10.0037 11 10.0037C11.5523 10.0037 12 10.4514 12 11.0037ZM5 6.00415C5.55229 6.00415 6 5.55644 6 5.00415C6 4.45187 5.55229 4.00415 5 4.00415C4.44772 4.00415 4 4.45187 4 5.00415C4 5.55644 4.44772 6.00415 5 6.00415ZM12 5.00415C12 5.55644 11.5523 6.00415 11 6.00415C10.4477 6.00415 10 5.55644 10 5.00415C10 4.45187 10.4477 4.00415 11 4.00415C11.5523 4.00415 12 4.45187 12 5.00415ZM13.0001 7.99939C13.0001 8.55167 12.5524 8.99939 12.0001 8.99939C11.4478 8.99939 11.0001 8.55167 11.0001 7.99939C11.0001 7.4471 11.4478 6.99939 12.0001 6.99939C12.5524 6.99939 13.0001 7.4471 13.0001 7.99939Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-unit": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 1L3 2V14L4 15H12L13 14V2L12 1H4ZM4 3V2H12V14H4V13H6V12H4V10H8V9H4V7H6V6H4V4H8V3H4Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-snippet": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M2.5 1L2 1.5V13H3V2H14V13H15V1.5L14.5 1H2.5ZM2 15V14H3V15H2ZM5 14.0001H4V15.0001H5V14.0001ZM6 14.0001H7V15.0001H6V14.0001ZM9 14.0001H8V15.0001H9V14.0001ZM10 14.0001H11V15.0001H10V14.0001ZM15 15.0001V14.0001H14V15.0001H15ZM12 14.0001H13V15.0001H12V14.0001Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-text": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.22289 10.933C7.54863 11.1254 7.92163 11.2231 8.29989 11.215C8.63777 11.2218 8.97254 11.1492 9.27721 11.003C9.58188 10.8567 9.84792 10.6409 10.0539 10.373C10.5091 9.76519 10.7402 9.01867 10.7079 8.25998C10.7412 7.58622 10.5374 6.9221 10.1319 6.38298C9.93575 6.14161 9.68577 5.94957 9.402 5.82228C9.11824 5.69498 8.80858 5.63597 8.49789 5.64997C8.07522 5.64699 7.65994 5.76085 7.29789 5.97898C7.18304 6.04807 7.0749 6.12775 6.97489 6.21698V3.47498H5.98389V11.1H6.97889V10.756C7.05516 10.8217 7.13677 10.8809 7.22289 10.933ZM7.84981 6.70006C8.03598 6.62105 8.23807 6.58677 8.43989 6.59998C8.61257 6.59452 8.78404 6.63054 8.93994 6.70501C9.09583 6.77948 9.23161 6.89023 9.33589 7.02798C9.59253 7.39053 9.7184 7.82951 9.69289 8.27297C9.71972 8.79748 9.57969 9.31701 9.29289 9.75698C9.18822 9.91527 9.04546 10.0447 8.87773 10.1335C8.70999 10.2223 8.52264 10.2675 8.33289 10.265C8.14934 10.2732 7.9663 10.24 7.79734 10.1678C7.62838 10.0956 7.47784 9.98628 7.35689 9.84797C7.10152 9.55957 6.96501 9.18506 6.97489 8.79998V8.19998C6.96299 7.78332 7.10263 7.3765 7.36789 7.05498C7.49858 6.90064 7.66364 6.77908 7.84981 6.70006ZM3.28902 5.67499C2.97011 5.67933 2.65388 5.734 2.35202 5.83699C2.06417 5.92293 1.79347 6.05828 1.55202 6.23699L1.45202 6.31399V7.51399L1.87502 7.15499C2.24579 6.80478 2.73133 6.60146 3.24102 6.58299C3.36593 6.57164 3.4917 6.59147 3.60706 6.64068C3.72243 6.6899 3.82377 6.76697 3.90202 6.86499C4.0522 7.0971 4.13239 7.36754 4.13302 7.64399L2.90002 7.82499C2.39435 7.87781 1.91525 8.07772 1.52202 8.39999C1.36697 8.55181 1.24339 8.73271 1.15835 8.93235C1.07331 9.13199 1.02848 9.34644 1.02644 9.56343C1.0244 9.78042 1.06517 9.99568 1.14644 10.1969C1.2277 10.3981 1.34786 10.5813 1.50002 10.736C1.6687 10.8904 1.86622 11.01 2.08125 11.0879C2.29627 11.1659 2.52456 11.2005 2.75302 11.19C3.147 11.1931 3.53278 11.0774 3.86002 10.858C3.96153 10.7897 4.0572 10.7131 4.14602 10.629V11.073H5.08702V7.71499C5.12137 7.17422 4.9543 6.63988 4.61802 6.21499C4.44979 6.03285 4.24348 5.89003 4.01378 5.7967C3.78407 5.70336 3.53661 5.66181 3.28902 5.67499ZM4.14602 8.71599C4.16564 9.13435 4.02592 9.54459 3.75502 9.864C3.63689 10.0005 3.48998 10.1092 3.32486 10.1821C3.15973 10.2551 2.98049 10.2906 2.80002 10.286C2.69049 10.2945 2.58035 10.2812 2.47599 10.2469C2.37163 10.2125 2.27511 10.1579 2.19202 10.086C2.06079 9.93455 1.98856 9.74088 1.98856 9.54049C1.98856 9.34011 2.06079 9.14644 2.19202 8.99499C2.47322 8.82131 2.79233 8.71837 3.12202 8.69499L4.14202 8.54699L4.14602 8.71599ZM12.4588 11.0325C12.766 11.1638 13.0983 11.2261 13.4322 11.215C13.927 11.227 14.4153 11.1006 14.8422 10.85L14.9652 10.775L14.9782 10.768V9.61504L14.5322 9.93504C14.216 10.1592 13.8356 10.2747 13.4482 10.264C13.2497 10.2719 13.052 10.2342 12.8703 10.1538C12.6886 10.0733 12.5278 9.95232 12.4002 9.80004C12.1144 9.42453 11.9725 8.95911 12.0002 8.48804C11.9737 7.98732 12.1352 7.49475 12.4532 7.10704C12.5934 6.94105 12.7695 6.80914 12.9682 6.7213C13.167 6.63346 13.3831 6.592 13.6002 6.60004C13.9439 6.59844 14.2808 6.69525 14.5712 6.87904L15.0002 7.14404V5.97004L14.8312 5.89704C14.4626 5.73432 14.0641 5.6502 13.6612 5.65004C13.2999 5.63991 12.9406 5.70762 12.6078 5.84859C12.2749 5.98956 11.9763 6.20048 11.7322 6.46704C11.2261 7.02683 10.9581 7.76186 10.9852 8.51604C10.9567 9.22346 11.1955 9.91569 11.6542 10.455C11.8769 10.704 12.1516 10.9012 12.4588 11.0325Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-boolean": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M1 3.5L1.5 3H14.5L15 3.5L15 12.5L14.5 13H1.5L1 12.5V3.5ZM14 4H8L8 7.49297L7.89793 7.49285L7.5 7.49225V7.49237L3.92614 7.48807L6.01638 5.39784L5.30927 4.69073L2.35356 7.64645L2.35356 8.35355L5.30927 11.3093L6.01638 10.6022L3.90228 8.48807L7.8976 8.49285L8 8.493V7.50702L11.9073 7.51222L9.79289 5.39784L10.5 4.69073L13.4557 7.64645V8.35355L10.5 11.3093L9.79289 10.6022L11.8828 8.51222L8 8.50702V12H14V4Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-array": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M1.5 2L1 2.5V13.5L1.5 14H4V13H2V3H4V2H1.5ZM14.5 14L15 13.5L15 2.5L14.5 2H12V3L14 3L14 13H12V14H14.5Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-string": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 2L1 3V12L2 13H14L15 12V3L14 2H2ZM2 12V3H14V12H2ZM5.3556 8.93017H6V7.22067C6 6.40689 5.68534 6 5.05603 6C4.92098 6 4.77083 6.02421 4.6056 6.07263C4.44181 6.12104 4.3125 6.17691 4.21767 6.24022V6.90503C4.45474 6.70205 4.70474 6.60056 4.96767 6.60056C5.22917 6.60056 5.35991 6.75698 5.35991 7.06983L4.76078 7.17318C4.25359 7.25885 4 7.57914 4 8.13408C4 8.39665 4.06106 8.60708 4.18319 8.76536C4.30675 8.92179 4.47557 9 4.68966 9C4.97989 9 5.19899 8.83985 5.34698 8.51955H5.3556V8.93017ZM5.35991 7.57542V7.76816C5.35991 7.9432 5.31968 8.08845 5.23922 8.20391C5.15876 8.3175 5.0546 8.3743 4.92672 8.3743C4.83477 8.3743 4.76149 8.34264 4.7069 8.27933C4.65374 8.21415 4.62716 8.13128 4.62716 8.03073C4.62716 7.80912 4.73779 7.6797 4.95905 7.64246L5.35991 7.57542ZM7.60094 8.62622H7.59343V8.93511H7V5H7.59343V6.67683H7.60094C7.74742 6.36708 7.95587 6.2122 8.22629 6.2122C8.47418 6.2122 8.6651 6.32987 8.79906 6.56522C8.93302 6.80056 9 7.12243 9 7.53082C9 7.97383 8.92175 8.32944 8.76526 8.59766C8.60876 8.86589 8.39969 9 8.13803 9C7.90141 9 7.72238 8.87541 7.60094 8.62622ZM7.58404 7.50487V7.77742C7.58404 7.94873 7.61972 8.09063 7.69108 8.20311C7.76244 8.3156 7.85383 8.37184 7.96526 8.37184C8.10047 8.37184 8.20501 8.30002 8.27887 8.15639C8.35399 8.01103 8.39155 7.80597 8.39155 7.54121C8.39155 7.32144 8.35712 7.15012 8.28826 7.02726C8.22066 6.90266 8.12363 6.84036 7.99718 6.84036C7.87825 6.84036 7.77934 6.9018 7.70047 7.02466C7.62285 7.14752 7.58404 7.30759 7.58404 7.50487ZM11.2616 9C11.5834 9 11.8295 8.94227 12 8.82682V8.11732C11.82 8.25512 11.636 8.32402 11.448 8.32402C11.2362 8.32402 11.0697 8.25233 10.9486 8.10894C10.8276 7.96369 10.767 7.76443 10.767 7.51117C10.767 7.25047 10.8299 7.04656 10.9558 6.89944C11.0832 6.75047 11.2553 6.67598 11.4719 6.67598C11.6663 6.67598 11.8423 6.74488 12 6.88268V6.13408C11.871 6.04469 11.6623 6 11.374 6C10.9566 6 10.6229 6.1406 10.3728 6.42179C10.1243 6.70112 10 7.0838 10 7.56983C10 7.99069 10.1163 8.33426 10.3489 8.60056C10.5814 8.86685 10.8857 9 11.2616 9Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-misc": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 2H12V6C12.3415 6.03511 12.6774 6.11234 13 6.22998V1H3V9.47998L4 7.72998V2ZM6.14001 10L5 8L4 9.75L3.29004 11L1 15H9L6.70996 11L6.14001 10ZM2.71997 14L4.43994 11L5 10L5.56006 11L7.28003 14H2.71997ZM9.55552 7.58984C10.1311 7.20526 10.8077 7 11.5 7C12.4282 7 13.3185 7.36877 13.9748 8.02515C14.6312 8.68152 15 9.57174 15 10.5C15 11.1922 14.7947 11.8689 14.4101 12.4445C14.0256 13.02 13.4789 13.4686 12.8393 13.7335C12.1998 13.9984 11.4961 14.0678 10.8171 13.9327C10.1382 13.7977 9.51461 13.4643 9.02513 12.9749C8.53564 12.4854 8.20229 11.8618 8.06724 11.1829C7.93219 10.5039 8.00155 9.80019 8.26646 9.16064C8.53137 8.5211 8.97995 7.97443 9.55552 7.58984ZM10.1111 12.5786C10.5222 12.8533 11.0055 13 11.5 13C12.163 13 12.799 12.7367 13.2678 12.2678C13.7366 11.799 14 11.163 14 10.5C14 10.0055 13.8533 9.52221 13.5786 9.11108C13.3039 8.69996 12.9135 8.37953 12.4566 8.19031C11.9998 8.00109 11.4973 7.95163 11.0123 8.0481C10.5274 8.14456 10.0818 8.38255 9.73216 8.73218C9.38253 9.08181 9.14454 9.52738 9.04808 10.0123C8.95161 10.4973 9.00107 10.9998 9.19029 11.4567C9.37951 11.9135 9.69994 12.3039 10.1111 12.5786Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
  "& .cm-completionIcon-numeric": {
    "&::after": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M11 1V5H15V6H11L11 10H15V11H11V15H10V11H6V15H5L5 11H1V10H5L5 6H1V5H5L5 1H6V5H10V1H11ZM6 6L6 10H10L10 6H6Z" fill="%23C5C5C5"/></svg>')`,
    },
  },
};

export default EDITOR_THEME;
