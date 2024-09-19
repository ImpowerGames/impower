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
  "& button:hover": {
    backgroundColor: EDITOR_COLORS.hover,
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
  "& .cm-panel": {
    borderTop: `1px solid ${EDITOR_COLORS.border}`,
    "& button[name='close']": {
      color: "#FFFFFFB3",
    },
    "& button[name='close']:hover": {
      color: "white",
    },
  },
  "& .cm-search.cm-panel": {
    position: "relative",
    padding: "4px",
    "& button:not([name='close'])": {
      display: "inline-block",
      width: "22px",
      height: "22px",
      verticalAlign: "middle",
      borderRadius: "5px",
      textIndent: "-99999em",
      overflow: "hidden",
      border: "none",
      backgroundColor: "transparent",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      "&:hover": {
        backgroundColor: EDITOR_COLORS.hover,
      },
    },
    "& button[name='next']": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
        EDITOR_COLORS.foreground
      )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.147 9l5 5h.707l5-5-.707-.707L9 12.439V2H8v10.44L3.854 8.292 3.147 9z"/></svg>')`,
    },
    "& button[name='prev']": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
        EDITOR_COLORS.foreground
      )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.854 7l-5-5h-.707l-5 5 .707.707L8 3.561V14h1V3.56l4.146 4.147.708-.707z"/></svg>')`,
    },
    "& button[name='select']": {
      display: "none",
    },
    "& button[name='replace']": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
        EDITOR_COLORS.foreground
      )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.221 3.739l2.261 2.269L7.7 3.784l-.7-.7-1.012 1.007-.008-1.6a.523.523 0 0 1 .5-.526H8V1H6.48A1.482 1.482 0 0 0 5 2.489V4.1L3.927 3.033l-.706.706zm6.67 1.794h.01c.183.311.451.467.806.467.393 0 .706-.168.94-.503.236-.335.353-.78.353-1.333 0-.511-.1-.913-.301-1.207-.201-.295-.488-.442-.86-.442-.405 0-.718.194-.938.581h-.01V1H9v4.919h.89v-.386zm-.015-1.061v-.34c0-.248.058-.448.175-.601a.54.54 0 0 1 .445-.23.49.49 0 0 1 .436.233c.104.154.155.368.155.643 0 .33-.056.587-.169.768a.524.524 0 0 1-.47.27.495.495 0 0 1-.411-.211.853.853 0 0 1-.16-.532zM9 12.769c-.256.154-.625.231-1.108.231-.563 0-1.02-.178-1.369-.533-.349-.355-.523-.813-.523-1.374 0-.648.186-1.158.56-1.53.374-.376.875-.563 1.5-.563.433 0 .746.06.94.179v.998a1.26 1.26 0 0 0-.792-.276c-.325 0-.583.1-.774.298-.19.196-.283.468-.283.816 0 .338.09.603.272.797.182.191.431.287.749.287.282 0 .558-.092.828-.276v.946zM4 7L3 8v6l1 1h7l1-1V8l-1-1H4zm0 1h7v6H4V8z"/></svg>')`,
    },
    "& button[name='replaceAll']": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
        EDITOR_COLORS.foreground
      )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.6 2.677c.147-.31.356-.465.626-.465.248 0 .44.118.573.353.134.236.201.557.201.966 0 .443-.078.798-.235 1.067-.156.268-.365.402-.627.402-.237 0-.416-.125-.537-.374h-.008v.31H11V1h.593v1.677h.008zm-.016 1.1a.78.78 0 0 0 .107.426c.071.113.163.169.274.169.136 0 .24-.072.314-.216.075-.145.113-.35.113-.615 0-.22-.035-.39-.104-.514-.067-.124-.164-.187-.29-.187-.12 0-.219.062-.297.185a.886.886 0 0 0-.117.48v.272zM4.12 7.695L2 5.568l.662-.662 1.006 1v-1.51A1.39 1.39 0 0 1 5.055 3H7.4v.905H5.055a.49.49 0 0 0-.468.493l.007 1.5.949-.944.656.656-2.08 2.085zM9.356 4.93H10V3.22C10 2.408 9.685 2 9.056 2c-.135 0-.285.024-.45.073a1.444 1.444 0 0 0-.388.167v.665c.237-.203.487-.304.75-.304.261 0 .392.156.392.469l-.6.103c-.506.086-.76.406-.76.961 0 .263.061.473.183.631A.61.61 0 0 0 8.69 5c.29 0 .509-.16.657-.48h.009v.41zm.004-1.355v.193a.75.75 0 0 1-.12.436.368.368 0 0 1-.313.17.276.276 0 0 1-.22-.095.38.38 0 0 1-.08-.248c0-.222.11-.351.332-.389l.4-.067zM7 12.93h-.644v-.41h-.009c-.148.32-.367.48-.657.48a.61.61 0 0 1-.507-.235c-.122-.158-.183-.368-.183-.63 0-.556.254-.876.76-.962l.6-.103c0-.313-.13-.47-.392-.47-.263 0-.513.102-.75.305v-.665c.095-.063.224-.119.388-.167.165-.049.315-.073.45-.073.63 0 .944.407.944 1.22v1.71zm-.64-1.162v-.193l-.4.068c-.222.037-.333.166-.333.388 0 .1.027.183.08.248a.276.276 0 0 0 .22.095.368.368 0 0 0 .312-.17c.08-.116.12-.26.12-.436zM9.262 13c.321 0 .568-.058.738-.173v-.71a.9.9 0 0 1-.552.207.619.619 0 0 1-.5-.215c-.12-.145-.181-.345-.181-.598 0-.26.063-.464.189-.612a.644.644 0 0 1 .516-.223c.194 0 .37.069.528.207v-.749c-.129-.09-.338-.134-.626-.134-.417 0-.751.14-1.001.422-.249.28-.373.662-.373 1.148 0 .42.116.764.349 1.03.232.267.537.4.913.4zM2 9l1-1h9l1 1v5l-1 1H3l-1-1V9zm1 0v5h9V9H3zm3-2l1-1h7l1 1v5l-1 1V7H6z"/></svg>')`,
    },
    "& input[name='search']": {
      paddingRight: "64px",
    },
    "& label:has(input[type='checkbox'])": {
      display: "inline-block",
      width: "18px",
      height: "18px",
      verticalAlign: "middle",
      borderRadius: "5px",
      textIndent: "-99999em",
      overflow: "hidden",
      position: "absolute",
      top: "8px",
      "& input": {
        display: "none",
      },
      "&:before": {
        content: "''",
        position: "absolute",
        inset: "0",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      },
    },
    "& label:has(input[type='checkbox']:checked)": {
      backgroundColor: EDITOR_COLORS.focus,
    },
    "& label:has(input[name='case'])": {
      left: "166px",
      "&:before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.foreground
        )}"><path d="M8.85352 11.7021H7.85449L7.03809 9.54297H3.77246L3.00439 11.7021H2L4.9541 4H5.88867L8.85352 11.7021ZM6.74268 8.73193L5.53418 5.4502C5.49479 5.34277 5.4554 5.1709 5.41602 4.93457H5.39453C5.35872 5.15299 5.31755 5.32487 5.271 5.4502L4.07324 8.73193H6.74268Z"/><path d="M13.756 11.7021H12.8752V10.8428H12.8537C12.4706 11.5016 11.9066 11.8311 11.1618 11.8311C10.6139 11.8311 10.1843 11.686 9.87273 11.396C9.56479 11.106 9.41082 10.721 9.41082 10.2412C9.41082 9.21354 10.016 8.61556 11.2262 8.44727L12.8752 8.21631C12.8752 7.28174 12.4974 6.81445 11.7419 6.81445C11.0794 6.81445 10.4815 7.04004 9.94793 7.49121V6.58887C10.4886 6.24512 11.1117 6.07324 11.8171 6.07324C13.1097 6.07324 13.756 6.75716 13.756 8.125V11.7021ZM12.8752 8.91992L11.5485 9.10254C11.1403 9.15983 10.8324 9.26188 10.6247 9.40869C10.417 9.55192 10.3132 9.80794 10.3132 10.1768C10.3132 10.4453 10.4081 10.6655 10.5978 10.8374C10.7912 11.0057 11.0472 11.0898 11.3659 11.0898C11.8027 11.0898 12.1626 10.9377 12.4455 10.6333C12.7319 10.3254 12.8752 9.93685 12.8752 9.46777V8.91992Z"/></svg>')`,
      },
    },
    "& label:has(input[name='case']:checked)": {
      "&:before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.white
        )}"><path d="M8.85352 11.7021H7.85449L7.03809 9.54297H3.77246L3.00439 11.7021H2L4.9541 4H5.88867L8.85352 11.7021ZM6.74268 8.73193L5.53418 5.4502C5.49479 5.34277 5.4554 5.1709 5.41602 4.93457H5.39453C5.35872 5.15299 5.31755 5.32487 5.271 5.4502L4.07324 8.73193H6.74268Z"/><path d="M13.756 11.7021H12.8752V10.8428H12.8537C12.4706 11.5016 11.9066 11.8311 11.1618 11.8311C10.6139 11.8311 10.1843 11.686 9.87273 11.396C9.56479 11.106 9.41082 10.721 9.41082 10.2412C9.41082 9.21354 10.016 8.61556 11.2262 8.44727L12.8752 8.21631C12.8752 7.28174 12.4974 6.81445 11.7419 6.81445C11.0794 6.81445 10.4815 7.04004 9.94793 7.49121V6.58887C10.4886 6.24512 11.1117 6.07324 11.8171 6.07324C13.1097 6.07324 13.756 6.75716 13.756 8.125V11.7021ZM12.8752 8.91992L11.5485 9.10254C11.1403 9.15983 10.8324 9.26188 10.6247 9.40869C10.417 9.55192 10.3132 9.80794 10.3132 10.1768C10.3132 10.4453 10.4081 10.6655 10.5978 10.8374C10.7912 11.0057 11.0472 11.0898 11.3659 11.0898C11.8027 11.0898 12.1626 10.9377 12.4455 10.6333C12.7319 10.3254 12.8752 9.93685 12.8752 9.46777V8.91992Z"/></svg>')`,
      },
    },
    "& label:has(input[name='word'])": {
      left: "187px",
      "&:before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.foreground
        )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 11H1V13H15V11H16V14H15H1H0V11Z"/><path d="M6.84048 11H5.95963V10.1406H5.93814C5.555 10.7995 4.99104 11.1289 4.24625 11.1289C3.69839 11.1289 3.26871 10.9839 2.95718 10.6938C2.64924 10.4038 2.49527 10.0189 2.49527 9.53906C2.49527 8.51139 3.10041 7.91341 4.3107 7.74512L5.95963 7.51416C5.95963 6.57959 5.58186 6.1123 4.82632 6.1123C4.16389 6.1123 3.56591 6.33789 3.03238 6.78906V5.88672C3.57307 5.54297 4.19612 5.37109 4.90152 5.37109C6.19416 5.37109 6.84048 6.05501 6.84048 7.42285V11ZM5.95963 8.21777L4.63297 8.40039C4.22476 8.45768 3.91682 8.55973 3.70914 8.70654C3.50145 8.84977 3.39761 9.10579 3.39761 9.47461C3.39761 9.74316 3.4925 9.96338 3.68228 10.1353C3.87564 10.3035 4.13166 10.3877 4.45035 10.3877C4.8872 10.3877 5.24706 10.2355 5.52994 9.93115C5.8164 9.62321 5.95963 9.2347 5.95963 8.76562V8.21777Z"/><path d="M9.3475 10.2051H9.32601V11H8.44515V2.85742H9.32601V6.4668H9.3475C9.78076 5.73633 10.4146 5.37109 11.2489 5.37109C11.9543 5.37109 12.5057 5.61816 12.9032 6.1123C13.3042 6.60286 13.5047 7.26172 13.5047 8.08887C13.5047 9.00911 13.2809 9.74674 12.8333 10.3018C12.3857 10.8532 11.7734 11.1289 10.9964 11.1289C10.2695 11.1289 9.71989 10.821 9.3475 10.2051ZM9.32601 7.98682V8.75488C9.32601 9.20964 9.47282 9.59635 9.76644 9.91504C10.0636 10.2301 10.4396 10.3877 10.8944 10.3877C11.4279 10.3877 11.8451 10.1836 12.1458 9.77539C12.4502 9.36719 12.6024 8.79964 12.6024 8.07275C12.6024 7.46045 12.4609 6.98063 12.1781 6.6333C11.8952 6.28597 11.512 6.1123 11.0286 6.1123C10.5166 6.1123 10.1048 6.29134 9.7933 6.64941C9.48177 7.00391 9.32601 7.44971 9.32601 7.98682Z"/></svg>')`,
      },
    },
    "& label:has(input[name='word']:checked)": {
      "&:before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.white
        )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 11H1V13H15V11H16V14H15H1H0V11Z"/><path d="M6.84048 11H5.95963V10.1406H5.93814C5.555 10.7995 4.99104 11.1289 4.24625 11.1289C3.69839 11.1289 3.26871 10.9839 2.95718 10.6938C2.64924 10.4038 2.49527 10.0189 2.49527 9.53906C2.49527 8.51139 3.10041 7.91341 4.3107 7.74512L5.95963 7.51416C5.95963 6.57959 5.58186 6.1123 4.82632 6.1123C4.16389 6.1123 3.56591 6.33789 3.03238 6.78906V5.88672C3.57307 5.54297 4.19612 5.37109 4.90152 5.37109C6.19416 5.37109 6.84048 6.05501 6.84048 7.42285V11ZM5.95963 8.21777L4.63297 8.40039C4.22476 8.45768 3.91682 8.55973 3.70914 8.70654C3.50145 8.84977 3.39761 9.10579 3.39761 9.47461C3.39761 9.74316 3.4925 9.96338 3.68228 10.1353C3.87564 10.3035 4.13166 10.3877 4.45035 10.3877C4.8872 10.3877 5.24706 10.2355 5.52994 9.93115C5.8164 9.62321 5.95963 9.2347 5.95963 8.76562V8.21777Z"/><path d="M9.3475 10.2051H9.32601V11H8.44515V2.85742H9.32601V6.4668H9.3475C9.78076 5.73633 10.4146 5.37109 11.2489 5.37109C11.9543 5.37109 12.5057 5.61816 12.9032 6.1123C13.3042 6.60286 13.5047 7.26172 13.5047 8.08887C13.5047 9.00911 13.2809 9.74674 12.8333 10.3018C12.3857 10.8532 11.7734 11.1289 10.9964 11.1289C10.2695 11.1289 9.71989 10.821 9.3475 10.2051ZM9.32601 7.98682V8.75488C9.32601 9.20964 9.47282 9.59635 9.76644 9.91504C10.0636 10.2301 10.4396 10.3877 10.8944 10.3877C11.4279 10.3877 11.8451 10.1836 12.1458 9.77539C12.4502 9.36719 12.6024 8.79964 12.6024 8.07275C12.6024 7.46045 12.4609 6.98063 12.1781 6.6333C11.8952 6.28597 11.512 6.1123 11.0286 6.1123C10.5166 6.1123 10.1048 6.29134 9.7933 6.64941C9.48177 7.00391 9.32601 7.44971 9.32601 7.98682Z"/></svg>')`,
      },
    },
    "& label:has(input[name='re'])": {
      left: "208px",
      "&:before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.foreground
        )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.012 2h.976v3.113l2.56-1.557.486.885L11.47 6l2.564 1.559-.485.885-2.561-1.557V10h-.976V6.887l-2.56 1.557-.486-.885L9.53 6 6.966 4.441l.485-.885 2.561 1.557V2zM2 10h4v4H2v-4z"/></svg>')`,
      },
    },
    "& label:has(input[name='re']:checked)": {
      "&:before": {
        backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${encodeURIComponent(
          EDITOR_COLORS.white
        )}"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.012 2h.976v3.113l2.56-1.557.486.885L11.47 6l2.564 1.559-.485.885-2.561-1.557V10h-.976V6.887l-2.56 1.557-.486-.885L9.53 6 6.966 4.441l.485-.885 2.561 1.557V2zM2 10h4v4H2v-4z"/></svg>')`,
      },
    },
  },
  "& .cm-textfield": {
    minHeight: "25px",
    width: "225px",
    borderRadius: "3px",
    fontSize: "13px",
    "&:focus-visible": {
      outline: "none",
      border: `1px solid ${EDITOR_COLORS.focus}`,
    },
  },
  "& .cm-panel.cm-panel-lint": {
    "& ul": {
      "& [aria-selected]": {
        background_fallback: "#bdf",
        backgroundColor: "Highlight",
        color_fallback: "white",
        color: "HighlightText",
      },
    },
    "& button[name='close']": {
      right: "4px",
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
    "&:after": {
      content: "'⊕'",
      color: EDITOR_COLORS.propertyName,
    },
  },
  "& .cm-completionIcon-choice_minus": {
    "&:after": {
      content: "'⊖'",
      color: EDITOR_COLORS.propertyName,
    },
  },
  "& .cm-completionIcon-section": {
    "&:after": { content: "'#'", color: EDITOR_COLORS.sectionNameDefinition },
  },
  "& .cm-completionIcon-ancestor": {
    "&:after": {
      content: "'⮤'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-parent": {
    "&:after": {
      content: "'⬑'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-child": {
    "&:after": {
      content: "'⤵'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-first_sibling": {
    "&:after": {
      content: "'↱'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-last_sibling": {
    "&:after": {
      content: "'↳'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-next": {
    "&:after": {
      content: "'⭳'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-top": {
    "&:after": {
      content: "'⭱'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-quit": {
    "&:after": { content: "'×'", color: EDITOR_COLORS.sectionNameDefinition },
  },
  "& .cm-completionIcon-keyword": {
    "&:after": {
      content: "'☱'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-option": {
    "&:after": {
      content: "'☱'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-string": {
    "&:after": {
      content: `'α'`,
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-number": {
    "&:after": {
      content: "'#'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-boolean": {
    "&:after": {
      content: "'?'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-array": {
    "&:after": {
      content: `'[]'`,
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-object": {
    "&:after": {
      content: "'{}'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-type": {
    "&:after": {
      content: "'𝑡'",
      color: EDITOR_COLORS.keyword,
    },
  },
  "& .cm-completionIcon-variable": {
    "&:after": {
      content: "'𝑥'",
      color: EDITOR_COLORS.propertyName,
    },
  },
  "& .cm-completionIcon-property": {
    "&:after": {
      content: "'ρ'",
      color: EDITOR_COLORS.variableName,
    },
  },
  "& .cm-completionIcon-parameter": {
    "&:after": {
      content: "'ρ'",
      color: EDITOR_COLORS.variableName,
    },
  },
  "& .cm-completionIcon-asset": {
    "&:after": { content: "'Ꭿ'", color: EDITOR_COLORS.asset },
  },
  "& .cm-completionIcon-struct": {
    "&:after": { content: "'ʂ'", color: EDITOR_COLORS.struct },
  },
  "& .cm-completionIcon-tag": {
    "&:after": { content: "'Ť'", color: EDITOR_COLORS.tag },
  },
  "& .cm-completionIcon-method": {
    "&:after": {
      content: "'m'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-function": {
    "&:after": {
      content: "'ƒ'",
      color: EDITOR_COLORS.sectionNameDefinition,
    },
  },
  "& .cm-completionIcon-character": {
    "&:after": { content: "'𝐶'", color: EDITOR_COLORS.typeName },
  },
  "& .cm-completionIcon-transition": {
    "&:after": { content: "'Ŧ'", color: EDITOR_COLORS.transition },
  },
  "& .cm-completionIcon-scene": {
    "&:after": { content: "'Տ'", color: EDITOR_COLORS.scene },
  },
  "& .cm-completionIcon-condition": {
    "&:after": { content: "'✓'", color: EDITOR_COLORS.controlKeyword },
  },
  "& .cm-completionIcon-module": {
    "&:after": { content: "'⩀'", color: EDITOR_COLORS.propertyName },
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
    "&:before": {
      opacity: "0.3",
    },
  },
};

export default EDITOR_THEME;
