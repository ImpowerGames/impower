import {
  closeLintPanel,
  Diagnostic,
  forEachDiagnostic,
  linter,
  openLintPanel,
} from "@codemirror/lint";
import {
  EditorState,
  Extension,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Command,
  EditorView,
  Panel,
  PanelConstructor,
  showPanel,
  ViewUpdate,
} from "@codemirror/view";
import {
  closeReferencePanel,
  coarsePointer,
  forEachReference,
  isReferencePanelOpen,
  ReferenceLocation,
  setReferencePanel,
} from "@impower/codemirror-vscode-lsp-client/src";
import { iconMasks } from "@impower/impower-ui/icon-masks";


type StatusPanelState = {
  panel: PanelConstructor;
};

const statusPanelState = StateField.define<StatusPanelState | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (let e of tr.effects) if (e.is(setStatusPanel)) return e.value;
    return value;
  },
  provide: (f) => showPanel.from(f, (val) => (val ? val.panel : null)),
});

export const setStatusPanel = StateEffect.define<StatusPanelState | null>();

export class StatusPanel implements Panel {
  dom: HTMLElement;

  revealBottomPanelButton: HTMLElement;

  revealBottomPanelIcon: HTMLSpanElement;

  errorsLabel: HTMLSpanElement;

  warningsLabel: HTMLSpanElement;

  infosLabel: HTMLSpanElement;

  referencesLabel: HTMLSpanElement;

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

