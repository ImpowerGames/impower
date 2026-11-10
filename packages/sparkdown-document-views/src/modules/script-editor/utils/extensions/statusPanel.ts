import { Diagnostic, forEachDiagnostic } from "@codemirror/lint";
import { EditorView, Panel, showPanel, ViewUpdate } from "@codemirror/view";
import { coarsePointer } from "@impower/codemirror-vscode-lsp-client/src";
import { iconMasks } from "@impower/impower-ui/icon-masks";

export class StatusPanel implements Panel {
  dom: HTMLElement;

  diagnosticContextContainer: HTMLDivElement;

  diagnosticSummaryContainer: HTMLDivElement;

  activeDiagnosticMessage: HTMLSpanElement;

  nextDiagnosticButton: HTMLButtonElement;

  diagnosticNavigationContainer: HTMLDivElement;

  prevDiagnosticButton: HTMLButtonElement;

  diagnosticCounterLabel: HTMLSpanElement;

  activeDiagnosticIcon: HTMLSpanElement;

  private lastActiveIndex: number = -1;

  constructor(readonly view: EditorView) {
    this.dom = document.createElement("div");
    this.dom.className = "cm-toolbar cm-status";

    this.diagnosticContextContainer = this.dom.appendChild(
      document.createElement("div"),
    );
    this.diagnosticContextContainer.className = "cm-diagnosticContext";
    this.diagnosticContextContainer.style.display = "none";

    this.diagnosticSummaryContainer =
      this.diagnosticContextContainer.appendChild(
        document.createElement("div"),
      );
    this.diagnosticSummaryContainer.className = "cm-diagnosticSummary";

    this.diagnosticNavigationContainer =
      this.diagnosticContextContainer.appendChild(
        document.createElement("div"),
      );
    this.diagnosticNavigationContainer.className = "cm-diagnosticNavigation";

    this.activeDiagnosticIcon = this.diagnosticSummaryContainer.appendChild(
      document.createElement("span"),
    );
    this.activeDiagnosticIcon.className =
      "cm-statusLabel cm-activeDiagnosticIcon";

    this.activeDiagnosticMessage = this.diagnosticSummaryContainer.appendChild(
      document.createElement("span"),
    );
    this.activeDiagnosticMessage.className =
      "cm-statusLabel cm-activeDiagnosticMessage";

    this.prevDiagnosticButton = this.diagnosticNavigationContainer.appendChild(
      document.createElement("button"),
    );
    this.prevDiagnosticButton.className = "cm-button cm-icon-button";
    this.prevDiagnosticButton.onclick = () => this.navigateDiagnostic(-1, true);
    const prevIcon = this.prevDiagnosticButton.appendChild(
      document.createElement("span"),
    );
    prevIcon.className = "cm-statusIcon cm-navLeftIcon";

    this.diagnosticCounterLabel =
      this.diagnosticNavigationContainer.appendChild(
        document.createElement("span"),
      );
    this.diagnosticCounterLabel.className =
      "cm-statusLabel cm-diagnosticCounter";

    this.nextDiagnosticButton = this.diagnosticNavigationContainer.appendChild(
      document.createElement("button"),
    );
    this.nextDiagnosticButton.className = "cm-button cm-icon-button";
    this.nextDiagnosticButton.onclick = () => this.navigateDiagnostic(1, true);
    const nextIcon = this.nextDiagnosticButton.appendChild(
      document.createElement("span"),
    );
    nextIcon.className = "cm-statusIcon cm-navRightIcon";
  }

