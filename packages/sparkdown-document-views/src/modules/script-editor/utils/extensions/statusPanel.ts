import {
  closeLintPanel,
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
  forEachReference,
  isReferencePanelOpen,
  ReferenceLocation,
  setReferencePanel,
} from "@impower/codemirror-vscode-lsp-client/src";
import EDITOR_COLORS from "../../constants/EDITOR_COLORS";
import {
  closeCustomGotoLinePanel,
  customGotoLinePanelOpen,
  openCustomGotoLinePanel,
} from "./customSearch";

const CHEVRON_SVG_URL = `url('data:image/svg+xml;utf8,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="black"><path d="M7.97612 10.0719L12.3334 5.7146L12.9521 6.33332L8.28548 11L7.66676 11L3.0001 6.33332L3.61882 5.7146L7.97612 10.0719Z"/></svg>')`;

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

  revealBottomPanelButton: HTMLButtonElement;

  revealBottomPanelIcon: HTMLSpanElement;

  errorsLabel: HTMLSpanElement;

  warningsLabel: HTMLSpanElement;

  infosLabel: HTMLSpanElement;

  referencesLabel: HTMLSpanElement;

  gotoLineButton: HTMLButtonElement;

  lineColumnLabel: HTMLSpanElement;

  constructor(readonly view: EditorView) {
    this.dom = document.createElement("div");
    this.dom.className = "cm-toolbar cm-status";

    this.revealBottomPanelButton = document.createElement("button");
    this.revealBottomPanelButton.className = "cm-button cm-revealBottomPanel";
    this.revealBottomPanelButton.name = "reveal";
    this.revealBottomPanelButton.type = "button";
    this.revealBottomPanelButton.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleBottomPanel(view.state);
    };
    this.revealBottomPanelButton.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    this.revealBottomPanelButton.ontouchstart = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    this.revealBottomPanelIcon = document.createElement("span");
    this.revealBottomPanelIcon.className =
      "cm-statusIcon cm-problemsToggleIcon";

    this.errorsLabel = document.createElement("span");
    this.errorsLabel.className = "cm-statusLabel cm-errorsLabel";

    this.warningsLabel = document.createElement("span");
    this.warningsLabel.className = "cm-statusLabel cm-warningsLabel";

    this.infosLabel = document.createElement("span");
    this.infosLabel.className = "cm-statusLabel cm-infosLabel";

    this.referencesLabel = document.createElement("span");
    this.referencesLabel.className = "cm-statusLabel cm-referencesLabel";

    this.gotoLineButton = document.createElement("button");
    this.gotoLineButton.className = "cm-button";
    this.gotoLineButton.name = "problems";
    this.gotoLineButton.type = "button";
    this.gotoLineButton.onclick = () => {
      this.toggleGotoLinePanel(view.state);
    };

    this.lineColumnLabel = document.createElement("span");
    this.lineColumnLabel.className = "cm-statusLabel cm-lineColumnLabel";

    this.dom.appendChild(this.revealBottomPanelButton);
    this.revealBottomPanelButton.appendChild(this.revealBottomPanelIcon);
    this.revealBottomPanelButton.appendChild(this.errorsLabel);
    this.revealBottomPanelButton.appendChild(this.warningsLabel);
    this.revealBottomPanelButton.appendChild(this.infosLabel);
    this.revealBottomPanelButton.appendChild(this.referencesLabel);

    this.dom.appendChild(this.gotoLineButton);
    this.gotoLineButton.appendChild(this.lineColumnLabel);
  }

  toggleBottomPanel(state: EditorState) {
    if (isLintPanelOpen(state) || isReferencePanelOpen(state)) {
      closeLintPanel(this.view);
      closeReferencePanel(this.view);
    } else {
      window.setTimeout(() => {
        openLintPanel(this.view);
      }, 600);
    }
  }

  toggleGotoLinePanel(state: EditorState) {
    if (customGotoLinePanelOpen(state)) {
      closeCustomGotoLinePanel(this.view);
    } else {
      openCustomGotoLinePanel(this.view);
    }
  }

  updateStatus(update: ViewUpdate) {
    if (isReferencePanelOpen(update.state)) {
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
      forEachDiagnostic(update.state, (d) => {
        if (d.severity === "error") {
          errorCount++;
        }
        if (d.severity === "warning") {
          warningCount++;
        }
        if (d.severity === "info") {
          infoCount++;
        }
      });
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

  updateLineColumn(update: ViewUpdate) {
    const numSelectionRanges = update.state.selection.ranges.length;
    const numCharactersSelected = update.state.selection.ranges
      .map((r) => r.to - r.from)
      .reduce((a, b) => a + b);
    if (numSelectionRanges > 1) {
      const selectionsSummary = update.state.phrase(
        `$1 selections`,
        numSelectionRanges,
      );
      const charactersSelectedSummary =
        numCharactersSelected > 0
          ? update.state.phrase(
              `($1 characters selected)`,
              numCharactersSelected,
            )
          : "";
      this.lineColumnLabel.textContent = [
        selectionsSummary,
        charactersSelectedSummary,
      ]
        .join(" ")
        .trim();
    } else if (numSelectionRanges === 1) {
      const cursorPos = update.state.selection.main.from;
      const cursorLine = update.state.doc.lineAt(cursorPos);
      const lineNumber = cursorLine.number;
      const colNumber = cursorPos - cursorLine.from + 1;
      const selectionsSummary = update.state.phrase(
        `Ln $1, Col $2`,
        lineNumber,
        colNumber,
      );
      const charactersSelectedSummary =
        numCharactersSelected > 0
          ? update.state.phrase(`($1 selected)`, numCharactersSelected)
          : "";
      this.lineColumnLabel.textContent = [
        selectionsSummary,
        charactersSelectedSummary,
      ]
        .join(" ")
        .trim();
    } else {
      const selectionsSummary = update.state.phrase(`Ln $1, Col $2`, 1, 1);
      this.lineColumnLabel.textContent = selectionsSummary;
    }
  }

  update(update: ViewUpdate) {
    this.updateStatus(update);
    this.updateLineColumn(update);
  }
}

const statusPanelTheme = EditorView.baseTheme({
  ".cm-status": {
    height: "28px",
    color: EDITOR_COLORS.statusLabel,
    backgroundColor: EDITOR_COLORS.panel,
    display: "flex",
    justifyContent: "space-between",
    "& .cm-diagnosticNav": {
      display: "flex",
      alignItems: "center",
      overflow: "hidden",
      flex: 1,
      marginRight: "8px",
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
    maskImage: CHEVRON_SVG_URL,
    webkitMaskImage: CHEVRON_SVG_URL,
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
    minWidth: "24px",
    justifyContent: "center",
  },
  "&:not(.keyboard-open) .cm-panels-bottom:has(> :not(.cm-toolbar):focus-within) .cm-revealBottomPanel":
    {
      color: "#cccccc",
    },

  "& .cm-button:active::after": {
    content: "''",
    position: "absolute",
    inset: "0",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  "@media (hover: hover) and (pointer: fine)": {
    ".cm-button:hover::after": {
      content: "''",
      position: "absolute",
      inset: "0",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
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