    this.revealBottomPanelButton = this.dom.appendChild(
      document.createElement("button"),
    );
    this.revealBottomPanelButton.className = "cm-button cm-revealBottomPanel";
    this.revealBottomPanelButton.setAttribute("name", "reveal");
    this.revealBottomPanelButton.setAttribute("type", "button");
    this.revealBottomPanelButton.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    this.revealBottomPanelButton.onmousedown = (e) => {
      e.stopPropagation();
    };
    this.revealBottomPanelButton.ontouchstart = (e) => {
      e.stopPropagation();
    };
    this.revealBottomPanelButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleBottomPanel();
    };

    this.revealBottomPanelIcon = this.revealBottomPanelButton.appendChild(
      document.createElement("span"),
    );
    this.revealBottomPanelIcon.className =
      "cm-statusIcon cm-problemsToggleIcon";

    this.errorsLabel = this.revealBottomPanelButton.appendChild(
      document.createElement("span"),
    );
    this.errorsLabel.className = "cm-statusLabel cm-errorsLabel";

    this.warningsLabel = this.revealBottomPanelButton.appendChild(
      document.createElement("span"),
    );
    this.warningsLabel.className = "cm-statusLabel cm-warningsLabel";

    this.infosLabel = this.revealBottomPanelButton.appendChild(
      document.createElement("span"),
    );
    this.infosLabel.className = "cm-statusLabel cm-infosLabel";

    this.referencesLabel = this.revealBottomPanelButton.appendChild(
      document.createElement("span"),
    );
    this.referencesLabel.className = "cm-statusLabel cm-referencesLabel";

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

  toggleBottomPanel() {
    if (
      this.view.hasFocus ||
      (!isReferencePanelOpen(this.view.state) &&
        !isLintPanelOpen(this.view.state))
    ) {
      openLintPanel(this.view);
    } else {
      closeReferencePanel(this.view);
      this.view.focus();
    }
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

    if (isReferencePanelOpen(update.state)) {
      this.revealBottomPanelButton.style.display = "";
      this.diagnosticContextContainer.style.display = "none";

      let referenceCount = 0;
      const files = new Set<string>();
      forEachReference(update.state, (ref: ReferenceLocation) => {
        files.add(ref.file.uri);
        referenceCount++;
      });
      const fileCount = files.size;
      this.referencesLabel.textContent = update.state.phrase(
        referenceCount === 1 && fileCount === 1
          ? `$1 reference in $2 file`
          : referenceCount !== 1 && fileCount !== 1
            ? `$1 references in $2 files`
            : referenceCount === 1 && fileCount !== 1
              ? `$1 reference in $2 files`
              : referenceCount !== 1 && fileCount === 1
                ? `$1 references in $2 file`
                : "",
        referenceCount,
        fileCount,
      );
      this.referencesLabel.hidden = false;
      this.errorsLabel.hidden = true;
      this.warningsLabel.hidden = true;
      this.infosLabel.hidden = true;
    } else {
      this.referencesLabel.hidden = true;

      let errorCount = 0;
      let warningCount = 0;
      let infoCount = 0;
      const diagnostics = this.getSortedDiagnostics();

      diagnostics.forEach((d) => {
        if (d.severity === "error") errorCount++;
        else if (d.severity === "warning") warningCount++;
        else if (d.severity === "info") infoCount++;
      });

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
        this.revealBottomPanelButton.style.display = "none";
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
        this.revealBottomPanelButton.style.display = "";
        this.diagnosticContextContainer.style.display = "none";
      }

      if (errorCount > 0) {
        const separator = warningCount > 0 ? update.state.phrase(",") : "";
        this.errorsLabel.textContent =
          update.state.phrase(
            errorCount === 1 ? `$1 Error` : `$1 Errors`,
            errorCount,
          ) + separator;
        this.errorsLabel.hidden = false;
      } else {
        this.errorsLabel.hidden = true;
      }
      if (warningCount > 0) {
        const separator = infoCount > 0 ? update.state.phrase(",") : "";
        this.warningsLabel.textContent =
          update.state.phrase(
            warningCount === 1 ? `$1 Warning` : `$1 Warnings`,
            warningCount,
          ) + separator;
        this.warningsLabel.hidden = false;
      } else {
        this.warningsLabel.hidden = true;
      }
      if (infoCount > 0) {
        this.infosLabel.textContent = update.state.phrase(
          infoCount === 1 ? `$1 Info` : `$1 Infos`,
          infoCount,
        );
        this.infosLabel.hidden = false;
      } else {
        this.infosLabel.hidden = true;
      }
    }
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
    "& .cm-problemsLabel": {
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
  "& .cm-problemsToggleIcon": {
    marginRight: "3px",
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
  "&:not(.keyboard-open) .cm-panels-bottom:has(> :not(.cm-toolbar):focus-within) .cm-problemsToggleIcon":
    {
      transform: "rotate(0)",
    },
  "& .cm-icon-button": {
    padding: "1px 4px",
    justifyContent: "center",
  },
  "&:not(.keyboard-open) .cm-panels-bottom:has(> :not(.cm-toolbar):focus-within) .cm-revealBottomPanel":
    {
      color: "var(--editor-ink)",
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

export function isLintPanelOpen(state: EditorState) {
  const lintState = (
    (linter(() => []) as Extension[]).at(-1) as Extension[]
  )[0] as StateField<{ panel?: Panel }>;
  return state.field(lintState, false)?.panel != null;
}

function createStatusPanel(view: EditorView) {
  return new StatusPanel(view);
}

export const openStatusPanel: Command = (view) => {
  let data: StatusPanelState = { panel: createStatusPanel };
  let effect =
    view.state.field(statusPanelState, false) === undefined
      ? StateEffect.appendConfig.of(statusPanelState.init(() => data))
      : setStatusPanel.of(data);
  view.dispatch({ effects: effect });
  return true;
};

export function isStatusPanelOpen(state: EditorState) {
  return Boolean(state.field(statusPanelState, false));
}

export const closeStatusPanel: Command = (view) => {
  if (!view.state.field(statusPanelState, false)) return false;
  view.dispatch({ effects: setReferencePanel.of(null) });
  return true;
};

export const statusPanel = () => {
  return [
    showPanel.of(createStatusPanel),
    statusPanelTheme,
    EditorView.updateListener.of((update) => {
      if (isReferencePanelOpen(update.state)) {
        closeLintPanel(update.view);
      }
    }),
  ];
};
