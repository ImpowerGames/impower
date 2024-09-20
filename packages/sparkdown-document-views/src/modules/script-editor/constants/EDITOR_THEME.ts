import { StyleSpec } from "style-mod";
import EDITOR_COLORS from "./EDITOR_COLORS";

const EDITOR_THEME: {
  [selector: string]: StyleSpec;
} = {
  "*, *::before, *::after": {
    boxSizing: "border-box",
  },
  "&": {
    color: EDITOR_COLORS.foreground,
    flex: 1,
  },
  "& .cm-scroller": {
    fontFamily: "Courier Prime Sans",
    fontSize: "1rem",
    position: "relative",
    overflow: "visible",
    "&::before": {
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
  "& .cm-content": {
    caretColor: "white",
    padding: "0 0 68px 0",
    minHeight: "100%",
  },
  "& label:has(input[type='checkbox'])": {
    cursor: "pointer",
  },
  "& button": {
    cursor: "pointer",
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
    "&:hover": {
      borderColor: EDITOR_COLORS.borderHover,
    },
    "&:focus-visible": {
      outline: "none",
      borderColor: EDITOR_COLORS.selected,
    },
    "&::placeholder": {
      color: EDITOR_COLORS.placeholder,
    },
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
  "& .cm-activeLine": {
    backgroundColor: "#FFFFFF0F",
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
    // Top panels should cover up panel header
    top: "48px !important",
    "& .cm-panel.cm-search": {
      marginTop: "-48px",
    },
    "&::before": {
      content: "''",
      position: "absolute",
      top: "-48px",
      bottom: "0",
      left: "0",
      right: "0",
      backgroundColor: EDITOR_COLORS.panel,
    },
    "&::after": {
      content: "''",
      position: "absolute",
      bottom: "0",
      left: "0",
      right: "0",
      borderBottom: `1px solid ${EDITOR_COLORS.separator}`,
    },
  },
  "& .cm-panel.cm-search": {
    backgroundColor: EDITOR_COLORS.panel,
    float: "right",
    width: "100%",
    position: "relative",
    padding: "8px 8px 8px 56px",
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
      backgroundColor: "transparent",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="${encodeURIComponent(
        EDITOR_COLORS.closeButton
      )}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M 12 12 L 6 6 M 12 12 L 18 6 M 12 12 L 18 18 M 12 12 L 6 18"></path></svg>')`,
      "&:hover": {
        backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="${encodeURIComponent(
          EDITOR_COLORS.closeButtonHover
        )}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M 12 12 L 6 6 M 12 12 L 18 6 M 12 12 L 18 18 M 12 12 L 6 18"></path></svg>')`,
      },
    },
    "& button:hover": {
      backgroundColor: EDITOR_COLORS.buttonHover,
      color: "white",
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
      backgroundColor: "transparent",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      margin: "0",
      "&:hover": {
        backgroundColor: EDITOR_COLORS.buttonHover,
        color: "white",
      },
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
    "& label:has(input[type='checkbox']):hover::before": {
      backgroundColor: EDITOR_COLORS.buttonHover,
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
      width: "25px",
      height: "25px",
      right: "10px",
      background: "none",
      backgroundColor: "transparent",
    },
    "& button:hover": {
      backgroundColor: EDITOR_COLORS.buttonHover,
    },
  },
  "& .cm-lintRange": {
    backgroundSize: "auto",
  },
  "& .cm-lintRange-active": {
    backgroundColor: "#ffdd991a",
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
  },
  "& .cm-snippetFieldPosition": {
    border: "none",
  },
  "& .cm-completionIcon-choice_plus": {
    "&::after": {
      content: "'⊕'",
      color: EDITOR_COLORS.propertyName,
    },
  },
  "& .cm-completionIcon-choice_minus": {
    "&::after": {
      content: "'⊖'",
      color: EDITOR_COLORS.propertyName,
    },
  },
  "& .cm-completionIcon-section": {
    "&::after": { content: "'#'", color: EDITOR_COLORS.sectionNameDefinition },
  },
  "& .cm-completionIcon-ancestor": {
    "&::after": {
      content: "'⮤'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-parent": {
    "&::after": {
      content: "'⬑'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-child": {
    "&::after": {
      content: "'⤵'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-first_sibling": {
    "&::after": {
      content: "'↱'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-last_sibling": {
    "&::after": {
      content: "'↳'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-next": {
    "&::after": {
      content: "'⭳'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-top": {
    "&::after": {
      content: "'⭱'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-quit": {
    "&::after": { content: "'×'", color: EDITOR_COLORS.sectionNameDefinition },
  },
  "& .cm-completionIcon-keyword": {
    "&::after": {
      content: "'☱'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-option": {
    "&::after": {
      content: "'☱'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-string": {
    "&::after": {
      content: `'α'`,
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-number": {
    "&::after": {
      content: "'#'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-boolean": {
    "&::after": {
      content: "'?'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-array": {
    "&::after": {
      content: `'[]'`,
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-object": {
    "&::after": {
      content: "'{}'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-type": {
    "&::after": {
      content: "'𝑡'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-variable": {
    "&::after": {
      content: "'𝑥'",
      color: EDITOR_COLORS.propertyName,
    },
  },
  "& .cm-completionIcon-property": {
    "&::after": {
      content: "'ρ'",
      color: EDITOR_COLORS.variableName,
    },
  },
  "& .cm-completionIcon-parameter": {
    "&::after": {
      content: "'ρ'",
      color: EDITOR_COLORS.variableName,
    },
  },
  "& .cm-completionIcon-asset": {
    "&::after": { content: "'Ꭿ'", color: EDITOR_COLORS.asset },
  },
  "& .cm-completionIcon-struct": {
    "&::after": { content: "'ʂ'", color: EDITOR_COLORS.struct },
  },
  "& .cm-completionIcon-tag": {
    "&::after": { content: "'Ť'", color: EDITOR_COLORS.tag },
  },
  "& .cm-completionIcon-method": {
    "&::after": {
      content: "'m'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-function": {
    "&::after": {
      content: "'ƒ'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-character": {
    "&::after": { content: "'𝐶'", color: EDITOR_COLORS.typeName },
  },
  "& .cm-completionIcon-transition": {
    "&::after": { content: "'Ŧ'", color: EDITOR_COLORS.transition },
  },
  "& .cm-completionIcon-scene": {
    "&::after": { content: "'Տ'", color: EDITOR_COLORS.scene },
  },
  "& .cm-completionIcon-condition": {
    "&::after": { content: "'✓'", color: EDITOR_COLORS.controlKeyword },
  },
  "& .cm-completionIcon-module": {
    "&::after": { content: "'⩀'", color: EDITOR_COLORS.propertyName },
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
    background: EDITOR_COLORS.selected,
  },
  "& .cm-valueInfo": {
    fontFamily: "monospace",
  },
  "& .cm-highlightSpace": {
    "&::before": {
      opacity: "0.3",
    },
  },
};

export default EDITOR_THEME;