  private getSortedDiagnostics(): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    forEachDiagnostic(this.view.state, (d) => diagnostics.push(d));
    diagnostics.sort(
      (a, b) =>
        a.from - b.from || a.to - b.to || a.message.localeCompare(b.message),
    );
    return diagnostics;
  }

  navigateDiagnostic(direction: 1 | -1, takeFocus: boolean) {
    const diagnostics = this.getSortedDiagnostics();
    if (diagnostics.length === 0) return;

    const cursorPos = this.view.state.selection.main.head;

    const currentMatches = diagnostics.filter(
      (d) => cursorPos >= d.from && cursorPos <= d.to,
    );

    let targetIndex = 0;

    if (currentMatches.length > 0) {
      const firstMatchIndex = diagnostics.indexOf(currentMatches[0]!);
      const relativeIndex =
        this.lastActiveIndex !== -1 ? this.lastActiveIndex : firstMatchIndex;
      targetIndex =
        (relativeIndex + direction + diagnostics.length) % diagnostics.length;
    } else {
      if (direction === 1) {
        targetIndex = diagnostics.findIndex((d) => d.from > cursorPos);
        if (targetIndex === -1) targetIndex = 0;
      } else {
        for (let i = diagnostics.length - 1; i >= 0; i--) {
          if (diagnostics[i]!.to < cursorPos) {
            targetIndex = i;
            break;
          }
        }
        if (targetIndex === -1) targetIndex = diagnostics.length - 1;
      }
    }

    const target = diagnostics[targetIndex]!;
    this.lastActiveIndex = targetIndex;

    if (takeFocus) this.view.focus();
    this.view.dispatch({
      selection: { anchor: target.from, head: target.to },
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
  }

  updateStatus(update: ViewUpdate) {
    const isContextualView = update.state.facet(coarsePointer) && update.view.hasFocus;

    const diagnostics = this.getSortedDiagnostics();

    const cursorPos = update.state.selection.main.head;

    const matches = diagnostics.filter(
      (d) => cursorPos >= d.from && cursorPos <= d.to,
    );

    let activeDiagnostic: Diagnostic | undefined;
    let activeIdx = -1;

    if (matches.length > 0) {
      activeIdx =
        this.lastActiveIndex !== -1 &&
        matches.includes(diagnostics[this.lastActiveIndex]!)
          ? this.lastActiveIndex
          : diagnostics.indexOf(matches[0]!);

      activeDiagnostic = diagnostics[activeIdx];
      this.lastActiveIndex = activeIdx;
    } else {
      this.lastActiveIndex = -1;
    }

    if (isContextualView && activeDiagnostic) {
      this.diagnosticContextContainer.style.display = "flex";
      this.activeDiagnosticMessage.textContent =
        activeDiagnostic.message.split("\n")[0]!;
      const severity = activeDiagnostic.severity || "info";
      const activeDiagnosticIconImage =
        severity === "error"
          ? iconMasks["error"]
          : severity === "warning"
            ? iconMasks["warning"]
            : iconMasks["info"];
      this.activeDiagnosticIcon.style.maskImage = activeDiagnosticIconImage;
      this.activeDiagnosticIcon.style.webkitMaskImage =
        activeDiagnosticIconImage;
      this.diagnosticContextContainer.classList.toggle("error", false);
      this.diagnosticContextContainer.classList.toggle("warning", false);
      this.diagnosticContextContainer.classList.toggle("info", false);
      this.diagnosticContextContainer.classList.toggle(severity, true);

      const hasMultipleTotal = diagnostics.length > 1;
      this.diagnosticCounterLabel.textContent = `${activeIdx + 1}/${diagnostics.length}`;

      this.prevDiagnosticButton.style.display = hasMultipleTotal
        ? "flex"
        : "none";
      this.nextDiagnosticButton.style.display = hasMultipleTotal
        ? "flex"
        : "none";
      this.diagnosticCounterLabel.style.display = hasMultipleTotal
        ? "inline-block"
        : "none";
    } else {
      this.diagnosticContextContainer.style.display = "none";
    }
    this.dom.hidden = !(isContextualView && activeDiagnostic);
  }

  update(update: ViewUpdate) {
    this.updateStatus(update);
  }
}

const statusPanelTheme = EditorView.baseTheme({
  "&.keyboard-open .cm-panels-bottom > :not(.cm-toolbar), & .cm-panels-bottom > :not(.cm-toolbar):not(:focus-within)":
    {
      position: "fixed",
      opacity: "0",
      top: "-10000px",
    },

  ".cm-status": {
    height: "28px",
    color: "var(--editor-status-ink)",
    backgroundColor: "var(--panel)",
    display: "flex",
    justifyContent: "space-between",
    "& .cm-diagnosticContext": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      overflow: "hidden",
      flex: 1,
      "&.error": {
        color: "var(--editor-problem-error)",
      },
      "&.warning": {
        color: "var(--editor-problem-warning)",
      },
      "&.info": {
        color: "var(--editor-problem-info)",
      },
    },
    "& .cm-button": {
      height: "100%",
      border: "none",
      backgroundImage: "none",
      whiteSpace: "pre",
      padding: "1px 8px",
      fontSize: "14px",
      textAlign: "center",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      position: "relative",
    },
  },
  "& .cm-statusIcon": {
    display: "inline-block",
    width: "16px",
    height: "16px",
    verticalAlign: "middle",
    backgroundColor: "transparent",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
  },
  "& .cm-statusLabel": {
    display: "inline-block",
    verticalAlign: "middle",
  },
  "& .cm-diagnosticCounter": {
    fontSize: "12px",
    fontWeight: "bold",
    padding: "0 4px",
    whiteSpace: "nowrap",
  },
  "& .cm-diagnosticSummary": {
    height: "100%",
    whiteSpace: "pre",
    padding: "1px 8px",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    position: "relative",
    minWidth: 0,
  },
  "& .cm-diagnosticNavigation": {
    display: "flex",
  },
  "& .cm-activeDiagnosticMessage": {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flex: 1,
    fontSize: "13px",
  },
  "& .cm-activeDiagnosticIcon": {
    width: "16px",
    height: "16px",
    marginRight: "3px",
    backgroundColor: "currentColor",
    maskSize: "contain",
    webkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
  },
  "& .cm-navLeftIcon": {
    backgroundColor: "currentColor",
    maskImage: iconMasks["chevron-down"],
    webkitMaskImage: iconMasks["chevron-down"],
    maskSize: "contain",
    webkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
    transform: "rotate(90deg)",
  },
  "& .cm-navRightIcon": {
    backgroundColor: "currentColor",
    maskImage: iconMasks["chevron-down"],
    webkitMaskImage: iconMasks["chevron-down"],
    maskSize: "contain",
    webkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
    transform: "rotate(-90deg)",
  },
  "& .cm-icon-button": {
    padding: "1px 4px",
    justifyContent: "center",
  },

  "& .cm-button:active::after": {
    content: "''",
    position: "absolute",
    inset: "0",
    backgroundColor: "var(--control-hover)",
    boxShadow: "inset 0 0 0 100vmax var(--control-hover)",
  },
  "@media (pointer: coarse)": {
    ".cm-status": {
      height: "44px",
    },
  },
  "@media (hover: hover)": {
    ".cm-button:hover::after": {
      content: "''",
      position: "absolute",
      inset: "0",
      backgroundColor: "var(--control-hover)",
    },
  },
});

function createStatusPanel(view: EditorView) {
  return new StatusPanel(view);
}

export const statusPanel = () => {
  return [showPanel.of(createStatusPanel), statusPanelTheme];
};
